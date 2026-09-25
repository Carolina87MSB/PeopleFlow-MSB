-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 5c: registro único de treinamento, Responsável
-- por Treinamentos da Gestão e validação de Necessidade de Desenvolvimento
-- ════════════════════════════════════════════════════════════════════════
-- Altera SOMENTE objetos peopleflow_dev_*.
--
--   1. peopleflow_dev_treinamentos.status: padrão passa a ser 'planejado'
--      (novos registros nascem PLANEJADOS). O valor 'solicitado' continua
--      válido para registros antigos — nada é convertido.
--   2. peopleflow_dev_responsaveis_gestao (NOVA): o Gestor indica pessoas da
--      sua equipe como "Responsável por Treinamentos da Gestão". Sem exclusão
--      física (revogação com motivo). Só o servidor lê/grava.
--   3. peopleflow_dev_treinamento_necessidades: situação da associação
--      (indicada | validada | rejeitada). Vínculos existentes foram criados
--      pelo RH e ficam 'validada'. Só 'validada' produz efeito oficial.
--   4. peopleflow_dev_gere_treinamento(): "gere" passa a incluir a GESTÃO —
--      treinamento registrado por alguém do meu escopo (Gestor e Responsável
--      indicado). As regras de visibilidade de treinamento/participante que já
--      usam essa função herdam o ajuste. Responsável vê o que conduz ou o que é
--      da gestão que o indicou — nunca a empresa toda.
--
-- Transacional e idempotente. Rodar em Supabase > SQL Editor > New query.
-- Reversão: supabase/desenvolvimento_fase5c_registro_rollback.sql
-- ════════════════════════════════════════════════════════════════════════

begin;

-- 1. Novos treinamentos nascem PLANEJADOS
alter table public.peopleflow_dev_treinamentos alter column status set default 'planejado';

-- 2. Responsáveis por Treinamentos da Gestão
create table if not exists public.peopleflow_dev_responsaveis_gestao (
  id bigint generated always as identity primary key,
  gestor_colaborador_id bigint not null references public.colaboradores (id),
  colaborador_id bigint not null references public.colaboradores (id),
  ativo boolean not null default true,
  indicado_em timestamptz not null default now(),
  indicado_por uuid,
  revogado_em timestamptz,
  revogado_por uuid,
  revogado_motivo text,
  check (gestor_colaborador_id <> colaborador_id),
  check (ativo or (revogado_em is not null and coalesce(btrim(revogado_motivo), '') <> ''))
);
create unique index if not exists peopleflow_dev_resp_gestao_ativo_uidx
  on public.peopleflow_dev_responsaveis_gestao (gestor_colaborador_id, colaborador_id) where ativo;
create index if not exists peopleflow_dev_resp_gestao_colab_idx
  on public.peopleflow_dev_responsaveis_gestao (colaborador_id) where ativo;
comment on table public.peopleflow_dev_responsaveis_gestao is
  'Pessoas indicadas pelo Gestor para registrar e acompanhar treinamentos da sua gestão. Acesso restrito à Gestão de Treinamentos (perfil Responsavel), sem virar Gestor.';
alter table public.peopleflow_dev_responsaveis_gestao enable row level security;
-- Sem políticas: somente o servidor (service_role) lê/grava.
revoke all on public.peopleflow_dev_responsaveis_gestao from public, anon, authenticated;
grant all on public.peopleflow_dev_responsaveis_gestao to service_role;

do $$
declare t text := 'peopleflow_dev_responsaveis_gestao';
begin
  execute format('drop trigger if exists %I on public.%I', t || '_sem_delete', t);
  execute format('create trigger %I before delete on public.%I for each row execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_delete', t);
  execute format('drop trigger if exists %I on public.%I', t || '_sem_truncate', t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_truncate', t);
end $$;

-- 3. Associação treinamento × Necessidade de Desenvolvimento: indicada → validada pelo RH
alter table public.peopleflow_dev_treinamento_necessidades
  add column if not exists situacao text not null default 'validada',
  add column if not exists indicado_por_colaborador_id bigint references public.colaboradores (id),
  add column if not exists analisado_em timestamptz,
  add column if not exists analisado_por uuid,
  add column if not exists analise_motivo text;
alter table public.peopleflow_dev_treinamento_necessidades
  drop constraint if exists peopleflow_dev_trein_nec_situacao_chk,
  drop constraint if exists peopleflow_dev_trein_nec_rejeitada_chk;
alter table public.peopleflow_dev_treinamento_necessidades
  add constraint peopleflow_dev_trein_nec_situacao_chk check (situacao in ('indicada', 'validada', 'rejeitada')),
  add constraint peopleflow_dev_trein_nec_rejeitada_chk check (situacao <> 'rejeitada' or (not ativo and coalesce(btrim(analise_motivo), '') <> ''));
-- Novas associações entram como INDICADAS (o servidor grava 'validada' quando é o RH).
alter table public.peopleflow_dev_treinamento_necessidades alter column situacao set default 'indicada';
comment on column public.peopleflow_dev_treinamento_necessidades.situacao is
  'indicada (por Gestor/Responsável, aguardando o RH) | validada (pelo RH: única que produz efeito oficial) | rejeitada (não validada pelo RH).';

-- 4. "Gere o treinamento" = conduz, registrou ou é da gestão de quem registrou
create or replace function public.peopleflow_dev_gere_treinamento(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select public.peopleflow_dev_responsavel_por(p_treinamento_id) or exists (
    select 1 from public.peopleflow_dev_treinamentos t
    where t.id = p_treinamento_id
      and public.peopleflow_dev_meu_colaborador_id() is not null
      and (t.solicitado_por_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
           or exists (select 1 from public.peopleflow_dev_escopo e
                      where e.gestor_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
                        and e.colaborador_id = t.solicitado_por_colaborador_id)))
$$;

create or replace function public.peopleflow_dev_treinamento_visivel(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.peopleflow_dev_meu_perfil()
    when 'RH' then true
    when 'Gestor' then public.peopleflow_dev_gere_treinamento(p_treinamento_id)
      or exists (
        select 1 from public.peopleflow_dev_participantes p
        join public.peopleflow_dev_escopo e
          on e.colaborador_id = p.colaborador_id and e.gestor_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
        where p.treinamento_id = p_treinamento_id and p.removido_em is null)
    when 'Responsavel' then public.peopleflow_dev_gere_treinamento(p_treinamento_id)
    else false end
$$;

commit;

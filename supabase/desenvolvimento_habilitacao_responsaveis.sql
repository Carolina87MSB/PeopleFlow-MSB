-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Habilitação de Responsáveis por Treinamentos (Etapa 1: banco)
-- ════════════════════════════════════════════════════════════════════════
-- PROPOSTA — NÃO EXECUTADA EM PRODUÇÃO. Só rodar com autorização expressa de quem administra o sistema.
-- Altera SOMENTE objetos peopleflow_dev_*. Nenhum dado de treinamento, participante, presença, avaliação ou evidência é alterado.
--
-- Regra de negócio (decisões de 2026-10):
--   • A liderança indica; o RH habilita UMA vez; a habilitação vale até ser revogada (com motivo). Vinculada à área/gestão da pessoa.
--   • O habilitado administra os treinamentos sob a SUA responsabilidade (coluna responsavel_colaborador_id), sem pedir autorização
--     por treinamento. Instrutor NÃO tem poderes administrativos: só enxerga o treinamento e a turma (somente leitura).
--   • O RH transfere treinamentos pendentes (revogação, desligamento, mudança de responsabilidade) com histórico imutável.
--
-- O que esta migration faz:
--   1. peopleflow_dev_responsaveis_gestao: ganha a SITUAÇÃO (indicada → habilitada | recusada; habilitada → revogada), origem
--      (indicação do gestor ou habilitação direta do RH), quem/quando habilitou e recusou, e a área na habilitação.
--      `ativo` continua existindo e passa a ser derivado (ativo = situação 'habilitada'), então o código HOJE em produção
--      (indicar/revogar pelo Gestor) segue funcionando sem alteração. Uma única habilitação ativa por colaborador.
--   2. peopleflow_dev_transferencias_responsabilidade (NOVA): histórico imutável das transferências feitas pelo RH.
--   3. Leitura (RLS): separa quem ADMINISTRA (responsável designado, gestão) de quem só ENSINA (instrutor: leitura do treinamento
--      e da turma, nunca evidências nem vínculos de necessidades). O perfil Responsavel passa a ver SOMENTE o que está sob a sua
--      responsabilidade enquanto a habilitação estiver ativa — não mais a gestão inteira. Gestor e RH: sem perda de acesso,
--      exceto que ser apenas instrutor deixa de dar visão administrativa.
--
-- Transacional e idempotente (pode rodar mais de uma vez). Rodar em Supabase > SQL Editor > New query.
-- Pré-checagem (somente leitura): supabase/desenvolvimento_habilitacao_responsaveis_prechecagem.sql
-- Validação  (somente leitura): supabase/desenvolvimento_habilitacao_responsaveis_validacao.sql
-- Reversão: supabase/desenvolvimento_habilitacao_responsaveis_rollback.sql (recusa-se se já houver indicação pendente, recusa ou transferência)
-- ════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.peopleflow_dev_responsaveis_gestao') is null then
    raise exception 'Aplique antes supabase/desenvolvimento_fase5c_registro.sql (tabela peopleflow_dev_responsaveis_gestao ausente).';
  end if;
  if exists (select 1 from public.peopleflow_dev_responsaveis_gestao where ativo group by colaborador_id having count(*) > 1) then
    raise exception 'Há colaborador com mais de uma habilitação ativa em peopleflow_dev_responsaveis_gestao. Revogue as duplicadas (com motivo) antes de aplicar.';
  end if;
end $$;

-- ── 1. Habilitações: situação, origem, rastreabilidade ───────────────────
alter table public.peopleflow_dev_responsaveis_gestao
  add column if not exists situacao text,
  add column if not exists origem text,
  add column if not exists departamento text,
  add column if not exists habilitado_em timestamptz,
  add column if not exists habilitado_por uuid,
  add column if not exists recusado_em timestamptz,
  add column if not exists recusado_por uuid,
  add column if not exists recusado_motivo text;

-- Linhas anteriores (hoje: nenhuma em produção): a indicação do Gestor já valia na hora → habilitada; as revogadas → revogada.
update public.peopleflow_dev_responsaveis_gestao
set situacao = case when ativo then 'habilitada' else 'revogada' end,
    origem = coalesce(origem, 'indicacao_gestor'),
    habilitado_em = coalesce(habilitado_em, indicado_em),
    habilitado_por = coalesce(habilitado_por, indicado_por)
where situacao is null;

alter table public.peopleflow_dev_responsaveis_gestao
  alter column situacao set default 'habilitada',
  alter column situacao set not null,
  alter column origem set default 'indicacao_gestor',
  alter column origem set not null;

-- Constraint antiga (ativo OU revogada com motivo) é substituída pelas verificações por situação.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.peopleflow_dev_responsaveis_gestao'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%revogado_motivo%'
      and conname not like 'peopleflow_dev_resp_gestao_%_chk'
  loop
    execute format('alter table public.peopleflow_dev_responsaveis_gestao drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.peopleflow_dev_responsaveis_gestao
  drop constraint if exists peopleflow_dev_resp_gestao_situacao_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_origem_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_ativo_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_habilitada_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_revogada_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_recusada_chk;
alter table public.peopleflow_dev_responsaveis_gestao
  add constraint peopleflow_dev_resp_gestao_situacao_chk check (situacao in ('indicada', 'habilitada', 'recusada', 'revogada')),
  add constraint peopleflow_dev_resp_gestao_origem_chk check (origem in ('indicacao_gestor', 'rh_direto')),
  add constraint peopleflow_dev_resp_gestao_ativo_chk check (ativo = (situacao = 'habilitada')),
  add constraint peopleflow_dev_resp_gestao_habilitada_chk check (situacao <> 'habilitada' or habilitado_em is not null),
  add constraint peopleflow_dev_resp_gestao_revogada_chk check (situacao <> 'revogada' or (revogado_em is not null and coalesce(btrim(revogado_motivo), '') <> '')),
  add constraint peopleflow_dev_resp_gestao_recusada_chk check (situacao <> 'recusada' or (recusado_em is not null and coalesce(btrim(recusado_motivo), '') <> ''));

-- Uma habilitação ativa por colaborador (vinculada a UMA gestão) e uma indicação pendente por par gestor × colaborador.
create unique index if not exists peopleflow_dev_resp_gestao_uma_habilitacao_uidx
  on public.peopleflow_dev_responsaveis_gestao (colaborador_id) where situacao = 'habilitada';
create unique index if not exists peopleflow_dev_resp_gestao_indicada_uidx
  on public.peopleflow_dev_responsaveis_gestao (gestor_colaborador_id, colaborador_id) where situacao = 'indicada';

-- Regras de transição e compatibilidade com o código atual (que só grava `ativo`).
create or replace function public.peopleflow_dev_resp_gestao_regras()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.situacao = 'habilitada' then
      new.habilitado_em := coalesce(new.habilitado_em, new.indicado_em, now());
      new.habilitado_por := coalesce(new.habilitado_por, new.indicado_por);
    end if;
    new.ativo := (new.situacao = 'habilitada');
    return new;
  end if;

  -- UPDATE: a identidade da habilitação nunca muda
  if new.colaborador_id is distinct from old.colaborador_id
     or new.gestor_colaborador_id is distinct from old.gestor_colaborador_id
     or new.indicado_em is distinct from old.indicado_em
     or new.indicado_por is distinct from old.indicado_por
     or new.origem is distinct from old.origem then
    raise exception 'A identidade da habilitação (colaborador, gestão, indicação e origem) não pode ser alterada.';
  end if;
  -- código anterior: revogar = ativo false + motivo → situação 'revogada'
  if old.situacao = 'habilitada' and new.situacao = old.situacao and old.ativo and not new.ativo then
    new.situacao := 'revogada';
  end if;
  if new.situacao is distinct from old.situacao then
    if not ((old.situacao = 'indicada' and new.situacao in ('habilitada', 'recusada')) or (old.situacao = 'habilitada' and new.situacao = 'revogada')) then
      raise exception 'Transição de situação inválida: % → %.', old.situacao, new.situacao;
    end if;
  elsif old.situacao in ('recusada', 'revogada') and new is distinct from old then
    raise exception 'Habilitação % é um registro histórico e não pode ser alterada.', old.situacao;
  end if;
  if new.situacao = 'habilitada' and old.situacao = 'indicada' then
    new.habilitado_em := coalesce(new.habilitado_em, now());
  end if;
  new.ativo := (new.situacao = 'habilitada');
  return new;
end $$;

drop trigger if exists peopleflow_dev_responsaveis_gestao_regras on public.peopleflow_dev_responsaveis_gestao;
create trigger peopleflow_dev_responsaveis_gestao_regras before insert or update on public.peopleflow_dev_responsaveis_gestao
  for each row execute function public.peopleflow_dev_resp_gestao_regras();
revoke all on function public.peopleflow_dev_resp_gestao_regras() from public, anon, authenticated;

comment on column public.peopleflow_dev_responsaveis_gestao.situacao is
  'indicada (pelo Gestor, aguardando o RH) | habilitada (RH habilitou; vale até revogar) | recusada (RH recusou, com motivo) | revogada (com motivo). ativo = situação habilitada.';
comment on column public.peopleflow_dev_responsaveis_gestao.origem is
  'indicacao_gestor (liderança indicou, RH habilitou) | rh_direto (RH habilitou diretamente, a pedido formal da liderança).';
comment on column public.peopleflow_dev_responsaveis_gestao.departamento is
  'Área do colaborador no momento da habilitação (fotografia para rastreabilidade; a gestão que vale é gestor_colaborador_id).';

-- ── 2. Transferências de responsabilidade (histórico imutável) ───────────
create table if not exists public.peopleflow_dev_transferencias_responsabilidade (
  id bigint generated always as identity primary key,
  treinamento_id bigint not null references public.peopleflow_dev_treinamentos (id),
  de_colaborador_id bigint references public.colaboradores (id),
  para_colaborador_id bigint not null references public.colaboradores (id),
  motivo_tipo text not null check (motivo_tipo in ('revogacao', 'desligamento', 'mudanca_responsabilidade', 'outro')),
  motivo text not null check (btrim(motivo) <> ''),
  habilitacao_id bigint references public.peopleflow_dev_responsaveis_gestao (id),
  status_treinamento text not null,
  transferido_em timestamptz not null default now(),
  transferido_por uuid,
  transferido_por_colaborador_id bigint references public.colaboradores (id),
  check (de_colaborador_id is distinct from para_colaborador_id)
);
create index if not exists peopleflow_dev_transf_resp_trein_idx on public.peopleflow_dev_transferencias_responsabilidade (treinamento_id);
create index if not exists peopleflow_dev_transf_resp_de_idx on public.peopleflow_dev_transferencias_responsabilidade (de_colaborador_id);
comment on table public.peopleflow_dev_transferencias_responsabilidade is
  'Transferência do responsável por um treinamento pelo RH (revogação, desligamento, mudança de responsabilidade). Imutável; quem registrou o treinamento continua em solicitado_por_colaborador_id.';

alter table public.peopleflow_dev_transferencias_responsabilidade enable row level security;
drop policy if exists dev_transf_resp_rh on public.peopleflow_dev_transferencias_responsabilidade;
create policy dev_transf_resp_rh on public.peopleflow_dev_transferencias_responsabilidade for select to authenticated
  using ((select public.peopleflow_dev_meu_perfil()) = 'RH');
revoke all on public.peopleflow_dev_transferencias_responsabilidade from public, anon, authenticated;
grant select on public.peopleflow_dev_transferencias_responsabilidade to authenticated;
grant all on public.peopleflow_dev_transferencias_responsabilidade to service_role;

do $$
declare t text := 'peopleflow_dev_transferencias_responsabilidade';
begin
  execute format('drop trigger if exists %I on public.%I', t || '_sem_delete', t);
  execute format('create trigger %I before delete on public.%I for each row execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_delete', t);
  execute format('drop trigger if exists %I on public.%I', t || '_sem_truncate', t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_truncate', t);
  execute format('drop trigger if exists %I on public.%I', t || '_sem_update', t);
  execute format('create trigger %I before update on public.%I for each row execute function public.peopleflow_dev_bloquear_alteracao()', t || '_sem_update', t);
end $$;

-- ── 3. Leitura: quem ADMINISTRA × quem só ENSINA ─────────────────────────
-- Habilitação ativa da pessoa logada.
create or replace function public.peopleflow_dev_habilitado_agora()
returns boolean language sql stable security definer set search_path = public as $$
  select public.peopleflow_dev_meu_colaborador_id() is not null and exists (
    select 1 from public.peopleflow_dev_responsaveis_gestao r
    where r.colaborador_id = public.peopleflow_dev_meu_colaborador_id() and r.situacao = 'habilitada')
$$;

-- Responsável DESIGNADO pelo treinamento (poder administrativo). O instrutor não entra aqui.
create or replace function public.peopleflow_dev_responsavel_por(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.peopleflow_dev_treinamentos t
    where t.id = p_treinamento_id
      and public.peopleflow_dev_meu_colaborador_id() is not null
      and t.responsavel_colaborador_id = public.peopleflow_dev_meu_colaborador_id())
$$;

-- Instrutor do treinamento (somente leitura do treinamento e da turma).
create or replace function public.peopleflow_dev_instrutor_de(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.peopleflow_dev_treinamentos t
    where t.id = p_treinamento_id
      and public.peopleflow_dev_meu_colaborador_id() is not null
      and t.instrutor_colaborador_id = public.peopleflow_dev_meu_colaborador_id())
$$;

-- "Gere o treinamento" (administra): RH; Gestor = responsável designado, quem registrou ou a gestão de quem registrou;
-- Responsavel = SOMENTE o que está sob a sua responsabilidade e enquanto a habilitação estiver ativa.
create or replace function public.peopleflow_dev_gere_treinamento(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.peopleflow_dev_meu_perfil()
    when 'RH' then true
    when 'Gestor' then public.peopleflow_dev_responsavel_por(p_treinamento_id) or exists (
      select 1 from public.peopleflow_dev_treinamentos t
      where t.id = p_treinamento_id
        and public.peopleflow_dev_meu_colaborador_id() is not null
        and (t.solicitado_por_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
             or exists (select 1 from public.peopleflow_dev_escopo e
                        where e.gestor_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
                          and e.colaborador_id = t.solicitado_por_colaborador_id)))
    when 'Responsavel' then public.peopleflow_dev_habilitado_agora() and public.peopleflow_dev_responsavel_por(p_treinamento_id)
    else false end
$$;

-- Visão de GESTÃO do treinamento (evidências, vínculos com necessidades): sem o instrutor.
create or replace function public.peopleflow_dev_treinamento_gestao_visivel(p_treinamento_id bigint)
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

create or replace function public.peopleflow_dev_treinamento_visivel(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select public.peopleflow_dev_treinamento_gestao_visivel(p_treinamento_id)
    or (public.peopleflow_dev_meu_perfil() in ('Gestor', 'Responsavel') and public.peopleflow_dev_instrutor_de(p_treinamento_id))
$$;

create or replace function public.peopleflow_dev_participante_visivel(p_participante_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.peopleflow_dev_participantes p
    where p.id = p_participante_id
      and (public.peopleflow_dev_pode_ver_colaborador(p.colaborador_id)
           or (public.peopleflow_dev_meu_perfil() in ('RH', 'Gestor', 'Responsavel') and public.peopleflow_dev_gere_treinamento(p.treinamento_id))
           or (public.peopleflow_dev_meu_perfil() in ('Gestor', 'Responsavel') and public.peopleflow_dev_instrutor_de(p.treinamento_id))))
$$;

drop policy if exists dev_participantes_leitura on public.peopleflow_dev_participantes;
create policy dev_participantes_leitura on public.peopleflow_dev_participantes for select to authenticated
  using (public.peopleflow_dev_pode_ver_colaborador(colaborador_id)
         or ((select public.peopleflow_dev_meu_perfil()) in ('RH', 'Gestor', 'Responsavel') and public.peopleflow_dev_gere_treinamento(treinamento_id))
         or ((select public.peopleflow_dev_meu_perfil()) in ('Gestor', 'Responsavel') and public.peopleflow_dev_instrutor_de(treinamento_id)));

drop policy if exists dev_evidencias_leitura on public.peopleflow_dev_evidencias;
create policy dev_evidencias_leitura on public.peopleflow_dev_evidencias for select to authenticated
  using (
    public.peopleflow_dev_treinamento_gestao_visivel(treinamento_id)
    and (participante_id is null or public.peopleflow_dev_participante_visivel(participante_id))
  );

drop policy if exists dev_trein_nec_leitura on public.peopleflow_dev_treinamento_necessidades;
create policy dev_trein_nec_leitura on public.peopleflow_dev_treinamento_necessidades for select to authenticated
  using (public.peopleflow_dev_treinamento_gestao_visivel(treinamento_id) and (select public.peopleflow_dev_meu_perfil()) in ('RH', 'Gestor'));

do $$
declare f text;
begin
  foreach f in array array[
    'peopleflow_dev_habilitado_agora()', 'peopleflow_dev_responsavel_por(bigint)', 'peopleflow_dev_instrutor_de(bigint)',
    'peopleflow_dev_gere_treinamento(bigint)', 'peopleflow_dev_treinamento_gestao_visivel(bigint)', 'peopleflow_dev_treinamento_visivel(bigint)',
    'peopleflow_dev_participante_visivel(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- Atualiza o cache da API (PostgREST).
notify pgrst, 'reload schema';

commit;

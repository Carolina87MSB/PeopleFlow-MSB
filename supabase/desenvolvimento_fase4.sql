-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 4 (Base de Necessidades + integração PDI)
-- ════════════════════════════════════════════════════════════════════════
-- Altera SOMENTE objetos peopleflow_dev_* (a tabela de necessidades está
-- vazia em produção). Nenhuma tabela do PeopleFlow — inclusive PDI e AVD —
-- é alterada; o PDI continua só sendo lido (referência fraca por id).
--
-- O que muda:
--   • Status da necessidade: sugerida → validada → planejada → atendida,
--     ou cancelada (substitui aberta/planejada/atendida/cancelada da Fase 1).
--   • Origem: acrescenta "operacional" (demais necessidades operacionais).
--   • Campos do levantamento: categoria, sugestão de capacitação, observação,
--     gestor e departamento do colaborador na data do registro (fotografia
--     para filtros e para a LNT futura), ação do PDI de origem.
--   • Consolidação (preparação para a LNT): grupos de necessidades
--     semelhantes, sem perder as necessidades individuais.
--   • Sugestões de PDI dispensadas pelo RH (para não reaparecerem).
--   • Requisito de cargo só pode originar necessidade se estiver VIGENTE.
--
-- Transacional. Rodar em Supabase > SQL Editor > New query.
-- Reversão: supabase/desenvolvimento_fase4_rollback.sql
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── Grupos de consolidação (futura linha da LNT) ────────────────────────
create table if not exists public.peopleflow_dev_necessidade_grupos (
  id bigint generated always as identity primary key,
  titulo text not null check (btrim(titulo) <> ''),
  categoria text,
  descricao text not null default '',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index if not exists peopleflow_dev_nec_grupos_titulo_uidx
  on public.peopleflow_dev_necessidade_grupos (lower(btrim(titulo))) where ativo;

-- ── Necessidades: novos campos ──────────────────────────────────────────
alter table public.peopleflow_dev_necessidades
  add column if not exists categoria text,
  add column if not exists sugestao_capacitacao text not null default '',
  add column if not exists observacao text not null default '',
  add column if not exists gestor_colaborador_id bigint references public.colaboradores (id),
  add column if not exists departamento text,
  add column if not exists pdi_acao_id text,
  add column if not exists grupo_id bigint references public.peopleflow_dev_necessidade_grupos (id),
  add column if not exists validada_em timestamptz,
  add column if not exists validada_por uuid;

comment on column public.peopleflow_dev_necessidades.pdi_acao_id is
  'Referência fraca a peopleflow_pdi_acoes.id (sem FK — o PDI regrava as ações). O módulo nunca escreve no PDI.';
comment on column public.peopleflow_dev_necessidades.departamento is
  'Departamento do colaborador na data do registro (fotografia para filtros/LNT). A fonte oficial continua sendo colaboradores.';

-- Status (Fase 1: aberta/planejada/atendida/cancelada) → novo conjunto.
alter table public.peopleflow_dev_necessidades alter column status set default 'sugerida';
alter table public.peopleflow_dev_necessidades drop constraint if exists peopleflow_dev_necessidades_status_check;
alter table public.peopleflow_dev_necessidades drop constraint if exists peopleflow_dev_nec_status_chk;
alter table public.peopleflow_dev_necessidades
  add constraint peopleflow_dev_nec_status_chk check (status in ('sugerida', 'validada', 'planejada', 'atendida', 'cancelada'));

-- Origem: + operacional.
alter table public.peopleflow_dev_necessidades drop constraint if exists peopleflow_dev_necessidades_origem_check;
alter table public.peopleflow_dev_necessidades drop constraint if exists peopleflow_dev_nec_origem_chk;
alter table public.peopleflow_dev_necessidades
  add constraint peopleflow_dev_nec_origem_chk check (origem in ('habilidade', 'treinamento_obrigatorio', 'revisao_pop', 'integracao', 'gestor', 'pdi', 'rh', 'operacional'));

-- Justificativa obrigatória também para origem operacional (Fase 1 exigia para gestor/rh).
alter table public.peopleflow_dev_necessidades drop constraint if exists peopleflow_dev_necessidades_check4;
alter table public.peopleflow_dev_necessidades drop constraint if exists peopleflow_dev_nec_justificativa_chk;
alter table public.peopleflow_dev_necessidades
  add constraint peopleflow_dev_nec_justificativa_chk check (origem not in ('gestor', 'rh', 'operacional') or btrim(justificativa) <> '');

alter table public.peopleflow_dev_necessidades drop constraint if exists peopleflow_dev_nec_categoria_chk;
alter table public.peopleflow_dev_necessidades
  add constraint peopleflow_dev_nec_categoria_chk check (
    categoria is null or categoria in ('tecnica', 'qualidade_regulatorio', 'seguranca', 'sistemas_ferramentas', 'comportamental', 'lideranca', 'integracao', 'outra'));

alter table public.peopleflow_dev_necessidades drop constraint if exists peopleflow_dev_nec_validada_chk;
alter table public.peopleflow_dev_necessidades
  add constraint peopleflow_dev_nec_validada_chk check (status not in ('validada', 'planejada', 'atendida') or validada_em is not null);

-- Deduplicação de necessidades automáticas abertas: novos status + ação do PDI.
drop index if exists public.peopleflow_dev_nec_dedup_uidx;
create unique index if not exists peopleflow_dev_nec_dedup_uidx on public.peopleflow_dev_necessidades (
  origem, coalesce(colaborador_id, -1), coalesce(cargo_nome, ''), coalesce(requisito_id, -1),
  coalesce(pdi_item_id, ''), coalesce(pdi_acao_id, ''), coalesce(lista_mestra_codigo, ''), coalesce(lista_mestra_revisao, '')
) where status in ('sugerida', 'validada', 'planejada') and origem not in ('gestor', 'rh', 'operacional');

create index if not exists peopleflow_dev_nec_gestor_idx on public.peopleflow_dev_necessidades (gestor_colaborador_id);
create index if not exists peopleflow_dev_nec_grupo_idx on public.peopleflow_dev_necessidades (grupo_id);
create index if not exists peopleflow_dev_nec_status_idx on public.peopleflow_dev_necessidades (status, prioridade);
create index if not exists peopleflow_dev_nec_pdi_acao_idx on public.peopleflow_dev_necessidades (pdi_acao_id);

-- Requisito do cargo só origina necessidade quando VIGENTE (checado na gravação).
create or replace function public.peopleflow_dev_nec_exige_requisito_vigente()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.requisito_id is not null
     and (tg_op = 'INSERT' or new.requisito_id is distinct from old.requisito_id)
     and not exists (select 1 from public.peopleflow_dev_cargo_requisitos r where r.id = new.requisito_id and r.status = 'vigente') then
    raise exception 'Somente requisito VIGENTE pode originar necessidade.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.peopleflow_dev_nec_exige_requisito_vigente() from public, anon, authenticated;
drop trigger if exists peopleflow_dev_necessidades_requisito_vigente on public.peopleflow_dev_necessidades;
create trigger peopleflow_dev_necessidades_requisito_vigente before insert or update on public.peopleflow_dev_necessidades
  for each row execute function public.peopleflow_dev_nec_exige_requisito_vigente();

-- ── Sugestões de PDI dispensadas pelo RH ────────────────────────────────
create table if not exists public.peopleflow_dev_pdi_sugestoes_dispensadas (
  pdi_acao_id text primary key,
  pdi_id bigint references public.peopleflow_pdi (id),
  motivo text not null check (btrim(motivo) <> ''),
  dispensada_em timestamptz not null default now(),
  dispensada_por uuid
);

-- ── Triggers padrão (updated_at, sem exclusão física) ───────────────────
drop trigger if exists peopleflow_dev_necessidade_grupos_updated_at on public.peopleflow_dev_necessidade_grupos;
create trigger peopleflow_dev_necessidade_grupos_updated_at before update on public.peopleflow_dev_necessidade_grupos
  for each row execute function public.peopleflow_dev_set_updated_at();
do $$
declare t text;
begin
  foreach t in array array['peopleflow_dev_necessidade_grupos', 'peopleflow_dev_pdi_sugestoes_dispensadas'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_sem_delete', t);
    execute format('create trigger %I before delete on public.%I for each row execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_delete', t);
    execute format('drop trigger if exists %I on public.%I', t || '_sem_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_truncate', t);
  end loop;
end $$;

-- ── RLS e permissões ────────────────────────────────────────────────────
alter table public.peopleflow_dev_necessidade_grupos enable row level security;
alter table public.peopleflow_dev_pdi_sugestoes_dispensadas enable row level security;

drop policy if exists dev_nec_grupos_leitura on public.peopleflow_dev_necessidade_grupos;
create policy dev_nec_grupos_leitura on public.peopleflow_dev_necessidade_grupos for select to authenticated
  using ((select public.peopleflow_dev_meu_perfil()) = 'RH');

drop policy if exists dev_pdi_dispensadas_rh on public.peopleflow_dev_pdi_sugestoes_dispensadas;
create policy dev_pdi_dispensadas_rh on public.peopleflow_dev_pdi_sugestoes_dispensadas for select to authenticated
  using ((select public.peopleflow_dev_meu_perfil()) = 'RH');

do $$
declare t text;
begin
  foreach t in array array['peopleflow_dev_necessidade_grupos', 'peopleflow_dev_pdi_sugestoes_dispensadas'] loop
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

commit;

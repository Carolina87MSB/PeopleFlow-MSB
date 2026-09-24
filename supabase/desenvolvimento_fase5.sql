-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 5 (Gestão de Treinamentos)
-- ════════════════════════════════════════════════════════════════════════
-- Altera SOMENTE objetos peopleflow_dev_* (treinamentos, participantes,
-- evidências e QR estão vazios em produção) e cria o bucket privado do
-- Desenvolvimento. Nenhuma tabela do PeopleFlow, do PDI ou da AVD é tocada;
-- o bucket do PDI (pdi-evidencias) não é usado.
--
-- O que muda:
--   • Treinamento: status SOLICITADO (novo, antes de PLANEJADO); origem do
--     treinamento; título da Lista Mestra fotografado junto com código e
--     revisão; local/link; observação; eficácia exigida + prazo; data e
--     carga realizadas; quem solicitou/planejou/iniciou.
--   • Participante: resultado da eficácia (eficaz/parcialmente/não eficaz),
--     quem avaliou e observação.
--   • Vínculo treinamento × necessidade (N:N, sem exclusão física).
--   • Necessidade: data e treinamento que a atenderam.
--   • QR de presença: tabela só do servidor (o navegador não lê).
--   • Evidência: mais tipos (ata, foto, comprovante, avaliação) e observação.
--   • Perfil "Responsavel": acesso do responsável/instrutor SOMENTE aos
--     treinamentos que conduz (sem virar Gestor ou RH).
--   • Histórico: mais campos (origem, documento, eficácia, carga realizada).
--   • Bucket privado desenvolvimento-evidencias (sem acesso direto do navegador).
--
-- Transacional. Rodar em Supabase > SQL Editor > New query.
-- Reversão: supabase/desenvolvimento_fase5_rollback.sql
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── Treinamentos ────────────────────────────────────────────────────────
alter table public.peopleflow_dev_treinamentos
  add column if not exists origem_tipo text not null default 'desenvolvimento',
  add column if not exists lista_mestra_titulo text,
  add column if not exists local_link text not null default '',
  add column if not exists observacao text not null default '',
  add column if not exists exige_eficacia boolean not null default false,
  add column if not exists eficacia_prazo date,
  add column if not exists data_realizacao date,
  add column if not exists carga_realizada_min integer,
  add column if not exists solicitado_por_colaborador_id bigint references public.colaboradores (id),
  add column if not exists planejado_em timestamptz,
  add column if not exists planejado_por uuid,
  add column if not exists iniciado_em timestamptz,
  add column if not exists iniciado_por uuid;

alter table public.peopleflow_dev_treinamentos alter column status set default 'solicitado';
alter table public.peopleflow_dev_treinamentos
  drop constraint if exists peopleflow_dev_treinamentos_status_check,
  drop constraint if exists peopleflow_dev_trein_status_chk,
  drop constraint if exists peopleflow_dev_trein_origem_chk,
  drop constraint if exists peopleflow_dev_trein_carga_real_chk,
  drop constraint if exists peopleflow_dev_trein_concluido_chk;
alter table public.peopleflow_dev_treinamentos
  add constraint peopleflow_dev_trein_status_chk check (status in ('solicitado', 'planejado', 'em_andamento', 'concluido', 'cancelado')),
  add constraint peopleflow_dev_trein_origem_chk check (origem_tipo in (
    'desenvolvimento', 'pop_it', 'revisao_documental', 'integracao', 'requisito_regulatorio', 'reciclagem', 'operacional', 'outro')),
  add constraint peopleflow_dev_trein_carga_real_chk check (carga_realizada_min is null or carga_realizada_min > 0),
  add constraint peopleflow_dev_trein_concluido_chk check (status <> 'concluido' or (data_realizacao is not null and concluido_em is not null));
create index if not exists peopleflow_dev_trein_solicitante_idx on public.peopleflow_dev_treinamentos (solicitado_por_colaborador_id);

-- ── Participantes: eficácia simples, individual ─────────────────────────
alter table public.peopleflow_dev_participantes
  add column if not exists eficacia_resultado text,
  add column if not exists eficacia_observacao text not null default '',
  add column if not exists eficacia_por uuid,
  add column if not exists eficacia_por_colaborador_id bigint references public.colaboradores (id);
alter table public.peopleflow_dev_participantes drop constraint if exists peopleflow_dev_part_eficacia_chk;
alter table public.peopleflow_dev_participantes
  add constraint peopleflow_dev_part_eficacia_chk check (eficacia_resultado is null or eficacia_resultado in ('eficaz', 'parcialmente_eficaz', 'nao_eficaz'));

-- ── Vínculo treinamento × necessidade ───────────────────────────────────
create table if not exists public.peopleflow_dev_treinamento_necessidades (
  id bigint generated always as identity primary key,
  treinamento_id bigint not null references public.peopleflow_dev_treinamentos (id),
  necessidade_id bigint not null references public.peopleflow_dev_necessidades (id),
  ativo boolean not null default true,
  vinculado_em timestamptz not null default now(),
  vinculado_por uuid,
  desvinculado_em timestamptz,
  desvinculado_por uuid,
  desvinculado_motivo text,
  check (ativo or desvinculado_em is not null)
);
create unique index if not exists peopleflow_dev_trein_nec_ativo_uidx on public.peopleflow_dev_treinamento_necessidades (treinamento_id, necessidade_id) where ativo;
create index if not exists peopleflow_dev_trein_nec_nec_idx on public.peopleflow_dev_treinamento_necessidades (necessidade_id);

alter table public.peopleflow_dev_necessidades
  add column if not exists atendida_em timestamptz,
  add column if not exists atendida_treinamento_id bigint references public.peopleflow_dev_treinamentos (id);

-- ── QR de presença (somente servidor) ───────────────────────────────────
create table if not exists public.peopleflow_dev_qr_tokens (
  treinamento_id bigint primary key references public.peopleflow_dev_treinamentos (id),
  token text not null unique check (length(token) >= 32),
  ativo boolean not null default true,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  encerrado_em timestamptz,
  encerrado_por uuid
);

-- ── Evidências: mais tipos + observação ─────────────────────────────────
alter table public.peopleflow_dev_evidencias add column if not exists observacao text not null default '';
alter table public.peopleflow_dev_evidencias
  drop constraint if exists peopleflow_dev_evidencias_tipo_check,
  drop constraint if exists peopleflow_dev_evid_tipo_chk;
alter table public.peopleflow_dev_evidencias
  add constraint peopleflow_dev_evid_tipo_chk check (tipo in ('lista_presenca', 'certificado', 'material', 'ata', 'foto', 'comprovante', 'avaliacao', 'outro'));

-- ── Perfil Responsavel (acesso vinculado ao treinamento) ────────────────
alter table public.peopleflow_dev_contas
  drop constraint if exists peopleflow_dev_contas_perfil_check,
  drop constraint if exists peopleflow_dev_contas_perfil_chk;
alter table public.peopleflow_dev_contas
  add constraint peopleflow_dev_contas_perfil_chk check (perfil in ('RH', 'Gestor', 'Responsavel'));

create or replace function public.peopleflow_dev_treinamento_visivel(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.peopleflow_dev_meu_perfil()
    when 'RH' then true
    when 'Gestor' then public.peopleflow_dev_responsavel_por(p_treinamento_id)
      or exists (select 1 from public.peopleflow_dev_treinamentos t
                 where t.id = p_treinamento_id and t.solicitado_por_colaborador_id = public.peopleflow_dev_meu_colaborador_id())
      or exists (
        select 1 from public.peopleflow_dev_participantes p
        join public.peopleflow_dev_escopo e
          on e.colaborador_id = p.colaborador_id and e.gestor_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
        where p.treinamento_id = p_treinamento_id and p.removido_em is null)
    when 'Responsavel' then public.peopleflow_dev_responsavel_por(p_treinamento_id)
    else false end
$$;

-- ── Vínculos: RLS ───────────────────────────────────────────────────────
alter table public.peopleflow_dev_treinamento_necessidades enable row level security;
alter table public.peopleflow_dev_qr_tokens enable row level security;
drop policy if exists dev_trein_nec_leitura on public.peopleflow_dev_treinamento_necessidades;
create policy dev_trein_nec_leitura on public.peopleflow_dev_treinamento_necessidades for select to authenticated
  using (public.peopleflow_dev_treinamento_visivel(treinamento_id) and (select public.peopleflow_dev_meu_perfil()) in ('RH', 'Gestor'));
-- peopleflow_dev_qr_tokens: RLS ligada e NENHUMA política — só o servidor (service_role) lê/grava.

revoke all on public.peopleflow_dev_treinamento_necessidades from public, anon, authenticated;
grant select on public.peopleflow_dev_treinamento_necessidades to authenticated;
grant all on public.peopleflow_dev_treinamento_necessidades to service_role;
revoke all on public.peopleflow_dev_qr_tokens from public, anon, authenticated;
grant all on public.peopleflow_dev_qr_tokens to service_role;

do $$
declare t text;
begin
  foreach t in array array['peopleflow_dev_treinamento_necessidades', 'peopleflow_dev_qr_tokens'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_sem_delete', t);
    execute format('create trigger %I before delete on public.%I for each row execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_delete', t);
    execute format('drop trigger if exists %I on public.%I', t || '_sem_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_truncate', t);
  end loop;
end $$;

-- ── Histórico: campos adicionais (colunas novas no final) ───────────────
create or replace view public.peopleflow_dev_v_historico with (security_invoker = true) as
select
  p.id as participante_id,
  p.colaborador_id,
  t.id as treinamento_id,
  t.codigo as treinamento_codigo,
  t.titulo,
  t.tipo,
  t.lista_mestra_codigo,
  t.lista_mestra_revisao,
  coalesce(t.data_realizacao, t.data_fim, t.data_inicio) as data_realizacao,
  coalesce(t.carga_realizada_min, t.carga_horaria_min) as carga_horaria_min,
  t.periodicidade_meses as periodicidade_treinamento_meses,
  p.validade_ate,
  p.presenca_metodo,
  p.origem_registro,
  t.origem_tipo,
  t.lista_mestra_titulo,
  t.exige_eficacia,
  p.eficacia_resultado,
  t.origem_registro as origem_registro_treinamento
from public.peopleflow_dev_participantes p
join public.peopleflow_dev_treinamentos t on t.id = p.treinamento_id
where t.status = 'concluido' and p.presenca_status = 'presente' and p.removido_em is null;

revoke all on public.peopleflow_dev_v_historico from public, anon, authenticated;
grant select on public.peopleflow_dev_v_historico to authenticated;
grant all on public.peopleflow_dev_v_historico to service_role;

-- ── Storage privado do Desenvolvimento ──────────────────────────────────
-- Sem políticas em storage.objects para este bucket: o navegador não lê nem
-- grava diretamente; upload e download só por URL assinada emitida pelo
-- servidor depois de conferir a permissão.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'desenvolvimento-evidencias', 'desenvolvimento-evidencias', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/msword', 'application/vnd.ms-excel']
)
on conflict (id) do nothing;

commit;

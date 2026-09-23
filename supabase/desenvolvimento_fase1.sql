-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 1 (fundação)
-- ════════════════════════════════════════════════════════════════════════
-- SOMENTE ACRÉSCIMO. Cria exclusivamente objetos com prefixo
-- peopleflow_dev_*; não altera, renomeia nem apaga nenhum objeto existente
-- do PeopleFlow, do Portal SST ou do antigo Portal de Treinamentos.
--
-- Pontos de contato com estruturas existentes (apenas chaves estrangeiras
-- A PARTIR das tabelas novas — nenhuma coluna/dado das tabelas de origem muda):
--   • colaboradores.id                      (identidade do colaborador)
--   • peopleflow_descricoes_cargo.cargo_nome (cargo oficial; ON UPDATE CASCADE
--                                             acompanha renomeação de cargo)
--   • peopleflow_pdi.id                      (origem "pdi" da LNT — só leitura)
-- peopleflow_pdi_itens NÃO recebe FK: o PDI apaga e reinsere os itens a cada
-- gravação (src/repositories/pdiRepository.ts), então o vínculo com o item é
-- uma referência fraca (pdi_item_id texto), validada pela aplicação.
--
-- Segurança: RLS em todas as tabelas; o navegador (role authenticated) só
-- tem SELECT, filtrado por perfil/escopo; nenhuma política using(true);
-- nenhuma permissão para anon. Toda gravação passa pelas funções do
-- servidor (api/desenvolvimento.ts, service_role).
--
-- Não há exclusão física de registros operacionais (triggers bloqueiam
-- DELETE/TRUNCATE); a auditoria é imutável (bloqueia também UPDATE).
--
-- Idempotente. Rodar em Supabase > SQL Editor > New query.
-- Reversão: supabase/desenvolvimento_fase1_rollback.sql (remove só o que
-- este arquivo cria).
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── Funções utilitárias (triggers) ──────────────────────────────────────
create or replace function public.peopleflow_dev_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.peopleflow_dev_bloquear_exclusao()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Módulo Desenvolvimento: exclusão física não permitida em %. Use cancelamento/inativação com motivo.', tg_table_name
    using errcode = 'P0001';
end $$;

create or replace function public.peopleflow_dev_bloquear_alteracao()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Módulo Desenvolvimento: % é imutável (somente inclusão).', tg_table_name
    using errcode = 'P0001';
end $$;

-- ── 1. Controle de acesso (cópias derivadas, geradas só pelo servidor) ──
-- Perfil e equipe vêm das regras do PeopleFlow (buildAccess/perfilOf/
-- descendants, importadas por api/desenvolvimento.ts) — estas tabelas são
-- cache com validade de 12 h, nunca editadas por pessoas.
create table if not exists public.peopleflow_dev_contas (
  user_id uuid primary key references auth.users (id) on delete cascade,
  colaborador_id bigint not null unique references public.colaboradores (id) on delete cascade,
  perfil text not null check (perfil in ('RH', 'Gestor')),
  atualizado_em timestamptz not null default now()
);
comment on table public.peopleflow_dev_contas is
  'Desenvolvimento: vínculo usuário → colaborador com o perfil derivado do PeopleFlow. Gerado por api/desenvolvimento.ts (acao=sessao). Expira em 12 h.';

create table if not exists public.peopleflow_dev_escopo (
  gestor_colaborador_id bigint not null references public.colaboradores (id) on delete cascade,
  colaborador_id bigint not null references public.colaboradores (id) on delete cascade,
  atualizado_em timestamptz not null default now(),
  primary key (gestor_colaborador_id, colaborador_id)
);
create index if not exists peopleflow_dev_escopo_colaborador_idx on public.peopleflow_dev_escopo (colaborador_id);
comment on table public.peopleflow_dev_escopo is
  'Desenvolvimento: equipe (árvore abaixo) de cada gestor, por id, derivada de colaboradores.gestor via descendants(). Recalculada pelo servidor.';

-- ── 2. Lista Mestra ─────────────────────────────────────────────────────
create table if not exists public.peopleflow_dev_lista_mestra (
  codigo text primary key check (codigo = btrim(codigo) and codigo <> ''),
  titulo text not null check (btrim(titulo) <> ''),
  revisao_atual text not null,
  data_revisao date,
  situacao text not null default 'vigente' check (situacao in ('vigente', 'obsoleto')),
  periodicidade_meses integer check (periodicidade_meses > 0),
  origem_registro text not null default 'sistema' check (origem_registro in ('sistema', 'migracao', 'importacao')),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table public.peopleflow_dev_lista_mestra is
  'Desenvolvimento: documentos/POPs controlados. periodicidade_meses = periodicidade padrão (o requisito do cargo pode definir outra).';

create table if not exists public.peopleflow_dev_lista_mestra_revisoes (
  id bigint generated always as identity primary key,
  codigo text not null references public.peopleflow_dev_lista_mestra (codigo) on update cascade,
  revisao text not null,
  data_revisao date,
  origem_registro text not null default 'sistema' check (origem_registro in ('sistema', 'migracao', 'importacao')),
  registrado_em timestamptz not null default now(),
  registrado_por uuid,
  unique (codigo, revisao)
);
create index if not exists peopleflow_dev_lm_revisoes_codigo_idx on public.peopleflow_dev_lista_mestra_revisoes (codigo);

-- ── 3. Habilidades e requisitos do cargo ────────────────────────────────
-- Fundação apenas: catálogo + vínculo com o cargo. Sem escala, sem nível,
-- sem média, sem ranking — a decisão sobre os níveis 1–4 / Valor do GAP
-- (POP-RH-002-01/02) está pendente e entrará como colunas novas e
-- opcionais, sem afetar a AVD.
create table if not exists public.peopleflow_dev_habilidades (
  id bigint generated always as identity primary key,
  nome text not null check (btrim(nome) <> ''),
  descricao text not null default '',
  tipo text not null check (tipo in ('tecnica', 'regulatoria')),
  norma text check (norma in ('iso_13485', 'rdc_665', 'ambas', 'nao_aplicavel')),
  ativo boolean not null default true,
  origem_registro text not null default 'sistema' check (origem_registro in ('sistema', 'migracao', 'importacao')),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index if not exists peopleflow_dev_habilidades_nome_uidx on public.peopleflow_dev_habilidades (lower(btrim(nome)));

create table if not exists public.peopleflow_dev_cargo_requisitos (
  id bigint generated always as identity primary key,
  cargo_nome text not null references public.peopleflow_descricoes_cargo (cargo_nome) on update cascade,
  tipo_requisito text not null check (tipo_requisito in ('habilidade', 'treinamento')),
  habilidade_id bigint references public.peopleflow_dev_habilidades (id),
  lista_mestra_codigo text references public.peopleflow_dev_lista_mestra (codigo) on update cascade,
  obrigatorio boolean not null default true,
  periodicidade_meses integer check (periodicidade_meses > 0),
  recicla_na_revisao boolean not null default false,
  prazo_apos_admissao_dias integer check (prazo_apos_admissao_dias >= 0),
  status text not null default 'sugerido' check (status in ('sugerido', 'vigente', 'inativo')),
  justificativa text not null default '',
  origem_registro text not null default 'sistema' check (origem_registro in ('sistema', 'migracao', 'importacao')),
  validado_em timestamptz,
  validado_por uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (
    (tipo_requisito = 'habilidade' and habilidade_id is not null and lista_mestra_codigo is null)
    or (tipo_requisito = 'treinamento' and lista_mestra_codigo is not null and habilidade_id is null)
  )
);
create unique index if not exists peopleflow_dev_req_cargo_hab_uidx on public.peopleflow_dev_cargo_requisitos (cargo_nome, habilidade_id) where habilidade_id is not null;
create unique index if not exists peopleflow_dev_req_cargo_lm_uidx on public.peopleflow_dev_cargo_requisitos (cargo_nome, lista_mestra_codigo) where lista_mestra_codigo is not null;
create index if not exists peopleflow_dev_req_status_idx on public.peopleflow_dev_cargo_requisitos (cargo_nome, status);
create index if not exists peopleflow_dev_req_lm_idx on public.peopleflow_dev_cargo_requisitos (lista_mestra_codigo);
create index if not exists peopleflow_dev_req_hab_idx on public.peopleflow_dev_cargo_requisitos (habilidade_id);

-- ── 4. Treinamentos ─────────────────────────────────────────────────────
create sequence if not exists public.peopleflow_dev_treinamento_codigo_seq;

create table if not exists public.peopleflow_dev_treinamentos (
  id bigint generated always as identity primary key,
  codigo text not null unique default ('TRN-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.peopleflow_dev_treinamento_codigo_seq')::text, 4, '0')),
  titulo text not null check (btrim(titulo) <> ''),
  lista_mestra_codigo text references public.peopleflow_dev_lista_mestra (codigo) on update cascade,
  lista_mestra_revisao text,
  tipo text not null default 'interno' check (tipo in ('interno', 'externo')),
  modalidade text check (modalidade in ('presencial', 'ead', 'hibrido')),
  data_inicio date,
  data_fim date,
  carga_horaria_min integer check (carga_horaria_min > 0),
  instrutor_colaborador_id bigint references public.colaboradores (id),
  instrutor_externo text,
  responsavel_colaborador_id bigint references public.colaboradores (id),
  custo numeric(12, 2) check (custo >= 0),
  justificativa text not null default '',
  periodicidade_meses integer check (periodicidade_meses > 0),
  publico_criterios jsonb,
  status text not null default 'planejado' check (status in ('planejado', 'em_andamento', 'concluido', 'cancelado')),
  status_motivo text,
  concluido_em timestamptz,
  concluido_por uuid,
  origem_registro text not null default 'sistema' check (origem_registro in ('sistema', 'migracao', 'importacao')),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (data_fim is null or data_inicio is null or data_fim >= data_inicio),
  check (status <> 'cancelado' or coalesce(btrim(status_motivo), '') <> '')
);
create index if not exists peopleflow_dev_trein_lm_idx on public.peopleflow_dev_treinamentos (lista_mestra_codigo, status, data_fim);
create index if not exists peopleflow_dev_trein_status_idx on public.peopleflow_dev_treinamentos (status, data_inicio);
create index if not exists peopleflow_dev_trein_resp_idx on public.peopleflow_dev_treinamentos (responsavel_colaborador_id);
create index if not exists peopleflow_dev_trein_instr_idx on public.peopleflow_dev_treinamentos (instrutor_colaborador_id);
comment on column public.peopleflow_dev_treinamentos.periodicidade_meses is
  'Validade específica deste treinamento; quando nula vale a do requisito do cargo ou a da Lista Mestra.';

create table if not exists public.peopleflow_dev_treinamento_habilidades (
  treinamento_id bigint not null references public.peopleflow_dev_treinamentos (id),
  habilidade_id bigint not null references public.peopleflow_dev_habilidades (id),
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (treinamento_id, habilidade_id)
);
create index if not exists peopleflow_dev_trein_hab_hab_idx on public.peopleflow_dev_treinamento_habilidades (habilidade_id);

-- ── 5. LNT (necessidades) — origem sempre rastreável ────────────────────
create table if not exists public.peopleflow_dev_necessidades (
  id bigint generated always as identity primary key,
  colaborador_id bigint references public.colaboradores (id),
  cargo_nome text references public.peopleflow_descricoes_cargo (cargo_nome) on update cascade,
  origem text not null check (origem in ('habilidade', 'treinamento_obrigatorio', 'revisao_pop', 'integracao', 'gestor', 'pdi', 'rh')),
  requisito_id bigint references public.peopleflow_dev_cargo_requisitos (id),
  habilidade_id bigint references public.peopleflow_dev_habilidades (id),
  lista_mestra_codigo text references public.peopleflow_dev_lista_mestra (codigo) on update cascade,
  lista_mestra_revisao text,
  pdi_id bigint references public.peopleflow_pdi (id),
  pdi_item_id text,
  pdi_item_nome text,
  descricao text not null check (btrim(descricao) <> ''),
  justificativa text not null default '',
  acao_tipo text check (acao_tipo in ('treinamento_interno', 'treinamento_externo', 'leitura_pop', 'on_the_job', 'outro')),
  prioridade text check (prioridade in ('alta', 'media', 'baixa')),
  gut_g smallint check (gut_g between 1 and 5),
  gut_u smallint check (gut_u between 1 and 5),
  gut_t smallint check (gut_t between 1 and 5),
  prazo date,
  status text not null default 'aberta' check (status in ('aberta', 'planejada', 'atendida', 'cancelada')),
  status_motivo text,
  treinamento_id bigint references public.peopleflow_dev_treinamentos (id),
  solicitado_por_colaborador_id bigint references public.colaboradores (id),
  origem_registro text not null default 'sistema' check (origem_registro in ('sistema', 'migracao', 'importacao')),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (colaborador_id is not null or cargo_nome is not null),
  check (origem <> 'pdi' or pdi_id is not null),
  check (origem <> 'habilidade' or habilidade_id is not null),
  check (origem not in ('treinamento_obrigatorio', 'revisao_pop') or lista_mestra_codigo is not null),
  check (origem not in ('gestor', 'rh') or btrim(justificativa) <> ''),
  check (status <> 'cancelada' or coalesce(btrim(status_motivo), '') <> '')
);
create index if not exists peopleflow_dev_nec_colab_idx on public.peopleflow_dev_necessidades (colaborador_id, status);
create index if not exists peopleflow_dev_nec_trein_idx on public.peopleflow_dev_necessidades (treinamento_id);
create index if not exists peopleflow_dev_nec_pdi_idx on public.peopleflow_dev_necessidades (pdi_id);
create index if not exists peopleflow_dev_nec_origem_idx on public.peopleflow_dev_necessidades (origem, status);
-- Impede a mesma necessidade automática aberta duas vezes.
create unique index if not exists peopleflow_dev_nec_dedup_uidx on public.peopleflow_dev_necessidades (
  origem, coalesce(colaborador_id, -1), coalesce(cargo_nome, ''), coalesce(requisito_id, -1),
  coalesce(pdi_item_id, ''), coalesce(lista_mestra_codigo, ''), coalesce(lista_mestra_revisao, '')
) where status in ('aberta', 'planejada') and origem not in ('gestor', 'rh');
comment on column public.peopleflow_dev_necessidades.pdi_item_id is
  'Referência fraca a peopleflow_pdi_itens.id (sem FK — o PDI regrava os itens). O módulo nunca escreve no PDI.';

-- ── 6. Participantes (dado do treinamento) ──────────────────────────────
create table if not exists public.peopleflow_dev_participantes (
  id bigint generated always as identity primary key,
  treinamento_id bigint not null references public.peopleflow_dev_treinamentos (id),
  colaborador_id bigint not null references public.colaboradores (id),
  origem_inclusao text not null default 'manual' check (origem_inclusao in ('manual', 'criterio', 'lnt')),
  necessidade_id bigint references public.peopleflow_dev_necessidades (id),
  presenca_status text not null default 'pendente' check (presenca_status in ('pendente', 'presente', 'ausente')),
  presenca_metodo text check (presenca_metodo in ('manual', 'qr', 'login', 'importacao')),
  presenca_em timestamptz,
  presenca_por uuid,
  presenca_motivo text,
  eficacia_respostas jsonb,
  eficacia_em timestamptz,
  eficiencia_respostas jsonb,
  eficiencia_prevista_em date,
  eficiencia_em timestamptz,
  eficiencia_por uuid,
  validade_ate date,
  removido_em timestamptz,
  removido_por uuid,
  removido_motivo text,
  origem_registro text not null default 'sistema' check (origem_registro in ('sistema', 'migracao', 'importacao')),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (treinamento_id, colaborador_id),
  check ((removido_em is null) = (removido_motivo is null))
);
create index if not exists peopleflow_dev_part_colab_idx on public.peopleflow_dev_participantes (colaborador_id);
create index if not exists peopleflow_dev_part_nec_idx on public.peopleflow_dev_participantes (necessidade_id);

-- ── 7. Evidências (metadados; arquivos virão em bucket próprio) ─────────
create table if not exists public.peopleflow_dev_evidencias (
  id bigint generated always as identity primary key,
  treinamento_id bigint not null references public.peopleflow_dev_treinamentos (id),
  participante_id bigint references public.peopleflow_dev_participantes (id),
  tipo text not null check (tipo in ('lista_presenca', 'certificado', 'material', 'outro')),
  storage_path text not null unique,
  file_name text not null,
  mime text,
  tamanho_bytes bigint check (tamanho_bytes >= 0),
  enviado_em timestamptz not null default now(),
  enviado_por uuid,
  substituida_em timestamptz,
  substituida_por uuid,
  substituida_motivo text
);
create index if not exists peopleflow_dev_evid_trein_idx on public.peopleflow_dev_evidencias (treinamento_id);
create index if not exists peopleflow_dev_evid_part_idx on public.peopleflow_dev_evidencias (participante_id);

-- ── 8. Auditoria (imutável, gravada só pelo servidor) ───────────────────
create table if not exists public.peopleflow_dev_auditoria (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  user_id uuid,
  colaborador_id bigint,
  acao text not null,
  entidade text not null,
  entidade_id text,
  detalhe jsonb not null default '{}'::jsonb
);
create index if not exists peopleflow_dev_aud_ts_idx on public.peopleflow_dev_auditoria (ts desc);
create index if not exists peopleflow_dev_aud_ent_idx on public.peopleflow_dev_auditoria (entidade, entidade_id);

-- ── Triggers: updated_at, sem exclusão física, auditoria imutável ───────
do $$
declare t text;
begin
  foreach t in array array[
    'peopleflow_dev_lista_mestra', 'peopleflow_dev_habilidades', 'peopleflow_dev_cargo_requisitos',
    'peopleflow_dev_treinamentos', 'peopleflow_dev_necessidades', 'peopleflow_dev_participantes'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.peopleflow_dev_set_updated_at()', t || '_updated_at', t);
  end loop;

  foreach t in array array[
    'peopleflow_dev_lista_mestra', 'peopleflow_dev_lista_mestra_revisoes', 'peopleflow_dev_habilidades',
    'peopleflow_dev_cargo_requisitos', 'peopleflow_dev_treinamentos', 'peopleflow_dev_treinamento_habilidades',
    'peopleflow_dev_necessidades', 'peopleflow_dev_participantes', 'peopleflow_dev_evidencias', 'peopleflow_dev_auditoria'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_sem_delete', t);
    execute format('create trigger %I before delete on public.%I for each row execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_delete', t);
    execute format('drop trigger if exists %I on public.%I', t || '_sem_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_truncate', t);
  end loop;
end $$;

drop trigger if exists peopleflow_dev_auditoria_sem_update on public.peopleflow_dev_auditoria;
create trigger peopleflow_dev_auditoria_sem_update before update on public.peopleflow_dev_auditoria
  for each row execute function public.peopleflow_dev_bloquear_alteracao();

-- ── Funções de acesso (usadas pelas políticas) ──────────────────────────
-- SECURITY DEFINER para ler as tabelas de controle sem recursão de RLS.
create or replace function public.peopleflow_dev_meu_colaborador_id()
returns bigint language sql stable security definer set search_path = public as $$
  select c.colaborador_id from public.peopleflow_dev_contas c
  where c.user_id = auth.uid() and c.atualizado_em > now() - interval '12 hours'
$$;

create or replace function public.peopleflow_dev_meu_perfil()
returns text language sql stable security definer set search_path = public as $$
  select c.perfil from public.peopleflow_dev_contas c
  where c.user_id = auth.uid() and c.atualizado_em > now() - interval '12 hours'
$$;

create or replace function public.peopleflow_dev_pode_ver_colaborador(p_colaborador_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.peopleflow_dev_meu_perfil()
    when 'RH' then true
    when 'Gestor' then exists (
      select 1 from public.peopleflow_dev_escopo e
      where e.gestor_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
        and e.colaborador_id = p_colaborador_id)
    else false end
$$;

create or replace function public.peopleflow_dev_responsavel_por(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.peopleflow_dev_treinamentos t
    where t.id = p_treinamento_id
      and public.peopleflow_dev_meu_colaborador_id() is not null
      and public.peopleflow_dev_meu_colaborador_id() in (t.responsavel_colaborador_id, t.instrutor_colaborador_id))
$$;

create or replace function public.peopleflow_dev_treinamento_visivel(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.peopleflow_dev_meu_perfil()
    when 'RH' then true
    when 'Gestor' then public.peopleflow_dev_responsavel_por(p_treinamento_id) or exists (
      select 1 from public.peopleflow_dev_participantes p
      join public.peopleflow_dev_escopo e
        on e.colaborador_id = p.colaborador_id and e.gestor_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
      where p.treinamento_id = p_treinamento_id and p.removido_em is null)
    else false end
$$;

create or replace function public.peopleflow_dev_participante_visivel(p_participante_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.peopleflow_dev_participantes p
    where p.id = p_participante_id
      and (public.peopleflow_dev_pode_ver_colaborador(p.colaborador_id) or public.peopleflow_dev_responsavel_por(p.treinamento_id)))
$$;

-- ── Views (permissão de quem consulta) ──────────────────────────────────
-- Histórico: participante presente em treinamento concluído.
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
  coalesce(t.data_fim, t.data_inicio) as data_realizacao,
  t.carga_horaria_min,
  t.periodicidade_meses as periodicidade_treinamento_meses,
  p.validade_ate,
  p.presenca_metodo,
  p.origem_registro
from public.peopleflow_dev_participantes p
join public.peopleflow_dev_treinamentos t on t.id = p.treinamento_id
where t.status = 'concluido' and p.presenca_status = 'presente' and p.removido_em is null;

-- Conformidade: cada colaborador ativo × requisito de TREINAMENTO vigente e
-- obrigatório do seu cargo. (Gaps de habilidade dependem da decisão
-- pendente sobre níveis e ficam fora desta view.) Regra de "ativo" igual à
-- do PeopleFlow: não desligado, não empresa afiliada, admissão até hoje.
-- A ligação colaborador → cargo é por colaboradores.cargo = cargo_nome, a
-- convenção atual do PeopleFlow (não há id de cargo).
create or replace view public.peopleflow_dev_v_conformidade with (security_invoker = true) as
with base as (
  select
    c.id as colaborador_id,
    c.admissao,
    r.id as requisito_id,
    r.cargo_nome,
    r.lista_mestra_codigo,
    lm.revisao_atual,
    r.recicla_na_revisao,
    r.prazo_apos_admissao_dias,
    coalesce(r.periodicidade_meses, lm.periodicidade_meses) as periodicidade_meses
  from public.colaboradores c
  join public.peopleflow_dev_cargo_requisitos r
    on r.cargo_nome = c.cargo and r.status = 'vigente' and r.obrigatorio and r.tipo_requisito = 'treinamento'
  join public.peopleflow_dev_lista_mestra lm on lm.codigo = r.lista_mestra_codigo
  where coalesce(c.desligado, false) = false
    and coalesce(c.empresa_afiliada, false) = false
    and (c.admissao is null or c.admissao <= current_date)
    and public.peopleflow_dev_pode_ver_colaborador(c.id)
),
ultima as (
  select distinct on (h.colaborador_id, h.lista_mestra_codigo)
    h.colaborador_id, h.lista_mestra_codigo, h.data_realizacao, h.lista_mestra_revisao, h.validade_ate, h.periodicidade_treinamento_meses
  from public.peopleflow_dev_v_historico h
  where h.lista_mestra_codigo is not null
  order by h.colaborador_id, h.lista_mestra_codigo, h.data_realizacao desc nulls last
),
calc as (
  select
    b.*,
    u.data_realizacao as ultima_realizacao,
    u.lista_mestra_revisao as revisao_realizada,
    coalesce(
      u.validade_ate,
      case when coalesce(u.periodicidade_treinamento_meses, b.periodicidade_meses) is not null and u.data_realizacao is not null
        then (u.data_realizacao + make_interval(months => coalesce(u.periodicidade_treinamento_meses, b.periodicidade_meses)))::date end
    ) as validade_ate,
    exists (
      select 1 from public.peopleflow_dev_participantes p
      join public.peopleflow_dev_treinamentos t on t.id = p.treinamento_id
      where p.colaborador_id = b.colaborador_id and p.removido_em is null
        and t.lista_mestra_codigo = b.lista_mestra_codigo and t.status in ('planejado', 'em_andamento')
    ) as agendado
  from base b
  left join ultima u on u.colaborador_id = b.colaborador_id and u.lista_mestra_codigo = b.lista_mestra_codigo
)
select
  colaborador_id, requisito_id, cargo_nome, lista_mestra_codigo, revisao_atual, revisao_realizada,
  ultima_realizacao, validade_ate, agendado,
  case
    when ultima_realizacao is null then
      case
        when agendado then 'agendado'
        when prazo_apos_admissao_dias is not null and admissao is not null
             and current_date <= admissao + prazo_apos_admissao_dias then 'no_prazo_integracao'
        else 'pendente'
      end
    when recicla_na_revisao and revisao_realizada is distinct from revisao_atual then
      case when agendado then 'agendado' else 'revisao_pendente' end
    when validade_ate is not null and validade_ate < current_date then
      case when agendado then 'agendado' else 'vencido' end
    when validade_ate is not null and validade_ate <= current_date + 30 then 'a_vencer'
    else 'em_dia'
  end as situacao
from calc;

-- ── RLS ─────────────────────────────────────────────────────────────────
alter table public.peopleflow_dev_contas enable row level security;
alter table public.peopleflow_dev_escopo enable row level security;
alter table public.peopleflow_dev_lista_mestra enable row level security;
alter table public.peopleflow_dev_lista_mestra_revisoes enable row level security;
alter table public.peopleflow_dev_habilidades enable row level security;
alter table public.peopleflow_dev_cargo_requisitos enable row level security;
alter table public.peopleflow_dev_treinamentos enable row level security;
alter table public.peopleflow_dev_treinamento_habilidades enable row level security;
alter table public.peopleflow_dev_necessidades enable row level security;
alter table public.peopleflow_dev_participantes enable row level security;
alter table public.peopleflow_dev_evidencias enable row level security;
alter table public.peopleflow_dev_auditoria enable row level security;

drop policy if exists dev_contas_propria on public.peopleflow_dev_contas;
create policy dev_contas_propria on public.peopleflow_dev_contas for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists dev_escopo_proprio on public.peopleflow_dev_escopo;
create policy dev_escopo_proprio on public.peopleflow_dev_escopo for select to authenticated
  using (gestor_colaborador_id = (select public.peopleflow_dev_meu_colaborador_id()));

drop policy if exists dev_lista_mestra_leitura on public.peopleflow_dev_lista_mestra;
create policy dev_lista_mestra_leitura on public.peopleflow_dev_lista_mestra for select to authenticated
  using ((select public.peopleflow_dev_meu_perfil()) is not null);

drop policy if exists dev_lm_revisoes_leitura on public.peopleflow_dev_lista_mestra_revisoes;
create policy dev_lm_revisoes_leitura on public.peopleflow_dev_lista_mestra_revisoes for select to authenticated
  using ((select public.peopleflow_dev_meu_perfil()) is not null);

drop policy if exists dev_habilidades_leitura on public.peopleflow_dev_habilidades;
create policy dev_habilidades_leitura on public.peopleflow_dev_habilidades for select to authenticated
  using ((select public.peopleflow_dev_meu_perfil()) is not null);

drop policy if exists dev_requisitos_leitura on public.peopleflow_dev_cargo_requisitos;
create policy dev_requisitos_leitura on public.peopleflow_dev_cargo_requisitos for select to authenticated
  using ((select public.peopleflow_dev_meu_perfil()) is not null);

drop policy if exists dev_treinamentos_leitura on public.peopleflow_dev_treinamentos;
create policy dev_treinamentos_leitura on public.peopleflow_dev_treinamentos for select to authenticated
  using (public.peopleflow_dev_treinamento_visivel(id));

drop policy if exists dev_trein_hab_leitura on public.peopleflow_dev_treinamento_habilidades;
create policy dev_trein_hab_leitura on public.peopleflow_dev_treinamento_habilidades for select to authenticated
  using (public.peopleflow_dev_treinamento_visivel(treinamento_id));

drop policy if exists dev_necessidades_leitura on public.peopleflow_dev_necessidades;
create policy dev_necessidades_leitura on public.peopleflow_dev_necessidades for select to authenticated
  using (
    (select public.peopleflow_dev_meu_perfil()) = 'RH'
    or (
      (select public.peopleflow_dev_meu_perfil()) = 'Gestor'
      and (
        (colaborador_id is not null and public.peopleflow_dev_pode_ver_colaborador(colaborador_id))
        or solicitado_por_colaborador_id = (select public.peopleflow_dev_meu_colaborador_id())
      )
    )
  );

drop policy if exists dev_participantes_leitura on public.peopleflow_dev_participantes;
create policy dev_participantes_leitura on public.peopleflow_dev_participantes for select to authenticated
  using (public.peopleflow_dev_pode_ver_colaborador(colaborador_id) or public.peopleflow_dev_responsavel_por(treinamento_id));

drop policy if exists dev_evidencias_leitura on public.peopleflow_dev_evidencias;
create policy dev_evidencias_leitura on public.peopleflow_dev_evidencias for select to authenticated
  using (
    public.peopleflow_dev_treinamento_visivel(treinamento_id)
    and (participante_id is null or public.peopleflow_dev_participante_visivel(participante_id))
  );

drop policy if exists dev_auditoria_rh on public.peopleflow_dev_auditoria;
create policy dev_auditoria_rh on public.peopleflow_dev_auditoria for select to authenticated
  using ((select public.peopleflow_dev_meu_perfil()) = 'RH');

-- ── Permissões: navegador só lê; anon nada; gravação só pelo servidor ───
do $$
declare t text;
begin
  foreach t in array array[
    'peopleflow_dev_contas', 'peopleflow_dev_escopo', 'peopleflow_dev_lista_mestra', 'peopleflow_dev_lista_mestra_revisoes',
    'peopleflow_dev_habilidades', 'peopleflow_dev_cargo_requisitos', 'peopleflow_dev_treinamentos',
    'peopleflow_dev_treinamento_habilidades', 'peopleflow_dev_necessidades', 'peopleflow_dev_participantes',
    'peopleflow_dev_evidencias', 'peopleflow_dev_auditoria', 'peopleflow_dev_v_historico', 'peopleflow_dev_v_conformidade'
  ] loop
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

revoke all on sequence public.peopleflow_dev_treinamento_codigo_seq from public, anon, authenticated;
grant usage, select on sequence public.peopleflow_dev_treinamento_codigo_seq to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'peopleflow_dev_meu_colaborador_id()', 'peopleflow_dev_meu_perfil()', 'peopleflow_dev_pode_ver_colaborador(bigint)',
    'peopleflow_dev_responsavel_por(bigint)', 'peopleflow_dev_treinamento_visivel(bigint)', 'peopleflow_dev_participante_visivel(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['peopleflow_dev_set_updated_at()', 'peopleflow_dev_bloquear_exclusao()', 'peopleflow_dev_bloquear_alteracao()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

commit;

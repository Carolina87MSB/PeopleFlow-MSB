-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PeopleFlow — Integração financeira dos desligamentos (conferência e validação pelo RH)
--
-- O QUE FAZ (ADITIVO — nenhum valor existente é alterado; NÃO muda nenhum acesso):
--   1. peopleflow_rescisoes_historico_rubricas (só servidor): colunas de VALIDAÇÃO pelo RH, por componente e independentes entre si:
--        • Rescisão (valor líquido da folha): rescisao_status 'proposto' | 'validado' (+ decisão sobre divergência com um lançamento existente,
--          valor validado, responsável, data); líquido R$ 0,00 só valida com conferência expressa (zero_conferido_*);
--        • GRRF: grrf_status 'pendente' | 'validado' | 'nao_aplicavel', com depósito rescisório, multa e TOTAL efetivamente recolhido, fonte
--          documental, responsável e data. Nada é calculado nem presumido a partir do saldo FGTS ou de percentuais: só vale o que o RH registra;
--        • modalidade confirmada pelo RH (para linhas em que o relatório não informa o tipo de rescisão).
--      Os valores importados da folha (salário, proventos, descontos, líquido, FGTS) passam a ser IMUTÁVEIS (trigger); conversões de estágio
--      para CLT nunca recebem validação financeira (trigger).
--   2. peopleflow_desligamentos (fechamento financeiro por colaborador): 4 colunas anuláveis — origem ('manual' | 'folha'), rescisao_historico_id,
--      validado_em, validado_por. Os fechamentos existentes ficam intactos (origem 'manual', sem validação).
--   3. peopleflow_fechamentos_log (só servidor, somente inserção): trilha de toda gravação financeira — valor anterior, valor novo, origem,
--      ação, responsável, data e motivo.
--
-- ACESSOS: esta migration NÃO altera RLS/grants de peopleflow_desligamentos. O fechamento do acesso direto pelo navegador é a migration
-- SEPARADA supabase/desligamentos_financeiro_fechar_acesso.sql, aplicada só depois de o código novo (que lê e grava pelo servidor) estar no ar.
--
-- SEGURANÇA: uma única transação; pré-condições abortam sem gravar; reaplicável (idempotente).
-- REVERSÃO: supabase/desligamentos_financeiro_rollback.sql · VALIDAÇÃO (somente leitura): supabase/desligamentos_financeiro_validacao.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $mig$
begin
  if to_regclass('public.peopleflow_rescisoes_historico') is null or to_regclass('public.peopleflow_rescisoes_historico_rubricas') is null then
    raise exception 'PRÉ-CONDIÇÃO: aplique antes supabase/desligamentos_historico_e_situacao.sql — nada foi alterado.';
  end if;
  if to_regclass('public.peopleflow_desligamentos') is null then
    raise exception 'PRÉ-CONDIÇÃO: tabela public.peopleflow_desligamentos não existe — nada foi alterado.';
  end if;
end
$mig$;

-- ── 1. Validação financeira por componente (tabela só-servidor) ──────────────────────────────────
alter table public.peopleflow_rescisoes_historico_rubricas
  add column if not exists rescisao_status text not null default 'proposto',
  add column if not exists rescisao_decisao text,
  add column if not exists rescisao_valor_validado numeric(14, 2),
  add column if not exists rescisao_validada_em timestamptz,
  add column if not exists rescisao_validada_por text,
  add column if not exists rescisao_observacao text,
  add column if not exists zero_conferido_em timestamptz,
  add column if not exists zero_conferido_por text,
  add column if not exists modalidade_confirmada text,
  add column if not exists modalidade_confirmada_em timestamptz,
  add column if not exists modalidade_confirmada_por text,
  add column if not exists grrf_status text not null default 'pendente',
  add column if not exists grrf_deposito numeric(14, 2),
  add column if not exists grrf_multa numeric(14, 2),
  add column if not exists grrf_total numeric(14, 2),
  add column if not exists grrf_fonte text,
  add column if not exists grrf_validada_em timestamptz,
  add column if not exists grrf_validada_por text,
  add column if not exists grrf_observacao text;

comment on column public.peopleflow_rescisoes_historico_rubricas.rescisao_status is '''proposto'' (líquido da folha ainda não conferido) | ''validado'' (conferido pelo RH). Independe da GRRF.';
comment on column public.peopleflow_rescisoes_historico_rubricas.rescisao_valor_validado is 'Valor que vale como Rescisão quando validado: o líquido da folha, ou o valor já lançado quando o RH decidiu mantê-lo.';
comment on column public.peopleflow_rescisoes_historico_rubricas.grrf_total is 'Total EFETIVAMENTE recolhido da GRRF (guia), informado pelo RH. É o que alimenta o Dashboard — sem somar depósito e multa de novo.';

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'peopleflow_rubricas_rescisao_chk' and conrelid = 'public.peopleflow_rescisoes_historico_rubricas'::regclass) then
    alter table public.peopleflow_rescisoes_historico_rubricas add constraint peopleflow_rubricas_rescisao_chk check (
      rescisao_decisao is null or rescisao_decisao in ('adotar_folha', 'manter_lancado')
    ) not valid;
    alter table public.peopleflow_rescisoes_historico_rubricas validate constraint peopleflow_rubricas_rescisao_chk;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'peopleflow_rubricas_rescisao_status_chk' and conrelid = 'public.peopleflow_rescisoes_historico_rubricas'::regclass) then
    alter table public.peopleflow_rescisoes_historico_rubricas add constraint peopleflow_rubricas_rescisao_status_chk check (
      (rescisao_status = 'proposto' and rescisao_valor_validado is null and rescisao_validada_em is null and rescisao_validada_por is null and rescisao_decisao is null)
      or (rescisao_status = 'validado' and rescisao_valor_validado is not null and rescisao_valor_validado >= 0
          and rescisao_validada_em is not null and btrim(coalesce(rescisao_validada_por, '')) <> ''
          and (rescisao_valor_validado <> 0 or zero_conferido_em is not null))
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'peopleflow_rubricas_grrf_chk' and conrelid = 'public.peopleflow_rescisoes_historico_rubricas'::regclass) then
    alter table public.peopleflow_rescisoes_historico_rubricas add constraint peopleflow_rubricas_grrf_chk check (
      grrf_fonte is null or grrf_fonte in ('guia_grrf', 'demonstrativo_rescisao', 'outro_documento')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'peopleflow_rubricas_grrf_status_chk' and conrelid = 'public.peopleflow_rescisoes_historico_rubricas'::regclass) then
    alter table public.peopleflow_rescisoes_historico_rubricas add constraint peopleflow_rubricas_grrf_status_chk check (
      (grrf_status = 'pendente' and grrf_total is null and grrf_deposito is null and grrf_multa is null and grrf_fonte is null and grrf_validada_em is null and grrf_validada_por is null)
      or (grrf_status = 'validado' and grrf_total is not null and grrf_total >= 0 and grrf_fonte is not null
          and coalesce(grrf_deposito, 0) >= 0 and coalesce(grrf_multa, 0) >= 0
          and (grrf_deposito is null or grrf_multa is null or abs(grrf_total - (grrf_deposito + grrf_multa)) < 0.005)
          and grrf_validada_em is not null and btrim(coalesce(grrf_validada_por, '')) <> '')
      or (grrf_status = 'nao_aplicavel' and grrf_total = 0 and grrf_deposito is null and grrf_multa is null
          and grrf_validada_em is not null and btrim(coalesce(grrf_validada_por, '')) <> '')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'peopleflow_rubricas_modalidade_chk' and conrelid = 'public.peopleflow_rescisoes_historico_rubricas'::regclass) then
    alter table public.peopleflow_rescisoes_historico_rubricas add constraint peopleflow_rubricas_modalidade_chk check (
      modalidade_confirmada is null or modalidade_confirmada in ('dispensa_sem_justa_causa', 'pedido_demissao', 'termino_contrato_determinado', 'antecipacao_empregador', 'termino_estagio', 'outra')
    );
  end if;
end
$mig$;

-- valores importados da folha são imutáveis; conversão de estágio nunca recebe validação financeira
create or replace function public.peopleflow_rubricas_guard()
returns trigger language plpgsql set search_path = public as $fn$
declare
  v_natureza text;
begin
  if tg_op = 'UPDATE' then
    if new.rescisao_id is distinct from old.rescisao_id or new.saldo_fgts is distinct from old.saldo_fgts or new.salario is distinct from old.salario
       or new.proventos is distinct from old.proventos or new.descontos is distinct from old.descontos or new.liquido is distinct from old.liquido
       or new.fgts_rescisorio is distinct from old.fgts_rescisorio then
      raise exception 'Os valores importados da folha são imutáveis: a correção financeira é registrada na validação (com log), nunca sobrescrevendo o importado.';
    end if;
  end if;
  select natureza into v_natureza from public.peopleflow_rescisoes_historico where id = new.rescisao_id;
  if v_natureza = 'conversao_estagio_clt' and (new.rescisao_status <> 'proposto' or new.grrf_status <> 'pendente') then
    raise exception 'Conversão de estágio para CLT não é desligamento: não recebe validação financeira de custos.';
  end if;
  return new;
end
$fn$;

drop trigger if exists peopleflow_rubricas_guard on public.peopleflow_rescisoes_historico_rubricas;
create trigger peopleflow_rubricas_guard before insert or update on public.peopleflow_rescisoes_historico_rubricas
  for each row execute function public.peopleflow_rubricas_guard();

-- ── 2. Fechamento financeiro por colaborador: origem e validação (colunas anuláveis) ─────────────────
alter table public.peopleflow_desligamentos
  add column if not exists origem text not null default 'manual',
  add column if not exists rescisao_historico_id bigint references public.peopleflow_rescisoes_historico (id),
  add column if not exists validado_em timestamptz,
  add column if not exists validado_por text;

comment on column public.peopleflow_desligamentos.origem is '''manual'' (lançado pelo RH na tela) | ''folha'' (criado a partir da folha de rescisão validada pelo RH).';
comment on column public.peopleflow_desligamentos.validado_em is 'Preenchido quando o RH validou o lançamento (fechamentos antigos ficam sem validação até a conferência).';

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'peopleflow_desligamentos_origem_chk' and conrelid = 'public.peopleflow_desligamentos'::regclass) then
    alter table public.peopleflow_desligamentos add constraint peopleflow_desligamentos_origem_chk check (origem in ('manual', 'folha'));
  end if;
end
$mig$;
create index if not exists peopleflow_desligamentos_rescisao_idx on public.peopleflow_desligamentos (rescisao_historico_id) where rescisao_historico_id is not null;

-- ── 3. Trilha de auditoria financeira (só servidor, somente inserção) ─────────────────────────────────
create table if not exists public.peopleflow_fechamentos_log (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  por text not null,
  acao text not null check (acao in ('validar_rescisao', 'decidir_divergencia', 'registrar_grrf', 'grrf_nao_aplicavel', 'confirmar_modalidade', 'lancamento_manual', 'conferir_zero')),
  colaborador_nome text,
  rescisao_id bigint references public.peopleflow_rescisoes_historico (id),
  campo text,
  valor_anterior numeric(14, 2),
  valor_novo numeric(14, 2),
  origem text,
  motivo text,
  detalhe jsonb not null default '{}'::jsonb
);
comment on table public.peopleflow_fechamentos_log is 'Trilha de toda gravação financeira dos desligamentos (valor anterior, novo, origem, ação, responsável). Só servidor; somente inserção.';
create index if not exists peopleflow_fechamentos_log_rescisao_idx on public.peopleflow_fechamentos_log (rescisao_id);
create index if not exists peopleflow_fechamentos_log_nome_idx on public.peopleflow_fechamentos_log (colaborador_nome);

create or replace function public.peopleflow_fechamentos_log_guard()
returns trigger language plpgsql set search_path = public as $fn$
begin
  raise exception 'peopleflow_fechamentos_log é somente inserção (trilha de auditoria).';
end
$fn$;
drop trigger if exists peopleflow_fechamentos_log_guard on public.peopleflow_fechamentos_log;
create trigger peopleflow_fechamentos_log_guard before update or delete on public.peopleflow_fechamentos_log
  for each row execute function public.peopleflow_fechamentos_log_guard();

alter table public.peopleflow_fechamentos_log enable row level security;
revoke all on public.peopleflow_fechamentos_log from public, anon, authenticated;
grant all on public.peopleflow_fechamentos_log to service_role;

commit;

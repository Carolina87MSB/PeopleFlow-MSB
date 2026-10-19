-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PeopleFlow — PDI: status "Encerrado" (encerramento por desligamento, decisão do RH)
--
-- O QUE FAZ (ADITIVO — nenhum dado existente é alterado):
--   1. Cabeçalho do PDI (peopleflow_pdi): 3 colunas novas e anuláveis — encerrado_em, encerrado_por, encerrado_motivo.
--      O campo `status` já é texto livre (sem CHECK); "Encerrado" passa a ser um 4º valor, DISTINTO de "Concluído".
--   2. CHECK de consistência: status = 'Encerrado' ⇔ data, responsável e motivo preenchidos (e nunca o contrário).
--   3. Imutabilidade (triggers): um PDI encerrado não aceita mais UPDATE/DELETE, e seus itens e ações não aceitam INSERT/UPDATE/DELETE
--      (inclusive evidências). A transição para "Encerrado" só pode alterar status, encerrado_* e updated_at — nada mais no cabeçalho.
--      Itens, ações, evidências, sugestões e histórico são preservados integralmente; as ações NÃO são concluídas nem canceladas.
--   Quem grava o encerramento é o servidor (ação `pdi_encerrar`, só RH, só colaborador desligado, com auditoria) — api/_lib/pdiEncerramentoAcoes.ts.
--
-- SEGURANÇA: uma única transação; pré-condições abortam sem gravar; reaplicável (idempotente).
-- REVERSÃO: supabase/pdi_encerramento_rollback.sql · VALIDAÇÃO (somente leitura): supabase/pdi_encerramento_validacao.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $mig$
begin
  if to_regclass('public.peopleflow_pdi') is null or to_regclass('public.peopleflow_pdi_itens') is null or to_regclass('public.peopleflow_pdi_acoes') is null then
    raise exception 'PRÉ-CONDIÇÃO: tabelas do PDI (peopleflow_pdi, _itens, _acoes) não existem — nada foi alterado.';
  end if;
end
$mig$;

-- ── 1. Colunas do encerramento ───────────────────────────────────────────────────────────────────
alter table public.peopleflow_pdi
  add column if not exists encerrado_em timestamptz,
  add column if not exists encerrado_por text,
  add column if not exists encerrado_motivo text;

comment on column public.peopleflow_pdi.encerrado_em is 'Quando o PDI foi encerrado (status Encerrado). Gravado só pelo servidor.';
comment on column public.peopleflow_pdi.encerrado_por is 'Nome do RH que encerrou o PDI.';
comment on column public.peopleflow_pdi.encerrado_motivo is 'Motivo do encerramento (ex.: colaborador desligado). Obrigatório quando status = Encerrado.';

-- ── 2. Consistência ──────────────────────────────────────────────────────────────────────────────
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'peopleflow_pdi_encerramento_chk' and conrelid = 'public.peopleflow_pdi'::regclass) then
    alter table public.peopleflow_pdi add constraint peopleflow_pdi_encerramento_chk check (
      (status = 'Encerrado' and encerrado_em is not null and btrim(coalesce(encerrado_por, '')) <> '' and btrim(coalesce(encerrado_motivo, '')) <> '')
      or (status <> 'Encerrado' and encerrado_em is null and encerrado_por is null and encerrado_motivo is null)
    );
  end if;
end
$mig$;

-- ── 3. Imutabilidade do PDI encerrado ────────────────────────────────────────────────────────────
create or replace function public.peopleflow_pdi_encerrado_guard()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if tg_op = 'DELETE' then
    if old.status = 'Encerrado' then
      raise exception 'PDI encerrado não pode ser excluído (histórico preservado).';
    end if;
    return old;
  end if;
  if old.status = 'Encerrado' then
    raise exception 'PDI encerrado é imutável (histórico preservado).';
  end if;
  if new.status = 'Encerrado' then
    if old.status not in ('Não iniciado', 'Em andamento') then
      raise exception 'Só um PDI aberto (Não iniciado ou Em andamento) pode ser encerrado.';
    end if;
    if (to_jsonb(new) - 'status' - 'encerrado_em' - 'encerrado_por' - 'encerrado_motivo' - 'updated_at')
       is distinct from (to_jsonb(old) - 'status' - 'encerrado_em' - 'encerrado_por' - 'encerrado_motivo' - 'updated_at') then
      raise exception 'O encerramento só altera status, data, responsável e motivo — nenhum outro campo do PDI.';
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists peopleflow_pdi_encerrado_guard on public.peopleflow_pdi;
create trigger peopleflow_pdi_encerrado_guard before update or delete on public.peopleflow_pdi
  for each row execute function public.peopleflow_pdi_encerrado_guard();

-- itens e ações de um PDI encerrado não aceitam nenhuma gravação
create or replace function public.peopleflow_pdi_filhos_encerrado_guard()
returns trigger language plpgsql set search_path = public as $fn$
declare
  v_pdi_ids bigint[];
begin
  if tg_table_name = 'peopleflow_pdi_itens' then
    if tg_op = 'INSERT' then v_pdi_ids := array[new.pdi_id];
    elsif tg_op = 'DELETE' then v_pdi_ids := array[old.pdi_id];
    else v_pdi_ids := array[old.pdi_id, new.pdi_id];
    end if;
  else
    select array_agg(distinct i.pdi_id) into v_pdi_ids from public.peopleflow_pdi_itens i
     where i.id = any (case when tg_op = 'INSERT' then array[new.item_id] when tg_op = 'DELETE' then array[old.item_id] else array[old.item_id, new.item_id] end);
  end if;
  if exists (select 1 from public.peopleflow_pdi p where p.id = any (coalesce(v_pdi_ids, '{}')) and p.status = 'Encerrado') then
    raise exception 'PDI encerrado: itens e ações não podem ser alterados (histórico preservado).';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$fn$;

drop trigger if exists peopleflow_pdi_itens_encerrado_guard on public.peopleflow_pdi_itens;
create trigger peopleflow_pdi_itens_encerrado_guard before insert or update or delete on public.peopleflow_pdi_itens
  for each row execute function public.peopleflow_pdi_filhos_encerrado_guard();

drop trigger if exists peopleflow_pdi_acoes_encerrado_guard on public.peopleflow_pdi_acoes;
create trigger peopleflow_pdi_acoes_encerrado_guard before insert or update or delete on public.peopleflow_pdi_acoes
  for each row execute function public.peopleflow_pdi_filhos_encerrado_guard();

commit;

-- REVERSÃO de supabase/desligamentos_financeiro.sql
-- Remove triggers, funções, constraints, a trilha (peopleflow_fechamentos_log) e as colunas novas de peopleflow_rescisoes_historico_rubricas e
-- peopleflow_desligamentos. RECUSA se houver qualquer validação financeira, fechamento criado pela folha ou linha na trilha (a reversão apagaria o
-- registro do trabalho do RH), salvo autorização explícita: com v_permitir_perda := true, tudo isso é descartado — faça backup antes.
-- Os valores importados da folha e os 4 fechamentos anteriores (colunas originais) nunca são alterados por esta reversão.
begin;

do $rb$
declare
  v_permitir_perda constant boolean := false;  -- troque para true SOMENTE depois de backup e decisão do RH
  v_validacoes int := 0;
  v_fechamentos int := 0;
  v_log int := 0;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_rescisoes_historico_rubricas' and column_name = 'rescisao_status') then
    select count(*) into v_validacoes from public.peopleflow_rescisoes_historico_rubricas
     where rescisao_status <> 'proposto' or grrf_status <> 'pendente' or modalidade_confirmada is not null or zero_conferido_em is not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_desligamentos' and column_name = 'origem') then
    select count(*) into v_fechamentos from public.peopleflow_desligamentos where origem <> 'manual' or rescisao_validada_em is not null or grrf_validada_em is not null or rescisao_historico_id is not null;
  end if;
  if to_regclass('public.peopleflow_fechamentos_log') is not null then
    select count(*) into v_log from public.peopleflow_fechamentos_log;
  end if;
  if (v_validacoes > 0 or v_fechamentos > 0 or v_log > 0) and not v_permitir_perda then
    raise exception 'REVERSÃO RECUSADA: % validação(ões) financeira(s), % fechamento(s) com origem/validação e % linha(s) de trilha. Faça backup e ajuste v_permitir_perda := true se for mesmo reverter.', v_validacoes, v_fechamentos, v_log;
  end if;
end
$rb$;

drop trigger if exists peopleflow_rubricas_guard on public.peopleflow_rescisoes_historico_rubricas;
drop function if exists public.peopleflow_rubricas_guard();
alter table public.peopleflow_rescisoes_historico_rubricas
  drop constraint if exists peopleflow_rubricas_rescisao_chk,
  drop constraint if exists peopleflow_rubricas_rescisao_status_chk,
  drop constraint if exists peopleflow_rubricas_grrf_chk,
  drop constraint if exists peopleflow_rubricas_grrf_status_chk,
  drop constraint if exists peopleflow_rubricas_modalidade_chk;
alter table public.peopleflow_rescisoes_historico_rubricas
  drop column if exists rescisao_status, drop column if exists rescisao_decisao, drop column if exists rescisao_valor_validado,
  drop column if exists rescisao_validada_em, drop column if exists rescisao_validada_por, drop column if exists rescisao_observacao,
  drop column if exists zero_conferido_em, drop column if exists zero_conferido_por,
  drop column if exists modalidade_confirmada, drop column if exists modalidade_confirmada_em, drop column if exists modalidade_confirmada_por,
  drop column if exists grrf_status, drop column if exists grrf_deposito, drop column if exists grrf_multa, drop column if exists grrf_total,
  drop column if exists grrf_fonte, drop column if exists grrf_validada_em, drop column if exists grrf_validada_por, drop column if exists grrf_observacao;

drop index if exists public.peopleflow_desligamentos_rescisao_idx;
alter table public.peopleflow_desligamentos drop constraint if exists peopleflow_desligamentos_origem_chk, drop constraint if exists peopleflow_desligamentos_validacao_chk;
alter table public.peopleflow_desligamentos
  drop column if exists origem, drop column if exists rescisao_historico_id,
  drop column if exists rescisao_validada_em, drop column if exists rescisao_validada_por, drop column if exists rescisao_fonte,
  drop column if exists grrf_validada_em, drop column if exists grrf_validada_por, drop column if exists grrf_fonte, drop column if exists grrf_nao_aplicavel, drop column if exists grrf_justificativa;

drop trigger if exists peopleflow_fechamentos_log_guard on public.peopleflow_fechamentos_log;
drop table if exists public.peopleflow_fechamentos_log;
drop function if exists public.peopleflow_fechamentos_log_guard();

commit;

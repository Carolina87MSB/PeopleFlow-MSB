-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 7 (Fundação da triagem PDI) — REVERSÃO
-- ════════════════════════════════════════════════════════════════════════
-- Remove SOMENTE o que a Fase 7 criou: 3 tabelas, 2 views, as funções novas e os 3 triggers de guarda
-- colocados nas tabelas legadas. Não toca em nenhum dado, coluna, política ou índice existente
-- (Necessidades, sugestões dispensadas, PDI, AVD, LNT, Treinamentos).
--
-- SEGURANÇA: as linhas "legado" criadas pelo backfill são só um ESPELHO do que continua nas tabelas
-- legadas — apagá-las não perde nada. Já execuções, sugestões novas (regra local/IA/RH) ou sugestões
-- "legado" depois substituídas representam trabalho que só existe aqui: por padrão a reversão RECUSA
-- nesse caso. Faça um backup lógico e só então troque v_permitir_perda para true.
--
-- ATENÇÃO (depois que a Etapa 1B estiver no ar): as decisões feitas pela nova tela vivem SÓ nas tabelas
-- novas; reverter exigiria também voltar o código para a tela antiga e refazer essas decisões.
--
-- Um único bloco DO (uma só instrução, atômica). Rodar em Supabase > SQL Editor.
-- ════════════════════════════════════════════════════════════════════════

do $rb$
declare
  v_permitir_perda boolean := false;   -- troque para true SOMENTE se aceitar perder o que existe só nas tabelas novas
  v_exec integer := 0;
  v_novas integer := 0;
  v_substituidas integer := 0;
  v_txt text;
  v_pol_antes text;
  v_col_antes text;
  v_dados_antes text;
  v_pol_depois text;
  v_col_depois text;
  v_dados_depois text;
begin
  if to_regclass('public.peopleflow_dev_pdi_interpretacoes') is not null then
    v_exec := (select count(*) from public.peopleflow_dev_pdi_interpretacoes)::integer;
  end if;
  if to_regclass('public.peopleflow_dev_pdi_sugestoes') is not null then
    v_novas := (select count(*) from public.peopleflow_dev_pdi_sugestoes where origem_sugestao <> 'legado')::integer;
    v_substituidas := (select count(*) from public.peopleflow_dev_pdi_sugestoes where origem_sugestao = 'legado' and estado = 'substituida')::integer;
  end if;
  if (v_exec > 0 or v_novas > 0 or v_substituidas > 0) and not v_permitir_perda then
    raise exception 'REVERSÃO RECUSADA: % execução(ões), % sugestão(ões) nova(s) e % sugestão(ões) legado substituída(s) existem só nas tabelas novas. Faça backup e ajuste v_permitir_perda para true se quiser prosseguir.', v_exec, v_novas, v_substituidas;
  end if;

  select md5(coalesce(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), ';' order by tablename, policyname), ''))
    into v_pol_antes from pg_policies where schemaname = 'public' and left(tablename, 11) = 'peopleflow_'
     and tablename not in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes');
  select md5(coalesce(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by table_name, ordinal_position), ''))
    into v_col_antes from information_schema.columns where table_schema = 'public' and left(table_name, 11) = 'peopleflow_' and table_name not like 'peopleflow_dev_v_%'
     and table_name not in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes');
  select md5(
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_necessidades x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.pdi_acao_id) from public.peopleflow_dev_pdi_sugestoes_dispensadas x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_itens x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_acoes x), '') || '#' ||
      (select count(*) from public.peopleflow_dev_auditoria)::text || '#' ||
      (select count(*) from public.peopleflow_dev_treinamentos)::text)
    into v_dados_antes;

  -- Triggers de guarda nas tabelas legadas (primeiro, porque dependem das funções novas)
  drop trigger if exists peopleflow_dev_necessidades_pdi_vinculo on public.peopleflow_dev_necessidades;
  drop trigger if exists peopleflow_dev_necessidades_pdi_decisao on public.peopleflow_dev_necessidades;
  drop trigger if exists peopleflow_dev_pdi_dispensadas_decisao on public.peopleflow_dev_pdi_sugestoes_dispensadas;

  -- Views, depois tabelas (ordem de dependência; DROP TABLE não é bloqueado pelos triggers de exclusão de linhas)
  drop view if exists public.peopleflow_dev_v_pdi_acoes_triagem;
  drop view if exists public.peopleflow_dev_v_pdi_sugestoes;
  drop table if exists public.peopleflow_dev_pdi_sugestao_acoes;
  drop table if exists public.peopleflow_dev_pdi_sugestoes;
  drop table if exists public.peopleflow_dev_pdi_interpretacoes;

  drop function if exists public.peopleflow_dev_pdi_backfill_legado();
  drop function if exists public.peopleflow_dev_pdi_guarda_dispensada_insert();
  drop function if exists public.peopleflow_dev_pdi_guarda_necessidade_insert();
  drop function if exists public.peopleflow_dev_pdi_guarda_necessidade_vinculo();
  drop function if exists public.peopleflow_dev_pdi_sugestao_acoes_guarda();
  drop function if exists public.peopleflow_dev_pdi_sugestoes_propaga();
  drop function if exists public.peopleflow_dev_pdi_sugestoes_guarda();
  drop function if exists public.peopleflow_dev_pdi_interpretacoes_guarda();
  drop function if exists public.peopleflow_dev_pdi_hash_item(text);
  drop function if exists public.peopleflow_dev_pdi_hash_texto(text);
  drop function if exists public.peopleflow_dev_pdi_norm_texto(text);

  -- Conferência: nada da Fase 7 sobrou e nada existente mudou.
  select string_agg(c.relname, ', ') into v_txt from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and (c.relname ~ '^peopleflow_dev_pdi_(sugestoes|sugestao_acoes|interpretacoes)' and c.relname !~ '^peopleflow_dev_pdi_sugestoes_dispensadas'
          or c.relname like 'peopleflow_dev_v_pdi_%');
  if v_txt is not null then raise exception 'REVERSÃO: objetos da Fase 7 ainda existem: %', v_txt; end if;
  select string_agg(p.proname, ', ') into v_txt from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'peopleflow_dev_pdi_%';
  if v_txt is not null then raise exception 'REVERSÃO: funções da Fase 7 ainda existem: %', v_txt; end if;

  select md5(coalesce(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), ';' order by tablename, policyname), ''))
    into v_pol_depois from pg_policies where schemaname = 'public' and left(tablename, 11) = 'peopleflow_';
  select md5(coalesce(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by table_name, ordinal_position), ''))
    into v_col_depois from information_schema.columns where table_schema = 'public' and left(table_name, 11) = 'peopleflow_' and table_name not like 'peopleflow_dev_v_%';
  select md5(
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_necessidades x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.pdi_acao_id) from public.peopleflow_dev_pdi_sugestoes_dispensadas x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_itens x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_acoes x), '') || '#' ||
      (select count(*) from public.peopleflow_dev_auditoria)::text || '#' ||
      (select count(*) from public.peopleflow_dev_treinamentos)::text)
    into v_dados_depois;
  if v_pol_depois is distinct from v_pol_antes or v_col_depois is distinct from v_col_antes or v_dados_depois is distinct from v_dados_antes then
    raise exception 'REVERSÃO: algo existente mudou durante a reversão (não deveria) — nada foi gravado.';
  end if;

  raise notice 'REVERSÃO OK: tabelas, views, funções e guardas da Fase 7 removidos; legado intacto.';
end
$rb$;

select 'REVERSÃO OK — objetos da Fase 7 restantes: '
    || (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace
          and (c.relname ~ '^peopleflow_dev_pdi_(sugestoes|sugestao_acoes|interpretacoes)' and c.relname !~ '^peopleflow_dev_pdi_sugestoes_dispensadas'
               or c.relname like 'peopleflow_dev_v_pdi_%')) as resultado;

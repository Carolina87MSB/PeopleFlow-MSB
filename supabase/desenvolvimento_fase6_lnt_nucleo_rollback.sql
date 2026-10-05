-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 6 (Núcleo da LNT) — REVERSÃO
-- ════════════════════════════════════════════════════════════════════════
-- Remove SOMENTE o que a Fase 6 criou: as 3 tabelas peopleflow_dev_lnt_*,
-- suas políticas, triggers, índices e as 6 funções auxiliares novas.
-- Não toca em nenhum objeto existente (Necessidades, Treinamentos,
-- Habilidades/Requisitos, PDI, AVD ou outros módulos).
-- Cobre as tabelas inteiras, inclusive todos os campos da fotografia da carga
-- (carregada_em e *_na_carga): nenhuma alteração própria foi necessária para eles.
--
-- SEGURANÇA: por padrão a reversão RECUSA remover tabelas que já tenham
-- dados (ciclos, itens ou decisões da LNT), porque os dados se perderiam.
-- Com a LNT em uso, faça antes um backup lógico e só então troque
-- v_permitir_perda para true logo abaixo.
--
-- Um único bloco DO (uma só instrução, atômica). Rodar em Supabase > SQL
-- Editor > New query, colando o arquivo inteiro.
-- ════════════════════════════════════════════════════════════════════════

do $rb$
declare
  v_permitir_perda boolean := false;   -- troque para true SOMENTE se aceitar perder os dados da LNT
  v_n integer := 0;
  v_txt text;
  v_pol_antes text;
  v_col_antes text;
  v_pol_depois text;
  v_col_depois text;
begin
  -- Quanto há de dado nas tabelas LNT (se existirem).
  if to_regclass('public.peopleflow_dev_lnt_ciclos') is not null then v_n := v_n + (select count(*) from public.peopleflow_dev_lnt_ciclos)::integer; end if;
  if to_regclass('public.peopleflow_dev_lnt_itens') is not null then v_n := v_n + (select count(*) from public.peopleflow_dev_lnt_itens)::integer; end if;
  if to_regclass('public.peopleflow_dev_lnt_necessidades') is not null then v_n := v_n + (select count(*) from public.peopleflow_dev_lnt_necessidades)::integer; end if;
  if v_n > 0 and not v_permitir_perda then
    raise exception 'REVERSÃO RECUSADA: as tabelas LNT têm % linha(s). Faça backup e ajuste v_permitir_perda para true se quiser prosseguir.', v_n;
  end if;

  select md5(coalesce(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), ';' order by tablename, policyname), ''))
    into v_pol_antes from pg_policies where schemaname = 'public' and left(tablename, 11) = 'peopleflow_' and tablename not like 'peopleflow_dev_lnt_%';
  select md5(coalesce(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by table_name, ordinal_position), ''))
    into v_col_antes from information_schema.columns where table_schema = 'public' and left(table_name, 11) = 'peopleflow_' and table_name not like 'peopleflow_dev_lnt_%';

  -- Ordem de dependência: necessidades → itens → ciclos (DROP TABLE não é bloqueado pelos triggers de exclusão de linhas).
  drop table if exists public.peopleflow_dev_lnt_necessidades;
  drop table if exists public.peopleflow_dev_lnt_itens;
  drop table if exists public.peopleflow_dev_lnt_ciclos;

  drop function if exists public.peopleflow_dev_lnt_item_visivel(bigint);
  drop function if exists public.peopleflow_dev_lnt_necessidade_visivel(bigint);
  drop function if exists public.peopleflow_dev_lnt_necessidades_guarda();
  drop function if exists public.peopleflow_dev_lnt_itens_guarda();
  drop function if exists public.peopleflow_dev_lnt_ciclo_guarda();
  drop function if exists public.peopleflow_dev_lnt_direcionadores_validos(text[]);

  -- Conferência: nada da Fase 6 sobrou e nada existente mudou.
  select string_agg(c.relname, ', ') into v_txt from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname like 'peopleflow_dev_lnt_%';
  if v_txt is not null then raise exception 'REVERSÃO: objetos LNT ainda existem: %', v_txt; end if;
  select string_agg(p.proname, ', ') into v_txt from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'peopleflow_dev_lnt_%';
  if v_txt is not null then raise exception 'REVERSÃO: funções LNT ainda existem: %', v_txt; end if;

  select md5(coalesce(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), ';' order by tablename, policyname), ''))
    into v_pol_depois from pg_policies where schemaname = 'public' and left(tablename, 11) = 'peopleflow_' and tablename not like 'peopleflow_dev_lnt_%';
  select md5(coalesce(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by table_name, ordinal_position), ''))
    into v_col_depois from information_schema.columns where table_schema = 'public' and left(table_name, 11) = 'peopleflow_' and table_name not like 'peopleflow_dev_lnt_%';
  if v_pol_depois is distinct from v_pol_antes or v_col_depois is distinct from v_col_antes then
    raise exception 'REVERSÃO: algo existente mudou durante a reversão (não deveria) — nada foi gravado.';
  end if;

  raise notice 'REVERSÃO OK: tabelas e funções da Fase 6 removidas.';
end
$rb$;

select 'REVERSÃO OK — objetos LNT restantes: '
    || (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname like 'peopleflow_dev_lnt_%') as resultado;

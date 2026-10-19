-- VALIDAÇÃO (SOMENTE LEITURA) de supabase/desligamentos_financeiro.sql — rode depois da migration (e durante a conferência do RH). Não grava nada.
-- Resultado: uma linha por verificação, com "OK" ou "FALHA".
with checagens as (
  select 'rubricas: colunas de validação da rescisão e da GRRF' as verificacao,
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_rescisoes_historico_rubricas'
            and column_name in ('rescisao_status', 'rescisao_valor_validado', 'rescisao_decisao', 'grrf_status', 'grrf_deposito', 'grrf_multa', 'grrf_total', 'grrf_fonte', 'modalidade_confirmada', 'zero_conferido_em')) = 10 as ok
  union all select 'fechamentos: colunas origem e validação', (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_desligamentos' and column_name in ('origem', 'rescisao_historico_id', 'validado_em', 'validado_por')) = 4
  union all select 'constraints de consistência (rescisão, GRRF, modalidade, origem)', (select count(*) from pg_constraint where conname in
      ('peopleflow_rubricas_rescisao_status_chk', 'peopleflow_rubricas_grrf_status_chk', 'peopleflow_rubricas_modalidade_chk', 'peopleflow_desligamentos_origem_chk') and convalidated) = 4
  union all select 'trigger: valores importados da folha imutáveis / conversão sem validação', exists (select 1 from pg_trigger where tgname = 'peopleflow_rubricas_guard' and not tgisinternal)
  union all select 'trilha somente inserção (trigger)', exists (select 1 from pg_trigger where tgname = 'peopleflow_fechamentos_log_guard' and not tgisinternal)
  union all select 'trilha: RLS ligada e sem acesso para anon/authenticated', (select relrowsecurity from pg_class where oid = 'public.peopleflow_fechamentos_log'::regclass)
         and not has_table_privilege('authenticated', 'public.peopleflow_fechamentos_log', 'select') and not has_table_privilege('anon', 'public.peopleflow_fechamentos_log', 'select')
  union all select 'rubricas: continuam só-servidor', not has_table_privilege('authenticated', 'public.peopleflow_rescisoes_historico_rubricas', 'select')
  union all select 'nenhuma conversão de estágio com validação financeira', not exists (
      select 1 from public.peopleflow_rescisoes_historico_rubricas r join public.peopleflow_rescisoes_historico h on h.id = r.rescisao_id
       where h.natureza = 'conversao_estagio_clt' and (r.rescisao_status <> 'proposto' or r.grrf_status <> 'pendente'))
  union all select '24 rubricas preservadas (valores importados)', (select count(*) from public.peopleflow_rescisoes_historico_rubricas) = 24
  union all select 'totais importados da folha inalterados (líquido 96.110,58 · FGTS rescisório 24.196,05)', (select round(sum(liquido), 2) from public.peopleflow_rescisoes_historico_rubricas) = 96110.58
         and (select round(sum(fgts_rescisorio), 2) from public.peopleflow_rescisoes_historico_rubricas) = 24196.05
  union all select 'validados têm responsável, data e valor (rescisão e GRRF)', not exists (
      select 1 from public.peopleflow_rescisoes_historico_rubricas where (rescisao_status = 'validado' and (rescisao_validada_por is null or rescisao_validada_em is null or rescisao_valor_validado is null))
         or (grrf_status = 'validado' and (grrf_validada_por is null or grrf_validada_em is null or grrf_total is null or grrf_fonte is null)))
)
select verificacao, case when ok then 'OK' else 'FALHA' end as resultado from checagens
union all
select 'RESUMO: ' || count(*) filter (where ok) || ' ok, ' || count(*) filter (where not ok) || ' falha(s)', case when count(*) filter (where not ok) = 0 then 'OK' else 'FALHA' end from checagens
order by 2 desc, 1;

-- Informativo: andamento da conferência
select count(*) filter (where rescisao_status = 'validado') as rescisoes_validadas,
       count(*) filter (where grrf_status in ('validado', 'nao_aplicavel')) as grrf_resolvidas,
       count(*) as total_rubricas
  from public.peopleflow_rescisoes_historico_rubricas;

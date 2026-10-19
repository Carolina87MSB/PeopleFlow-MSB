-- VALIDAÇÃO FINAL (SOMENTE LEITURA) de supabase/desligamentos_financeiro_fechar_acesso.sql — rode depois da migration. Não grava nada.
-- Resultado: uma linha por verificação, com "OK" ou "FALHA".
with checagens as (
  select 'authenticated não lê nem grava peopleflow_desligamentos' as verificacao,
         not has_table_privilege('authenticated', 'public.peopleflow_desligamentos', 'select') and not has_table_privilege('authenticated', 'public.peopleflow_desligamentos', 'insert')
         and not has_table_privilege('authenticated', 'public.peopleflow_desligamentos', 'update') and not has_table_privilege('authenticated', 'public.peopleflow_desligamentos', 'delete') as ok
  union all select 'anon não lê nem grava peopleflow_desligamentos',
         not has_table_privilege('anon', 'public.peopleflow_desligamentos', 'select') and not has_table_privilege('anon', 'public.peopleflow_desligamentos', 'insert')
         and not has_table_privilege('anon', 'public.peopleflow_desligamentos', 'update') and not has_table_privilege('anon', 'public.peopleflow_desligamentos', 'delete')
  union all select 'nenhuma política resta na tabela e a RLS segue ligada',
         not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'peopleflow_desligamentos')
         and (select relrowsecurity from pg_class where oid = 'public.peopleflow_desligamentos'::regclass)
  union all select 'o servidor (service_role) segue com acesso total (RH continua vendo e registrando pelo servidor)',
         has_table_privilege('service_role', 'public.peopleflow_desligamentos', 'select') and has_table_privilege('service_role', 'public.peopleflow_desligamentos', 'insert')
         and has_table_privilege('service_role', 'public.peopleflow_desligamentos', 'update')
  union all select 'rubricas e trilha continuam só-servidor',
         not has_table_privilege('authenticated', 'public.peopleflow_rescisoes_historico_rubricas', 'select') and not has_table_privilege('authenticated', 'public.peopleflow_fechamentos_log', 'select')
         and not has_table_privilege('anon', 'public.peopleflow_rescisoes_historico_rubricas', 'select') and not has_table_privilege('anon', 'public.peopleflow_fechamentos_log', 'select')
  union all select 'constraints de validação intactas (origem informado_rh aceita; responsável, data e consistência exigidos)',
         exists (select 1 from pg_constraint where conname = 'peopleflow_desligamentos_validacao_chk' and conrelid = 'public.peopleflow_desligamentos'::regclass and convalidated
                  and pg_get_constraintdef(oid) like '%informado_rh%' and pg_get_constraintdef(oid) like '%rescisao_validada_por%' and pg_get_constraintdef(oid) like '%grrf_validada_por%')
         and exists (select 1 from pg_constraint where conname = 'peopleflow_rubricas_grrf_status_chk' and conrelid = 'public.peopleflow_rescisoes_historico_rubricas'::regclass and convalidated)
  union all select 'trilha segue somente inserção (trigger)', exists (select 1 from pg_trigger where tgname = 'peopleflow_fechamentos_log_guard' and not tgisinternal)
  union all select '24 rubricas preservadas e totais importados inalterados (líquido 96.110,58 · FGTS rescisório 24.196,05)',
         (select count(*) from public.peopleflow_rescisoes_historico_rubricas) = 24
         and (select round(sum(liquido), 2) from public.peopleflow_rescisoes_historico_rubricas) = 96110.58
         and (select round(sum(fgts_rescisorio), 2) from public.peopleflow_rescisoes_historico_rubricas) = 24196.05
  union all select 'líquidos validados preservados (mínimo de 19), com responsável, data e valor',
         (select count(*) from public.peopleflow_rescisoes_historico_rubricas where rescisao_status = 'validado') >= 19
         and not exists (select 1 from public.peopleflow_rescisoes_historico_rubricas where rescisao_status = 'validado'
                           and (rescisao_validada_por is null or btrim(rescisao_validada_por) = '' or rescisao_validada_em is null or rescisao_valor_validado is null))
  union all select 'fechamentos preservados (mínimo de 7)', (select count(*) from public.peopleflow_desligamentos) >= 7
  union all select 'trilha de auditoria preservada (mínimo de 19 linhas de validar_rescisao), toda com responsável',
         (select count(*) from public.peopleflow_fechamentos_log where acao = 'validar_rescisao') >= 19
         and not exists (select 1 from public.peopleflow_fechamentos_log where por is null or btrim(por) = '')
)
select verificacao, case when ok then 'OK' else 'FALHA' end as resultado from checagens
union all
select 'RESUMO: ' || count(*) filter (where ok) || ' ok, ' || count(*) filter (where not ok) || ' falha(s)', case when count(*) filter (where not ok) = 0 then 'OK' else 'FALHA' end from checagens
order by 2 desc, 1;

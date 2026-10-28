-- ════════════════════════════════════════════════════════════════════════
-- Validação (SOMENTE LEITURA) — Habilitação de Responsáveis por Treinamentos, Etapa 1
-- Rodar em Supabase > SQL Editor DEPOIS de aplicar supabase/desenvolvimento_habilitacao_responsaveis.sql. Não altera nada.
-- Cada linha deve retornar ok = true.
-- ════════════════════════════════════════════════════════════════════════
select 'colunas novas em responsaveis_gestao' as verificacao,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_dev_responsaveis_gestao'
          and column_name in ('situacao', 'origem', 'departamento', 'habilitado_em', 'habilitado_por', 'recusado_em', 'recusado_por', 'recusado_motivo')) = 8 as ok
union all select 'regras por situação (6 verificações)',
       (select count(*) from pg_constraint where conrelid = 'public.peopleflow_dev_responsaveis_gestao'::regclass and conname like 'peopleflow_dev_resp_gestao_%_chk') = 6
union all select 'ativo coerente com a situação em todas as linhas',
       not exists (select 1 from public.peopleflow_dev_responsaveis_gestao where ativo is distinct from (situacao = 'habilitada'))
union all select 'no máximo uma habilitação ativa por colaborador',
       not exists (select 1 from public.peopleflow_dev_responsaveis_gestao where situacao = 'habilitada' group by colaborador_id having count(*) > 1)
union all select 'trigger de regras e bloqueios de exclusão presentes em responsaveis_gestao',
       (select count(*) from pg_trigger where tgrelid = 'public.peopleflow_dev_responsaveis_gestao'::regclass and not tgisinternal
          and tgname in ('peopleflow_dev_responsaveis_gestao_regras', 'peopleflow_dev_responsaveis_gestao_sem_delete', 'peopleflow_dev_responsaveis_gestao_sem_truncate')) = 3
union all select 'tabela de transferências com RLS, só leitura para o RH e imutável',
       (select relrowsecurity from pg_class where oid = 'public.peopleflow_dev_transferencias_responsabilidade'::regclass)
       and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'peopleflow_dev_transferencias_responsabilidade' and policyname = 'dev_transf_resp_rh')
       and (select count(*) from pg_trigger where tgrelid = 'public.peopleflow_dev_transferencias_responsabilidade'::regclass and not tgisinternal) = 3
       and not has_table_privilege('authenticated', 'public.peopleflow_dev_transferencias_responsabilidade', 'insert')
       and not has_table_privilege('anon', 'public.peopleflow_dev_transferencias_responsabilidade', 'select')
union all select 'funções novas existem e não são executáveis por anon',
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('peopleflow_dev_habilitado_agora', 'peopleflow_dev_instrutor_de', 'peopleflow_dev_treinamento_gestao_visivel')) = 3
       and not has_function_privilege('anon', 'public.peopleflow_dev_instrutor_de(bigint)', 'execute')
       and has_function_privilege('authenticated', 'public.peopleflow_dev_instrutor_de(bigint)', 'execute')
union all select 'políticas de leitura usam a visão de gestão (evidências e vínculos) e a do instrutor (turma)',
       exists (select 1 from pg_policies where tablename = 'peopleflow_dev_evidencias' and policyname = 'dev_evidencias_leitura' and qual like '%treinamento_gestao_visivel%')
       and exists (select 1 from pg_policies where tablename = 'peopleflow_dev_treinamento_necessidades' and policyname = 'dev_trein_nec_leitura' and qual like '%treinamento_gestao_visivel%')
       and exists (select 1 from pg_policies where tablename = 'peopleflow_dev_participantes' and policyname = 'dev_participantes_leitura' and qual like '%instrutor_de%')
union all select 'o navegador continua sem permissão de gravação em responsaveis_gestao',
       not has_table_privilege('authenticated', 'public.peopleflow_dev_responsaveis_gestao', 'select')
       and not has_table_privilege('authenticated', 'public.peopleflow_dev_responsaveis_gestao', 'insert');
-- Contagens: devem coincidir com a pré-checagem (a migration não altera treinamentos, participantes, evidências nem auditoria).
select 'treinamentos' as tabela, count(*) as linhas from public.peopleflow_dev_treinamentos
union all select 'participantes', count(*) from public.peopleflow_dev_participantes
union all select 'evidencias', count(*) from public.peopleflow_dev_evidencias
union all select 'auditoria', count(*) from public.peopleflow_dev_auditoria
union all select 'responsaveis_gestao', count(*) from public.peopleflow_dev_responsaveis_gestao
union all select 'transferencias_responsabilidade', count(*) from public.peopleflow_dev_transferencias_responsabilidade;

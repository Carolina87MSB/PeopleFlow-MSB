-- ════════════════════════════════════════════════════════════════════════
-- Validação (SOMENTE LEITURA) — Habilitação de Responsáveis por Treinamentos
-- Rodar em Supabase > SQL Editor DEPOIS de aplicar supabase/desenvolvimento_habilitacao_responsaveis.sql. Não altera nada.
-- Cada linha deve retornar ok = true.
-- ════════════════════════════════════════════════════════════════════════
select 'colunas novas em responsaveis_gestao (situacao, departamento, referencia, habilitado_em, habilitado_por)' as verificacao,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_dev_responsaveis_gestao'
          and column_name in ('situacao', 'departamento', 'referencia', 'habilitado_em', 'habilitado_por')) = 5 as ok
union all select 'regras por situação (4 verificações)',
       (select count(*) from pg_constraint where conrelid = 'public.peopleflow_dev_responsaveis_gestao'::regclass and conname like 'peopleflow_dev_resp_gestao_%_chk') = 4
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
union all select 'colunas de ausência em participantes (8) e suas 3 verificações',
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_dev_participantes'
          and column_name in ('ausencia_justificativa', 'ausencia_encaminhamento', 'reposicao_prevista_em', 'ausencia_atualizada_em', 'ausencia_atualizada_por', 'dispensado_em', 'dispensado_por', 'dispensa_justificativa')) = 8
       and (select count(*) from pg_constraint where conrelid = 'public.peopleflow_dev_participantes'::regclass and conname in ('peopleflow_dev_part_ausencia_enc_chk', 'peopleflow_dev_part_dispensa_chk', 'peopleflow_dev_part_reposicao_data_chk')) = 3
union all select 'ausências existentes não foram tocadas (colunas novas vazias em todas as linhas)',
       not exists (select 1 from public.peopleflow_dev_participantes where ausencia_justificativa is not null or ausencia_encaminhamento is not null or reposicao_prevista_em is not null or dispensado_em is not null)
union all select 'função de leitura nova (gere_treinamento usa a habilitação) e função habilitado_agora presentes',
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'peopleflow_dev_habilitado_agora')
       and (select pg_get_functiondef('public.peopleflow_dev_gere_treinamento(bigint)'::regprocedure)) like '%peopleflow_dev_habilitado_agora%'
       and not has_function_privilege('anon', 'public.peopleflow_dev_habilitado_agora()', 'execute')
       and has_function_privilege('authenticated', 'public.peopleflow_dev_habilitado_agora()', 'execute')
union all select 'o navegador continua sem permissão de gravação em habilitações (só o servidor)',
       not has_table_privilege('authenticated', 'public.peopleflow_dev_responsaveis_gestao', 'select')
       and not has_table_privilege('authenticated', 'public.peopleflow_dev_responsaveis_gestao', 'insert');
-- Contagens: devem coincidir com a pré-checagem (a migration não altera treinamentos, participantes, evidências nem auditoria).
select 'treinamentos' as tabela, count(*) as linhas from public.peopleflow_dev_treinamentos
union all select 'participantes', count(*) from public.peopleflow_dev_participantes
union all select 'evidencias', count(*) from public.peopleflow_dev_evidencias
union all select 'auditoria', count(*) from public.peopleflow_dev_auditoria
union all select 'responsaveis_gestao', count(*) from public.peopleflow_dev_responsaveis_gestao
union all select 'transferencias_responsabilidade', count(*) from public.peopleflow_dev_transferencias_responsabilidade;

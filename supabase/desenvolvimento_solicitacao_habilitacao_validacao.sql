-- ════════════════════════════════════════════════════════════════════════
-- Validação (SOMENTE LEITURA) — Gestor autorizado + solicitação de habilitação
-- Rodar em Supabase > SQL Editor DEPOIS de aplicar supabase/desenvolvimento_solicitacao_habilitacao.sql. Não altera nada.
-- É UMA consulta só: copie a tabela inteira de volta. Linhas 'verificação': todas com ok = true. Linhas 'contagem': iguais às da pré-checagem.
-- ════════════════════════════════════════════════════════════════════════
with v as (
select 'tabela de solicitações existe com RLS ligada' as verificacao,
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.peopleflow_dev_habilitacao_solicitacoes')), false) as ok
union all select 'leitura: uma política (RH lê tudo, o solicitante lê as próprias)',
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'peopleflow_dev_habilitacao_solicitacoes' and policyname = 'dev_hab_solic_leitura') = 1
union all select 'o navegador não grava (sem insert/update/delete para authenticated e sem acesso para anon)',
       not has_table_privilege('authenticated', 'public.peopleflow_dev_habilitacao_solicitacoes', 'insert')
       and not has_table_privilege('authenticated', 'public.peopleflow_dev_habilitacao_solicitacoes', 'update')
       and not has_table_privilege('authenticated', 'public.peopleflow_dev_habilitacao_solicitacoes', 'delete')
       and not has_table_privilege('anon', 'public.peopleflow_dev_habilitacao_solicitacoes', 'select')
union all select 'gatilhos: regras de transição, sem exclusão e sem truncate',
       (select count(*) from pg_trigger where tgrelid = to_regclass('public.peopleflow_dev_habilitacao_solicitacoes') and not tgisinternal
          and tgname in ('peopleflow_dev_habilitacao_solicitacoes_regras', 'peopleflow_dev_habilitacao_solicitacoes_sem_delete', 'peopleflow_dev_habilitacao_solicitacoes_sem_truncate')) = 3
union all select 'uma solicitação pendente por colaborador (índice único)',
       exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'peopleflow_dev_hab_solic_uma_pendente_uidx')
union all select 'função de leitura nova: Gestor lê também o que tem o responsável principal no escopo',
       (select pg_get_functiondef('public.peopleflow_dev_gere_treinamento(bigint)'::regprocedure)) like '%t.responsavel_colaborador_id)%'
       and (select pg_get_functiondef('public.peopleflow_dev_gere_treinamento(bigint)'::regprocedure)) like '%habilitado_agora%'
       and not has_function_privilege('anon', 'public.peopleflow_dev_gere_treinamento(bigint)', 'execute')
union all select 'solicitações começam vazias',
       not exists (select 1 from public.peopleflow_dev_habilitacao_solicitacoes)
)
select 'verificação' as tipo, verificacao, ok, null::text as detalhe from v
union all select 'contagem', 'treinamentos', null, count(*)::text from public.peopleflow_dev_treinamentos
union all select 'contagem', 'participantes', null, count(*)::text from public.peopleflow_dev_participantes
union all select 'contagem', 'evidencias', null, count(*)::text from public.peopleflow_dev_evidencias
union all select 'contagem', 'habilitacoes (responsaveis_gestao)', null, count(*)::text from public.peopleflow_dev_responsaveis_gestao
union all select 'contagem', 'transferencias de responsabilidade', null, count(*)::text from public.peopleflow_dev_transferencias_responsabilidade
union all select 'contagem', 'auditoria (igual ou maior)', null, count(*)::text from public.peopleflow_dev_auditoria
union all select 'contagem', 'solicitacoes de habilitacao (nova: começa em 0)', null, count(*)::text from public.peopleflow_dev_habilitacao_solicitacoes
order by 1 desc, 2;

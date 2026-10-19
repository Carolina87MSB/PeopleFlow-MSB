-- PRÉ-CHECAGEM (SOMENTE LEITURA) do fechamento do acesso direto a peopleflow_desligamentos — rode ANTES de supabase/desligamentos_financeiro_fechar_acesso.sql.
-- Não grava nada. Mostra quem acessa a tabela hoje e se algum objeto do banco (view, função, política de outra tabela) depende dela.

-- 1) Privilégios e políticas atuais (esperado antes do fechamento: authenticated com acesso e a política authenticated_rw_desligamentos)
select 'privilégio' as tipo, grantee as quem, string_agg(privilege_type, ', ' order by privilege_type) as detalhe
  from information_schema.role_table_grants where table_schema = 'public' and table_name = 'peopleflow_desligamentos' group by grantee
union all
select 'política', policyname, cmd || ' · roles=' || array_to_string(roles, ',') from pg_policies where schemaname = 'public' and tablename = 'peopleflow_desligamentos'
union all
select 'RLS ligada', '', (select relrowsecurity::text from pg_class where oid = 'public.peopleflow_desligamentos'::regclass)
order by 1, 2;

-- 2) Dependentes: views/visões materializadas e funções que citam a tabela. ESPERADO: nenhuma linha.
select 'view' as tipo, schemaname || '.' || viewname as objeto from pg_views where definition ilike '%peopleflow_desligamentos%' and schemaname not in ('pg_catalog', 'information_schema')
union all
select 'view materializada', schemaname || '.' || matviewname from pg_matviews where definition ilike '%peopleflow_desligamentos%'
union all
select 'função', n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname not in ('pg_catalog', 'information_schema') and p.prokind = 'f' and pg_get_functiondef(p.oid) ilike '%peopleflow_desligamentos%'
union all
select 'política de outra tabela', schemaname || '.' || tablename || ' · ' || policyname from pg_policies
 where tablename <> 'peopleflow_desligamentos' and (coalesce(qual, '') ilike '%peopleflow_desligamentos%' or coalesce(with_check, '') ilike '%peopleflow_desligamentos%')
union all
select 'chave estrangeira apontando para a tabela', conrelid::regclass::text from pg_constraint where contype = 'f' and confrelid = 'public.peopleflow_desligamentos'::regclass
union all
select 'publicação (realtime)', pubname from pg_publication_tables where schemaname = 'public' and tablename = 'peopleflow_desligamentos';

-- 3) Estado dos dados que NÃO podem mudar (apenas contagens)
select (select count(*) from public.peopleflow_desligamentos) as fechamentos,
       (select count(*) from public.peopleflow_rescisoes_historico_rubricas) as rubricas,
       (select count(*) from public.peopleflow_rescisoes_historico_rubricas where rescisao_status = 'validado') as liquidos_validados,
       (select round(sum(rescisao_valor_validado), 2) from public.peopleflow_rescisoes_historico_rubricas where rescisao_status = 'validado') as total_validado,
       (select count(*) from public.peopleflow_fechamentos_log) as linhas_de_trilha;

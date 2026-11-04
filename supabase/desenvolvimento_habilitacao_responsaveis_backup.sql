-- ════════════════════════════════════════════════════════════════════════
-- Backup lógico ANTES da migration — Habilitação de Responsáveis por Treinamentos
-- ════════════════════════════════════════════════════════════════════════
-- PROPOSTA — NÃO EXECUTADA. Só rodar com autorização expressa, em Supabase > SQL Editor, ANTES da migration principal.
-- Cria o schema isolado `backup_pre_habilitacao` (fora da API pública: não é exposto pelo PostgREST e ninguém além do dono do banco acessa)
-- com uma CÓPIA de todas as tabelas peopleflow_dev_* de `public` e um registro das definições que a migration vai alterar
-- (funções, políticas, constraints, índices e gatilhos). NÃO altera nenhum objeto nem dado existente.
-- Recusa-se se o schema já existir (para nunca sobrescrever um backup anterior). Transacional.
-- O Storage (arquivos de evidências e listas de presença em PDF) NÃO é tocado pela migration e, portanto, não entra neste backup.
-- Complementa — não substitui — os backups automáticos do Supabase (Database > Backups): confirme lá, antes, que há um backup recente.
-- Para descartar o backup depois da homologação final: drop schema backup_pre_habilitacao cascade;  (somente com autorização).
-- ════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'backup_pre_habilitacao') then
    raise exception 'O schema backup_pre_habilitacao já existe: backup anterior preservado, nada foi feito.';
  end if;
end $$;

create schema backup_pre_habilitacao;
revoke all on schema backup_pre_habilitacao from public, anon, authenticated;

-- 1. Cópia de todas as tabelas do módulo (dados exatamente como estão agora)
create table backup_pre_habilitacao.resumo (
  tabela text primary key,
  linhas bigint not null,
  hash_md5 text not null,
  copiado_em timestamptz not null default now()
);

do $$
declare
  t text;
  n bigint;
  h text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' and table_name like 'peopleflow\_dev\_%'
    order by table_name
  loop
    execute format('create table backup_pre_habilitacao.%I as table public.%I', t, t);
    execute format('select count(*), md5(coalesce(string_agg(to_jsonb(x)::text, ''|'' order by to_jsonb(x)::text), '''')) from backup_pre_habilitacao.%I x', t) into n, h;
    insert into backup_pre_habilitacao.resumo (tabela, linhas, hash_md5) values (t, n, h);
  end loop;
end $$;

-- 2. Definições que a migration altera: para conferir e, se preciso, restaurar à mão
create table backup_pre_habilitacao.definicoes (
  tipo text not null,
  objeto text not null,
  definicao text not null
);

insert into backup_pre_habilitacao.definicoes (tipo, objeto, definicao)
select 'função', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'peopleflow\_dev\_%';

insert into backup_pre_habilitacao.definicoes (tipo, objeto, definicao)
select 'política', tablename || '.' || policyname,
       'create policy ' || policyname || ' on public.' || tablename || ' for ' || cmd || ' to ' || array_to_string(roles, ', ')
       || coalesce(' using (' || qual || ')', '') || coalesce(' with check (' || with_check || ')', '')
from pg_policies where schemaname = 'public' and tablename like 'peopleflow\_dev\_%';

insert into backup_pre_habilitacao.definicoes (tipo, objeto, definicao)
select 'constraint', conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in (to_regclass('public.peopleflow_dev_responsaveis_gestao'), to_regclass('public.peopleflow_dev_participantes'));

insert into backup_pre_habilitacao.definicoes (tipo, objeto, definicao)
select 'índice', tablename || '.' || indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('peopleflow_dev_responsaveis_gestao', 'peopleflow_dev_participantes');

insert into backup_pre_habilitacao.definicoes (tipo, objeto, definicao)
select 'gatilho', tgrelid::regclass::text || '.' || tgname, pg_get_triggerdef(oid)
from pg_trigger
where not tgisinternal and tgrelid in (to_regclass('public.peopleflow_dev_responsaveis_gestao'), to_regclass('public.peopleflow_dev_participantes'));

commit;

-- Conferência (uma consulta só): cada tabela copiada, linhas e hash. Guarde o resultado.
select 'tabela' as tipo, tabela as objeto, linhas::text as valor, hash_md5 as detalhe from backup_pre_habilitacao.resumo
union all select 'definição', tipo, count(*)::text, null from backup_pre_habilitacao.definicoes group by tipo
order by 1, 2;

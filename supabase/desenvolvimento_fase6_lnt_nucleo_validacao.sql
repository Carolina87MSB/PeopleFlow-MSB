-- ════════════════════════════════════════════════════════════════════════
-- Fase 6 (Núcleo da LNT) — CONSULTAS DE VALIDAÇÃO (somente leitura)
-- Rodar DEPOIS da migration. Cada consulta traz o resultado esperado.
-- ════════════════════════════════════════════════════════════════════════

-- V1) As 3 tabelas existem, com RLS ligada e vazias.
-- Esperado: 3 linhas; rls = true; linhas = 0 em todas.
select c.relname as tabela, c.relrowsecurity as rls,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::int as linhas
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('peopleflow_dev_lnt_ciclos', 'peopleflow_dev_lnt_itens', 'peopleflow_dev_lnt_necessidades')
order by c.relname;

-- V2) Políticas: 3, todas de SELECT, para authenticated.
-- Esperado: dev_lnt_ciclos_leitura, dev_lnt_itens_leitura, dev_lnt_necessidades_leitura — cmd = SELECT.
select tablename, policyname, cmd, roles
from pg_policies where schemaname = 'public' and tablename like 'peopleflow_dev_lnt_%' order by tablename;

-- V3) Permissões: navegador só lê; anon nada; service_role escreve.
-- Esperado: authenticated = SELECT apenas (insert/update/delete = false); anon sem SELECT; service_role com tudo (true).
select t.tabela,
       has_table_privilege('authenticated', 'public.' || t.tabela, 'SELECT') as auth_select,
       has_table_privilege('authenticated', 'public.' || t.tabela, 'INSERT') as auth_insert,
       has_table_privilege('authenticated', 'public.' || t.tabela, 'UPDATE') as auth_update,
       has_table_privilege('authenticated', 'public.' || t.tabela, 'DELETE') as auth_delete,
       has_table_privilege('anon', 'public.' || t.tabela, 'SELECT') as anon_select,
       has_table_privilege('service_role', 'public.' || t.tabela, 'INSERT') as service_insert
from (values ('peopleflow_dev_lnt_ciclos'), ('peopleflow_dev_lnt_itens'), ('peopleflow_dev_lnt_necessidades')) as t(tabela);

-- V4) Triggers (sem exclusão física, updated_at e guardas).
-- Esperado: 12 linhas (4 por tabela): *_updated_at, *_sem_delete, *_sem_truncate, *_guarda.
select c.relname as tabela, tg.tgname as trigger
from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
where c.relname like 'peopleflow_dev_lnt_%' and not tg.tgisinternal
order by c.relname, tg.tgname;

-- V5) Regras de unicidade e integridade.
-- Esperado: 8 linhas — 3 unique (peopleflow_dev_lnt_ciclo_ano_uk, peopleflow_dev_lnt_item_ciclo_id_uk, peopleflow_dev_lnt_nec_ciclo_nec_uk)
-- e 5 foreign keys (itens→ciclos; necessidades→ciclos, →necessidades, →treinamentos; e a composta peopleflow_dev_lnt_nec_item_fk em (ciclo_id, item_id)).
select conrelid::regclass::text as tabela, conname, contype
from pg_constraint
where conrelid::regclass::text like 'peopleflow_dev_lnt_%' and contype in ('u', 'f')
order by 1, 2;

-- V6) Checks (decisões, fotografia, direto, fechamento).
-- Esperado: 26 linhas (inclui peopleflow_dev_lnt_nec_descricao_carga_chk; as de coluna sem nome próprio aparecem com nome automático).
select conrelid::regclass::text as tabela, conname
from pg_constraint
where conrelid::regclass::text like 'peopleflow_dev_lnt_%' and contype = 'c'
order by 1, 2;

-- V7) Índices.
-- Esperado: peopleflow_dev_lnt_item_titulo_uidx (único por ciclo, sem diferenciar caixa/espaços), peopleflow_dev_lnt_item_situacao_idx,
-- peopleflow_dev_lnt_nec_decisao_idx, peopleflow_dev_lnt_nec_item_idx, peopleflow_dev_lnt_nec_necessidade_idx (+ os das chaves primárias/únicas). Total: 11.
select tablename, indexname from pg_indexes
where schemaname = 'public' and tablename like 'peopleflow_dev_lnt_%' order by tablename, indexname;

-- V8) Funções novas (6).
-- Esperado: direcionadores_validos, necessidade_visivel, item_visivel, ciclo_guarda, itens_guarda, necessidades_guarda.
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname like 'peopleflow_dev_lnt_%' order by proname;

-- V9) Vocabulário dos direcionadores.
-- Esperado: validos = true; repetido = false; fora_do_vocabulario = false.
select public.peopleflow_dev_lnt_direcionadores_validos(array['risco_qualidade', 'seguranca']) as validos,
       public.peopleflow_dev_lnt_direcionadores_validos(array['seguranca', 'seguranca']) as repetido,
       public.peopleflow_dev_lnt_direcionadores_validos(array['outro']) as fora_do_vocabulario;

-- V10) Nada existente mudou (contagens das tabelas que a Fase 6 só referencia).
-- Esperado: iguais às de antes da migration (necessidades 1, treinamentos 3, auditoria >= 776 — a auditoria cresce com o uso normal).
select (select count(*) from public.peopleflow_dev_necessidades) as necessidades,
       (select count(*) from public.peopleflow_dev_treinamentos) as treinamentos,
       (select count(*) from public.peopleflow_dev_auditoria) as auditoria;

-- V11) Colunas de peopleflow_dev_lnt_necessidades (fotografia da carga em destaque).
-- Esperado (is_nullable = 'NO' conforme abaixo):
--   carregada_em NO (default now()) · status_na_carga NO · descricao_na_carga NO · justificativa_na_carga NO · sugestao_capacitacao_na_carga NO
--   validada_em_na_carga YES · prioridade_na_carga YES · departamento_na_carga YES · alerta_treinamento_id YES
--   mudou_desde_carga_em YES · mudanca_observada YES · created_at NO · updated_at NO
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'peopleflow_dev_lnt_necessidades'
order by ordinal_position;

-- V12) A imutabilidade cobre TODOS os campos da fotografia (a regra do trigger menciona cada coluna).
-- Esperado: 13 linhas, todas protegida = true.
select c.coluna,
       position(c.coluna in lower(pg_get_functiondef('public.peopleflow_dev_lnt_necessidades_guarda()'::regprocedure))) > 0 as protegida
from (values ('ciclo_id'), ('necessidade_id'), ('carregada_em'), ('status_na_carga'), ('validada_em_na_carga'), ('prioridade_na_carga'),
             ('departamento_na_carga'), ('alerta_treinamento_id'), ('descricao_na_carga'), ('justificativa_na_carga'),
             ('sugestao_capacitacao_na_carga'), ('created_at'), ('created_by')) as c(coluna);

-- V13) Contagem de checks da necessidade no ciclo, incluindo o da descrição fotografada.
-- Esperado: peopleflow_dev_lnt_nec_descricao_carga_chk presente (junto de decisao, item, decidida, motivo, status_carga, prioridade_carga, alerta, mudou).
select conname from pg_constraint
where conrelid = 'public.peopleflow_dev_lnt_necessidades'::regclass and contype = 'c' and conname like 'peopleflow_dev_lnt_nec_%' order by 1;

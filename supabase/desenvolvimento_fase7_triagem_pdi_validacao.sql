-- ════════════════════════════════════════════════════════════════════════
-- Fase 7 (Fundação da triagem PDI) — CONSULTAS DE VALIDAÇÃO (somente leitura)
-- Rodar DEPOIS da migration, UMA consulta por vez (selecione o bloco e clique em Run). Cada uma traz o esperado.
-- Nenhuma consulta mostra nome de pessoa: só ids e contagens.
-- ════════════════════════════════════════════════════════════════════════

-- V1) As 3 tabelas existem, com RLS ligada. Execuções = 0 (sem IA nesta fase); sugestões e ações = só o espelho do legado.
-- Esperado: 3 linhas; rls = true; peopleflow_dev_pdi_interpretacoes = 0; as outras duas com o MESMO número (= confirmadas + mantidas).
select c.relname as tabela, c.relrowsecurity as rls,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::int as linhas
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes')
order by c.relname;

-- V2) Políticas: 3, todas de SELECT, para authenticated, restritas ao perfil RH.
-- Esperado: dev_pdi_interpretacoes_leitura, dev_pdi_sugestao_acoes_leitura, dev_pdi_sugestoes_leitura — cmd = SELECT; qual contém meu_perfil() = 'RH'.
select tablename, policyname, cmd, roles, qual
from pg_policies where schemaname = 'public' and tablename like 'peopleflow_dev_pdi_%' and tablename <> 'peopleflow_dev_pdi_sugestoes_dispensadas'
order by tablename;

-- V3) Permissões: navegador só lê; anon nada; servidor escreve nas tabelas.
-- Esperado: auth_select = true; auth_insert/update/delete = false; anon_select = false; service_insert = true (tabelas; as views só leitura).
select t.objeto,
       has_table_privilege('authenticated', 'public.' || t.objeto, 'SELECT') as auth_select,
       has_table_privilege('authenticated', 'public.' || t.objeto, 'INSERT') as auth_insert,
       has_table_privilege('authenticated', 'public.' || t.objeto, 'UPDATE') as auth_update,
       has_table_privilege('authenticated', 'public.' || t.objeto, 'DELETE') as auth_delete,
       has_table_privilege('anon', 'public.' || t.objeto, 'SELECT') as anon_select,
       has_table_privilege('service_role', 'public.' || t.objeto, 'INSERT') as service_insert
from (values ('peopleflow_dev_pdi_interpretacoes'), ('peopleflow_dev_pdi_sugestoes'), ('peopleflow_dev_pdi_sugestao_acoes'),
             ('peopleflow_dev_v_pdi_sugestoes'), ('peopleflow_dev_v_pdi_acoes_triagem')) as t(objeto);

-- V4) Triggers.
-- Esperado: 15 linhas — interpretacoes (4: updated_at, guarda, sem_delete, sem_truncate), sugestoes (5: + propaga),
-- sugestao_acoes (3: guarda, sem_delete, sem_truncate) e, se v_guardas_legado = true, as 3 guardas nas tabelas legadas
-- (peopleflow_dev_necessidades_pdi_vinculo, peopleflow_dev_necessidades_pdi_decisao, peopleflow_dev_pdi_dispensadas_decisao).
select c.relname as tabela, tg.tgname as trigger
from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
where not tg.tgisinternal
  and (c.relname in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes')
       or tg.tgname in ('peopleflow_dev_necessidades_pdi_vinculo', 'peopleflow_dev_necessidades_pdi_decisao', 'peopleflow_dev_pdi_dispensadas_decisao'))
order by c.relname, tg.tgname;

-- V5) Unicidade e integridade: uma ação não pode estar em duas sugestões ATIVAS; uma necessidade só em uma sugestão.
-- Esperado: peopleflow_dev_pdi_sugacao_ativa_uidx (unique parcial: where ativa) e peopleflow_dev_pdi_sug_necessidade_uidx (unique parcial: where necessidade_id is not null),
-- mais peopleflow_dev_pdi_sugacao_uk (sugestao_id, pdi_acao_id) e as chaves estrangeiras (execução, sugestão de origem, PDI, necessidade).
select conrelid::regclass::text as tabela, conname, contype
from pg_constraint where conrelid in ('public.peopleflow_dev_pdi_interpretacoes'::regclass, 'public.peopleflow_dev_pdi_sugestoes'::regclass, 'public.peopleflow_dev_pdi_sugestao_acoes'::regclass)
  and contype in ('u', 'f') order by 1, 2;
select indexname, indexdef from pg_indexes
where schemaname = 'public' and indexname in ('peopleflow_dev_pdi_sugacao_ativa_uidx', 'peopleflow_dev_pdi_sug_necessidade_uidx');

-- V6) Espelho do legado: contagens.
-- Esperado: sugestoes_legado = necessidades com origem PDI + ações mantidas somente no PDI (menos as "não espelháveis", se houver — o aviso da migration diz quantas).
select (select count(*) from public.peopleflow_dev_necessidades where origem = 'pdi' and pdi_acao_id is not null and pdi_item_id is not null) as necessidades_pdi_espelhaveis,
       (select count(*) from public.peopleflow_dev_pdi_sugestoes_dispensadas) as acoes_mantidas_no_pdi,
       (select count(*) from public.peopleflow_dev_pdi_sugestoes where origem_sugestao = 'legado' and estado = 'validada') as sugestoes_validadas_legado,
       (select count(*) from public.peopleflow_dev_pdi_sugestoes where origem_sugestao = 'legado' and estado = 'mantida_no_pdi') as sugestoes_mantidas_legado,
       (select count(*) from public.peopleflow_dev_pdi_sugestoes where origem_sugestao <> 'legado') as sugestoes_novas_deve_ser_0;

-- V7) NADA do legado ficou sem espelho (rodar de novo o backfill se aparecer algo, p. ex. decisão feita na tela antiga depois da migration).
-- Esperado: 0 linhas em cada uma das duas consultas.
select n.id as necessidade_id, n.pdi_acao_id
from public.peopleflow_dev_necessidades n
where n.origem = 'pdi' and n.pdi_acao_id is not null and n.pdi_item_id is not null
  and exists (select 1 from public.peopleflow_pdi_acoes a where a.id = n.pdi_acao_id)
  and not exists (select 1 from public.peopleflow_dev_pdi_sugestoes s where s.necessidade_id = n.id);
select d.pdi_acao_id
from public.peopleflow_dev_pdi_sugestoes_dispensadas d
where exists (select 1 from public.peopleflow_pdi_acoes a where a.id = d.pdi_acao_id)
  and not exists (select 1 from public.peopleflow_dev_pdi_sugestao_acoes sa where sa.pdi_acao_id = d.pdi_acao_id and sa.ativa);

-- V8) Coerência da regra de compatibilidade com a Base.
-- Esperado: 0 linhas em cada consulta.
--  (a) sugestão validada cuja necessidade aponta uma ação que NÃO está entre as ações de origem;
select s.id as sugestao_id, n.id as necessidade_id, n.pdi_acao_id
from public.peopleflow_dev_pdi_sugestoes s join public.peopleflow_dev_necessidades n on n.id = s.necessidade_id
where s.estado = 'validada' and not exists (select 1 from public.peopleflow_dev_pdi_sugestao_acoes sa where sa.sugestao_id = s.id and sa.pdi_acao_id = n.pdi_acao_id);
--  (b) ação em duas sugestões ativas;
select pdi_acao_id, count(*) from public.peopleflow_dev_pdi_sugestao_acoes where ativa group by pdi_acao_id having count(*) > 1;
--  (c) sugestão decidida (validada/mantida) sem nenhuma ação de origem;
select s.id from public.peopleflow_dev_pdi_sugestoes s
where s.estado in ('validada', 'mantida_no_pdi') and not exists (select 1 from public.peopleflow_dev_pdi_sugestao_acoes sa where sa.sugestao_id = s.id);
--  (d) necessidade com origem PDI e ação coberta por sugestão ATIVA diferente da que a vincula (decisão por dois caminhos).
select n.id as necessidade_id, n.pdi_acao_id, s.id as sugestao_id
from public.peopleflow_dev_necessidades n
join public.peopleflow_dev_pdi_sugestao_acoes sa on sa.pdi_acao_id = n.pdi_acao_id and sa.ativa
join public.peopleflow_dev_pdi_sugestoes s on s.id = sa.sugestao_id
where n.origem = 'pdi' and s.necessidade_id is distinct from n.id and s.estado in ('validada', 'mantida_no_pdi');

-- V9) Fotografia x PDI de agora ("origem alterada"). Esperado com dados limpos: 0 em todas as colunas.
-- (Mesma conta da view peopleflow_dev_v_pdi_sugestoes, feita direto nas tabelas: no SQL Editor você é o dono do banco,
--  sem sessão de RH, e a view — de propósito — não devolve linhas para quem não é RH.)
select count(*) filter (where x.alteradas > 0 or x.removidas > 0) as origem_alterada,
       count(*) filter (where (x.alteradas > 0 or x.removidas > 0) and s.estado in ('validada', 'mantida_no_pdi')) as alterada_apos_decisao,
       count(*) filter (where public.peopleflow_dev_pdi_hash_item(s.pdi_item_id) is distinct from s.hash_origem) as contexto_do_item_alterado,
       count(*) as total
from public.peopleflow_dev_pdi_sugestoes s
cross join lateral (
  select count(*) filter (where a.id is not null and public.peopleflow_dev_pdi_hash_texto(a.descricao) <> sa.hash_texto) as alteradas,
         count(*) filter (where a.id is null) as removidas
  from public.peopleflow_dev_pdi_sugestao_acoes sa left join public.peopleflow_pdi_acoes a on a.id = sa.pdi_acao_id
  where sa.sugestao_id = s.id) x;

-- V10) As sugestões espelhadas, sem nome de ninguém (ids e estado). Esperado: 1 linha por decisão do legado.
select s.id as sugestao_id, s.origem_sugestao, s.estado, s.necessidade_id, sa.pdi_acao_id, sa.ativa,
       left(sa.hash_texto, 8) as hash_acao, left(s.hash_origem, 8) as hash_item, s.decidido_em
from public.peopleflow_dev_pdi_sugestoes s join public.peopleflow_dev_pdi_sugestao_acoes sa on sa.sugestao_id = s.id
order by s.id;

-- V11) Funções novas (11) e permissões de execução. Esperado: 11 linhas; o backfill só para service_role.
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'peopleflow_dev_pdi_%' order by 1;

-- V12) (opcional) RLS funcionando como papel — rodar cada bloco SEPARADAMENTE; o resultado é o do ÚLTIMO select.
--   Como RH (troque pelo user_id de um RH com sessão do módulo nas últimas 12 h — ver peopleflow_dev_contas):
--     begin;
--       set local role authenticated;
--       select set_config('request.jwt.claim.sub', '<USER_ID_DO_RH>', true);
--       select (select count(*) from public.peopleflow_dev_pdi_sugestoes) as sugestoes_vistas, (select count(*) from public.peopleflow_dev_v_pdi_sugestoes) as pela_view;
--     rollback;
--   Esperado: igual ao total de V1 (se a sessão do módulo do RH tiver mais de 12 h, vem 0 — é a regra do módulo, não erro).
--   Como Gestor (user_id de um Gestor): esperado 0 e 0.   Como anon (set local role anon): esperado erro "permission denied".

-- V13) Nada existente mudou: totais que devem bater com os anotados ANTES da migration.
-- Anote antes/depois: necessidades, sugestões dispensadas, ações do PDI, linhas da auditoria (a migration não escreve na auditoria).
select (select count(*) from public.peopleflow_dev_necessidades) as necessidades,
       (select count(*) from public.peopleflow_dev_pdi_sugestoes_dispensadas) as sugestoes_dispensadas,
       (select count(*) from public.peopleflow_pdi_acoes) as acoes_pdi,
       (select count(*) from public.peopleflow_dev_auditoria) as auditoria,
       (select max(id) from public.peopleflow_dev_auditoria) as ultimo_evento;

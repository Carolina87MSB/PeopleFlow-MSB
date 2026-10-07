-- ════════════════════════════════════════════════════════════════════════
-- Fase 8A (Fundação de dados da interpretação com IA) — CONSULTAS DE VALIDAÇÃO (somente leitura)
-- Rodar DEPOIS da migration, UMA consulta por vez (selecione o bloco e clique em Run). Cada uma traz o esperado.
-- Nenhuma consulta mostra nome de pessoa nem texto de necessidade: só ids, nomes de objetos e contagens.
-- ════════════════════════════════════════════════════════════════════════

-- V1) Colunas novas: 5, todas texto e NULAS.
-- Esperado: 5 linhas, todas com is_nullable = YES (interpretacoes: observacao_interpretacao, pdi_item_id, resultado_interpretacao; sugestoes: confianca, justificativa_interpretacao).
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'peopleflow_dev_pdi_interpretacoes' and column_name in ('pdi_item_id', 'resultado_interpretacao', 'observacao_interpretacao'))
    or (table_name = 'peopleflow_dev_pdi_sugestoes' and column_name in ('confianca', 'justificativa_interpretacao')))
order by table_name, column_name;

-- V2) Constraints novas: 8.
-- Esperado: 8 linhas — interpretacoes: interp_resultado_chk, interp_obs_chk, interp_item_chk, interp_ia_resultado_chk, interp_ia_itens_chk; sugestoes: sug_confianca_chk, sug_justif_chk, sug_semantica_chk.
select conrelid::regclass::text as tabela, conname, pg_get_constraintdef(oid) as regra
from pg_constraint
where conname in ('peopleflow_dev_pdi_interp_resultado_chk', 'peopleflow_dev_pdi_interp_obs_chk', 'peopleflow_dev_pdi_interp_item_chk',
                  'peopleflow_dev_pdi_interp_ia_resultado_chk', 'peopleflow_dev_pdi_interp_ia_itens_chk',
                  'peopleflow_dev_pdi_sug_confianca_chk', 'peopleflow_dev_pdi_sug_justif_chk', 'peopleflow_dev_pdi_sug_semantica_chk')
order by 1, 2;

-- V3) Travas: 2 índices únicos PARCIAIS.
-- Esperado: peopleflow_dev_pdi_interp_ia_andamento_uidx = UNIQUE (pdi_item_id) WHERE tipo = 'ia' AND status = 'em_andamento'  (no máximo 1 interpretação IA em andamento por item)
--           peopleflow_dev_pdi_sug_ia_neutra_uidx   = UNIQUE (interpretacao_id) WHERE origem_sugestao = 'ia' AND confianca IS NULL (no máximo 1 sugestão neutra por interpretação)
select indexname, indexdef from pg_indexes
where schemaname = 'public' and indexname in ('peopleflow_dev_pdi_interp_ia_andamento_uidx', 'peopleflow_dev_pdi_sug_ia_neutra_uidx') order by 1;

-- V4) Guardas atualizadas (as duas funções).
-- Esperado: 2 linhas, todas as colunas true.
select p.proname,
       p.prosrc like '%imutáveis%' as mantem_imutabilidade_fase7,
       case p.proname when 'peopleflow_dev_pdi_interpretacoes_guarda' then p.prosrc like '%sem cobertura%' and p.prosrc like '%pdi_item_id is distinct from old.pdi_item_id%'
                      else p.prosrc like '%confianca is distinct from old.confianca%' and p.prosrc like '%não confere com o item da interpretação%' end as tem_regras_8a,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') = false and has_function_privilege('anon', p.oid, 'EXECUTE') = false as sem_execucao_para_navegador
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.proname in ('peopleflow_dev_pdi_interpretacoes_guarda', 'peopleflow_dev_pdi_sugestoes_guarda')
order by 1;

-- V5) Triggers: inalterados (a 8A só substitui o corpo das funções).
-- Esperado: 15 linhas — o mesmo da validação V4 da Fase 7 (4 + 5 + 3 nas tabelas novas e 3 guardas nas tabelas legadas).
select c.relname as tabela, tg.tgname as trigger
from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
where not tg.tgisinternal
  and (c.relname in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes')
       or tg.tgname in ('peopleflow_dev_necessidades_pdi_vinculo', 'peopleflow_dev_necessidades_pdi_decisao', 'peopleflow_dev_pdi_dispensadas_decisao'))
order by c.relname, tg.tgname;

-- V6) View: as 4 colunas novas por último, security_invoker ligado, navegador só lê.
-- Esperado: ultimas_4_colunas = confianca,justificativa_interpretacao,resultado_interpretacao,observacao_interpretacao; security_invoker = true; auth_select = true; auth_escrita = false; anon_select = false.
select (select string_agg(a.attname::text, ',' order by a.attnum) from pg_attribute a
         where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
           and a.attnum > (select max(a2.attnum) - 4 from pg_attribute a2 where a2.attrelid = c.oid and a2.attnum > 0 and not a2.attisdropped)) as ultimas_4_colunas,
       coalesce(c.reloptions @> array['security_invoker=true'], false) as security_invoker,
       has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
       (has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE') or has_table_privilege('authenticated', c.oid, 'DELETE')) as auth_escrita,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select
from pg_class c where c.oid = 'public.peopleflow_dev_v_pdi_sugestoes'::regclass;

-- V7) O legado e a regra local NÃO foram tocados: as colunas novas só existem em interpretação IA.
-- Esperado: 0 linhas em cada uma das duas consultas.
select id from public.peopleflow_dev_pdi_interpretacoes
where tipo <> 'ia' and (pdi_item_id is not null or resultado_interpretacao is not null or observacao_interpretacao is not null);
select id from public.peopleflow_dev_pdi_sugestoes
where origem_sugestao <> 'ia' and (confianca is not null or justificativa_interpretacao is not null);

-- V8) Coerência da IA (fica valendo para quando a IA existir). Esperado: 0 linhas em cada consulta (e 0 interpretações IA até a Etapa 8C).
--  (a) interpretação IA concluída sem resultado, ou em andamento/falha com resultado;
select id from public.peopleflow_dev_pdi_interpretacoes
where tipo = 'ia' and ((status = 'concluida') <> (resultado_interpretacao is not null));
--  (b) interpretação IA concluída cujo resultado não bate com as sugestões (1 / 2 ou mais / só neutra) ou com o contador;
select i.id, i.resultado_interpretacao
from public.peopleflow_dev_pdi_interpretacoes i
cross join lateral (select count(*) filter (where s.confianca is not null) as sem, count(*) filter (where s.confianca is null) as neutras, count(*) as total
                      from public.peopleflow_dev_pdi_sugestoes s where s.interpretacao_id = i.id) x
where i.tipo = 'ia' and i.status = 'concluida'
  and (i.sugestoes_geradas <> x.total or x.neutras > 1
       or (i.resultado_interpretacao = 'necessidade_identificada' and x.sem <> 1)
       or (i.resultado_interpretacao = 'multiplas_necessidades' and x.sem < 2)
       or (i.resultado_interpretacao in ('evidencia_insuficiente', 'somente_acao_pdi') and (x.sem <> 0 or x.neutras <> 1)));
--  (c) sugestão IA de um item diferente do da sua interpretação;
select s.id from public.peopleflow_dev_pdi_sugestoes s join public.peopleflow_dev_pdi_interpretacoes i on i.id = s.interpretacao_id
where s.origem_sugestao = 'ia' and s.pdi_item_id is distinct from i.pdi_item_id;
--  (d) duas interpretações IA em andamento para o mesmo item (a trava impede; aqui só confere).
select pdi_item_id, count(*) from public.peopleflow_dev_pdi_interpretacoes where tipo = 'ia' and status = 'em_andamento' group by pdi_item_id having count(*) > 1;

-- V9) Nada existente mudou: totais que devem bater com os anotados ANTES da migration.
-- Anote antes/depois: necessidades, sugestões e ações da Fase 7, interpretações, itens da LNT, ações do PDI, linhas da auditoria (a migration não escreve na auditoria).
select (select count(*) from public.peopleflow_dev_necessidades) as necessidades,
       (select count(*) from public.peopleflow_dev_pdi_sugestoes_dispensadas) as sugestoes_dispensadas,
       (select count(*) from public.peopleflow_dev_pdi_sugestoes) as sugestoes_fase7,
       (select count(*) from public.peopleflow_dev_pdi_sugestao_acoes) as acoes_de_origem,
       (select count(*) from public.peopleflow_dev_pdi_interpretacoes) as interpretacoes,
       (select count(*) from public.peopleflow_dev_pdi_interpretacoes where tipo = 'ia') as interpretacoes_ia_deve_ser_0,
       (select count(*) from public.peopleflow_dev_lnt_itens) as lnt_itens,
       (select count(*) from public.peopleflow_pdi_acoes) as acoes_pdi,
       (select count(*) from public.peopleflow_dev_auditoria) as auditoria,
       (select max(id) from public.peopleflow_dev_auditoria) as ultimo_evento;

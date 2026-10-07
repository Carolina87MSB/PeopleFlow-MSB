// Fase 8A (fundação de dados da interpretação com IA) — testes na RÉPLICA (PGlite com as Fases 1–6 reais + Fase 7 real).
// Nada vai ao banco de produção. Roda: migration, validação, rollback, migration de novo, constraints, imutabilidade,
// trava de concorrência, coerência do fechamento da interpretação, view e preservação de Fase 7 / LNT / PDI / RLS.
//   cd tests && node fase8a/teste_8a.mjs
import { rd, novaReplica, semearPdi, criarContador, U_RH, U_G1 } from "../pdi-triagem/base.mjs";

const C = criarContador();
const { check, secao } = C;

const MIG7 = rd("desenvolvimento_fase7_triagem_pdi.sql");
const MIG8A = rd("desenvolvimento_fase8a_ia_fundacao.sql");
const ROLL8A = rd("desenvolvimento_fase8a_ia_fundacao_rollback.sql");
const VALID8A = rd("desenvolvimento_fase8a_ia_fundacao_validacao.sql");

// ── réplica: Fases 1–6 + PDI + legado "real" (3 necessidades PDI + 2 mantidas no MESMO item) + Fase 7 + 1 execução de regra local ──
async function montar() {
  const R = await novaReplica();
  const { db, um } = R;
  const { p1, p2 } = await semearPdi(R);
  const nec = async (colab, pdi, item, acao, desc) => (await um(`insert into public.peopleflow_dev_necessidades (colaborador_id, origem, pdi_id, pdi_item_id, pdi_acao_id, pdi_item_nome, descricao, justificativa, categoria, prioridade, status, validada_em, validada_por, departamento, solicitado_por_colaborador_id, created_by)
    values (${colab}, 'pdi', ${pdi}, '${item}', '${acao}', 'x', '${desc}', 'PDI', 'comportamental', 'media', 'validada', now() - interval '1 day', '${U_RH}', 'Produção', 1, '${U_RH}') returning id`)).id;
  await nec(3, p1, "I1", "A1", "desenvolver clareza, objetividade e segurança na comunicação");
  await nec(4, p2, "I3", "C1", "assumir a condução de alinhamentos envolvendo temas críticos");
  await nec(4, p2, "I4", "D1", "Reciclagem nos POPs aplicáveis à rotina");
  await db.exec(`insert into public.peopleflow_dev_pdi_sugestoes_dispensadas (pdi_acao_id, pdi_id, motivo, dispensada_por) values ('B1', ${p1}, 'Mantida somente no PDI (sem observação).', '${U_RH}'), ('B2', ${p1}, 'Já acompanhado pelo gestor', '${U_RH}')`);
  await db.query(MIG7.slice(0, MIG7.indexOf("$mig$;", MIG7.indexOf("do $mig$")) + 6));
  // execução de regra local (como a Etapa 1B grava): sugestão pendente com 3 ações, execução encerrada
  const ex = (await um(`insert into public.peopleflow_dev_pdi_interpretacoes (tipo, solicitada_por, solicitada_por_colaborador_id, versao_regra) values ('regra_local', '${U_RH}', 1, 'pdi-item-v1') returning id`)).id;
  const sg = (await um(`insert into public.peopleflow_dev_pdi_sugestoes (interpretacao_id, origem_sugestao, pdi_id, pdi_item_id, texto_sugerido) values (${ex}, 'regra_local', ${p1}, 'I5', 'Comunicar com clareza e segurança.') returning id`)).id;
  for (const a of ["E1", "E2", "E3"]) await db.query(`insert into public.peopleflow_dev_pdi_sugestao_acoes (sugestao_id, pdi_item_id, pdi_acao_id, acao_texto) values (${sg}, 'I5', '${a}', 'x')`);
  await db.query(`update public.peopleflow_dev_pdi_interpretacoes set status = 'concluida', concluida_em = now(), itens_analisados = 1, sugestoes_geradas = 1, hash_conteudo = md5('regra-local') where id = ${ex}`);
  return { R, p1, p2, exLocal: ex, sgLocal: sg };
}

// ── "fotografia" do catálogo e dos dados: para provar o que mudou e o que NÃO mudou ──
const MAPAS = {
  policies: `select tablename || '.' || policyname as k, md5(cmd || coalesce(qual, '') || coalesce(with_check, '')) as v from pg_policies where schemaname = 'public' and tablename like 'peopleflow\\_%'`,
  columns: `select table_name || '.' || column_name as k, md5(data_type || is_nullable || coalesce(column_default, '')) as v from information_schema.columns where table_schema = 'public' and table_name like 'peopleflow\\_%' and table_name not like 'peopleflow\\_dev\\_v\\_%'`,
  constraints: `select conrelid::regclass::text || '.' || conname as k, md5(pg_get_constraintdef(oid)) as v from pg_constraint where connamespace = 'public'::regnamespace and conrelid::regclass::text like '%peopleflow\\_%'`,
  indexes: `select indexname as k, md5(indexdef) as v from pg_indexes where schemaname = 'public' and tablename like 'peopleflow\\_%'`,
  triggers: `select c.relname || '.' || tg.tgname as k, md5(pg_get_triggerdef(tg.oid)) as v from pg_trigger tg join pg_class c on c.oid = tg.tgrelid where not tg.tgisinternal and c.relnamespace = 'public'::regnamespace and c.relname like 'peopleflow\\_%'`,
  functions: `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as k, md5(replace(pg_get_functiondef(p.oid), chr(13), '')) as v from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'peopleflow\\_%'`,
  views: `select c.relname as k, md5(replace(pg_get_viewdef(c.oid), chr(13), '') || coalesce(c.reloptions::text, '')) as v from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' and c.relname like 'peopleflow\\_%'`,
  grants: `select table_name || '.' || grantee || '.' || privilege_type as k, '1' as v from information_schema.table_privileges where table_schema = 'public' and table_name like 'peopleflow\\_%' and grantee in ('anon', 'authenticated', 'service_role')`,
  fnprivs: `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as k, md5(has_function_privilege('anon', p.oid, 'EXECUTE')::text || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || has_function_privilege('service_role', p.oid, 'EXECUTE')::text) as v from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'peopleflow\\_%'`,
};
const NOVAS_INTERP = ["pdi_item_id", "resultado_interpretacao", "observacao_interpretacao"];
const NOVAS_SUG = ["confianca", "justificativa_interpretacao"];
const DADOS = `select md5(
  coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_necessidades x), '') || '#' ||
  coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.pdi_acao_id) from public.peopleflow_dev_pdi_sugestoes_dispensadas x), '') || '#' ||
  coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi x), '') || '#' ||
  coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_itens x), '') || '#' ||
  coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_acoes x), '') || '#' ||
  coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_lnt_ciclos x), '') || '#' ||
  coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_lnt_itens x), '') || '#' ||
  coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.item_id, x.necessidade_id) from public.peopleflow_dev_lnt_necessidades x), '') || '#' ||
  coalesce((select string_agg((to_jsonb(x) - array['pdi_item_id', 'resultado_interpretacao', 'observacao_interpretacao'])::text, '|' order by x.id) from public.peopleflow_dev_pdi_interpretacoes x), '') || '#' ||
  coalesce((select string_agg((to_jsonb(x) - array['confianca', 'justificativa_interpretacao'])::text, '|' order by x.id) from public.peopleflow_dev_pdi_sugestoes x), '') || '#' ||
  coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_pdi_sugestao_acoes x), '') || '#' ||
  (select count(*) from public.peopleflow_dev_auditoria)::text) as h`;

async function foto(R) {
  const f = {};
  for (const [nome, q] of Object.entries(MAPAS)) f[nome] = Object.fromEntries((await R.sql(q)).map((r) => [r.k, r.v]));
  f.dados = (await R.um(DADOS)).h;
  return f;
}
const comparar = (a, b) => {
  const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
  const r = { adicionadas: [], removidas: [], alteradas: [] };
  for (const k of [...chaves].sort()) {
    if (!(k in a)) r.adicionadas.push(k);
    else if (!(k in b)) r.removidas.push(k);
    else if (a[k] !== b[k]) r.alteradas.push(k);
  }
  return r;
};
const igual = (r) => r.adicionadas.length === 0 && r.removidas.length === 0 && r.alteradas.length === 0;
const nomesMapa = Object.keys(MAPAS);
const fotoIgual = (a, b, ignorar = []) => nomesMapa.filter((n) => !ignorar.includes(n)).every((n) => igual(comparar(a[n], b[n]))) && a.dados === b.dados;
const resumoDif = (a, b) => nomesMapa.map((n) => [n, comparar(a[n], b[n])]).filter(([, r]) => !igual(r)).map(([n, r]) => `${n}: +${r.adicionadas.length} -${r.removidas.length} ~${r.alteradas.length}`).join("; ") || "(sem diferença)";

async function rodar(R, texto) {
  try { return { ok: true, res: await R.db.exec(texto) }; } catch (e) { return { ok: false, msg: String(e.message ?? e) }; }
}
const codigo = (e) => e?.code ?? "";
// só para provar que a CONSTRAINT também protege quando a guarda (trigger) for contornada — réplica apenas
async function semGuarda(fn) {
  await db.exec("set session_replication_role = replica");
  try { await fn(); return null; } catch (e) { return e; } finally { await db.exec("set session_replication_role = origin"); }
}
const msg = (e) => String(e?.message ?? "");

// ═══════════════════════════════════════════════════════════════════
// RÉPLICA 1 — migration, constraints, imutabilidade, trava, fechamento, view, dados de IA, rollback RECUSADO
// ═══════════════════════════════════════════════════════════════════
secao("1. Migration da 8A sobre a Fase 7 (réplica com legado real + regra local)");
const { R, p1, exLocal, sgLocal } = await montar();
const { db, sql, um, como, erro } = R;

const antes = await foto(R);
const viewAntigaSql = `select id, interpretacao_id, origem_sugestao, derivada_de_id, pdi_id, pdi_item_id, item_competencia_nome, item_tipo_competencia, item_objetivo, hash_origem, texto_sugerido, tema, categoria_sugerida, estado, texto_final, editada, decidido_por, decidido_em, motivo_decisao, necessidade_id, created_at, acoes_total, acoes_alteradas, acoes_removidas, origem_alterada, contexto_do_item_alterado, origem_alterada_apos_decisao, estado_exibicao from public.peopleflow_dev_v_pdi_sugestoes order by id`;
const viewAntes = await como("authenticated", U_RH, async () => (await db.query(viewAntigaSql)).rows);
const nSugAntes = Number((await um(`select count(*) n from public.peopleflow_dev_pdi_sugestoes`)).n);
check("pré-condição: 5 sugestões legado espelhadas + 1 de regra local (view devolve 6 ao RH)", viewAntes.length === 6 && nSugAntes === 6 && viewAntes.filter((v) => v.origem_sugestao === "legado").length === 5);

const m1 = await rodar(R, MIG8A);
check("migration 8A roda inteira sem erro (pré-voo, alterações e pós-voo)", m1.ok, m1.msg);
const depois = await foto(R);

check("políticas (RLS) de TODAS as tabelas: idênticas", igual(comparar(antes.policies, depois.policies)));
check("privilégios de tabelas/views e de funções: idênticos", igual(comparar(antes.grants, depois.grants)) && igual(comparar(antes.fnprivs, depois.fnprivs)));
check("triggers: mesmos (a 8A só troca o corpo de 2 funções; nenhum trigger criado/removido)", igual(comparar(antes.triggers, depois.triggers)));
const cCols = comparar(antes.columns, depois.columns);
check("colunas: SOMENTE as 5 novas foram acrescentadas (nenhuma outra tabela/coluna mudou)", cCols.removidas.length === 0 && cCols.alteradas.length === 0 && cCols.adicionadas.length === 5
  && cCols.adicionadas.every((k) => NOVAS_INTERP.map((c) => "peopleflow_dev_pdi_interpretacoes." + c).concat(NOVAS_SUG.map((c) => "peopleflow_dev_pdi_sugestoes." + c)).includes(k)), JSON.stringify(cCols));
const cCon = comparar(antes.constraints, depois.constraints);
check("constraints: +8 novas, nenhuma removida/alterada", cCon.adicionadas.length === 8 && cCon.removidas.length === 0 && cCon.alteradas.length === 0, JSON.stringify(cCon));
const cIdx = comparar(antes.indexes, depois.indexes);
check("índices: +2 (as duas travas), nenhum removido/alterado", cIdx.adicionadas.sort().join() === "peopleflow_dev_pdi_interp_ia_andamento_uidx,peopleflow_dev_pdi_sug_ia_neutra_uidx" && cIdx.removidas.length === 0 && cIdx.alteradas.length === 0);
const cFn = comparar(antes.functions, depois.functions);
check("funções: SOMENTE as 2 guardas foram substituídas; nenhuma criada/removida", cFn.adicionadas.length === 0 && cFn.removidas.length === 0 && cFn.alteradas.sort().join() === "peopleflow_dev_pdi_interpretacoes_guarda(),peopleflow_dev_pdi_sugestoes_guarda()", JSON.stringify(cFn));
const cVw = comparar(antes.views, depois.views);
check("views: SOMENTE peopleflow_dev_v_pdi_sugestoes mudou (a de triagem das ações ficou idêntica)", cVw.alteradas.join() === "peopleflow_dev_v_pdi_sugestoes" && cVw.adicionadas.length === 0 && cVw.removidas.length === 0);
check("dados: TODAS as linhas existentes idênticas (necessidades, dispensadas, PDI, itens, ações, LNT, Fase 7, auditoria)", antes.dados === depois.dados);
const nulas = await um(`select (select count(*) from public.peopleflow_dev_pdi_interpretacoes where pdi_item_id is not null or resultado_interpretacao is not null or observacao_interpretacao is not null)::int a, (select count(*) from public.peopleflow_dev_pdi_sugestoes where confianca is not null or justificativa_interpretacao is not null)::int b`);
check("linhas legadas e de regra local: colunas novas NULAS", nulas.a === 0 && nulas.b === 0);
const viewDepoisVelha = await como("authenticated", U_RH, async () => (await db.query(viewAntigaSql)).rows);
check("view: as colunas antigas devolvem EXATAMENTE as mesmas linhas de antes (consumidores da 1B)", JSON.stringify(viewAntes) === JSON.stringify(viewDepoisVelha));
const viewNova = await como("authenticated", U_RH, async () => (await db.query(`select confianca, justificativa_interpretacao, resultado_interpretacao, observacao_interpretacao from public.peopleflow_dev_v_pdi_sugestoes`)).rows);
check("view: 4 colunas novas, todas nulas para o legado/regra local", viewNova.length === 6 && viewNova.every((r) => Object.values(r).every((x) => x === null)));
check("view: Gestor continua sem ver nada e anon sem permissão", (await como("authenticated", U_G1, async () => (await db.query(`select count(*)::int n from public.peopleflow_dev_v_pdi_sugestoes`)).rows[0].n)) === 0
  && Boolean(await erro(() => como("anon", null, () => db.query(`select 1 from public.peopleflow_dev_v_pdi_sugestoes`)))));
const m1b = await rodar(R, MIG8A);
check("segunda execução da migration → PRE-FLIGHT recusa ('já existe'), nada muda", !m1b.ok && /PRE-FLIGHT: já existe/.test(m1b.msg) && fotoIgual(depois, await foto(R)));

// ── dados de teste da IA ──
const itens = [
  ["T1", [["T1a", "ação a do item 1"], ["T1b", "ação b do item 1"]]],
  ["T2", [["T2a", "ação a do item 2"], ["T2b", "ação b do item 2"], ["T2c", "ação c do item 2"]]],
  ["T3", [["T3a", "ação única do item 3"]]],
  ["T4", [["T4a", "ação única do item 4"]]],
  ["T5", [["T5a", "ação a do item 5"], ["T5b", "ação b do item 5"]]],
  ["T6", [["T6a", "ação a do item 6"], ["T6b", "ação b do item 6"]]],
  ["T7", [["T7a", "ação única do item 7"]]],
  ["T8", [["T8a", "ação a do item 8"], ["T8b", "ação b do item 8"]]],
];
for (const [id, acoes] of itens) {
  await db.query(`insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento) values ($1, ${p1}, 'Competência ' || $1, 'Comportamental', 'Objetivo do item ' || $1)`, [id]);
  let ordem = 1;
  for (const [aid, desc] of acoes) await db.query(`insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) values ($1, $2, $3, 'Pendente', ${ordem++})`, [aid, id, desc]);
}
const interp = async (item) => (await um(`insert into public.peopleflow_dev_pdi_interpretacoes (tipo, solicitada_por, solicitada_por_colaborador_id, provedor, modelo, versao_prompt, pdi_item_id) values ('ia', '${U_RH}', 1, 'anthropic', 'modelo-de-teste', 'pdi-ia-v1', $1) returning id`, [item])).id;
const sugestao = async (interpId, item, texto, conf = null, just = null, tema = null) =>
  (await um(`insert into public.peopleflow_dev_pdi_sugestoes (interpretacao_id, origem_sugestao, pdi_id, pdi_item_id, texto_sugerido, tema, confianca, justificativa_interpretacao) values ($1, 'ia', ${p1}, $2, $3, $4, $5, $6) returning id`, [interpId, item, texto, tema, conf, just])).id;
const acao = (sug, item, a) => db.query(`insert into public.peopleflow_dev_pdi_sugestao_acoes (sugestao_id, pdi_item_id, pdi_acao_id, acao_texto) values ($1, $2, $3, 'x')`, [sug, item, a]);
const fechar = (id, resultado, obs, nSug, itensAn = 1) =>
  db.query(`update public.peopleflow_dev_pdi_interpretacoes set status = 'concluida', concluida_em = now(), itens_analisados = $5, sugestoes_geradas = $4, resultado_interpretacao = $2, observacao_interpretacao = $3, tokens_entrada = 1200, tokens_saida = 300, hash_conteudo = md5('entrada-' || id::text) where id = $1`, [id, resultado, obs, nSug, itensAn]);
const NEUTRO = "A definir pelo RH";

secao("2. Constraints e imutabilidade");
{
  const e1 = await erro(() => db.query(`insert into public.peopleflow_dev_pdi_interpretacoes (tipo, solicitada_por, provedor, modelo, versao_prompt) values ('ia', '${U_RH}', 'anthropic', 'm', 'v1')`));
  check("interpretação IA SEM item → recusada (pela guarda; e pela constraint, se a guarda for contornada)", Boolean(e1)
    && codigo(await semGuarda(() => db.query(`insert into public.peopleflow_dev_pdi_interpretacoes (tipo, solicitada_por, provedor, modelo, versao_prompt) values ('ia', '${U_RH}', 'anthropic', 'm', 'v1')`))) === "23514");
  const e2 = await erro(() => db.query(`insert into public.peopleflow_dev_pdi_interpretacoes (tipo, solicitada_por, versao_regra, pdi_item_id) values ('regra_local', '${U_RH}', 'pdi-item-v1', 'T1')`));
  check("regra local COM item → recusada (regra local continua sendo execução em lote, sem item)", codigo(e2) === "23514", msg(e2));
  const e3 = await erro(() => interp("ITEM-INEXISTENTE"));
  check("interpretação IA de item que não existe no PDI → recusada", /item do PDI não localizado/.test(msg(e3)), msg(e3));
  const idT1 = await interp("T1");
  const e4 = await erro(() => db.query(`update public.peopleflow_dev_pdi_interpretacoes set status = 'concluida', concluida_em = now(), itens_analisados = 1, resultado_interpretacao = 'qualquer' where id = ${idT1}`));
  check("resultado fora dos 4 valores controlados → recusado (pela guarda; e pela constraint, se a guarda for contornada)", Boolean(e4)
    && codigo(await semGuarda(() => db.query(`update public.peopleflow_dev_pdi_interpretacoes set status = 'concluida', concluida_em = now(), itens_analisados = 1, resultado_interpretacao = 'qualquer' where id = ${idT1}`))) === "23514");
  const e5 = await erro(() => db.query(`update public.peopleflow_dev_pdi_interpretacoes set resultado_interpretacao = 'necessidade_identificada' where id = ${idT1}`));
  check("resultado em interpretação ainda em andamento → recusado", codigo(e5) === "23514", msg(e5));
  const e6 = await erro(() => db.query(`update public.peopleflow_dev_pdi_interpretacoes set observacao_interpretacao = 'x' where id = ${idT1}`));
  check("observação em interpretação ainda em andamento → recusada", codigo(e6) === "23514", msg(e6));
  const e7 = await erro(() => db.query(`update public.peopleflow_dev_pdi_interpretacoes set resultado_interpretacao = 'necessidade_identificada' where id = ${exLocal}`));
  check("resultado em execução de REGRA LOCAL → recusado (e ela já está encerrada/imutável)", Boolean(e7));
  const e8 = await erro(() => db.query(`update public.peopleflow_dev_pdi_interpretacoes set pdi_item_id = 'T2' where id = ${idT1}`));
  check("pdi_item_id é imutável", /imutáveis/.test(msg(e8)), msg(e8));
  const e9 = await erro(() => sugestao(idT1, "T1", "texto", "altissima", "porque"));
  check("confiança fora de alta/media/baixa → recusada", codigo(e9) === "23514", msg(e9));
  const e10 = await erro(() => sugestao(idT1, "T1", "texto", "alta", null));
  check("confiança SEM justificativa → recusada (juntas ou nenhuma)", codigo(e10) === "23514", msg(e10));
  const e11 = await erro(() => sugestao(idT1, "T1", "texto", null, "justificativa solta"));
  check("justificativa SEM confiança → recusada", codigo(e11) === "23514", msg(e11));
  const e12 = await erro(() => sugestao(idT1, "T1", "texto", "alta", "   "));
  check("justificativa em branco → recusada", codigo(e12) === "23514", msg(e12));
  const e13 = await erro(() => db.query(`insert into public.peopleflow_dev_pdi_sugestoes (interpretacao_id, origem_sugestao, pdi_id, pdi_item_id, texto_sugerido, confianca, justificativa_interpretacao) values (${exLocal}, 'regra_local', ${p1}, 'I5', 'x', 'alta', 'porque')`));
  check("sugestão de REGRA LOCAL com confiança/justificativa → recusada (só origem ia)", codigo(e13) === "23514" || Boolean(e13), msg(e13));
  const e14 = await erro(() => db.query(`insert into public.peopleflow_dev_pdi_sugestoes (origem_sugestao, pdi_id, pdi_item_id, texto_sugerido, confianca, justificativa_interpretacao) values ('rh', ${p1}, 'T1', 'x', 'alta', 'porque')`));
  check("sugestão do RH com confiança/justificativa → recusada", codigo(e14) === "23514", msg(e14));
  const e15 = await erro(() => sugestao(idT1, "T2", "texto de outro item", "alta", "porque"));
  check("sugestão IA de OUTRO item que o da interpretação → recusada", /não confere com o item da interpretação/.test(msg(e15)), msg(e15));

  // imutabilidade: confiança/justificativa depois de criadas
  const s1 = await sugestao(idT1, "T1", "Necessidade de teste do item 1", "media", "Justificativa de teste");
  const e16 = await erro(() => db.query(`update public.peopleflow_dev_pdi_sugestoes set estado = 'mantida_no_pdi', decidido_por = '${U_RH}', decidido_em = now(), motivo_decisao = 'x', confianca = 'alta' where id = ${s1}`));
  check("confiança é imutável (nem junto com uma decisão)", /imutáveis/.test(msg(e16)), msg(e16));
  const e17 = await erro(() => db.query(`update public.peopleflow_dev_pdi_sugestoes set estado = 'mantida_no_pdi', decidido_por = '${U_RH}', decidido_em = now(), motivo_decisao = 'x', justificativa_interpretacao = 'outra' where id = ${s1}`));
  check("justificativa é imutável", /imutáveis/.test(msg(e17)), msg(e17));
  await acao(s1, "T1", "T1a");
  await acao(s1, "T1", "T1b");
  // fecha T1 como necessidade_identificada
  const fe = await erro(() => fechar(idT1, "necessidade_identificada", "Observação curta do item 1", 1));
  check("T1: conclui como necessidade_identificada (1 sugestão com necessidade, ações cobertas)", fe === null, msg(fe));
  const e18 = await erro(() => db.query(`update public.peopleflow_dev_pdi_interpretacoes set observacao_interpretacao = 'alterada depois' where id = ${idT1}`));
  check("interpretação concluída é imutável (resultado/observação não mudam depois)", /já encerrada/.test(msg(e18)), msg(e18));
  const dec = await erro(() => db.query(`update public.peopleflow_dev_pdi_sugestoes set estado = 'mantida_no_pdi', decidido_por = '${U_RH}', decidido_em = now(), motivo_decisao = 'RH manteve' where id = ${s1}`));
  check("a decisão do RH sobre a sugestão IA segue funcionando como na Fase 7 (mantida_no_pdi)", dec === null, msg(dec));
}

secao("3. Fechamento coerente da interpretação (resultado × sugestões × cobertura)");
{
  // T2: múltiplas necessidades + ação sem necessidade (artefato neutro)
  const i2 = await interp("T2");
  const a = await sugestao(i2, "T2", "Primeira necessidade do item 2", "alta", "Porque sim", "Tema A");
  const b = await sugestao(i2, "T2", "Segunda necessidade do item 2", "baixa", "Porque também", "Tema B");
  await acao(a, "T2", "T2a");
  await acao(b, "T2", "T2b");
  const eCob = await erro(() => fechar(i2, "multiplas_necessidades", null, 2));
  check("fechamento recusado enquanto uma ação em aberto do item (T2c) estiver sem cobertura", /sem cobertura/.test(msg(eCob)), msg(eCob));
  const n = await sugestao(i2, "T2", NEUTRO);
  await acao(n, "T2", "T2c");
  const n2 = await erro(() => sugestao(i2, "T2", NEUTRO));
  check("2ª sugestão neutra na mesma interpretação → recusada (índice único parcial)", codigo(n2) === "23505" && /ia_neutra_uidx/.test(msg(n2)), msg(n2));
  const eGer = await erro(() => fechar(i2, "multiplas_necessidades", null, 2));
  check("sugestoes_geradas diferente das sugestões gravadas (2 em vez de 3) → recusado", /sugestoes_geradas/.test(msg(eGer)), msg(eGer));
  const eRes = await erro(() => fechar(i2, "necessidade_identificada", null, 3));
  check("'necessidade_identificada' com 2 necessidades → recusado", /não confere com as sugestões/.test(msg(eRes)), msg(eRes));
  const eRes2 = await erro(() => fechar(i2, "evidencia_insuficiente", null, 3));
  check("'evidencia_insuficiente' havendo sugestões com necessidade → recusado", /não confere com as sugestões/.test(msg(eRes2)), msg(eRes2));
  const eItens = await erro(() => fechar(i2, "multiplas_necessidades", null, 3, 2));
  check("itens_analisados ≠ 1 numa interpretação IA → recusado", Boolean(eItens), msg(eItens));
  const eOk = await erro(() => fechar(i2, "multiplas_necessidades", "Dois temas distintos e uma ação sem necessidade", 3));
  check("T2: conclui como multiplas_necessidades (2 necessidades + 1 neutra cobrindo a ação sem necessidade)", eOk === null, msg(eOk));
  const acoes2 = await sql(`select sugestao_id, pdi_acao_id from public.peopleflow_dev_pdi_sugestao_acoes where pdi_item_id = 'T2' and ativa order by pdi_acao_id`);
  check("cada ação do item está em UMA sugestão ativa (conjuntos exclusivos)", acoes2.length === 3 && new Set(acoes2.map((x) => x.pdi_acao_id)).size === 3);
  const dup = await erro(() => acao(b, "T2", "T2a"));
  check("ação já usada por outra sugestão ativa não pode sustentar uma segunda (índice da Fase 7 segue valendo)", codigo(dup) === "23505", msg(dup));

  // T3 e T4: sem necessidade
  const i3 = await interp("T3");
  const e3a = await erro(() => fechar(i3, "evidencia_insuficiente", "Sem evidência", 0));
  check("sem nenhuma sugestão não fecha (falta a neutra que cobre a ação)", Boolean(e3a), msg(e3a));
  const n3 = await sugestao(i3, "T3", NEUTRO);
  await acao(n3, "T3", "T3a");
  const e3b = await erro(() => fechar(i3, "necessidade_identificada", null, 1));
  check("'necessidade_identificada' com SÓ a sugestão neutra → recusado", /não confere com as sugestões/.test(msg(e3b)), msg(e3b));
  const e3c = await erro(() => fechar(i3, "evidencia_insuficiente", "Não há evidência suficiente.", 1));
  check("T3: conclui como evidencia_insuficiente (só a neutra, sem confiança/justificativa)", e3c === null, msg(e3c));
  const i4 = await interp("T4");
  const n4 = await sugestao(i4, "T4", NEUTRO);
  await acao(n4, "T4", "T4a");
  const e4 = await erro(() => fechar(i4, "somente_acao_pdi", "Apenas uma ação de PDI.", 1));
  check("T4: conclui como somente_acao_pdi", e4 === null, msg(e4));

  // T5: necessidade + ação sem necessidade
  const i5 = await interp("T5");
  const s5 = await sugestao(i5, "T5", "Necessidade do item 5", "media", "Justificativa 5");
  await acao(s5, "T5", "T5a");
  const e5a = await erro(() => fechar(i5, "necessidade_identificada", null, 1));
  check("T5: 1 necessidade cobrindo só T5a → recusado (T5b descoberta)", /sem cobertura/.test(msg(e5a)), msg(e5a));
  const n5 = await sugestao(i5, "T5", NEUTRO);
  await acao(n5, "T5", "T5b");
  const e5b = await erro(() => fechar(i5, "necessidade_identificada", null, 2));
  check("T5: necessidade_identificada + neutra para a ação sem necessidade → conclui", e5b === null, msg(e5b));

  // T6: múltiplas com 1 só
  const i6 = await interp("T6");
  const s6 = await sugestao(i6, "T6", "Necessidade única do item 6", "alta", "J6");
  await acao(s6, "T6", "T6a"); await acao(s6, "T6", "T6b");
  const e6 = await erro(() => fechar(i6, "multiplas_necessidades", null, 1));
  check("T6: 'multiplas_necessidades' com 1 só necessidade → recusado", /não confere com as sugestões/.test(msg(e6)), msg(e6));
  check("T6: ...e como necessidade_identificada conclui", (await erro(() => fechar(i6, "necessidade_identificada", null, 1))) === null);
}

secao("4. Trava de concorrência (no máximo 1 interpretação IA em andamento por ITEM)");
{
  const a = await interp("T7");
  const dupMesmo = await erro(() => interp("T7"));
  check("2ª interpretação IA em andamento para o MESMO item → recusada (23505, índice por pdi_item_id)", codigo(dupMesmo) === "23505" && /ia_andamento_uidx/.test(msg(dupMesmo)), msg(dupMesmo));
  const outro = await erro(() => interp("T8"));
  check("outro item NÃO é bloqueado (a trava é por item)", outro === null, msg(outro));
  const tentaItem = (await sql(`select count(*)::int n from public.peopleflow_dev_pdi_interpretacoes where tipo = 'ia' and status = 'em_andamento' and pdi_item_id in ('T7', 'T8')`))[0].n;
  check("estado: exatamente 1 em andamento em T7 e 1 em T8", tentaItem === 2);
  const eFalha = await erro(() => db.query(`update public.peopleflow_dev_pdi_interpretacoes set status = 'falhou', concluida_em = now(), erro_tecnico = 'queda simulada', resultado_interpretacao = 'necessidade_identificada' where id = ${a}`));
  check("falha com resultado preenchido → recusada (resultado só em concluída)", codigo(eFalha) === "23514", msg(eFalha));
  const fal = await erro(() => db.query(`update public.peopleflow_dev_pdi_interpretacoes set status = 'falhou', concluida_em = now(), erro_tecnico = 'queda simulada' where id = ${a}`));
  check("interpretação IA pode FALHAR (sem resultado) e libera a trava", fal === null, msg(fal));
  const novaApos = await erro(() => interp("T7"));
  check("depois da falha uma nova interpretação do mesmo item é aceita", novaApos === null, msg(novaApos));
  const rl1 = await erro(() => db.query(`insert into public.peopleflow_dev_pdi_interpretacoes (tipo, solicitada_por, versao_regra) values ('regra_local', '${U_RH}', 'pdi-item-v1')`));
  const rl2 = await erro(() => db.query(`insert into public.peopleflow_dev_pdi_interpretacoes (tipo, solicitada_por, versao_regra) values ('regra_local', '${U_RH}', 'pdi-item-v1')`));
  check("a regra local NÃO participa da trava (execuções em lote simultâneas continuam possíveis)", rl1 === null && rl2 === null);
}

secao("5. View: resultado e observação vêm da interpretação (sem duplicar nas sugestões)");
{
  const v = await como("authenticated", U_RH, async () => (await db.query(`select s.pdi_item_id, s.origem_sugestao, s.confianca, s.justificativa_interpretacao, s.resultado_interpretacao, s.observacao_interpretacao, s.tema from public.peopleflow_dev_v_pdi_sugestoes s where s.origem_sugestao = 'ia' order by s.id`)).rows);
  const t2 = v.filter((x) => x.pdi_item_id === "T2");
  check("T2: as 3 sugestões (2 com necessidade + 1 neutra) mostram o MESMO resultado e observação, vindos da interpretação", t2.length === 3 && t2.every((x) => x.resultado_interpretacao === "multiplas_necessidades" && x.observacao_interpretacao === "Dois temas distintos e uma ação sem necessidade"));
  check("T2: confiança/justificativa próprias de cada necessidade; a neutra não tem (artefato, não necessidade identificada)", t2.filter((x) => x.confianca).map((x) => x.confianca).sort().join() === "alta,baixa" && t2.filter((x) => !x.confianca).length === 1 && t2.find((x) => !x.confianca).justificativa_interpretacao === null);
  const t3 = v.find((x) => x.pdi_item_id === "T3");
  check("T3: o resultado semântico verdadeiro (evidencia_insuficiente) aparece na neutra, que não carrega confiança", t3.resultado_interpretacao === "evidencia_insuficiente" && t3.confianca === null);
  const armazenado = await um(`select count(*)::int n from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_dev_pdi_sugestoes' and column_name in ('resultado_interpretacao', 'observacao_interpretacao')`);
  check("a tabela de sugestões NÃO tem colunas de resultado/observação (nada repetido)", armazenado.n === 0);
  const gestor = await como("authenticated", U_G1, async () => (await db.query(`select count(*)::int n from public.peopleflow_dev_v_pdi_sugestoes`)).rows[0].n);
  check("Gestor continua sem acesso às sugestões e interpretações", gestor === 0 && (await como("authenticated", U_G1, async () => (await db.query(`select count(*)::int n from public.peopleflow_dev_pdi_interpretacoes`)).rows[0].n)) === 0);
}

secao("6. Validação oficial da 8A (todas as consultas do arquivo)");
function consultas(texto) {
  const secoes = texto.split(/^-- (V\d+)\)/m);
  const out = [];
  for (let i = 1; i < secoes.length; i += 2) {
    const linhas = secoes[i + 1].split("\n").slice(1); // a 1ª linha é o resto do título (ex.: "Colunas novas: ...")
    let atual = [];
    let n = 0;
    for (const l of linhas) {
      if (/^\s*--/.test(l) || l.trim() === "") continue;
      atual.push(l);
      if (l.trim().endsWith(";")) { out.push({ id: secoes[i] + (n++ ? "#" + n : ""), sql: atual.join("\n") }); atual = []; }
    }
  }
  return out;
}
const QS = consultas(VALID8A);
const ids = QS.map((q) => q.id);
check("o arquivo de validação traz V1…V9 (V7 com 2 consultas e V8 com 4)", ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9"].every((v) => ids.some((x) => x.startsWith(v))) && QS.length === 13, ids.join());
async function validar(Rx, esperaIA) {
  const r = {};
  for (const q of QS) r[q.id] = await Rx.sql(q.sql.replace(/;\s*$/, ""));
  const ok = [];
  ok.push(["V1", r.V1.length === 5 && r.V1.every((x) => x.is_nullable === "YES" && x.data_type === "text")]);
  ok.push(["V2", r.V2.length === 8]);
  ok.push(["V3", r.V3.length === 2 && r.V3.every((x) => /UNIQUE/.test(x.indexdef) && /WHERE/.test(x.indexdef))]);
  ok.push(["V4", r.V4.length === 2 && r.V4.every((x) => x.mantem_imutabilidade_fase7 && x.tem_regras_8a && x.sem_execucao_para_navegador)]);
  ok.push(["V5", r.V5.length === 15]);
  ok.push(["V6", r.V6.length === 1 && r.V6[0].ultimas_4_colunas === "confianca,justificativa_interpretacao,resultado_interpretacao,observacao_interpretacao" && r.V6[0].security_invoker && r.V6[0].auth_select && !r.V6[0].auth_escrita && !r.V6[0].anon_select]);
  ok.push(["V7", r.V7.length === 0 && r["V7#2"].length === 0]);
  ok.push(["V8", ["V8", "V8#2", "V8#3", "V8#4"].every((k) => r[k]?.length === 0)]);
  ok.push(["V9", r.V9.length === 1 && Number(r.V9[0].interpretacoes_ia_deve_ser_0) === (esperaIA ? Number(r.V9[0].interpretacoes_ia_deve_ser_0) : 0)]);
  return { r, ok };
}
{
  const { ok } = await validar(R, true);
  for (const [v, o] of ok) check(`validação ${v} com o resultado esperado (réplica com dados de IA)`, o);
  // controle negativo: as consultas V8 DETECTAM incoerência (criada com os triggers desligados, só na réplica)
  await db.exec("set session_replication_role = replica");
  const ruim = (await um(`insert into public.peopleflow_dev_pdi_interpretacoes (tipo, solicitada_por, provedor, modelo, versao_prompt, pdi_item_id, status, concluida_em, itens_analisados, sugestoes_geradas, resultado_interpretacao) values ('ia', '${U_RH}', 'anthropic', 'm', 'v1', 'T4', 'concluida', now(), 1, 0, 'necessidade_identificada') returning id`)).id;
  await db.query(`insert into public.peopleflow_dev_pdi_sugestoes (interpretacao_id, origem_sugestao, pdi_id, pdi_item_id, item_competencia_nome, hash_origem, texto_sugerido, confianca, justificativa_interpretacao) values (${ruim}, 'ia', ${p1}, 'T1', 'x', md5('x'), 'texto', 'alta', 'j')`);
  await db.exec("set session_replication_role = origin");
  const v8b = await sql(QS.find((q) => q.id === "V8#2").sql.replace(/;\s*$/, ""));
  const v8c = await sql(QS.find((q) => q.id === "V8#3").sql.replace(/;\s*$/, ""));
  check("controle negativo: V8(b) detecta interpretação concluída com resultado incoerente e V8(c) detecta sugestão de outro item", v8b.some((x) => x.id === ruim) && v8c.length >= 1);
  // a linha incoerente foi criada só para o controle; a nossa fotografia de comparação é feita antes dela
}

secao("7. Fase 7 / LNT / PDI preservados depois de todos os fluxos de IA");
{
  const leg = await sql(`select id, origem_sugestao, estado, necessidade_id, texto_sugerido, texto_final, motivo_decisao from public.peopleflow_dev_pdi_sugestoes where origem_sugestao = 'legado' order by id`);
  check("as 5 sugestões legado espelhadas seguem intactas (3 validadas com necessidade, 2 mantidas no mesmo item)", leg.length === 5 && leg.filter((x) => x.estado === "validada" && x.necessidade_id).length === 3 && leg.filter((x) => x.estado === "mantida_no_pdi").length === 2);
  const mantidas = await sql(`select s.id, sa.pdi_acao_id, s.pdi_item_id from public.peopleflow_dev_pdi_sugestoes s join public.peopleflow_dev_pdi_sugestao_acoes sa on sa.sugestao_id = s.id where s.origem_sugestao = 'legado' and s.estado = 'mantida_no_pdi' order by sa.pdi_acao_id`);
  check("as 2 mantidas continuam no MESMO item, cada uma com 1 ação", mantidas.length === 2 && mantidas[0].pdi_item_id === mantidas[1].pdi_item_id && mantidas.map((x) => x.pdi_acao_id).join() === "B1,B2");
  const nec = (await sql(`select count(*)::int n from public.peopleflow_dev_necessidades`))[0].n;
  check("3 necessidades PDI intactas (nenhuma criada pela IA/8A)", nec === 3);
  const disp = (await sql(`select count(*)::int n from public.peopleflow_dev_pdi_sugestoes_dispensadas`))[0].n;
  check("2 decisões PDI-only (tabela legada) intactas", disp === 2);
  const lnt = Number((await um(`select (select count(*) from public.peopleflow_dev_lnt_ciclos)::int + (select count(*) from public.peopleflow_dev_lnt_itens)::int + (select count(*) from public.peopleflow_dev_lnt_necessidades)::int as n`)).n);
  check("LNT intacta (nenhuma linha criada)", lnt === 0);
  const local = await um(`select i.status, i.resultado_interpretacao, i.pdi_item_id, s.confianca, s.estado from public.peopleflow_dev_pdi_interpretacoes i join public.peopleflow_dev_pdi_sugestoes s on s.interpretacao_id = i.id where i.id = ${exLocal}`);
  check("execução e sugestão da REGRA LOCAL intactas e sem colunas da IA", local.status === "concluida" && local.resultado_interpretacao === null && local.pdi_item_id === null && local.confianca === null && local.estado === "pendente");
  const dec = (await sql(`select estado from public.peopleflow_dev_pdi_sugestoes where id = ${sgLocal}`))[0].estado;
  check("a sugestão de regra local segue decidível como antes (pendente)", dec === "pendente");
}

secao("8. Reversão RECUSADA com dados reais de IA");
const fotoCheia = await foto(R);
const rr = await rodar(R, ROLL8A);
check("rollback recusa quando já existem dados de IA (interpretações, sugestões e colunas preenchidas)", !rr.ok && /REVERSÃO RECUSADA/.test(rr.msg), rr.msg);
check("depois da recusa nada mudou (catálogo e dados idênticos)", fotoIgual(fotoCheia, await foto(R)), resumoDif(fotoCheia, await foto(R)));

// ═══════════════════════════════════════════════════════════════════
// RÉPLICA 2 — sem dado de IA: validação, rollback COMPLETO, migration de novo
// ═══════════════════════════════════════════════════════════════════
secao("9. Réplica sem dado de IA: validação → rollback completo → migration de novo");
{
  const M = await montar();
  const f0 = await foto(M.R);
  const ap = await rodar(M.R, MIG8A);
  check("migration aplicada", ap.ok, ap.msg);
  const f1 = await foto(M.R);
  const { ok } = await validar(M.R, false);
  for (const [v, o] of ok) check(`validação ${v} com o resultado esperado (sem dados de IA)`, o);
  const rb = await rodar(M.R, ROLL8A);
  check("rollback roda inteiro quando não há dado de IA", rb.ok, rb.msg);
  const f2 = await foto(M.R);
  check("depois do rollback o catálogo e os dados são IDÊNTICOS aos de antes da 8A (colunas, constraints, índices, triggers, funções, views, políticas, privilégios)", fotoIgual(f0, f2), resumoDif(f0, f2));
  check("as duas funções de guarda e a view voltaram ao texto da Fase 7 (idênticos, ignorando só o fim de linha CRLF/LF do arquivo)", f2.functions["peopleflow_dev_pdi_interpretacoes_guarda()"] === f0.functions["peopleflow_dev_pdi_interpretacoes_guarda()"]
    && f2.functions["peopleflow_dev_pdi_sugestoes_guarda()"] === f0.functions["peopleflow_dev_pdi_sugestoes_guarda()"] && f2.views.peopleflow_dev_v_pdi_sugestoes === f0.views.peopleflow_dev_v_pdi_sugestoes);
  const rb2 = await rodar(M.R, ROLL8A);
  check("rollback de novo → recusa com mensagem clara (8A não está aplicada)", !rb2.ok && /não está aplicada/.test(rb2.msg), rb2.msg);
  const ap2 = await rodar(M.R, MIG8A);
  check("migration de novo depois do rollback roda inteira", ap2.ok, ap2.msg);
  const f3 = await foto(M.R);
  check("o estado depois de reaplicar é IDÊNTICO ao da primeira aplicação", fotoIgual(f1, f3), resumoDif(f1, f3));
  const viewR = await M.R.como("authenticated", U_RH, async () => (await M.R.db.query(viewAntigaSql)).rows);
  check("a view antiga continua devolvendo as linhas de antes (consumidores da 1B) depois de aplicar/reverter/aplicar", viewR.length === 6 && JSON.stringify(viewR.map((x) => x.estado)) === JSON.stringify(viewAntes.map((x) => x.estado)));
}

// ═══════════════════════════════════════════════════════════════════
// RÉPLICA 3 — rollback com perda autorizada
// ═══════════════════════════════════════════════════════════════════
secao("10. Rollback com perda autorizada (v_permitir_perda = true) e re-aplicação");
{
  const M = await montar();
  await rodar(M.R, MIG8A);
  const i = (await M.R.um(`insert into public.peopleflow_dev_pdi_interpretacoes (tipo, solicitada_por, provedor, modelo, versao_prompt, pdi_item_id) values ('ia', '${U_RH}', 'anthropic', 'm', 'v1', 'I2') returning id`)).id;
  await M.R.db.query(`update public.peopleflow_dev_pdi_interpretacoes set status = 'falhou', concluida_em = now(), erro_tecnico = 'x' where id = ${i}`);
  const recusa = await rodar(M.R, ROLL8A);
  check("só uma interpretação IA (mesmo falha) já basta para o rollback recusar", !recusa.ok && /REVERSÃO RECUSADA/.test(recusa.msg), recusa.msg);
  const liberado = ROLL8A.replace("v_permitir_perda boolean := false;", "v_permitir_perda boolean := true;");
  check("o script de teste altera exatamente a flag de perda", liberado !== ROLL8A);
  const ok = await rodar(M.R, liberado);
  check("com v_permitir_perda = true o rollback roda (as colunas da 8A são removidas; as linhas de IA ficam)", ok.ok, ok.msg);
  const sobrou = await M.R.um(`select count(*)::int n from information_schema.columns where table_schema = 'public' and ((table_name = 'peopleflow_dev_pdi_interpretacoes' and column_name in ('pdi_item_id', 'resultado_interpretacao', 'observacao_interpretacao')) or (table_name = 'peopleflow_dev_pdi_sugestoes' and column_name in ('confianca', 'justificativa_interpretacao')))`);
  check("nenhuma coluna da 8A sobrou", sobrou.n === 0);
  const ap = await rodar(M.R, MIG8A);
  check("re-aplicar a 8A com uma interpretação IA órfã → PRE-FLIGHT recusa com mensagem clara", !ap.ok && /interpretação\(ões\) do tipo ia/.test(ap.msg), ap.msg);
}

console.log(`\nRESUMO: ${C.ok} verificações OK, ${C.falhas} falha(s)`);
process.exit(C.falhas ? 1 : 0);

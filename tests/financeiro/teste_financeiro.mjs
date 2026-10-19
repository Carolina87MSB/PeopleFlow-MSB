// Integração financeira dos desligamentos — migration supabase/desligamentos_financeiro.sql + ações do servidor (api/_lib/financeiroDesligamentos.ts),
// testadas na RÉPLICA (PGlite) com dados FICTÍCIOS que reproduzem os casos reais (divergência, líquido zero, modalidade ausente, conversão de estágio,
// histórico sem cadastro, vínculo por nome+admissão). Nada vai ao Supabase real.
//   cd tests && npm run test:financeiro
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { criarCliente } from "../pdi-triagem/shim.mjs";
import { rd, novaReplica, criarContador, REPO } from "../pdi-triagem/base.mjs";

const C = criarContador();
const { check, secao } = C;
const R = await novaReplica();
const { db, sql, um, como } = R;
const falha = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    await db.exec("rollback").catch(() => {});
    return String(e.message);
  }
};

// ── infraestrutura mínima do ambiente real ──
await db.exec(`
  alter table public.colaboradores add column if not exists vinculo text, add column if not exists depto_code text, add column if not exists nivel text,
    add column if not exists motivo_desligamento text, add column if not exists desligado_by text, add column if not exists matriz9box_visao_completa boolean;
  create table public.peopleflow_desligamentos (colaborador_nome text primary key, valor_rescisao numeric, valor_grrf numeric, updated_at timestamptz not null default now(), updated_by text);
  alter table public.peopleflow_desligamentos enable row level security;
  create policy authenticated_rw_desligamentos on public.peopleflow_desligamentos for all to authenticated using (true) with check (true);
  grant select, insert, update, delete on public.peopleflow_desligamentos to authenticated; grant all on public.peopleflow_desligamentos to service_role;
`);
await db.exec(rd("desligamentos_historico_e_situacao.sql"));

const U = { RH: "00000000-0000-0000-0000-0000000000f1", DIR: "00000000-0000-0000-0000-0000000000f2", GES: "00000000-0000-0000-0000-0000000000f3", COL: "00000000-0000-0000-0000-0000000000f4", DESL: "00000000-0000-0000-0000-0000000000f5" };
globalThis.__EMAIL_DE = {
  [U.RH]: "helena.recursos@msbbrasil.com",
  [U.DIR]: "diego.diretor@msbbrasil.com",
  [U.GES]: "gil.gestor@msbbrasil.com",
  [U.COL]: "paulo.producao@msbbrasil.com",
  [U.DESL]: "alice.saiu@msbbrasil.com",
};

// ── cadastro fictício ──
const ins = async (nome, cargo, depto, gestor, adm, desl, dataDesl) =>
  (await um(`insert into public.colaboradores (nome, cargo, departamento, gestor, admissao, desligado, data_desligamento) values ($1,$2,$3,$4,$5,$6,$7) returning id`, [nome, cargo, depto, gestor, adm, desl, dataDesl])).id;
await ins("Helena Recursos", "Analista de RH", "Recursos Humanos", null, "2020-01-01", false, null);
await ins("Diego Diretor", "Diretor Geral", "Diretoria", null, "2019-01-01", false, null);
const idA = await ins("Alice Saiu", "Auxiliar", "Produção", "Gil Gestor", "2026-01-13", true, "2026-07-13");
const idB = await ins("Bia Diverge", "Auxiliar", "Produção", "Gil Gestor", "2025-02-02", true, "2026-07-21");
const idC = await ins("Caio Novo", "Auxiliar", "Logística", "Gil Gestor", "2025-03-03", true, "2026-10-05");
const idJ = await ins("Joca Dois", "Auxiliar", "Logística", "Gil Gestor", "2025-04-04", true, "2026-07-30");
await ins("Kleber Mesmo", "Auxiliar", "Produção", "Gil Gestor", "2025-05-05", true, "2026-08-10");
await ins("Iara Manual", "Auxiliar", "Produção", "Gil Gestor", "2025-06-06", true, "2026-09-10");
const idH = await ins("Hugo Convertido", "Analista", "Engenharia", null, "2025-05-07", false, null);

// ── histórico da folha (fictício) + valores importados ──
const histIns = async (cod, nome, adm, dem, tipo, depto, natureza, colabId, efet = null) =>
  (await um(`insert into public.peopleflow_rescisoes_historico (relatorio_emitido_em, codigo_folha, nome, admissao, demissao, tipo_rescisao, departamento, natureza, efetivacao_em, colaborador_id)
    values ('2026-10-19', $1,$2,$3,$4,$5,$6,$7,$9,$8) returning id`, [cod, nome, adm, dem, tipo, depto, natureza, colabId, efet])).id;
const rubIns = (id, liq, fgts, saldo = 0) => db.query(`insert into public.peopleflow_rescisoes_historico_rubricas (rescisao_id, saldo_fgts, salario, proventos, descontos, liquido, fgts_rescisorio) values ($1,$2,2000,$3,0,$4,$5)`, [id, saldo, liq, liq, fgts]);
const hA = await histIns(101, "Alice Saiu", "2026-01-13", "2026-07-13", "Pedido de demissão sem justa causa", "Produção", "saida_efetiva", idA); await rubIns(hA, 1000, 100);
const hB = await histIns(102, "Bia Diverge", "2025-02-02", "2026-07-21", "Pedido de demissão sem justa causa", "Produção", "saida_efetiva", idB); await rubIns(hB, 2000, 150);
const hC = await histIns(103, "Caio Novo", "2025-03-03", "2026-10-05", "Demitido sem justa causa", "Logística", "saida_efetiva", idC); await rubIns(hC, 5000, 700, 1400);
const hJ = await histIns(104, "Joca Dois", "2025-04-04", "2026-07-30", "Pedido de demissão sem justa causa", "Logística", "saida_efetiva", idJ); await rubIns(hJ, 1800, 120);
const hK = await histIns(105, "Kleber Mesmo", "2025-05-05", "2026-08-10", "Pedido de demissão sem justa causa", "Produção", "saida_efetiva", null); await rubIns(hK, 900, 60); // sem colaborador_id: liga por nome + admissão
const hE = await histIns(201, "Eva Historica", "2024-01-01", "2026-01-12", "Demitido sem justa causa", "Produção", "saida_efetiva", null); await rubIns(hE, 4000, 400);
const hF = await histIns(202, "Fabio Zero", "2024-02-02", "2026-02-02", "Pedido de demissão sem justa causa", "Produção", "saida_efetiva", null); await rubIns(hF, 0, 90);
const hG = await histIns(203, "Gabi SemTipo", "2024-03-03", "2026-03-03", "", "Logística", "saida_efetiva", null); await rubIns(hG, 1500, 300, 700);
const hH = await histIns(301, "Hugo Convertido", "2025-05-07", "2026-07-31", "Antecipado pelo empregador (tempo determinado)", "Engenharia", "conversao_estagio_clt", idH, "2026-08-03"); await rubIns(hH, 3647.25, 0);
// fechamentos já lançados pelo RH (preservados)
await db.exec(`insert into public.peopleflow_desligamentos (colaborador_nome, valor_rescisao, valor_grrf, updated_by) values
  ('Alice Saiu', 1000, 0, 'RH'), ('Bia Diverge', 3500, 0, 'RH'), ('Joca Dois', 2500, null, 'RH')`);

// ═══ A. Migration ═══
secao("A. Migration: aditiva, idempotente, validada");
const hashTab = async (t, chave) => (await um(`select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.${chave}), '')) h from public.${t} x`)).h;
const antes = { fech: await hashTab("peopleflow_desligamentos", "colaborador_nome"), colab: await hashTab("colaboradores", "id"), hist: await hashTab("peopleflow_rescisoes_historico", "id") };
const antesRub = (await um(`select md5(string_agg(concat_ws('|', rescisao_id, saldo_fgts, salario, proventos, descontos, liquido, fgts_rescisorio), ';' order by rescisao_id)) h from public.peopleflow_rescisoes_historico_rubricas`)).h;
const MIG = rd("desligamentos_financeiro.sql");
check("migration roda sem erro", (await falha(() => db.exec(MIG))) === null);
check("migration é idempotente", (await falha(() => db.exec(MIG))) === null);
check("fechamentos existentes e cadastro intactos; histórico intacto", (await hashTab("colaboradores", "id")) === antes.colab && (await hashTab("peopleflow_rescisoes_historico", "id")) === antes.hist);
check("os 3 fechamentos existentes seguem com os mesmos valores (origem manual, sem validação)", (await sql(`select colaborador_nome, valor_rescisao::float v, valor_grrf::float g, origem, rescisao_validada_em, grrf_validada_em from public.peopleflow_desligamentos order by 1`)).every((f) => f.origem === "manual" && f.rescisao_validada_em === null && f.grrf_validada_em === null) && Number((await um(`select valor_rescisao::float v from public.peopleflow_desligamentos where colaborador_nome = 'Bia Diverge'`)).v) === 3500);
const VAL = rd("desligamentos_financeiro_validacao.sql").split("-- Informativo")[0].replace(/;\s*$/, "");
const valRes = await sql(VAL.replace("= 24", "= 9").replace("= 96110.58", "= 19847.25").replace("= 24196.05", "= 1920.00"));
check("validação oficial (ajustada à massa fictícia): tudo OK", valRes.every((r) => r.resultado === "OK"), JSON.stringify(valRes.filter((r) => r.resultado !== "OK")));
check("valores importados são imutáveis (trigger)", /imutáveis/.test(String(await falha(() => db.exec(`update public.peopleflow_rescisoes_historico_rubricas set liquido = 1 where rescisao_id = ${hA}`)))));
check("conversão de estágio não aceita validação financeira (trigger)", /não é desligamento/.test(String(await falha(() => db.exec(`update public.peopleflow_rescisoes_historico_rubricas set rescisao_status = 'validado', rescisao_valor_validado = 1, rescisao_validada_em = now(), rescisao_validada_por = 'x' where rescisao_id = ${hH}`)))));
check("constraint: 'validado' sem responsável é recusado; GRRF validada exige total e fonte", /status_chk/.test(String(await falha(() => db.exec(`update public.peopleflow_rescisoes_historico_rubricas set rescisao_status = 'validado', rescisao_valor_validado = 5 where rescisao_id = ${hA}`)))) && /status_chk/.test(String(await falha(() => db.exec(`update public.peopleflow_rescisoes_historico_rubricas set grrf_status = 'validado', grrf_total = 10 where rescisao_id = ${hA}`)))));
check("constraint: líquido R$ 0,00 só valida com conferência expressa", /status_chk/.test(String(await falha(() => db.exec(`update public.peopleflow_rescisoes_historico_rubricas set rescisao_status = 'validado', rescisao_valor_validado = 0, rescisao_validada_em = now(), rescisao_validada_por = 'x' where rescisao_id = ${hF}`)))));
check("constraint: total da GRRF precisa fechar com depósito + multa", /status_chk/.test(String(await falha(() => db.exec(`update public.peopleflow_rescisoes_historico_rubricas set grrf_status = 'validado', grrf_total = 100, grrf_deposito = 10, grrf_multa = 10, grrf_fonte = 'guia_grrf', grrf_validada_em = now(), grrf_validada_por = 'x' where rescisao_id = ${hA}`)))));

// ── servidor real ──
globalThis.__ADMIN = criarCliente(db, { papel: "service_role" });
const fin = await import(pathToFileURL(REPO + "api/_lib/financeiroDesligamentos.ts").href);
const chamar = async (acao, corpo, uid = U.RH) => {
  const res = { codigo: null, corpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.corpo = b; return this; } };
  await fin.executarFinanceiro(acao, { headers: { authorization: uid === null ? undefined : "Bearer tok:" + uid }, body: corpo }, res);
  return res;
};
const dados = (r) => r.corpo?.dados;
const linha = (l, nome) => l.find((x) => x.nome === nome);

// ═══ B. Autorização ═══
secao("B. Autorização: TUDO financeiro (individual e agregado) só para o RH · Diretoria, Gestor e demais nada (decisão do RH)");
check("sem token → 401; token inválido → 401", (await chamar("financeiro_listar", {}, null)).codigo === 401 && (await chamar("financeiro_listar", {}, "xyz")).codigo === 401);
check("colaborador sem perfil de acesso → 403", (await chamar("financeiro_listar", {}, U.COL)).codigo === 403);
check("conta de colaborador DESLIGADO → 403", (await chamar("financeiro_agregado", {}, U.DESL)).codigo === 403);
for (const [rotulo, uid] of [["Gestor", U.GES], ["Diretoria", U.DIR]]) {
  check(`${rotulo}: listar individual → 403`, (await chamar("financeiro_listar", {}, uid)).codigo === 403);
  for (const [acao, corpo] of [["financeiro_rescisao_validar", { itens: [{ rescisao_id: hA }] }], ["financeiro_rescisao_decidir", { rescisao_id: hB, decisao: "manter_lancado", motivo: "x" }], ["financeiro_grrf_registrar", { rescisao_id: hA, total: 1, fonte: "guia_grrf" }], ["financeiro_modalidade_confirmar", { rescisao_id: hG, modalidade: "outra" }], ["financeiro_fechamento_salvar", { colaborador_nome: "Iara Manual", valor_rescisao: 1 }]]) {
    check(`${rotulo}: ${acao} → 403`, (await chamar(acao, corpo, uid)).codigo === 403);
  }
}
check("Gestor: totais agregados → 403 (só quantidades, que não vêm daqui)", (await chamar("financeiro_agregado", {}, U.GES)).codigo === 403);
const aggDir = await chamar("financeiro_agregado", {}, U.DIR);
check("Diretoria: totais agregados → 403 (por ora só o RH; a liberação será decidida depois)", aggDir.codigo === 403 && aggDir.corpo.dados === undefined && /RH/.test(aggDir.corpo.error));
const aggRh = await chamar("financeiro_agregado", {}, U.RH);
const textoAgg = JSON.stringify(aggRh.corpo);
check("RH: totais agregados → 200, e a resposta NÃO contém nomes, ids, líquidos ou valores individuais", aggRh.codigo === 200 && !/Alice|Bia|Caio|Eva|Fabio|Gabi|Kleber|Iara|Joca|liquido|rescisaoId|colaboradorId|fgts/i.test(textoAgg), textoAgg.slice(0, 200));
{
  // TODA ação financeira do servidor recusa Diretoria, Gestor, colaborador comum e conta desligada — inclusive as ações antigas ainda expostas
  const corposAcoes = {
    financeiro_listar: {}, financeiro_agregado: { inicio: "2026-01-01", fim: "2026-12-31" }, financeiro_rescisao_validar: { itens: [{ rescisao_id: hA }] },
    financeiro_rescisao_decidir: { rescisao_id: hB, decisao: "manter_lancado", motivo: "x" }, financeiro_modalidade_confirmar: { rescisao_id: hG, modalidade: "outra" },
    financeiro_grrf_registrar: { rescisao_id: hA, total: 1, fonte: "guia_grrf" }, financeiro_fechamento_salvar: { colaborador_nome: "Iara Manual", valor_rescisao: 1 },
    financeiro_fechamento_validar: { colaborador_nome: "Iara Manual", componente: "rescisao", fonte: "outro_documento" },
    financeiro_lancamento_confirmar: { rescisao_id: hA, grrf_modo: "pendente", confirmacao_rh: true },
  };
  const acoesSrv = [...readFileSync(REPO + "api/_lib/financeiroDesligamentos.ts", "utf8").matchAll(/^  (financeiro_[a-z_]+): /gm)].map((m) => m[1]);
  check("todas as ações financeiras do servidor estão cobertas por este teste", acoesSrv.length === Object.keys(corposAcoes).length && acoesSrv.every((a) => a in corposAcoes), acoesSrv.join());
  const naoRh = [["Diretoria", U.DIR], ["Gestor", U.GES], ["Colaborador", U.COL], ["Desligado", U.DESL]];
  const furos = [];
  for (const [nome, uid] of naoRh) for (const [acao, corpo] of Object.entries(corposAcoes)) { const r = await chamar(acao, corpo, uid); if (r.codigo !== 403 || r.corpo?.dados !== undefined) furos.push(`${nome}:${acao}:${r.codigo}`); }
  check(`TODAS as ${Object.keys(corposAcoes).length} ações financeiras recusam Diretoria, Gestor, colaborador e desligado com 403, sem devolver dados`, furos.length === 0, furos.join(" "));
}
check("nada foi gravado pelas tentativas recusadas", (await hashTab("peopleflow_desligamentos", "colaborador_nome")) !== null && Number((await um(`select count(*)::int n from public.peopleflow_fechamentos_log`)).n) === 0 && (await um(`select count(*)::int n from public.peopleflow_rescisoes_historico_rubricas where rescisao_status <> 'proposto'`)).n === 0);

// ═══ C. Conciliação (RH) ═══
secao("C. Conciliação: cada desligamento uma vez; divergência detectada; conversão à parte");
const lis = dados(await chamar("financeiro_listar", {}));
check("9 saídas efetivas (6 do cadastro + 3 históricas), cada uma uma única vez", lis.saidas.length === 9 && new Set(lis.saidas.map((x) => x.chave)).size === 9, String(lis.saidas.length));
check("a conversão de estágio (Hugo) fica à parte e nunca entra nas saídas", lis.conversoes.length === 1 && lis.conversoes[0].nome === "Hugo Convertido" && !lis.saidas.some((x) => x.nome === "Hugo Convertido"));
check("vínculo por nome + admissão (histórico sem colaborador_id) conta uma vez só — Kleber", lis.saidas.filter((x) => x.nome === "Kleber Mesmo").length === 1 && linha(lis.saidas, "Kleber Mesmo").origem === "cadastro");
check("Bia Diverge: DIVERGENTE (lançado 3500 × líquido 2000)", linha(lis.saidas, "Bia Diverge").rescisao.status === "divergente" && linha(lis.saidas, "Bia Diverge").rescisao.lancado === 3500 && linha(lis.saidas, "Bia Diverge").liquidoFolha === 2000);
check("Alice (lançado = líquido), Caio e Eva: pendentes de validação (nada vem validado)", ["Alice Saiu", "Caio Novo", "Eva Historica"].every((n) => linha(lis.saidas, n).rescisao.status === "pendente") && lis.saidas.every((x) => x.rescisao.status !== "validado" && x.grrf.status === "pendente"));
check("Iara (sem folha): pendente; Hugo (conversão) sem status financeiro", linha(lis.saidas, "Iara Manual").rescisao.status === "pendente" && lis.conversoes[0].rescisao.status === "pendente");
check("a conciliação traz a data efetiva e o mês de cada saída", linha(lis.saidas, "Caio Novo").dataEfetivaIso === "2026-10-05" && linha(lis.saidas, "Caio Novo").mes === "2026-10");
const agg0 = dados(await chamar("financeiro_agregado", {}));
check("Dashboard antes de validar: quantidades completas, valores 0, totais PARCIAIS", agg0.meses.reduce((a, m) => a + m.quantidade, 0) === 9 && agg0.meses.every((m) => m.total === 0 && m.parcial) && agg0.cobertura.rescisaoValidadas === 0);

// ═══ D. Validar a rescisão (líquido) ═══
secao("D. Validação do líquido: individual/lote, divergência e zero exigem decisão expressa");
const logAntes = Number((await um(`select count(*)::int n from public.peopleflow_fechamentos_log`)).n);
const v1 = dados(await chamar("financeiro_rescisao_validar", { itens: [{ rescisao_id: hA }, { rescisao_id: hB }, { rescisao_id: hC }, { rescisao_id: hE }, { rescisao_id: hF }, { rescisao_id: hH }] }));
const res = Object.fromEntries(v1.resultados.map((x) => [x.rescisao_id, x.resultado]));
check("lote: Alice, Caio e Eva validadas; Bia DIVERGENTE e Fabio CONFERIR_ZERO recusadas; conversão recusada", res[hA] === "validada" && res[hC] === "validada" && res[hE] === "validada" && res[hB] === "divergente" && res[hF] === "conferir_zero" && res[hH] === "recusada", JSON.stringify(res));
const rubA = await um(`select rescisao_status, rescisao_valor_validado::float v, rescisao_validada_por from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hA}`);
check("validação grava valor, responsável e data; o líquido importado segue imutável", rubA.rescisao_status === "validado" && rubA.v === 1000 && rubA.rescisao_validada_por === "Helena Recursos");
const fA = await um(`select valor_rescisao::float v, origem, rescisao_validada_por, rescisao_fonte, grrf_validada_em from public.peopleflow_desligamentos where colaborador_nome = 'Alice Saiu'`);
check("Alice: fechamento existente PRESERVADO (valor igual, origem manual); rescisão validada (fonte folha, responsável); GRRF segue sem validação", fA.v === 1000 && fA.origem === "manual" && fA.rescisao_validada_por === "Helena Recursos" && fA.rescisao_fonte === "folha_rescisao" && fA.grrf_validada_em === null);
const fC = await um(`select valor_rescisao::float v, valor_grrf, origem, rescisao_historico_id from public.peopleflow_desligamentos where colaborador_nome = 'Caio Novo'`);
check("Caio (sem fechamento): o cadastro é ALIMENTADO com o líquido (origem folha, ligado à rescisão), sem digitação", fC.v === 5000 && fC.valor_grrf === null && fC.origem === "folha" && Number(fC.rescisao_historico_id) === hC);
check("Eva (histórico sem cadastro): validada sem criar fechamento nem cadastro", Number((await um(`select count(*)::int n from public.peopleflow_desligamentos where colaborador_nome = 'Eva Historica'`)).n) === 0 && Number((await um(`select count(*)::int n from public.colaboradores where nome = 'Eva Historica'`)).n) === 0);
check("Bia: lançamento divergente PRESERVADO (3500) e rescisão continua não validada", Number((await um(`select valor_rescisao::float v from public.peopleflow_desligamentos where colaborador_nome = 'Bia Diverge'`)).v) === 3500 && (await um(`select rescisao_status from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hB}`)).rescisao_status === "proposto");
const logs1 = await sql(`select acao, colaborador_nome, valor_anterior::float a, valor_novo::float n, origem, por from public.peopleflow_fechamentos_log order by id`);
check("trilha: 3 linhas (Alice, Caio, Eva) com valor anterior/novo, origem e responsável", logs1.length === logAntes + 3 && logs1.find((l) => l.colaborador_nome === "Caio Novo").n === 5000 && logs1.find((l) => l.colaborador_nome === "Caio Novo").a === null && logs1.find((l) => l.colaborador_nome === "Alice Saiu").a === 1000 && logs1.every((l) => l.por === "Helena Recursos"));
const rep = dados(await chamar("financeiro_rescisao_validar", { itens: [{ rescisao_id: hA }, { rescisao_id: hC }] }));
check("repetir a validação é inofensivo (já validadas; sem nova trilha)", rep.resultados.every((x) => x.resultado === "ja_validada") && Number((await um(`select count(*)::int n from public.peopleflow_fechamentos_log`)).n) === logs1.length);
const z = dados(await chamar("financeiro_rescisao_validar", { itens: [{ rescisao_id: hF, zero_conferido: true }] }));
check("líquido R$ 0,00 valida só com a conferência expressa (e registra quem conferiu)", z.resultados[0].resultado === "validada" && (await um(`select zero_conferido_por, rescisao_valor_validado::float v from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hF}`)).zero_conferido_por === "Helena Recursos");

// ═══ E. Divergência ═══
secao("E. Divergência: manter lançado ou adotar a folha, com motivo e trilha");
check("decidir sem motivo → 422", (await chamar("financeiro_rescisao_decidir", { rescisao_id: hB, decisao: "manter_lancado" })).codigo === 422);
check("decisão inválida → 422; rescisão sem divergência → 422", (await chamar("financeiro_rescisao_decidir", { rescisao_id: hB, decisao: "x", motivo: "m" })).codigo === 422 && (await chamar("financeiro_rescisao_decidir", { rescisao_id: hK, decisao: "manter_lancado", motivo: "m" })).codigo === 422);
const dm = await chamar("financeiro_rescisao_decidir", { rescisao_id: hB, decisao: "manter_lancado", motivo: "Demonstrativo conferido: valor lançado está correto." });
check("manter lançado (Bia): valida com o valor 3500, fechamento intacto", dm.codigo === 200 && Number((await um(`select valor_rescisao::float v from public.peopleflow_desligamentos where colaborador_nome = 'Bia Diverge'`)).v) === 3500 && (await um(`select rescisao_valor_validado::float v, rescisao_decisao d from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hB}`)).d === "manter_lancado");
const da = await chamar("financeiro_rescisao_decidir", { rescisao_id: hJ, decisao: "adotar_folha", motivo: "Lançamento anterior estava errado (demonstrativo)." });
const logJ = await um(`select valor_anterior::float a, valor_novo::float n, motivo from public.peopleflow_fechamentos_log where rescisao_id = ${hJ} and acao = 'decidir_divergencia'`);
check("adotar a folha (Joca): fechamento passa ao líquido 1800 e a trilha guarda o valor ANTERIOR 2500 e o motivo", da.codigo === 200 && Number((await um(`select valor_rescisao::float v from public.peopleflow_desligamentos where colaborador_nome = 'Joca Dois'`)).v) === 1800 && logJ.a === 2500 && logJ.n === 1800 && /errado/.test(logJ.motivo));
check("decidir de novo é recusado", (await chamar("financeiro_rescisao_decidir", { rescisao_id: hB, decisao: "adotar_folha", motivo: "x" })).codigo === 422);

// ═══ F. GRRF (independente da rescisão) ═══
secao("F. GRRF: depósito, multa e total efetivamente recolhido — nada calculado; status próprio");
check("GRRF sem total → 422; sem fonte → 422", (await chamar("financeiro_grrf_registrar", { rescisao_id: hC, deposito: 10, multa: 5, fonte: "guia_grrf" })).codigo === 422 && (await chamar("financeiro_grrf_registrar", { rescisao_id: hC, total: 15 })).codigo === 422);
check("total que não fecha com depósito + multa → 422", (await chamar("financeiro_grrf_registrar", { rescisao_id: hC, deposito: 10, multa: 5, total: 99, fonte: "guia_grrf" })).codigo === 422);
check("valor negativo / não numérico → 422", (await chamar("financeiro_grrf_registrar", { rescisao_id: hC, total: -1, fonte: "guia_grrf" })).codigo === 422 && (await chamar("financeiro_grrf_registrar", { rescisao_id: hC, total: "abc", fonte: "guia_grrf" })).codigo === 422);
check("modalidade ausente no relatório (Gabi): GRRF exige confirmar a modalidade antes", /modalidade/.test((await chamar("financeiro_grrf_registrar", { rescisao_id: hG, total: 10, fonte: "guia_grrf" })).corpo.error));
check("modalidade inválida → 422; confirmar modalidade grava quem confirmou", (await chamar("financeiro_modalidade_confirmar", { rescisao_id: hG, modalidade: "x" })).codigo === 422 && (await chamar("financeiro_modalidade_confirmar", { rescisao_id: hG, modalidade: "dispensa_sem_justa_causa" })).codigo === 200 && (await um(`select modalidade_confirmada_por p from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hG}`)).p === "Helena Recursos");
const g1 = await chamar("financeiro_grrf_registrar", { rescisao_id: hC, deposito: 400, multa: 300, total: 700, fonte: "guia_grrf" });
const rc = await um(`select grrf_status, grrf_total::float t, grrf_deposito::float d, grrf_multa::float m, grrf_fonte from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hC}`);
check("Caio: GRRF registrada (depósito 400 + multa 300 = total 700, fonte guia) e cadastro alimentado", g1.codigo === 200 && rc.grrf_status === "validado" && rc.t === 700 && rc.d === 400 && rc.m === 300 && Number((await um(`select valor_grrf::float g from public.peopleflow_desligamentos where colaborador_nome = 'Caio Novo'`)).g) === 700);
check("a GRRF NÃO foi calculada a partir do saldo FGTS/relatório (o total é exatamente o informado)", rc.t === 700 && rc.t !== 1400 * 0.4);
const g2 = await chamar("financeiro_grrf_registrar", { rescisao_id: hA, total: 100, fonte: "demonstrativo_rescisao" });
check("Alice: GRRF lançada 0 × guia 100 exige CONFIRMAR a substituição (409) — nada gravado antes", g2.codigo === 409 && (await um(`select grrf_status s from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hA}`)).s === "pendente" && Number((await um(`select valor_grrf::float g from public.peopleflow_desligamentos where colaborador_nome = 'Alice Saiu'`)).g) === 0);
const g3 = await chamar("financeiro_grrf_registrar", { rescisao_id: hA, total: 100, fonte: "demonstrativo_rescisao", confirmar_substituicao: true });
const lg = await um(`select valor_anterior::float a, valor_novo::float n from public.peopleflow_fechamentos_log where rescisao_id = ${hA} and acao = 'registrar_grrf'`);
check("confirmada a substituição: grava e a trilha guarda o valor anterior", g3.codigo === 200 && Number((await um(`select valor_grrf::float g from public.peopleflow_desligamentos where colaborador_nome = 'Alice Saiu'`)).g) === 100 && lg.n === 100 && lg.a === 0);
check("corrigir uma GRRF já registrada exige o motivo da correção", (await chamar("financeiro_grrf_registrar", { rescisao_id: hC, total: 710, deposito: 410, multa: 300, fonte: "guia_grrf", confirmar_substituicao: true })).codigo === 422);
const na = await chamar("financeiro_grrf_registrar", { rescisao_id: hK, nao_aplicavel: true, motivo: "Pedido de demissão: sem GRRF a recolher na guia." });
check("'não aplicável' exige motivo e fica como status próprio (total 0)", (await chamar("financeiro_grrf_registrar", { rescisao_id: hE, nao_aplicavel: true })).codigo === 422 && na.codigo === 200 && (await um(`select grrf_status s, grrf_total::float t from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hK}`)).s === "nao_aplicavel");
check("conversão de estágio: GRRF e rescisão recusadas", (await chamar("financeiro_grrf_registrar", { rescisao_id: hH, total: 1, fonte: "guia_grrf" })).codigo === 422);
check("a validação da rescisão independe da GRRF (Eva: rescisão validada, GRRF pendente)", (await um(`select rescisao_status r, grrf_status g from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hE}`)).r === "validado" && (await um(`select grrf_status g from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hE}`)).g === "pendente");

// ═══ G. Dashboard (agregado) ═══
secao("G. Dashboard: só valores validados, por mês efetivo, cobertura e parcial; uma vez por pessoa");
const agg = dados(await chamar("financeiro_agregado", {}));
const mes = Object.fromEntries(agg.meses.map((m) => [m.mes, m]));
check("quantidade continua 9 saídas efetivas (conversão fora)", agg.meses.reduce((a, m) => a + m.quantidade, 0) === 9);
check("julho (Alice 1000, Bia 3500 mantido, Joca 1800 adotado): rescisão 6300 validada nas 3; GRRF só Alice 100", mes["2026-07"].quantidade === 3 && mes["2026-07"].rescisao === 6300 && mes["2026-07"].rescisaoValidadas === 3 && mes["2026-07"].grrf === 100 && mes["2026-07"].grrfResolvidas === 1 && mes["2026-07"].total === 6400 && mes["2026-07"].parcial === true, JSON.stringify(mes["2026-07"]));
check("outubro (Caio): rescisão 5000 + GRRF 700 = 5000+700, completo (não parcial)", mes["2026-10"].rescisao === 5000 && mes["2026-10"].grrf === 700 && mes["2026-10"].total === 5700 && mes["2026-10"].parcial === false);
check("janeiro (Eva): rescisão 4000 validada, GRRF pendente → total 4000 PARCIAL", mes["2026-01"].rescisao === 4000 && mes["2026-01"].grrf === 0 && mes["2026-01"].parcial === true && mes["2026-01"].grrfResolvidas === 0);
check("fevereiro (Fabio, líquido 0 conferido): quantidade 1, rescisão 0 validada, parcial (GRRF pendente)", mes["2026-02"].quantidade === 1 && mes["2026-02"].rescisaoValidadas === 1 && mes["2026-02"].rescisao === 0 && mes["2026-02"].parcial);
check("março (Gabi): nada validado → valores 0 e parcial; agosto (Kleber): GRRF 'não aplicável' conta como resolvida", mes["2026-03"].total === 0 && mes["2026-03"].parcial && mes["2026-08"].grrfResolvidas === 1 && mes["2026-08"].rescisaoValidadas === 0);
check("cobertura total: 6 de 9 rescisões validadas; GRRF resolvida em 3 de 9 (Alice, Caio, Kleber)", agg.cobertura.saidas === 9 && agg.cobertura.rescisaoValidadas === 6 && agg.cobertura.grrfResolvidas === 3 && agg.cobertura.completa === false, JSON.stringify(agg.cobertura));
const aggPer = dados(await chamar("financeiro_agregado", { inicio: "2026-07-01", fim: "2026-07-31" }));
check("filtro de período aplica a data efetiva (só julho)", aggPer.meses.length === 1 && aggPer.meses[0].mes === "2026-07" && aggPer.meses[0].quantidade === 3);
const aggSet = dados(await chamar("financeiro_agregado", { setor: "Logística" }));
check("filtro de setor vale para cadastro e histórico (Logística: Caio, Joca, Gabi = 3)", aggSet.meses.reduce((a, m) => a + m.quantidade, 0) === 3, JSON.stringify(aggSet.meses.map((m) => [m.mes, m.quantidade])));
check("Diretoria e Gestor NÃO veem os totais agregados (403); o RH vê os totais", (await chamar("financeiro_agregado", {}, U.DIR)).codigo === 403 && (await chamar("financeiro_agregado", {}, U.GES)).codigo === 403 && JSON.stringify(dados(await chamar("financeiro_agregado", {}, U.RH)).meses) === JSON.stringify(agg.meses));
check("sem duplicidade: o total da soma mensal = soma de cada pessoa uma vez (rescisão 6300+0+5000+4000 = 15300)", agg.meses.reduce((a, m) => a + m.rescisao, 0) === 15300 && agg.meses.reduce((a, m) => a + m.grrf, 0) === 800);

// ═══ H. Lançamento manual (sem folha) ═══
secao("H. Lançamento manual: LANÇAR não valida; a validação é expressa, com fonte documental, e cada componente tem a sua");
check("com rescisão da folha → 409 ao lançar e ao validar (use a Conferência financeira)", (await chamar("financeiro_fechamento_salvar", { colaborador_nome: "Alice Saiu", valor_rescisao: 9, valor_grrf: 9 })).codigo === 409 && (await chamar("financeiro_fechamento_validar", { colaborador_nome: "Alice Saiu", componente: "rescisao", fonte: "outro_documento" })).codigo === 409);
check("colaborador ativo / inexistente → 422", (await chamar("financeiro_fechamento_salvar", { colaborador_nome: "Hugo Convertido", valor_rescisao: 1 })).codigo === 422 && (await chamar("financeiro_fechamento_salvar", { colaborador_nome: "Ninguém", valor_rescisao: 1 })).codigo === 422);
check("valor negativo → 422", (await chamar("financeiro_fechamento_salvar", { colaborador_nome: "Iara Manual", valor_rescisao: -5 })).codigo === 422);
check("Gestor e Diretoria não validam lançamentos → 403", (await chamar("financeiro_fechamento_validar", { colaborador_nome: "Iara Manual", componente: "rescisao", fonte: "outro_documento" }, U.GES)).codigo === 403 && (await chamar("financeiro_fechamento_validar", { colaborador_nome: "Iara Manual", componente: "rescisao", fonte: "outro_documento" }, U.DIR)).codigo === 403);
const ms = await chamar("financeiro_fechamento_salvar", { colaborador_nome: "Iara Manual", valor_rescisao: "2.500,50", valor_grrf: 0 });
const linI = async () => linha(dados(await chamar("financeiro_listar", {})).saidas, "Iara Manual");
const rowI = () => um(`select valor_rescisao::float v, valor_grrf::float g, origem, rescisao_validada_em, rescisao_validada_por, rescisao_fonte, grrf_validada_em, grrf_validada_por, grrf_fonte, grrf_nao_aplicavel, grrf_justificativa from public.peopleflow_desligamentos where colaborador_nome = 'Iara Manual'`);
const fI = await rowI();
check("lançar grava (vírgula decimal aceita), origem manual e NÃO valida nada (nem a rescisão, nem a GRRF 0)", ms.codigo === 200 && fI.v === 2500.5 && fI.g === 0 && fI.origem === "manual" && fI.rescisao_validada_em === null && fI.grrf_validada_em === null && ms.corpo.dados.validado === false);
let lI = await linI();
check("na conferência: rescisão 'pendente' (lançado 2.500,50) e GRRF 'pendente' (0 lançado NÃO resolve a GRRF)", lI.rescisao.status === "pendente" && lI.rescisao.lancado === 2500.5 && lI.grrf.status === "pendente" && lI.grrf.lancado === 0);
const aggP = dados(await chamar("financeiro_agregado", {}));
check("o lançamento ainda não validado NÃO entra nos custos (setembro: rescisão 0, parcial)", aggP.meses.find((m) => m.mes === "2026-09").rescisao === 0 && aggP.meses.find((m) => m.mes === "2026-09").parcial === true);
check("validar sem fonte → 422; fonte inválida → 422", (await chamar("financeiro_fechamento_validar", { colaborador_nome: "Iara Manual", componente: "rescisao" })).codigo === 422 && (await chamar("financeiro_fechamento_validar", { colaborador_nome: "Iara Manual", componente: "rescisao", fonte: "folha_rescisao" })).codigo === 422);
check("componente inválido → 422", (await chamar("financeiro_fechamento_validar", { colaborador_nome: "Iara Manual", componente: "xyz", fonte: "outro_documento" })).codigo === 422);
const vr = await chamar("financeiro_fechamento_validar", { colaborador_nome: "Iara Manual", componente: "rescisao", fonte: "demonstrativo_rescisao", observacao: "Conferido no demonstrativo impresso." });
const fI2 = await rowI();
check("rescisão validada com FONTE documental, responsável e data", vr.codigo === 200 && fI2.rescisao_fonte === "demonstrativo_rescisao" && fI2.rescisao_validada_por === "Helena Recursos" && fI2.rescisao_validada_em !== null);
check("validar de novo → 422 (sem nova trilha)", (await chamar("financeiro_fechamento_validar", { colaborador_nome: "Iara Manual", componente: "rescisao", fonte: "demonstrativo_rescisao" })).codigo === 422);
lI = await linI();
check("validar a rescisão NÃO resolve a GRRF: continua pendente (componentes independentes)", lI.rescisao.status === "validado" && lI.rescisao.fonte === "demonstrativo_rescisao" && lI.grrf.status === "pendente");
check("GRRF 'não aplicável' sem justificativa → 422 (não se confunde com pendente)", (await chamar("financeiro_fechamento_validar", { colaborador_nome: "Iara Manual", componente: "grrf", nao_aplicavel: true })).codigo === 422);
const vna = await chamar("financeiro_fechamento_validar", { colaborador_nome: "Iara Manual", componente: "grrf", nao_aplicavel: true, justificativa: "Pedido de demissão: sem GRRF na guia." });
const fI3 = await rowI();
lI = await linI();
check("GRRF 'não aplicável' com justificativa: resolvida com R$ 0,00 (responsável, data e justificativa registrados)", vna.codigo === 200 && fI3.grrf_nao_aplicavel === true && fI3.g === 0 && /sem GRRF/.test(fI3.grrf_justificativa) && fI3.grrf_validada_por === "Helena Recursos" && lI.grrf.status === "nao_aplicavel" && lI.grrf.total === 0);
// um novo valor de GRRF desfaz a resolução anterior e exige nova confirmação com fonte
await chamar("financeiro_fechamento_salvar", { colaborador_nome: "Iara Manual", valor_rescisao: 2500.5, valor_grrf: 300 });
const fI4 = await rowI();
lI = await linI();
check("alterar o valor da GRRF desfaz a resolução dela (volta a pendente), mantendo a rescisão já validada (valor igual)", fI4.grrf_validada_em === null && fI4.grrf_nao_aplicavel === false && fI4.grrf_justificativa === null && lI.grrf.status === "pendente" && lI.rescisao.status === "validado");
const vg = await chamar("financeiro_fechamento_validar", { colaborador_nome: "Iara Manual", componente: "grrf", fonte: "guia_grrf" });
lI = await linI();
check("GRRF lançada 300 validada com a fonte (guia); status do componente próprio", vg.codigo === 200 && lI.grrf.status === "validado" && lI.grrf.total === 300 && lI.grrf.fonte === "guia_grrf");
const aggI = dados(await chamar("financeiro_agregado", {}));
check("depois da validação expressa o lançamento entra no mês efetivo (setembro: 2500,50 + 300 = 2800,50; completo)", aggI.meses.find((m) => m.mes === "2026-09").rescisao === 2500.5 && aggI.meses.find((m) => m.mes === "2026-09").grrf === 300 && aggI.meses.find((m) => m.mes === "2026-09").total === 2800.5 && aggI.meses.find((m) => m.mes === "2026-09").parcial === false);
await chamar("financeiro_fechamento_salvar", { colaborador_nome: "Iara Manual", valor_rescisao: 0, valor_grrf: 300 });
check("alterar a rescisão desfaz a validação dela; valor 0 exige conferência expressa para validar", (await linI()).rescisao.status === "pendente" && (await chamar("financeiro_fechamento_validar", { colaborador_nome: "Iara Manual", componente: "rescisao", fonte: "outro_documento" })).codigo === 422 && (await chamar("financeiro_fechamento_validar", { colaborador_nome: "Iara Manual", componente: "rescisao", fonte: "outro_documento", zero_conferido: true })).codigo === 200);
await chamar("financeiro_fechamento_salvar", { colaborador_nome: "Iara Manual", valor_rescisao: 2500.5, valor_grrf: 300 });
await chamar("financeiro_fechamento_validar", { colaborador_nome: "Iara Manual", componente: "rescisao", fonte: "demonstrativo_rescisao" });
const logsI = await sql(`select acao, count(*)::int n from public.peopleflow_fechamentos_log where colaborador_nome = 'Iara Manual' group by 1`);
check("trilha: lançamentos, validações, 'não aplicável' e desfazimentos registrados", logsI.some((l) => l.acao === "lancamento_manual") && logsI.some((l) => l.acao === "validar_lancamento" && l.n >= 3) && logsI.some((l) => l.acao === "grrf_nao_aplicavel"));
check("constraint do banco: validar sem fonte documental é impossível (CHECK)", /validacao_chk/.test(String(await falha(() => db.exec(`insert into public.peopleflow_desligamentos (colaborador_nome, valor_rescisao, rescisao_validada_em, rescisao_validada_por) values ('Zzz Teste', 1, now(), 'x')`)))) && /validacao_chk/.test(String(await falha(() => db.exec(`insert into public.peopleflow_desligamentos (colaborador_nome, valor_grrf, grrf_validada_em, grrf_validada_por, grrf_nao_aplicavel) values ('Zzz Teste', 0, now(), 'x', true)`)))));

// ═══ I. Preservação ═══
secao("I. Preservação: cadastro, histórico, MPs, importados e trilha");
check("colaboradores e histórico de rescisões idênticos ao início", (await hashTab("colaboradores", "id")) === antes.colab && (await hashTab("peopleflow_rescisoes_historico", "id")) === antes.hist);
check("valores importados da folha idênticos (24→9 linhas, mesmos números)", (await um(`select md5(string_agg(concat_ws('|', rescisao_id, saldo_fgts, salario, proventos, descontos, liquido, fgts_rescisorio), ';' order by rescisao_id)) h from public.peopleflow_rescisoes_historico_rubricas `)).h === antesRub);
check("a trilha é somente inserção (update/delete recusados)", /somente inserção/.test(String(await falha(() => db.exec(`update public.peopleflow_fechamentos_log set por = 'x'`)))) && /somente inserção/.test(String(await falha(() => db.exec(`delete from public.peopleflow_fechamentos_log`)))));
check("conversão de estágio segue sem nenhuma validação", (await um(`select rescisao_status r, grrf_status g from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hH}`)).r === "proposto");

// ═══ L. Lançamento simples: um diálogo, uma operação (lança e confirma), origem "Informado e confirmado pelo RH" ═══
secao("L. Lançamento simples: migration aditiva + ação única que salva e confirma Rescisão e GRRF");
const instantaneoAntes = {
  fech: (await sql(`select md5(to_jsonb(x)::text) h, colaborador_nome from public.peopleflow_desligamentos x order by colaborador_nome`)),
  rub: (await um(`select md5(string_agg(to_jsonb(x)::text, '|' order by x.rescisao_id)) h from public.peopleflow_rescisoes_historico_rubricas x`)).h,
  logN: Number((await um(`select count(*)::int n from public.peopleflow_fechamentos_log`)).n),
};
const valorInforme = `insert into public.peopleflow_desligamentos (colaborador_nome, valor_rescisao, rescisao_validada_em, rescisao_validada_por, rescisao_fonte) values ('Teste Constraint', 10, now(), 'RH', 'informado_rh')`;
check("ANTES da migration simples: a origem 'informado_rh' é recusada pelo CHECK existente (por isso a migration nova é necessária)", /validacao_chk/.test(String(await falha(() => db.exec(valorInforme)))));
const MIG2 = rd("desligamentos_financeiro_lancamento_simples.sql");
check("migration simples roda sem erro e é idempotente", (await falha(() => db.exec(MIG2))) === null && (await falha(() => db.exec(MIG2))) === null);
const depoisFech = await sql(`select md5(to_jsonb(x)::text) h, colaborador_nome from public.peopleflow_desligamentos x order by colaborador_nome`);
check("nenhum fechamento existente foi alterado pela migration; rubricas importadas e trilha idênticas", JSON.stringify(depoisFech) === JSON.stringify(instantaneoAntes.fech)
  && (await um(`select md5(string_agg(to_jsonb(x)::text, '|' order by x.rescisao_id)) h from public.peopleflow_rescisoes_historico_rubricas x`)).h === instantaneoAntes.rub
  && Number((await um(`select count(*)::int n from public.peopleflow_fechamentos_log`)).n) === instantaneoAntes.logN);
// as proteções de responsável, data e consistência continuam exatamente iguais
const tenta = (cols, vals) => falha(() => db.exec(`insert into public.peopleflow_desligamentos (colaborador_nome, ${cols}) values ('Teste Constraint', ${vals})`));
check("DEPOIS: 'informado_rh' com responsável e data é aceito (e removido em seguida)", (await falha(() => db.exec(valorInforme))) === null && (await falha(() => db.exec(`delete from public.peopleflow_desligamentos where colaborador_nome = 'Teste Constraint'`))) === null);
check("DEPOIS: continua recusado — validar SEM responsável (nulo e em branco)", /validacao_chk/.test(String(await tenta("valor_rescisao, rescisao_validada_em, rescisao_fonte", "10, now(), 'informado_rh'"))) && /validacao_chk/.test(String(await tenta("valor_rescisao, rescisao_validada_em, rescisao_validada_por, rescisao_fonte", "10, now(), '   ', 'informado_rh'"))));
check("DEPOIS: continua recusado — responsável sem data, e origem inventada", /validacao_chk/.test(String(await tenta("valor_rescisao, rescisao_validada_por, rescisao_fonte", "10, 'RH', 'informado_rh'"))) && /validacao_chk/.test(String(await tenta("valor_rescisao, rescisao_validada_em, rescisao_validada_por, rescisao_fonte", "10, now(), 'RH', 'qualquer_coisa'"))));
check("DEPOIS: continua recusado — validar sem valor; GRRF validada sem valor ou sem origem", /validacao_chk/.test(String(await tenta("rescisao_validada_em, rescisao_validada_por, rescisao_fonte", "now(), 'RH', 'informado_rh'"))) && /validacao_chk/.test(String(await tenta("valor_grrf, grrf_validada_em, grrf_validada_por", "100, now(), 'RH'"))) && /validacao_chk/.test(String(await tenta("grrf_validada_em, grrf_validada_por, grrf_fonte", "now(), 'RH', 'informado_rh'"))));
check("DEPOIS: continua recusado — 'não aplicável' sem justificativa, com valor diferente de 0 ou com origem", /validacao_chk/.test(String(await tenta("valor_grrf, grrf_validada_em, grrf_validada_por, grrf_nao_aplicavel", "0, now(), 'RH', true"))) && /validacao_chk/.test(String(await tenta("valor_grrf, grrf_validada_em, grrf_validada_por, grrf_nao_aplicavel, grrf_justificativa", "50, now(), 'RH', true, 'x'"))) && /validacao_chk/.test(String(await tenta("valor_grrf, grrf_validada_em, grrf_validada_por, grrf_nao_aplicavel, grrf_justificativa, grrf_fonte", "0, now(), 'RH', true, 'x', 'informado_rh'"))));
check("DEPOIS: rubricas — grrf_fonte inventada continua recusada; 'informado_rh' aceita só com total, data e responsável", /grrf_chk/.test(String(await falha(() => db.exec(`update public.peopleflow_rescisoes_historico_rubricas set grrf_fonte = 'inventada' where rescisao_id = ${hJ}`)))) && /grrf_status_chk/.test(String(await falha(() => db.exec(`update public.peopleflow_rescisoes_historico_rubricas set grrf_status = 'validado', grrf_total = 10, grrf_fonte = 'informado_rh' where rescisao_id = ${hJ}`)))));

// ── massa fictícia deste bloco ──
await ins("Nina Nova", "Auxiliar", "Produção", "Gil Gestor", "2025-07-07", true, "2026-09-15");
await ins("Rui Rapido", "Auxiliar", "Produção", "Gil Gestor", "2025-07-08", true, "2026-09-16");
await ins("Zeca Zero", "Auxiliar", "Logística", "Gil Gestor", "2025-07-09", true, "2026-09-17");
const idLara = await ins("Lara Folha", "Auxiliar", "Produção", "Gil Gestor", "2025-08-01", true, "2026-09-18");
const idPedro = await ins("Pedro Zero", "Auxiliar", "Produção", "Gil Gestor", "2025-08-02", true, "2026-09-19");
const idDora = await ins("Dora Diverge", "Auxiliar", "Logística", "Gil Gestor", "2025-08-03", true, "2026-09-20");
const idMarta = await ins("Marta SemTipo", "Auxiliar", "Logística", "Gil Gestor", "2025-08-04", true, "2026-09-21");
const hLara = await histIns(401, "Lara Folha", "2025-08-01", "2026-09-18", "Pedido de demissão sem justa causa", "Produção", "saida_efetiva", idLara); await rubIns(hLara, 3000, 200);
const hPedro = await histIns(402, "Pedro Zero", "2025-08-02", "2026-09-19", "Pedido de demissão sem justa causa", "Produção", "saida_efetiva", idPedro); await rubIns(hPedro, 0, 50);
const hDora = await histIns(403, "Dora Diverge", "2025-08-03", "2026-09-20", "Pedido de demissão sem justa causa", "Logística", "saida_efetiva", idDora); await rubIns(hDora, 1200, 90);
const hMarta = await histIns(404, "Marta SemTipo", "2025-08-04", "2026-09-21", "", "Logística", "saida_efetiva", idMarta); await rubIns(hMarta, 1700, 110);
const hSolo = await histIns(405, "Hist Solo", "2024-09-01", "2026-09-22", "Demitido sem justa causa", "Produção", "saida_efetiva", null); await rubIns(hSolo, 2100, 150);
await db.exec(`insert into public.peopleflow_desligamentos (colaborador_nome, valor_rescisao, valor_grrf, updated_by) values ('Dora Diverge', 999, null, 'RH')`);

const logDe = (nome) => sql(`select acao, valor_anterior::float a, valor_novo::float n, origem, por, motivo, detalhe from public.peopleflow_fechamentos_log where colaborador_nome = '${nome}' order by id`);
const linhaDe = async (nome) => linha(dados(await chamar("financeiro_listar", {})).saidas, nome);
const fechDe = (nome) => um(`select valor_rescisao::float v, valor_grrf::float g, origem, rescisao_validada_em, rescisao_validada_por, rescisao_fonte, grrf_validada_em, grrf_validada_por, grrf_fonte, grrf_nao_aplicavel, grrf_justificativa from public.peopleflow_desligamentos where colaborador_nome = '${nome}'`);
const mesSet = async () => dados(await chamar("financeiro_agregado", {}, U.RH)).meses.find((m) => m.mes === "2026-09") ?? { rescisao: 0, grrf: 0, total: 0, parcial: true };

// ── validações de entrada e autorização ──
const sem = { colaborador_nome: "Nina Nova", valor_rescisao: "2.500,50", grrf_modo: "pendente", confirmacao_rh: true };
check("sem a confirmação expressa do RH → 422 e nada é gravado", (await chamar("financeiro_lancamento_confirmar", { ...sem, confirmacao_rh: undefined })).codigo === 422 && (await chamar("financeiro_lancamento_confirmar", { ...sem, confirmacao_rh: "true" })).codigo === 422 && (await fechDe("Nina Nova")) === undefined);
check("Gestor e Diretoria → 403; sem token → 401", (await chamar("financeiro_lancamento_confirmar", sem, U.GES)).codigo === 403 && (await chamar("financeiro_lancamento_confirmar", sem, U.DIR)).codigo === 403 && (await chamar("financeiro_lancamento_confirmar", sem, null)).codigo === 401);
check("situação da GRRF ausente ou inválida → 422", (await chamar("financeiro_lancamento_confirmar", { ...sem, grrf_modo: undefined })).codigo === 422 && (await chamar("financeiro_lancamento_confirmar", { ...sem, grrf_modo: "tanto_faz" })).codigo === 422);
check("primeira confirmação sem valor de rescisão → 422; valor negativo → 422", (await chamar("financeiro_lancamento_confirmar", { ...sem, valor_rescisao: undefined })).codigo === 422 && (await chamar("financeiro_lancamento_confirmar", { ...sem, valor_rescisao: -1 })).codigo === 422);
check("colaborador com rescisão da folha não entra pelo caminho manual → 409; ativo/inexistente → 422", (await chamar("financeiro_lancamento_confirmar", { ...sem, colaborador_nome: "Lara Folha" })).codigo === 409 && (await chamar("financeiro_lancamento_confirmar", { ...sem, colaborador_nome: "Hugo Convertido" })).codigo === 422 && (await chamar("financeiro_lancamento_confirmar", { ...sem, colaborador_nome: "Ninguém" })).codigo === 422);
check("GRRF: valor R$ 0,00 não resolve (usar 'não aplicável'); sem valor ou justificativa → 422", (await chamar("financeiro_lancamento_confirmar", { ...sem, grrf_modo: "valor", valor_grrf: 0 })).codigo === 422 && (await chamar("financeiro_lancamento_confirmar", { ...sem, grrf_modo: "valor" })).codigo === 422 && (await chamar("financeiro_lancamento_confirmar", { ...sem, grrf_modo: "nao_aplicavel" })).codigo === 422);
check("nenhuma tentativa recusada gravou nada (fechamento nem trilha)", (await fechDe("Nina Nova")) === undefined && (await logDe("Nina Nova")).length === 0);

// ── sem folha: Rescisão confirmada, GRRF pendente ──
const antesSet = await mesSet();
const r1 = await chamar("financeiro_lancamento_confirmar", sem);
const f1 = await fechDe("Nina Nova");
check("UMA operação lança e confirma a Rescisão (vírgula decimal aceita); usuário, data e origem automáticos", r1.codigo === 200 && f1.v === 2500.5 && f1.rescisao_validada_por === "Helena Recursos" && f1.rescisao_validada_em !== null && f1.rescisao_fonte === "informado_rh" && f1.origem === "manual");
check("GRRF pode permanecer PENDENTE: nada lançado, nada confirmado", f1.g === null && f1.grrf_validada_em === null && f1.grrf_fonte === null && f1.grrf_nao_aplicavel === false);
let ln = await linhaDe("Nina Nova");
check("na conferência: rescisão validada (origem informada pelo RH) e GRRF pendente", ln.rescisao.status === "validado" && ln.rescisao.valor === 2500.5 && ln.rescisao.fonte === "informado_rh" && ln.rescisao.validadaPor === "Helena Recursos" && ln.grrf.status === "pendente");
const s1 = await mesSet();
check("Dashboard reflete automaticamente a rescisão confirmada (sem a GRRF) e marca o mês como PARCIAL", Math.round((s1.rescisao - antesSet.rescisao) * 100) === 250050 && s1.grrf === antesSet.grrf && s1.parcial === true);
check("reenviar os mesmos valores → 422 (nada duplicado na trilha nem no Dashboard)", (await chamar("financeiro_lancamento_confirmar", sem)).codigo === 422 && (await mesSet()).total === s1.total && (await logDe("Nina Nova")).length === 1);

// ── sem folha: GRRF confirmada depois ──
const r2 = await chamar("financeiro_lancamento_confirmar", { colaborador_nome: "Nina Nova", valor_rescisao: 2500.5, grrf_modo: "valor", valor_grrf: "800,00", confirmacao_rh: true });
const f2 = await fechDe("Nina Nova");
check("a GRRF é informada e confirmada depois, sem mexer na rescisão já confirmada (mesmo valor = sem exigir motivo)", r2.codigo === 200 && f2.g === 800 && f2.grrf_fonte === "informado_rh" && f2.grrf_validada_por === "Helena Recursos" && f2.grrf_nao_aplicavel === false && f2.v === 2500.5 && String(f2.rescisao_validada_em) === String(f1.rescisao_validada_em));
const s2 = await mesSet();
check("Dashboard soma a GRRF confirmada uma única vez (sem duplicar a rescisão)", Math.round((s2.grrf - s1.grrf) * 100) === 80000 && s2.rescisao === s1.rescisao && Math.round((s2.total - s1.total) * 100) === 80000);

// ── alteração posterior: novo motivo, nova confirmação, histórico preservado ──
const alt = { colaborador_nome: "Nina Nova", valor_rescisao: 2600, grrf_modo: "valor", valor_grrf: 800, confirmacao_rh: true };
check("alterar valor JÁ CONFIRMADO sem motivo → 422 e nada muda", (await chamar("financeiro_lancamento_confirmar", alt)).codigo === 422 && (await fechDe("Nina Nova")).v === 2500.5);
const r3 = await chamar("financeiro_lancamento_confirmar", { ...alt, motivo: "Demonstrativo corrigido pelo DP." });
const f3 = await fechDe("Nina Nova");
const log3 = await logDe("Nina Nova");
check("com motivo: novo valor confirmado de novo (nova data/responsável)", r3.codigo === 200 && f3.v === 2600 && f3.rescisao_validada_por === "Helena Recursos" && f3.rescisao_fonte === "informado_rh" && f3.g === 800);
const logAlt = log3.find((l) => l.a === 2500.5 && l.n === 2600);
check("HISTÓRICO PRESERVADO: a trilha guarda o valor anterior, o novo, o motivo e a confirmação anterior (responsável, data, origem)", logAlt && logAlt.motivo === "Demonstrativo corrigido pelo DP." && logAlt.detalhe.confirmacao_anterior.valor === 2500.5 && logAlt.detalhe.confirmacao_anterior.por === "Helena Recursos" && logAlt.detalhe.confirmacao_anterior.fonte === "informado_rh" && logAlt.detalhe.alteracao === true && logAlt.detalhe.fluxo === "lancamento_simples");
check("toda linha da trilha tem responsável e origem 'informado_rh'", log3.length === 3 && log3.every((l) => l.por === "Helena Recursos" && l.origem === "informado_rh"));
check("GRRF já confirmada não volta a 'pendente' por este caminho → 422", (await chamar("financeiro_lancamento_confirmar", { ...alt, motivo: "x", grrf_modo: "pendente" })).codigo === 422);
check("GRRF 'não aplicável' sobre valor confirmado: exige justificativa E motivo", (await chamar("financeiro_lancamento_confirmar", { ...alt, grrf_modo: "nao_aplicavel", motivo: "ajuste" })).codigo === 422 && (await chamar("financeiro_lancamento_confirmar", { ...alt, grrf_modo: "nao_aplicavel", justificativa: "Pedido de demissão: sem GRRF." })).codigo === 422);
const r4 = await chamar("financeiro_lancamento_confirmar", { ...alt, grrf_modo: "nao_aplicavel", justificativa: "Pedido de demissão: sem GRRF.", motivo: "Guia não existe para esta modalidade." });
const f4 = await fechDe("Nina Nova");
check("com justificativa e motivo: GRRF 'não aplicável' (R$ 0,00 resolvido, sem origem de documento)", r4.codigo === 200 && f4.grrf_nao_aplicavel === true && f4.g === 0 && f4.grrf_fonte === null && /sem GRRF/.test(f4.grrf_justificativa) && f4.grrf_validada_por === "Helena Recursos");
const log4 = (await logDe("Nina Nova")).find((l) => l.acao === "grrf_nao_aplicavel");
check("e a GRRF de 800 anterior continua na trilha, com quem confirmou e quando", log4 && log4.a === 800 && log4.n === 0 && log4.detalhe.confirmacao_anterior.valor === 800 && log4.detalhe.confirmacao_anterior.por === "Helena Recursos" && log4.detalhe.confirmacao_anterior.em);
ln = await linhaDe("Nina Nova");
check("conferência: GRRF 'não aplicável' = resolvida com R$ 0,00 (diferente de pendente)", ln.grrf.status === "nao_aplicavel" && ln.grrf.total === 0 && ln.rescisao.valor === 2600);
const s4 = await mesSet();
check("Dashboard acompanha a alteração (rescisão 2.600, GRRF fora do total)", Math.round((s4.rescisao - antesSet.rescisao) * 100) === 260000 && s4.grrf === antesSet.grrf);

// ── rescisão e GRRF 'não aplicável' juntas; rescisão zero ──
const r5 = await chamar("financeiro_lancamento_confirmar", { colaborador_nome: "Rui Rapido", valor_rescisao: 1000, grrf_modo: "nao_aplicavel", justificativa: "Término de contrato: sem GRRF.", confirmacao_rh: true });
const f5 = await fechDe("Rui Rapido");
const l5 = await logDe("Rui Rapido");
check("rescisão + GRRF 'não aplicável' (com justificativa) numa operação só", r5.codigo === 200 && f5.v === 1000 && f5.rescisao_fonte === "informado_rh" && f5.grrf_nao_aplicavel === true && f5.g === 0 && f5.grrf_fonte === null && l5.length === 2 && l5.every((l) => l.por === "Helena Recursos"));
check("rescisão R$ 0,00 exige confirmação expressa; com ela é aceita", (await chamar("financeiro_lancamento_confirmar", { colaborador_nome: "Zeca Zero", valor_rescisao: 0, grrf_modo: "pendente", confirmacao_rh: true })).codigo === 422 && (await fechDe("Zeca Zero")) === undefined
  && (await chamar("financeiro_lancamento_confirmar", { colaborador_nome: "Zeca Zero", valor_rescisao: 0, grrf_modo: "pendente", zero_conferido: true, confirmacao_rh: true })).codigo === 200 && (await fechDe("Zeca Zero")).rescisao_validada_em !== null);

// ── com folha: o líquido da folha é a rescisão; GRRF informada e confirmada junto ──
check("conversão de estágio → 422 (não é desligamento)", (await chamar("financeiro_lancamento_confirmar", { rescisao_id: hH, confirmar_liquido: true, grrf_modo: "pendente", confirmacao_rh: true })).codigo === 422);
const folhaBase = { rescisao_id: hLara, confirmar_liquido: true, grrf_modo: "valor", valor_grrf: 450, confirmacao_rh: true };
const r6 = await chamar("financeiro_lancamento_confirmar", folhaBase);
const rubL = await um(`select rescisao_status, rescisao_valor_validado::float v, rescisao_validada_por, grrf_status, grrf_total::float t, grrf_fonte, grrf_deposito, grrf_multa, grrf_validada_por, grrf_validada_em from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hLara}`);
check("folha: confirma o líquido (3.000) e a GRRF (450) numa operação; sem depósito/multa/anexos; origem informada pelo RH", r6.codigo === 200 && rubL.rescisao_status === "validado" && rubL.v === 3000 && rubL.rescisao_validada_por === "Helena Recursos" && rubL.grrf_status === "validado" && rubL.t === 450 && rubL.grrf_fonte === "informado_rh" && rubL.grrf_deposito === null && rubL.grrf_multa === null && rubL.grrf_validada_por === "Helena Recursos");
const fL = await fechDe("Lara Folha");
check("folha: fechamento da pessoa criado/atualizado com os dois valores confirmados (rescisão pela folha, GRRF informada pelo RH)", fL.v === 3000 && fL.g === 450 && fL.origem === "folha" && fL.rescisao_fonte === "folha_rescisao" && fL.grrf_fonte === "informado_rh" && fL.grrf_validada_por === "Helena Recursos");
const lgL = await logDe("Lara Folha");
check("folha: trilha com a validação do líquido e o registro da GRRF", lgL.some((l) => l.acao === "validar_rescisao") && lgL.some((l) => l.acao === "registrar_grrf" && l.n === 450 && l.origem === "informado_rh" && l.por === "Helena Recursos"));
check("folha: reenviar o mesmo → 422; alterar a GRRF sem motivo → 422; pendente de volta → 422", (await chamar("financeiro_lancamento_confirmar", folhaBase)).codigo === 422 && (await chamar("financeiro_lancamento_confirmar", { ...folhaBase, confirmar_liquido: undefined, valor_grrf: 500 })).codigo === 422 && (await chamar("financeiro_lancamento_confirmar", { ...folhaBase, grrf_modo: "pendente", motivo: "x" })).codigo === 422);
check("folha: alterar a GRRF com motivo → ok; a confirmação anterior (450) fica na trilha", (await chamar("financeiro_lancamento_confirmar", { ...folhaBase, confirmar_liquido: undefined, valor_grrf: 500, motivo: "Guia retificada." })).codigo === 200
  && (await um(`select grrf_total::float t from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hLara}`)).t === 500
  && (await logDe("Lara Folha")).some((l) => l.acao === "registrar_grrf" && l.a === 450 && l.n === 500 && l.motivo === "Guia retificada." && l.detalhe.confirmacao_anterior.total === 450 && l.detalhe.confirmacao_anterior.por === "Helena Recursos"));
check("o líquido importado da folha segue IMUTÁVEL (3.000): um valor de rescisão digitado para rescisão da folha não muda nada", (await chamar("financeiro_lancamento_confirmar", { rescisao_id: hLara, valor_rescisao: 1, grrf_modo: "valor", valor_grrf: 500, confirmacao_rh: true })).codigo === 422 && (await um(`select liquido::float l from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hLara}`)).l === 3000);

// líquido zero e divergência continuam exigindo decisão expressa
const rz = await chamar("financeiro_lancamento_confirmar", { rescisao_id: hPedro, confirmar_liquido: true, grrf_modo: "pendente", confirmacao_rh: true });
check("folha: líquido R$ 0,00 sem conferência expressa → 422 e nada gravado", rz.codigo === 422 && (await um(`select rescisao_status s from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hPedro}`)).s === "proposto");
check("folha: com a conferência expressa o líquido zero é confirmado", (await chamar("financeiro_lancamento_confirmar", { rescisao_id: hPedro, confirmar_liquido: true, zero_conferido: true, grrf_modo: "pendente", confirmacao_rh: true })).codigo === 200 && (await um(`select rescisao_status s, zero_conferido_em z from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hPedro}`)).z !== null);
const rd1 = await chamar("financeiro_lancamento_confirmar", { rescisao_id: hDora, confirmar_liquido: true, grrf_modo: "valor", valor_grrf: 300, confirmacao_rh: true });
check("folha: divergência (lançado 999 × líquido 1.200) NÃO é confirmada pelo diálogo (decisão expressa) e a GRRF não é gravada junto", rd1.codigo === 422 && /diverg|decida/i.test(rd1.corpo.error) && (await um(`select rescisao_status s, grrf_status g from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hDora}`)).g === "pendente");
check("folha: sem tentar confirmar o líquido, a GRRF pode ser confirmada mesmo com divergência; o lançamento divergente é preservado", (await chamar("financeiro_lancamento_confirmar", { rescisao_id: hDora, grrf_modo: "valor", valor_grrf: 300, confirmacao_rh: true })).codigo === 200
  && (await um(`select rescisao_status s, grrf_status g from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hDora}`)).s === "proposto" && (await fechDe("Dora Diverge")).v === 999);

// modalidade ausente segue sendo exigida para a GRRF, mas não para confirmar o líquido
check("folha: sem modalidade, GRRF → 422; só o líquido (GRRF pendente) é confirmado normalmente", (await chamar("financeiro_lancamento_confirmar", { rescisao_id: hMarta, grrf_modo: "valor", valor_grrf: 200, confirmacao_rh: true })).codigo === 422
  && (await chamar("financeiro_lancamento_confirmar", { rescisao_id: hMarta, confirmar_liquido: true, grrf_modo: "pendente", confirmacao_rh: true })).codigo === 200);
check("folha: depois de confirmada a modalidade, a GRRF entra", (await chamar("financeiro_modalidade_confirmar", { rescisao_id: hMarta, modalidade: "pedido_demissao" })).codigo === 200 && (await chamar("financeiro_lancamento_confirmar", { rescisao_id: hMarta, grrf_modo: "valor", valor_grrf: 200, confirmacao_rh: true })).codigo === 200);
// histórico sem cadastro
check("histórico sem cadastro: confirma líquido e GRRF só nas rubricas (sem criar fechamento)", (await chamar("financeiro_lancamento_confirmar", { rescisao_id: hSolo, confirmar_liquido: true, grrf_modo: "nao_aplicavel", justificativa: "Sem GRRF.", confirmacao_rh: true })).codigo === 200
  && (await um(`select rescisao_status s, grrf_status g from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hSolo}`)).g === "nao_aplicavel" && (await fechDe("Hist Solo")) === undefined);

// ── preservação ──
const preservado = await sql(`select md5(to_jsonb(x)::text) h, colaborador_nome from public.peopleflow_desligamentos x where colaborador_nome in ('Alice Saiu','Bia Diverge','Joca Dois','Iara Manual') order by colaborador_nome`);
check("fechamentos anteriores (validados ou lançados) e valores importados intactos", JSON.stringify(preservado) === JSON.stringify(instantaneoAntes.fech.filter((f) => ["Alice Saiu", "Bia Diverge", "Joca Dois", "Iara Manual"].includes(f.colaborador_nome))) && (await um(`select count(*)::int n from public.peopleflow_rescisoes_historico_rubricas where rescisao_id in (${hA}, ${hB}, ${hJ}) and (liquido <> case rescisao_id when ${hA} then 1000 when ${hB} then 2000 else 1800 end)`)).n === 0);
check("Gestor e Diretoria seguem sem acesso aos valores individuais depois da nova ação", (await chamar("financeiro_listar", {}, U.GES)).codigo === 403 && (await chamar("financeiro_listar", {}, U.DIR)).codigo === 403 && !/Nina|Lara|Rui|2500|2600/.test(JSON.stringify((await chamar("financeiro_agregado", {}, U.DIR)).corpo)));

// ── rollback da migration simples ──
const RB2 = rd("desligamentos_financeiro_lancamento_simples_rollback.sql");
check("rollback da migration simples é RECUSADO enquanto existir valor confirmado como 'informado_rh' (nada alterado)", /rastreabilidade/.test(String(await falha(() => db.exec(RB2)))) && (await falha(() => db.exec(valorInforme))) === null && (await falha(() => db.exec(`delete from public.peopleflow_desligamentos where colaborador_nome = 'Teste Constraint'`))) === null);
// sem registros 'informado_rh' o rollback é possível e restaura exatamente as listas antigas
const fechInformados = await sql(`select colaborador_nome from public.peopleflow_desligamentos where rescisao_fonte = 'informado_rh' or grrf_fonte = 'informado_rh'`);
await db.exec(`update public.peopleflow_desligamentos set rescisao_validada_em = null, rescisao_validada_por = null, rescisao_fonte = null, grrf_validada_em = null, grrf_validada_por = null, grrf_fonte = null, grrf_nao_aplicavel = false, grrf_justificativa = null where rescisao_fonte = 'informado_rh' or grrf_fonte = 'informado_rh' or grrf_nao_aplicavel`);
await db.exec(`update public.peopleflow_rescisoes_historico_rubricas set grrf_status = 'pendente', grrf_total = null, grrf_deposito = null, grrf_multa = null, grrf_fonte = null, grrf_validada_em = null, grrf_validada_por = null where grrf_fonte = 'informado_rh' or grrf_status = 'nao_aplicavel'`);
check("sem registros 'informado_rh' o rollback roda e a origem 'informado_rh' volta a ser recusada", fechInformados.length >= 3 && (await falha(() => db.exec(RB2))) === null && /validacao_chk/.test(String(await falha(() => db.exec(valorInforme)))));
check("a migration simples pode ser reaplicada depois do rollback", (await falha(() => db.exec(MIG2))) === null && (await falha(() => db.exec(valorInforme))) === null && (await falha(() => db.exec(`delete from public.peopleflow_desligamentos where colaborador_nome = 'Teste Constraint'`))) === null);

// ═══ J. Fechar o acesso direto ═══
secao("J. Fechamento do acesso direto: o navegador perde a tabela; o servidor segue servindo só o RH (ver e registrar); Diretoria e Gestor nada");
const FECHAR = rd("desligamentos_financeiro_fechar_acesso.sql");
const lerComo = (papel, uid) => como(papel, uid, async () => (await db.query(`select count(*)::int n from public.peopleflow_desligamentos`)).rows[0].n);
const negado = async (papel, uid, sqlTxt) => /permission denied/i.test(String(await como(papel, uid, () => falha(() => db.query(sqlTxt)))));
const hashesFin = async () => ({
  fech: (await um(`select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.colaborador_nome), '')) h, count(*)::int n from public.peopleflow_desligamentos x`)),
  rub: (await um(`select md5(string_agg(to_jsonb(x)::text, '|' order by x.rescisao_id)) h, count(*)::int n from public.peopleflow_rescisoes_historico_rubricas x`)),
  log: (await um(`select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) h, count(*)::int n from public.peopleflow_fechamentos_log x`)),
  colab: (await um(`select md5(string_agg(to_jsonb(x)::text, '|' order by x.id)) h from public.colaboradores x`)).h,
});
await db.exec(`create policy politica_extra_teste on public.peopleflow_desligamentos for select to authenticated using (true)`);
check("ANTES: um usuário autenticado lê o fechamento direto (a lacuna que o fechamento corrige)", (await lerComo("authenticated", U.GES)) >= 3);
const preBlocos = rd("desligamentos_financeiro_fechar_acesso_prechecagem.sql").split(/\n-- \d\) /).slice(1).map((b) => b.slice(b.indexOf("\n") + 1).replace(/;\s*$/, ""));
const pre1 = await sql(preBlocos[0]);
const pre2 = await sql(preBlocos[1]);
const pre3 = await sql(preBlocos[2]);
check("pré-checagem (somente leitura) roda: mostra o acesso aberto, NENHUM objeto dependente (view/função/política de outra tabela) e a contagem dos dados", preBlocos.length === 3 && pre1.some((r) => r.tipo === "política" && r.quem === "authenticated_rw_desligamentos") && pre1.some((r) => r.tipo === "privilégio" && r.quem === "authenticated") && pre2.length === 0 && Number(pre3[0].fechamentos) >= 3 && Number(pre3[0].rubricas) === (await um(`select count(*)::int n from public.peopleflow_rescisoes_historico_rubricas`)).n);
const h0 = await hashesFin();
// o fechamento exige a migration do lançamento simples aplicada
check("pré-condição: o fechamento recusa rodar sem o lançamento simples (nada alterado)", await (async () => {
  await db.exec(`alter table public.peopleflow_desligamentos drop constraint peopleflow_desligamentos_validacao_chk`);
  const e = await falha(() => db.exec(FECHAR));
  await db.exec(rd("desligamentos_financeiro_lancamento_simples.sql"));
  return /lancamento_simples/.test(String(e)) && (await lerComo("authenticated", U.GES)) >= 3;
})());
check("migration de fechamento roda sem erro e é idempotente", (await falha(() => db.exec(FECHAR))) === null && (await falha(() => db.exec(FECHAR))) === null);
const h1 = await hashesFin();
check("NENHUM dado alterado pelo fechamento: fechamentos, rubricas, trilha e cadastro idênticos (hash e contagem)", JSON.stringify(h0) === JSON.stringify(h1), JSON.stringify([h0.fech.n, h1.fech.n]));
check("toda política foi removida (inclusive a extra) e a RLS segue ligada", Number((await um(`select count(*)::int n from pg_policies where tablename = 'peopleflow_desligamentos'`)).n) === 0 && (await um(`select relrowsecurity r from pg_class where oid = 'public.peopleflow_desligamentos'::regclass`)).r === true);
const tab = "public.peopleflow_desligamentos";
check("DEPOIS: RH, Diretoria e Gestor no navegador (authenticated) NÃO leem nem gravam o fechamento", await negado("authenticated", U.GES, `select * from ${tab}`) && await negado("authenticated", U.DIR, `select * from ${tab}`) && await negado("authenticated", U.RH, `select * from ${tab}`)
  && await negado("authenticated", U.RH, `update ${tab} set valor_rescisao = 1`) && await negado("authenticated", U.RH, `insert into ${tab} (colaborador_nome) values ('x')`) && await negado("authenticated", U.RH, `delete from ${tab}`));
check("DEPOIS: anon também não; rubricas e trilha seguem fechadas para o navegador", await negado("anon", null, `select * from ${tab}`) && await negado("anon", null, `insert into ${tab} (colaborador_nome) values ('x')`)
  && await negado("authenticated", U.RH, `select * from public.peopleflow_rescisoes_historico_rubricas`) && await negado("authenticated", U.RH, `select * from public.peopleflow_fechamentos_log`) && await negado("anon", null, `select * from public.peopleflow_fechamentos_log`));
// o servidor segue servindo cada perfil como definido
const aposListar = await chamar("financeiro_listar", {});
check("DEPOIS · RH: continua VENDO os valores (conferência) pelo servidor", aposListar.codigo === 200 && aposListar.corpo.dados.fechamentos.length >= 3 && aposListar.corpo.dados.saidas.length >= 9);
const lrAntes = (await hashesFin()).log.n;
const lrR = await chamar("financeiro_lancamento_confirmar", { rescisao_id: hE, confirmar_liquido: true, grrf_modo: "valor", valor_grrf: 321.09, confirmacao_rh: true });
const lrE = await linhaDe("Eva Historica");
check("DEPOIS · RH: continua REGISTRANDO (diálogo único) pelo servidor: GRRF confirmada sobre o líquido já validado, com trilha", lrR.codigo === 200 && lrE.rescisao.status === "validado" && lrE.grrf.status === "validado" && lrE.grrf.total === 321.09 && (await hashesFin()).log.n === lrAntes + 1);
const mR = await chamar("financeiro_lancamento_confirmar", { colaborador_nome: "Nina Nova", valor_rescisao: 2700, grrf_modo: "valor", valor_grrf: 100, motivo: "Ajuste pós-fechamento.", confirmacao_rh: true });
check("DEPOIS · RH: lançamento manual (sem folha) e alteração com motivo também funcionam", mR.codigo === 200 && (await fechDe("Nina Nova")).v === 2700);
const dAgr = await chamar("financeiro_agregado", {}, U.RH);
check("DEPOIS · RH: totais agregados (200), sem nenhum valor individual na resposta", dAgr.codigo === 200 && dAgr.corpo.dados.meses.length > 0 && !/Nina|Lara|Rui|Eva|Alice|Bia|colaborador|rescisaoId|liquido/i.test(JSON.stringify(dAgr.corpo)));
check("DEPOIS · Diretoria: nem os totais agregados → 403", (await chamar("financeiro_agregado", {}, U.DIR)).codigo === 403);
check("DEPOIS · Diretoria: sem individual, sem gravação → 403", (await chamar("financeiro_listar", {}, U.DIR)).codigo === 403 && (await chamar("financeiro_lancamento_confirmar", { rescisao_id: hE, grrf_modo: "pendente", confirmacao_rh: true }, U.DIR)).codigo === 403 && (await chamar("financeiro_rescisao_validar", { itens: [{ rescisao_id: hA }] }, U.DIR)).codigo === 403);
check("DEPOIS · Gestor: nenhum valor financeiro (listar, agregado, gravar) → 403", (await chamar("financeiro_listar", {}, U.GES)).codigo === 403 && (await chamar("financeiro_agregado", {}, U.GES)).codigo === 403 && (await chamar("financeiro_lancamento_confirmar", { rescisao_id: hE, grrf_modo: "pendente", confirmacao_rh: true }, U.GES)).codigo === 403);
check("DEPOIS: colaborador sem perfil → 403, conta desligada → 403, sem token → 401", (await chamar("financeiro_listar", {}, U.COL)).codigo === 403 && (await chamar("financeiro_agregado", {}, U.DESL)).codigo === 403 && (await chamar("financeiro_listar", {}, null)).codigo === 401);
// validação final oficial (números da massa fictícia)
const nRub = (await hashesFin()).rub.n;
const somas = await um(`select round(sum(liquido),2)::text l, round(sum(fgts_rescisorio),2)::text f from public.peopleflow_rescisoes_historico_rubricas`);
const nFech = (await hashesFin()).fech.n;
const VALF = rd("desligamentos_financeiro_fechar_acesso_validacao.sql").replace(/;\s*$/, "").replace(/= 24(\r?\n)/, `= ${nRub}$1`).replace("96110.58", somas.l).replace("24196.05", somas.f).replaceAll(">= 19", ">= 1").replace(">= 7", `>= ${nFech}`);
const vf = await sql(VALF);
check("validação final oficial (adaptada à massa fictícia): tudo OK", vf.length >= 10 && vf.every((r) => r.resultado === "OK"), JSON.stringify(vf.filter((r) => r.resultado !== "OK")));
check("reversão do fechamento devolve exatamente o acesso anterior (autenticado volta a ler) sem tocar nos dados", (await falha(() => db.exec(rd("desligamentos_financeiro_fechar_acesso_rollback.sql")))) === null && (await lerComo("authenticated", U.GES)) >= 4);
check("e o fechamento pode ser reaplicado depois da reversão", (await falha(() => db.exec(FECHAR))) === null && (await negado("authenticated", U.GES, `select * from ${tab}`)));
await db.exec(rd("desligamentos_financeiro_fechar_acesso_rollback.sql"));

// ═══ K. Reversão da migration financeira ═══
secao("K. Reversão da migration financeira");
const rb = rd("desligamentos_financeiro_rollback.sql");
check("com validações/trilha a reversão é RECUSADA (nada apagado)", /REVERSÃO RECUSADA/.test(String(await falha(() => db.exec(rb)))) && Number((await um(`select count(*)::int n from public.peopleflow_fechamentos_log`)).n) > 0);
check("com autorização explícita remove as estruturas e preserva os valores originais", (await falha(() => db.exec(rb.replace("v_permitir_perda constant boolean := false", "v_permitir_perda constant boolean := true")))) === null
  && (await um(`select count(*)::int n from information_schema.columns where table_name = 'peopleflow_rescisoes_historico_rubricas' and column_name like 'grrf_%'`)).n === 0
  && (await um(`select md5(string_agg(concat_ws('|', rescisao_id, saldo_fgts, salario, proventos, descontos, liquido, fgts_rescisorio), ';' order by rescisao_id)) h from public.peopleflow_rescisoes_historico_rubricas where rescisao_id <= ${hH}`)).h === antesRub
  && Number((await um(`select valor_rescisao::float v from public.peopleflow_desligamentos where colaborador_nome = 'Bia Diverge'`)).v) === 3500);
check("e a migration pode ser reaplicada depois da reversão", (await falha(() => db.exec(MIG))) === null);

console.log(`\nFINANCEIRO: ${C.ok} verificações OK, ${C.falhas} falha(s)`);
process.exit(C.falhas ? 1 : 0);

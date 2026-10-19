// Integração financeira dos desligamentos — migration supabase/desligamentos_financeiro.sql + ações do servidor (api/_lib/financeiroDesligamentos.ts),
// testadas na RÉPLICA (PGlite) com dados FICTÍCIOS que reproduzem os casos reais (divergência, líquido zero, modalidade ausente, conversão de estágio,
// histórico sem cadastro, vínculo por nome+admissão). Nada vai ao Supabase real.
//   cd tests && npm run test:financeiro
import { pathToFileURL } from "node:url";
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
check("os 3 fechamentos existentes seguem com os mesmos valores (origem manual, sem validação)", (await sql(`select colaborador_nome, valor_rescisao::float v, valor_grrf::float g, origem, validado_em from public.peopleflow_desligamentos order by 1`)).every((f) => f.origem === "manual" && f.validado_em === null) && Number((await um(`select valor_rescisao::float v from public.peopleflow_desligamentos where colaborador_nome = 'Bia Diverge'`)).v) === 3500);
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
secao("B. Autorização: RH individual · Diretoria só agregado · Gestor e demais nada");
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
check("Diretoria: totais agregados → 200", aggDir.codigo === 200);
const textoAgg = JSON.stringify(aggDir.corpo);
check("a resposta agregada NÃO contém nomes, ids, líquidos ou valores individuais", !/Alice|Bia|Caio|Eva|Fabio|Gabi|Kleber|Iara|Joca|liquido|rescisaoId|colaboradorId|fgts/i.test(textoAgg), textoAgg.slice(0, 200));
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
const fA = await um(`select valor_rescisao::float v, origem, validado_por from public.peopleflow_desligamentos where colaborador_nome = 'Alice Saiu'`);
check("Alice: fechamento existente PRESERVADO (valor igual, origem manual) e agora marcado como validado", fA.v === 1000 && fA.origem === "manual" && fA.validado_por === "Helena Recursos");
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
const aggDirTot = dados(await chamar("financeiro_agregado", {}, U.DIR));
check("Diretoria vê exatamente os mesmos totais que o RH", JSON.stringify(aggDirTot.meses) === JSON.stringify(agg.meses));
check("sem duplicidade: o total da soma mensal = soma de cada pessoa uma vez (rescisão 6300+0+5000+4000 = 15300)", agg.meses.reduce((a, m) => a + m.rescisao, 0) === 15300 && agg.meses.reduce((a, m) => a + m.grrf, 0) === 800);

// ═══ H. Lançamento manual (sem folha) ═══
secao("H. Lançamento manual: só para desligamento SEM rescisão importada; validado por ser do RH");
check("com rescisão da folha → 409 (use a Conferência financeira)", (await chamar("financeiro_fechamento_salvar", { colaborador_nome: "Alice Saiu", valor_rescisao: 9, valor_grrf: 9 })).codigo === 409);
check("colaborador ativo / inexistente → 422", (await chamar("financeiro_fechamento_salvar", { colaborador_nome: "Hugo Convertido", valor_rescisao: 1 })).codigo === 422 && (await chamar("financeiro_fechamento_salvar", { colaborador_nome: "Ninguém", valor_rescisao: 1 })).codigo === 422);
check("valor negativo → 422", (await chamar("financeiro_fechamento_salvar", { colaborador_nome: "Iara Manual", valor_rescisao: -5 })).codigo === 422);
const ms = await chamar("financeiro_fechamento_salvar", { colaborador_nome: "Iara Manual", valor_rescisao: "2.500,50", valor_grrf: 0 });
const fI = await um(`select valor_rescisao::float v, valor_grrf::float g, origem, validado_por from public.peopleflow_desligamentos where colaborador_nome = 'Iara Manual'`);
check("Iara: lançamento manual grava (vírgula decimal aceita), origem manual, validado pelo RH, com trilha", ms.codigo === 200 && fI.v === 2500.5 && fI.g === 0 && fI.origem === "manual" && fI.validado_por === "Helena Recursos" && Number((await um(`select count(*)::int n from public.peopleflow_fechamentos_log where colaborador_nome = 'Iara Manual' and acao = 'lancamento_manual'`)).n) === 2);
const aggI = dados(await chamar("financeiro_agregado", {}));
check("o lançamento manual validado entra no mês efetivo (setembro: 2500,50 + GRRF 0)", aggI.meses.find((m) => m.mes === "2026-09").rescisao === 2500.5 && aggI.meses.find((m) => m.mes === "2026-09").parcial === false);

// ═══ I. Preservação ═══
secao("I. Preservação: cadastro, histórico, MPs, importados e trilha");
check("colaboradores e histórico de rescisões idênticos ao início", (await hashTab("colaboradores", "id")) === antes.colab && (await hashTab("peopleflow_rescisoes_historico", "id")) === antes.hist);
check("valores importados da folha idênticos (24→9 linhas, mesmos números)", (await um(`select md5(string_agg(concat_ws('|', rescisao_id, saldo_fgts, salario, proventos, descontos, liquido, fgts_rescisorio), ';' order by rescisao_id)) h from public.peopleflow_rescisoes_historico_rubricas`)).h === antesRub);
check("a trilha é somente inserção (update/delete recusados)", /somente inserção/.test(String(await falha(() => db.exec(`update public.peopleflow_fechamentos_log set por = 'x'`)))) && /somente inserção/.test(String(await falha(() => db.exec(`delete from public.peopleflow_fechamentos_log`)))));
check("conversão de estágio segue sem nenhuma validação", (await um(`select rescisao_status r, grrf_status g from public.peopleflow_rescisoes_historico_rubricas where rescisao_id = ${hH}`)).r === "proposto");

// ═══ J. Fechar o acesso direto ═══
secao("J. Migration de fechamento do acesso: o navegador perde o acesso direto; o servidor segue");
const FECHAR = rd("desligamentos_financeiro_fechar_acesso.sql");
const lerComo = (papel, uid) => como(papel, uid, async () => (await db.query(`select count(*)::int n from public.peopleflow_desligamentos`)).rows[0].n);
check("ANTES: um usuário autenticado lê o fechamento direto (a lacuna que o fechamento corrige)", (await lerComo("authenticated", U.GES)) >= 3);
check("migration de fechamento roda sem erro e é idempotente", (await falha(() => db.exec(FECHAR))) === null && (await falha(() => db.exec(FECHAR))) === null);
check("DEPOIS: authenticated não lê nem grava (Gestor/Diretoria/RH no navegador)", /permission denied/i.test(String(await como("authenticated", U.GES, () => falha(() => db.query(`select * from public.peopleflow_desligamentos`))))) && /permission denied/i.test(String(await como("authenticated", U.RH, () => falha(() => db.query(`update public.peopleflow_desligamentos set valor_rescisao = 1`))))) && /permission denied/i.test(String(await como("authenticated", U.DIR, () => falha(() => db.query(`insert into public.peopleflow_desligamentos (colaborador_nome) values ('x')`))))));
check("DEPOIS: anon também não; service_role (servidor) segue funcionando", /permission denied/i.test(String(await como("anon", null, () => falha(() => db.query(`select * from public.peopleflow_desligamentos`))))) && (await chamar("financeiro_listar", {})).codigo === 200);
check("DEPOIS: o RH continua vendo os valores pelo servidor e a Diretoria os totais", (await chamar("financeiro_listar", {})).corpo.dados.fechamentos.length >= 4 && (await chamar("financeiro_agregado", {}, U.DIR)).codigo === 200);
check("reversão do fechamento devolve o acesso anterior", (await falha(() => db.exec(rd("desligamentos_financeiro_fechar_acesso_rollback.sql")))) === null && (await lerComo("authenticated", U.GES)) >= 4);

// ═══ K. Reversão da migration financeira ═══
secao("K. Reversão da migration financeira");
const rb = rd("desligamentos_financeiro_rollback.sql");
check("com validações/trilha a reversão é RECUSADA (nada apagado)", /REVERSÃO RECUSADA/.test(String(await falha(() => db.exec(rb)))) && Number((await um(`select count(*)::int n from public.peopleflow_fechamentos_log`)).n) > 0);
check("com autorização explícita remove as estruturas e preserva os valores originais", (await falha(() => db.exec(rb.replace("v_permitir_perda constant boolean := false", "v_permitir_perda constant boolean := true")))) === null
  && (await um(`select count(*)::int n from information_schema.columns where table_name = 'peopleflow_rescisoes_historico_rubricas' and column_name like 'grrf_%'`)).n === 0
  && (await um(`select md5(string_agg(concat_ws('|', rescisao_id, saldo_fgts, salario, proventos, descontos, liquido, fgts_rescisorio), ';' order by rescisao_id)) h from public.peopleflow_rescisoes_historico_rubricas`)).h === antesRub
  && Number((await um(`select valor_rescisao::float v from public.peopleflow_desligamentos where colaborador_nome = 'Bia Diverge'`)).v) === 3500);
check("e a migration pode ser reaplicada depois da reversão", (await falha(() => db.exec(MIG))) === null);

console.log(`\nFINANCEIRO: ${C.ok} verificações OK, ${C.falhas} falha(s)`);
process.exit(C.falhas ? 1 : 0);

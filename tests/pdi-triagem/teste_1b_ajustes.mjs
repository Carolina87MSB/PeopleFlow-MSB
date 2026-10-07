// Etapa 1B — AJUSTES FINAIS: fallback "A definir pelo RH", necessidade criada sem vínculo, limpeza de resíduos, auditoria depois da decisão,
// concorrência na confirmação. Roda o código de servidor REAL na RÉPLICA (PGlite com Fases 1–6 reais + Fase 7 real). Nada vai à produção.
// Falhas são INJETADAS no cliente do servidor (cliente → banco), por tabela/operação/payload, para reproduzir quedas no meio do caminho.
import { pathToFileURL } from "node:url";
import { criarCliente } from "./shim.mjs";
import { rd, novaReplica, semearPdi, criarContador, REPO, U_RH } from "./base.mjs";

const C = criarContador();
const { check, secao } = C;

const R = await novaReplica();
const { db, sql, um } = R;
const { p1 } = await semearPdi(R);
const MIG = rd("desenvolvimento_fase7_triagem_pdi.sql");
await db.query(MIG.slice(0, MIG.indexOf("$mig$;", MIG.indexOf("do $mig$")) + 6));

// ── itens do cenário (PDI: o teste edita ações só para simular o gestor mexendo no PDI) ──
const ESPECIFICO = (t) => `Ampliar a capacidade de ${t} com autonomia e consistência.`;
const itens = [
  ["IG", "Liderança", "Desenvolver a competência de Liderança.", [["GA", "Conduzir 1:1 mensal com cada liderado"], ["GB", "Delegar entregas com acompanhamento"]]],
  ["IS", "Alinhamentos", ESPECIFICO("conduzir alinhamentos entre áreas"), [["SA", "Conduzir o próximo alinhamento entre Produção e Qualidade"]]],
  ["IO", "Comunicação O", ESPECIFICO("comunicar resultados"), [["O1", "Apresentar resultados mensais"], ["O2", "Pedir feedback ao gestor"], ["O3", "Gravar uma apresentação"]]],
  ["IF", "Comunicação F", ESPECIFICO("conduzir reuniões"), [["F1", "Conduzir a reunião semanal"], ["F2", "Preparar pauta antecipada"], ["F3", "Registrar encaminhamentos"]]],
  ["IV", "Planejamento V", ESPECIFICO("planejar entregas"), [["V1", "Montar cronograma"], ["V2", "Revisar riscos"]]],
  ["IW", "Planejamento W", ESPECIFICO("priorizar demandas"), [["W1", "Listar demandas"], ["W2", "Priorizar semanalmente"]]],
  ["IK", "Corrida K", ESPECIFICO("tomar decisões"), [["K1", "Registrar decisões tomadas"]]],
  ["IA1", "Auditoria 1", ESPECIFICO("documentar processos"), [["AU1", "Documentar o processo A"]]],
  ["IA2", "Auditoria 2", ESPECIFICO("documentar rotinas"), [["AU2", "Documentar a rotina B"]]],
  ["IA3", "Auditoria 3", ESPECIFICO("padronizar registros"), [["AU3", "Padronizar o registro C"]]],
  ["IJ1", "Limpeza 1", ESPECIFICO("acompanhar indicadores"), [["JA", "Acompanhar indicador 1"], ["JB", "Acompanhar indicador 2"]]],
  ["IJ2", "Limpeza 2", ESPECIFICO("revisar procedimentos"), [["JC", "Revisar procedimento 1"], ["JD", "Revisar procedimento 2"]]],
  ...[1, 2, 3, 4, 5, 6].map((n) => [`IC${n}`, `Concorrência ${n}`, ESPECIFICO(`cumprir metas ${n}`), [[`CC${n}`, `Cumprir a meta ${n} do setor`]]]),
];
for (const [id, comp, obj, acoes] of itens) {
  await db.query(`insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento) values ($1, ${p1}, $2, 'Comportamental', $3)`, [id, comp, obj]);
  let ordem = 1;
  for (const [aid, desc] of acoes) await db.query(`insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) values ($1, $2, $3, 'Pendente', ${ordem++})`, [aid, id, desc]);
}

// ── cliente do servidor com INJEÇÃO DE FALHAS ───────────────────────
let JITTER_ATIVO = false;
const regras = [];
const injetar = (r) => { regras.push({ vezes: 1, falhar: true, ...r }); return r; };
const limparRegras = () => { regras.length = 0; };
const base = criarCliente(db, { papel: "service_role" });
globalThis.__ADMIN = {
  ...base,
  from: (t) => {
    const q = base.from(t);
    const original = q.executar.bind(q);
    // atraso aleatório ANTES de entrar na fila do banco: muda a ordem em que requisições simultâneas se intercalam
    const entrar = q.then.bind(q);
    q.then = (res, rej) => Promise.resolve().then(() => (JITTER_ATIVO ? new Promise((r) => setTimeout(r, Math.random() * 8)) : null)).then(() => entrar(res, rej));
    q.executar = async () => {
      const r = regras.find((x) => x.vezes > 0 && x.tabela === t && x.op === q.op && (!x.quando || x.quando(q)));
      if (r) {
        r.vezes--;
        if (r.antes) { await db.exec("reset role"); await r.antes(q); }
        if (r.falhar) return { data: null, error: { code: "XX000", message: `falha injetada (${r.nome ?? t})` } };
      }
      return original();
    };
    return q;
  },
};
globalThis.__BROWSER = { from: (t) => globalThis.__ADMIN.from(t), auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } };
const da = await import(pathToFileURL(REPO + "api/_lib/desenvolvimentoAcoes.ts").href);
const chamar = async (acao, corpo, uid = U_RH) => {
  const res = { codigo: null, corpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.corpo = b; return this; } };
  await da.executarAcao(acao, { headers: { authorization: "Bearer tok:" + uid }, body: corpo }, res);
  return res;
};
const ok = async (acao, corpo) => { const r = await chamar(acao, corpo); if (r.codigo !== 200) throw new Error(`${acao} → ${r.codigo} ${r.corpo?.error}`); return r.corpo.dados; };
const gera = (...ids) => ok("pdi_triagem_gerar", { pdi_item_ids: ids });
const sugs = (item) => sql(`select s.id, s.estado, s.texto_sugerido, s.texto_final, s.editada, s.necessidade_id, s.derivada_de_id, (select string_agg(pdi_acao_id, ',' order by pdi_acao_id) from public.peopleflow_dev_pdi_sugestao_acoes sa where sa.sugestao_id = s.id and sa.ativa) as acoes from public.peopleflow_dev_pdi_sugestoes s where s.pdi_item_id = $1 order by s.id`, [item]);
const pend = async (item) => (await sugs(item)).find((s) => s.estado === "pendente");
const necs = (item) => sql(`select * from public.peopleflow_dev_necessidades where pdi_item_id = $1 and status <> 'cancelada' order by id`, [item]);
const nNecs = async (item) => (await necs(item)).length;
const audit = (a, id) => sql(`select * from public.peopleflow_dev_auditoria where acao = $1 ${id ? "and entidade_id = $2" : ""} order by id`, id ? [a, String(id)] : [a]);
const NEUTRO = "A definir pelo RH";

// ═══ G/H. Fallback "A definir pelo RH" ═══
secao("G/H. Fallback: objetivo genérico → 'A definir pelo RH' (nunca as ações coladas)");
await gera("IG", "IS");
const sG = await pend("IG");
const sS = await pend("IS");
check("objetivo ESPECÍFICO continua como texto sugerido, palavra por palavra", sS.texto_sugerido === ESPECIFICO("conduzir alinhamentos entre áreas"));
check("objetivo GENÉRICO → texto neutro 'A definir pelo RH'", sG.texto_sugerido === NEUTRO);
check("o texto neutro NÃO contém texto das ações (não concatena)", !/1:1|liderado|Delegar|entregas/i.test(sG.texto_sugerido) && sG.acoes === "GA,GB");
const antesG = (await sql(`select count(*)::int n from public.peopleflow_dev_necessidades`))[0].n;
for (const t of [NEUTRO, "  a   definir   pelo rh. ", "A DEFINIR PELO RH"]) {
  const r = await chamar("pdi_sugestao_confirmar", { sugestao_id: sG.id, texto: t, categoria: "comportamental" });
  check(`G) confirmar o texto neutro "${t.trim()}" → 422`, r.codigo === 422 && /A definir pelo RH/.test(r.corpo.error));
}
check("G) texto vazio → 422", (await chamar("pdi_sugestao_confirmar", { sugestao_id: sG.id, texto: "   ", categoria: "comportamental" })).codigo === 422);
check("G) nada foi criado: sugestão continua pendente, nenhuma necessidade nova", (await pend("IG"))?.id === sG.id && (await sql(`select count(*)::int n from public.peopleflow_dev_necessidades`))[0].n === antesG);
const hG = await ok("pdi_sugestao_confirmar", { sugestao_id: sG.id, texto: "Conduzir o time com delegação clara e acompanhamento próximo", categoria: "lideranca", prioridade: "alta" });
check("H) texto escrito pelo RH confirma: necessidade com o texto do RH, sugestão validada", hG.necessidade.descricao === "Conduzir o time com delegação clara e acompanhamento próximo" && hG.sugestao.estado === "validada" && hG.sugestao.texto_final === hG.necessidade.descricao);
check("H) texto_sugerido continua preservado como 'A definir pelo RH' (modelo da Fase 7)", hG.sugestao.texto_sugerido === NEUTRO);
const evG = await audit("pdi_sugestao_confirmada", sG.id);
check("H) auditoria: 'confirmada' (não 'editada') com texto_definido_pelo_rh = true", evG.length === 1 && evG[0].detalhe.texto_definido_pelo_rh === true && evG[0].detalhe.editada === false && (await audit("pdi_sugestao_editada_e_confirmada", sG.id)).length === 0);

// separar num item genérico: grupos sem texto → neutros; com texto do RH → o texto
await db.query(`insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento) values ('IG2', ${p1}, 'Organização', 'Comportamental', 'Desenvolver a competência de Organização.')`);
await db.query(`insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) values ('G2A','IG2','organizar a agenda',  'Pendente', 1), ('G2B','IG2','arquivar os documentos', 'Pendente', 2)`);
await gera("IG2");
const sIG2 = await pend("IG2");
const sepG = await ok("pdi_sugestao_separar", { sugestao_id: sIG2.id, grupos: [{ acao_ids: ["G2A"], texto: "Organizar a rotina de trabalho" }, { acao_ids: ["G2B"] }] });
const novasG = (await sugs("IG2")).filter((s) => s.derivada_de_id === sIG2.id);
check("separar em item genérico: grupo sem texto fica 'A definir pelo RH'; grupo com texto do RH usa o texto", novasG.find((s) => s.acoes === "G2A").texto_sugerido === "Organizar a rotina de trabalho" && novasG.find((s) => s.acoes === "G2B").texto_sugerido === NEUTRO && sepG.auditoria === "ok");
const mG = await ok("pdi_sugestao_manter_no_pdi", { sugestao_id: novasG.find((s) => s.acoes === "G2B").id });
check("manter somente no PDI funciona no estado 'a definir' (sem exigir texto)", mG.sugestao.estado === "mantida_no_pdi");
// compatibilidade do legado: a ação isolada continua virando necessidade com o TEXTO DA AÇÃO (não propaga para a nova UI)
await db.query(`insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento) values ('IGL', ${p1}, 'Foco', 'Comportamental', 'Desenvolver a competência de Foco.')`);
await db.query(`insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) values ('GL1','IGL','Reservar duas horas diárias sem interrupções', 'Pendente', 1)`);
await gera("IGL");
const velho = await chamar("pdi_sugestao_aceitar", { pdi_acao_id: "GL1", categoria: "comportamental" });
check("legado: pdi_sugestao_aceitar segue com o texto da ação (compatibilidade do cliente antigo) mesmo com sugestão 'a definir' pendente", velho.codigo === 200 && velho.corpo.dados.descricao === "Reservar duas horas diárias sem interrupções");

// ═══ A–F. Necessidade criada sem vínculo ═══
secao("A/B/C/D/E. Falha depois de criar a necessidade e antes de vincular a sugestão");
await gera("IO");
const sO = await pend("IO");
injetar({ nome: "vínculo da sugestão", tabela: "peopleflow_dev_pdi_sugestoes", op: "update", quando: (q) => q.payload?.estado === "validada" });
const f1 = await chamar("pdi_sugestao_confirmar", { sugestao_id: sO.id, texto: "Comunicar resultados com clareza e segurança", categoria: "comportamental", prioridade: "alta", justificativa: "J original" });
check("A) a queda no vínculo devolve erro (500) mas a necessidade JÁ foi criada", f1.codigo === 500 && (await nNecs("IO")) === 1);
const orfa = (await necs("IO"))[0];
check("A) estado: necessidade validada (ação principal O1) + sugestão ainda pendente e sem vínculo", orfa.status === "validada" && orfa.pdi_acao_id === "O1" && (await pend("IO"))?.necessidade_id === null);
const orfaHash = (await um(`select md5(to_jsonb(n)::text) h from public.peopleflow_dev_necessidades n where id = ${orfa.id}`)).h;
// C/D/E nesse estado
const cM = await chamar("pdi_sugestao_manter_no_pdi", { sugestao_id: sO.id });
check("C) MANTER com necessidade sem vínculo → 409 orientando a concluir a confirmação", cM.codigo === 409 && /Concluir confirmação/.test(cM.corpo.error) && new RegExp(`nº ${orfa.id}`).test(cM.corpo.error));
const cS = await chamar("pdi_sugestao_separar", { sugestao_id: sO.id, grupos: [{ acao_ids: ["O1"] }, { acao_ids: ["O2", "O3"] }] });
check("D) SEPARAR nesse estado → 409", cS.codigo === 409 && /Concluir confirmação/.test(cS.corpo.error));
await db.query(`update public.peopleflow_pdi_acoes set descricao = 'Pedir feedback ao gestor e a um par' where id = 'O2'`); // o PDI muda: a sugestão fica desatualizada
const cR = await chamar("pdi_sugestao_regenerar", { sugestao_id: sO.id });
check("E) REGENERAR nesse estado (inclusive desatualizada) → 409 orientando a concluir", cR.codigo === 409 && /Concluir confirmação/.test(cR.corpo.error));
const sObs = await sugs("IO");
check("C/D/E) nada mudou: 1 sugestão pendente, nenhuma mantida/substituída, nenhuma necessidade a mais, necessidade intacta", sObs.length === 1 && sObs[0].estado === "pendente" && (await nNecs("IO")) === 1 && (await um(`select md5(to_jsonb(n)::text) h from public.peopleflow_dev_necessidades n where id = ${orfa.id}`)).h === orfaHash);
// B: retry com TEXTO, CATEGORIA e PRIORIDADE diferentes + PDI alterado (desatualizada) → adota, não sobrescreve, não duplica
const b1 = await chamar("pdi_sugestao_confirmar", { sugestao_id: sO.id, texto: "Texto completamente diferente digitado na segunda tentativa", categoria: "tecnica", prioridade: "baixa" });
check("B) retry (sem exigir o mesmo texto; mesmo com o PDI alterado) → 200, 'recuperada', nenhuma necessidade nova", b1.codigo === 200 && b1.corpo.dados.recuperada === true && b1.corpo.dados.repetida === false && (await nNecs("IO")) === 1);
check("B) informa as divergências em vez de sobrescrever", b1.corpo.dados.divergencias.texto && b1.corpo.dados.divergencias.categoria && b1.corpo.dados.divergencias.prioridade);
check("B) a necessidade existente NÃO foi alterada (linha idêntica)", (await um(`select md5(to_jsonb(n)::text) h from public.peopleflow_dev_necessidades n where id = ${orfa.id}`)).h === orfaHash);
const sOfim = (await sugs("IO"))[0];
check("B) sugestão validada, ligada à necessidade existente, texto_final = o texto REAL da necessidade; ação principal segue O1", sOfim.estado === "validada" && Number(sOfim.necessidade_id) === orfa.id && sOfim.texto_final === "Comunicar resultados com clareza e segurança" && orfa.pdi_acao_id === "O1");
const evR = await audit("pdi_sugestao_editada_e_confirmada", sO.id);
const evR2 = await audit("pdi_sugestao_confirmada", sO.id);
const evNec = await audit("necessidade_do_pdi", orfa.id);
check("B) auditoria rastreável: confirmada com recuperada=true, divergências e o texto da tentativa; criação da necessidade registrada como recuperada", [...evR, ...evR2].length === 1 && [...evR, ...evR2][0].detalhe.recuperada === true && [...evR, ...evR2][0].detalhe.texto_da_tentativa === "Texto completamente diferente digitado na segunda tentativa" && evNec.length === 1 && evNec[0].detalhe.recuperada === true);
const b2 = await chamar("pdi_sugestao_confirmar", { sugestao_id: sO.id, texto: "Comunicar resultados com clareza e segurança", categoria: "comportamental" });
check("B) idempotente: confirmar de novo → 409 'já confirmada', ainda 1 necessidade", b2.codigo === 409 && (await nNecs("IO")) === 1);

secao("F. Ordem das ações muda entre a falha e o retry");
await gera("IF");
const sF = await pend("IF");
injetar({ nome: "vínculo da sugestão", tabela: "peopleflow_dev_pdi_sugestoes", op: "update", quando: (q) => q.payload?.estado === "validada" });
const fq = await chamar("pdi_sugestao_confirmar", { sugestao_id: sF.id, texto: "Conduzir reuniões com pauta e encaminhamentos", categoria: "comportamental" });
const orfaF = (await necs("IF"))[0];
check("F) falha após criar: necessidade com ação principal F1 (menor ordem na época)", fq.codigo === 500 && (await nNecs("IF")) === 1 && orfaF.pdi_acao_id === "F1");
await db.query(`update public.peopleflow_pdi_acoes set ordem = 0 where id = 'F3'`); // agora F3 seria a "principal" se fosse recalculada
await db.query(`update public.peopleflow_pdi_acoes set ordem = 5 where id = 'F1'`);
const fr = await chamar("pdi_sugestao_confirmar", { sugestao_id: sF.id, texto: "Conduzir reuniões com pauta e encaminhamentos", categoria: "comportamental" });
check("F) retry depois de mudar a ordem: recupera a MESMA necessidade (principal persistida F1, não recalculada) e NÃO cria segunda", fr.codigo === 200 && fr.corpo.dados.recuperada === true && (await nNecs("IF")) === 1 && (await necs("IF"))[0].pdi_acao_id === "F1" && (await sugs("IF"))[0].estado === "validada");

secao("Recuperação: validações rigorosas antes de adotar");
await gera("IV", "IW");
const sV = await pend("IV");
await db.query(`insert into public.peopleflow_dev_necessidades (colaborador_id, origem, pdi_id, pdi_item_id, pdi_acao_id, pdi_item_nome, descricao, justificativa, categoria, prioridade, status, validada_em, departamento) values (4, 'pdi', ${p1}, 'IV', 'V1', 'x', 'necessidade de OUTRO colaborador', 'PDI', 'comportamental', 'media', 'validada', now(), 'Qualidade')`);
const vo = await chamar("pdi_sugestao_confirmar", { sugestao_id: sV.id, texto: "Planejar entregas", categoria: "comportamental" });
check("necessidade sem vínculo de OUTRO colaborador → 409, não adota", vo.codigo === 409 && /outro colaborador/.test(vo.corpo.error) && (await pend("IV"))?.id === sV.id);
await db.query(`update public.peopleflow_dev_necessidades set status = 'cancelada', status_motivo = 'limpeza do teste' where pdi_item_id = 'IV'`);
const sW = await pend("IW");
for (const a of ["W1", "W2"]) await db.query(`insert into public.peopleflow_dev_necessidades (colaborador_id, origem, pdi_id, pdi_item_id, pdi_acao_id, pdi_item_nome, descricao, justificativa, categoria, prioridade, status, validada_em, departamento) values (3, 'pdi', ${p1}, 'IW', '${a}', 'x', 'dupla ${a}', 'PDI', 'comportamental', 'media', 'validada', now(), 'Produção')`);
const wo = await chamar("pdi_sugestao_confirmar", { sugestao_id: sW.id, texto: "Priorizar demandas", categoria: "comportamental" });
check("duas necessidades sem vínculo para a mesma sugestão → 409 (não escolhe uma sozinho), nada alterado", wo.codigo === 409 && /mais de uma/.test(wo.corpo.error) && (await pend("IW"))?.id === sW.id && (await nNecs("IW")) === 2);
await db.query(`update public.peopleflow_dev_necessidades set status = 'cancelada', status_motivo = 'limpeza do teste' where pdi_item_id = 'IW'`);

secao("K. Sugestão decidida por outra via no meio da confirmação (corrida): a necessidade criada agora é desfeita");
await gera("IK");
const sK = await pend("IK");
injetar({ nome: "outra pessoa mantém no PDI", tabela: "peopleflow_dev_pdi_sugestoes", op: "update", quando: (q) => q.payload?.estado === "validada", falhar: false, antes: () => db.query(`update public.peopleflow_dev_pdi_sugestoes set estado = 'mantida_no_pdi', decidido_por = '${U_RH}', decidido_em = now(), motivo_decisao = 'decidida por outra pessoa' where id = ${sK.id}`) });
const kq = await chamar("pdi_sugestao_confirmar", { sugestao_id: sK.id, texto: "Registrar decisões tomadas com critério", categoria: "comportamental" });
const nK = await sql(`select status, status_motivo from public.peopleflow_dev_necessidades where pdi_item_id = 'IK'`);
check("K) a confirmação perdeu a corrida → 409 controlado", kq.codigo === 409 && /cancelada automaticamente/.test(kq.corpo.error));
check("K) Base e triagem coerentes: sugestão mantida_no_pdi E nenhuma necessidade ATIVA (a criada neste clique foi cancelada, com motivo)", (await sugs("IK"))[0].estado === "mantida_no_pdi" && nK.length === 1 && nK[0].status === "cancelada" && /automaticamente/.test(nK[0].status_motivo) && (await nNecs("IK")) === 0);
check("K) cancelamento automático auditado", (await audit("necessidade_cancelada")).some((e) => e.detalhe.automatica === true));

// ═══ #15 concorrência ═══
secao("15. Concorrência: requisições simultâneas na mesma sugestão (embaralhadas com atrasos aleatórios no banco)");
const resumo = (rs) => rs.map((r) => `${r.codigo}${r.corpo?.dados?.repetida ? "r" : ""}${r.corpo?.dados?.recuperada ? "R" : ""}`).join("/");
const invariantes = async (item, sug) => {
  const ss = (await sugs(item)).find((s) => s.id === sug.id);
  const ativas = await necs(item);
  const confirmadas = [...(await audit("pdi_sugestao_confirmada", sug.id)), ...(await audit("pdi_sugestao_editada_e_confirmada", sug.id))];
  const evCriacao = ativas[0] ? await audit("necessidade_do_pdi", ativas[0].id) : [];
  return { ss, ativas, confirmadas, evCriacao };
};
const novoItem = async (id) => {
  await db.query(`insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento) values ($1, ${p1}, 'Rodada', 'Comportamental', $2)`, [id, ESPECIFICO(`cumprir metas ${id}`)]);
  await db.query(`insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) values ($1, $2, $3, 'Pendente', 1)`, [`ac_${id}`, id, `Cumprir a meta ${id}`]);
  await gera(id);
  return pend(id);
};
// atrasos aleatórios (0–4 ms) antes de cada comando ao banco: muda a ordem em que as requisições se intercalam
JITTER_ATIVO = true;
const distr = {};
const conta = (k) => { distr[k] = (distr[k] ?? 0) + 1; };
const TRIALS = 12;
let okMesmoTexto = true, okTextosDiferentes = true, okTriplo = true, okConfirmaManter = true, okSem500 = true;
for (let t = 0; t < TRIALS; t++) {
  { // 2 confirmações iguais
    const s = await novoItem(`CM${t}`);
    const rs = await Promise.all([1, 2].map(() => chamar("pdi_sugestao_confirmar", { sugestao_id: s.id, texto: "Cumprir metas do setor com disciplina", categoria: "comportamental" })));
    const v = await invariantes(`CM${t}`, s);
    conta("iguais " + resumo(rs));
    okSem500 &&= rs.every((r) => [200, 409].includes(r.codigo));
    okMesmoTexto &&= rs.some((r) => r.codigo === 200) && v.ativas.length === 1 && v.ss.estado === "validada" && Number(v.ss.necessidade_id) === v.ativas[0].id && v.confirmadas.length === 1 && v.evCriacao.length >= 1 && v.evCriacao.length <= 2;
  }
  { // 2 confirmações com texto/categoria/prioridade diferentes
    const s = await novoItem(`CD${t}`);
    const rs = await Promise.all([chamar("pdi_sugestao_confirmar", { sugestao_id: s.id, texto: "Texto da primeira requisição", categoria: "comportamental", prioridade: "alta" }), chamar("pdi_sugestao_confirmar", { sugestao_id: s.id, texto: "Texto da segunda requisição", categoria: "tecnica", prioridade: "baixa" })]);
    const v = await invariantes(`CD${t}`, s);
    conta("diferentes " + resumo(rs));
    okSem500 &&= rs.every((r) => [200, 409].includes(r.codigo));
    okTextosDiferentes &&= v.ativas.length === 1 && v.ss.estado === "validada" && Number(v.ss.necessidade_id) === v.ativas[0].id && v.confirmadas.length === 1 && ["Texto da primeira requisição", "Texto da segunda requisição"].includes(v.ativas[0].descricao) && v.ss.texto_final === v.ativas[0].descricao;
  }
  { // 3 confirmações
    const s = await novoItem(`C3${t}`);
    const rs = await Promise.all([1, 2, 3].map(() => chamar("pdi_sugestao_confirmar", { sugestao_id: s.id, texto: "Cumprir metas com foco", categoria: "comportamental" })));
    const v = await invariantes(`C3${t}`, s);
    conta("triplo " + resumo(rs));
    okSem500 &&= rs.every((r) => [200, 409].includes(r.codigo));
    okTriplo &&= v.ativas.length === 1 && v.ss.estado === "validada" && v.confirmadas.length === 1;
  }
  { // confirmar × manter (as duas ordens)
    const item = `CX${t}`;
    const s = await novoItem(item);
    const cf = () => chamar("pdi_sugestao_confirmar", { sugestao_id: s.id, texto: "Cumprir metas com método", categoria: "comportamental" });
    const mt = () => new Promise((r) => setTimeout(r, (t % 4) * 90)).then(() => chamar("pdi_sugestao_manter_no_pdi", { sugestao_id: s.id }));
    const rs = await Promise.all(t % 2 === 0 ? [cf(), mt()] : [mt(), cf()]);
    const fim = (await sugs(item))[0];
    const ativas = await necs(item);
    conta(`confirmar×manter → ${fim.estado} (${resumo(rs)})`);
    okSem500 &&= rs.every((r) => [200, 409].includes(r.codigo));
    okConfirmaManter &&= (fim.estado === "validada" && ativas.length === 1 && Number(fim.necessidade_id) === ativas[0].id) || (fim.estado === "mantida_no_pdi" && ativas.length === 0);
  }
}
JITTER_ATIVO = false;
limparRegras();
console.log("   distribuição dos resultados:", JSON.stringify(distr));
check(`${TRIALS} rodadas × (2 iguais, 2 diferentes, 3 simultâneas, confirmar×manter): nenhum 500 — só 200 ou conflito controlado (409)`, okSem500);
check("2 confirmações simultâneas (mesmo texto), em todas as rodadas: UMA necessidade, UMA sugestão validada ligada a ela, UM evento de confirmação", okMesmoTexto);
check("2 confirmações simultâneas com textos/categorias DIFERENTES: UMA necessidade com o texto de UMA das requisições (sem mistura) e a sugestão repete esse texto", okTextosDiferentes);
check("3 confirmações simultâneas: UMA necessidade, UMA decisão", okTriplo);
check("confirmar × manter simultâneos: decisão única e Base coerente com a triagem (validada+1 necessidade OU mantida+0 necessidades ativas)", okConfirmaManter);
{
  const s = await novoItem("CMM");
  const rs = await Promise.all([chamar("pdi_sugestao_manter_no_pdi", { sugestao_id: s.id }), chamar("pdi_sugestao_manter_no_pdi", { sugestao_id: s.id })]);
  check("2 'manter' simultâneos: uma decisão (200) e a outra 409; uma só auditoria de mantida", rs.filter((r) => r.codigo === 200).length === 1 && rs.every((r) => [200, 409].includes(r.codigo)) && (await audit("pdi_sugestao_mantida_no_pdi", s.id)).length === 1);
}

// ═══ I. Auditoria depois da decisão ═══
secao("I. Falha SÓ na gravação da auditoria, depois de a decisão ter sido persistida");
const logs = [];
const errOriginal = console.error;
console.error = (...a) => { logs.push(a.map(String).join(" ")); };
await gera("IA1", "IA2", "IA3");
const sA1 = await pend("IA1"), sA2 = await pend("IA2");
injetar({ nome: "auditoria", tabela: "peopleflow_dev_auditoria", op: "insert", vezes: 1000 });
const ca = await chamar("pdi_sugestao_confirmar", { sugestao_id: sA1.id, texto: "Documentar processos de forma padronizada", categoria: "comportamental" });
check("I) confirmar com auditoria fora do ar → 200 (NÃO 500) e auditoria = 'pendente'", ca.codigo === 200 && ca.corpo.dados.auditoria === "pendente");
check("I) a decisão foi preservada: necessidade criada e sugestão validada/ligada", (await nNecs("IA1")) === 1 && (await sugs("IA1"))[0].estado === "validada" && Number((await sugs("IA1"))[0].necessidade_id) === (await necs("IA1"))[0].id);
check("I) identificável tecnicamente: [AUDITORIA_PENDENTE] no log do servidor, com a ação e o id da sugestão (sem texto da necessidade)", logs.some((l) => l.includes("[AUDITORIA_PENDENTE]") && /pdi_sugestao_(editada_e_)?confirmada/.test(l) && l.includes(String(sA1.id)) && !l.includes("Documentar processos de forma padronizada")));
const ca2 = await chamar("pdi_sugestao_confirmar", { sugestao_id: sA1.id, texto: "Documentar processos de forma padronizada", categoria: "comportamental" });
check("I) repetir a decisão depois NÃO duplica nada (409 'já confirmada'); o usuário não é induzido a repetir", ca2.codigo === 409 && (await nNecs("IA1")) === 1);
const ma = await chamar("pdi_sugestao_manter_no_pdi", { sugestao_id: sA2.id });
check("I) manter com auditoria fora do ar → 200 e auditoria 'pendente'; decisão gravada", ma.codigo === 200 && ma.corpo.dados.auditoria === "pendente" && (await sugs("IA2"))[0].estado === "mantida_no_pdi");
const ga = await chamar("pdi_triagem_gerar", { pdi_item_ids: ["IJ1"] });
check("I) gerar com auditoria fora do ar → 200 e auditoria 'pendente'; sugestões criadas", ga.codigo === 200 && ga.corpo.dados.auditoria === "pendente" && ga.corpo.dados.sugestoes === 1 && (await pend("IJ1")));
const semAud = await sql(`select s.id from public.peopleflow_dev_pdi_sugestoes s where s.estado in ('validada', 'mantida_no_pdi') and s.pdi_item_id in ('IA1', 'IA2') and not exists (select 1 from public.peopleflow_dev_auditoria a where a.entidade = 'peopleflow_dev_pdi_sugestoes' and a.entidade_id = s.id::text and a.acao in ('pdi_sugestao_confirmada', 'pdi_sugestao_editada_e_confirmada', 'pdi_sugestao_mantida_no_pdi'))`);
check("I) também identificável no banco: decisão sem evento de auditoria aparece numa consulta de conciliação", semAud.length === 2);
limparRegras();
// falha só na 1ª tentativa: a 2ª grava e tudo fica 'ok'
await gera("IA3");
const sA3 = await pend("IA3");
injetar({ nome: "auditoria (1ª tentativa)", tabela: "peopleflow_dev_auditoria", op: "insert", vezes: 1 });
const cb = await chamar("pdi_sugestao_confirmar", { sugestao_id: sA3.id, texto: "Padronizar registros com modelo único", categoria: "comportamental" });
check("I) falha transitória da auditoria: a 2ª tentativa grava e a resposta é 'ok' (eventos existem)", cb.codigo === 200 && cb.corpo.dados.auditoria === "ok" && ([...(await audit("pdi_sugestao_confirmada", sA3.id)), ...(await audit("pdi_sugestao_editada_e_confirmada", sA3.id))]).length === 1);
limparRegras();
console.error = errOriginal;

// ═══ J. Limpeza de sugestões parciais ═══
secao("J. Falha na limpeza de sugestões criadas pela metade");
// J1 = item com 2 ações cuja sugestão pendente já existe (criada acima). Substitui-a para testar "gerar" de novo do zero.
const sJ1 = await pend("IJ1");
await db.query(`update public.peopleflow_dev_pdi_sugestoes set estado = 'substituida', decidido_por = '${U_RH}', decidido_em = now(), motivo_decisao = 'preparação do teste' where id = ${sJ1.id}`);
injetar({ nome: "inserir ações de origem", tabela: "peopleflow_dev_pdi_sugestao_acoes", op: "insert" });
injetar({ nome: "limpeza (substituir)", tabela: "peopleflow_dev_pdi_sugestoes", op: "update", quando: (q) => q.payload?.estado === "substituida", vezes: 1 });
const jg = await chamar("pdi_triagem_gerar", { pdi_item_ids: ["IJ1"] });
const resid = await sql(`select s.id, s.estado, (select count(*)::int from public.peopleflow_dev_pdi_sugestao_acoes a where a.sugestao_id = s.id) as n_acoes from public.peopleflow_dev_pdi_sugestoes s where s.pdi_item_id = 'IJ1' and s.estado = 'pendente'`);
check("J) gerar: falha na criação das ações + falha na limpeza → 500 com diagnóstico de recuperação (resíduo sem ações, não decidível, usar 'Gerar sugestão')", jg.codigo === 500 && /limpeza automática também falhou/.test(jg.corpo.error) && /NÃO podem ser decididos/.test(jg.corpo.error) && /Gerar sugestão/.test(jg.corpo.error));
check("J) estado residual: sugestão pendente SEM ações", resid.length === 1 && resid[0].n_acoes === 0);
const zid = resid[0].id;
const zc = await chamar("pdi_sugestao_confirmar", { sugestao_id: zid, texto: "tentando decidir o resíduo", categoria: "comportamental" });
const zm = await chamar("pdi_sugestao_manter_no_pdi", { sugestao_id: zid });
const zbanco = await R.erro(() => db.query(`update public.peopleflow_dev_pdi_sugestoes set estado = 'mantida_no_pdi', decidido_por = '${U_RH}', decidido_em = now(), motivo_decisao = 'x' where id = ${zid}`));
check("J) o resíduo é INCAPAZ de ser decidido: confirmar 422, manter 422 e o próprio banco recusa a transição", zc.codigo === 422 && zm.codigo === 422 && Boolean(zbanco) && /sem ação de origem/.test(String(zbanco.message)));
check("J) o evento técnico da limpeza que falhou foi registrado", (await audit("pdi_sugestao_limpeza_falhou")).length === 1);
const jr = await ok("pdi_triagem_gerar", { pdi_item_ids: ["IJ1"] });
check("J) 'Gerar sugestão' de novo RECOLHE o resíduo (vira substituida, não apagada) e cria a sugestão correta", jr.incompletas_recolhidas === 1 && (await sugs("IJ1")).find((s) => s.id === zid).estado === "substituida" && (await pend("IJ1"))?.acoes === "JA,JB");
check("J) nenhuma sugestão pendente sem ação sobra no banco", (await sql(`select s.id from public.peopleflow_dev_pdi_sugestoes s where s.estado = 'pendente' and not exists (select 1 from public.peopleflow_dev_pdi_sugestao_acoes a where a.sugestao_id = s.id and a.ativa)`)).length === 0);
// separar: a mesma queda
await gera("IJ2");
const sJ2 = await pend("IJ2");
injetar({ nome: "inserir ações de origem", tabela: "peopleflow_dev_pdi_sugestao_acoes", op: "insert" });
injetar({ nome: "limpeza (substituir)", tabela: "peopleflow_dev_pdi_sugestoes", op: "update", quando: (q) => String(q.payload?.motivo_decisao ?? "").startsWith("Criação interrompida") });
const js = await chamar("pdi_sugestao_separar", { sugestao_id: sJ2.id, grupos: [{ acao_ids: ["JC"] }, { acao_ids: ["JD"] }] });
const resid2 = (await sugs("IJ2")).filter((s) => s.estado === "pendente");
check("J) separar com limpeza falha → 500 com o diagnóstico da limpeza; original substituída; resíduos pendentes sem ação (não decidíveis)", js.codigo === 500 && /limpeza automática também falhou/.test(js.corpo.error) && (await sugs("IJ2")).find((s) => s.id === sJ2.id).estado === "substituida" && resid2.length === 2 && resid2.every((s) => s.acoes === null));
const jr2 = await ok("pdi_triagem_gerar", { pdi_item_ids: ["IJ2"] });
check("J) separar: 'Gerar sugestão' recolhe os 2 resíduos e devolve a sugestão das ações livres", jr2.incompletas_recolhidas === 2 && (await pend("IJ2"))?.acoes === "JC,JD");
// limpeza OK: a mensagem é a de "voltaram para a fila" e não sobra resíduo
const sJ2b = await pend("IJ2");
injetar({ nome: "inserir ações de origem", tabela: "peopleflow_dev_pdi_sugestao_acoes", op: "insert" });
const js2 = await chamar("pdi_sugestao_separar", { sugestao_id: sJ2b.id, grupos: [{ acao_ids: ["JC"] }, { acao_ids: ["JD"] }] });
check("J) separar com falha SÓ na criação (limpeza ok) → 500 'voltaram para a fila'; nenhum resíduo pendente", js2.codigo === 500 && /voltaram para a fila/.test(js2.corpo.error) && (await sugs("IJ2")).filter((s) => s.estado === "pendente").length === 0);
limparRegras();

// ═══ Nada real mudou / invariantes finais ═══
secao("Invariantes finais");
check("nenhuma ação em duas sugestões ativas", (await sql(`select pdi_acao_id from public.peopleflow_dev_pdi_sugestao_acoes where ativa group by 1 having count(*) > 1`)).length === 0);
check("nenhuma necessidade de origem PDI ativa sem sugestão validada ligada (Base = triagem), exceto as criadas à mão pelos testes de validação", (await sql(`select n.id from public.peopleflow_dev_necessidades n where n.origem = 'pdi' and n.status <> 'cancelada' and not exists (select 1 from public.peopleflow_dev_pdi_sugestoes s where s.necessidade_id = n.id and s.estado = 'validada')`)).length === 0);
check("nenhuma sugestão mantida/substituída coexistindo com necessidade ativa nas mesmas ações", (await sql(`select s.id from public.peopleflow_dev_pdi_sugestoes s join public.peopleflow_dev_pdi_sugestao_acoes sa on sa.sugestao_id = s.id join public.peopleflow_dev_necessidades n on n.pdi_acao_id = sa.pdi_acao_id and n.origem = 'pdi' and n.status <> 'cancelada' where s.estado = 'mantida_no_pdi'`)).length === 0);
check("LNT: nenhuma linha criada", Number((await um(`select (select count(*) from public.peopleflow_dev_lnt_ciclos)::int + (select count(*) from public.peopleflow_dev_lnt_itens)::int + (select count(*) from public.peopleflow_dev_lnt_necessidades)::int as n`)).n) === 0);

console.log(`\nRESUMO: ${C.ok} verificações OK, ${C.falhas} falha(s)`);
process.exit(C.falhas ? 1 : 0);

import { montarTriagem, filtrarItens, contar, contagemPorFormaItens, type PdiEntrada } from "../../src/features/desenvolvimento/pdiTriagemItens.ts";
import { indiciosDaAcao } from "../../src/features/desenvolvimento/pdiClassificacao.ts";
import { MOTIVO_PADRAO_MANTER_NO_PDI, TEXTO_A_DEFINIR_PELO_RH, ehTextoADefinir, sugerirNecessidadeLocal, objetivoEhGenerico } from "../../src/domain/pdiTriagem.ts";
import type { TriagemPdi, SugestaoPdi, AcaoTriagem, AcaoDaSugestao, DestinoAcao, NecessidadePdi } from "../../src/features/desenvolvimento/pdiTriagemRepository.ts";

let ok = 0;
let falhas = 0;
const check = (nome: string, cond: boolean, det = "") => {
  if (cond) ok++;
  else {
    falhas++;
    console.log("  FALHOU:", nome, det);
  }
};

const GEN = "Desenvolver a competência de Visão estratégica.";
const MENTORIA = "Participar de mentoria mensal com líder para ganhar visão de negócio";
const REUNIOES = "Participar das reuniões de resultado da empresa como ouvinte";
const CURSO = "Fazer curso de Excel avançado";

const acao = (id: string, descricao: string, ordem: number, status = "Em andamento") => ({ id, descricao, status, ordem });
const pdis: PdiEntrada[] = [
  {
    id: 1,
    colaboradorNome: "Ana",
    ciclo: "2025",
    itens: [
      { id: "I1", competenciaNome: "Visão estratégica", tipoCompetencia: "Comportamental", objetivoDesenvolvimento: GEN, ordem: 0, acoes: [acao("A1", MENTORIA, 0), acao("A2", REUNIOES, 1), acao("A3", "Ler sobre cenários", 2)] },
      { id: "I2", competenciaNome: "Visão estratégica", tipoCompetencia: "Comportamental", objetivoDesenvolvimento: "Entender o impacto financeiro das decisões do setor.", ordem: 1, acoes: [acao("A4", "Estudar o DRE do setor", 0)] },
      { id: "I3", competenciaNome: "Calibração", tipoCompetencia: "Tecnica", objetivoDesenvolvimento: "Reduzir retrabalho de calibração.", ordem: 2, acoes: [acao("A5", CURSO, 0), acao("A6", "Revisar a rotina", 1, "Concluída")] },
    ],
  },
  {
    id: 2,
    colaboradorNome: "Bruno",
    ciclo: "2025",
    itens: [
      // I10: parcialmente decidido (2 mantidas no MESMO item + 1 sem decisão + 1 concluída)
      { id: "I10", competenciaNome: "Comunicação", tipoCompetencia: "Comportamental", objetivoDesenvolvimento: "Comunicar-se com clareza em reuniões.", ordem: 0, acoes: [acao("B1", "Praticar apresentações curtas", 0), acao("B2", "Pedir feedback ao gestor", 1), acao("B3", "Curso de oratória", 2), acao("B4", "Gravar apresentação", 3, "Concluída")] },
      { id: "I11", competenciaNome: "Liderança", tipoCompetencia: "Comportamental", objetivoDesenvolvimento: GEN, ordem: 1, acoes: [acao("C1", "Acompanhar o líder em 1:1", 0)] },
      // item só com ações concluídas e sem decisão → fora da fila
      { id: "I12", competenciaNome: "Organização", tipoCompetencia: "Comportamental", objetivoDesenvolvimento: "Organizar documentos.", ordem: 2, acoes: [acao("D1", "Organizar pastas", 0, "Concluída"), acao("D2", "   ", 1)] },
    ],
  },
];
const depto = new Map([["Ana", "RH"], ["Bruno", "Produção"]]);

const sug = (o: Partial<SugestaoPdi> & { id: number; pdi_item_id: string; estado: SugestaoPdi["estado"] }): SugestaoPdi => ({
  interpretacao_id: 1,
  origem_sugestao: "regra_local",
  derivada_de_id: null,
  pdi_id: 1,
  item_competencia_nome: "",
  item_tipo_competencia: "Comportamental",
  item_objetivo: "",
  texto_sugerido: "texto",
  categoria_sugerida: null,
  texto_final: null,
  editada: false,
  decidido_em: null,
  motivo_decisao: null,
  necessidade_id: null,
  created_at: "2026-10-01T10:00:00Z",
  acoes_total: 1,
  origem_alterada: false,
  contexto_do_item_alterado: false,
  origem_alterada_apos_decisao: false,
  ...o,
});
const dest = (id: string, item: string, destino: DestinoAcao, pdi = 1, sid: number | null = null): AcaoTriagem => ({ pdi_acao_id: id, pdi_item_id: item, pdi_id: pdi, descricao: "", acao_status: "Em andamento", sugestao_id: sid, sugestao_estado: null, destino });
const sa = (sid: number, aid: string, texto: string, ativa = true): AcaoDaSugestao => ({ sugestao_id: sid, pdi_acao_id: aid, acao_texto: texto, ativa });

// ── Cenário base: nada decidido ───────────────────────────────────
const vazio: TriagemPdi = { acoes: [], sugestoes: [], necessidadesPdi: [], acoesDasSugestoes: [] };
{
  const m = montarTriagem({ pdis, triagem: vazio, departamentoPorNome: depto });
  check("1: sem triagem, todo item com ação aberta aguarda análise (I1,I2,I3,I10,I11)", m.aguardando.map((c) => c.itemId).sort().join() === "I1,I10,I11,I2,I3", m.aguardando.map((c) => c.itemId).join());
  const ct = contar(m.aguardando);
  check("1b: contadores por item e por ação (sem números fixos): 5 itens · 9 ações abertas", ct.itens === 5 && ct.acoes === 9, JSON.stringify(ct));
  check("1c: ação concluída e ação vazia não entram", !m.aguardando.some((c) => c.acoesSemSugestao.some((a) => ["A6", "B4", "D1", "D2"].includes(a.id))));
  check("1d: item só com concluídas/vazias fica fora (I12)", !m.aguardando.some((c) => c.itemId === "I12"));
  check("1e: confirmadas e mantidas vazias", m.confirmadas.length === 0 && m.mantidas.length === 0);
  const i1 = m.aguardando.find((c) => c.itemId === "I1")!;
  check("2: competência e objetivo EXATAMENTE como no PDI", i1.competencia === "Visão estratégica" && i1.objetivo === GEN && i1.tipo === "Comportamental");
  check("3: dois itens da MESMA competência continuam separados (I1 e I2)", m.aguardando.filter((c) => c.competencia === "Visão estratégica").length === 2);
  check("3b: departamento do cadastro", i1.departamento === "RH" && m.aguardando.find((c) => c.itemId === "I10")!.departamento === "Produção");
  check("3c: ordenado por colaborador e competência", m.aguardando[0].colaboradorNome === "Ana" && m.aguardando[m.aguardando.length - 1].colaboradorNome === "Bruno");
}

// ── Sugestão pendente cobrindo as 3 ações do item I1 ───────────────
{
  const t: TriagemPdi = {
    acoes: [dest("A1", "I1", "sugestao_pendente", 1, 1), dest("A2", "I1", "sugestao_pendente", 1, 1), dest("A3", "I1", "sugestao_pendente", 1, 1)],
    sugestoes: [sug({ id: 1, pdi_item_id: "I1", estado: "pendente", texto_sugerido: "Visão estratégica: mentoria; reuniões; leitura", acoes_total: 3 })],
    necessidadesPdi: [], acoesDasSugestoes: [sa(1, "A3", "Ler sobre cenários"), sa(1, "A1", MENTORIA), sa(1, "A2", REUNIOES), sa(1, "A9", "inativa", false)],
  };
  const m = montarTriagem({ pdis, triagem: t, departamentoPorNome: depto });
  const i1 = m.aguardando.find((c) => c.itemId === "I1")!;
  check("4: item com sugestão pendente: 1 sugestão com as 3 ações (1 NECESSIDADE para N ações)", i1.sugestoes.length === 1 && i1.sugestoes[0].acoes.length === 3 && i1.acoesSemSugestao.length === 0);
  check("4b: ações da sugestão na ordem do PDI e sem a inativa", i1.sugestoes[0].acoes.map((a) => a.id).join() === "A1,A2,A3");
  check("4c: regra local marca como automática; não desatualizada", i1.sugestoes[0].automatica && !i1.sugestoes[0].desatualizada);
  check("4d: indícios por ação (mentoria na A1)", i1.sugestoes[0].acoes[0].indicios.includes("mentoria"));
  check("4e: contagem soma as ações da sugestão", contar([i1]).acoes === 3 && contar([i1]).decisoes === 1);
}

// ── Item parcialmente decidido: 2 mantidas no MESMO item + 1 sem decisão ──
{
  const t: TriagemPdi = {
    acoes: [dest("B1", "I10", "mantida_no_pdi", 2, 5), dest("B2", "I10", "mantida_no_pdi", 2, 5), dest("B3", "I10", "sem_decisao", 2)],
    sugestoes: [sug({ id: 5, pdi_item_id: "I10", pdi_id: 2, estado: "mantida_no_pdi", decidido_em: "2026-10-02T10:00:00Z", motivo_decisao: MOTIVO_PADRAO_MANTER_NO_PDI, item_competencia_nome: "Comunicação", item_objetivo: "Comunicar-se com clareza em reuniões.", acoes_total: 2 })],
    necessidadesPdi: [], acoesDasSugestoes: [sa(5, "B1", "Praticar apresentações curtas"), sa(5, "B2", "Pedir feedback ao gestor")],
  };
  const m = montarTriagem({ pdis, triagem: t, departamentoPorNome: depto });
  const ag = m.aguardando.find((c) => c.itemId === "I10")!;
  check("5: item parcialmente decidido segue em Aguardando só com a ação sem decisão", ag.acoesSemSugestao.map((a) => a.id).join() === "B3" && ag.sugestoes.length === 0);
  check("5b: resumo do que já foi decidido no item (2 mantidas)", ag.decididas.mantidas === 2 && ag.decididas.confirmadas === 0);
  const mt = m.mantidas.filter((c) => c.itemId === "I10");
  check("5c: as 2 mantidas aparecem em UM card (mesmo item)", mt.length === 1 && mt[0].sugestoes[0].acoes.map((a) => a.id).join() === "B1,B2");
  check("5d: observação padrão não aparece como observação do RH", mt[0].sugestoes[0].observacao === null);
  check("5e: mantidas não vazam para confirmadas", m.confirmadas.length === 0);
}

// ── Decisões do RH: confirmada (editada) e mantida com observação ───
{
  const t: TriagemPdi = {
    acoes: [dest("A4", "I2", "confirmada", 1, 7), dest("A5", "I3", "mantida_no_pdi", 1, 8)],
    sugestoes: [
      sug({ id: 7, pdi_item_id: "I2", estado: "validada", texto_sugerido: "Original", texto_final: "Entender o impacto financeiro", editada: true, necessidade_id: 321, decidido_em: "2026-10-03T10:00:00Z" }),
      sug({ id: 8, pdi_item_id: "I3", estado: "mantida_no_pdi", motivo_decisao: "Já coberto pelo POP", decidido_em: "2026-10-03T11:00:00Z", origem_alterada_apos_decisao: true }),
      sug({ id: 9, pdi_item_id: "I3", estado: "substituida" }),
    ],
    necessidadesPdi: [], acoesDasSugestoes: [sa(7, "A4", "Estudar o DRE do setor"), sa(8, "A5", CURSO)],
  };
  const m = montarTriagem({ pdis, triagem: t, departamentoPorNome: depto });
  const c = m.confirmadas.find((x) => x.itemId === "I2")!;
  check("6: confirmada aparece com texto final, editada e nº da necessidade", c && c.sugestoes[0].textoFinal === "Entender o impacto financeiro" && c.sugestoes[0].editada && c.sugestoes[0].necessidadeId === 321);
  const mt = m.mantidas.find((x) => x.itemId === "I3")!;
  check("6b: mantida com observação do RH", mt.sugestoes[0].observacao === "Já coberto pelo POP");
  check("6c: decisão cujo PDI mudou depois: só aviso histórico, continua na mesma visão", mt.sugestoes[0].origemAlteradaAposDecisao && !mt.sugestoes[0].desatualizada && m.mantidas.length === 1);
  check("6d: substituída não aparece em nenhuma visão", ![...m.aguardando, ...m.confirmadas, ...m.mantidas].some((x) => x.sugestoes.some((s) => s.id === 9)));
  check("6e: item decidido sai de Aguardando (I2 e I3 só tinham a ação decidida; I3 tem A6 concluída)", !m.aguardando.some((x) => x.itemId === "I2" || x.itemId === "I3"));
}

// ── Sugestão pendente desatualizada ────────────────────────────────
{
  const t: TriagemPdi = {
    acoes: [dest("A4", "I2", "sugestao_pendente", 1, 11)],
    sugestoes: [sug({ id: 11, pdi_item_id: "I2", estado: "pendente", origem_alterada: true }), sug({ id: 12, pdi_item_id: "I1", estado: "pendente", contexto_do_item_alterado: true })],
    necessidadesPdi: [], acoesDasSugestoes: [sa(11, "A4", "Estudar o DRE do setor"), sa(12, "A1", MENTORIA)],
  };
  const m = montarTriagem({ pdis, triagem: t, departamentoPorNome: depto });
  const s11 = m.aguardando.find((c) => c.itemId === "I2")!.sugestoes[0];
  const s12 = m.aguardando.find((c) => c.itemId === "I1")!.sugestoes[0];
  check("7: ação alterada → pendente desatualizada", s11.desatualizada);
  check("7b: contexto (competência/objetivo) alterado → pendente desatualizada", s12.desatualizada);
}

// ── Item que saiu do PDI mas tem decisão: continua visível com a fotografia ──
{
  const t: TriagemPdi = {
    acoes: [],
    sugestoes: [sug({ id: 20, pdi_item_id: "IX", pdi_id: 99, estado: "validada", item_competencia_nome: "Competência removida", item_objetivo: "Objetivo antigo", item_tipo_competencia: "Tecnica", texto_final: "Necessidade antiga", necessidade_id: 5 })],
    necessidadesPdi: [], acoesDasSugestoes: [sa(20, "AX", "Ação antiga")],
  };
  const m = montarTriagem({ pdis, triagem: t, departamentoPorNome: depto });
  const c = m.confirmadas.find((x) => x.itemId === "IX");
  check("8: decisão de item removido do PDI continua em Confirmadas, com contexto da época", !!c && c.competencia === "Competência removida" && c.objetivo === "Objetivo antigo" && c.tipo === "Tecnica");
  check("8b: sem PDI localizado não quebra nem inventa colaborador", c!.colaboradorNome === "(PDI não localizado)" && c!.sugestoes[0].acoes[0].texto === "Ação antiga");
}

// ── Filtros auxiliares ─────────────────────────────────────────────
{
  const m = montarTriagem({ pdis, triagem: vazio, departamentoPorNome: depto });
  const livre = { departamento: "", tipo: "todos" as const, forma: "todas" as const };
  check("9: filtros livres devolvem tudo", filtrarItens(m.aguardando, livre).length === m.aguardando.length);
  check("9b: departamento", filtrarItens(m.aguardando, { ...livre, departamento: "RH" }).every((c) => c.departamento === "RH") && filtrarItens(m.aguardando, { ...livre, departamento: "RH" }).length === 3);
  check("9c: tipo técnico", filtrarItens(m.aguardando, { ...livre, tipo: "Tecnica" }).map((c) => c.itemId).join() === "I3");
  check("9d: indício mentoria acha o item que tem uma ação com mentoria (I1)", filtrarItens(m.aguardando, { ...livre, forma: "mentoria" }).map((c) => c.itemId).join() === "I1");
  check("9e: 'outra' = item com ao menos uma ação sem indício", filtrarItens(m.aguardando, { ...livre, forma: "outra" }).some((c) => c.itemId === "I1"));
  const cf = contagemPorFormaItens(m.aguardando, { departamento: "RH", tipo: "todos" });
  check("9f: contagem por forma respeita depto/tipo e 'todas' = universo filtrado", cf.todas === 3 && cf.mentoria === 1);
  check("9g: indícios não removem nada do universo", contar(m.aguardando).itens === 5);
  check("9h: classificação auxiliar intacta", indiciosDaAcao(CURSO).includes("treinamento") && indiciosDaAcao(MENTORIA).includes("mentoria"));
}


// ═══ Regra local (pura): fallback "A definir pelo RH" ════════════════
{
  const espec = sugerirNecessidadeLocal({ objetivo: "Desenvolver maior clareza, segurança e capacidade de conduzir alinhamentos." });
  check("regra: objetivo específico → o objetivo, palavra por palavra", espec.base === "objetivo" && espec.texto === "Desenvolver maior clareza, segurança e capacidade de conduzir alinhamentos.");
  for (const g of ["Desenvolver a competência de Comunicação.", "Dominar Excel.", "", "Desenvolver o KPI de Absenteísmo."]) {
    const r = sugerirNecessidadeLocal({ objetivo: g });
    check(`regra: objetivo genérico/curto/vazio ("${g}") → texto neutro, NUNCA ações coladas`, r.base === "a_definir" && r.texto === TEXTO_A_DEFINIR_PELO_RH && objetivoEhGenerico(g));
  }
  check("ehTextoADefinir reconhece o neutro (caixa, espaços, ponto final) e não confunde texto real", ehTextoADefinir("A definir pelo RH") && ehTextoADefinir("  a   DEFINIR pelo rh. ") && !ehTextoADefinir("Definir plano de comunicação com o RH") && !ehTextoADefinir("") && !ehTextoADefinir(null));
}

// ═══ 11. As 3 sugestões LEGADO validadas aparecem em "Confirmadas" (formato real do backfill) ═══
const legadoValidada = (id: number, item: string, pdi: number, texto: string, nec: number) =>
  sug({ id, pdi_item_id: item, pdi_id: pdi, origem_sugestao: "legado", interpretacao_id: null, estado: "validada", texto_sugerido: texto, texto_final: texto, necessidade_id: nec, decidido_em: "2026-10-01T10:00:00Z", item_competencia_nome: "x", acoes_total: 1 });
{
  const nec = (id: number, acao: string): NecessidadePdi => ({ id, pdi_acao_id: acao, status: "validada", descricao: `necessidade legada ${id}`, categoria: "comportamental", prioridade: "media" });
  const t: TriagemPdi = {
    acoes: [dest("A1", "I1", "confirmada", 1, 101), dest("A4", "I2", "confirmada", 1, 102), dest("C1", "I20", "confirmada", 3, 103)],
    sugestoes: [legadoValidada(101, "I1", 1, "necessidade legada 1", 1), legadoValidada(102, "I2", 1, "necessidade legada 2", 2), legadoValidada(103, "I20", 3, "necessidade legada 3", 3)],
    necessidadesPdi: [nec(1, "A1"), nec(2, "A4"), nec(3, "C1")],
    acoesDasSugestoes: [sa(101, "A1", MENTORIA), sa(102, "A4", "Estudar o DRE do setor"), sa(103, "C1", "Conduzir o 1:1 mensal")],
  };
  const m = montarTriagem({ pdis, triagem: t, departamentoPorNome: depto });
  check("11: as 3 sugestões legado validadas aparecem em 'Confirmadas' (3 itens, 3 decisões) com o texto da necessidade", m.confirmadas.length === 3 && contar(m.confirmadas).decisoes === 3 && m.confirmadas.every((c) => c.sugestoes[0].textoFinal?.startsWith("necessidade legada")));
  check("11: legado não é 'sugerido automaticamente', não é 'a definir', não é 'editado' e mostra o nº da necessidade", m.confirmadas.every((c) => !c.sugestoes[0].automatica && !c.sugestoes[0].aDefinir && !c.sugestoes[0].editada && c.sugestoes[0].necessidadeId !== null));
  check("11: ligadas a necessidades → nenhuma 'necessidade sem vínculo'", m.confirmadas.every((c) => c.sugestoes[0].necessidadeSolta === null));
  check("11: os itens decididos não ficam em Aguardando nem em Mantidas", !m.aguardando.some((c) => ["I1", "I2", "I20"].includes(c.itemId) && c.sugestoes.length > 0) && m.mantidas.length === 0);
}

// ═══ 12. FORMATO REAL: mesmo item, 2 sugestões legado (1 ação cada) mantidas + outra ação livre ═══
{
  const mantidaLegado = (id: number, motivo: string) =>
    sug({ id, pdi_item_id: "I10", pdi_id: 2, origem_sugestao: "legado", interpretacao_id: null, estado: "mantida_no_pdi", texto_sugerido: motivo, decidido_em: "2026-10-02T18:08:00Z", motivo_decisao: motivo, item_competencia_nome: "Comunicação", item_objetivo: "Comunicar-se com clareza em reuniões.", acoes_total: 1 });
  const base: TriagemPdi = {
    acoes: [dest("B1", "I10", "mantida_no_pdi", 2, 201), dest("B2", "I10", "mantida_no_pdi", 2, 202), dest("B3", "I10", "sem_decisao", 2)],
    sugestoes: [mantidaLegado(201, MOTIVO_PADRAO_MANTER_NO_PDI), mantidaLegado(202, "Já acompanhado pelo gestor")],
    necessidadesPdi: [],
    acoesDasSugestoes: [sa(201, "B1", "Praticar apresentações curtas"), sa(202, "B2", "Pedir feedback ao gestor")],
  };
  const a = montarTriagem({ pdis, triagem: base, departamentoPorNome: depto });
  const mant = a.mantidas.filter((c) => c.itemId === "I10");
  check("12: UM card do item em 'Mantidas', com as DUAS decisões históricas dentro (cada uma com 1 ação)", mant.length === 1 && mant[0].sugestoes.length === 2 && mant[0].sugestoes.every((s) => s.acoes.length === 1) && mant[0].sugestoes.map((s) => s.acoes[0].id).sort().join() === "B1,B2");
  check("12: as decisões não foram fundidas: cada uma com seu motivo (o padrão não aparece como observação; o do RH aparece)", mant[0].sugestoes.find((s) => s.id === 201)!.observacao === null && mant[0].sugestoes.find((s) => s.id === 202)!.observacao === "Já acompanhado pelo gestor");
  check("12: contador de 'Mantidas' = 1 item · 2 ações · 2 decisões", (() => { const c = contar(a.mantidas); return c.itens === 1 && c.acoes === 2 && c.decisoes === 2; })());
  const ag = a.aguardando.find((c) => c.itemId === "I10")!;
  check("12: a ação livre (B3) segue em 'Aguardando' como 'sem sugestão', com o resumo das 2 mantidas", ag.acoesSemSugestao.map((x) => x.id).join() === "B3" && ag.sugestoes.length === 0 && ag.decididas.mantidas === 2 && ag.decididas.confirmadas === 0);
  const depois: TriagemPdi = {
    ...base,
    acoes: [dest("B1", "I10", "mantida_no_pdi", 2, 201), dest("B2", "I10", "mantida_no_pdi", 2, 202), dest("B3", "I10", "sugestao_pendente", 2, 203)],
    sugestoes: [...base.sugestoes, sug({ id: 203, pdi_item_id: "I10", pdi_id: 2, estado: "pendente", texto_sugerido: "Comunicar-se com clareza em reuniões.", acoes_total: 1 })],
    acoesDasSugestoes: [...base.acoesDasSugestoes, sa(203, "B3", "Curso de oratória")],
  };
  const d = montarTriagem({ pdis, triagem: depois, departamentoPorNome: depto });
  const agd = d.aguardando.find((c) => c.itemId === "I10")!;
  check("12: depois de gerar, Aguardando mostra UMA sugestão pendente só com B3 e o resumo das mantidas; nada de decisão antiga dentro dela", agd.sugestoes.length === 1 && agd.sugestoes[0].acoes.map((x) => x.id).join() === "B3" && agd.acoesSemSugestao.length === 0 && agd.decididas.mantidas === 2);
  check("12: Mantidas continua com o MESMO card de 2 decisões (a nova sugestão não aparece lá)", d.mantidas.filter((c) => c.itemId === "I10").length === 1 && d.mantidas[0].sugestoes.length === 2 && !d.mantidas[0].sugestoes.some((s) => s.id === 203));
  check("12: o item aparece em duas visões ao mesmo tempo, cada uma só com o que lhe cabe", d.aguardando.some((c) => c.itemId === "I10") && d.mantidas.some((c) => c.itemId === "I10") && !d.confirmadas.some((c) => c.itemId === "I10"));
}

// ═══ Tela: "A definir", necessidade sem vínculo e resíduos ═══
{
  const t: TriagemPdi = {
    acoes: [dest("A1", "I1", "sugestao_pendente", 1, 301), dest("A2", "I1", "sugestao_pendente", 1, 301), dest("A3", "I1", "sugestao_pendente", 1, 301), dest("A4", "I2", "sugestao_pendente", 1, 302), dest("A5", "I3", "sugestao_pendente", 1, 303)],
    sugestoes: [
      sug({ id: 301, pdi_item_id: "I1", estado: "pendente", texto_sugerido: TEXTO_A_DEFINIR_PELO_RH, acoes_total: 3 }),
      sug({ id: 302, pdi_item_id: "I2", estado: "pendente", texto_sugerido: "Entender o impacto financeiro das decisões do setor.", origem_alterada: true }),
      sug({ id: 303, pdi_item_id: "I3", estado: "pendente", texto_sugerido: "texto" }),
      sug({ id: 304, pdi_item_id: "I20", pdi_id: 3, estado: "validada", texto_sugerido: TEXTO_A_DEFINIR_PELO_RH, texto_final: "Liderança com autonomia", editada: true, necessidade_id: 9, acoes_total: 2 }),
    ],
    necessidadesPdi: [{ id: 77, pdi_acao_id: "A4", status: "validada", descricao: "Necessidade já criada antes da queda", categoria: "comportamental", prioridade: "alta" }],
    acoesDasSugestoes: [sa(301, "A1", MENTORIA), sa(301, "A2", REUNIOES), sa(301, "A3", "Ler sobre cenários"), sa(302, "A4", "Estudar o DRE do setor"), sa(304, "C1", "Conduzir o 1:1 mensal")],
  };
  const m = montarTriagem({ pdis, triagem: t, departamentoPorNome: depto });
  const i1 = m.aguardando.find((c) => c.itemId === "I1")!;
  check("tela: sugestão 'a definir' é marcada aDefinir (a tela mostra 'Necessidade a definir', sem botão de confirmação direta)", i1.sugestoes[0].aDefinir === true && i1.sugestoes[0].textoSugerido === TEXTO_A_DEFINIR_PELO_RH);
  const i2 = m.aguardando.find((c) => c.itemId === "I2")!;
  check("tela: necessidade criada e sem vínculo é reconhecida (nº, texto, categoria, prioridade) e a sugestão segue pendente", i2.sugestoes[0].necessidadeSolta?.id === 77 && i2.sugestoes[0].necessidadeSolta.descricao === "Necessidade já criada antes da queda" && i2.sugestoes[0].necessidadeSolta.prioridade === "alta");
  check("tela: sugestão sem ação (resíduo) NÃO vira card (não pode ser decidida)", !m.aguardando.some((c) => c.sugestoes.some((s) => s.id === 303)));
  const conf = m.confirmadas.find((c) => c.itemId === "I20")!;
  check("tela: não mostra 'Texto editado pelo RH' quando a sugestão original era 'a definir' (o RH só escreveu o texto)", conf.sugestoes[0].editada === false && conf.sugestoes[0].textoFinal === "Liderança com autonomia");
  check("tela: necessidade ligada à sugestão validada NÃO é 'sem vínculo'", conf.sugestoes[0].necessidadeSolta === null);
}


console.log(`\n${ok} verificações OK, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);

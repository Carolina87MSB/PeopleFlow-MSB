// Triagem TEMÁTICA local do PDI: motor determinístico (src/domain/pdiTemas.ts), modelo de leitura da visão "Por temas"
// (pdiTemasModelo.ts) e garantias de segurança (sem rede, sem IA, sem decisão nova). Só dados sintéticos.
//   cd tests && npx tsx temas/teste_temas.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CATALOGO_TEMAS, ORDEM_TEMAS, ROTULO_TEMA, VERSAO_CATALOGO_TEMAS, classificarItem, normalizarParaTema, type TemaId } from "../../src/domain/pdiTemas.ts";
import { acoesExibidas, montarTemas } from "../../src/features/desenvolvimento/pdiTemasModelo.ts";
import { filtrarItens, montarTriagem, type PdiEntrada } from "../../src/features/desenvolvimento/pdiTriagemItens.ts";
import type { AcaoDaSugestao, AcaoTriagem, DestinoAcao, NecessidadePdi, SugestaoPdi, TriagemPdi } from "../../src/features/desenvolvimento/pdiTriagemRepository.ts";

let ok = 0;
let falhas = 0;
const check = (nome: string, cond: boolean, det = "") => {
  if (cond) ok++;
  else {
    falhas++;
    console.log("  FALHOU:", nome, det);
  }
};

// ── armadilha de rede: qualquer chamada externa durante os testes é falha ──
let chamadasExternas = 0;
const armadilha = () => {
  chamadasExternas++;
  throw new Error("chamada externa proibida");
};
const g = globalThis as unknown as Record<string, unknown>;
g.fetch = armadilha;
g.XMLHttpRequest = armadilha;
g.WebSocket = armadilha;
g.EventSource = armadilha;

const GEN = "Desenvolver a competência de X.";
const tema = (competencia: string, objetivo: string, acao: string): { temas: TemaId[]; revisao: string | null; explicacao: string } => {
  const [r] = classificarItem({ competencia, objetivo, acoes: [{ id: "a", texto: acao }] });
  return { temas: r.temas.map((t) => t.tema), revisao: r.revisao, explicacao: r.temas.map((t) => t.explicacao).join(" | ") };
};
const soTema = (competencia: string, objetivo: string, acao: string, esperado: TemaId) => {
  const r = tema(competencia, objetivo, acao);
  return r.temas.length === 1 && r.temas[0] === esperado && r.revisao === null;
};

// ═══ Catálogo ═══
{
  check("catálogo: versão declarada", VERSAO_CATALOGO_TEMAS === "temas-v1");
  check("catálogo: ids únicos e a revisão individual vem por último", new Set(ORDEM_TEMAS).size === ORDEM_TEMAS.length && ORDEM_TEMAS[ORDEM_TEMAS.length - 1] === "revisao");
  check(
    "catálogo: os 8 grupos pedidos, com estes rótulos",
    ["Comunicação e relacionamento", "Liderança e gestão", "Qualidade e conformidade", "Ferramentas digitais", "Análise e gestão de resultados", "Organização e produtividade", "Outros temas", "Revisão individual necessária"].every((r) => Object.values(ROTULO_TEMA).includes(r)) && Object.keys(ROTULO_TEMA).length === 8,
  );
  const fortes = CATALOGO_TEMAS.flatMap((t) => t.fortes.map((f) => [f, t.id] as const));
  const repetidas = fortes.filter(([f], i) => fortes.findIndex(([x]) => x === f) !== i);
  check("catálogo: nenhuma expressão FORTE pertence a dois temas", repetidas.length === 0, JSON.stringify(repetidas));
  const genericas = ["curso", "treinamento", "desenvolver", "melhorar", "competencia", "capacitacao", "aprender", "estudar"];
  const todasFortes = CATALOGO_TEMAS.flatMap((t) => [...t.fortes, ...(t.subtemas ?? []).flatMap((s) => s.fortes)]);
  check("catálogo: palavra genérica de PDI nunca é expressão (nem forte)", !genericas.some((x) => todasFortes.includes(x) || CATALOGO_TEMAS.some((t) => t.fracos.includes(x))));
}

// ═══ Normalização e correspondência por sinônimos/expressões ═══
{
  check("normalização 1:1 (índices valem para o texto original)", normalizarParaTema("Comunicação Ágil!").length === "Comunicação Ágil!".length && normalizarParaTema("Ação") === "acao");
  check("comunicação: oratória", soTema("Desenvolvimento", GEN, "Fazer curso de oratória", "comunicacao"));
  check("comunicação: falar em público / acentos e caixa", soTema("Desenvolvimento", GEN, "FALAR EM PÚBLICO com segurança", "comunicacao"));
  check("comunicação: comunicação assertiva (radical comunica*)", soTema("Desenvolvimento", GEN, "Treinar comunicação assertiva", "comunicacao"));
  check("liderança: gestão de pessoas", soTema("Desenvolvimento", GEN, "Curso de gestão de pessoas", "lideranca"));
  check("liderança: delegação e tomada de decisão", soTema("Desenvolvimento", GEN, "Praticar delegação de tarefas", "lideranca"));
  check("qualidade: ISO 9001", soTema("Desenvolvimento", GEN, "Curso de interpretação da ISO 9001", "qualidade"));
  check("qualidade: 5S e melhoria contínua", soTema("Desenvolvimento", GEN, "Aplicar 5S na linha", "qualidade") && soTema("Desenvolvimento", GEN, "Participar de ciclos de melhoria contínua", "qualidade"));
  check("qualidade: auditoria interna", soTema("Desenvolvimento", GEN, "Formação de auditor interno", "qualidade"));
  check("ferramentas: Excel / Power BI / SAP", soTema("Desenvolvimento", GEN, "Excel avançado", "ferramentas") && soTema("Desenvolvimento", GEN, "Aprender Power BI", "ferramentas") && soTema("Desenvolvimento", GEN, "Treinamento em SAP", "ferramentas"));
  check("ferramentas: inteligência artificial e 'IA' maiúscula", soTema("Desenvolvimento", GEN, "Inteligência Artificial (assistente generativo)", "ferramentas") && soTema("Desenvolvimento", GEN, "Usar IA no dia a dia", "ferramentas"));
  check("'ia' minúscula (verbo 'ele ia') NÃO é inteligência artificial", tema("Desenvolvimento", GEN, "Reunião onde ele ia explicar a agenda").temas.every((t) => t !== "ferramentas"));
  check("análise: indicadores / KPI", soTema("Desenvolvimento", GEN, "Acompanhar os indicadores da área", "analise") && soTema("Desenvolvimento", GEN, "Definir KPI do setor", "analise"));
  check("organização: gestão do tempo / priorização", soTema("Desenvolvimento", GEN, "Curso de gestão do tempo", "organizacao") && soTema("Desenvolvimento", GEN, "Aprender a priorização de demandas", "organizacao"));
  check("outros: idiomas com subassunto na explicação", soTema("Desenvolvimento", GEN, "Fazer curso de inglês", "outros") && /Idiomas/.test(tema("Desenvolvimento", GEN, "Fazer curso de inglês").explicacao));
  check("outros: NR-35 / segurança do trabalho", soTema("Desenvolvimento", GEN, "Renovar NR-35", "outros") && /Segurança do trabalho/.test(tema("Desenvolvimento", GEN, "Renovar NR-35").explicacao));
  check("outros: finanças e contabilidade", soTema("Desenvolvimento", GEN, "Estudar fluxo de caixa", "outros"));
  check("explicação cita o trecho ORIGINAL da ação (com acento)", /“oratória”/.test(tema("Desenvolvimento", GEN, "Fazer curso de oratória").explicacao));
  check("sem pontuação de confiança em nenhuma correspondência", classificarItem({ competencia: "Comunicação", objetivo: GEN, acoes: [{ id: "a", texto: "Fazer curso de oratória" }] }).every((r) => r.temas.every((t) => !("confianca" in t) && !("pontuacao" in t) && !("score" in t))));
}

// ═══ Temas diferentes com termos semelhantes ═══
{
  check("'gestão de pessoas' ≠ 'gestão de processos' ≠ 'gestão de projetos' ≠ 'gestão do tempo'", soTema("D", GEN, "gestão de pessoas", "lideranca") && soTema("D", GEN, "gestão de processos", "qualidade") && soTema("D", GEN, "gestão de projetos", "organizacao") && soTema("D", GEN, "gestão do tempo", "organizacao"));
  check("'análise de dados' (análise) ≠ 'análise de causa' (qualidade)", soTema("D", GEN, "análise de dados do setor", "analise") && soTema("D", GEN, "análise de causa raiz", "qualidade"));
  check("'planilha' sozinha NÃO vira ferramentas sem contexto (termo genérico)", tema("D", GEN, "Atualizar a planilha da semana").temas.length === 0);
  check("'apresentação' sozinha NÃO vira comunicação sem contexto", tema("D", GEN, "Fazer a apresentação do mês").temas.length === 0);
  check("'apresentação' COM contexto de comunicação vira comunicação (explica o contexto)", soTema("Comunicação", "Falar melhor", "Fazer a apresentação do mês", "comunicacao") && /mesmo assunto/.test(tema("Comunicação", "Falar melhor", "Fazer a apresentação do mês").explicacao));
  check("'feedback' sozinho (palavra genérica) não decide tema", tema("D", GEN, "Solicitar feedback").temas.length === 0);
  check("fragmento 'isolamento' NÃO casa 'iso' (fronteira de palavra)", tema("D", GEN, "Revisar o isolamento térmico do galpão").temas.length === 0);
  check("fragmento 'sistemático' não casa 'sistema' (radical é fraco e exige contexto)", tema("D", GEN, "Fazer um acompanhamento sistemático").temas.every((t) => t !== "ferramentas"));
}

// ═══ Objetivo genérico, ação ambígua, contraditória, ampla ═══
{
  const generico = tema("Desenvolvimento Profissional", "Desenvolver a competência de Desenvolvimento Profissional.", "Participar de treinamento");
  check("objetivo genérico sem evidência → revisão individual (nada inventado)", generico.temas.length === 0 && /genéricos/.test(generico.revisao ?? ""), generico.revisao ?? "");
  const ambigua = tema("Desenvolvimento", GEN, "Atualizar a planilha");
  check("ação ambígua (só termo genérico, sem contexto) → revisão individual", ambigua.temas.length === 0 && /ambíguo/.test(ambigua.revisao ?? ""), ambigua.revisao ?? "");
  const contra = tema("Organização", "Manter a rotina organizada.", "Atualizar semanalmente a planilha de acompanhamento");
  check("termo fraco que contradiz o contexto → revisão individual com explicação", contra.temas.length === 0 && /contraditório/.test(contra.revisao ?? ""), contra.revisao ?? "");
  const ampla = tema("D", GEN, "Curso de liderança, comunicação assertiva e Excel");
  check("ação que cita temas demais → revisão (não adivinha)", ampla.temas.length === 0 && /temas demais/.test(ampla.revisao ?? ""), ampla.revisao ?? "");
  const herda = tema("Liderança", "Liderar melhor.", "Ler um livro indicado");
  check("ação sem termo herda o tema SOMENTE se o contexto indica um único tema (e diz isso)", herda.temas[0] === "lideranca" && /não cita um tema/.test(herda.explicacao));
  const duploCtx = tema("Comunicação e liderança", GEN, "Ler um livro");
  check("contexto com dois temas e ação sem termo → revisão", duploCtx.temas.length === 0 && /mais de um assunto/.test(duploCtx.revisao ?? ""));
  const diverge = classificarItem({ competencia: "Liderança", objetivo: "Liderar melhor.", acoes: [{ id: "a", texto: "Aprender Excel avançado" }] })[0];
  check("ação forte em tema diferente do contexto: fica no tema da ação, com NOTA informativa", diverge.temas[0].tema === "ferramentas" && /trata de Liderança e gestão/.test(diverge.temas[0].nota ?? ""));
  check("ação vazia não quebra", classificarItem({ competencia: "", objetivo: "", acoes: [{ id: "a", texto: "" }] })[0].revisao !== null);
}

// ═══ Cenário PDI → triagem (modelo por temas) ═══
const acao = (id: string, descricao: string, ordem: number, status = "Em andamento") => ({ id, descricao, status, ordem });
const pdis: PdiEntrada[] = [
  {
    id: 1,
    colaboradorNome: "Ana Teste",
    ciclo: "2025",
    itens: [
      // dois temas: comunicação (oratória) + ferramentas (Power BI)
      { id: "I1", competenciaNome: "Desenvolvimento Profissional", tipoCompetencia: "Comportamental", objetivoDesenvolvimento: "Ampliar capacidades profissionais.", ordem: 0, acoes: [acao("A1", "Desenvolver capacidade de apresentação e oratória", 0), acao("A2", "Aprender Power BI para construção de dashboards", 1)] },
      { id: "I2", competenciaNome: "Comunicação", tipoCompetencia: "Comportamental", objetivoDesenvolvimento: "Desenvolver maior clareza, segurança e capacidade de conduzir alinhamentos.", ordem: 1, acoes: [acao("A3", "Realizar apresentações periódicas", 0), acao("A4", "Solicitar feedback", 1), acao("A5", "Conduzir alinhamentos entre áreas", 2)] },
      { id: "I3", competenciaNome: "Melhoria Contínua", tipoCompetencia: "Comportamental", objetivoDesenvolvimento: "Desenvolver a competência de Melhoria Contínua.", ordem: 2, acoes: [acao("A6", "Inteligência Artificial (assistente generativo)", 0)] },
    ],
  },
  {
    id: 2,
    colaboradorNome: "Bruno Teste",
    ciclo: "2025",
    itens: [
      { id: "I4", competenciaNome: "Desenvolvimento Profissional", tipoCompetencia: "Comportamental", objetivoDesenvolvimento: "Desenvolver a competência de Desenvolvimento Profissional.", ordem: 0, acoes: [acao("B1", "Participar de treinamento", 0), acao("B2", "Curso de Excel", 1)] },
      { id: "I5", competenciaNome: "Qualidade", tipoCompetencia: "Tecnica", objetivoDesenvolvimento: "Reduzir não conformidades.", ordem: 1, acoes: [acao("B3", "Aplicar 5S na linha", 0)] },
    ],
  },
  { id: 3, colaboradorNome: "Carla Teste", ciclo: "2025", itens: [{ id: "I6", competenciaNome: "Liderança", tipoCompetencia: "Comportamental", objetivoDesenvolvimento: "Liderar com mais autonomia.", ordem: 0, acoes: [acao("C1", "Curso de gestão de pessoas", 0)] }] },
];
const depto = new Map([["Ana Teste", "RH"], ["Bruno Teste", "Produção"], ["Carla Teste", "Produção"]]);

const sug = (o: Partial<SugestaoPdi> & { id: number; pdi_item_id: string; estado: SugestaoPdi["estado"] }): SugestaoPdi => ({
  interpretacao_id: 1, origem_sugestao: "regra_local", derivada_de_id: null, pdi_id: 1, item_competencia_nome: "", item_tipo_competencia: "Comportamental", item_objetivo: "",
  texto_sugerido: "texto", categoria_sugerida: null, texto_final: null, editada: false, decidido_em: null, motivo_decisao: null, necessidade_id: null, created_at: "2026-10-01T10:00:00Z",
  acoes_total: 1, origem_alterada: false, contexto_do_item_alterado: false, origem_alterada_apos_decisao: false, ...o,
});
const dest = (id: string, item: string, destino: DestinoAcao, pdi = 1, sid: number | null = null): AcaoTriagem => ({ pdi_acao_id: id, pdi_item_id: item, pdi_id: pdi, descricao: "", acao_status: "Em andamento", sugestao_id: sid, sugestao_estado: null, destino });
const sa = (sid: number, aid: string, texto: string): AcaoDaSugestao => ({ sugestao_id: sid, pdi_acao_id: aid, acao_texto: texto, ativa: true });

const vazio: TriagemPdi = { acoes: [], sugestoes: [], necessidadesPdi: [], acoesDasSugestoes: [] };
const congelar = <T>(o: T): T => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) congelar(v);
  }
  return o;
};

{
  const m = montarTriagem({ pdis, triagem: vazio, departamentoPorNome: depto });
  const t = montarTemas(m.aguardando);
  const grupo = (id: TemaId) => t.grupos.find((x) => x.tema === id);
  check("grupos sugeridos: comunicação, liderança, qualidade, ferramentas e revisão (ordem do catálogo, revisão por último)", t.grupos.map((x) => x.tema).join() === "comunicacao,lideranca,qualidade,ferramentas,revisao", t.grupos.map((x) => x.tema).join());
  const comunic = grupo("comunicacao")!;
  check("item com dois temas aparece nos dois grupos", grupo("comunicacao")!.itens.some((i) => i.card.itemId === "I1") && grupo("ferramentas")!.itens.some((i) => i.card.itemId === "I1"));
  const i1c = comunic.itens.find((i) => i.card.itemId === "I1")!;
  const i1f = grupo("ferramentas")!.itens.find((i) => i.card.itemId === "I1")!;
  check("a decisão é UNICA: é o MESMO objeto ItemCard nos dois grupos (nada duplicado)", i1c.card === i1f.card && i1c.card === m.aguardando.find((c) => c.itemId === "I1"));
  check("em cada grupo só as ações correspondentes (A1 em comunicação, A2 em ferramentas)", i1c.acoes.map((a) => a.acao.id).join() === "A1" && i1f.acoes.map((a) => a.acao.id).join() === "A2");
  check("o item indica em que outros grupos aparece", i1c.tambemEm.join() === "ferramentas" && i1f.tambemEm.join() === "comunicacao");
  check("item I2 (3 ações, mesmo tema) conta UM item no grupo, com 3 ações", comunic.itens.filter((i) => i.card.itemId === "I2").length === 1 && comunic.itens.find((i) => i.card.itemId === "I2")!.acoes.length === 3);
  check("totais únicos de comunicação: 2 itens (I1,I2), 1 colaboradora, 1 departamento, 4 ações", JSON.stringify(comunic.totais) === JSON.stringify({ itens: 2, colaboradores: 1, departamentos: 1, acoes: 4 }), JSON.stringify(comunic.totais));
  const fer = grupo("ferramentas")!;
  check("totais únicos de ferramentas: I1,I3,I4 → 3 itens, 2 colaboradores, 2 departamentos, 3 ações (A2,A6,B2)", JSON.stringify(fer.totais) === JSON.stringify({ itens: 3, colaboradores: 2, departamentos: 2, acoes: 3 }), JSON.stringify(fer.totais));
  const rev = grupo("revisao")!;
  check("revisão individual: B1 (treinamento genérico) com motivo legível", rev.itens.length === 1 && rev.itens[0].card.itemId === "I4" && rev.itens[0].acoes[0].acao.id === "B1" && rev.itens[0].acoes[0].origem === "revisao" && rev.itens[0].acoes[0].explicacao.length > 20);
  check("item I4 aparece em ferramentas (B2) e em revisão (B1)", fer.itens.some((i) => i.card.itemId === "I4") && rev.itens[0].tambemEm.join() === "ferramentas");
  check("indicadores: 6 itens, 4 grupos sugeridos (sem contar revisão), 1 item em revisão", JSON.stringify(t.indicadores) === JSON.stringify({ itens: 6, grupos: 4, revisao: 1 }), JSON.stringify(t.indicadores));
  check("colaboradores/itens não são contados em duplicidade entre grupos: soma dos grupos > itens únicos, indicador usa únicos", t.grupos.reduce((n, x) => n + x.totais.itens, 0) > t.indicadores.itens);
  check("toda ação exibida de todo item aparece em algum grupo (nenhuma se perde)", m.aguardando.every((c) => acoesExibidas(c).every((a) => t.grupos.some((x) => x.itens.some((i) => i.card === c && i.acoes.some((z) => z.acao.id === a.id))))));
  check("nenhum item/ação perdido ou criado: ações dos grupos ⊆ ações do PDI", t.grupos.every((x) => x.itens.every((i) => i.acoes.every((a) => pdis.some((p) => p.itens.some((it) => it.acoes.some((z) => z.id === a.acao.id)))))));
}

// ═══ Sugestão local pendente já existente (cenário "Drielly", com dados fictícios) ═══
{
  const triagem: TriagemPdi = {
    acoes: [dest("C1", "I6", "sugestao_pendente", 3, 9)],
    sugestoes: [sug({ id: 9, pdi_id: 3, pdi_item_id: "I6", estado: "pendente", origem_sugestao: "regra_local", texto_sugerido: "Liderar com mais autonomia." })],
    necessidadesPdi: [],
    acoesDasSugestoes: [sa(9, "C1", "Curso de gestão de pessoas")],
  };
  const m = montarTriagem({ pdis, triagem: congelar(structuredClone(triagem)), departamentoPorNome: depto });
  const t = montarTemas(m.aguardando.filter((c) => c.itemId === "I6"));
  const item = t.grupos.find((x) => x.tema === "lideranca")!.itens[0];
  check("sugestão local pendente preservada: mesma sugestão (id 9, regra_local, texto intacto) dentro do item agrupado", item.card.sugestoes.length === 1 && item.card.sugestoes[0].id === 9 && item.card.sugestoes[0].origem === "regra_local" && item.card.sugestoes[0].textoSugerido === "Liderar com mais autonomia." && item.card.sugestoes[0].estado === "pendente");
  check("a ação da sugestão continua vinculada à mesma sugestão", item.card.sugestoes[0].acoes.map((a) => a.id).join() === "C1" && item.acoes[0].acao.id === "C1");
}

// ═══ Mudança de status após decisão do RH ═══
{
  const base: TriagemPdi = {
    acoes: [dest("A1", "I1", "sugestao_pendente", 1, 1), dest("A2", "I1", "sugestao_pendente", 1, 1)],
    sugestoes: [sug({ id: 1, pdi_item_id: "I1", estado: "pendente", acoes_total: 2 })],
    necessidadesPdi: [],
    acoesDasSugestoes: [sa(1, "A1", "Desenvolver capacidade de apresentação e oratória"), sa(1, "A2", "Aprender Power BI para construção de dashboards")],
  };
  const antes = montarTriagem({ pdis, triagem: congelar(structuredClone(base)), departamentoPorNome: depto });
  const tAntes = montarTemas(antes.aguardando);
  check("antes da decisão: I1 aguarda em comunicação e ferramentas", ["comunicacao", "ferramentas"].every((id) => tAntes.grupos.find((x) => x.tema === (id as TemaId))!.itens.some((i) => i.card.itemId === "I1")));

  const confirmada: TriagemPdi = {
    acoes: [dest("A1", "I1", "confirmada", 1, 1), dest("A2", "I1", "confirmada", 1, 1)],
    sugestoes: [sug({ id: 1, pdi_item_id: "I1", estado: "validada", acoes_total: 2, texto_final: "Necessidade confirmada pelo RH", necessidade_id: 77, decidido_em: "2026-10-05T10:00:00Z" })],
    necessidadesPdi: [{ id: 77, pdi_acao_id: "A1", descricao: "x", categoria: null, prioridade: "media" } as NecessidadePdi],
    acoesDasSugestoes: base.acoesDasSugestoes,
  };
  const depois = montarTriagem({ pdis, triagem: congelar(structuredClone(confirmada)), departamentoPorNome: depto });
  const tAguard = montarTemas(depois.aguardando);
  const tConf = montarTemas(depois.confirmadas);
  check("depois de confirmar: I1 sai de 'aguardando' em TODOS os temas", !tAguard.grupos.some((x) => x.itens.some((i) => i.card.itemId === "I1")));
  check("depois de confirmar: I1 está em 'confirmadas', nos mesmos 2 temas, com a MESMA necessidade (nº 77) nos dois", ["comunicacao", "ferramentas"].every((id) => tConf.grupos.find((x) => x.tema === (id as TemaId))?.itens.some((i) => i.card.itemId === "I1" && i.card.sugestoes[0].necessidadeId === 77)));
  const mantida: TriagemPdi = { ...confirmada, acoes: [dest("A1", "I1", "mantida_no_pdi", 1, 1), dest("A2", "I1", "mantida_no_pdi", 1, 1)], sugestoes: [sug({ id: 1, pdi_item_id: "I1", estado: "mantida_no_pdi", acoes_total: 2, motivo_decisao: "Segue só no PDI", decidido_em: "2026-10-05T10:00:00Z" })], necessidadesPdi: [] };
  const mm = montarTriagem({ pdis, triagem: congelar(structuredClone(mantida)), departamentoPorNome: depto });
  const tMan = montarTemas(mm.mantidas);
  check("manter somente no PDI: I1 vai para 'mantidas' sem necessidade criada", tMan.grupos.some((x) => x.itens.some((i) => i.card.itemId === "I1" && i.card.sugestoes[0].necessidadeId === null)) && !montarTemas(mm.aguardando).grupos.some((x) => x.itens.some((i) => i.card.itemId === "I1")));
  check("a visão por temas é função pura: não alterou as entradas congeladas (se alterasse, lançaria erro)", true);
}

// ═══ Integridade PDI → sugestão → necessidade ═══
{
  const triagem: TriagemPdi = {
    acoes: [dest("A3", "I2", "confirmada", 1, 5), dest("A4", "I2", "confirmada", 1, 5), dest("A5", "I2", "confirmada", 1, 5)],
    sugestoes: [sug({ id: 5, pdi_item_id: "I2", estado: "validada", acoes_total: 3, texto_final: "Comunicação assertiva", necessidade_id: 40 })],
    necessidadesPdi: [{ id: 40, pdi_acao_id: "A3", descricao: "Comunicação assertiva", categoria: "comportamental", prioridade: "media" } as NecessidadePdi],
    acoesDasSugestoes: [sa(5, "A3", "Realizar apresentações periódicas"), sa(5, "A4", "Solicitar feedback"), sa(5, "A5", "Conduzir alinhamentos entre áreas")],
  };
  const m = montarTriagem({ pdis, triagem: congelar(structuredClone(triagem)), departamentoPorNome: depto });
  const t = montarTemas(m.confirmadas);
  const todos = t.grupos.flatMap((x) => x.itens);
  check("vínculo ação → sugestão → necessidade intacto dentro dos grupos (A3,A4,A5 → sugestão 5 → necessidade 40)", todos.length > 0 && todos.every((i) => i.card.sugestoes.every((s) => s.id === 5 && s.necessidadeId === 40 && s.acoes.map((a) => a.id).join() === "A3,A4,A5")));
  check("a visão temática não expõe nenhum campo de gravação (só leitura do ItemCard)", todos.every((i) => Object.keys(i).sort().join() === "acoes,card,tambemEm"));
}

// ═══ Colaboradores únicos: chave estável (id), nunca o nome — homônimos ficam separados ═══
{
  const item = (id: string, acaoId: string) => ({ id, competenciaNome: "Desenvolvimento Profissional", tipoCompetencia: "Comportamental", objetivoDesenvolvimento: "Ampliar capacidades.", ordem: 0, acoes: [acao(acaoId, "Curso de Excel avançado", 0)] });
  const homonimos: PdiEntrada[] = [
    { id: 50, colaboradorNome: "Maria Souza", ciclo: "2025", itens: [item("H1", "HA1")] },
    { id: 51, colaboradorNome: "Maria Souza", ciclo: "2025", itens: [item("H2", "HA2")] },
    { id: 52, colaboradorNome: "João Lima", ciclo: "2025", itens: [item("H3", "HA3")] },
    // a mesma pessoa (id 7) com dois PDIs (dois ciclos): uma pessoa só
    { id: 53, colaboradorNome: "Rita Alves", ciclo: "2024", itens: [item("H4", "HA4")] },
    { id: 54, colaboradorNome: "Rita Alves", ciclo: "2025", itens: [item("H5", "HA5")] },
  ];
  const fer = (m: ReturnType<typeof montarTriagem>) => montarTemas(m.aguardando).grupos.find((x) => x.tema === "ferramentas")!;

  const semMapa = montarTriagem({ pdis: homonimos, triagem: vazio, departamentoPorNome: new Map() });
  const chaves = semMapa.aguardando.map((c) => c.colaboradorChave);
  check("sem id de cadastro: cada PDI é uma chave própria (pdi:<id>) e o NOME não entra na chave", chaves.every((k) => k.startsWith("pdi:") && !/Maria|João|Rita/.test(k)) && new Set(chaves).size === 5, chaves.join());
  check("dois homônimos (mesmo nome, PDIs diferentes) contam como 2 colaboradores", fer(semMapa).totais.colaboradores === 5 && semMapa.aguardando.filter((c) => c.colaboradorNome === "Maria Souza").length === 2);
  check("o nome continua só para exibição (cards mantêm 'Maria Souza')", semMapa.aguardando.filter((c) => c.colaboradorNome === "Maria Souza").length === 2);

  // cadastro: João (id 3) e Rita (id 7) têm nome único; Maria Souza é ambígua (não entra no mapa)
  const comMapa = montarTriagem({ pdis: homonimos, triagem: vazio, departamentoPorNome: new Map(), colaboradorIdPorNome: new Map([["João Lima", 3], ["Rita Alves", 7]]) });
  const chavesM = comMapa.aguardando.map((c) => c.colaboradorChave).sort();
  check("nome único usa o id do cadastro (c:3, c:7); homônimos continuam por PDI", chavesM.join() === "c:3,c:7,c:7,pdi:50,pdi:51", chavesM.join());
  check("com id de cadastro: Maria×2 (homônimas) + João + Rita (2 PDIs, 1 pessoa) = 4 colaboradores, 5 itens", JSON.stringify(fer(comMapa).totais) === JSON.stringify({ itens: 5, colaboradores: 4, departamentos: 0, acoes: 5 }), JSON.stringify(fer(comMapa).totais));
  check("indicador de itens não confunde itens com pessoas", montarTemas(comMapa.aguardando).indicadores.itens === 5);
  const soMaria = montarTemas(comMapa.aguardando.filter((c) => c.colaboradorNome === "Maria Souza"));
  check("só as duas homônimas: 2 colaboradores distintos (e não 1 por nome igual)", soMaria.grupos[0].totais.colaboradores === 2 && soMaria.grupos[0].totais.itens === 2);
}

// ═══ Filtros auxiliares coexistem (departamento/tipo) ═══
{
  const m = montarTriagem({ pdis, triagem: vazio, departamentoPorNome: depto });
  const prod = montarTemas(filtrarItens(m.aguardando, { departamento: "Produção", tipo: "todos", forma: "todas" }));
  check("filtro de departamento reduz o universo antes de agrupar (Produção: I4,I5,I6)", prod.indicadores.itens === 3 && prod.grupos.every((x) => x.itens.every((i) => i.card.departamento === "Produção")));
  const tec = montarTemas(filtrarItens(m.aguardando, { departamento: "", tipo: "Tecnica", forma: "todas" }));
  check("filtro de tipo (KPI) agrupa só KPIs (I5 → qualidade)", tec.indicadores.itens === 1 && tec.grupos.length === 1 && tec.grupos[0].tema === "qualidade");
}

// ═══ Desempenho: ≥ 2.000 ações ═══
{
  const modelos = [
    ["Comunicação", "Falar com clareza.", ["Fazer curso de oratória", "Solicitar feedback", "Apresentar resultados do mês", "Conduzir alinhamentos entre áreas"]],
    ["Liderança", "Liderar equipes.", ["Curso de gestão de pessoas", "Praticar delegação", "Ler livro", "Reuniões 1:1"]],
    ["Qualidade", "Reduzir não conformidades.", ["Aplicar 5S", "Auditoria interna", "Atualizar procedimento operacional", "Registrar ocorrências"]],
    ["Desenvolvimento Profissional", "Ampliar capacidades.", ["Aprender Power BI", "Curso de Excel", "Participar de treinamento", "Inglês técnico"]],
    ["Resultados", "Acompanhar metas.", ["Acompanhar indicadores", "Montar dashboard", "Fazer relatório mensal", "Gestão do tempo"]],
  ] as const;
  const grandes: PdiEntrada[] = [];
  let totalAcoes = 0;
  for (let p = 0; p < 130; p++) {
    const itens = [];
    for (let k = 0; k < 4; k++) {
      const [comp, obj, acoes] = modelos[(p + k) % modelos.length];
      itens.push({ id: `P${p}I${k}`, competenciaNome: comp, tipoCompetencia: k % 2 ? "Tecnica" : "Comportamental", objetivoDesenvolvimento: obj, ordem: k, acoes: acoes.map((d, z) => acao(`P${p}I${k}A${z}`, `${d} (${p}-${k}-${z})`, z)) });
      totalAcoes += acoes.length;
    }
    grandes.push({ id: 1000 + p, colaboradorNome: `Pessoa ${p}`, ciclo: "2025", itens });
  }
  const deptos = new Map(grandes.map((x, i) => [x.colaboradorNome, `Setor ${i % 9}`]));
  const t0 = performance.now();
  const m = montarTriagem({ pdis: grandes, triagem: vazio, departamentoPorNome: deptos });
  const t1 = performance.now();
  const t = montarTemas(m.aguardando);
  const t2 = performance.now();
  const t3 = performance.now();
  montarTemas(m.aguardando); // segunda passada usa o cache de achados
  const t4 = performance.now();
  check(`volume: ${totalAcoes} ações (≥ 2.000) processadas`, totalAcoes >= 2000 && m.aguardando.length === 520);
  check(`desempenho: agrupar ${totalAcoes} ações em < 1500 ms (leva ${(t2 - t1).toFixed(0)} ms; 2ª passada ${(t4 - t3).toFixed(0)} ms; montarTriagem ${(t1 - t0).toFixed(0)} ms)`, t2 - t1 < 1500);
  check("volume: todas as ações aparecem em algum grupo e os totais únicos batem", t.indicadores.itens === 520 && t.grupos.flatMap((x) => x.itens.flatMap((i) => i.acoes.map((a) => a.acao.id))).length >= totalAcoes);
  check("volume: colaboradores únicos por grupo ≤ 130 e departamentos ≤ 9", t.grupos.every((x) => x.totais.colaboradores <= 130 && x.totais.departamentos <= 9));
}

// ═══ Ausência de chamadas externas / IA / custo ═══
{
  check("nenhuma chamada de rede (fetch/XHR/WebSocket) durante TODO o teste", chamadasExternas === 0, String(chamadasExternas));
  const raiz = join(import.meta.dirname, "..", "..");
  const ler = (...p: string[]) => readFileSync(join(raiz, ...p), "utf8");
  const arquivosTema = ["src/domain/pdiTemas.ts", "src/features/desenvolvimento/pdiTemasModelo.ts", "src/features/desenvolvimento/SugestoesPorTemas.tsx"];
  for (const f of arquivosTema) {
    const src = ler(...f.split("/"));
    check(`${f}: sem rede, banco, SDK, variável de ambiente nem chave`, !/\bfetch\s*\(|XMLHttpRequest|WebSocket|supabase|process\.env|import\.meta\.env|apiKey|api_key|anthropic|openai|devRepository|pdiTriagemRepository/i.test(src));
  }
  const varrer = (dir: string, acc: string[] = []) => {
    for (const nome of readdirSync(dir)) {
      if (nome === "node_modules" || nome === "dist" || nome === ".git") continue;
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) varrer(p, acc);
      else if (/\.(ts|tsx|json|mjs)$/.test(nome) && !/package-lock/.test(nome)) acc.push(p);
    }
    return acc;
  };
  const alvos = [...varrer(join(raiz, "src")), ...varrer(join(raiz, "api")), join(raiz, "package.json")];
  const comProvedor = alvos.filter((f) => /anthropic|ANTHROPIC_API_KEY|PDI_IA_|@anthropic-ai|api\.anthropic\.com/i.test(readFileSync(f, "utf8")));
  check("nenhuma referência a provedor de IA (Anthropic/SDK/variáveis PDI_IA_*) em src/, api/ ou package.json", comProvedor.length === 0, comProvedor.join(", "));
  const lock = ler("package-lock.json");
  check("package-lock sem SDK da Anthropic", !/@anthropic-ai/.test(lock));
  const ui = [ler("src", "features", "desenvolvimento", "SugestoesPdiAba.tsx"), ler("src", "features", "desenvolvimento", "PdiItemCard.tsx"), ler("src", "features", "desenvolvimento", "SugestoesPorTemas.tsx")].join("\n");
  check("interface sem botão 'Analisar com IA' e sem 'Confirmar grupo'", !/Analisar com IA|Confirmar grupo|confirmarGrupo|Confirmar todos/i.test(ui));
}

// ═══ Controle de acesso RH (a visão não abre nenhum caminho novo de dados ou gravação) ═══
{
  const raiz = join(import.meta.dirname, "..", "..");
  const ler = (...p: string[]) => readFileSync(join(raiz, ...p), "utf8");
  const lnt = ler("src", "features", "desenvolvimento", "LntPage.tsx");
  check('a aba "Sugestões" (onde a visão por temas vive) só existe para o perfil RH', /perfil === "RH" \? \[\{ id: "sugestoes"/.test(lnt));
  const acoes = ler("api", "_lib", "desenvolvimentoAcoes.ts");
  check("o servidor não ganhou ação nova para temas (leitura é a mesma das views RH da Fase 7)", !/pdi_tema|pdi_temas|temas_pdi|triagem_tematica/i.test(acoes));
  const abaSrc = ler("src", "features", "desenvolvimento", "SugestoesPdiAba.tsx");
  check("a visão por temas lê só o que a aba já carrega (lerTriagemPdi) e usa as MESMAS gravações individuais", (abaSrc.match(/lerTriagemPdi\(/g) ?? []).length === 1 && /triagemPdi\.gerar/.test(abaSrc) && !/triagemPdi\.(gerarGrupo|confirmarGrupo)/.test(abaSrc));
  const rotas = ler("src", "features", "desenvolvimento", "pdiTriagemRepository.ts");
  check("repositório sem função de gravação em lote por tema", !/confirmarGrupo|gerarGrupo|porTema|em_lote|lote/i.test(rotas));
}

console.log(`\nTEMAS: ${ok} verificações OK, ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);

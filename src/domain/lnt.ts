// LNT (Levantamento de Necessidades de Treinamento e Desenvolvimento) — vocabulários e
// regras PURAS do núcleo (Fase 6). Sem acesso a dados e sem nenhum import: usado tanto
// pelo servidor (api/_lib/lntAcoes.ts) quanto pelas leituras do navegador
// (features/desenvolvimento/lntRepository.ts), então as duas pontas aplicam exatamente
// a mesma regra de elegibilidade, de indicadores e de fechamento.
//
// A LNT nunca altera a necessidade original: tudo aqui só LÊ a necessidade viva e
// descreve a situação dela DENTRO de um ciclo.

// ── Vocabulários (espelham os checks de supabase/desenvolvimento_fase6_lnt_nucleo.sql) ──
export const STATUS_CICLO = ["em_elaboracao", "fechada"] as const;
export type StatusCiclo = (typeof STATUS_CICLO)[number];

export const SITUACOES_ITEM = ["em_analise", "incluido", "nao_priorizado"] as const;
export type SituacaoItem = (typeof SITUACOES_ITEM)[number];

export const DECISOES_NECESSIDADE = ["candidata", "em_item", "nao_priorizada"] as const;
export type DecisaoNecessidade = (typeof DECISOES_NECESSIDADE)[number];

export const ORIGENS_ITEM = ["consolidacao", "direto"] as const;
export type OrigemItem = (typeof ORIGENS_ITEM)[number];

/** Mesmo conjunto de Prioridade em devRepository (alta/média/baixa) — sem pontuação. */
export const PRIORIDADES_LNT = ["alta", "media", "baixa"] as const;
export type PrioridadeLnt = (typeof PRIORIDADES_LNT)[number];

/** Mesmas 8 categorias da necessidade (CategoriaNecessidade em devRepository). */
export const CATEGORIAS_LNT = ["tecnica", "qualidade_regulatorio", "seguranca", "sistemas_ferramentas", "comportamental", "lideranca", "integracao", "outra"] as const;
export type CategoriaLnt = (typeof CATEGORIAS_LNT)[number];

/** Só estes status da necessidade podem ser fotografados na carga. */
export const STATUS_CARREGAVEIS = ["validada", "planejada"] as const;
export type StatusCarregavel = (typeof STATUS_CARREGAVEIS)[number];

/** Vocabulário controlado dos direcionadores. Pessoas afetadas e recorrência NÃO são direcionadores: são calculadas. */
export const DIRECIONADORES = [
  { valor: "requisito_legal_regulatorio", rotulo: "Requisito legal ou regulatório" },
  { valor: "risco_qualidade", rotulo: "Risco para a qualidade" },
  { valor: "seguranca", rotulo: "Segurança" },
  { valor: "necessidade_estrategica", rotulo: "Necessidade estratégica" },
  { valor: "gap_cargo", rotulo: "Gap de cargo" },
  { valor: "desempenho", rotulo: "Desempenho" },
  { valor: "pdi", rotulo: "PDI" },
  { valor: "mudanca_processo_tecnologia", rotulo: "Mudança de processo ou tecnologia" },
  { valor: "desenvolvimento_lideranca", rotulo: "Desenvolvimento de liderança" },
  { valor: "demanda_operacional", rotulo: "Demanda operacional" },
] as const;
export type Direcionador = (typeof DIRECIONADORES)[number]["valor"];
export const VALORES_DIRECIONADOR: readonly string[] = DIRECIONADORES.map((d) => d.valor);

// ── Elegibilidade para a carga (D1/D2 aprovadas) ─────────────────────────────────────────
/** Último instante do dia da data de corte, no horário de Brasília (UTC−3). */
export function fimDoDiaDeCorte(dataCorteIso: string): number {
  return Date.parse(`${dataCorteIso}T23:59:59.999-03:00`);
}

export interface NecessidadeParaElegibilidade {
  status: string;
  validada_em: string | null;
  /** Colaborador da necessidade já desligado (necessidade de cargo, sem pessoa, nunca é "desligada"). */
  colaboradorDesligado: boolean;
}

export type MotivoInelegivel = "status" | "sem_validacao" | "apos_corte" | "colaborador_desligado";

export type Elegibilidade = { elegivel: true; statusCarga: StatusCarregavel } | { elegivel: false; motivo: MotivoInelegivel };

/**
 * VALIDADA e PLANEJADA entram (respeitando a data de corte; validadas antigas entram também).
 * SUGERIDA, ATENDIDA e CANCELADA não entram. Colaborador desligado não entra.
 * PLANEJADA entra como candidata — o alerta do treinamento é registrado pela carga.
 */
export function avaliarElegibilidade(n: NecessidadeParaElegibilidade, dataCorteIso: string): Elegibilidade {
  if (n.status !== "validada" && n.status !== "planejada") return { elegivel: false, motivo: "status" };
  if (!n.validada_em) return { elegivel: false, motivo: "sem_validacao" };
  if (n.colaboradorDesligado) return { elegivel: false, motivo: "colaborador_desligado" };
  if (Date.parse(n.validada_em) > fimDoDiaDeCorte(dataCorteIso)) return { elegivel: false, motivo: "apos_corte" };
  return { elegivel: true, statusCarga: n.status };
}

// ── Mudança da necessidade viva depois da fotografia ─────────────────────────────────────
export interface FotografiaComparavel {
  status_na_carga: string;
  prioridade_na_carga: string | null;
  departamento_na_carga: string | null;
  descricao_na_carga: string;
  justificativa_na_carga: string;
  sugestao_capacitacao_na_carga: string;
}

export interface NecessidadeVivaComparavel {
  status: string;
  prioridade: string | null;
  departamento: string | null;
  descricao: string;
  justificativa: string;
  sugestao_capacitacao: string;
  colaboradorDesligado: boolean;
}

export type MudancaObservada = Record<string, { antes: unknown; depois: unknown }>;

/** Diferenças entre a fotografia da carga e a necessidade viva; null quando nada mudou. A fotografia nunca é alterada. */
export function diferencaDaFotografia(foto: FotografiaComparavel, viva: NecessidadeVivaComparavel): MudancaObservada | null {
  const pares: [string, unknown, unknown][] = [
    ["status", foto.status_na_carga, viva.status],
    ["prioridade", foto.prioridade_na_carga ?? null, viva.prioridade ?? null],
    ["departamento", foto.departamento_na_carga ?? null, viva.departamento ?? null],
    ["descricao", foto.descricao_na_carga, viva.descricao],
    ["justificativa", foto.justificativa_na_carga, viva.justificativa],
    ["sugestao_capacitacao", foto.sugestao_capacitacao_na_carga, viva.sugestao_capacitacao],
    ["colaborador_desligado", false, viva.colaboradorDesligado],
  ];
  const mudou: MudancaObservada = {};
  for (const [campo, antes, depois] of pares) if (antes !== depois) mudou[campo] = { antes, depois };
  return Object.keys(mudou).length > 0 ? mudou : null;
}

/** JSON com as chaves em ordem alfabética: o jsonb do Postgres devolve as chaves em outra ordem que a de quem gravou. */
function jsonCanonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export function mesmaMudanca(a: MudancaObservada | null | undefined, b: MudancaObservada | null | undefined): boolean {
  return jsonCanonico(a ?? null) === jsonCanonico(b ?? null);
}

// ── Indicadores do ciclo ─────────────────────────────────────────────────────────────────
export interface ItemParaIndicador {
  id: number;
  situacao: SituacaoItem;
  origem_item: OrigemItem;
}

export interface LinhaParaIndicador {
  decisao: DecisaoNecessidade;
  item_id: number | null;
  departamento_na_carga: string | null;
  /** Colaborador da necessidade viva (null em necessidade de cargo). */
  colaborador_id: number | null;
  alerta_treinamento_id: number | null;
  mudou_desde_carga_em: string | null;
}

export interface IndicadoresCiclo {
  /** Total de necessidades fotografadas no ciclo. */
  candidatas: number;
  /** Candidatas ainda sem decisão. */
  a_decidir: number;
  em_itens: number;
  nao_priorizadas: number;
  com_alerta_treinamento: number;
  mudaram_desde_carga: number;
  /** Colaboradores distintos entre as necessidades ainda "no jogo" (candidatas ou em item que não foi descartado). */
  pessoas_impactadas: number;
  /** Departamentos distintos (da fotografia) entre as mesmas necessidades. */
  departamentos_envolvidos: number;
  itens_total: number;
  itens_em_analise: number;
  itens_incluidos: number;
  itens_nao_priorizados: number;
  /** Itens com 2 ou mais necessidades. */
  itens_consolidados: number;
  itens_diretos: number;
}

function membrosPorItem(linhas: LinhaParaIndicador[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const l of linhas) if (l.decisao === "em_item" && l.item_id != null) m.set(l.item_id, (m.get(l.item_id) ?? 0) + 1);
  return m;
}

export function calcularIndicadores(itens: ItemParaIndicador[], linhas: LinhaParaIndicador[]): IndicadoresCiclo {
  const situacaoDoItem = new Map(itens.map((i) => [i.id, i.situacao]));
  const membros = membrosPorItem(linhas);
  const noJogo = linhas.filter((l) => l.decisao === "candidata" || (l.decisao === "em_item" && l.item_id != null && situacaoDoItem.get(l.item_id) !== "nao_priorizado"));
  const pessoas = new Set<number>();
  const deptos = new Set<string>();
  for (const l of noJogo) {
    if (l.colaborador_id != null) pessoas.add(l.colaborador_id);
    if (l.departamento_na_carga) deptos.add(l.departamento_na_carga);
  }
  return {
    candidatas: linhas.length,
    a_decidir: linhas.filter((l) => l.decisao === "candidata").length,
    em_itens: linhas.filter((l) => l.decisao === "em_item").length,
    nao_priorizadas: linhas.filter((l) => l.decisao === "nao_priorizada").length,
    com_alerta_treinamento: linhas.filter((l) => l.alerta_treinamento_id != null).length,
    mudaram_desde_carga: linhas.filter((l) => l.mudou_desde_carga_em != null).length,
    pessoas_impactadas: pessoas.size,
    departamentos_envolvidos: deptos.size,
    itens_total: itens.length,
    itens_em_analise: itens.filter((i) => i.situacao === "em_analise").length,
    itens_incluidos: itens.filter((i) => i.situacao === "incluido").length,
    itens_nao_priorizados: itens.filter((i) => i.situacao === "nao_priorizado").length,
    itens_consolidados: itens.filter((i) => (membros.get(i.id) ?? 0) >= 2).length,
    itens_diretos: itens.filter((i) => i.origem_item === "direto").length,
  };
}

// ── Fechamento ───────────────────────────────────────────────────────────────────────────
export interface PendenciaFechamento {
  codigo: "candidatas_sem_decisao" | "itens_em_analise" | "itens_incluidos_sem_necessidade";
  quantidade: number;
  descricao: string;
}

/** O ciclo só fecha sem candidata sem decisão, sem item em análise e sem item de consolidação incluído sem nenhuma necessidade. */
export function pendenciasDeFechamento(itens: ItemParaIndicador[], linhas: LinhaParaIndicador[]): PendenciaFechamento[] {
  const membros = membrosPorItem(linhas);
  const pend: PendenciaFechamento[] = [];
  const candidatas = linhas.filter((l) => l.decisao === "candidata").length;
  if (candidatas > 0) pend.push({ codigo: "candidatas_sem_decisao", quantidade: candidatas, descricao: `${candidatas} necessidade(s) candidata(s) sem decisão` });
  const emAnalise = itens.filter((i) => i.situacao === "em_analise").length;
  if (emAnalise > 0) pend.push({ codigo: "itens_em_analise", quantidade: emAnalise, descricao: `${emAnalise} item(ns) em análise` });
  const vazios = itens.filter((i) => i.situacao === "incluido" && i.origem_item === "consolidacao" && (membros.get(i.id) ?? 0) === 0).length;
  if (vazios > 0) pend.push({ codigo: "itens_incluidos_sem_necessidade", quantidade: vazios, descricao: `${vazios} item(ns) incluído(s) de consolidação sem nenhuma necessidade` });
  return pend;
}

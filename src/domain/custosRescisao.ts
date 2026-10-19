// Custos de rescisão dos desligamentos — funções PURAS (rodam no servidor e nos testes; o navegador só recebe o resultado já filtrado por perfil).
//
// Regras (decisões do RH, 19/10/2026):
//   • Rescisão = valor LÍQUIDO da folha, validado pelo RH (individual ou em lote). Um lançamento antigo diferente do líquido é DIVERGÊNCIA e só sai
//     por decisão expressa do RH (manter o lançado ou adotar a folha).
//   • GRRF = TOTAL efetivamente recolhido (guia), registrado pelo RH, com depósito e multa à parte — nada é calculado a partir do saldo FGTS.
//     Cada componente tem o seu próprio status; um não depende do outro.
//   • Cada desligamento conta UMA vez (cadastro × histórico da folha), pela data efetiva (mês do desligamento). Só valores VALIDADOS somam;
//     o que está pendente fica de fora e a cobertura (validados × total) é informada. Conversões de estágio para CLT nunca entram.

import { mesIsoFromDataBr, mesLabel } from "./dates.js";
import { normalizarNomeHistorico, type HistoricoPreparado, type RescisaoHistorica } from "./rescisoesHistorico.js";
import { normalizarDataIso } from "./situacaoFuncional.js";
import type { Colaborador } from "../types/domain.js";

export type StatusRescisao = "pendente" | "divergente" | "validado";
export type StatusGrrf = "pendente" | "validado" | "nao_aplicavel";
export type DecisaoDivergencia = "adotar_folha" | "manter_lancado";
export type FonteGrrf = "guia_grrf" | "demonstrativo_rescisao" | "outro_documento";

/** Linha da tabela de rubricas (só servidor) + validação já gravada. */
export interface RubricaFinanceira {
  rescisaoId: number;
  liquido: number;
  fgtsRescisorio: number;
  saldoFgts: number;
  rescisaoStatus: "proposto" | "validado";
  rescisaoDecisao: DecisaoDivergencia | null;
  rescisaoValorValidado: number | null;
  rescisaoValidadaEm: string | null;
  rescisaoValidadaPor: string | null;
  zeroConferido: boolean;
  modalidadeConfirmada: string | null;
  grrfStatus: "pendente" | "validado" | "nao_aplicavel";
  grrfDeposito: number | null;
  grrfMulta: number | null;
  grrfTotal: number | null;
  grrfFonte: FonteGrrf | null;
  grrfValidadaEm: string | null;
  grrfValidadaPor: string | null;
}

/** Linha de peopleflow_desligamentos (fechamento financeiro por colaborador). */
export interface FechamentoFinanceiro {
  colaboradorNome: string;
  valorRescisao: number | null;
  valorGrrf: number | null;
  origem: "manual" | "folha";
  rescisaoHistoricoId: number | null;
  /** Validação por componente, com fonte documental, responsável e data. Lançar um valor NÃO valida: precisa da confirmação expressa do RH. */
  rescisaoValidadaEm: string | null;
  rescisaoValidadaPor: string | null;
  rescisaoFonte: string | null;
  grrfValidadaEm: string | null;
  grrfValidadaPor: string | null;
  grrfFonte: string | null;
  /** GRRF declarada "não aplicável" (R$ 0,00 resolvido, com justificativa) — diferente de GRRF pendente ou lançada 0. */
  grrfNaoAplicavel: boolean;
  grrfJustificativa: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface LinhaConferencia {
  /** "c:<id>" (pessoa do cadastro) ou "h:<id>" (saída histórica sem cadastro) — a mesma pessoa nunca aparece com duas chaves. */
  chave: string;
  origem: "cadastro" | "historico";
  natureza: "saida_efetiva" | "conversao_estagio_clt";
  nome: string;
  colaboradorId: number | null;
  rescisaoId: number | null;
  codigoFolha: number | null;
  /** Data efetiva do desligamento (ISO) e o mês de apuração. */
  dataEfetivaIso: string;
  mes: string;
  departamento: string;
  modalidade: string;
  modalidadeConfirmada: string | null;
  /** Valores da folha (importados) — só para o RH. */
  liquidoFolha: number | null;
  fgtsRescisorioFolha: number | null;
  saldoFgtsFolha: number | null;
  rescisao: {
    status: StatusRescisao;
    /** Valor que vale quando validado. */
    valor: number | null;
    lancado: number | null;
    decisao: DecisaoDivergencia | null;
    zeroConferido: boolean;
    validadaPor: string | null;
    validadaEm: string | null;
    fonte: string | null;
  };
  grrf: {
    status: StatusGrrf;
    total: number | null;
    deposito: number | null;
    multa: number | null;
    fonte: FonteGrrf | null;
    lancado: number | null;
    validadaPor: string | null;
    validadaEm: string | null;
  };
  fechamentoOrigem: "manual" | "folha" | null;
}

const iguais = (a: number, b: number) => Math.abs(a - b) < 0.005;

function rescisaoDe(rubrica: RubricaFinanceira | null, fech: FechamentoFinanceiro | null): LinhaConferencia["rescisao"] {
  const lancado = fech?.valorRescisao ?? null;
  if (rubrica) {
    if (rubrica.rescisaoStatus === "validado") {
      return { status: "validado", valor: rubrica.rescisaoValorValidado, lancado, decisao: rubrica.rescisaoDecisao, zeroConferido: rubrica.zeroConferido, validadaPor: rubrica.rescisaoValidadaPor, validadaEm: rubrica.rescisaoValidadaEm, fonte: "folha_rescisao" };
    }
    const divergente = lancado !== null && !iguais(lancado, rubrica.liquido);
    return { status: divergente ? "divergente" : "pendente", valor: null, lancado, decisao: null, zeroConferido: rubrica.zeroConferido, validadaPor: null, validadaEm: null, fonte: null };
  }
  // pessoa do cadastro sem rescisão importada da folha: o lançamento manual só vale depois da confirmação expressa do RH (fonte, responsável e data)
  if (fech && fech.rescisaoValidadaEm && fech.valorRescisao !== null) {
    return { status: "validado", valor: fech.valorRescisao, lancado, decisao: null, zeroConferido: fech.valorRescisao === 0, validadaPor: fech.rescisaoValidadaPor, validadaEm: fech.rescisaoValidadaEm, fonte: fech.rescisaoFonte };
  }
  return { status: "pendente", valor: null, lancado, decisao: null, zeroConferido: false, validadaPor: null, validadaEm: null, fonte: null };
}

function grrfDe(rubrica: RubricaFinanceira | null, fech: FechamentoFinanceiro | null): LinhaConferencia["grrf"] {
  const lancado = fech?.valorGrrf ?? null;
  if (rubrica) {
    if (rubrica.grrfStatus === "validado") {
      return { status: "validado", total: rubrica.grrfTotal, deposito: rubrica.grrfDeposito, multa: rubrica.grrfMulta, fonte: rubrica.grrfFonte, lancado, validadaPor: rubrica.grrfValidadaPor, validadaEm: rubrica.grrfValidadaEm };
    }
    if (rubrica.grrfStatus === "nao_aplicavel") {
      return { status: "nao_aplicavel", total: 0, deposito: null, multa: null, fonte: null, lancado, validadaPor: rubrica.grrfValidadaPor, validadaEm: rubrica.grrfValidadaEm };
    }
    return { status: "pendente", total: null, deposito: null, multa: null, fonte: null, lancado, validadaPor: null, validadaEm: null };
  }
  if (fech && fech.grrfValidadaEm && fech.valorGrrf !== null) {
    if (fech.grrfNaoAplicavel) return { status: "nao_aplicavel", total: 0, deposito: null, multa: null, fonte: null, lancado, validadaPor: fech.grrfValidadaPor, validadaEm: fech.grrfValidadaEm };
    return { status: "validado", total: fech.valorGrrf, deposito: null, multa: null, fonte: fech.grrfFonte as FonteGrrf | null, lancado, validadaPor: fech.grrfValidadaPor, validadaEm: fech.grrfValidadaEm };
  }
  return { status: "pendente", total: null, deposito: null, multa: null, fonte: null, lancado, validadaPor: null, validadaEm: null };
}

export interface EntradaCustos {
  /** Colaboradores (já recortados pelos filtros do chamador). */
  colaboradores: Colaborador[];
  /** Todo o histórico da folha (22 saídas + 2 conversões), com ids — usado para ligar cadastro e folha. */
  historicoCompleto: RescisaoHistorica[];
  /** Histórico separado e recortado (saídas sem cadastro) pelo MESMO caminho do Dashboard (prepararHistorico/filtrarHistorico). */
  historicoPreparado: HistoricoPreparado;
  rubricas: RubricaFinanceira[];
  fechamentos: FechamentoFinanceiro[];
  inicioIso?: string;
  fimIso?: string;
}

/** Uma linha por SAÍDA EFETIVA (cadastro desligado + histórico sem cadastro), cada pessoa uma única vez. As conversões não entram aqui. */
export function apurarSaidas(e: EntradaCustos): LinhaConferencia[] {
  const rubricaPorId = new Map(e.rubricas.map((r) => [r.rescisaoId, r]));
  const fechPorNome = new Map(e.fechamentos.map((f) => [f.colaboradorNome, f]));
  const saidasHist = e.historicoCompleto.filter((h) => h.natureza === "saida_efetiva");
  const noPeriodo = (iso: string) => (!e.inicioIso || iso >= e.inicioIso) && (!e.fimIso || iso <= e.fimIso);
  const linhas: LinhaConferencia[] = [];
  const jaContadas = new Set<number>();

  for (const c of e.colaboradores) {
    if (!c.desligado || c.empresaAfiliada) continue;
    const dataIso = normalizarDataIso(c.dataDesligamento);
    if (!dataIso || !noPeriodo(dataIso)) continue;
    const norm = normalizarNomeHistorico(c.nome);
    const h = saidasHist.find((x) => x.colaboradorId === c.id || (x.colaboradorId === null && x.nomeNormalizado === norm && x.admissaoIso === c.admissaoIso)) ?? null;
    if (h) jaContadas.add(h.id);
    const rubrica = h ? rubricaPorId.get(h.id) ?? null : null;
    const fech = fechPorNome.get(c.nome) ?? null;
    linhas.push(montarLinha({ chave: `c:${c.id}`, origem: "cadastro", natureza: "saida_efetiva", nome: c.nome, colaboradorId: c.id, h, rubrica, fech, dataIso, departamento: c.depto }));
  }
  for (const h of e.historicoPreparado.saidasSemCadastro) {
    if (jaContadas.has(h.id) || !noPeriodo(h.demissaoIso)) continue;
    linhas.push(montarLinha({ chave: `h:${h.id}`, origem: "historico", natureza: "saida_efetiva", nome: h.nome, colaboradorId: null, h, rubrica: rubricaPorId.get(h.id) ?? null, fech: null, dataIso: h.demissaoIso, departamento: h.departamento ?? "" }));
  }
  return linhas.sort((a, b) => a.dataEfetivaIso.localeCompare(b.dataEfetivaIso) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** As conversões de estágio para CLT: listadas à parte, sem custo de desligamento, sem validação financeira. */
export function listarConversoes(historicoCompleto: RescisaoHistorica[], rubricas: RubricaFinanceira[]): LinhaConferencia[] {
  const rubricaPorId = new Map(rubricas.map((r) => [r.rescisaoId, r]));
  return historicoCompleto
    .filter((h) => h.natureza === "conversao_estagio_clt")
    .map((h) => montarLinha({ chave: `h:${h.id}`, origem: h.colaboradorId ? "cadastro" : "historico", natureza: "conversao_estagio_clt", nome: h.nome, colaboradorId: h.colaboradorId, h, rubrica: rubricaPorId.get(h.id) ?? null, fech: null, dataIso: h.demissaoIso, departamento: h.departamento ?? "" }));
}

function montarLinha(p: { chave: string; origem: LinhaConferencia["origem"]; natureza: LinhaConferencia["natureza"]; nome: string; colaboradorId: number | null; h: RescisaoHistorica | null; rubrica: RubricaFinanceira | null; fech: FechamentoFinanceiro | null; dataIso: string; departamento: string }): LinhaConferencia {
  const conversao = p.natureza === "conversao_estagio_clt";
  return {
    chave: p.chave,
    origem: p.origem,
    natureza: p.natureza,
    nome: p.nome,
    colaboradorId: p.colaboradorId,
    rescisaoId: p.h?.id ?? null,
    codigoFolha: p.h?.codigoFolha ?? null,
    dataEfetivaIso: p.dataIso,
    mes: p.dataIso.slice(0, 7),
    departamento: p.departamento,
    modalidade: p.h?.tipoRescisao ?? "",
    modalidadeConfirmada: p.rubrica?.modalidadeConfirmada ?? null,
    liquidoFolha: p.rubrica?.liquido ?? null,
    fgtsRescisorioFolha: p.rubrica?.fgtsRescisorio ?? null,
    saldoFgtsFolha: p.rubrica?.saldoFgts ?? null,
    rescisao: conversao ? { status: "pendente", valor: null, lancado: null, decisao: null, zeroConferido: false, validadaPor: null, validadaEm: null, fonte: null } : rescisaoDe(p.rubrica, p.fech),
    grrf: conversao ? { status: "pendente", total: null, deposito: null, multa: null, fonte: null, lancado: null, validadaPor: null, validadaEm: null } : grrfDe(p.rubrica, p.fech),
    fechamentoOrigem: p.fech?.origem ?? null,
  };
}

export interface CustoMesFinanceiro {
  mes: string;
  mesLabel: string;
  quantidade: number;
  /** Soma só dos valores VALIDADOS. */
  rescisao: number;
  grrf: number;
  total: number;
  rescisaoValidadas: number;
  grrfResolvidas: number;
  /** true quando algum componente deste mês ainda tem valor pendente (total parcial). */
  parcial: boolean;
}

export interface CoberturaFinanceira {
  saidas: number;
  rescisaoValidadas: number;
  grrfResolvidas: number;
  /** Tudo validado (rescisão e GRRF) em todas as saídas do recorte. */
  completa: boolean;
}

export function agregarCustosPorMes(linhas: LinhaConferencia[]): CustoMesFinanceiro[] {
  const porMes = new Map<string, CustoMesFinanceiro>();
  for (const l of linhas) {
    if (l.natureza !== "saida_efetiva") continue;
    let b = porMes.get(l.mes);
    if (!b) {
      b = { mes: l.mes, mesLabel: mesLabel(l.mes), quantidade: 0, rescisao: 0, grrf: 0, total: 0, rescisaoValidadas: 0, grrfResolvidas: 0, parcial: false };
      porMes.set(l.mes, b);
    }
    b.quantidade += 1;
    if (l.rescisao.status === "validado") {
      b.rescisao += l.rescisao.valor ?? 0;
      b.rescisaoValidadas += 1;
    }
    if (l.grrf.status === "validado" || l.grrf.status === "nao_aplicavel") {
      b.grrf += l.grrf.total ?? 0;
      b.grrfResolvidas += 1;
    }
  }
  const meses = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  for (const m of meses) {
    m.rescisao = arredonda(m.rescisao);
    m.grrf = arredonda(m.grrf);
    m.total = arredonda(m.rescisao + m.grrf);
    m.parcial = m.rescisaoValidadas < m.quantidade || m.grrfResolvidas < m.quantidade;
  }
  return meses;
}

export function coberturaDe(linhas: LinhaConferencia[]): CoberturaFinanceira {
  const saidas = linhas.filter((l) => l.natureza === "saida_efetiva");
  const rescisaoValidadas = saidas.filter((l) => l.rescisao.status === "validado").length;
  const grrfResolvidas = saidas.filter((l) => l.grrf.status !== "pendente").length;
  return { saidas: saidas.length, rescisaoValidadas, grrfResolvidas, completa: saidas.length > 0 && rescisaoValidadas === saidas.length && grrfResolvidas === saidas.length };
}

const arredonda = (v: number) => Math.round(v * 100) / 100;

/** Mês "aaaa-mm" de uma data BR do cadastro (apoio ao quadro de quantidades do Gestor, que não recebe valores). */
export function mesDaDataBr(dataBr: string): string | null {
  return mesIsoFromDataBr(dataBr);
}

/** O que o servidor entrega ao RH para a tela de Conferência financeira (valores individuais — nunca vai a outros perfis). */
export interface ConferenciaFinanceira {
  /** false = a migration da integração financeira ainda não foi aplicada (a tela avisa e fica só em leitura). */
  instalado: boolean;
  saidas: LinhaConferencia[];
  conversoes: LinhaConferencia[];
  cobertura: CoberturaFinanceira;
}

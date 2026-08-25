// Salário do colaborador e Custo Mensal Folha — módulo novo, funções puras.
//
// O cadastro de colaborador (tabela `colaboradores`) NUNCA guarda salário —
// as duas únicas fontes são: (1) o campo "Novo salário" das movimentações de
// Promoção/Reajuste Salarial já aprovadas (`Movimentacao.dados`, digitado
// livremente, ver NovaMovimentacaoModal.tsx), fonte PRINCIPAL; e (2) um
// snapshot importado de planilha (`peopleflow_salarios_base`), usado só como
// FALLBACK pra quem nunca teve uma movimentação salarial registrada no
// portal. `salarioVigente()` decide entre as duas sem duplicar nada em
// `colaboradores`.

import type { Colaborador, ConfigEncargosFolha, Movimentacao, SalarioBase } from "../types/domain";
import { dataBrParaIso } from "./dates";
import { norm } from "./hierarquia";

/** Extrai um número de um valor de salário digitado livremente (ver
 * NovaMovimentacaoModal.tsx — sem máscara, pode vir como "R$ 5.500,00",
 * "5500", "5.500", "A definir", "—" etc.). Só retorna um número quando o
 * texto bate com um padrão numérico reconhecível; qualquer outra coisa
 * retorna `null` — nunca 0 nem uma estimativa. */
export function parseValorMonetario(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const limpo = texto.replace(/r\$/i, "").trim();
  if (!limpo) return null;

  // Formato brasileiro: milhar com "." e decimal com "," (ambos opcionais) — ex.: "5.500,00", "5500,5", "5500".
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(limpo)) {
    return Number(limpo.replace(/\./g, "").replace(",", "."));
  }
  // Número "solto" sem separador de milhar, com decimal em "." ou "," — ex.: "5500.5".
  if (/^\d+([.,]\d{1,2})?$/.test(limpo)) {
    return Number(limpo.replace(",", "."));
  }
  return null;
}

/** "R$ 0.000,00" — `null`/sem valor vira string vazia (o call site decide o
 * placeholder, ex.: "—"), nunca "R$ 0,00". */
export function formatarValorMonetario(valor: number | null): string {
  if (valor === null) return "";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "8,3333%" — usado no detalhamento do Custo Mensal Folha (até 4 casas, sem zeros à direita desnecessários). */
export function formatarPercentual(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
}

export interface SalarioVigente {
  valor: number;
  /** De onde veio o número — ex.: "Reajuste Salarial — 12/mar/2025" ou "Planilha de salários (importação)" — pra dar transparência (tooltip) sobre a origem do dado, nunca exibido como valor. */
  origem: string;
}

/** Salário vigente de um colaborador:
 * 1. PRIORIDADE: o valor mais recente do campo "Novo salário" entre as
 *    movimentações de Promoção/Reajuste Salarial JÁ APROVADAS (Aprovado/
 *    Concluído — nunca uma que ainda pode ser reprovada). "Mais recente" =
 *    maior data de aprovação final (ou de solicitação, na ausência dela).
 * 2. FALLBACK: se nenhuma movimentação tiver um salário reconhecível, usa o
 *    snapshot de `salariosBase` (importação de planilha) pro mesmo nome,
 *    comparado por norm() (sem acento/case — a planilha vem em CAIXA ALTA,
 *    o cadastro em Title Case).
 * Sem nenhuma das duas fontes, retorna `null` — nunca uma estimativa. */
export function salarioVigente(colaboradorNome: string, movimentacoes: Movimentacao[], salariosBase: SalarioBase[]): SalarioVigente | null {
  let melhor: { valor: number; dataOrdenacao: string; origem: string } | null = null;

  for (const m of movimentacoes) {
    if (m.colaborador !== colaboradorNome) continue;
    if (m.status !== "Aprovado" && m.status !== "Concluído") continue;
    if (m.tipoCod !== "PRO" && m.tipoCod !== "SAL") continue;

    const campo = m.dados?.find((d) => d.label === "Novo salário");
    if (!campo) continue;
    const valor = parseValorMonetario(campo.value);
    if (valor === null) continue;

    const dataBr = m.aprovacaoFinal?.data || m.dataSolicitacao;
    const dataOrdenacao = dataBrParaIso(dataBr) ?? "";
    if (!melhor || dataOrdenacao > melhor.dataOrdenacao) {
      melhor = { valor, dataOrdenacao, origem: `${m.tipo} — ${dataBr}` };
    }
  }
  if (melhor) return { valor: melhor.valor, origem: melhor.origem };

  const normNome = norm(colaboradorNome);
  const base = salariosBase.find((s) => norm(s.colaboradorNome) === normNome);
  return base ? { valor: base.salario, origem: "Planilha de salários (importação)" } : null;
}

/** Aprendiz identificado pelo campo `vinculo` (nunca pelo valor do salário)
 * — hoje o assistente de Admissão só oferece "CLT"/"PJ"/"Estágio" como
 * opção (ver NovaMovimentacaoModal.tsx), então nenhum colaborador cadastrado
 * por ele terá `vinculo === "Aprendiz"`; isso só cobre quem já tem esse
 * valor vindo de cadastro anterior/legado. Se a MSB identifica Aprendiz por
 * outro campo/valor, ajustar aqui — nunca inferir por faixa salarial. */
export function ehAprendiz(colaborador: Pick<Colaborador, "vinculo">): boolean {
  return norm(colaborador.vinculo) === norm("Aprendiz");
}

export interface DetalheCustoMensalFolha {
  salario: number;
  ehAprendiz: boolean;
  inssPatronal: number;
  rat: number;
  ratObservacao: string;
  terceiros: number;
  /** Já resolvido pelo vínculo — fgtsCeletista ou fgtsAprendiz, conforme `ehAprendiz`. */
  fgts: number;
  provisaoDecimoTerceiro: number;
  provisaoFerias: number;
  provisaoTercoFerias: number;
  /** Percentuais agregados (pontos, ex. 34.8 = 34,8%), pra exibição do detalhamento. */
  encargosDiretosPct: number;
  provisoesPct: number;
  encargosSobreProvisoesPct: number;
  /** custoMensalFolha = salario × multiplicador. */
  multiplicador: number;
  custoMensalFolha: number;
}

/** Ponto ÚNICO de cálculo do Custo Mensal Folha — `custoMensalFolha()`
 * abaixo só chama esta função e devolve o total, pro preview detalhado (o
 * "?" ao lado do campo, em ColaboradoresPage.tsx) nunca divergir do valor
 * exibido. Custo Mensal Folha = Salário + Encargos Patronais Diretos +
 * Provisões + Encargos sobre as Provisões — nunca salário líquido, nunca
 * descontos do empregado (IRRF/INSS descontado não entram aqui, só a parte
 * patronal). Fórmula (percentuais de `ConfigEncargosFolha`, todos em
 * pontos, ex. 20 = 20%):
 *   encargosDiretos = (INSS Patronal + RAT + Terceiros + FGTS[vínculo]) / 100
 *   provisoes = (13º + Férias + 1/3 Férias) / 100
 *   encargosSobreProvisoes = provisoes × encargosDiretos
 *   multiplicador = 1 + encargosDiretos + provisoes + encargosSobreProvisoes
 *   custoMensalFolha = salario × multiplicador
 * Sem arredondamento intermediário — só o resultado final é arredondado,
 * na formatação de exibição (formatarValorMonetario). */
export function detalharCustoMensalFolha(salario: number, ehAprendizColaborador: boolean, config: ConfigEncargosFolha): DetalheCustoMensalFolha {
  const fgts = ehAprendizColaborador ? config.fgtsAprendiz : config.fgtsCeletista;
  const encargosDiretos = (config.inssPatronal + config.rat + config.terceiros + fgts) / 100;
  const provisoes = (config.provisaoDecimoTerceiro + config.provisaoFerias + config.provisaoTercoFerias) / 100;
  const encargosSobreProvisoes = provisoes * encargosDiretos;
  const multiplicador = 1 + encargosDiretos + provisoes + encargosSobreProvisoes;

  return {
    salario,
    ehAprendiz: ehAprendizColaborador,
    inssPatronal: config.inssPatronal,
    rat: config.rat,
    ratObservacao: config.ratObservacao,
    terceiros: config.terceiros,
    fgts,
    provisaoDecimoTerceiro: config.provisaoDecimoTerceiro,
    provisaoFerias: config.provisaoFerias,
    provisaoTercoFerias: config.provisaoTercoFerias,
    encargosDiretosPct: encargosDiretos * 100,
    provisoesPct: provisoes * 100,
    encargosSobreProvisoesPct: encargosSobreProvisoes * 100,
    multiplicador,
    custoMensalFolha: salario * multiplicador,
  };
}

/** Sem salário, ou sem config carregada, retorna `null` (nunca uma taxa inventada). */
export function custoMensalFolha(salario: number | null, ehAprendizColaborador: boolean, config: ConfigEncargosFolha | null): number | null {
  if (salario === null || !config) return null;
  return detalharCustoMensalFolha(salario, ehAprendizColaborador, config).custoMensalFolha;
}

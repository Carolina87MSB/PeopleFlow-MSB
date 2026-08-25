// Salário do colaborador e Custo Mensal Folha — módulo novo, funções puras.
//
// O cadastro de colaborador (tabela `colaboradores`) NUNCA guarda salário —
// o único lugar onde um valor de salário é registrado no PeopleFlow é dentro
// de `Movimentacao.dados` (campo "Novo salário" das movimentações PRO/SAL),
// digitado livremente pelo gestor no assistente de Nova Movimentação (ver
// NovaMovimentacaoModal.tsx — sem máscara/validação de formato). `salarioVigente()`
// varre as movimentações do colaborador e escolhe o valor mais recente já
// aprovado, sem duplicar essa informação em nenhum outro lugar.

import type { ConfigEncargosFolha, Movimentacao } from "../types/domain";
import { dataBrParaIso } from "./dates";

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

export interface SalarioVigente {
  valor: number;
  /** De onde veio o número — ex.: "Reajuste Salarial — 12/mar/2025" — pra dar transparência (tooltip) sobre a origem do dado, nunca exibido como valor. */
  origem: string;
}

/** Salário vigente de um colaborador = o valor mais recente do campo "Novo
 * salário" entre as movimentações de Promoção/Reajuste Salarial JÁ
 * APROVADAS (Aprovado/Concluído — nunca uma que ainda pode ser reprovada).
 * "Mais recente" = maior data de aprovação final (ou de solicitação, quando
 * a movimentação não tem aprovação final registrada). Sem nenhuma
 * movimentação com um "Novo salário" reconhecível, retorna `null` — nunca
 * uma estimativa. Se amanhã o salário passar a vir de outra fonte (ex.:
 * importação de planilha), só esta função precisa mudar — a tela que a
 * consome (ColaboradoresPage.tsx) não muda. */
export function salarioVigente(colaboradorNome: string, movimentacoes: Movimentacao[]): SalarioVigente | null {
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

  return melhor ? { valor: melhor.valor, origem: melhor.origem } : null;
}

/** Custo Mensal Folha = Salário Bruto + Encargos/Impostos Patronais
 * aplicáveis, configurados em `ConfigEncargosFolha` (RH define quais
 * componentes entram e o percentual de cada um — nunca uma taxa fixa
 * hardcoded aqui). Sem salário, ou sem nenhum componente de encargo ainda
 * configurado, retorna `null` (nunca o próprio salário bruto disfarçado de
 * custo, nem uma taxa inventada). */
export function custoMensalFolha(salario: number | null, config: ConfigEncargosFolha | null): number | null {
  if (salario === null) return null;
  if (!config || config.componentes.length === 0) return null;
  const percentualTotal = config.componentes.reduce((soma, c) => soma + c.percentual, 0);
  return salario * (1 + percentualTotal / 100);
}

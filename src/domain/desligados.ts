import { mesIsoFromDataBr, mesLabel } from "./dates";
import type { RescisaoHistorica } from "./rescisoesHistorico";
import { hojeBrasilia, situacaoFuncionalEm } from "./situacaoFuncional";
import type { Colaborador, DesligamentoFinanceiro } from "../types/domain";

/** Lista de Desligados pela regra central: quem já passou da data efetiva de desligamento (ou está marcado sem data). Desligamento com data
 * FUTURA continua ativo — e fora desta lista — até a data. */
export function colaboradoresDesligados(colaboradores: Colaborador[], hoje: string = hojeBrasilia()): Colaborador[] {
  return colaboradores.filter((c) => situacaoFuncionalEm(c, hoje, "acesso", hoje).situacao === "desligado");
}

export function fechamentoDe(colaboradorNome: string, desligamentos: DesligamentoFinanceiro[]): DesligamentoFinanceiro | undefined {
  return desligamentos.find((d) => d.colaboradorNome === colaboradorNome);
}

/** Pendente enquanto valor da rescisão ou da GRRF não estiverem preenchidos. */
export function pendenteFechamento(colaboradorNome: string, desligamentos: DesligamentoFinanceiro[]): boolean {
  const d = fechamentoDe(colaboradorNome, desligamentos);
  if (!d) return true;
  return d.valorRescisao == null || d.valorGrrf == null;
}

export interface CustoRescisaoMes {
  mes: string; // "aaaa-mm"
  mesLabel: string; // "Jul/26"
  quantidade: number;
  rescisao: number;
  grrf: number;
  total: number;
}

/** Quantidade de desligamentos e custo (rescisão + GRRF) por mês — colaboradores sem data de
 * desligamento reconhecível ou sem fechamento financeiro lançado ainda entram na contagem, só não
 * somam valor (fica pendente lançar depois, ver `pendenteFechamento`). */
export function custosRescisaoPorMes(desligados: Colaborador[], desligamentos: DesligamentoFinanceiro[], saidasHistorico: RescisaoHistorica[] = []): CustoRescisaoMes[] {
  const porMes = new Map<string, CustoRescisaoMes>();
  desligados.forEach((c) => {
    const mes = mesIsoFromDataBr(c.dataDesligamento);
    if (!mes) return;
    const fin = fechamentoDe(c.nome, desligamentos);
    let bucket = porMes.get(mes);
    if (!bucket) {
      bucket = { mes, mesLabel: mesLabel(mes), quantidade: 0, rescisao: 0, grrf: 0, total: 0 };
      porMes.set(mes, bucket);
    }
    bucket.quantidade += 1;
    bucket.rescisao += fin?.valorRescisao ?? 0;
    bucket.grrf += fin?.valorGrrf ?? 0;
    bucket.total = bucket.rescisao + bucket.grrf;
  });
  // Saídas efetivas do histórico da folha (pessoas sem cadastro): entram só na QUANTIDADE. Não têm fechamento financeiro lançado e as
  // rubricas do relatório ainda não foram validadas pelo RH (o que é custo desembolsado × saldo/provisão), então nenhum valor é somado.
  // Encerramentos de estágio com efetivação NÃO entram aqui: não são saída da empresa.
  saidasHistorico.forEach((r) => {
    if (r.natureza !== "saida_efetiva") return;
    const mes = r.demissaoIso.slice(0, 7);
    let bucket = porMes.get(mes);
    if (!bucket) {
      bucket = { mes, mesLabel: mesLabel(mes), quantidade: 0, rescisao: 0, grrf: 0, total: 0 };
      porMes.set(mes, bucket);
    }
    bucket.quantidade += 1;
  });
  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

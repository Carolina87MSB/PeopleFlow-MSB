import { mesIsoFromDataBr, mesLabel } from "./dates";
import type { Colaborador, DesligamentoFinanceiro } from "../types/domain";

export function colaboradoresDesligados(colaboradores: Colaborador[]): Colaborador[] {
  return colaboradores.filter((c) => c.desligado);
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
export function custosRescisaoPorMes(desligados: Colaborador[], desligamentos: DesligamentoFinanceiro[]): CustoRescisaoMes[] {
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
  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

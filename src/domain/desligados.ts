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

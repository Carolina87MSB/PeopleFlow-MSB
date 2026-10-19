// Filtros de atributos (Setor/Gestor/Cargo) do Dashboard Executivo — função pura compartilhada pelo navegador e pelo servidor (totais financeiros).
import type { Colaborador } from "../types/domain.js";

export interface FiltrosAtributosDashboard {
  setor: string;
  gestor: string;
  cargo: string;
}

/** Setor/Gestor/Cargo usados aqui são sempre o valor ATUAL do colaborador — não
 * existe rastreio histórico de mudança de setor/cargo neste app (mesma
 * simplificação já aceita em agregarDepartamentos()/agregarCargos()). */
export function filtrarPorAtributos(colaboradores: Colaborador[], filtros: FiltrosAtributosDashboard): Colaborador[] {
  return colaboradores.filter(
    (c) =>
      (filtros.setor === "Todos" || c.depto === filtros.setor) &&
      (filtros.gestor === "Todos" || c.gestor === filtros.gestor) &&
      (filtros.cargo === "Todos" || c.cargo === filtros.cargo),
  );
}

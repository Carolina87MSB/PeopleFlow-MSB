import type { OrigemNecessidade, Situacao, StatusNecessidade, StatusTreinamento } from "./devRepository";

export type Tom = "success" | "warning" | "danger" | "neutral" | "info";

export const ROTULO_ORIGEM: Record<OrigemNecessidade, string> = {
  habilidade: "Gap de habilidade",
  treinamento_obrigatorio: "Treinamento obrigatório",
  revisao_pop: "Revisão de POP",
  integracao: "Integração",
  gestor: "Gestor",
  pdi: "PDI",
  rh: "RH",
};

export const STATUS_NECESSIDADE: Record<StatusNecessidade, { rotulo: string; tom: Tom }> = {
  aberta: { rotulo: "Aberta", tom: "warning" },
  planejada: { rotulo: "Planejada", tom: "info" },
  atendida: { rotulo: "Atendida", tom: "success" },
  cancelada: { rotulo: "Cancelada", tom: "neutral" },
};

export const STATUS_TREINAMENTO: Record<StatusTreinamento, { rotulo: string; tom: Tom }> = {
  planejado: { rotulo: "Planejado", tom: "info" },
  em_andamento: { rotulo: "Em andamento", tom: "warning" },
  concluido: { rotulo: "Concluído", tom: "success" },
  cancelado: { rotulo: "Cancelado", tom: "neutral" },
};

export const SITUACAO: Record<Situacao, { rotulo: string; tom: Tom }> = {
  em_dia: { rotulo: "Em dia", tom: "success" },
  a_vencer: { rotulo: "A vencer", tom: "warning" },
  vencido: { rotulo: "Vencido", tom: "danger" },
  revisao_pendente: { rotulo: "Revisão pendente", tom: "warning" },
  agendado: { rotulo: "Agendado", tom: "info" },
  no_prazo_integracao: { rotulo: "No prazo de integração", tom: "neutral" },
  pendente: { rotulo: "Pendente", tom: "danger" },
};

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "—";
}

export function formatarCarga(minutos: number | null | undefined): string {
  if (!minutos) return "—";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export function formatarPeriodicidade(meses: number | null | undefined): string {
  if (!meses) return "Sem validade";
  if (meses % 12 === 0) return meses === 12 ? "Anual" : `A cada ${meses / 12} anos`;
  return meses === 6 ? "Semestral" : `A cada ${meses} meses`;
}

// Feedback de gestão — funções puras, sem estado. Deliberadamente não
// depende de nenhum tipo/lógica de AVD/PDI (ver types/domain.ts > Feedback):
// é um histórico de acompanhamento contínuo, não um artefato de ciclo.

import type { Feedback, TemaFeedback } from "../types/domain";

export const TEMAS_FEEDBACK: TemaFeedback[] = [
  "Desempenho",
  "Comportamento",
  "Desenvolvimento",
  "Reconhecimento",
  "Alinhamento",
  "Entrega/Resultado",
  "Comunicação",
  "Trabalho em equipe",
  "Outro",
];

/** Mais recente primeiro — por `dataFeedback` (quando a conversa de fato
 * aconteceu), com `criadoEm` como desempate entre registros da mesma data. */
export function ordenarFeedbacks(feedbacks: Feedback[]): Feedback[] {
  return [...feedbacks].sort((a, b) => b.dataFeedback.localeCompare(a.dataFeedback) || b.criadoEm.localeCompare(a.criadoEm));
}

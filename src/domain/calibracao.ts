// Comitê de Calibração (Etapa 6) — funções puras, sem estado nem dependência
// de UI/Supabase. RH revisa a AVD (ficha GESTOR) e a Avaliação de Potencial
// já concluídas pelo gestor e, quando necessário, ajusta a média
// comportamental e/ou a nota de potencial antes de virarem Nota Oficial —
// a nota original do gestor nunca é sobrescrita. Ver README > "Gestão de
// Desempenho".

import { arredondar, notaFinalAvaliacao } from "./avaliacaoDesempenho";
import type { ConfigAvaliacaoDesempenho } from "../types/domain";

/** true quando o valor calibrado difere de fato do original (comparação
 * arredondada, pra não disparar por ruído de ponto flutuante) — gate pra
 * exigir justificativa. `null` calibrado sempre significa "sem alteração". */
export function precisaJustificativa(original: number | null, calibrada: number | null): boolean {
  if (calibrada === null) return false;
  return arredondar(calibrada) !== arredondar(original);
}

/** Nota Oficial da AVD — reaproveita notaFinalAvaliacao() (mesma fórmula
 * ponderada de sempre). Média técnica (KPIs) NUNCA é calibrável — resultado
 * objetivo do gestor, entra sempre como veio. Só a média comportamental é
 * substituída quando o RH calibrou (`mediaComportamentalCalibrada` não nulo). */
export function calcularNotaOficialAvd(
  mediaTecnica: number | null,
  mediaComportamentalOriginal: number | null,
  mediaComportamentalCalibrada: number | null,
  config: ConfigAvaliacaoDesempenho | null,
): number | null {
  return notaFinalAvaliacao(mediaTecnica, mediaComportamentalCalibrada ?? mediaComportamentalOriginal, config);
}

/** Nota Oficial de Potencial — o valor calibrado, se houver, senão o
 * original do gestor. */
export function calcularNotaOficialPotencial(notaPotencialOriginal: number | null, notaPotencialCalibrada: number | null): number | null {
  return notaPotencialCalibrada ?? notaPotencialOriginal;
}

/** Justificativa é obrigatória se QUALQUER um dos 2 eixos calibráveis foi
 * de fato alterado (comportamental da AVD, nota de potencial) — se nenhum
 * mudou, RH pode homologar direto (a nota inicial vira a Oficial). */
export function validarCalibracao(
  mediaComportamentalOriginal: number | null,
  mediaComportamentalCalibrada: number | null,
  notaPotencialOriginal: number | null,
  notaPotencialCalibrada: number | null,
  justificativa: string,
): { ok: true } | { ok: false; error: string } {
  const precisaAvd = precisaJustificativa(mediaComportamentalOriginal, mediaComportamentalCalibrada);
  const precisaPotencial = precisaJustificativa(notaPotencialOriginal, notaPotencialCalibrada);
  if ((precisaAvd || precisaPotencial) && justificativa.trim() === "") {
    return { ok: false, error: "Justificativa obrigatória quando alguma nota é alterada na calibração." };
  }
  return { ok: true };
}

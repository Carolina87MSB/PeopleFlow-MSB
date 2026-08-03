// Matriz 9 Box (Etapa 5) — funções puras, sem estado nem dependência de
// UI/Supabase. Posicionamento é sempre derivado ao vivo da nota final da AVD
// (GESTOR, Concluída) + nota de Potencial (Concluída) — nunca persistido,
// sem edição manual. Ver README > "Gestão de Desempenho".

import type { ConfigAvaliacaoDesempenho, FaixaMatriz9Box } from "../types/domain";

/** Classifica uma nota (Desempenho ou Potencial) em Baixo/Médio/Alto pelos
 * limiares configurados — ambos os cortes são inclusivos pra cima (>=),
 * batendo com "3,0 até 3,9" (Médio) / "igual ou superior a 4,0" (Alto). */
export function classificarFaixaMatriz9Box(nota: number, limiteMedio: number, limiteAlto: number): FaixaMatriz9Box {
  if (nota >= limiteAlto) return "Alto";
  if (nota >= limiteMedio) return "Médio";
  return "Baixo";
}

/** Nomenclatura corporativa dos 9 quadrantes, sugerida e aprovada pelo RH —
 * chave externa é a faixa de Potencial (linha), interna é a de Desempenho
 * (coluna), mesma orientação da tabela do spec. */
export const NOMES_QUADRANTES_MATRIZ_9_BOX: Record<FaixaMatriz9Box, Record<FaixaMatriz9Box, string>> = {
  Alto: { Baixo: "Desenvolver com Prioridade", Médio: "Talento em Desenvolvimento", Alto: "Talento Estratégico" },
  Médio: { Baixo: "Reavaliar Desempenho", Médio: "Contribuidor Consistente", Alto: "Alto Desempenho" },
  Baixo: { Baixo: "Atenção Imediata", Médio: "Estável", Alto: "Especialista Consolidado" },
};

export interface PosicaoMatriz9Box {
  faixaDesempenho: FaixaMatriz9Box;
  faixaPotencial: FaixaMatriz9Box;
  nomeQuadrante: string;
}

/** Ponto ÚNICO de posicionamento na Matriz 9 Box — `null` quando falta a
 * nota final da AVD (ficha GESTOR Concluída) OU a nota de Potencial (ficha
 * Concluída) pro ciclo em questão: o colaborador simplesmente não aparece
 * plotado, nunca há preenchimento manual de posição. */
export function posicionarMatriz9Box(
  notaDesempenho: number | null,
  notaPotencial: number | null,
  config: ConfigAvaliacaoDesempenho | null,
): PosicaoMatriz9Box | null {
  if (notaDesempenho === null || notaPotencial === null) return null;
  const faixaDesempenho = classificarFaixaMatriz9Box(
    notaDesempenho,
    config?.matrizDesempenhoLimiteMedio ?? 3,
    config?.matrizDesempenhoLimiteAlto ?? 4,
  );
  const faixaPotencial = classificarFaixaMatriz9Box(
    notaPotencial,
    config?.matrizPotencialLimiteMedio ?? 3,
    config?.matrizPotencialLimiteAlto ?? 4,
  );
  return { faixaDesempenho, faixaPotencial, nomeQuadrante: NOMES_QUADRANTES_MATRIZ_9_BOX[faixaPotencial][faixaDesempenho] };
}

/** Valida um par de limiares (Desempenho ou Potencial) — exige os dois
 * dentro da escala 1-5 e o limiar médio estritamente menor que o alto
 * (senão a classificação "Médio" nunca seria alcançável). */
export function validarLimiaresMatriz9Box(limiteMedio: number, limiteAlto: number): { ok: true } | { ok: false; error: string } {
  if (
    Number.isNaN(limiteMedio) ||
    Number.isNaN(limiteAlto) ||
    limiteMedio < 1 ||
    limiteAlto > 5 ||
    limiteMedio >= limiteAlto
  ) {
    return { ok: false, error: "Os limiares da Matriz 9 Box devem estar entre 1 e 5, com o limiar médio menor que o limiar alto." };
  }
  return { ok: true };
}

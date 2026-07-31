// Cálculo da Avaliação de Desempenho (AVD) — funções puras, sem estado nem
// dependência de UI/Supabase. Ver README > "Gestão de Desempenho" para as
// regras de negócio por trás de cada fórmula.

import type { AvaliacaoDesempenho, ConfigAvaliacaoDesempenho, KpiCargo, ResultadoComportamental, ResultadoKpi } from "../types/domain";

/** Escala fixa de avaliação das afirmações comportamentais — igual pra todas
 * as competências, não é configurável (ver peopleflow_competencias_comportamentais
 * em supabase/schema.sql). */
export const ESCALA_COMPORTAMENTAL: { nota: number; significado: string }[] = [
  { nota: 1, significado: "Não atende às expectativas" },
  { nota: 2, significado: "Atende parcialmente" },
  { nota: 3, significado: "Atende às expectativas" },
  { nota: 4, significado: "Acima das expectativas" },
  { nota: 5, significado: "Supera as expectativas" },
];

export function gerarIdCicloAvaliacaoDesempenho(): string {
  return `CICLO${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function gerarIdAvaliacaoDesempenho(): string {
  return `AVD${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((soma, v) => soma + v, 0) / valores.length;
}

/** Média das notas já respondidas de uma competência — `null` se nenhuma
 * afirmação foi respondida ainda. Afirmações em branco (`null`) não entram
 * na média (não são tratadas como 0). */
export function mediaAfirmacoes(notasAfirmacoes: (number | null)[]): number | null {
  const respondidas = notasAfirmacoes.filter((n): n is number => n !== null);
  return media(respondidas);
}

/** Nota final de uma competência = média das afirmações respondidas — só
 * conta como "completa" quando TODAS as afirmações vinculadas têm nota. */
export function competenciaCompleta(resultado: ResultadoComportamental): boolean {
  return resultado.notasAfirmacoes.length > 0 && resultado.notasAfirmacoes.every((n) => n !== null);
}

/** Média geral das Competências Comportamentais — média simples das médias
 * de cada competência (só entram competências já completas). `null` se
 * nenhuma competência estiver completa ainda. */
export function mediaComportamental(resultados: ResultadoComportamental[]): number | null {
  const completas = resultados.filter(competenciaCompleta).map((r) => mediaAfirmacoes(r.notasAfirmacoes)).filter((m): m is number => m !== null);
  return media(completas);
}

/** Percentual de atingimento de um KPI. "Maior é Melhor": resultado/meta.
 * "Menor é Melhor": lógica inversa (meta/resultado) — resultado igual ou
 * menor que a meta já representa 100% ou mais. Resultado 0 num "Menor é
 * Melhor" é o melhor caso possível; sem meta pra dividir, usa um teto
 * pragmático de 200% em vez de Infinity (que quebraria o JSON). */
export function percentualAtingimentoKpi(meta: number | null, resultado: number | null, sentido: KpiCargo["sentidoMeta"]): number | null {
  if (meta === null || resultado === null) return null;
  if (sentido === "Maior é Melhor") {
    if (meta === 0) return resultado === 0 ? 100 : 200;
    return (resultado / meta) * 100;
  }
  if (resultado === 0) return meta === 0 ? 100 : 200;
  return (meta / resultado) * 100;
}

/** Converte percentual de atingimento em nota de 1 a 5, conforme a escala:
 * >=95% -> 5, 93-94,99% -> 4, 90-92,99% -> 3, 85-89,99% -> 2, <85% -> 1. */
export function notaPorPercentual(percentual: number): number {
  if (percentual >= 95) return 5;
  if (percentual >= 93) return 4;
  if (percentual >= 90) return 3;
  if (percentual >= 85) return 2;
  return 1;
}

/** Nota de um KPI específico dentro de uma avaliação — `null` se ainda sem resultado informado. */
export function notaKpi(resultado: ResultadoKpi, kpi: KpiCargo | undefined): number | null {
  if (!kpi) return null;
  const percentual = percentualAtingimentoKpi(kpi.meta, resultado.resultado, kpi.sentidoMeta);
  return percentual === null ? null : notaPorPercentual(percentual);
}

/** Média das Competências Técnicas (KPIs) — ponderada por `peso` (KPI sem
 * peso definido conta como peso 1). Quando nenhum KPI do conjunto tem peso
 * definido, isso equivale sozinho a uma média simples — não precisa de
 * lógica separada pros dois casos da especificação. `null` enquanto algum
 * KPI do conjunto ainda não tem resultado. */
export function mediaTecnica(resultados: ResultadoKpi[], kpis: KpiCargo[]): number | null {
  if (resultados.length === 0) return null;
  const kpisPorId = new Map(kpis.map((k) => [k.id, k]));
  let somaPonderada = 0;
  let somaPesos = 0;
  for (const r of resultados) {
    const kpi = kpisPorId.get(r.kpiId);
    const nota = notaKpi(r, kpi);
    if (nota === null) return null;
    const peso = kpi?.peso ?? 1;
    somaPonderada += nota * peso;
    somaPesos += peso;
  }
  return somaPesos === 0 ? null : somaPonderada / somaPesos;
}

/** Nota final da avaliação, ponderada pelos pesos configurados em
 * ConfigAvaliacaoDesempenho — `null` enquanto qualquer um dos dois blocos
 * ainda não estiver completo. */
export function notaFinalAvaliacao(
  mediaTecnicaValor: number | null,
  mediaComportamentalValor: number | null,
  config: ConfigAvaliacaoDesempenho | null,
): number | null {
  if (mediaTecnicaValor === null || mediaComportamentalValor === null) return null;
  const pesoKpis = config?.pesoKpis ?? 60;
  const pesoComportamental = config?.pesoComportamental ?? 40;
  const somaPesos = pesoKpis + pesoComportamental;
  if (somaPesos === 0) return null;
  return (mediaTecnicaValor * pesoKpis + mediaComportamentalValor * pesoComportamental) / somaPesos;
}

/** true quando todas as afirmações comportamentais e todos os KPIs
 * vinculados à avaliação já têm valor — gate pro botão "Concluir avaliação". */
export function avaliacaoCompleta(avaliacao: AvaliacaoDesempenho): boolean {
  const comportamentalOk = avaliacao.resultadosComportamentais.every(competenciaCompleta);
  const tecnicoOk = avaliacao.resultadosKpis.every((r) => r.resultado !== null);
  return comportamentalOk && tecnicoOk;
}

export function arredondar(valor: number | null, casas = 1): number | null {
  if (valor === null) return null;
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

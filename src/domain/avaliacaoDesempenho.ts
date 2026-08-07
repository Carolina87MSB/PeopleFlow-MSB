// Cálculo da Avaliação de Desempenho (AVD) — funções puras, sem estado nem
// dependência de UI/Supabase. Ver README > "Gestão de Desempenho" para as
// regras de negócio por trás de cada fórmula.

import type {
  AvaliacaoDesempenho,
  Colaborador,
  CompetenciaComportamental,
  ConfigAvaliacaoDesempenho,
  KpiCargo,
  ResultadoComportamental,
  ResultadoKpi,
  TipoAvaliacaoDesempenho,
} from "../types/domain";

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

/** Nota de um KPI específico dentro de uma avaliação — `null` se ainda sem
 * resultado informado. Usa o snapshot congelado no próprio `resultado`
 * (meta/sentidoMeta); `kpi` (lookup no catálogo atual) só serve de
 * fallback pra avaliações antigas, geradas antes do snapshot existir. */
export function notaKpi(resultado: ResultadoKpi, kpi?: KpiCargo): number | null {
  const meta = resultado.meta ?? kpi?.meta ?? null;
  const sentido = resultado.sentidoMeta ?? kpi?.sentidoMeta;
  if (!sentido) return null;
  const percentual = percentualAtingimentoKpi(meta, resultado.resultado, sentido);
  return percentual === null ? null : notaPorPercentual(percentual);
}

/** Média das Competências Técnicas (KPIs) — ponderada por `peso` (KPI sem
 * peso definido conta como peso 1). Quando nenhum KPI do conjunto tem peso
 * definido, isso equivale sozinho a uma média simples — não precisa de
 * lógica separada pros dois casos da especificação. `null` enquanto algum
 * KPI do conjunto ainda não tem resultado. `kpis` (catálogo atual) só serve
 * de fallback — o peso vem do snapshot em `resultado.peso` sempre que presente. */
export function mediaTecnica(resultados: ResultadoKpi[], kpis: KpiCargo[] = []): number | null {
  if (resultados.length === 0) return null;
  const kpisPorId = new Map(kpis.map((k) => [k.id, k]));
  let somaPonderada = 0;
  let somaPesos = 0;
  for (const r of resultados) {
    const kpi = kpisPorId.get(r.kpiId);
    const nota = notaKpi(r, kpi);
    if (nota === null) return null;
    const peso = r.peso ?? kpi?.peso ?? 1;
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

/** Nota final por tipo de avaliação — LIDERANCA nunca tem bloco técnico
 * (sem KPI), então `notaFinalAvaliacao()` sempre retornaria `null` pra ela
 * (precisa dos dois blocos); aqui a nota da liderança é a própria média
 * comportamental. GESTOR/AUTOAVALIACAO usam a ponderação normal — a nota da
 * autoavaliação é calculada e gravada igual, só nunca é lida por nada além
 * da própria ficha (não compõe a nota oficial da AVD, que é sempre a do
 * tipo GESTOR). */
export function notaFinalPorTipo(
  tipo: TipoAvaliacaoDesempenho,
  mediaTecnicaValor: number | null,
  mediaComportamentalValor: number | null,
  config: ConfigAvaliacaoDesempenho | null,
): number | null {
  if (tipo === "LIDERANCA") return mediaComportamentalValor;
  return notaFinalAvaliacao(mediaTecnicaValor, mediaComportamentalValor, config);
}

export interface ResultadoCalculoAvaliacao {
  mediaTecnica: number | null;
  mediaComportamental: number | null;
  notaFinal: number | null;
}

/** Ponto ÚNICO de cálculo das notas agregadas de uma avaliação (média
 * técnica, média comportamental, nota final) — use esta função em QUALQUER
 * lugar que precise desses 3 números: preview no Drawer, gravação em
 * salvarAvaliacaoDesempenho, exibição na lista de Avaliações, e qualquer
 * funcionalidade futura que use a nota (relatórios, dashboards, Matriz 9
 * Box, PDI). Nunca recalcule esses 3 valores separadamente fora daqui — o
 * preview (antes de salvar) e o valor persistido devem ser sempre
 * idênticos.
 *
 * Regra de arredondamento: cada um dos 3 valores é calculado a partir dos
 * dados brutos em precisão total e só arredondado (1 casa decimal) no
 * final, individualmente — a nota final NUNCA é calculada a partir de
 * médias já arredondadas (evitava divergência entre o preview e o valor
 * gravado antes desta unificação). */
export function calcularNotasAvaliacao(
  avaliacao: Pick<AvaliacaoDesempenho, "tipo" | "resultadosComportamentais" | "resultadosKpis">,
  kpisCargo: KpiCargo[],
  config: ConfigAvaliacaoDesempenho | null,
): ResultadoCalculoAvaliacao {
  const mediaTecnicaValor = mediaTecnica(avaliacao.resultadosKpis, kpisCargo);
  const mediaComportamentalValor = mediaComportamental(avaliacao.resultadosComportamentais);
  const notaFinalValor = notaFinalPorTipo(avaliacao.tipo, mediaTecnicaValor, mediaComportamentalValor, config);
  return {
    mediaTecnica: arredondar(mediaTecnicaValor),
    mediaComportamental: arredondar(mediaComportamentalValor),
    notaFinal: arredondar(notaFinalValor),
  };
}

/** Valida a configuração da Avaliação de Desempenho (soma dos pesos =
 * 100%) — camada de negócio, independente de qualquer UI. Chamada antes de
 * gravar em `atualizarConfigAvaliacaoDesempenho()` (usePortalData.ts), pra
 * nenhuma configuração inválida chegar a ser persistida, não importa por
 * onde a gravação seja disparada. Mesma tolerância (0,01) já usada na
 * validação instantânea da tela de Configuração. */
export function validarConfigAvaliacaoDesempenho(
  pesoKpis: number,
  pesoComportamental: number,
): { ok: true } | { ok: false; error: string } {
  const soma = pesoKpis + pesoComportamental;
  if (Number.isNaN(soma) || Math.abs(soma - 100) > 0.01) {
    return { ok: false, error: "A soma dos pesos de Competências Técnicas e Comportamentais deve ser exatamente 100%." };
  }
  return { ok: true };
}

/** Elegibilidade pra Avaliação de Desempenho: colaborador ativo com admissão
 * em ou antes da data de corte definida pelo RH na abertura do ciclo
 * (`CicloAvaliacaoDesempenho.dataCorteAdmissao`) — comparação direta de data,
 * não mais "6 meses completos de empresa até o encerramento do ciclo" (regra
 * antiga: dependia de quando o ciclo fechava, e podia incluir por engano
 * quem foi admitido depois do período avaliado se o ciclo demorasse pra
 * encerrar). Colaborador não elegível não recebe nenhuma ficha — o motivo é
 * registrado no log de auditoria do ciclo. */
export function elegivelParaCicloAvaliacaoDesempenho(
  colaborador: Colaborador,
  dataCorteAdmissaoIso: string,
): { elegivel: boolean; motivo?: string } {
  if (colaborador.desligado) return { elegivel: false, motivo: "Colaborador desligado" };

  if (!colaborador.admissaoIso || colaborador.admissaoIso > dataCorteAdmissaoIso) {
    return {
      elegivel: false,
      motivo: `Admissão (${colaborador.admissaoIso || "não informada"}) posterior à data de corte do ciclo (${dataCorteAdmissaoIso})`,
    };
  }
  return { elegivel: true };
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

/** Lista textual do que falta preencher pra poder concluir a avaliação —
 * exibida ao gestor em vez de só desabilitar o botão em silêncio. Usa o
 * nome congelado no próprio `resultado`; `competencias`/`kpis` (catálogo
 * atual) só servem de fallback pra avaliações antigas, geradas antes do
 * snapshot existir. */
export function itensPendentes(
  avaliacao: AvaliacaoDesempenho,
  competencias: CompetenciaComportamental[] = [],
  kpis: KpiCargo[] = [],
): string[] {
  const competenciasPorId = new Map(competencias.map((c) => [c.id, c]));
  const kpisPorId = new Map(kpis.map((k) => [k.id, k]));
  const pendentes: string[] = [];

  for (const resultado of avaliacao.resultadosComportamentais) {
    const nome = resultado.competenciaNome || competenciasPorId.get(resultado.competenciaId)?.nome || "Competência";
    resultado.notasAfirmacoes.forEach((nota, indice) => {
      if (nota === null) pendentes.push(`${nome} — afirmação ${indice + 1}`);
    });
  }

  for (const resultado of avaliacao.resultadosKpis) {
    if (resultado.resultado === null) {
      const nome = resultado.kpiNome || kpisPorId.get(resultado.kpiId)?.nomeIndicador || `#${resultado.kpiId}`;
      pendentes.push(`KPI: ${nome}`);
    }
  }

  return pendentes;
}

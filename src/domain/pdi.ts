// Regras do Plano de Desenvolvimento Individual (PDI) — funções puras, sem
// estado nem dependência de UI/Supabase. Ver README > "Gestão de Desempenho"
// e domain/avaliacaoDesempenho.ts (mesmo espírito).

import type { PdiBibliotecaItem, TipoCompetenciaPdi } from "../types/domain";

export function gerarIdPdiItem(): string {
  return `PDIITEM${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function gerarIdPdiAcao(): string {
  return `PDIACAO${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** true quando o PDI já tem pelo menos uma ação e todas estão resolvidas
 * (Concluída ou Cancelada) — gate pro botão "Concluir PDI". Exige pelo
 * menos uma ação de propósito: `every()` sobre uma lista vazia é
 * vacuamente verdadeiro, o que deixaria um plano recém-gerado sem nenhum
 * item "concluível" na hora, sem nenhum desenvolvimento de fato registrado. */
export function pdiPodeSerConcluido(pdi: { itens: { acoes: { status: string }[] }[] }): boolean {
  const todasAcoes = pdi.itens.flatMap((i) => i.acoes);
  return todasAcoes.length > 0 && todasAcoes.every((a) => a.status === "Concluída" || a.status === "Cancelada");
}

/** Procura na biblioteca do RH um modelo de objetivo/ações pra essa
 * competência (chave = id da competência comportamental, ou nome do KPI
 * pra competências técnicas — ver comentário em PdiBibliotecaItem). Sem
 * modelo cadastrado, cai num objetivo genérico e nenhuma ação pré-sugerida
 * (o gestor adiciona manualmente). */
export function sugerirObjetivoEAcoes(
  chave: string,
  tipoCompetencia: TipoCompetenciaPdi,
  nomeExibicao: string,
  biblioteca: PdiBibliotecaItem[],
): { objetivo: string; acoesSugeridas: string[] } {
  const modelo = biblioteca.find((b) => b.chave === chave && b.tipoCompetencia === tipoCompetencia);
  if (modelo) return { objetivo: modelo.objetivoSugerido, acoesSugeridas: modelo.acoesSugeridas };
  return { objetivo: `Desenvolver a competência de ${nomeExibicao}.`, acoesSugeridas: [] };
}

/** Valida a nota mínima configurável do PDI — precisa estar dentro da
 * mesma escala 1-5 usada em ESCALA_COMPORTAMENTAL (domain/avaliacaoDesempenho.ts). */
export function validarNotaMinimaPdi(valor: number): { ok: true } | { ok: false; error: string } {
  if (Number.isNaN(valor) || valor < 1 || valor > 5) {
    return { ok: false, error: "A nota mínima para o PDI deve estar entre 1 e 5." };
  }
  return { ok: true };
}

// Leitura auxiliar das ações do PDI para a tela "Sugestões a partir do PDI".
// Funções PURAS. O universo da tela é sempre TODO item de PDI com ação em aberto ainda não tratada: nada aqui
// esconde registros. Os "indícios" só ajudam o RH a ler o texto da ação; NÃO definem como a necessidade
// será atendida (isso é decidido depois, em outro momento) e NÃO são gravados em lugar nenhum.

export type IndicioForma = "mentoria" | "pratica" | "treinamento";
export type FiltroForma = "todas" | IndicioForma | "outra";
export type FiltroTipo = "todos" | "Comportamental" | "Tecnica";

export const ROTULO_INDICIO: Record<IndicioForma, string> = {
  mentoria: "Mentoria",
  pratica: "Aprendizagem prática",
  treinamento: "Treinamento/capacitação",
};

export const ROTULO_FILTRO_FORMA: Record<FiltroForma, string> = {
  todas: "Todas",
  mentoria: ROTULO_INDICIO.mentoria,
  pratica: ROTULO_INDICIO.pratica,
  treinamento: ROTULO_INDICIO.treinamento,
  outra: "Outra ação",
};

export const ROTULO_FILTRO_TIPO: Record<FiltroTipo, string> = {
  todos: "Todos os tipos",
  Comportamental: "Desenvolvimento comportamental",
  Tecnica: "Desenvolvimento técnico",
};

const MENTORIA = /\b(mentor\w*|coaching|coach\w*|shadowing|padrinho|madrinha|orienta[cç][aã]o (do|da|de|pelo|pela) (l[ií]der|gestor|gestora|diretor\w*))\b/i;

const PRATICA =
  /\b(ouvinte|job rotation|rod[ií]zio|rota[cç][aã]o de fun\w*|acompanhar|observar|participar d\w+ (reuni\w*|projeto\w*|comit\w*|f[oó]rum|discuss\w*)|reuni[õo]es|projeto\w*|assumir|conduzir|liderar|apresentar|exposi[cç][aã]o|no dia a dia|na rotina|pr[aá]tic\w*|desafio\w*|delega\w*)\b/i;

const TREINAMENTO =
  /\b(treinament\w*|curso\w*|capacita\w*|qualifica\w*|workshop\w*|palestra\w*|semin[aá]ri\w*|congresso\w*|certifica\w*|forma[cç][aã]o|p[oó]s[- ]?gradua\w*|mba|especializa\w*|e-?learning|ead|aula\w*|oficina\w*|imers[aã]o|reciclagem|instru[cç][aã]o|trilha\w*)\b/i;

/** Indícios no texto da ação. Uma ação pode ter mais de um; vazio = "Outra ação". */
export function indiciosDaAcao(descricao: string): IndicioForma[] {
  const out: IndicioForma[] = [];
  if (TREINAMENTO.test(descricao)) out.push("treinamento");
  if (MENTORIA.test(descricao)) out.push("mentoria");
  if (PRATICA.test(descricao)) out.push("pratica");
  return out;
}

// ── Visões da triagem do RH (por item do PDI) ────────────────────────────
export type SituacaoTriagem = "aguardando" | "confirmadas" | "mantidas";

export const ROTULO_SITUACAO_TRIAGEM: Record<SituacaoTriagem, string> = {
  aguardando: "Aguardando análise",
  confirmadas: "Confirmadas como necessidade",
  mantidas: "Mantidas somente no PDI",
};

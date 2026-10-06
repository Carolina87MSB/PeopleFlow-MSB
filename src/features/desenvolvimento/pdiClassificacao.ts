// Leitura auxiliar das ações do PDI para a tela "Sugestões a partir do PDI".
// Funções PURAS. O universo da tela é sempre TODA ação de PDI em aberto ainda não tratada: nada aqui
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

export interface AcaoClassificavel {
  tipo: "Comportamental" | "Tecnica";
  indicios: IndicioForma[];
  departamento?: string | undefined;
}

export interface FiltrosSugestao {
  departamento: string;
  tipo: FiltroTipo;
  forma: FiltroForma;
}

const passaDepartamento = (a: AcaoClassificavel, f: FiltrosSugestao) => !f.departamento || a.departamento === f.departamento;
const passaTipo = (a: AcaoClassificavel, f: FiltrosSugestao) => f.tipo === "todos" || a.tipo === f.tipo;
const passaForma = (a: AcaoClassificavel, forma: FiltroForma) => forma === "todas" || (forma === "outra" ? a.indicios.length === 0 : a.indicios.includes(forma));

/** Aplica os filtros auxiliares sobre o universo (todas as ações em aberto). Com tudo em "todas/todos" devolve tudo. */
export function filtrarAcoes<T extends AcaoClassificavel>(acoes: T[], filtros: FiltrosSugestao): T[] {
  return acoes.filter((a) => passaDepartamento(a, filtros) && passaTipo(a, filtros) && passaForma(a, filtros.forma));
}

/** Quantas ações cada chip de forma mostraria, respeitando departamento e tipo (não a própria forma). */
export function contagemPorForma<T extends AcaoClassificavel>(acoes: T[], filtros: FiltrosSugestao): Record<FiltroForma, number> {
  const base = acoes.filter((a) => passaDepartamento(a, filtros) && passaTipo(a, filtros));
  const conta = (forma: FiltroForma) => base.filter((a) => passaForma(a, forma)).length;
  return { todas: base.length, mentoria: conta("mentoria"), pratica: conta("pratica"), treinamento: conta("treinamento"), outra: conta("outra") };
}

// ── Destino de cada ação na triagem do RH ───────────────────────────────
export type SituacaoTriagem = "aguardando" | "confirmadas" | "mantidas";

export const ROTULO_SITUACAO_TRIAGEM: Record<SituacaoTriagem, string> = {
  aguardando: "Aguardando análise",
  confirmadas: "Confirmadas como necessidade",
  mantidas: "Mantidas somente no PDI",
};

/**
 * Onde a ação aparece. Quem já recebeu decisão do RH fica na lista da decisão (mesmo que a ação já tenha sido
 * concluída no PDI); só entra em "aguardando análise" a ação em aberto SEM decisão. Concluída/cancelada sem
 * decisão não aparece (null). Confirmada prevalece se, por algum motivo, houver as duas marcas.
 */
export function situacaoDaAcao(emAberto: boolean, confirmada: boolean, mantida: boolean): SituacaoTriagem | null {
  if (confirmada) return "confirmadas";
  if (mantida) return "mantidas";
  return emAberto ? "aguardando" : null;
}

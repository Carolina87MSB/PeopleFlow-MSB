// Avaliação de Reação (nível 1) dos treinamentos: formulário padronizado, elegibilidade e indicadores.
// Regras puras, usadas pelo servidor (api/_lib/desenvolvimentoAcoes.ts) e pelas telas.
//
//   • Vale para TODO treinamento oficial (homologação/teste nunca entra) com participante que PARTICIPOU (presença confirmada).
//   • A elegibilidade independe de COMO a presença foi confirmada (QR, manual, ou o método que vier depois — ex.: confirmação por gravação):
//     basta a presença estar "presente". Novos métodos de presença não exigem mudança aqui.
//   • Não é retroativa: só participações confirmadas a partir de `ativa_desde` (data de ativação do recurso) são elegíveis.
//   • Não interfere na conclusão do treinamento (nada aqui é consultado ao concluir).

export const VERSAO_FORMULARIO = 1;

export const QUESTOES: readonly string[] = [
  "Os objetivos do treinamento ficaram claros.",
  "O conteúdo foi relevante para o meu trabalho.",
  "A condução do treinamento foi clara e organizada.",
  "O tempo, o local ou a plataforma e os materiais foram adequados.",
  "Consigo aplicar o que aprendi na minha rotina.",
];

export const ESCALA: readonly { valor: number; rotulo: string }[] = [
  { valor: 1, rotulo: "Discordo totalmente" },
  { valor: 2, rotulo: "Discordo" },
  { valor: 3, rotulo: "Neutro" },
  { valor: 4, rotulo: "Concordo" },
  { valor: 5, rotulo: "Concordo totalmente" },
];

/** As 5 respostas, inteiros de 1 a 5, na ordem das questões; qualquer outra coisa é recusada. */
export function validarRespostas(x: unknown): number[] | null {
  if (!Array.isArray(x) || x.length !== QUESTOES.length) return null;
  const nums = x.map((v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? Number(v) : NaN));
  return nums.every((n) => Number.isInteger(n) && n >= 1 && n <= 5) ? nums : null;
}

export interface ParticipacaoParaReacao {
  removido_em?: string | null;
  presenca_status: string;
  presenca_em?: string | null;
}

export interface TreinamentoParaReacao {
  homologacao?: boolean | null;
  status: string;
}

/** A avaliação é devida/permitida para esta participação? `ativaDesde` null = recurso ainda não ativado (nada é elegível). */
export function elegivelParaReacao(p: ParticipacaoParaReacao, t: TreinamentoParaReacao, ativaDesde: string | null): boolean {
  if (!ativaDesde) return false;
  if (p.removido_em) return false;
  if (p.presenca_status !== "presente" || !p.presenca_em) return false;
  if (t.homologacao) return false;
  if (t.status !== "em_andamento" && t.status !== "concluido") return false;
  return new Date(p.presenca_em).getTime() >= new Date(ativaDesde).getTime();
}

export interface IndicadorAdesao {
  elegiveis: number;
  respondidos: number;
  pendentes: number;
  /** Percentual inteiro de 0 a 100; null quando não há elegíveis. */
  taxa: number | null;
}

export function indicadorAdesao(elegiveis: number, respondidos: number): IndicadorAdesao {
  const r = Math.min(respondidos, elegiveis);
  return { elegiveis, respondidos: r, pendentes: elegiveis - r, taxa: elegiveis > 0 ? Math.round((r / elegiveis) * 100) : null };
}

/** Média (1 casa) de cada questão; null quando não há respostas. */
export function mediaPorQuestao(respostas: number[][]): (number | null)[] {
  return QUESTOES.map((_, i) => (respostas.length ? Math.round((respostas.reduce((s, r) => s + r[i], 0) / respostas.length) * 10) / 10 : null));
}

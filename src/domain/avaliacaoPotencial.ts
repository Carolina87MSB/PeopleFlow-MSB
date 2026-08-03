// Avaliação de Potencial (Etapa 4) — funções puras, sem estado nem
// dependência de UI/Supabase. Independente da AVD: nunca altera nota_final
// nem o PDI, só alimenta a futura Matriz 9 Box. Ver README > "Gestão de
// Desempenho".

import { arredondar } from "./avaliacaoDesempenho";
import type { AvaliacaoPotencial, RespostaPotencial } from "../types/domain";

/** Catálogo fixo das 5 perguntas da Avaliação de Potencial — não é
 * editável pelo RH nesta etapa (diferente do catálogo de competências
 * comportamentais). `pergunta` é o texto snapshot em cada resposta gerada;
 * esta constante só serve pra montar o snapshot inicial. */
export const PERGUNTAS_POTENCIAL: { id: string; titulo: string; pergunta: string }[] = [
  {
    id: "desafios",
    titulo: "Capacidade para assumir desafios mais complexos",
    pergunta: "Este colaborador demonstra capacidade para assumir atividades ou desafios mais complexos do que os atualmente desempenhados?",
  },
  {
    id: "aprendizagem",
    titulo: "Capacidade de aprendizagem",
    pergunta: "Aprende novas atividades com rapidez e aplica o conhecimento adquirido em sua rotina de trabalho?",
  },
  {
    id: "adaptabilidade",
    titulo: "Adaptabilidade",
    pergunta: "Adapta-se bem às mudanças de processos, prioridades e necessidades da empresa?",
  },
  {
    id: "autonomia",
    titulo: "Autonomia e iniciativa",
    pergunta: "Demonstra iniciativa e autonomia para resolver problemas e propor soluções?",
  },
  {
    id: "crescimento",
    titulo: "Potencial de crescimento",
    pergunta: "Considerando o contexto da MSB, este colaborador demonstra potencial para ampliar sua contribuição e assumir maiores responsabilidades no futuro?",
  },
];

export function gerarIdAvaliacaoPotencial(): string {
  return `POT${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Ponto ÚNICO de cálculo da nota de potencial — média simples das
 * respostas já dadas, arredondada (1 casa). `null` enquanto nenhuma
 * resposta tiver nota ainda. Nunca recalculada em outro lugar — use esta
 * função tanto no preview do Drawer quanto ao salvar. */
export function calcularNotaPotencial(respostas: RespostaPotencial[]): number | null {
  const notas = respostas.map((r) => r.nota).filter((n): n is number => n !== null);
  if (notas.length === 0) return null;
  return arredondar(notas.reduce((soma, n) => soma + n, 0) / notas.length);
}

/** true quando todas as 5 respostas já têm nota — gate pro botão "Concluir". */
export function avaliacaoPotencialCompleta(avaliacao: AvaliacaoPotencial): boolean {
  return avaliacao.respostas.every((r) => r.nota !== null);
}

/** Lista textual das perguntas ainda sem nota — mesmo espírito de
 * itensPendentes() na AVD, exibida em vez de só desabilitar o botão em
 * silêncio. */
export function itensPendentesPotencial(avaliacao: AvaliacaoPotencial): string[] {
  return avaliacao.respostas.filter((r) => r.nota === null).map((r) => r.pergunta);
}

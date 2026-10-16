// Feedback de gestão — funções puras, sem estado. Deliberadamente não
// depende de nenhum tipo/lógica de AVD/PDI (ver types/domain.ts > Feedback):
// é um histórico de acompanhamento contínuo, não um artefato de ciclo.

import type { Colaborador, Feedback, Perfil, TemaFeedback } from "../types/domain";

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

/** Quem aparece na tela Feedback de `me`. Parte da população da Matriz 9 Box (RH/visão completa: empresa toda; Gestor: quem `me`
 * avaliou como GESTOR na AVD, ou o liderado atual que ninguém mais avaliou) e SEMPRE soma a equipe de hoje (`gestor === me`
 * no cadastro). Feedback é acompanhamento contínuo: o liderado atual tem que estar na lista mesmo que outro gestor o tenha
 * avaliado num ciclo antigo — e quem já estava na lista (e pode ter registrado feedback) não some. Só ativos. */
export function colaboradoresParaFeedbackDe(entrada: { perfil: Perfil; me: string; todos: Colaborador[]; populacaoMatriz9Box: Colaborador[] }): Colaborador[] {
  const { perfil, me, todos, populacaoMatriz9Box } = entrada;
  if (perfil === "Colaborador") return [];
  const nomes = new Set<string>();
  const out: Colaborador[] = [];
  for (const c of [...populacaoMatriz9Box, ...(perfil === "RH" ? [] : todos.filter((x) => x.gestor === me))]) {
    if (c.desligado || nomes.has(c.nome)) continue;
    nomes.add(c.nome);
    out.push(c);
  }
  return out;
}

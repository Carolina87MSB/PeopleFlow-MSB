// Regras puras da tela "Incluir participantes" (testadas isoladamente).
import type { PessoaDesenvolvimento } from "./devRepository";

export const TODOS_DEPARTAMENTOS = "";

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
}

export function departamentosDe(opcoes: PessoaDesenvolvimento[]): string[] {
  return [...new Set(opcoes.map((o) => o.departamento).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Busca por nome + filtro de departamento; quem já está na turma fica de fora. */
export function filtrarOpcoes(opcoes: PessoaDesenvolvimento[], busca: string, departamento: string, jaInscritos: Set<number>): PessoaDesenvolvimento[] {
  const termo = normalizar(busca.trim());
  return opcoes.filter(
    (o) => !jaInscritos.has(o.id) && (departamento === TODOS_DEPARTAMENTOS || o.departamento === departamento) && (!termo || normalizar(o.nome).includes(termo)),
  );
}

/** "Selecionar todos" respeita o filtro atual: marca todos os visíveis, mantendo o que já estava marcado. */
export function selecionarTodos(marcados: Set<number>, visiveis: PessoaDesenvolvimento[]): Set<number> {
  const novo = new Set(marcados);
  for (const o of visiveis) novo.add(o.id);
  return novo;
}

/** Desmarca os visíveis (os marcados fora do filtro atual continuam). */
export function desmarcarTodos(marcados: Set<number>, visiveis: PessoaDesenvolvimento[]): Set<number> {
  const novo = new Set(marcados);
  for (const o of visiveis) novo.delete(o.id);
  return novo;
}

export function alternar(marcados: Set<number>, id: number): Set<number> {
  const novo = new Set(marcados);
  if (novo.has(id)) novo.delete(id);
  else novo.add(id);
  return novo;
}

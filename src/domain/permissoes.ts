import type { Movimentacao, Perfil } from "../types/domain";

export function navColab(perfil: Perfil): boolean {
  return perfil !== "Diretoria";
}

export function navRegistro(perfil: Perfil): boolean {
  return perfil === "RH";
}

export function canCreate(perfil: Perfil): boolean {
  return perfil === "RH" || perfil === "Gestor";
}

export function showEquipes(perfil: Perfil): boolean {
  return perfil !== "Diretoria";
}

/** Mirrors the prototype's canSeeMov(): RH sees everything, Diretoria only what it must approve, Gestor only their scope. */
export function canSeeMov(
  m: Movimentacao,
  perfil: Perfil,
  me: string,
  scopeSet: Set<string> | null,
): boolean {
  if (perfil === "RH") return true;
  if (perfil === "Diretoria") return m.status !== "Rascunho" && m.etapas.some((e) => e.aprovador === me);
  return (scopeSet !== null && scopeSet.has(m.colaborador)) || m.solicitante === me || m.etapas.some((e) => e.aprovador === me);
}

export function filtrarColaboradoresPorEscopo<T extends { nome: string }>(
  colaboradores: T[],
  perfil: Perfil,
  scopeSet: Set<string> | null,
): T[] {
  if (perfil !== "Gestor" || !scopeSet) return colaboradores;
  return colaboradores.filter((c) => scopeSet.has(c.nome));
}

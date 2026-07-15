import type { Movimentacao, Perfil } from "../types/domain";

/** Todos os perfis acessam a tela Colaboradores — RH edita, Gestor e
 * Diretoria são só leitura (ver colaboradoresListagem em usePortalData.ts). */
export function navColab(_perfil: Perfil): boolean {
  return true;
}

export function navRegistro(perfil: Perfil): boolean {
  return perfil === "RH";
}

/**
 * RH, Gestor e Diretoria podem solicitar movimentações — Diretor Industrial e
 * CEO também têm reportes diretos (aparecem na coluna `gestor` de algum
 * colaborador) e precisam do botão "Nova movimentação" para essas pessoas,
 * não só o papel de aprovar etapas de outros.
 */
export function canCreate(perfil: Perfil): boolean {
  return perfil === "RH" || perfil === "Gestor" || perfil === "Diretoria";
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
  if (perfil === "Diretoria") {
    // Além do que precisa aprovar, também precisa ver o que ela mesma
    // solicitou (agora que Diretoria também pode criar movimentação — ver
    // canCreate) — nem toda movimentação que ela cria tem "Diretor
    // Industrial"/"CEO" como aprovador de alguma etapa (ex.: tipos sem CEO na
    // matriz), então sem isso a própria solicitação sumiria da tela dela.
    return m.solicitante === me || (m.status !== "Rascunho" && m.etapas.some((e) => e.aprovador === me));
  }
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

import type { Colaborador, Conta, Perfil } from "../types/domain";

const DIACRITICS = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");

export function norm(s: string): string {
  return (s || "").normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

export function emailOf(nome: string): string {
  const parts = nome.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  const first = norm(parts[0] || "");
  const last = norm(parts.length > 1 ? parts[parts.length - 1] : "");
  return (last ? `${first}.${last}` : first) + "@msbbrasil.com";
}

export function perfilOf(colaborador: Colaborador): Perfil {
  if (/CEO|Diretor/i.test(colaborador.cargo)) return "Diretoria";
  if (colaborador.depto === "Recursos Humanos") return "RH";
  return "Gestor";
}

/** Managers referenced by at least one direct report are the only ones granted portal access. */
export function buildAccess(colaboradores: Colaborador[]): Conta[] {
  const byName = new Map(colaboradores.map((c) => [c.nome, c] as const));
  const gestorCount = new Map<string, number>();
  colaboradores.forEach((c) => gestorCount.set(c.gestor, (gestorCount.get(c.gestor) || 0) + 1));

  const access: Conta[] = [];
  gestorCount.forEach((_count, nome) => {
    const c = byName.get(nome);
    if (!c) return;
    access.push({ nome: c.nome, cargo: c.cargo, depto: c.depto, email: emailOf(c.nome), perfil: perfilOf(c) });
  });
  return access;
}

/** Walks the manager tree to find every employee reporting up to `nome`, directly or transitively. */
export function descendants(colaboradores: Colaborador[], nome: string): Set<string> {
  const children = new Map<string, string[]>();
  colaboradores.forEach((c) => {
    const list = children.get(c.gestor) || [];
    list.push(c.nome);
    children.set(c.gestor, list);
  });

  const out = new Set<string>();
  const stack = [...(children.get(nome) || [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (out.has(n)) continue;
    out.add(n);
    (children.get(n) || []).forEach((x) => stack.push(x));
  }
  return out;
}

export function roleApprover(papel: string, ctx: { solicitanteGestor?: string }): string {
  if (papel === "RH") return "Carolina Matos da Cruz";
  if (papel === "Diretor Industrial") return "Yuri Ivonei Crispim";
  if (papel === "CEO") return "Daniel Emiliano Suguer";
  return ctx.solicitanteGestor || "A definir";
}

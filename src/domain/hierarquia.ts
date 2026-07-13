import type { Colaborador, Conta, Perfil } from "../types/domain.js";

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

/**
 * Toda linha de colaborador vira uma conta em potencial (perfil calculado via
 * perfilOf). O verdadeiro portão de acesso é a conta do Supabase Auth — só
 * quem o RH provisiona lá consegue pedir o link mágico (ver AuthContext) —
 * então não há necessidade (nem é seguro) inferir "é gestor" a partir do
 * campo `gestor` de outras linhas: isso quebraria o login de todo mundo
 * (inclusive RH) enquanto a hierarquia real ainda não foi populada via
 * `npm run seed:supabase`.
 */
export function buildAccess(colaboradores: Colaborador[]): Conta[] {
  return colaboradores.map((c) => ({
    nome: c.nome,
    cargo: c.cargo,
    depto: c.depto,
    email: emailOf(c.nome),
    perfil: perfilOf(c),
  }));
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

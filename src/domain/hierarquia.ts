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
 * Contas elegíveis para acessar o portal: RH e Diretoria sempre (por cargo/
 * depto, ver perfilOf), e perfil Gestor só para quem de fato aparece como
 * gestor imediato de pelo menos um colaborador (tem reporte direto na coluna
 * `gestor`). Colaborador individual (sem reporte, não-RH, não-Diretoria) não
 * entra na lista — o portal é para quem participa do fluxo de aprovação
 * (solicitar/aprovar movimentações da própria equipe), não para todo mundo.
 *
 * O verdadeiro portão de acesso continua sendo a conta do Supabase Auth (só
 * quem o RH provisiona lá consegue pedir o link mágico — ver AuthContext);
 * este filtro é sobre QUEM deve aparecer como candidato a receber acesso
 * (tela /acessos) e qual perfil a conta assume ao logar.
 */
export function buildAccess(colaboradores: Colaborador[]): Conta[] {
  const gestoresImediatos = new Set(colaboradores.map((c) => c.gestor));

  return colaboradores
    .filter((c) => {
      const perfil = perfilOf(c);
      return perfil === "RH" || perfil === "Diretoria" || gestoresImediatos.has(c.nome);
    })
    .map((c) => ({
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

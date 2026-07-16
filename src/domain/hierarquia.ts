import type { Colaborador, Conta, Perfil } from "../types/domain.js";

const DIACRITICS = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");

export function norm(s: string): string {
  return (s || "").normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

/** Sobrenomes compostos (grafados com espaço no cadastro, ex.: "Sant Ana")
 * que a heurística de primeiro+último nome de emailOf() erra — mapeados pelo
 * nome completo normalizado para o e-mail corporativo correto. */
const EMAIL_OVERRIDES: Record<string, string> = {
  "tassio antonio lima sant ana": "tassio.santana@msbbrasil.com",
};

export function emailOf(nome: string): string {
  const normNome = norm(nome.replace(/\(.*?\)/g, "").trim().replace(/\s+/g, " "));
  if (EMAIL_OVERRIDES[normNome]) return EMAIL_OVERRIDES[normNome];

  const parts = nome.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  const first = norm(parts[0] || "");
  const last = norm(parts.length > 1 ? parts[parts.length - 1] : "");
  return (last ? `${first}.${last}` : first) + "@msbbrasil.com";
}

const CARGO_DIRETORIA = /^(ceo|diretor(a)?)\b/;

/**
 * Classifica o perfil pelo cargo/depto. O cargo precisa COMEÇAR com "CEO" ou
 * "Diretor(a)" para contar como Diretoria — antes bastava a palavra aparecer
 * em qualquer lugar do texto, o que classificava cargos de apoio como
 * "Assistente de Diretoria" ou "Secretária de Diretoria" (que contêm
 * "Diretor" dentro de "Diretoria") como Diretoria por engano, tirando o
 * acesso de Gestor dessas pessoas (ex.: botão "Nova movimentação").
 */
export function perfilOf(colaborador: Colaborador): Perfil {
  if (CARGO_DIRETORIA.test(norm(colaborador.cargo))) return "Diretoria";
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
    .filter((c) => !c.desligado)
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

const CARGO_CEO = /^ceo\b/;

/**
 * true só para quem tem o cargo "CEO" (hoje, só o Daniel) — deliberadamente
 * NÃO usa perfilOf()/"Diretoria", já que esse perfil também cobre o Diretor
 * Industrial (Yuri) e os dois não podem ser tratados igual aqui: só o CEO
 * pula Gestor Solicitante/Diretor Industrial ao solicitar uma movimentação
 * (ver montarEtapas() em workflow.ts). Cargo, não nome — se um dia outra
 * pessoa assumir o cargo de CEO, a regra já vale pra ela automaticamente.
 */
export function ehCEO(colaborador: Colaborador | undefined): boolean {
  return Boolean(colaborador && CARGO_CEO.test(norm(colaborador.cargo)));
}

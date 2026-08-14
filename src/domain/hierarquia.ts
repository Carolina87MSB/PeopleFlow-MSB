import { hojeIso, mesesCompletos } from "./dates.js";
import type { Colaborador, Conta, Perfil } from "../types/domain.js";

const DIACRITICS = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");

export function norm(s: string): string {
  return (s || "").normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

/** Exceções pontuais em que a heurística de primeiro+último nome de
 * emailOf() não bate com o e-mail corporativo real da pessoa — mapeadas
 * pelo nome completo normalizado. 3 motivos diferentes já cobertos aqui:
 * sobrenome composto grafado com espaço no cadastro (Tassio, "Sant Ana");
 * e-mail real usa o nome do meio, não o último sobrenome (Janete → Carvalho,
 * Bruna → Santos); e domínio corporativo diferente, de empresa afiliada
 * (Daiana/Pedro, "Biomedical" — não é uma liberação geral do domínio
 * @biomedical.com.br, ver EMAILS_PERMITIDOS_FORA_DO_DOMINIO em AuthContext.tsx). */
const EMAIL_OVERRIDES: Record<string, string> = {
  "tassio antonio lima sant ana": "tassio.santana@msbbrasil.com",
  "daiana pereira leite": "daiana.leite@biomedical.com.br",
  "pedro henrique lages rocha": "pedro.rocha@biomedical.com.br",
  "janete carvalho de jesus": "janete.carvalho@msbbrasil.com",
  "bruna santos nascimento": "bruna.santos@msbbrasil.com",
  "drielly mitie mizushima victor": "drielly.mitie@msbbrasil.com",
  "tais batista santos araujo": "tais.santos@msbbrasil.com",
  "edilcelia souza de jesus": "edilcelia.souza@msbbrasil.com",
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
 * Classifica o perfil pelo cargo/depto/hierarquia. O cargo precisa COMEÇAR
 * com "CEO" ou "Diretor(a)" para contar como Diretoria — antes bastava a
 * palavra aparecer em qualquer lugar do texto, o que classificava cargos de
 * apoio como "Assistente de Diretoria" ou "Secretária de Diretoria" (que
 * contêm "Diretor" dentro de "Diretoria") como Diretoria por engano, tirando
 * o acesso de Gestor dessas pessoas (ex.: botão "Nova movimentação").
 *
 * `gestoresImediatos` (nomes que aparecem na coluna `gestor` de alguém) é o
 * que diferencia "Gestor" (gerencia pelo menos um colaborador) de
 * "Colaborador" (individual, sem reporte) — antes da Etapa 2.1 esse segundo
 * caso nunca acontecia aqui porque buildAccess() já excluía quem não fosse
 * gestor real; agora buildAccessAvd() também usa esta função e precisa da
 * distinção certa.
 */
export function perfilOf(colaborador: Colaborador, gestoresImediatos: Set<string>): Perfil {
  if (CARGO_DIRETORIA.test(norm(colaborador.cargo))) return "Diretoria";
  if (colaborador.depto === "Recursos Humanos") return "RH";
  if (gestoresImediatos.has(colaborador.nome)) return "Gestor";
  return "Colaborador";
}

/**
 * Contas elegíveis para o acesso "principal" do portal: RH e Diretoria
 * sempre (por cargo/depto, ver perfilOf), e perfil Gestor só para quem de
 * fato aparece como gestor imediato de pelo menos um colaborador (tem
 * reporte direto na coluna `gestor`). Colaborador individual (sem reporte,
 * não-RH, não-Diretoria) não entra nesta lista — ela é pra quem participa do
 * fluxo de aprovação (solicitar/aprovar movimentações da própria equipe),
 * não pra todo mundo. Comportamento idêntico ao de antes da Etapa 2.1 (só a
 * implementação de perfilOf mudou de assinatura); quem precisa de acesso
 * mais amplo (AVD) usa buildAccessAvd() abaixo, uma lista separada.
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
      const perfil = perfilOf(c, gestoresImediatos);
      return perfil === "RH" || perfil === "Diretoria" || perfil === "Gestor";
    })
    .map((c) => ({
      nome: c.nome,
      cargo: c.cargo,
      depto: c.depto,
      email: emailOf(c.nome),
      perfil: perfilOf(c, gestoresImediatos),
    }));
}

/**
 * Lista separada de candidatos ao acesso restrito da Avaliação de
 * Desempenho (perfil "Colaborador") — quem NÃO está em buildAccess() (ou
 * seja, individual, sem reporte, não-RH, não-Diretoria), ativo, e com pelo
 * menos 6 meses completos de empresa até hoje (mesmo patamar da
 * elegibilidade de ciclo, ver elegivelParaCicloAvaliacaoDesempenho() em
 * domain/avaliacaoDesempenho.ts — aqui é só um corte pra decidir quem já é
 * candidato a RECEBER acesso, não uma checagem por ciclo específico).
 * Nunca reaproveitado pela tela "/acessos" (RH/Diretoria/gestor) — ver aba
 * "Acessos AVD" em GestaoDesempenhoPage.tsx.
 */
export function buildAccessAvd(colaboradores: Colaborador[]): Conta[] {
  const gestoresImediatos = new Set(colaboradores.map((c) => c.gestor));
  const hoje = hojeIso();

  return colaboradores
    .filter((c) => !c.desligado)
    .filter((c) => perfilOf(c, gestoresImediatos) === "Colaborador")
    .filter((c) => mesesCompletos(c.admissaoIso, hoje) >= 6)
    .map((c) => ({
      nome: c.nome,
      cargo: c.cargo,
      depto: c.depto,
      email: emailOf(c.nome),
      perfil: "Colaborador" as const,
    }));
}

/**
 * Gestor "do" departamento — usado para preencher automaticamente "Gestor de
 * destino" em Promoção/Transferência e para validar quem pode abrir essas
 * movimentações. Não existe uma coluna própria para isso: o departamento não
 * tem um gestor único cadastrado à parte, então a heurística é pegar o
 * gestor mais frequente entre os colaboradores daquele departamento (o caso
 * comum, um departamento por gestor, sempre resolve sem ambiguidade).
 */
export function gestorDoDepartamento(colaboradores: Colaborador[], depto: string): string | null {
  const contagem = new Map<string, number>();
  colaboradores.forEach((c) => {
    if (c.depto !== depto || !c.gestor) return;
    contagem.set(c.gestor, (contagem.get(c.gestor) || 0) + 1);
  });
  let melhor: string | null = null;
  let melhorCount = 0;
  contagem.forEach((count, gestor) => {
    if (count > melhorCount) {
      melhor = gestor;
      melhorCount = count;
    }
  });
  return melhor;
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

// "\bceo\b" (não "^ceo\b"): o cargo real do CEO é "Diretor Geral - CEO", não
// só "CEO" — um prefixo estrito nunca bateu com ele (bug real, corrigido
// depois de M-2026-004 precisar de um patch manual em
// supabase/corrigir_fluxo_m2026_004.local.sql porque ehCEO() retornava false
// e a etapa "Diretor Industrial" não era pulada). "CEO" como palavra isolada
// em qualquer posição do cargo (prefixo, sufixo, etc.) já basta.
const CARGO_CEO = /\bceo\b/;

/**
 * true só para quem tem "CEO" no cargo (hoje, só o Daniel, cargo "Diretor
 * Geral - CEO") — deliberadamente NÃO usa perfilOf()/"Diretoria", já que esse
 * perfil também cobre o Diretor Industrial (Yuri) e os dois não podem ser
 * tratados igual aqui: só o CEO pula Gestor Solicitante/Diretor Industrial ao
 * solicitar uma movimentação (ver montarEtapas() em workflow.ts). Cargo, não
 * nome — se um dia outra pessoa assumir o cargo de CEO, a regra já vale pra
 * ela automaticamente.
 */
export function ehCEO(colaborador: Colaborador | undefined): boolean {
  return Boolean(colaborador && CARGO_CEO.test(norm(colaborador.cargo)));
}

// "diretor\s*(\(a\))?\s*industrial" tolera o marcador de gênero neutro
// "(a)" que passou a ser usado nos nomes de cargo (ex.: "Diretor (a)
// Industrial") — um "^diretor industrial\b" estrito nunca bateria com isso.
const CARGO_DIRETOR_INDUSTRIAL = /^diretor\s*(\(a\))?\s*industrial\b/;

/**
 * true só para quem tem o cargo "Diretor Industrial" (hoje, só o Yuri) —
 * libera visão total do Workflow e de Movimentações aprovadas (ver
 * canSeeMov() em permissoes.ts), sem depender do perfil "Diretoria" (que
 * também cobre o CEO, que continua vendo só o que precisa aprovar ou
 * solicitou — essa exceção NÃO se estende a ele). Puramente leitura: não
 * altera podeAgir()/aprovarEtapa, então só ganha botão de aprovar/reprovar
 * nas etapas que já eram dele. Cargo, não nome — se um dia outra pessoa
 * assumir o cargo, a regra já vale pra ela automaticamente.
 */
export function ehDiretorIndustrial(colaborador: Colaborador | undefined): boolean {
  return Boolean(colaborador && CARGO_DIRETOR_INDUSTRIAL.test(norm(colaborador.cargo)));
}

// Triagem TEMÁTICA local dos itens do PDI — motor determinístico, SEM rede, SEM IA e SEM custo por chamada.
//
// Papel: agrupar, para LEITURA do RH, ações de PDI que tratam de assuntos relacionados. O agrupamento é apoio à leitura:
//  • NÃO é diagnóstico nem necessidade; NÃO afirma que um tema seja capacitação obrigatória;
//  • NÃO cria, altera ou duplica decisões, necessidades ou ações (a unidade de decisão continua sendo o item/sugestão da Fase 7);
//  • NÃO usa pontuação artificial: cada correspondência traz só uma explicação simples (qual termo, onde).
//
// Regras (versão do catálogo em VERSAO_CATALOGO_TEMAS — qualquer mudança nos termos exige nova versão):
//  1. Cada tema tem expressões FORTES (específicas: "power bi", "oratória", "gestão do tempo") e FRACAS (genéricas: "apresentação",
//     "indicador", "planilha"). Palavra genérica sozinha nunca basta.
//  2. Ação com expressão forte → associada ao(s) tema(s) citado(s), no máximo 2. Mais de 2 temas fortes = ampla demais → revisão.
//  3. Ação só com expressão fraca → associada apenas se a competência/objetivo do item (contexto) confirma o mesmo tema;
//     se o contexto aponta outro tema, o texto é contraditório → revisão; se não há contexto, é ambíguo → revisão.
//  4. Ação sem nenhum termo → herda o tema do contexto SOMENTE se o contexto indica exatamente um tema; senão → revisão.
//  5. Contexto = competência/KPI + objetivo: conta expressão forte em qualquer um; só se nenhuma forte aparecer, vale a fraca no NOME da competência.
//  6. Um item pode aparecer em mais de um tema (cada ação vai para o seu), sempre com a indicação das ações correspondentes.

export const VERSAO_CATALOGO_TEMAS = "temas-v1";

export type TemaId = "comunicacao" | "lideranca" | "qualidade" | "ferramentas" | "analise" | "organizacao" | "outros" | "revisao";

export interface TemaDef {
  id: TemaId;
  rotulo: string;
  descricao: string;
  /** Expressões específicas do tema. `*` no fim = qualquer terminação; `re:` = expressão regular sobre o texto normalizado. */
  fortes: string[];
  /** Expressões genéricas: só valem confirmadas pelo contexto do item. */
  fracos: string[];
  /** Só em "outros": cada subassunto tem as suas expressões e aparece no texto da explicação. */
  subtemas?: { rotulo: string; fortes: string[] }[];
}

export const CATALOGO_TEMAS: TemaDef[] = [
  {
    id: "comunicacao",
    rotulo: "Comunicação e relacionamento",
    descricao: "Expressão oral e escrita, negociação, relacionamento e trabalho com outras pessoas.",
    fortes: [
      "comunica*", "oratoria", "falar em publico", "apresentacao em publico", "apresentacoes em publico", "assertivid*", "escuta ativa",
      "negociacao", "negociacoes", "relacionamento interpessoal", "relacionamentos interpessoais", "interpessoal*", "empatia", "trabalho em equipe",
      "inteligencia emocional", "gestao de conflito*", "resolucao de conflito*", "mediacao de conflito*", "storytelling", "redacao",
      "escrita profissional", "networking", "atendimento ao cliente", "atendimento ao publico", "relacionamento com cliente*", "habilidades sociais",
    ],
    fracos: ["apresentac*", "feedback*", "reuniao", "reunioes", "alinhamento*", "clareza", "colaborac*", "relacionamento*", "dialogo", "escrita", "e mail", "email", "equipe*", "conversa*", "expressao"],
  },
  {
    id: "lideranca",
    rotulo: "Liderança e gestão",
    descricao: "Liderar e desenvolver pessoas, delegar, decidir e conduzir mudanças.",
    fortes: [
      "lideranca", "liderar", "lideres", "liderados", "gestao de pessoas", "gestao de equipe*", "gestao de time*", "gerenciar equipe*", "gerenciamento de equipe*",
      "gerir equipe*", "gestao de mudanca*", "desenvolvimento de equipe*", "desenvolver equipe*", "delegacao", "delegar", "tomada de decisao", "tomada de decisoes",
      "gestao de talentos", "sucessao", "formacao de lideres", "gestao participativa", "visao estrategica", "pensamento estrategico", "planejamento estrategico",
      "gestor de pessoas", "gestao do clima", "engajamento de equipe*", "motivacao de equipe*", "gestao de desempenho", "avaliacao de desempenho",
    ],
    fracos: ["lider", "gestor*", "gestora*", "gestao", "gerenc*", "decisao", "decisoes", "estrateg*", "pessoas", "supervis*", "coordena*", "autonomia", "influencia", "motivac*", "engajamento"],
  },
  {
    id: "qualidade",
    rotulo: "Qualidade e conformidade",
    descricao: "Qualidade, normas, auditorias, procedimentos e melhoria de processos.",
    fortes: [
      "qualidade", "iso", "5s", "conformidade", "nao conformidade*", "compliance", "auditoria*", "auditor*", "procedimento operacional*", "pop", "pops",
      "melhoria continua", "kaizen", "lean", "six sigma", "seis sigma", "pdca", "acao corretiva*", "acoes corretivas", "causa raiz", "analise de causa",
      "gestao da qualidade", "boas praticas de fabricacao", "bpf", "haccp", "appcc", "lgpd", "protecao de dados", "legislacao", "regulament*", "anvisa",
      "norma tecnica", "normas tecnicas", "inspecao", "inspecoes", "controle de qualidade", "garantia da qualidade", "padronizacao", "padronizar",
      "gestao de processos", "mapeamento de processos", "melhoria de processos", "manual da qualidade", "rastreabilidade", "calibracao", "metrologia",
      "fmea", "ishikawa",
    ],
    fracos: ["processo*", "padrao", "padroes", "melhoria*", "norma*", "procedimento*", "regra*", "politica*", "documentacao", "registro*", "checklist", "conferencia"],
  },
  {
    id: "ferramentas",
    rotulo: "Ferramentas digitais",
    descricao: "Sistemas, planilhas, painéis, automação e outras ferramentas de trabalho.",
    fortes: [
      "excel", "power bi", "powerbi", "power query", "power automate", "power apps", "sap", "totvs", "protheus", "erp", "office 365", "microsoft 365",
      "microsoft office", "pacote office", "word", "powerpoint", "power point", "outlook", "sharepoint", "onedrive", "teams", "google workspace", "google sheets",
      "planilhas eletronicas", "python", "sql", "vba", "macro*", "inteligencia artificial", "ia generativa", "chatgpt", "copilot", "gemini",
      "automacao de processos", "rpa", "tableau", "looker", "qlik", "metabase", "ferramentas digitais", "ferramenta digital", "letramento digital",
      "transformacao digital", "tecnologia da informacao", "programacao", "banco de dados", "wms", "crm", "trello", "notion", "jira",
    ],
    fracos: ["planilha*", "ferramenta*", "digital*", "sistema*", "software*", "tecnolog*", "informatica", "computador*", "plataforma*", "aplicativ*", "dados", "automac*", "dashboard*"],
  },
  {
    id: "analise",
    rotulo: "Análise e gestão de resultados",
    descricao: "Indicadores, metas, custos e leitura de dados para acompanhar resultados.",
    fortes: [
      "indicador*", "kpi", "kpis", "okr", "okrs", "analise de dados", "analise de indicadores", "analise de resultados", "analise critica", "analise de desempenho",
      "gestao de resultados", "gestao a vista", "business intelligence", "estatistica*", "controle de custos", "gestao de custos", "orcamento*", "analitic*",
      "data driven", "orientacao a resultado*", "foco em resultado*", "foco em meta*", "gestao de metas", "acompanhamento de metas", "analise financeira",
      "controle de desempenho", "metricas", "metrica",
    ],
    fracos: ["meta", "metas", "resultado*", "relatorio*", "dashboard*", "performance", "desempenho", "custo*", "analis*", "dados", "numeros", "acompanhamento", "controle*", "indice*"],
  },
  {
    id: "organizacao",
    rotulo: "Organização e produtividade",
    descricao: "Planejamento do trabalho, prioridades, prazos, projetos e uso do tempo.",
    fortes: [
      "gestao do tempo", "gerenciamento do tempo", "gerenciar o tempo", "administracao do tempo", "priorizacao", "priorizar", "produtividade", "organizacao pessoal",
      "organizacao do trabalho", "organizacao e planejamento", "autogestao", "eficiencia", "gestao de projetos", "gerenciamento de projetos", "gerenciar projetos",
      "metodologia agil", "metodologias ageis", "scrum", "kanban", "5w2h", "gtd", "pmbok", "planejamento de tarefas", "planejamento semanal", "planejamento diario",
      "gestao de agenda", "organizar a agenda", "multitarefa*", "cumprimento de prazos", "gestao de prazos",
    ],
    fracos: ["organiza*", "planejamento", "planejar", "agenda", "rotina*", "pontualidade", "foco", "prazo*", "cronograma*", "tarefas", "checklist", "disciplina", "demandas", "prioridade*"],
  },
  {
    id: "outros",
    rotulo: "Outros temas",
    descricao: "Assuntos com evidência clara no texto que não pertencem aos temas acima (idiomas, segurança do trabalho, finanças).",
    fortes: [],
    fracos: [],
    subtemas: [
      { rotulo: "Idiomas", fortes: ["ingles", "espanhol", "frances", "idioma*", "lingua estrangeira", "linguas estrangeiras", "toefl", "ielts", "conversacao em"] },
      {
        rotulo: "Segurança do trabalho",
        fortes: ["seguranca do trabalho", "re:\\bnr ?\\d{1,2}\\b", "epi", "epis", "cipa", "ergonomia", "brigada de incendio", "primeiros socorros", "sst", "saude ocupacional", "prevencao de acidentes"],
      },
      { rotulo: "Finanças e contabilidade", fortes: ["financas", "contabil*", "contabilidade", "tributar*", "fiscal", "fluxo de caixa", "balanco patrimonial", "conciliacao"] },
    ],
  },
];

export const TEMA_REVISAO = {
  id: "revisao" as const,
  rotulo: "Revisão individual necessária",
  descricao: "Texto genérico, ambíguo ou contraditório: o sistema não arrisca uma interpretação. O RH lê e decide.",
};

export const ROTULO_TEMA: Record<TemaId, string> = Object.fromEntries([...CATALOGO_TEMAS.map((t) => [t.id, t.rotulo]), [TEMA_REVISAO.id, TEMA_REVISAO.rotulo]]) as Record<TemaId, string>;

export const DESCRICAO_TEMA: Record<TemaId, string> = Object.fromEntries([...CATALOGO_TEMAS.map((t) => [t.id, t.descricao]), [TEMA_REVISAO.id, TEMA_REVISAO.descricao]]) as Record<TemaId, string>;

/** Ordem de exibição dos grupos (a revisão individual vem por último). */
export const ORDEM_TEMAS: TemaId[] = [...CATALOGO_TEMAS.map((t) => t.id), "revisao"];

// ── normalização 1:1 (cada caractere vira exatamente um caractere: os índices valem para o texto original) ──
export function normalizarParaTema(texto: string): string {
  let out = "";
  for (let i = 0; i < texto.length; i++) {
    const base = texto[i].toLowerCase().normalize("NFD")[0] ?? " ";
    out += /[a-z0-9]/.test(base) ? base : " ";
  }
  return out;
}

interface Bloco {
  tema: Exclude<TemaId, "revisao">;
  forca: "forte" | "fraca";
  detalhe?: string;
  re: RegExp;
}

function compilarTermo(termo: string): string {
  if (termo.startsWith("re:")) return termo.slice(3);
  return termo
    .split(" ")
    .map((t) => (t.endsWith("*") ? `${t.slice(0, -1)}[a-z0-9]*` : t))
    .join("\\s+")
    .replace(/^/, "(?<![a-z0-9])")
    .concat("(?![a-z0-9])");
}

const BLOCOS: Bloco[] = CATALOGO_TEMAS.flatMap((t): Bloco[] => {
  const blocos: Bloco[] = [];
  const juntar = (termos: string[]) => new RegExp(termos.map((x) => `(?:${compilarTermo(x)})`).join("|"), "g");
  if (t.fortes.length) blocos.push({ tema: t.id as Bloco["tema"], forca: "forte", re: juntar(t.fortes) });
  if (t.fracos.length) blocos.push({ tema: t.id as Bloco["tema"], forca: "fraca", re: juntar(t.fracos) });
  for (const s of t.subtemas ?? []) blocos.push({ tema: t.id as Bloco["tema"], forca: "forte", detalhe: s.rotulo, re: juntar(s.fortes) });
  return blocos;
});

const IA_MAIUSCULA = /(?<![\p{L}\p{N}])IA(?![\p{L}\p{N}])/u;

interface Achado {
  fragmentos: string[];
  detalhe?: string;
}
interface Achados {
  fortes: Map<Bloco["tema"], Achado>;
  fracos: Map<Bloco["tema"], Achado>;
}

const cacheAchados = new Map<string, Achados>();

function achar(texto: string): Achados {
  const memo = cacheAchados.get(texto);
  if (memo) return memo;
  const norm = normalizarParaTema(texto);
  const fortes = new Map<Bloco["tema"], Achado>();
  const fracos = new Map<Bloco["tema"], Achado>();
  for (const b of BLOCOS) {
    b.re.lastIndex = 0;
    const frag: string[] = [];
    for (let m = b.re.exec(norm); m; m = b.re.exec(norm)) {
      if (m[0].length === 0) {
        b.re.lastIndex++;
        continue;
      }
      const original = texto.slice(m.index, m.index + m[0].length).trim();
      if (original && !frag.some((f) => f.toLowerCase() === original.toLowerCase()) && frag.length < 3) frag.push(original);
    }
    if (frag.length === 0) continue;
    const alvo = b.forca === "forte" ? fortes : fracos;
    const atual = alvo.get(b.tema);
    if (atual) atual.fragmentos.push(...frag.filter((f) => !atual.fragmentos.includes(f)));
    else alvo.set(b.tema, { fragmentos: frag, detalhe: b.detalhe });
  }
  if (IA_MAIUSCULA.test(texto)) {
    const a = fortes.get("ferramentas");
    if (a) {
      if (!a.fragmentos.includes("IA")) a.fragmentos.push("IA");
    } else fortes.set("ferramentas", { fragmentos: ["IA"] });
  }
  const r = { fortes, fracos };
  if (cacheAchados.size > 20000) cacheAchados.clear();
  cacheAchados.set(texto, r);
  return r;
}

export interface Correspondencia {
  tema: Exclude<TemaId, "revisao">;
  /** "acao" = o texto da ação cita o assunto; "contexto" = a ação não cita, mas a competência/objetivo do item trata dele. */
  origem: "acao" | "contexto";
  termos: string[];
  detalhe?: string;
  /** Frase curta que o RH lê para entender por que a ação caiu neste tema. */
  explicacao: string;
  /** Aviso informativo (ex.: o objetivo do item trata de outro assunto). */
  nota?: string;
}

export interface ClassificacaoAcao {
  acaoId: string;
  texto: string;
  /** Vazio quando a ação vai para a revisão individual. */
  temas: Correspondencia[];
  /** Motivo da revisão individual; null quando a ação foi associada a algum tema. */
  revisao: string | null;
}

export interface ItemParaTema {
  competencia: string;
  objetivo: string;
  acoes: { id: string; texto: string }[];
}

const MAX_TEMAS_POR_ACAO = 2;
const citar = (fr: string[]) => fr.map((f) => `“${f}”`).join(", ");
const rot = (t: TemaId) => ROTULO_TEMA[t];

interface Contexto {
  temas: Map<Bloco["tema"], string[]>;
}

function contextoDoItem(competencia: string, objetivo: string): Contexto {
  const temas = new Map<Bloco["tema"], string[]>();
  const somar = (t: Bloco["tema"], f: string[]) => temas.set(t, [...new Set([...(temas.get(t) ?? []), ...f])]);
  const nome = achar(competencia);
  const obj = achar(objetivo);
  for (const [t, a] of nome.fortes) somar(t, a.fragmentos);
  for (const [t, a] of obj.fortes) somar(t, a.fragmentos);
  // Expressão fraca no NOME da competência só serve de desempate quando nada forte apareceu (evita contexto "inflado" por palavra genérica).
  if (temas.size === 0) for (const [t, a] of nome.fracos) somar(t, a.fragmentos);
  return { temas };
}

/** Classifica cada ação do item (a unidade de decisão não muda: isto só diz em que tema a ação é lida). */
export function classificarItem(item: ItemParaTema): ClassificacaoAcao[] {
  const ctx = contextoDoItem(item.competencia, item.objetivo);
  const temasCtx = [...ctx.temas.keys()];
  return item.acoes.map((acao) => {
    const base = { acaoId: acao.id, texto: acao.texto };
    const { fortes, fracos } = achar(acao.texto);
    const temasFortes = [...fortes.keys()];

    if (temasFortes.length > MAX_TEMAS_POR_ACAO) {
      return { ...base, temas: [], revisao: `A ação cita temas demais (${temasFortes.map(rot).join(", ")}) para um agrupamento confiável. Revise individualmente.` };
    }
    if (temasFortes.length > 0) {
      const divergeDe = temasCtx.length === 1 && !temasFortes.includes(temasCtx[0]) ? temasCtx[0] : null;
      return {
        ...base,
        revisao: null,
        temas: temasFortes.map((t): Correspondencia => {
          const a = fortes.get(t) as Achado;
          return {
            tema: t,
            origem: "acao",
            termos: a.fragmentos,
            detalhe: a.detalhe,
            explicacao: `A ação cita ${citar(a.fragmentos)}${a.detalhe ? ` (${a.detalhe})` : ""}.`,
            ...(divergeDe ? { nota: `A competência/objetivo do item trata de ${rot(divergeDe)}, mas esta ação aponta para ${rot(t)}.` } : {}),
          };
        }),
      };
    }

    const temasFracos = [...fracos.keys()];
    if (temasFracos.length > 0) {
      const confirmados = temasFracos.filter((t) => ctx.temas.has(t)).slice(0, MAX_TEMAS_POR_ACAO);
      if (confirmados.length > 0) {
        return {
          ...base,
          revisao: null,
          temas: confirmados.map((t): Correspondencia => {
            const a = fracos.get(t) as Achado;
            return { tema: t, origem: "acao", termos: a.fragmentos, explicacao: `A ação cita ${citar(a.fragmentos)}, e a competência/objetivo do item trata do mesmo assunto.` };
          }),
        };
      }
      const primeiro = fracos.get(temasFracos[0]) as Achado;
      if (temasCtx.length > 0) {
        return {
          ...base,
          temas: [],
          revisao: `A ação sugere ${citar(primeiro.fragmentos)} (${rot(temasFracos[0])}), mas a competência/objetivo trata de ${temasCtx.map(rot).join(" e ")}. O texto é contraditório; revise individualmente.`,
        };
      }
      return { ...base, temas: [], revisao: `A ação só traz o termo genérico ${citar(primeiro.fragmentos)} e o item não indica o assunto. O texto é ambíguo; revise individualmente.` };
    }

    if (temasCtx.length === 1) {
      const t = temasCtx[0];
      return {
        ...base,
        revisao: null,
        temas: [{ tema: t, origem: "contexto", termos: ctx.temas.get(t) as string[], explicacao: `A ação não cita um tema, mas a competência/objetivo do item trata de ${citar(ctx.temas.get(t) as string[])}.` }],
      };
    }
    if (temasCtx.length > 1) {
      return { ...base, temas: [], revisao: `O item cita mais de um assunto (${temasCtx.map(rot).join(", ")}) e a ação não indica qual. Revise individualmente.` };
    }
    return { ...base, temas: [], revisao: "A ação e o objetivo do item são genéricos: não há termos que os liguem a um tema. Revise individualmente." };
  });
}

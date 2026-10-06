// Sugestão de consolidação das candidatas da LNT — só a camada de dados/lógica (sem tela).
// Função PURA: recebe as candidatas (sem decisão) e devolve grupos de necessidades que podem tratar
// do mesmo tema. Nada é consolidado aqui: a decisão final é sempre da RH (ação lnt_item_criar_consolidado).
//
// Como funciona (tudo no navegador, sem serviço externo, sem dados saindo do sistema):
//  1. cada necessidade vira um vetor de termos: palavras significativas (sem acento, sem plural e sem
//     terminações comuns, descartando as genéricas) + "conceitos" de um dicionário controlado que
//     aproxima jeitos diferentes de dizer a mesma coisa ("planilhas" ~ "Excel", "líderes" ~ "liderança");
//  2. a semelhança de cada par combina texto (cosseno com pesos por campo: sugestão de capacitação >
//     descrição > justificativa; palavras amplas pesam pouco) com sinais estruturais fortes (mesma
//     habilidade, mesmo documento/requisito, mesmo grupo da Base). Categoria e cargo só reforçam uma
//     semelhança que já existe. DEPARTAMENTO NÃO ENTRA NA CONTA: áreas diferentes podem formar um grupo;
//  3. os pares fortes viram grupos, e cada necessidade fica em no máximo UM grupo (sem A+B, B+C, A+C).
//     Um grupo só fica de pé se os membros se parecem entre si, não apenas com um vizinho (evita cadeias);
//  4. a pontuação é interna (ordenação e corte). A tela mostra só os motivos em linguagem simples.

import { normalizar } from "./buscaHabilidades";

export interface CandidataParaSugestao {
  necessidade_id: number;
  colaborador_id: number | null;
  descricao: string;
  justificativa: string;
  sugestao_capacitacao: string;
  categoria: string | null;
  cargo_nome: string | null;
  departamento: string | null;
  habilidade_id: number | null;
  lista_mestra_codigo: string | null;
  lista_mestra_revisao: string | null;
  grupo_id: number | null;
}

export type MotivoSugestao = "mesma_habilidade" | "mesmo_documento" | "mesmo_grupo" | "descricoes_parecidas" | "mesmo_tema" | "termos_em_comum";

export interface SugestaoConsolidacao {
  chave: string;
  /** Nome curto do assunto do grupo (conceito em comum, quando há; senão, o título sugerido). */
  tema: string;
  titulo_sugerido: string;
  necessidade_ids: number[];
  /** Colaboradores distintos entre as necessidades do grupo (público identificado). */
  colaboradores: number;
  departamentos: number;
  motivos: MotivoSugestao[];
  /** O que as necessidades têm em comum, em palavras (conceitos ou termos). */
  em_comum: string[];
  /** Uso interno (ordenação). Não é exibido nem decide nada. */
  relevancia: number;
}

// ── Vocabulário ─────────────────────────────────────────────────────────
const PALAVRAS_VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "em", "com", "para", "por", "uma", "uns", "umas", "nos", "nas", "ao", "aos", "que", "como", "mais", "sobre", "entre", "pelo", "pela", "pelos", "pelas",
  "seu", "sua", "seus", "suas", "ser", "ter", "nao", "sem", "ate", "quando", "tambem", "todo", "todos", "toda", "todas", "cada", "muito", "bem", "ainda", "onde", "esta", "este", "isso", "dar", "fazer",
]);

/** Palavras que aparecem em quase toda necessidade e não dizem qual é o tema. Ignoradas. */
const PALAVRAS_GENERICAS = new Set([
  "desenvolver", "desenvolvimento", "melhorar", "melhoria", "melhor", "aprimorar", "aprimoramento", "capacitar", "capacitacao", "treinamento", "treinamentos", "treinar", "curso", "cursos",
  "conhecimento", "conhecimentos", "equipe", "equipes", "area", "areas", "tecnico", "tecnica", "tecnicos", "tecnicas", "geral", "gerais", "basico", "basica", "intermediario", "intermediaria", "avancado",
  "avancada", "nivel", "habilidade", "habilidades", "competencia", "competencias", "necessidade", "necessidades", "colaborador", "colaboradores", "pessoa", "pessoas", "processo", "processos",
  "atividade", "atividades", "rotina", "funcao", "funcoes", "aplicavel", "aplicaveis", "conforme", "relacionado", "relacionados", "foco", "voltado", "realizar", "realizacao", "execucao",
  "executar", "aplicar", "aplicacao", "uso", "utilizacao", "utilizar", "trabalho", "trabalhar", "empresa", "ciclo", "pdi", "avaliacao", "desempenho", "msb", "necessario", "necessaria",
  "importante", "adequado", "adequada", "ajustar", "reforcar", "reforco", "capacidade", "buscar", "obter", "ampliar", "fortalecer", "evoluir", "evolucao", "pratica", "praticas", "dia",
]);

/** Palavras que existem em muitos assuntos diferentes: contam, mas pouco (sozinhas não formam grupo). */
const PALAVRAS_AMPLAS = new Set([
  "comunicacao", "gestao", "qualidade", "relacionamento", "organizacao", "planejamento", "controle", "controles", "analise", "seguranca", "atendimento", "documentacao", "registro", "registros",
  "cliente", "clientes", "produto", "produtos", "servico", "servicos", "procedimento", "procedimentos", "norma", "normas", "regra", "regras", "problema", "problemas", "resultado", "resultados",
  "responsabilidade", "autonomia", "postura", "atitude", "foco",
]);

interface Conceito {
  id: string;
  rotulo: string;
  /** Aplicado ao texto já normalizado (sem acento, minúsculo, palavras separadas por espaço). */
  padrao: RegExp;
}

/**
 * Dicionário controlado de sinônimos: jeitos diferentes de dizer o mesmo tema viram o mesmo "conceito".
 * É uma lista curta e editável de propósito — aqui não há inteligência artificial, só vocabulário.
 */
export const CONCEITOS: Conceito[] = [
  { id: "excel", rotulo: "Excel e planilhas", padrao: /\b(excel|planilhas?|tabelas? dinamicas?|spreadsheets?|google sheets|vba|macros?)\b/ },
  { id: "dados", rotulo: "Análise de dados e BI", padrao: /\b(power ?bi|bi|dashboards?|paineis gerenciais|painel gerencial|analise de dados|analises de dados|kpis?|tableau)\b/ },
  { id: "pop", rotulo: "POPs e procedimentos operacionais", padrao: /\b(pops?|sops?|procedimentos? operacionais?( padrao)?)\b/ },
  { id: "bpf", rotulo: "Boas práticas (BPF, BPL)", padrao: /\b(bpf|bpl|bpd|gmp|boas praticas( de (fabricacao|laboratorio|documentacao|distribuicao))?)\b/ },
  { id: "regulatorio", rotulo: "Regulatório (RDC, Anvisa)", padrao: /\b(rdc|anvisa|regulatori[oa]s?|regulamentacao|regulamentacoes|legislacao sanitaria)\b/ },
  { id: "seguranca", rotulo: "Segurança do trabalho", padrao: /\b(nrs?( ?[0-9]+)?|cipa|epis?|seguranca do trabalho|brigada|incendio|primeiros socorros|ergonomia|acidentes? de trabalho)\b/ },
  { id: "lideranca", rotulo: "Liderança e gestão de pessoas", padrao: /\b(lideranca|liderancas|lider|lideres|liderar|liderados|gestao de pessoas|gestao de equipes?|gerenciamento de equipes?|gerenciar equipes?|gestores?|feedback|coaching)\b/ },
  { id: "ingles", rotulo: "Inglês", padrao: /\b(ingles|english)\b/ },
  { id: "espanhol", rotulo: "Espanhol", padrao: /\b(espanhol|spanish)\b/ },
  { id: "atendimento", rotulo: "Atendimento ao cliente", padrao: /\b(atendimento (ao )?(cliente|clientes|publico)|sac|customer service|pos venda|pos-venda)\b/ },
  { id: "vendas", rotulo: "Vendas", padrao: /\b(vendas?|prospeccao|tecnicas? de vendas?|negociacao comercial)\b/ },
  { id: "metrologia", rotulo: "Metrologia e calibração", padrao: /\b(metrologia|calibracao|calibracoes|calibrar|instrumentos? de medicao)\b/ },
  { id: "validacao", rotulo: "Validação e qualificação", padrao: /\b(validacao de (processos?|metodos?|limpeza|sistemas?)|qualificacao de (equipamentos?|fornecedores?)|iq oq pq)\b/ },
  { id: "auditoria", rotulo: "Auditoria", padrao: /\b(auditoria|auditorias|auditor|auditores|autoinspecao)\b/ },
  { id: "melhoria_continua", rotulo: "Melhoria contínua (5S, Lean)", padrao: /\b(5s|lean|kaizen|melhoria continua|pdca|seis sigma|six sigma|5 porques|ishikawa)\b/ },
  { id: "tempo", rotulo: "Gestão do tempo e prioridades", padrao: /\b(gestao do tempo|gerenciamento do tempo|priorizacao|produtividade)\b/ },
  { id: "integracao", rotulo: "Integração de novos colaboradores", padrao: /\b(integracao|onboarding|ambientacao)\b/ },
  { id: "higiene", rotulo: "Higiene, limpeza e paramentação", padrao: /\b(higiene|limpeza|sanitizacao|antissepsia|paramentacao|assepsia)\b/ },
  { id: "sistemas", rotulo: "Sistemas e ERP", padrao: /\b(erp|sap|protheus|totvs|sistema de gestao)\b/ },
  { id: "fiscal", rotulo: "Rotinas fiscais e contábeis", padrao: /\b(fiscal|fiscais|contabil|contabilidade|tributari[oa]s?|impostos?|nota fiscal|nfe)\b/ },
  { id: "logistica", rotulo: "Estoque e logística", padrao: /\b(estoque|almoxarifado|logistica|expedicao|inventario)\b/ },
  { id: "dp", rotulo: "Rotinas de Departamento Pessoal", padrao: /\b(esocial|folha de pagamento|legislacao trabalhista|clt|ponto eletronico)\b/ },
];

// ── Normalização ────────────────────────────────────────────────────────
const SUFIXOS = [
  "amentos", "imentos", "amento", "imento", "acoes", "ucoes", "icoes", "acao", "ucao", "icao", "adores", "adoras", "ador", "adora", "antes", "ante", "ancia", "encia", "idades", "idade",
  "ismo", "ista", "mente", "avel", "ivel", "ando", "endo", "indo", "ados", "adas", "ado", "ada", "idos", "idas", "ido", "ida", "ar", "er", "ir",
];

/** Radical aproximado: tira plural e terminações comuns ("planilhas"→"planilh…", "elaboração/elaborar"→"elabor"). */
export function radical(palavra: string): string {
  let p = palavra;
  if (p.length > 4) {
    if (p.endsWith("oes") || p.endsWith("aes")) p = `${p.slice(0, -3)}ao`;
    else if (p.endsWith("ais")) p = `${p.slice(0, -3)}al`;
    else if (p.endsWith("eis")) p = `${p.slice(0, -3)}el`;
    else if (p.endsWith("ns")) p = `${p.slice(0, -2)}m`;
    else if (p.endsWith("res") && p.length > 5) p = p.slice(0, -2);
    else if (p.endsWith("s") && !p.endsWith("ss")) p = p.slice(0, -1);
  }
  if (p.length >= 7) {
    for (const suf of SUFIXOS) {
      if (p.endsWith(suf) && p.length - suf.length >= 4) return p.slice(0, -suf.length);
    }
  }
  return p;
}

const RADICAIS_AMPLOS = new Set([...PALAVRAS_AMPLAS].map(radical));
const RADICAIS_GENERICOS = new Set([...PALAVRAS_GENERICAS].map(radical));

const PESO_AMPLA = 0.35;
const PESO_CONCEITO = 2;
const PESO_CAMPO = { descricao: 1, sugestao: 1.3, justificativa: 0.4 } as const;

interface Termos {
  /** radical → palavra como foi escrita (só para exibir o que há em comum) */
  radicais: Map<string, string>;
  conceitos: Set<string>;
}

function extrairTermos(texto: string): Termos {
  const norm = normalizar(texto);
  const radicais = new Map<string, string>();
  for (const palavra of norm.split(" ")) {
    if (palavra.length < 3 || PALAVRAS_VAZIAS.has(palavra) || PALAVRAS_GENERICAS.has(palavra) || /^[0-9]+$/.test(palavra)) continue;
    const r = radical(palavra);
    if (RADICAIS_GENERICOS.has(r)) continue;
    if (!radicais.has(r)) radicais.set(r, palavra);
  }
  const conceitos = new Set<string>();
  for (const c of CONCEITOS) if (c.padrao.test(norm)) conceitos.add(c.id);
  return { radicais, conceitos };
}

const chaveConceito = (id: string) => `@${id}`;
const ehConceito = (chave: string) => chave.startsWith("@");

// ── Perfil de cada necessidade ──────────────────────────────────────────
type Vetor = Map<string, number>;

interface Perfil {
  c: CandidataParaSugestao;
  vetor: Vetor;
  vDescricao: Vetor;
  vSugestao: Vetor;
  conceitos: Set<string>;
  palavras: Map<string, string>;
}

function somar(destino: Vetor, termos: Termos, pesoCampo: number, comConceitos = true): void {
  for (const r of termos.radicais.keys()) {
    const peso = (RADICAIS_AMPLOS.has(r) ? PESO_AMPLA : 1) * pesoCampo;
    destino.set(r, (destino.get(r) ?? 0) + peso);
  }
  if (!comConceitos) return;
  for (const id of termos.conceitos) destino.set(chaveConceito(id), (destino.get(chaveConceito(id)) ?? 0) + PESO_CONCEITO * pesoCampo);
}

function montarPerfil(c: CandidataParaSugestao): Perfil {
  const tDescricao = extrairTermos(c.descricao);
  const tSugestao = extrairTermos(c.sugestao_capacitacao);
  const tJustificativa = extrairTermos(c.justificativa);
  const vetor: Vetor = new Map();
  somar(vetor, tDescricao, PESO_CAMPO.descricao);
  somar(vetor, tSugestao, PESO_CAMPO.sugestao);
  somar(vetor, tJustificativa, PESO_CAMPO.justificativa);
  const vDescricao: Vetor = new Map();
  somar(vDescricao, tDescricao, 1, false); // só palavras: serve para dizer se as descrições são parecidas
  const vSugestao: Vetor = new Map();
  somar(vSugestao, tSugestao, 1, false);
  const palavras = new Map<string, string>();
  for (const t of [tDescricao, tSugestao, tJustificativa]) for (const [r, p] of t.radicais) if (!palavras.has(r)) palavras.set(r, p);
  return { c, vetor, vDescricao, vSugestao, conceitos: new Set([...tDescricao.conceitos, ...tSugestao.conceitos, ...tJustificativa.conceitos]), palavras };
}

function norma(v: Vetor): number {
  let s = 0;
  for (const x of v.values()) s += x * x;
  return Math.sqrt(s);
}

function cosseno(a: Vetor, b: Vetor): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [menor, maior] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, x] of menor) {
    const y = maior.get(k);
    if (y) dot += x * y;
  }
  return dot === 0 ? 0 : dot / (norma(a) * norma(b));
}

/** Termos em comum que não são só palavras amplas. Um conceito do dicionário em comum já vale por dois termos. */
function compartilhadosEspecificos(a: Vetor, b: Vetor): number {
  let n = 0;
  for (const k of a.keys()) {
    if (!b.has(k)) continue;
    if (ehConceito(k)) n += 2;
    else if (!RADICAIS_AMPLOS.has(k)) n += 1;
  }
  return n;
}

// ── Semelhança entre duas necessidades ──────────────────────────────────
const SINAL_ESTRUTURAL = 0.85;
const LIMIAR_LIGACAO = 0.5;
const LIMIAR_COESAO = 0.5;
/** Com poucos termos (textos curtos), uma única palavra em comum só vale se os textos forem quase iguais. */
const TEXTO_CURTO_IGUAL = 0.8;

function temEstrutural(a: CandidataParaSugestao, b: CandidataParaSugestao): { habilidade: boolean; documento: boolean; grupo: boolean } {
  return {
    habilidade: a.habilidade_id != null && a.habilidade_id === b.habilidade_id,
    documento: Boolean(a.lista_mestra_codigo) && a.lista_mestra_codigo === b.lista_mestra_codigo && (a.lista_mestra_revisao ?? "") === (b.lista_mestra_revisao ?? ""),
    grupo: a.grupo_id != null && a.grupo_id === b.grupo_id,
  };
}

function semelhanca(a: Perfil, b: Perfil, ajustar: (v: Vetor) => Vetor): number {
  const va = ajustar(a.vetor);
  const vb = ajustar(b.vetor);
  const e = temEstrutural(a.c, b.c);
  const estrutural = e.habilidade || e.documento || e.grupo ? SINAL_ESTRUTURAL : 0;
  let texto = cosseno(va, vb);
  // uma palavra genérica compartilhada não basta: exige 2 termos específicos, ou textos praticamente iguais
  if (texto < TEXTO_CURTO_IGUAL && compartilhadosEspecificos(va, vb) < 2) texto = 0;
  let s = 1 - (1 - texto) * (1 - estrutural);
  if (s >= 0.4) {
    // categoria e cargo só reforçam uma semelhança que já existe; sozinhos valem zero
    if (a.c.categoria && a.c.categoria === b.c.categoria) s += 0.05;
    if (a.c.cargo_nome && a.c.cargo_nome === b.c.cargo_nome) s += 0.03;
  }
  return Math.min(1, s);
}

// ── Agrupamento ─────────────────────────────────────────────────────────
interface Aresta {
  a: number;
  b: number;
  s: number;
}

/** Peso de cada termo no conjunto: termos presentes em boa parte da base valem metade (não distinguem). */
function ajustador(perfis: Perfil[]): (v: Vetor) => Vetor {
  const n = perfis.length;
  if (n < 8) return (v) => v;
  const df = new Map<string, number>();
  for (const p of perfis) for (const k of p.vetor.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const comuns = new Set<string>();
  for (const [k, d] of df) if (!ehConceito(k) && d / n > 0.3) comuns.add(k);
  if (comuns.size === 0) return (v) => v;
  const cache = new WeakMap<Vetor, Vetor>();
  return (v) => {
    let r = cache.get(v);
    if (!r) {
      r = new Map();
      for (const [k, x] of v) r.set(k, comuns.has(k) ? x * 0.5 : x);
      cache.set(v, r);
    }
    return r;
  };
}

const LIMITE_POSTING = 200;

function arestasFortes(perfis: Perfil[], pontuar: (i: number, j: number) => number): Aresta[] {
  // índice invertido: só compara pares que dividem algum termo específico ou sinal estrutural
  const indice = new Map<string, number[]>();
  const empilhar = (chave: string, i: number) => {
    const l = indice.get(chave);
    if (l) l.push(i);
    else indice.set(chave, [i]);
  };
  perfis.forEach((p, i) => {
    for (const k of p.vetor.keys()) if (ehConceito(k) || !RADICAIS_AMPLOS.has(k)) empilhar(`t:${k}`, i);
    if (p.c.habilidade_id != null) empilhar(`h:${p.c.habilidade_id}`, i);
    if (p.c.lista_mestra_codigo) empilhar(`d:${p.c.lista_mestra_codigo}|${p.c.lista_mestra_revisao ?? ""}`, i);
    if (p.c.grupo_id != null) empilhar(`g:${p.c.grupo_id}`, i);
  });
  const vistos = new Set<number>();
  const out: Aresta[] = [];
  for (const [chave, lista] of indice) {
    if (lista.length < 2) continue;
    if (chave.startsWith("t:") && lista.length > LIMITE_POSTING) continue; // termo em excesso de textos: não distingue
    for (let x = 0; x < lista.length; x++) {
      for (let y = x + 1; y < lista.length; y++) {
        const a = lista[x];
        const b = lista[y];
        const k = a * perfis.length + b;
        if (vistos.has(k)) continue;
        vistos.add(k);
        const s = pontuar(a, b);
        if (s >= LIMIAR_LIGACAO) out.push({ a, b, s });
      }
    }
  }
  return out;
}

function formarGrupos(ids: number[], arestas: Aresta[], pontuar: (i: number, j: number) => number): number[][] {
  const noConjunto = new Set(ids);
  const pai = new Map<number, number>(ids.map((i) => [i, i]));
  const raiz = (i: number): number => {
    let r = i;
    while (pai.get(r) !== r) r = pai.get(r)!;
    pai.set(i, r);
    return r;
  };
  for (const e of arestas) if (noConjunto.has(e.a) && noConjunto.has(e.b)) pai.set(raiz(e.a), raiz(e.b));
  const componentes = new Map<number, number[]>();
  for (const i of ids) componentes.set(raiz(i), [...(componentes.get(raiz(i)) ?? []), i]);

  const grupos: number[][] = [];
  const sobras: number[] = [];
  for (const membros0 of componentes.values()) {
    if (membros0.length < 2) {
      sobras.push(...membros0);
      continue;
    }
    // um grupo só vale se os membros se parecem entre si, não só com um vizinho (evita cadeias A~B, B~C)
    const membros = [...membros0];
    while (membros.length > 2) {
      let pior = -1;
      let menor = Infinity;
      for (const i of membros) {
        const media = membros.filter((j) => j !== i).reduce((acc, j) => acc + pontuar(i, j), 0) / (membros.length - 1);
        if (media < menor) {
          menor = media;
          pior = i;
        }
      }
      if (menor >= LIMIAR_COESAO) break;
      membros.splice(membros.indexOf(pior), 1);
      sobras.push(pior);
    }
    if (membros.length === 2 && pontuar(membros[0], membros[1]) < LIMIAR_LIGACAO) sobras.push(...membros);
    else grupos.push(membros);
  }
  // quem foi afastado pode formar outro grupo entre si
  if (sobras.length >= 2 && sobras.length < ids.length) grupos.push(...formarGrupos(sobras, arestas, pontuar));
  return grupos;
}

// ── Explicação do grupo ─────────────────────────────────────────────────
function cortar(texto: string, max: number): string {
  const t = texto.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return `${corte.slice(0, ultimoEspaco > max * 0.6 ? ultimoEspaco : max).trimEnd()}…`;
}

function descreverGrupo(membros: number[], perfis: Perfil[], pontuar: (i: number, j: number) => number): SugestaoConsolidacao {
  const ps = membros.map((i) => perfis[i]);
  const pares: [Perfil, Perfil][] = [];
  for (let x = 0; x < ps.length; x++) for (let y = x + 1; y < ps.length; y++) pares.push([ps[x], ps[y]]);

  // quem melhor representa o grupo: maior semelhança média com os demais
  let central = membros[0];
  let melhor = -1;
  for (const i of membros) {
    const media = membros.filter((j) => j !== i).reduce((acc, j) => acc + pontuar(i, j), 0) / Math.max(1, membros.length - 1);
    if (media > melhor) {
      melhor = media;
      central = i;
    }
  }
  const pc = perfis[central].c;
  const titulo = cortar(pc.sugestao_capacitacao.trim() || pc.descricao, 120);

  // motivos, na linguagem do RH
  const motivos: MotivoSugestao[] = [];
  const repetidoEntre = (chave: (c: CandidataParaSugestao) => string | null) => {
    const contagem = new Map<string, number>();
    for (const p of ps) {
      const k = chave(p.c);
      if (k) contagem.set(k, (contagem.get(k) ?? 0) + 1);
    }
    return [...contagem.values()].some((n) => n >= 2);
  };
  if (repetidoEntre((c) => (c.habilidade_id != null ? String(c.habilidade_id) : null))) motivos.push("mesma_habilidade");
  if (repetidoEntre((c) => (c.lista_mestra_codigo ? `${c.lista_mestra_codigo}|${c.lista_mestra_revisao ?? ""}` : null))) motivos.push("mesmo_documento");
  if (repetidoEntre((c) => (c.grupo_id != null ? String(c.grupo_id) : null))) motivos.push("mesmo_grupo");

  const mediaDescricoes = pares.reduce((acc, [a, b]) => acc + cosseno(a.vDescricao, b.vDescricao), 0) / pares.length;
  const contagemConceitos = new Map<string, number>();
  for (const p of ps) for (const id of p.conceitos) contagemConceitos.set(id, (contagemConceitos.get(id) ?? 0) + 1);
  const conceitosComuns = [...contagemConceitos].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  const sugestoesParecidas = pares.some(([a, b]) => a.vSugestao.size > 0 && b.vSugestao.size > 0 && cosseno(a.vSugestao, b.vSugestao) >= 0.5);
  if (mediaDescricoes >= 0.5) motivos.push("descricoes_parecidas");
  if (conceitosComuns.length > 0 || sugestoesParecidas) motivos.push("mesmo_tema");
  if (motivos.length === 0) motivos.push("termos_em_comum");

  // em comum: o conceito que cobre mais necessidades; senão, as palavras específicas repetidas
  const tema = conceitosComuns.length > 0 && conceitosComuns[0][1] / ps.length >= 0.6 ? (CONCEITOS.find((c) => c.id === conceitosComuns[0][0])?.rotulo ?? titulo) : titulo;
  let emComum = conceitosComuns.slice(0, 2).map(([id]) => CONCEITOS.find((c) => c.id === id)!.rotulo);
  if (emComum.length === 0) {
    const contagem = new Map<string, { n: number; palavra: string }>();
    for (const p of ps) for (const [r, palavra] of p.palavras) if (!RADICAIS_AMPLOS.has(r)) contagem.set(r, { n: (contagem.get(r)?.n ?? 0) + 1, palavra });
    emComum = [...contagem.values()]
      .filter((x) => x.n >= 2)
      .sort((a, b) => b.n - a.n || a.palavra.localeCompare(b.palavra))
      .slice(0, 4)
      .map((x) => x.palavra);
  }

  const ids = membros.map((i) => perfis[i].c.necessidade_id).sort((a, b) => a - b);
  let somaPares = 0;
  for (let x = 0; x < membros.length; x++) for (let y = x + 1; y < membros.length; y++) somaPares += pontuar(membros[x], membros[y]);
  const relevancia = somaPares / pares.length;
  return {
    chave: `grupo:${ids.join("-")}`,
    tema,
    titulo_sugerido: titulo,
    necessidade_ids: ids,
    colaboradores: new Set(ps.map((p) => p.c.colaborador_id).filter((c): c is number => c != null)).size,
    departamentos: new Set(ps.map((p) => p.c.departamento).filter((d): d is string => Boolean(d))).size,
    motivos,
    em_comum: emComum,
    relevancia,
  };
}

/**
 * Grupos de 2 ou mais candidatas que podem tratar do mesmo tema, os maiores e mais coesos primeiro.
 * Cada necessidade aparece em no máximo um grupo; necessidades sem correspondência forte ficam de fora.
 */
export function sugerirConsolidacoes(candidatas: CandidataParaSugestao[]): SugestaoConsolidacao[] {
  if (candidatas.length < 2) return [];
  const perfis = candidatas.map(montarPerfil);
  const ajustar = ajustador(perfis);
  const memo = new Map<number, number>();
  const pontuar = (i: number, j: number): number => {
    const [a, b] = i < j ? [i, j] : [j, i];
    const k = a * perfis.length + b;
    let s = memo.get(k);
    if (s === undefined) {
      s = semelhanca(perfis[a], perfis[b], ajustar);
      memo.set(k, s);
    }
    return s;
  };
  const arestas = arestasFortes(perfis, pontuar);
  if (arestas.length === 0) return [];
  const ids = [...new Set(arestas.flatMap((e) => [e.a, e.b]))].sort((a, b) => a - b);
  return formarGrupos(ids, arestas, pontuar)
    .filter((g) => g.length >= 2)
    .map((g) => descreverGrupo(g.sort((a, b) => a - b), perfis, pontuar))
    .sort((a, b) => b.necessidade_ids.length - a.necessidade_ids.length || Math.round(b.relevancia * 100) - Math.round(a.relevancia * 100) || a.necessidade_ids[0] - b.necessidade_ids[0]);
}

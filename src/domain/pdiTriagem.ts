// Triagem das ações de PDI pelo RH ("Sugestões a partir do PDI") — regras PURAS, usadas pelo
// servidor (api/_lib/pdiTriagemAcoes.ts) e pela tela.
//
// A unidade de triagem é o ITEM do PDI (competência/KPI + objetivo + 1..N ações). A ação é evidência
// de origem, não é a necessidade. Decisões formais, todas fora do PDI (o PDI nunca é alterado):
//  • confirmar → vira UMA Necessidade de Desenvolvimento na Base (origem PDI);
//  • manter somente no PDI → continua válido no PDI, sai da fila e não entra na Base;
//  • separar ações → o item sustenta mais de uma necessidade (ou parte só mantida no PDI).

/** Texto gravado quando o RH mantém no PDI sem escrever observação (o banco exige um texto não vazio). */
export const MOTIVO_PADRAO_MANTER_NO_PDI = "Mantida somente no PDI (sem observação).";

/** Versão da regra local de sugestão (vai para peopleflow_dev_pdi_interpretacoes.versao_regra). */
export const VERSAO_REGRA_LOCAL = "pdi-item-v1";

const LIMITE_TEXTO = 500;

/** Só espaços/tabs/quebras repetidos viram um espaço e as pontas são aparadas — IDÊNTICA a
 * public.peopleflow_dev_pdi_norm_texto (Fase 7), de propósito restrita a ASCII. */
export function normalizarTextoPdi(texto: string): string {
  return (texto ?? "").replace(/[ \t\r\n]+/g, " ").trim();
}

export function acaoEmAberto(status: string, descricao: string): boolean {
  return status !== "Concluída" && status !== "Cancelada" && descricao.trim() !== "";
}

export interface AcaoOrdenavel {
  id: string;
  ordem: number;
}

/** Ação PRINCIPAL = a de menor `ordem` (empate: menor id). É a que a Base guarda em necessidades.pdi_acao_id. */
export function escolherAcaoPrincipal<T extends AcaoOrdenavel>(acoes: T[]): T {
  if (acoes.length === 0) throw new Error("Sem ações para escolher a principal.");
  return [...acoes].sort((a, b) => a.ordem - b.ordem || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

/** Corta em palavra inteira, sem passar do limite. */
export function cortarTexto(texto: string, max = LIMITE_TEXTO): string {
  const t = normalizarTextoPdi(texto);
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return `${corte.slice(0, ultimoEspaco > max * 0.6 ? ultimoEspaco : max - 1).trimEnd()}…`;
}

/** O objetivo padrão do sistema ("Desenvolver a competência de X.") não diz nada além do nome da competência. */
export function objetivoEhGenerico(objetivo: string): boolean {
  const o = normalizarTextoPdi(objetivo);
  if (o.length < 25) return true;
  return /^desenvolver (a|o) (compet[eê]ncia|kpi|indicador) (de|do|da)\b[^.;:]{0,120}\.?$/i.test(o);
}

/** Texto neutro gravado quando a regra local NÃO consegue sintetizar uma necessidade com segurança. Não é uma necessidade válida:
 * a tela mostra "Necessidade a definir" e o servidor recusa (422) confirmar este texto. */
export const TEXTO_A_DEFINIR_PELO_RH = "A definir pelo RH";

/** O texto é o neutro "a definir" (ignora caixa, espaços repetidos e ponto final)? */
export function ehTextoADefinir(texto: string | null | undefined): boolean {
  return normalizarTextoPdi(texto ?? "").replace(/[.\s]+$/, "").toLowerCase() === TEXTO_A_DEFINIR_PELO_RH.toLowerCase();
}

export type BaseDaSugestao = "objetivo" | "a_definir";

export interface EntradaSugestaoLocal {
  objetivo: string;
}

export interface SugestaoLocal {
  texto: string;
  /** "objetivo" = o objetivo do PDI diz claramente o que desenvolver; "a_definir" = sem síntese segura (o RH descreve a necessidade). */
  base: BaseDaSugestao;
}

/**
 * Regra local pdi-item-v1 — determinística e conservadora; é só apoio, o RH edita antes de confirmar.
 *  1. objetivo específico → usa o objetivo, sem mudar uma palavra;
 *  2. objetivo genérico ou vazio → NÃO tenta sintetizar: devolve o texto neutro "A definir pelo RH".
 *     As ações do PDI nunca são coladas como se fossem a necessidade (AÇÃO DO PDI ≠ NECESSIDADE);
 *  3. nunca inventa competência, requisito, treinamento nem causa.
 */
export function sugerirNecessidadeLocal(e: EntradaSugestaoLocal): SugestaoLocal {
  if (!objetivoEhGenerico(e.objetivo)) return { texto: cortarTexto(e.objetivo), base: "objetivo" };
  return { texto: TEXTO_A_DEFINIR_PELO_RH, base: "a_definir" };
}

/** Categoria sugerida só pelo TIPO do item do PDI (comportamental → comportamental); KPI fica para o RH escolher. */
export function categoriaSugeridaPeloTipo(tipoCompetencia: string): "comportamental" | null {
  return tipoCompetencia === "Comportamental" ? "comportamental" : null;
}

/** Justificativa padrão da necessidade criada pela triagem (a mesma da tela anterior). */
export function justificativaPadraoPdi(ciclo: string, tipoCompetencia: string, competenciaNome: string, objetivo: string): string {
  return `PDI ${ciclo} — ${tipoCompetencia === "Tecnica" ? "KPI" : "competência"} "${competenciaNome}"${objetivo ? `: ${objetivo}` : ""}`.slice(0, 2000);
}

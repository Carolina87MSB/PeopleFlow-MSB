// Acesso a dados da LNT (Fase 6 — núcleo): tipos, leituras e chamadas às ações do servidor.
// Carregado só pelo módulo Desenvolvimento (chunk lazy). As LEITURAS vão direto ao
// Supabase sob a RLS da Fase 6 (RH vê tudo; Gestor vê só o que é da própria equipe);
// as GRAVAÇÕES passam sempre por api/desenvolvimento.ts (só RH). Não há tela ainda.

import { supabase } from "../../lib/supabaseClient";
import {
  calcularIndicadores,
  type DecisaoNecessidade,
  type Direcionador,
  type IndicadoresCiclo,
  type OrigemItem,
  type SituacaoItem,
  type StatusCiclo,
  type MudancaObservada,
  type PrioridadeLnt,
} from "../../domain/lnt";
import { gravar, type CategoriaNecessidade, type Necessidade } from "./devRepository";
import type { CandidataParaSugestao } from "./lntSugestoes";

export type { DecisaoNecessidade, Direcionador, IndicadoresCiclo, OrigemItem, SituacaoItem, StatusCiclo, PrioridadeLnt, MudancaObservada };
export { DIRECIONADORES } from "../../domain/lnt";

// ── Tipos das tabelas ───────────────────────────────────────────────────
export interface CicloLnt {
  id: number;
  ano_planejamento: number;
  ano_levantamento: number;
  titulo: string;
  status: StatusCiclo;
  data_corte: string;
  observacao: string;
  reaberturas: number;
  fechada_em: string | null;
  fechada_por: string | null;
  fechamento_resumo: (IndicadoresCiclo & { sugeridas_aguardando_validacao?: number; data_corte?: string }) | null;
  ultima_reabertura_em: string | null;
  ultima_reabertura_por: string | null;
  ultima_reabertura_motivo: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemLnt {
  id: number;
  ciclo_id: number;
  titulo: string;
  descricao: string;
  justificativa: string;
  categoria: CategoriaNecessidade | null;
  origem_item: OrigemItem;
  situacao: SituacaoItem;
  prioridade: PrioridadeLnt | null;
  direcionadores: Direcionador[];
  justificativa_prioridade: string;
  publico_estimado: number | null;
  publico_descricao: string;
  motivo_decisao: string;
  decidido_em: string | null;
  decidido_por: string | null;
  created_at: string;
  updated_at: string;
}

/** Linha de peopleflow_dev_lnt_necessidades: decisão + fotografia imutável da carga. */
export interface NecessidadeNoCiclo {
  id: number;
  ciclo_id: number;
  necessidade_id: number;
  decisao: DecisaoNecessidade;
  item_id: number | null;
  motivo: string;
  decidido_em: string | null;
  decidido_por: string | null;
  carregada_em: string;
  status_na_carga: "validada" | "planejada";
  validada_em_na_carga: string | null;
  prioridade_na_carga: PrioridadeLnt | null;
  departamento_na_carga: string | null;
  alerta_treinamento_id: number | null;
  descricao_na_carga: string;
  justificativa_na_carga: string;
  sugestao_capacitacao_na_carga: string;
  mudou_desde_carga_em: string | null;
  mudanca_observada: MudancaObservada | null;
}

/** Necessidade viva (a da Base), só leitura — pode ter mudado depois da fotografia. */
export type NecessidadeViva = Pick<
  Necessidade,
  "id" | "colaborador_id" | "cargo_nome" | "origem" | "status" | "prioridade" | "departamento" | "categoria" | "descricao" | "justificativa" | "sugestao_capacitacao" | "validada_em"
>;

export interface NecessidadeNoCicloComViva extends NecessidadeNoCiclo {
  viva: NecessidadeViva | null;
}

export interface FiltroNecessidadesDoCiclo {
  decisoes?: DecisaoNecessidade[];
  somenteQueMudaram?: boolean;
  somenteComAlerta?: boolean;
}

// ── Leituras (RLS) ──────────────────────────────────────────────────────
function falha(contexto: string, message: string): never {
  throw new Error(`${contexto}: ${message}`);
}

async function lerTudo<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, contexto: string): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) falha(contexto, error.message);
    const linhas = (data ?? []) as T[];
    out.push(...linhas);
    if (linhas.length < 1000) return out;
  }
}

function emLotes<T>(itens: T[], tamanho = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) out.push(itens.slice(i, i + tamanho));
  return out;
}

const COLUNAS_VIVA = "id, colaborador_id, cargo_nome, origem, status, prioridade, departamento, categoria, descricao, justificativa, sugestao_capacitacao, validada_em";

export async function listarCiclos(): Promise<CicloLnt[]> {
  const { data, error } = await supabase.from("peopleflow_dev_lnt_ciclos").select("*").order("ano_planejamento", { ascending: false });
  if (error) falha("Ciclos da LNT", error.message);
  return (data ?? []) as CicloLnt[];
}

export async function obterCiclo(id: number): Promise<CicloLnt | null> {
  const { data, error } = await supabase.from("peopleflow_dev_lnt_ciclos").select("*").eq("id", id).maybeSingle();
  if (error) falha("Ciclo da LNT", error.message);
  return (data as CicloLnt | null) ?? null;
}

export async function listarItensDoCiclo(cicloId: number): Promise<ItemLnt[]> {
  return lerTudo<ItemLnt>((de, ate) => supabase.from("peopleflow_dev_lnt_itens").select("*").eq("ciclo_id", cicloId).order("id").range(de, ate), "Itens da LNT");
}

async function vivasPorId(ids: number[]): Promise<Map<number, NecessidadeViva>> {
  const m = new Map<number, NecessidadeViva>();
  for (const lote of emLotes([...new Set(ids)])) {
    const { data, error } = await supabase.from("peopleflow_dev_necessidades").select(COLUNAS_VIVA).in("id", lote);
    if (error) falha("Necessidades de Desenvolvimento", error.message);
    for (const n of (data ?? []) as NecessidadeViva[]) m.set(n.id, n);
  }
  return m;
}

async function comViva(linhas: NecessidadeNoCiclo[]): Promise<NecessidadeNoCicloComViva[]> {
  const vivas = await vivasPorId(linhas.map((l) => l.necessidade_id));
  return linhas.map((l) => ({ ...l, viva: vivas.get(l.necessidade_id) ?? null }));
}

/** Necessidades do ciclo (fotografia + decisão + necessidade viva). Todas de uma vez: um ciclo tem poucas centenas. */
export async function listarNecessidadesDoCiclo(cicloId: number, filtro: FiltroNecessidadesDoCiclo = {}): Promise<NecessidadeNoCicloComViva[]> {
  let linhas = await lerTudo<NecessidadeNoCiclo>(
    (de, ate) => supabase.from("peopleflow_dev_lnt_necessidades").select("*").eq("ciclo_id", cicloId).order("id").range(de, ate),
    "Necessidades do ciclo",
  );
  if (filtro.decisoes) linhas = linhas.filter((l) => filtro.decisoes!.includes(l.decisao));
  if (filtro.somenteQueMudaram) linhas = linhas.filter((l) => l.mudou_desde_carga_em != null);
  if (filtro.somenteComAlerta) linhas = linhas.filter((l) => l.alerta_treinamento_id != null);
  return comViva(linhas);
}

/** Necessidades cuja versão viva mudou depois da fotografia (marcação feita pelo servidor em "Atualizar candidatas"). */
export function necessidadesQueMudaram(cicloId: number): Promise<NecessidadeNoCicloComViva[]> {
  return listarNecessidadesDoCiclo(cicloId, { somenteQueMudaram: true });
}

/** Item com as necessidades de origem (fotografia + necessidade viva). */
export async function obterItemComNecessidades(itemId: number): Promise<{ item: ItemLnt; necessidades: NecessidadeNoCicloComViva[] } | null> {
  const { data, error } = await supabase.from("peopleflow_dev_lnt_itens").select("*").eq("id", itemId).maybeSingle();
  if (error) falha("Item da LNT", error.message);
  if (!data) return null;
  const linhas = await lerTudo<NecessidadeNoCiclo>(
    (de, ate) => supabase.from("peopleflow_dev_lnt_necessidades").select("*").eq("item_id", itemId).order("id").range(de, ate),
    "Necessidades do item",
  );
  return { item: data as ItemLnt, necessidades: await comViva(linhas) };
}

/** Indicadores do ciclo (mesma função usada pelo servidor no fechamento). Para o Gestor, valem para o que a RLS deixa ele ver. */
export async function indicadoresDoCiclo(cicloId: number): Promise<IndicadoresCiclo> {
  const [itens, linhas] = await Promise.all([listarItensDoCiclo(cicloId), listarNecessidadesDoCiclo(cicloId)]);
  return calcularIndicadores(
    itens,
    linhas.map((l) => ({
      decisao: l.decisao,
      item_id: l.item_id,
      departamento_na_carga: l.departamento_na_carga,
      colaborador_id: l.viva?.colaborador_id ?? null,
      alerta_treinamento_id: l.alerta_treinamento_id,
      mudou_desde_carga_em: l.mudou_desde_carga_em,
    })),
  );
}

/** Dados das candidatas (sem decisão) para a sugestão de consolidação — ver lntSugestoes.ts. Nada é consolidado aqui. */
export async function candidatasParaSugestao(cicloId: number): Promise<CandidataParaSugestao[]> {
  const linhas = await listarNecessidadesDoCiclo(cicloId, { decisoes: ["candidata"] });
  const ids = linhas.map((l) => l.necessidade_id);
  const extras = new Map<number, { habilidade_id: number | null; lista_mestra_codigo: string | null; lista_mestra_revisao: string | null; grupo_id: number | null }>();
  for (const lote of emLotes(ids)) {
    const { data, error } = await supabase.from("peopleflow_dev_necessidades").select("id, habilidade_id, lista_mestra_codigo, lista_mestra_revisao, grupo_id").in("id", lote);
    if (error) falha("Necessidades de Desenvolvimento", error.message);
    for (const n of (data ?? []) as { id: number; habilidade_id: number | null; lista_mestra_codigo: string | null; lista_mestra_revisao: string | null; grupo_id: number | null }[]) extras.set(n.id, n);
  }
  return linhas.map((l) => {
    const e = extras.get(l.necessidade_id);
    return {
      necessidade_id: l.necessidade_id,
      colaborador_id: l.viva?.colaborador_id ?? null,
      // o que a LNT analisou: a fotografia, não o texto vivo
      descricao: l.descricao_na_carga,
      justificativa: l.justificativa_na_carga,
      sugestao_capacitacao: l.sugestao_capacitacao_na_carga,
      categoria: l.viva?.categoria ?? null,
      cargo_nome: l.viva?.cargo_nome ?? null,
      departamento: l.departamento_na_carga,
      habilidade_id: e?.habilidade_id ?? null,
      lista_mestra_codigo: e?.lista_mestra_codigo ?? null,
      lista_mestra_revisao: e?.lista_mestra_revisao ?? null,
      grupo_id: e?.grupo_id ?? null,
    };
  });
}

/** Necessidades ainda "sugeridas" (aguardando validação do RH) — informação do fechamento, nunca entra na LNT. */
export async function contarSugeridasAguardando(): Promise<number> {
  const { count, error } = await supabase.from("peopleflow_dev_necessidades").select("id", { count: "exact", head: true }).eq("status", "sugerida");
  if (error) falha("Necessidades sugeridas", error.message);
  return count ?? 0;
}

export interface EventoLnt {
  id: number;
  ts: string;
  acao: string;
  colaborador_id: number | null;
  detalhe: Record<string, unknown>;
}

/** Eventos da LNT de um item ou ciclo, do mais recente para o mais antigo. A auditoria só é legível pelo RH (RLS): para os demais perfis volta vazio. */
export async function eventosDaLnt(entidade: "ciclo" | "item", id: number): Promise<EventoLnt[]> {
  const tabela = entidade === "ciclo" ? "peopleflow_dev_lnt_ciclos" : "peopleflow_dev_lnt_itens";
  const { data, error } = await supabase.from("peopleflow_dev_auditoria").select("id, ts, acao, colaborador_id, detalhe").eq("entidade", tabela).eq("entidade_id", String(id)).order("id", { ascending: false }).limit(100);
  if (error) falha("Histórico da LNT", error.message);
  return (data ?? []) as EventoLnt[];
}

// ── Gravações (somente RH, pelo servidor) ───────────────────────────────
export interface ResultadoCarga {
  ciclo_id: number;
  novas: number;
  necessidade_ids: number[];
  ja_no_ciclo: number;
  nao_carregadas: { colaborador_desligado: number; apos_corte: number; sem_validacao: number };
  planejadas_sem_treinamento_localizado: number;
  mudancas_marcadas: number;
  ciclo_fechado: boolean;
}

export const lnt = {
  criarCiclo: (d: { ano_planejamento: number; data_corte: string; titulo?: string; ano_levantamento?: number; observacao?: string }) => gravar<CicloLnt>("lnt_ciclo_criar", d),
  carregarCandidatas: (cicloId: number) => gravar<ResultadoCarga>("lnt_candidatas_carregar", { ciclo_id: cicloId }),
  atualizarCandidatas: (cicloId: number) => gravar<ResultadoCarga>("lnt_candidatas_atualizar", { ciclo_id: cicloId }),
  criarItemConsolidado: (d: { ciclo_id: number; titulo: string; necessidade_ids: number[]; descricao?: string; categoria?: CategoriaNecessidade; justificativa?: string; publico_estimado?: number; publico_descricao?: string }) =>
    gravar<ItemLnt>("lnt_item_criar_consolidado", d),
  criarItemDireto: (d: { ciclo_id: number; titulo: string; justificativa: string; direcionadores: Direcionador[]; publico_estimado: number; descricao?: string; categoria?: CategoriaNecessidade; publico_descricao?: string }) =>
    gravar<ItemLnt>("lnt_item_criar_direto", d),
  editarItem: (d: { id: number; titulo?: string; descricao?: string; justificativa?: string; categoria?: CategoriaNecessidade | ""; publico_estimado?: number | null; publico_descricao?: string }) =>
    gravar<ItemLnt>("lnt_item_editar", d),
  consolidar: (itemId: number, necessidadeIds: number[]) => gravar<{ item_id: number; consolidadas: number }>("lnt_necessidades_consolidar", { item_id: itemId, necessidade_ids: necessidadeIds }),
  desfazerConsolidacao: (cicloId: number, necessidadeIds: number[]) => gravar<{ desfeitas: number }>("lnt_consolidacao_desfazer", { ciclo_id: cicloId, necessidade_ids: necessidadeIds }),
  definirPrioridade: (d: { id: number; prioridade: PrioridadeLnt; direcionadores: Direcionador[]; justificativa_prioridade?: string }) => gravar<ItemLnt>("lnt_item_prioridade", d),
  incluirItem: (id: number, motivo?: string) => gravar<ItemLnt>("lnt_item_incluir", { id, motivo }),
  naoPriorizarItem: (id: number, motivo: string) => gravar<ItemLnt>("lnt_item_nao_priorizar", { id, motivo }),
  naoPriorizarNecessidades: (cicloId: number, necessidadeIds: number[], motivo: string) => gravar<{ nao_priorizadas: number }>("lnt_necessidade_nao_priorizar", { ciclo_id: cicloId, necessidade_ids: necessidadeIds, motivo }),
  reconsiderarNecessidades: (cicloId: number, necessidadeIds: number[]) => gravar<{ reconsideradas: number }>("lnt_necessidade_reconsiderar", { ciclo_id: cicloId, necessidade_ids: necessidadeIds }),
  fecharCiclo: (cicloId: number) => gravar<CicloLnt>("lnt_ciclo_fechar", { ciclo_id: cicloId }),
  reabrirCiclo: (cicloId: number, motivo: string) => gravar<CicloLnt>("lnt_ciclo_reabrir", { ciclo_id: cicloId, motivo }),
};

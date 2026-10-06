// Ações do servidor da LNT (Fase 6 — núcleo): operam as 3 tabelas
// peopleflow_dev_lnt_ciclos / _itens / _necessidades. Usado só por api/desenvolvimento.ts
// (via ACOES de desenvolvimentoAcoes.ts).
//
// Regras gerais (as mesmas do restante do módulo):
//   • só o RH executa (a sessão e o perfil são validados no servidor, antes daqui);
//   • a escrita é só do servidor (service_role) — o navegador só lê, sob RLS;
//   • a LNT NUNCA altera a necessidade original (peopleflow_dev_necessidades), o PDI,
//     os treinamentos, nem cria necessidade ou gap sozinha;
//   • toda ação grava um evento em peopleflow_dev_auditoria (antes/depois quando cabe);
//   • as regras críticas valem aqui E no banco (checks e triggers da Fase 6).
//
// Limite conhecido: o cliente REST do Supabase não faz transação entre comandos. As
// ações que gravam em duas tabelas validam tudo antes de escrever; o caso extremo
// (queda entre os dois comandos) deixa, no pior caso, um item vazio em análise, que a
// RH edita ou não prioriza — nunca uma necessidade fora do lugar.

import { supabaseAdmin } from "./adminAuth.js";
import type { ContaDev } from "./desenvolvimentoAcoes.js";
import {
  CATEGORIAS_LNT,
  PRIORIDADES_LNT,
  VALORES_DIRECIONADOR,
  avaliarElegibilidade,
  calcularIndicadores,
  diferencaDaFotografia,
  mesmaMudanca,
  pendenciasDeFechamento,
  type MudancaObservada,
} from "../../src/domain/lnt.js";

export class ErroLnt extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Corpo = Record<string, unknown>;

// ── Entrada ─────────────────────────────────────────────────────────────
function exigirRH(conta: ContaDev) {
  if (conta.perfil !== "RH") throw new ErroLnt(403, "Somente o RH pode fazer esta alteração.");
}

function texto(corpo: Corpo, campo: string, opts: { obrigatorio?: boolean; max?: number; rotulo?: string } = {}): string {
  const v = corpo[campo];
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  if (opts.obrigatorio && !s) throw new ErroLnt(422, `Informe ${opts.rotulo ?? campo}.`);
  if (s.length > (opts.max ?? 2000)) throw new ErroLnt(422, `${opts.rotulo ?? campo} excede ${opts.max ?? 2000} caracteres.`);
  return s;
}

function idObrigatorio(corpo: Corpo, campo: string, rotulo: string): number {
  const n = Number(corpo[campo]);
  if (!Number.isInteger(n) || n <= 0) throw new ErroLnt(422, `${rotulo} inválido.`);
  return n;
}

function listaDeIds(corpo: Corpo, campoLista: string, campoUnico: string, rotulo: string, max = 500): number[] {
  const bruto = Array.isArray(corpo[campoLista]) ? (corpo[campoLista] as unknown[]) : corpo[campoUnico] != null ? [corpo[campoUnico]] : [];
  const ids = [...new Set(bruto.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) throw new ErroLnt(422, `Selecione ao menos ${rotulo}.`);
  if (ids.length > max) throw new ErroLnt(422, `Selecione no máximo ${max} por vez.`);
  return ids;
}

function umDe<T extends string>(valor: string, opcoes: readonly T[], rotulo: string): T {
  if (!(opcoes as readonly string[]).includes(valor)) throw new ErroLnt(422, `${rotulo} inválido.`);
  return valor as T;
}

function dataIso(corpo: Corpo, campo: string, rotulo: string): string {
  const s = texto(corpo, campo, { obrigatorio: true, max: 10, rotulo });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new ErroLnt(422, `${rotulo} inválida (use aaaa-mm-dd).`);
  return s;
}

function direcionadoresDe(corpo: Corpo, opts: { obrigatorio: boolean }): string[] {
  const bruto = Array.isArray(corpo.direcionadores) ? (corpo.direcionadores as unknown[]).map((d) => String(d)) : [];
  const unicos = [...new Set(bruto)];
  if (unicos.length !== bruto.length) throw new ErroLnt(422, "Direcionador repetido.");
  for (const d of unicos) if (!VALORES_DIRECIONADOR.includes(d)) throw new ErroLnt(422, `Direcionador inválido: ${d}.`);
  if (opts.obrigatorio && unicos.length === 0) throw new ErroLnt(422, "Informe ao menos um direcionador.");
  return unicos;
}

function publicoEstimado(corpo: Corpo, obrigatorio: boolean): number | null {
  const v = corpo.publico_estimado;
  if (v === null || v === undefined || v === "") {
    if (obrigatorio) throw new ErroLnt(422, "Informe o público estimado.");
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 100000) throw new ErroLnt(422, "O público estimado deve ser um número inteiro maior que zero.");
  return n;
}

// ── Banco ───────────────────────────────────────────────────────────────
function erroBanco(error: { code?: string; message: string }, contexto: string): never {
  if (error.code === "23505") throw new ErroLnt(409, `${contexto}: já existe um registro igual.`);
  if (error.code === "P0001") throw new ErroLnt(422, error.message);
  if (error.code === "23514" || error.code === "23503" || error.code === "22P02") throw new ErroLnt(422, `${contexto}: dados inválidos (${error.message}).`);
  throw new ErroLnt(500, `${contexto}: ${error.message}`);
}

async function auditar(conta: ContaDev, acao: string, entidade: string, entidadeId: string, detalhe: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("peopleflow_dev_auditoria").insert({
    user_id: conta.userId,
    colaborador_id: conta.colaboradorId,
    acao,
    entidade,
    entidade_id: entidadeId,
    detalhe,
  });
  if (error) throw new ErroLnt(500, `Auditoria: ${error.message}`);
}

/** Só os campos que mudaram, no formato { campo: { antes, depois } }. */
function diferencas(antes: Record<string, unknown>, depois: Record<string, unknown>) {
  const out: Record<string, { antes: unknown; depois: unknown }> = {};
  for (const k of Object.keys(depois)) if (JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null)) out[k] = { antes: antes[k] ?? null, depois: depois[k] };
  return out;
}

function emLotes<T>(itens: T[], tamanho = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) out.push(itens.slice(i, i + tamanho));
  return out;
}

/** O PostgREST limita cada resposta (1000 linhas): lê em páginas até acabar. */
async function lerTudo<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>, contexto: string): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) erroBanco(error, contexto);
    const linhas = (data ?? []) as T[];
    out.push(...linhas);
    if (linhas.length < 1000) return out;
  }
}

const T_CICLOS = "peopleflow_dev_lnt_ciclos";
const T_ITENS = "peopleflow_dev_lnt_itens";
const T_LNT_NEC = "peopleflow_dev_lnt_necessidades";

interface Ciclo {
  id: number;
  ano_planejamento: number;
  ano_levantamento: number;
  titulo: string;
  status: "em_elaboracao" | "fechada";
  data_corte: string;
  observacao: string;
  reaberturas: number;
  fechada_em: string | null;
  fechada_por: string | null;
  fechamento_resumo: unknown;
  ultima_reabertura_em: string | null;
  ultima_reabertura_por: string | null;
  ultima_reabertura_motivo: string | null;
}

interface Item {
  id: number;
  ciclo_id: number;
  titulo: string;
  descricao: string;
  justificativa: string;
  categoria: string | null;
  origem_item: "consolidacao" | "direto";
  situacao: "em_analise" | "incluido" | "nao_priorizado";
  prioridade: string | null;
  direcionadores: string[];
  justificativa_prioridade: string;
  publico_estimado: number | null;
  publico_descricao: string;
  motivo_decisao: string;
  decidido_em: string | null;
  decidido_por: string | null;
}

interface Linha {
  id: number;
  ciclo_id: number;
  necessidade_id: number;
  decisao: "candidata" | "em_item" | "nao_priorizada";
  item_id: number | null;
  motivo: string;
  status_na_carga: string;
  prioridade_na_carga: string | null;
  departamento_na_carga: string | null;
  alerta_treinamento_id: number | null;
  descricao_na_carga: string;
  justificativa_na_carga: string;
  sugestao_capacitacao_na_carga: string;
  mudou_desde_carga_em: string | null;
  mudanca_observada: MudancaObservada | null;
}

interface NecessidadeViva {
  id: number;
  colaborador_id: number | null;
  status: string;
  validada_em: string | null;
  prioridade: string | null;
  departamento: string | null;
  descricao: string;
  justificativa: string;
  sugestao_capacitacao: string;
}

async function lerCiclo(id: number): Promise<Ciclo> {
  const { data, error } = await supabaseAdmin.from(T_CICLOS).select("*").eq("id", id).maybeSingle();
  if (error) erroBanco(error, "Ciclo da LNT");
  if (!data) throw new ErroLnt(404, "Ciclo da LNT não encontrado.");
  return data as Ciclo;
}

async function lerItem(id: number): Promise<Item> {
  const { data, error } = await supabaseAdmin.from(T_ITENS).select("*").eq("id", id).maybeSingle();
  if (error) erroBanco(error, "Item da LNT");
  if (!data) throw new ErroLnt(404, "Item da LNT não encontrado.");
  return data as Item;
}

function exigirCicloAberto(ciclo: Ciclo) {
  if (ciclo.status !== "em_elaboracao") throw new ErroLnt(409, "Ciclo fechado: reabra o ciclo antes de alterar.");
}

async function linhasDoCiclo(cicloId: number): Promise<Linha[]> {
  return lerTudo<Linha>((de, ate) => supabaseAdmin.from(T_LNT_NEC).select("*").eq("ciclo_id", cicloId).order("id").range(de, ate), "Necessidades do ciclo");
}

async function itensDoCiclo(cicloId: number): Promise<Item[]> {
  return lerTudo<Item>((de, ate) => supabaseAdmin.from(T_ITENS).select("*").eq("ciclo_id", cicloId).order("id").range(de, ate), "Itens do ciclo");
}

async function necessidadesVivas(ids: number[]): Promise<Map<number, NecessidadeViva>> {
  const m = new Map<number, NecessidadeViva>();
  for (const lote of emLotes(ids)) {
    const { data, error } = await supabaseAdmin
      .from("peopleflow_dev_necessidades")
      .select("id, colaborador_id, status, validada_em, prioridade, departamento, descricao, justificativa, sugestao_capacitacao")
      .in("id", lote);
    if (error) erroBanco(error, "Necessidades");
    for (const n of (data ?? []) as NecessidadeViva[]) m.set(n.id, n);
  }
  return m;
}

async function desligados(colaboradorIds: number[]): Promise<Set<number>> {
  const s = new Set<number>();
  for (const lote of emLotes([...new Set(colaboradorIds)])) {
    const { data, error } = await supabaseAdmin.from("colaboradores").select("id, desligado").in("id", lote);
    if (error) erroBanco(error, "Colaboradores");
    for (const c of (data ?? []) as { id: number; desligado: boolean | null }[]) if (c.desligado) s.add(c.id);
  }
  return s;
}

/** Linhas do ciclo (todas candidatas) que o servidor precisa para uma ação por necessidade. */
async function linhasPorNecessidade(cicloId: number, necessidadeIds: number[]): Promise<Linha[]> {
  const out: Linha[] = [];
  for (const lote of emLotes(necessidadeIds)) {
    const { data, error } = await supabaseAdmin.from(T_LNT_NEC).select("*").eq("ciclo_id", cicloId).in("necessidade_id", lote);
    if (error) erroBanco(error, "Necessidades do ciclo");
    out.push(...((data ?? []) as Linha[]));
  }
  return out;
}

function exigirTodas(linhas: Linha[], ids: number[], decisaoEsperada: Linha["decisao"], mensagemEstado: string): Linha[] {
  const porId = new Map(linhas.map((l) => [l.necessidade_id, l]));
  const ausentes = ids.filter((id) => !porId.has(id));
  if (ausentes.length > 0) throw new ErroLnt(422, `Necessidade(s) fora deste ciclo: ${ausentes.join(", ")}.`);
  const fora = linhas.filter((l) => l.decisao !== decisaoEsperada);
  if (fora.length > 0) throw new ErroLnt(409, `${mensagemEstado}: ${fora.map((l) => l.necessidade_id).join(", ")}.`);
  return linhas;
}

// ── 1. Ciclo ────────────────────────────────────────────────────────────
async function cicloCriar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const ano = Number(corpo.ano_planejamento);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new ErroLnt(422, "Ano de planejamento inválido.");
  const levantamentoBruto = corpo.ano_levantamento;
  const levantamento = levantamentoBruto === undefined || levantamentoBruto === null || levantamentoBruto === "" ? ano - 1 : Number(levantamentoBruto);
  if (!Number.isInteger(levantamento) || levantamento >= ano) throw new ErroLnt(422, "O ano do levantamento deve ser anterior ao do planejamento.");
  const { data, error } = await supabaseAdmin
    .from(T_CICLOS)
    .insert({
      ano_planejamento: ano,
      ano_levantamento: levantamento,
      titulo: texto(corpo, "titulo", { max: 120 }) || `LNT ${ano}`,
      data_corte: dataIso(corpo, "data_corte", "a data de corte"),
      observacao: texto(corpo, "observacao", { max: 2000 }),
      created_by: conta.userId,
      updated_by: conta.userId,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new ErroLnt(409, `Já existe um ciclo de LNT para o planejamento de ${ano}.`);
    erroBanco(error, "Ciclo da LNT");
  }
  await auditar(conta, "lnt_ciclo_criado", T_CICLOS, String((data as Ciclo).id), { depois: data });
  return data;
}

// ── 2. Carga e atualização das candidatas ───────────────────────────────
const COLUNAS_VIVA = "id, colaborador_id, status, validada_em, prioridade, departamento, descricao, justificativa, sugestao_capacitacao";

async function treinamentoDeAlerta(necessidadeIds: number[]): Promise<Map<number, number>> {
  // vínculos oficiais (ativos e validados) da necessidade com treinamento ainda não concluído nem cancelado
  const vinculos: { treinamento_id: number; necessidade_id: number }[] = [];
  for (const lote of emLotes(necessidadeIds)) {
    const { data, error } = await supabaseAdmin
      .from("peopleflow_dev_treinamento_necessidades")
      .select("treinamento_id, necessidade_id")
      .in("necessidade_id", lote)
      .eq("ativo", true)
      .eq("situacao", "validada");
    if (error) erroBanco(error, "Vínculos com treinamentos");
    vinculos.push(...((data ?? []) as typeof vinculos));
  }
  const ids = [...new Set(vinculos.map((v) => v.treinamento_id))];
  const vivos = new Set<number>();
  for (const lote of emLotes(ids)) {
    const { data, error } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select("id, status").in("id", lote).in("status", ["solicitado", "planejado", "em_andamento"]);
    if (error) erroBanco(error, "Treinamentos");
    for (const t of (data ?? []) as { id: number }[]) vivos.add(t.id);
  }
  const alerta = new Map<number, number>();
  for (const v of vinculos) {
    if (!vivos.has(v.treinamento_id)) continue;
    const atual = alerta.get(v.necessidade_id);
    if (atual === undefined || v.treinamento_id > atual) alerta.set(v.necessidade_id, v.treinamento_id); // o treinamento mais recente
  }
  return alerta;
}

async function cargaDeCandidatas(conta: ContaDev, corpo: Corpo, modo: "carregar" | "atualizar") {
  exigirRH(conta);
  const ciclo = await lerCiclo(idObrigatorio(corpo, "ciclo_id", "Ciclo"));
  const existentes = await linhasDoCiclo(ciclo.id);
  if (modo === "carregar") {
    exigirCicloAberto(ciclo);
    if (existentes.length > 0) throw new ErroLnt(409, "Este ciclo já tem necessidades carregadas — use “Atualizar candidatas”.");
  } else if (existentes.length === 0) {
    throw new ErroLnt(409, "Este ciclo ainda não tem candidatas — carregue primeiro.");
  }
  const agora = new Date().toISOString();

  // 1) novas candidatas (somente com o ciclo aberto): validadas e planejadas ainda não fotografadas
  const jaNoCiclo = new Set(existentes.map((l) => l.necessidade_id));
  const incluidas: number[] = [];
  const recusadas = { colaborador_desligado: 0, apos_corte: 0, sem_validacao: 0 };
  let planejadasSemTreinamento = 0;
  if (ciclo.status === "em_elaboracao") {
    const abertas = await lerTudo<NecessidadeViva>(
      (de, ate) => supabaseAdmin.from("peopleflow_dev_necessidades").select(COLUNAS_VIVA).in("status", ["validada", "planejada"]).order("id").range(de, ate),
      "Necessidades",
    );
    const novas = abertas.filter((n) => !jaNoCiclo.has(n.id));
    const fora = await desligados(novas.map((n) => n.colaborador_id).filter((c): c is number => c != null));
    const aceitas: { n: NecessidadeViva; statusCarga: "validada" | "planejada" }[] = [];
    for (const n of novas) {
      const r = avaliarElegibilidade({ status: n.status, validada_em: n.validada_em, colaboradorDesligado: n.colaborador_id != null && fora.has(n.colaborador_id) }, ciclo.data_corte);
      if (r.elegivel) aceitas.push({ n, statusCarga: r.statusCarga });
      else if (r.motivo !== "status") recusadas[r.motivo]++;
    }
    const alertas = await treinamentoDeAlerta(aceitas.filter((a) => a.statusCarga === "planejada").map((a) => a.n.id));
    const linhasNovas = aceitas.map(({ n, statusCarga }) => {
      const alerta = statusCarga === "planejada" ? (alertas.get(n.id) ?? null) : null;
      if (statusCarga === "planejada" && alerta === null) planejadasSemTreinamento++;
      return {
        ciclo_id: ciclo.id,
        necessidade_id: n.id,
        carregada_em: agora,
        status_na_carga: statusCarga,
        validada_em_na_carga: n.validada_em,
        prioridade_na_carga: n.prioridade,
        departamento_na_carga: n.departamento,
        alerta_treinamento_id: alerta,
        descricao_na_carga: n.descricao,
        justificativa_na_carga: n.justificativa ?? "",
        sugestao_capacitacao_na_carga: n.sugestao_capacitacao ?? "",
        created_by: conta.userId,
        updated_by: conta.userId,
      };
    });
    for (const lote of emLotes(linhasNovas, 200)) {
      const { error } = await supabaseAdmin.from(T_LNT_NEC).insert(lote);
      if (error) erroBanco(error, "Carga das candidatas");
    }
    incluidas.push(...aceitas.map((a) => a.n.id));
  }

  // 2) marcação de mudança nas já fotografadas (a fotografia nunca é alterada)
  const marcadas: { necessidade_id: number; mudanca: MudancaObservada | null }[] = [];
  if (modo === "atualizar") {
    const vivas = await necessidadesVivas(existentes.map((l) => l.necessidade_id));
    const fora = await desligados([...vivas.values()].map((v) => v.colaborador_id).filter((c): c is number => c != null));
    for (const l of existentes) {
      const v = vivas.get(l.necessidade_id);
      if (!v) continue;
      const dif = diferencaDaFotografia(l, { ...v, colaboradorDesligado: v.colaborador_id != null && fora.has(v.colaborador_id), departamento: v.departamento, prioridade: v.prioridade });
      if (mesmaMudanca(l.mudanca_observada, dif)) continue;
      const { error } = await supabaseAdmin
        .from(T_LNT_NEC)
        .update({ mudou_desde_carga_em: dif ? agora : null, mudanca_observada: dif, updated_by: conta.userId })
        .eq("id", l.id);
      if (error) erroBanco(error, "Marcação de mudança");
      marcadas.push({ necessidade_id: l.necessidade_id, mudanca: dif });
    }
  }

  const resultado = {
    ciclo_id: ciclo.id,
    novas: incluidas.length,
    necessidade_ids: incluidas,
    ja_no_ciclo: existentes.length,
    nao_carregadas: recusadas,
    planejadas_sem_treinamento_localizado: planejadasSemTreinamento,
    mudancas_marcadas: marcadas.length,
    ciclo_fechado: ciclo.status === "fechada",
  };
  await auditar(conta, modo === "carregar" ? "lnt_candidatas_carregadas" : "lnt_candidatas_atualizadas", T_CICLOS, String(ciclo.id), {
    ...resultado,
    data_corte: ciclo.data_corte,
    mudancas: marcadas,
  });
  return resultado;
}

const candidatasCarregar = (conta: ContaDev, corpo: Corpo) => cargaDeCandidatas(conta, corpo, "carregar");
const candidatasAtualizar = (conta: ContaDev, corpo: Corpo) => cargaDeCandidatas(conta, corpo, "atualizar");

// ── 3. Itens ────────────────────────────────────────────────────────────
function camposTextoItem(corpo: Corpo) {
  const categoria = texto(corpo, "categoria");
  return {
    descricao: texto(corpo, "descricao", { max: 2000 }),
    categoria: categoria ? umDe(categoria, CATEGORIAS_LNT, "Categoria") : null,
  };
}

async function vincularAoItem(conta: ContaDev, ciclo: Ciclo, itemId: number, linhas: Linha[], agora: string) {
  const ids = linhas.map((l) => l.necessidade_id);
  let atualizadas = 0;
  for (const lote of emLotes(ids)) {
    const { data, error } = await supabaseAdmin
      .from(T_LNT_NEC)
      .update({ decisao: "em_item", item_id: itemId, motivo: "", decidido_em: agora, decidido_por: conta.userId, updated_by: conta.userId })
      .eq("ciclo_id", ciclo.id)
      .in("necessidade_id", lote)
      .eq("decisao", "candidata")
      .select("id");
    if (error) erroBanco(error, "Consolidação");
    atualizadas += (data ?? []).length;
  }
  if (atualizadas !== ids.length) throw new ErroLnt(409, `Só ${atualizadas} de ${ids.length} necessidades puderam ser consolidadas no item ${itemId} (o estado mudou durante a operação). Confira o item antes de continuar.`);
}

async function itemCriarConsolidado(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const ciclo = await lerCiclo(idObrigatorio(corpo, "ciclo_id", "Ciclo"));
  exigirCicloAberto(ciclo);
  const titulo = texto(corpo, "titulo", { obrigatorio: true, max: 200, rotulo: "o título do item" });
  const ids = listaDeIds(corpo, "necessidade_ids", "necessidade_id", "uma necessidade");
  const linhas = exigirTodas(await linhasPorNecessidade(ciclo.id, ids), ids, "candidata", "Já têm decisão e não podem ser consolidadas (desfaça antes)");
  const agora = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(T_ITENS)
    .insert({
      ciclo_id: ciclo.id,
      titulo,
      ...camposTextoItem(corpo),
      justificativa: texto(corpo, "justificativa", { max: 2000 }),
      origem_item: "consolidacao",
      publico_estimado: publicoEstimado(corpo, false),
      publico_descricao: texto(corpo, "publico_descricao", { max: 500 }),
      created_by: conta.userId,
      updated_by: conta.userId,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new ErroLnt(409, "Já existe um item com este título neste ciclo.");
    erroBanco(error, "Item da LNT");
  }
  const item = data as Item;
  await vincularAoItem(conta, ciclo, item.id, linhas, agora);
  await auditar(conta, "lnt_item_criado", T_ITENS, String(item.id), { ciclo_id: ciclo.id, origem_item: "consolidacao", depois: item, necessidades: ids });
  await auditar(conta, "lnt_necessidades_consolidadas", T_ITENS, String(item.id), { ciclo_id: ciclo.id, necessidades: ids, estado_anterior: "candidata" });
  return item;
}

async function itemCriarDireto(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const ciclo = await lerCiclo(idObrigatorio(corpo, "ciclo_id", "Ciclo"));
  exigirCicloAberto(ciclo);
  const { data, error } = await supabaseAdmin
    .from(T_ITENS)
    .insert({
      ciclo_id: ciclo.id,
      titulo: texto(corpo, "titulo", { obrigatorio: true, max: 200, rotulo: "o título do item" }),
      ...camposTextoItem(corpo),
      justificativa: texto(corpo, "justificativa", { obrigatorio: true, max: 2000, rotulo: "a justificativa do item direto" }),
      direcionadores: direcionadoresDe(corpo, { obrigatorio: true }),
      publico_estimado: publicoEstimado(corpo, true),
      publico_descricao: texto(corpo, "publico_descricao", { max: 500 }),
      origem_item: "direto",
      created_by: conta.userId,
      updated_by: conta.userId,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new ErroLnt(409, "Já existe um item com este título neste ciclo.");
    erroBanco(error, "Item da LNT");
  }
  await auditar(conta, "lnt_item_criado", T_ITENS, String((data as Item).id), { ciclo_id: ciclo.id, origem_item: "direto", depois: data });
  return data;
}

async function itemEditar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const antes = await lerItem(idObrigatorio(corpo, "id", "Item"));
  exigirCicloAberto(await lerCiclo(antes.ciclo_id));
  const novo: Record<string, unknown> = {};
  if ("titulo" in corpo) novo.titulo = texto(corpo, "titulo", { obrigatorio: true, max: 200, rotulo: "o título do item" });
  if ("descricao" in corpo) novo.descricao = texto(corpo, "descricao", { max: 2000 });
  if ("justificativa" in corpo) novo.justificativa = texto(corpo, "justificativa", { max: 2000 });
  if ("categoria" in corpo) {
    const c = texto(corpo, "categoria");
    novo.categoria = c ? umDe(c, CATEGORIAS_LNT, "Categoria") : null;
  }
  if ("publico_estimado" in corpo) novo.publico_estimado = publicoEstimado(corpo, antes.origem_item === "direto");
  if ("publico_descricao" in corpo) novo.publico_descricao = texto(corpo, "publico_descricao", { max: 500 });
  const mudou = diferencas(antes as unknown as Record<string, unknown>, novo);
  if (Object.keys(mudou).length === 0) return antes;
  const { data, error } = await supabaseAdmin.from(T_ITENS).update({ ...novo, updated_by: conta.userId }).eq("id", antes.id).select("*").single();
  if (error) {
    if (error.code === "23505") throw new ErroLnt(409, "Já existe um item com este título neste ciclo.");
    erroBanco(error, "Item da LNT");
  }
  await auditar(conta, "lnt_item_editado", T_ITENS, String(antes.id), { ciclo_id: antes.ciclo_id, alteracoes: mudou });
  return data;
}

// ── 4. Consolidação ─────────────────────────────────────────────────────
async function necessidadesConsolidar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const item = await lerItem(idObrigatorio(corpo, "item_id", "Item"));
  const ciclo = await lerCiclo(item.ciclo_id);
  exigirCicloAberto(ciclo);
  if (item.situacao === "nao_priorizado") throw new ErroLnt(409, "Item não priorizado: reconsidere o item antes de acrescentar necessidades.");
  const ids = listaDeIds(corpo, "necessidade_ids", "necessidade_id", "uma necessidade");
  const linhas = exigirTodas(await linhasPorNecessidade(ciclo.id, ids), ids, "candidata", "Já estão em um item ou foram não priorizadas (desfaça ou reconsidere antes)");
  await vincularAoItem(conta, ciclo, item.id, linhas, new Date().toISOString());
  await auditar(conta, "lnt_necessidades_consolidadas", T_ITENS, String(item.id), { ciclo_id: ciclo.id, necessidades: ids, estado_anterior: "candidata" });
  return { item_id: item.id, consolidadas: ids.length };
}

async function consolidacaoDesfazer(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const ciclo = await lerCiclo(idObrigatorio(corpo, "ciclo_id", "Ciclo"));
  exigirCicloAberto(ciclo);
  const ids = listaDeIds(corpo, "necessidade_ids", "necessidade_id", "uma necessidade");
  const linhas = exigirTodas(await linhasPorNecessidade(ciclo.id, ids), ids, "em_item", "Não estão em nenhum item");
  const todas = await linhasDoCiclo(ciclo.id);
  const itens = new Map((await itensDoCiclo(ciclo.id)).map((i) => [i.id, i]));
  const porItem = new Map<number, number[]>();
  for (const l of linhas) porItem.set(l.item_id!, [...(porItem.get(l.item_id!) ?? []), l.necessidade_id]);
  for (const [itemId, retirar] of porItem) {
    const item = itens.get(itemId);
    const restantes = todas.filter((l) => l.item_id === itemId && !retirar.includes(l.necessidade_id)).length;
    if (item && item.situacao === "incluido" && item.origem_item === "consolidacao" && restantes === 0) {
      throw new ErroLnt(409, `O item “${item.titulo}” está incluído e ficaria sem necessidades. Não priorize ou edite o item antes de desfazer.`);
    }
  }
  const { data, error } = await supabaseAdmin
    .from(T_LNT_NEC)
    .update({ decisao: "candidata", item_id: null, motivo: "", decidido_em: null, decidido_por: null, updated_by: conta.userId })
    .eq("ciclo_id", ciclo.id)
    .in("necessidade_id", ids)
    .eq("decisao", "em_item")
    .select("id");
  if (error) erroBanco(error, "Desfazer consolidação");
  if ((data ?? []).length !== ids.length) throw new ErroLnt(409, "O estado mudou durante a operação. Confira o ciclo.");
  for (const [itemId, retiradas] of porItem) await auditar(conta, "lnt_consolidacao_desfeita", T_ITENS, String(itemId), { ciclo_id: ciclo.id, necessidades: retiradas });
  return { desfeitas: ids.length };
}

// ── 5. Prioridade, inclusão e não priorização do item ───────────────────
async function itemPrioridade(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const antes = await lerItem(idObrigatorio(corpo, "id", "Item"));
  exigirCicloAberto(await lerCiclo(antes.ciclo_id));
  // Item não priorizado também pode receber prioridade: é o caminho para reconsiderá-lo (incluir exige prioridade e direcionador).
  const prioridade = umDe(texto(corpo, "prioridade"), PRIORIDADES_LNT, "Prioridade");
  const justificativa = texto(corpo, "justificativa_prioridade", { max: 2000 });
  if (prioridade === "alta" && !justificativa) throw new ErroLnt(422, "Informe a justificativa da prioridade Alta.");
  const novo = { prioridade, direcionadores: direcionadoresDe(corpo, { obrigatorio: true }), justificativa_prioridade: justificativa };
  const mudou = diferencas(antes as unknown as Record<string, unknown>, novo);
  if (Object.keys(mudou).length === 0) return antes;
  const { data, error } = await supabaseAdmin.from(T_ITENS).update({ ...novo, updated_by: conta.userId }).eq("id", antes.id).select("*").single();
  if (error) erroBanco(error, "Prioridade do item");
  await auditar(conta, "lnt_prioridade_alterada", T_ITENS, String(antes.id), { ciclo_id: antes.ciclo_id, alteracoes: mudou });
  return data;
}

async function itemIncluir(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const antes = await lerItem(idObrigatorio(corpo, "id", "Item"));
  const ciclo = await lerCiclo(antes.ciclo_id);
  exigirCicloAberto(ciclo);
  if (antes.situacao === "incluido") throw new ErroLnt(409, "O item já está incluído.");
  if (!antes.prioridade) throw new ErroLnt(422, "Defina a prioridade antes de incluir o item.");
  if (antes.direcionadores.length === 0) throw new ErroLnt(422, "Informe ao menos um direcionador antes de incluir o item.");
  if (antes.origem_item === "consolidacao") {
    const membros = (await linhasDoCiclo(ciclo.id)).filter((l) => l.item_id === antes.id).length;
    if (membros === 0) throw new ErroLnt(422, "Um item de consolidação precisa de ao menos uma necessidade para ser incluído.");
  }
  const novo = { situacao: "incluido", decidido_em: new Date().toISOString(), decidido_por: conta.userId, motivo_decisao: texto(corpo, "motivo", { max: 1000 }) };
  const { data, error } = await supabaseAdmin.from(T_ITENS).update({ ...novo, updated_by: conta.userId }).eq("id", antes.id).select("*").single();
  if (error) erroBanco(error, "Inclusão do item");
  await auditar(conta, "lnt_item_incluido", T_ITENS, String(antes.id), {
    ciclo_id: ciclo.id,
    situacao: { antes: antes.situacao, depois: "incluido" },
    prioridade: antes.prioridade,
    direcionadores: antes.direcionadores,
    motivo: novo.motivo_decisao,
  });
  return data;
}

async function itemNaoPriorizar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const antes = await lerItem(idObrigatorio(corpo, "id", "Item"));
  const ciclo = await lerCiclo(antes.ciclo_id);
  exigirCicloAberto(ciclo);
  if (antes.situacao === "nao_priorizado") throw new ErroLnt(409, "O item já está não priorizado.");
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "o motivo da não priorização" });
  const { data, error } = await supabaseAdmin
    .from(T_ITENS)
    .update({ situacao: "nao_priorizado", motivo_decisao: motivo, decidido_em: new Date().toISOString(), decidido_por: conta.userId, updated_by: conta.userId })
    .eq("id", antes.id)
    .select("*")
    .single();
  if (error) erroBanco(error, "Não priorização do item");
  await auditar(conta, "lnt_item_nao_priorizado", T_ITENS, String(antes.id), { ciclo_id: ciclo.id, situacao: { antes: antes.situacao, depois: "nao_priorizado" }, motivo });
  return data;
}

// ── 6. Necessidade avulsa: não priorizar e reconsiderar ─────────────────
async function necessidadeNaoPriorizar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const ciclo = await lerCiclo(idObrigatorio(corpo, "ciclo_id", "Ciclo"));
  exigirCicloAberto(ciclo);
  const ids = listaDeIds(corpo, "necessidade_ids", "necessidade_id", "uma necessidade");
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "o motivo da não priorização" });
  exigirTodas(await linhasPorNecessidade(ciclo.id, ids), ids, "candidata", "Só candidatas sem decisão podem ser não priorizadas (as que estão em item saem do item antes)");
  const { data, error } = await supabaseAdmin
    .from(T_LNT_NEC)
    .update({ decisao: "nao_priorizada", motivo, decidido_em: new Date().toISOString(), decidido_por: conta.userId, updated_by: conta.userId })
    .eq("ciclo_id", ciclo.id)
    .in("necessidade_id", ids)
    .eq("decisao", "candidata")
    .select("id");
  if (error) erroBanco(error, "Não priorização");
  if ((data ?? []).length !== ids.length) throw new ErroLnt(409, "O estado mudou durante a operação. Confira o ciclo.");
  await auditar(conta, "lnt_necessidade_nao_priorizada", T_CICLOS, String(ciclo.id), { ciclo_id: ciclo.id, necessidades: ids, motivo });
  return { nao_priorizadas: ids.length };
}

async function necessidadeReconsiderar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const ciclo = await lerCiclo(idObrigatorio(corpo, "ciclo_id", "Ciclo"));
  exigirCicloAberto(ciclo);
  const ids = listaDeIds(corpo, "necessidade_ids", "necessidade_id", "uma necessidade");
  const linhas = exigirTodas(await linhasPorNecessidade(ciclo.id, ids), ids, "nao_priorizada", "Não estão marcadas como não priorizadas");
  const { data, error } = await supabaseAdmin
    .from(T_LNT_NEC)
    .update({ decisao: "candidata", motivo: "", decidido_em: null, decidido_por: null, updated_by: conta.userId })
    .eq("ciclo_id", ciclo.id)
    .in("necessidade_id", ids)
    .eq("decisao", "nao_priorizada")
    .select("id");
  if (error) erroBanco(error, "Reconsideração");
  if ((data ?? []).length !== ids.length) throw new ErroLnt(409, "O estado mudou durante a operação. Confira o ciclo.");
  await auditar(conta, "lnt_necessidade_reconsiderada", T_CICLOS, String(ciclo.id), {
    ciclo_id: ciclo.id,
    necessidades: ids,
    motivos_anteriores: Object.fromEntries(linhas.map((l) => [l.necessidade_id, l.motivo])),
  });
  return { reconsideradas: ids.length };
}

// ── 7. Fechamento e reabertura ──────────────────────────────────────────
async function cicloFechar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const ciclo = await lerCiclo(idObrigatorio(corpo, "ciclo_id", "Ciclo"));
  exigirCicloAberto(ciclo);
  const itens = await itensDoCiclo(ciclo.id);
  const linhas = await linhasDoCiclo(ciclo.id);
  const vivas = await necessidadesVivas(linhas.map((l) => l.necessidade_id));
  const paraIndicador = linhas.map((l) => ({
    decisao: l.decisao,
    item_id: l.item_id,
    departamento_na_carga: l.departamento_na_carga,
    colaborador_id: vivas.get(l.necessidade_id)?.colaborador_id ?? null,
    alerta_treinamento_id: l.alerta_treinamento_id,
    mudou_desde_carga_em: l.mudou_desde_carga_em,
  }));
  const pendencias = pendenciasDeFechamento(itens, paraIndicador);
  if (pendencias.length > 0) throw new ErroLnt(409, `Não é possível fechar a LNT: ${pendencias.map((p) => p.descricao).join("; ")}.`);
  const { count, error: cErro } = await supabaseAdmin.from("peopleflow_dev_necessidades").select("id", { count: "exact", head: true }).eq("status", "sugerida");
  if (cErro) erroBanco(cErro, "Necessidades sugeridas");
  const resumo = { ...calcularIndicadores(itens, paraIndicador), sugeridas_aguardando_validacao: count ?? 0, data_corte: ciclo.data_corte };
  const agora = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(T_CICLOS)
    .update({ status: "fechada", fechada_em: agora, fechada_por: conta.userId, fechamento_resumo: resumo, updated_by: conta.userId })
    .eq("id", ciclo.id)
    .select("*")
    .single();
  if (error) erroBanco(error, "Fechamento do ciclo");
  await auditar(conta, "lnt_ciclo_fechado", T_CICLOS, String(ciclo.id), { ciclo_id: ciclo.id, resumo });
  return data;
}

async function cicloReabrir(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const ciclo = await lerCiclo(idObrigatorio(corpo, "ciclo_id", "Ciclo"));
  if (ciclo.status !== "fechada") throw new ErroLnt(409, "O ciclo não está fechado.");
  // Futuro: aqui entrará a regra de impedir a reabertura depois da aprovação do Plano de T&D (ainda não existe).
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "o motivo da reabertura" });
  const agora = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(T_CICLOS)
    .update({
      status: "em_elaboracao",
      fechada_em: null,
      fechada_por: null,
      reaberturas: ciclo.reaberturas + 1,
      ultima_reabertura_em: agora,
      ultima_reabertura_por: conta.userId,
      ultima_reabertura_motivo: motivo,
      updated_by: conta.userId,
    })
    .eq("id", ciclo.id)
    .select("*")
    .single();
  if (error) erroBanco(error, "Reabertura do ciclo");
  await auditar(conta, "lnt_ciclo_reaberto", T_CICLOS, String(ciclo.id), { ciclo_id: ciclo.id, motivo, reaberturas: { antes: ciclo.reaberturas, depois: ciclo.reaberturas + 1 } });
  return data;
}

export const ACOES_LNT: Record<string, (conta: ContaDev, corpo: Corpo) => Promise<unknown>> = {
  lnt_ciclo_criar: cicloCriar,
  lnt_candidatas_carregar: candidatasCarregar,
  lnt_candidatas_atualizar: candidatasAtualizar,
  lnt_item_criar_consolidado: itemCriarConsolidado,
  lnt_item_criar_direto: itemCriarDireto,
  lnt_item_editar: itemEditar,
  lnt_necessidades_consolidar: necessidadesConsolidar,
  lnt_consolidacao_desfazer: consolidacaoDesfazer,
  lnt_item_prioridade: itemPrioridade,
  lnt_item_incluir: itemIncluir,
  lnt_item_nao_priorizar: itemNaoPriorizar,
  lnt_necessidade_nao_priorizar: necessidadeNaoPriorizar,
  lnt_necessidade_reconsiderar: necessidadeReconsiderar,
  lnt_ciclo_fechar: cicloFechar,
  lnt_ciclo_reabrir: cicloReabrir,
};

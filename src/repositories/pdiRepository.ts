// Camada de acesso ao PDI (Plano de Desenvolvimento Individual) — 3 tabelas:
// peopleflow_pdi (cabeçalho), peopleflow_pdi_itens, peopleflow_pdi_acoes. RLS
// libera qualquer autenticado, mesmo padrão do resto do módulo.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { Pdi, PdiAcao, PdiItem, ResponsavelPdi, StatusItemPdi, StatusPdi, TipoCompetenciaPdi } from "../types/domain";

interface PdiRow {
  id: number;
  colaborador_nome: string;
  ciclo_id: string | null;
  ciclo: string | null;
  avaliacao_id: string | null;
  gestor_responsavel: string | null;
  status: string;
  comentarios: string | null;
  concluido_por: string | null;
  concluido_em: string | null;
  criado_em: string;
  updated_at: string;
}

interface PdiItemRow {
  id: string;
  pdi_id: number;
  competencia_id: string | null;
  competencia_nome: string;
  tipo_competencia: string;
  nota_obtida: number | null;
  origem_manual: boolean;
  objetivo_desenvolvimento: string;
  responsavel: string;
  data_inicio: string | null;
  data_prevista_conclusao: string | null;
  status: string;
  observacoes: string;
  ordem: number;
  criado_em: string;
  updated_at: string;
}

interface PdiAcaoRow {
  id: string;
  item_id: string;
  descricao: string;
  responsavel: string;
  prazo: string | null;
  status: string;
  ordem: number;
  evidencia_storage_path: string | null;
  evidencia_file_name: string | null;
  evidencia_uploaded_em: string | null;
  evidencia_uploaded_por: string | null;
  criado_em: string;
  updated_at: string;
}

function fromRowPdi(row: PdiRow): Pdi {
  return {
    id: row.id,
    colaboradorNome: row.colaborador_nome,
    cicloId: row.ciclo_id,
    ciclo: row.ciclo ?? "",
    avaliacaoId: row.avaliacao_id,
    gestorResponsavel: row.gestor_responsavel ?? "",
    status: row.status as StatusPdi,
    comentarios: row.comentarios ?? "",
    concluidoPor: row.concluido_por ?? "",
    concluidoEm: row.concluido_em,
    itens: [],
    criadoEm: row.criado_em,
    updatedAt: row.updated_at,
  };
}

function fromRowItem(row: PdiItemRow): PdiItem {
  return {
    id: row.id,
    pdiId: row.pdi_id,
    competenciaId: row.competencia_id ?? "",
    competenciaNome: row.competencia_nome,
    tipoCompetencia: row.tipo_competencia as TipoCompetenciaPdi,
    notaObtida: row.nota_obtida,
    origemManual: row.origem_manual,
    objetivoDesenvolvimento: row.objetivo_desenvolvimento,
    responsavel: row.responsavel as ResponsavelPdi,
    dataInicio: row.data_inicio,
    dataPrevistaConclusao: row.data_prevista_conclusao,
    status: row.status as StatusItemPdi,
    observacoes: row.observacoes,
    ordem: row.ordem,
    acoes: [],
    criadoEm: row.criado_em,
    updatedAt: row.updated_at,
  };
}

function fromRowAcao(row: PdiAcaoRow): PdiAcao {
  return {
    id: row.id,
    itemId: row.item_id,
    descricao: row.descricao,
    responsavel: row.responsavel as ResponsavelPdi,
    prazo: row.prazo,
    status: row.status as StatusItemPdi,
    ordem: row.ordem,
    evidenciaStoragePath: row.evidencia_storage_path,
    evidenciaFileName: row.evidencia_file_name,
    evidenciaUploadedEm: row.evidencia_uploaded_em,
    evidenciaUploadedPor: row.evidencia_uploaded_por,
    criadoEm: row.criado_em,
    updatedAt: row.updated_at,
  };
}

function toRowPdi(pdi: Pdi) {
  return {
    colaborador_nome: pdi.colaboradorNome,
    ciclo_id: pdi.cicloId,
    ciclo: pdi.ciclo,
    avaliacao_id: pdi.avaliacaoId,
    gestor_responsavel: pdi.gestorResponsavel || null,
    status: pdi.status,
    comentarios: pdi.comentarios,
    concluido_por: pdi.concluidoPor || null,
    concluido_em: pdi.concluidoEm,
  };
}

function toRowItem(item: PdiItem) {
  return {
    id: item.id,
    pdi_id: item.pdiId,
    competencia_id: item.competenciaId || null,
    competencia_nome: item.competenciaNome,
    tipo_competencia: item.tipoCompetencia,
    nota_obtida: item.notaObtida,
    origem_manual: item.origemManual,
    objetivo_desenvolvimento: item.objetivoDesenvolvimento,
    responsavel: item.responsavel,
    data_inicio: item.dataInicio,
    data_prevista_conclusao: item.dataPrevistaConclusao,
    status: item.status,
    observacoes: item.observacoes,
    ordem: item.ordem,
  };
}

function toRowAcao(acao: PdiAcao) {
  return {
    id: acao.id,
    item_id: acao.itemId,
    descricao: acao.descricao,
    responsavel: acao.responsavel,
    prazo: acao.prazo,
    status: acao.status,
    ordem: acao.ordem,
    evidencia_storage_path: acao.evidenciaStoragePath,
    evidencia_file_name: acao.evidenciaFileName,
    evidencia_uploaded_em: acao.evidenciaUploadedEm,
    evidencia_uploaded_por: acao.evidenciaUploadedPor,
  };
}

const EVIDENCIAS_BUCKET = "pdi-evidencias";

/** Caminho sugerido: {acaoId}/{timestamp}-{nome do arquivo} — mesmo padrão
 * já usado pra certificados no Treinamentos MSB. Sobrescreve qualquer
 * evidência anterior daquela ação (upsert: true) — só existe uma evidência
 * por ação de cada vez, anexar de novo substitui a anterior. */
export async function uploadEvidenciaPdiAcao(acaoId: string, file: File): Promise<{ path: string }> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();
  const path = `${acaoId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from(EVIDENCIAS_BUCKET).upload(path, file, { upsert: true });
  if (error) throw new Error(`Falha ao enviar evidência: ${error.message}`);
  return { path };
}

export async function getEvidenciaPdiAcaoSignedUrl(path: string, expiresInSeconds = 300): Promise<string> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();
  const { data, error } = await supabase.storage.from(EVIDENCIAS_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(`Falha ao gerar link da evidência: ${error?.message ?? "erro desconhecido"}`);
  return data.signedUrl;
}

export async function removerEvidenciaPdiAcao(path: string): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();
  const { error } = await supabase.storage.from(EVIDENCIAS_BUCKET).remove([path]);
  if (error) throw new Error(`Falha ao remover evidência: ${error.message}`);
}

/** Carrega todos os PDIs com seus itens/ações já montados em árvore — 3
 * consultas simples (sem join) e agrupamento no cliente, mesmo espírito de
 * simplicidade do resto do repositório (as árvores são pequenas). */
export async function getPdi(): Promise<Pdi[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const [{ data: pdiData, error: pdiError }, { data: itensData, error: itensError }, { data: acoesData, error: acoesError }] =
    await Promise.all([
      supabase.from("peopleflow_pdi").select("*").not("ciclo_id", "is", null).order("criado_em", { ascending: false }),
      supabase.from("peopleflow_pdi_itens").select("*").order("ordem"),
      supabase.from("peopleflow_pdi_acoes").select("*").order("ordem"),
    ]);

  if (pdiError) throw new Error(`Falha ao carregar PDI do Supabase: ${pdiError.message}`);
  if (itensError) throw new Error(`Falha ao carregar itens do PDI do Supabase: ${itensError.message}`);
  if (acoesError) throw new Error(`Falha ao carregar ações do PDI do Supabase: ${acoesError.message}`);

  const acoesPorItem = new Map<string, PdiAcao[]>();
  for (const row of (acoesData as PdiAcaoRow[]) ?? []) {
    const acao = fromRowAcao(row);
    const lista = acoesPorItem.get(acao.itemId) ?? [];
    lista.push(acao);
    acoesPorItem.set(acao.itemId, lista);
  }

  const itensPorPdi = new Map<number, PdiItem[]>();
  for (const row of (itensData as PdiItemRow[]) ?? []) {
    const item = fromRowItem(row);
    item.acoes = acoesPorItem.get(item.id) ?? [];
    const lista = itensPorPdi.get(item.pdiId) ?? [];
    lista.push(item);
    itensPorPdi.set(item.pdiId, lista);
  }

  return ((pdiData as PdiRow[]) ?? []).map((row) => {
    const pdi = fromRowPdi(row);
    pdi.itens = itensPorPdi.get(pdi.id) ?? [];
    return pdi;
  });
}

/** Gera um PDI novo — cabeçalho primeiro (pega o id bigint gerado pelo
 * Supabase via `.select().single()`), depois itens/ações em lote (ids já
 * gerados no cliente, agora com pdi_id/item_id conhecidos).
 *
 * Validação contra duplicidade: confere no banco (não no estado local, que
 * pode estar desatualizado numa corrida real de RH+gestor concluindo a
 * mesma avaliação quase ao mesmo tempo) se já existe um PDI pra esse
 * (colaborador, ciclo) antes de inserir — mesmo padrão de
 * criarCicloComAvaliacoes(). Retorna `null` se já existia (a chamada não
 * cria um segundo). */
export async function criarPdi(pdi: Pdi): Promise<Pdi | null> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data: existente, error: errorExistente } = await supabase
    .from("peopleflow_pdi")
    .select("id")
    .eq("colaborador_nome", pdi.colaboradorNome)
    .eq("ciclo_id", pdi.cicloId)
    .maybeSingle();
  if (errorExistente) throw new Error(`Falha ao validar PDI já existente no Supabase: ${errorExistente.message}`);
  if (existente) return null;

  const { data: cabecalho, error: errorCabecalho } = await supabase
    .from("peopleflow_pdi")
    .insert(toRowPdi(pdi))
    .select()
    .single();
  if (errorCabecalho) throw new Error(`Falha ao criar PDI no Supabase: ${errorCabecalho.message}`);

  const pdiId = (cabecalho as PdiRow).id;
  const itensComPdiId = pdi.itens.map((item) => ({ ...item, pdiId }));

  if (itensComPdiId.length > 0) {
    const { error: errorItens } = await supabase.from("peopleflow_pdi_itens").insert(itensComPdiId.map(toRowItem));
    if (errorItens) throw new Error(`Falha ao criar itens do PDI no Supabase: ${errorItens.message}`);
  }

  const todasAcoes = itensComPdiId.flatMap((item) => item.acoes);
  if (todasAcoes.length > 0) {
    const { error: errorAcoes } = await supabase.from("peopleflow_pdi_acoes").insert(todasAcoes.map(toRowAcao));
    if (errorAcoes) throw new Error(`Falha ao criar ações do PDI no Supabase: ${errorAcoes.message}`);
  }

  return { ...fromRowPdi(cabecalho as PdiRow), itens: itensComPdiId };
}

export class PdiConflitoError extends Error {
  constructor() {
    super("Este PDI foi alterado por outra pessoa — feche e abra de novo antes de salvar.");
    this.name = "PdiConflitoError";
  }
}

/** Salva um PDI existente — atualiza o cabeçalho e substitui por completo os
 * itens/ações (apaga tudo e reinsere a árvore atual; as árvores são
 * pequenas, não compensa diff). `updatedAtAnterior` é o valor de
 * `updated_at` lido por último (antes desta edição) — o update do
 * cabeçalho só afeta a linha se ainda bater com esse valor (trava de
 * concorrência otimista); se ninguém for afetado, alguém salvou por cima
 * entre a leitura e esta gravação, e lançamos PdiConflitoError em vez de
 * apagar o trabalho da outra pessoa silenciosamente. */
export async function salvarPdi(pdi: Pdi, updatedAtAnterior: string): Promise<Pdi> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data: atualizado, error: errorUpdate } = await supabase
    .from("peopleflow_pdi")
    .update({ ...toRowPdi(pdi), updated_at: new Date().toISOString() })
    .eq("id", pdi.id)
    .eq("updated_at", updatedAtAnterior)
    .select()
    .maybeSingle();
  if (errorUpdate) throw new Error(`Falha ao salvar PDI no Supabase: ${errorUpdate.message}`);
  if (!atualizado) throw new PdiConflitoError();

  const { data: itensExistentes, error: errorSelectItens } = await supabase
    .from("peopleflow_pdi_itens")
    .select("id")
    .eq("pdi_id", pdi.id);
  if (errorSelectItens) throw new Error(`Falha ao ler itens existentes do PDI no Supabase: ${errorSelectItens.message}`);

  const idsExistentes = (itensExistentes ?? []).map((r) => (r as { id: string }).id);
  if (idsExistentes.length > 0) {
    const { error: errorDeleteAcoes } = await supabase.from("peopleflow_pdi_acoes").delete().in("item_id", idsExistentes);
    if (errorDeleteAcoes) throw new Error(`Falha ao limpar ações do PDI no Supabase: ${errorDeleteAcoes.message}`);
  }
  const { error: errorDeleteItens } = await supabase.from("peopleflow_pdi_itens").delete().eq("pdi_id", pdi.id);
  if (errorDeleteItens) throw new Error(`Falha ao limpar itens do PDI no Supabase: ${errorDeleteItens.message}`);

  if (pdi.itens.length > 0) {
    const { error: errorItens } = await supabase.from("peopleflow_pdi_itens").insert(pdi.itens.map(toRowItem));
    if (errorItens) throw new Error(`Falha ao salvar itens do PDI no Supabase: ${errorItens.message}`);
  }
  const todasAcoes = pdi.itens.flatMap((item) => item.acoes);
  if (todasAcoes.length > 0) {
    const { error: errorAcoes } = await supabase.from("peopleflow_pdi_acoes").insert(todasAcoes.map(toRowAcao));
    if (errorAcoes) throw new Error(`Falha ao salvar ações do PDI no Supabase: ${errorAcoes.message}`);
  }

  return { ...fromRowPdi(atualizado as PdiRow), itens: pdi.itens };
}

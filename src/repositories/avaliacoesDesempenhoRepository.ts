// Camada de acesso à tabela `peopleflow_avaliacoes_desempenho`. RLS libera
// qualquer autenticado, mesmo padrão de avaliacoesExperienciaRepository.ts.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { AvaliacaoDesempenho, ResultadoComportamental, ResultadoKpi, StatusAvaliacaoDesempenho } from "../types/domain";

interface AvaliacaoDesempenhoRow {
  id: string;
  colaborador_nome: string;
  cargo: string | null;
  departamento: string | null;
  gestor_avaliador: string | null;
  ciclo_id: string | null;
  ciclo: string;
  status: string;
  resultados_comportamentais: ResultadoComportamental[] | null;
  resultados_kpis: ResultadoKpi[] | null;
  comentario_comportamental: string | null;
  comentario_tecnico: string | null;
  comentario_geral: string | null;
  avaliado_por: string | null;
  concluido_por: string | null;
  concluido_em: string | null;
  nota_final: number | null;
  media_tecnica: number | null;
  media_comportamental: number | null;
  criado_em: string;
  updated_at: string;
}

function fromRow(row: AvaliacaoDesempenhoRow): AvaliacaoDesempenho {
  return {
    id: row.id,
    colaboradorNome: row.colaborador_nome,
    cargo: row.cargo ?? "",
    departamento: row.departamento ?? "",
    gestorAvaliador: row.gestor_avaliador ?? "",
    cicloId: row.ciclo_id ?? "",
    ciclo: row.ciclo,
    status: row.status as StatusAvaliacaoDesempenho,
    resultadosComportamentais: row.resultados_comportamentais ?? [],
    resultadosKpis: row.resultados_kpis ?? [],
    comentarioComportamental: row.comentario_comportamental ?? "",
    comentarioTecnico: row.comentario_tecnico ?? "",
    comentarioGeral: row.comentario_geral ?? "",
    avaliadoPor: row.avaliado_por ?? "",
    concluidoPor: row.concluido_por ?? "",
    concluidoEm: row.concluido_em,
    notaFinal: row.nota_final,
    mediaTecnica: row.media_tecnica,
    mediaComportamental: row.media_comportamental,
    criadoEm: row.criado_em,
    updatedAt: row.updated_at,
  };
}

function toRow(a: AvaliacaoDesempenho) {
  return {
    id: a.id,
    colaborador_nome: a.colaboradorNome,
    cargo: a.cargo || null,
    departamento: a.departamento || null,
    gestor_avaliador: a.gestorAvaliador || null,
    ciclo_id: a.cicloId,
    ciclo: a.ciclo,
    status: a.status,
    resultados_comportamentais: a.resultadosComportamentais,
    resultados_kpis: a.resultadosKpis,
    comentario_comportamental: a.comentarioComportamental,
    comentario_tecnico: a.comentarioTecnico,
    comentario_geral: a.comentarioGeral,
    avaliado_por: a.avaliadoPor || null,
    concluido_por: a.concluidoPor || null,
    concluido_em: a.concluidoEm,
    nota_final: a.notaFinal,
    media_tecnica: a.mediaTecnica,
    media_comportamental: a.mediaComportamental,
  };
}

export async function getAvaliacoesDesempenho(): Promise<AvaliacaoDesempenho[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_avaliacoes_desempenho").select("*").order("criado_em", { ascending: false });
  if (error) throw new Error(`Falha ao carregar avaliações de desempenho do Supabase: ${error.message}`);
  return (data as AvaliacaoDesempenhoRow[]).map(fromRow);
}

/** Bulk-insert usado só na abertura de um ciclo (uma avaliação por colaborador ativo). */
export async function criarAvaliacoesDesempenho(avaliacoes: AvaliacaoDesempenho[]): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();
  if (avaliacoes.length === 0) return;

  const { error } = await supabase.from("peopleflow_avaliacoes_desempenho").insert(avaliacoes.map(toRow));
  if (error) throw new Error(`Falha ao gerar avaliações de desempenho no Supabase: ${error.message}`);
}

/** Usado tanto por "Salvar progresso" quanto "Concluir avaliação" — o
 * chamador decide o `status` a gravar. */
export async function atualizarAvaliacaoDesempenho(avaliacao: AvaliacaoDesempenho): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase
    .from("peopleflow_avaliacoes_desempenho")
    .update({ ...toRow(avaliacao), updated_at: new Date().toISOString() })
    .eq("id", avaliacao.id);
  if (error) throw new Error(`Falha ao salvar avaliação de desempenho no Supabase: ${error.message}`);
}

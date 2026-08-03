// Camada de acesso à tabela `peopleflow_avaliacoes_desempenho`. RLS libera
// qualquer autenticado, mesmo padrão de avaliacoesExperienciaRepository.ts.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { AvaliacaoDesempenho, ResultadoComportamental, ResultadoKpi, StatusAvaliacaoDesempenho, TipoAvaliacaoDesempenho } from "../types/domain";

interface AvaliacaoDesempenhoRow {
  id: string;
  tipo: string;
  colaborador_nome: string;
  avaliado: string | null;
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
  status_calibracao: string | null;
  media_comportamental_calibrada: number | null;
  nota_final_oficial: number | null;
  justificativa_calibracao: string | null;
  calibrado_por: string | null;
  calibrado_em: string | null;
  homologado_por: string | null;
  homologado_em: string | null;
  devolutiva_realizada: boolean | null;
  devolutiva_por: string | null;
  devolutiva_em: string | null;
  criado_em: string;
  updated_at: string;
}

function fromRow(row: AvaliacaoDesempenhoRow): AvaliacaoDesempenho {
  return {
    id: row.id,
    tipo: row.tipo as TipoAvaliacaoDesempenho,
    colaboradorNome: row.colaborador_nome,
    avaliado: row.avaliado ?? row.colaborador_nome,
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
    statusCalibracao: (row.status_calibracao as AvaliacaoDesempenho["statusCalibracao"]) ?? "Não iniciada",
    mediaComportamentalCalibrada: row.media_comportamental_calibrada,
    notaFinalOficial: row.nota_final_oficial,
    justificativaCalibracao: row.justificativa_calibracao ?? "",
    calibradoPor: row.calibrado_por ?? "",
    calibradoEm: row.calibrado_em,
    homologadoPor: row.homologado_por ?? "",
    homologadoEm: row.homologado_em,
    devolutivaRealizada: row.devolutiva_realizada ?? false,
    devolutivaPor: row.devolutiva_por ?? "",
    devolutivaEm: row.devolutiva_em,
    criadoEm: row.criado_em,
    updatedAt: row.updated_at,
  };
}

// Tipado contra a Row (menos id/criado_em/updated_at, geridos à parte) —
// garante em tempo de compilação que nenhum campo novo fique esquecido
// aqui (achado da revisão adversarial: um toRow() incompleto faz a
// gravação "funcionar" no estado local e sumir num reload, silenciosamente).
function toRow(a: AvaliacaoDesempenho): Omit<AvaliacaoDesempenhoRow, "id" | "criado_em" | "updated_at"> {
  return {
    tipo: a.tipo,
    colaborador_nome: a.colaboradorNome,
    avaliado: a.avaliado || null,
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
    status_calibracao: a.statusCalibracao,
    media_comportamental_calibrada: a.mediaComportamentalCalibrada,
    nota_final_oficial: a.notaFinalOficial,
    justificativa_calibracao: a.justificativaCalibracao,
    calibrado_por: a.calibradoPor || null,
    calibrado_em: a.calibradoEm,
    homologado_por: a.homologadoPor || null,
    homologado_em: a.homologadoEm,
    devolutiva_realizada: a.devolutivaRealizada,
    devolutiva_por: a.devolutivaPor || null,
    devolutiva_em: a.devolutivaEm,
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

  const { error } = await supabase.from("peopleflow_avaliacoes_desempenho").insert(avaliacoes.map((a) => ({ id: a.id, ...toRow(a) })));
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

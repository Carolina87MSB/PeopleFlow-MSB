// Camada de acesso à tabela `peopleflow_avaliacoes_desempenho` — etapa 1: só
// leitura (o fluxo de criação de avaliação chega numa próxima etapa). RLS
// libera qualquer autenticado, mesmo padrão de avaliacoesExperienciaRepository.ts.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { AvaliacaoDesempenho, ResultadoComportamental, ResultadoKpi } from "../types/domain";

interface AvaliacaoDesempenhoRow {
  id: string;
  colaborador_nome: string;
  ciclo: string;
  status: string;
  resultados_comportamentais: ResultadoComportamental[] | null;
  resultados_kpis: ResultadoKpi[] | null;
  comentario_comportamental: string | null;
  comentario_tecnico: string | null;
  comentario_geral: string | null;
  avaliado_por: string | null;
  criado_em: string;
  updated_at: string;
}

function fromRow(row: AvaliacaoDesempenhoRow): AvaliacaoDesempenho {
  return {
    id: row.id,
    colaboradorNome: row.colaborador_nome,
    ciclo: row.ciclo,
    status: row.status,
    resultadosComportamentais: row.resultados_comportamentais ?? [],
    resultadosKpis: row.resultados_kpis ?? [],
    comentarioComportamental: row.comentario_comportamental ?? "",
    comentarioTecnico: row.comentario_tecnico ?? "",
    comentarioGeral: row.comentario_geral ?? "",
    avaliadoPor: row.avaliado_por ?? "",
    criadoEm: row.criado_em,
    updatedAt: row.updated_at,
  };
}

export async function getAvaliacoesDesempenho(): Promise<AvaliacaoDesempenho[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_avaliacoes_desempenho").select("*").order("criado_em", { ascending: false });
  if (error) throw new Error(`Falha ao carregar avaliações de desempenho do Supabase: ${error.message}`);
  return (data as AvaliacaoDesempenhoRow[]).map(fromRow);
}

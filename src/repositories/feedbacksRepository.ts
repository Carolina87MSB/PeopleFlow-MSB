// Camada de acesso à tabela `peopleflow_feedbacks` — histórico contínuo de
// feedbacks de gestão, independente de AVD/PDI/ciclo. RLS libera qualquer
// autenticado, mesmo padrão do resto do módulo de Gestão de Desempenho
// (peopleflow_pdi/peopleflow_movimentacoes).

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { Feedback, TemaFeedback } from "../types/domain";

interface FeedbackRow {
  id: number;
  colaborador_nome: string;
  gestor_nome: string;
  data_feedback: string;
  tema: string;
  comentarios: string;
  criado_em: string;
}

function fromRow(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    colaboradorNome: row.colaborador_nome,
    gestorNome: row.gestor_nome,
    dataFeedback: row.data_feedback,
    tema: row.tema as TemaFeedback,
    comentarios: row.comentarios,
    criadoEm: row.criado_em,
  };
}

export async function getFeedbacks(): Promise<Feedback[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_feedbacks").select("*").order("data_feedback", { ascending: false });
  if (error) throw new Error(`Falha ao carregar feedbacks do Supabase: ${error.message}`);
  return (data as FeedbackRow[]).map(fromRow);
}

export async function registrarFeedback(input: {
  colaboradorNome: string;
  gestorNome: string;
  dataFeedback: string;
  tema: TemaFeedback;
  comentarios: string;
}): Promise<Feedback> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase
    .from("peopleflow_feedbacks")
    .insert({
      colaborador_nome: input.colaboradorNome,
      gestor_nome: input.gestorNome,
      data_feedback: input.dataFeedback,
      tema: input.tema,
      comentarios: input.comentarios,
    })
    .select()
    .single();
  if (error) throw new Error(`Falha ao registrar feedback no Supabase: ${error.message}`);
  return fromRow(data as FeedbackRow);
}

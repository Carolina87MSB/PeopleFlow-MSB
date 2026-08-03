// Camada de acesso à tabela `peopleflow_config_avaliacao_desempenho` — linha
// única (id sempre "default"). RLS libera qualquer autenticado, mesmo padrão
// de avaliacoesExperienciaRepository.ts.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { ConfigAvaliacaoDesempenho } from "../types/domain";

const ID_CONFIG = "default";

interface ConfigAvaliacaoDesempenhoRow {
  peso_kpis: number;
  peso_comportamental: number;
  nota_minima_pdi: number | null;
  updated_at: string;
  updated_by: string | null;
}

function fromRow(row: ConfigAvaliacaoDesempenhoRow): ConfigAvaliacaoDesempenho {
  return {
    pesoKpis: row.peso_kpis,
    pesoComportamental: row.peso_comportamental,
    notaMinimaPdi: row.nota_minima_pdi ?? 3,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? "",
  };
}

/** Retorna a configuração (peso dos blocos); null se a linha ainda não foi criada — nesse caso a tela usa os padrões 60/40. */
export async function getConfigAvaliacaoDesempenho(): Promise<ConfigAvaliacaoDesempenho | null> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase
    .from("peopleflow_config_avaliacao_desempenho")
    .select("*")
    .eq("id", ID_CONFIG)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar configuração da Avaliação de Desempenho do Supabase: ${error.message}`);
  return data ? fromRow(data as ConfigAvaliacaoDesempenhoRow) : null;
}

export async function atualizarConfigAvaliacaoDesempenho(
  pesoKpis: number,
  pesoComportamental: number,
  notaMinimaPdi: number,
  editadoPor: string,
): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("peopleflow_config_avaliacao_desempenho").upsert(
    {
      id: ID_CONFIG,
      peso_kpis: pesoKpis,
      peso_comportamental: pesoComportamental,
      nota_minima_pdi: notaMinimaPdi,
      updated_at: new Date().toISOString(),
      updated_by: editadoPor,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`Falha ao atualizar configuração da Avaliação de Desempenho no Supabase: ${error.message}`);
}

// Camada de acesso à tabela `peopleflow_config_dashboard` — linha única (id
// sempre "default"). RLS libera qualquer autenticado, mesmo padrão de
// configAvaliacaoDesempenhoRepository.ts.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { ConfigDashboard } from "../types/domain";

const ID_CONFIG = "default";

interface ConfigDashboardRow {
  headcount_planejado: number | null;
  updated_at: string;
  updated_by: string | null;
}

function fromRow(row: ConfigDashboardRow): ConfigDashboard {
  return {
    headcountPlanejado: row.headcount_planejado,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? "",
  };
}

/** Retorna a configuração do Dashboard Executivo; null se a linha ainda não foi criada — nesse caso a tela trata Headcount Planejado como "ainda não definido". */
export async function getConfigDashboard(): Promise<ConfigDashboard | null> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_config_dashboard").select("*").eq("id", ID_CONFIG).maybeSingle();

  if (error) throw new Error(`Falha ao carregar configuração do Dashboard Executivo do Supabase: ${error.message}`);
  return data ? fromRow(data as ConfigDashboardRow) : null;
}

export async function atualizarConfigDashboard(headcountPlanejado: number, editadoPor: string): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("peopleflow_config_dashboard").upsert(
    {
      id: ID_CONFIG,
      headcount_planejado: headcountPlanejado,
      updated_at: new Date().toISOString(),
      updated_by: editadoPor,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`Falha ao atualizar configuração do Dashboard Executivo no Supabase: ${error.message}`);
}

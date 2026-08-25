// Camada de acesso à tabela `peopleflow_config_encargos_folha` — linha única
// (id sempre "default"). RLS libera qualquer autenticado, mesmo padrão de
// configDashboardRepository.ts. Só leitura por ora — sem tela de edição
// ainda (RH define os componentes/percentuais via SQL, ver schema.sql seção 23).

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { ComponenteEncargoFolha, ConfigEncargosFolha } from "../types/domain";

const ID_CONFIG = "default";

interface ConfigEncargosFolhaRow {
  componentes: ComponenteEncargoFolha[] | null;
  updated_at: string;
  updated_by: string | null;
}

function fromRow(row: ConfigEncargosFolhaRow): ConfigEncargosFolha {
  return {
    componentes: row.componentes ?? [],
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? "",
  };
}

/** `null` quando a linha ainda não foi criada — tratado igual a "componentes: []" (ainda não parametrizado) pelo call site. */
export async function getConfigEncargosFolha(): Promise<ConfigEncargosFolha | null> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_config_encargos_folha").select("*").eq("id", ID_CONFIG).maybeSingle();

  if (error) throw new Error(`Falha ao carregar configuração de encargos de folha do Supabase: ${error.message}`);
  return data ? fromRow(data as ConfigEncargosFolhaRow) : null;
}

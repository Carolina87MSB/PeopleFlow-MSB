// Camada de acesso à tabela `peopleflow_config_encargos_folha` — linha única
// (id sempre "default"). RLS libera qualquer autenticado, mesmo padrão de
// configDashboardRepository.ts. Só leitura por ora — sem tela de edição
// ainda (RH define os percentuais via SQL, ver schema.sql seção 23).

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { ConfigEncargosFolha } from "../types/domain";

const ID_CONFIG = "default";

interface ConfigEncargosFolhaRow {
  inss_patronal: number;
  rat: number;
  rat_observacao: string | null;
  terceiros: number;
  fgts_celetista: number;
  fgts_aprendiz: number;
  provisao_decimo_terceiro: number;
  provisao_ferias: number;
  provisao_terco_ferias: number;
  updated_at: string;
  updated_by: string | null;
}

function fromRow(row: ConfigEncargosFolhaRow): ConfigEncargosFolha {
  return {
    inssPatronal: row.inss_patronal,
    rat: row.rat,
    ratObservacao: row.rat_observacao ?? "",
    terceiros: row.terceiros,
    fgtsCeletista: row.fgts_celetista,
    fgtsAprendiz: row.fgts_aprendiz,
    provisaoDecimoTerceiro: row.provisao_decimo_terceiro,
    provisaoFerias: row.provisao_ferias,
    provisaoTercoFerias: row.provisao_terco_ferias,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? "",
  };
}

/** `null` quando a linha ainda não foi criada — custoMensalFolha() trata isso como "ainda não parametrizado". */
export async function getConfigEncargosFolha(): Promise<ConfigEncargosFolha | null> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_config_encargos_folha").select("*").eq("id", ID_CONFIG).maybeSingle();

  if (error) throw new Error(`Falha ao carregar configuração de encargos de folha do Supabase: ${error.message}`);
  return data ? fromRow(data as ConfigEncargosFolhaRow) : null;
}

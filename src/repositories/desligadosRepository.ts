// Camada de acesso à tabela `peopleflow_desligamentos` — fechamento
// financeiro (rescisão, GRRF) de colaboradores desligados. Exclusiva deste
// portal; o status de desligamento em si vem de `colaboradores` (ver
// colaboradoresRepository.ts), gravado pelo Portal SST.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { DesligamentoFinanceiro } from "../types/domain";

interface DesligamentoRow {
  colaborador_nome: string;
  valor_rescisao: number | null;
  valor_grrf: number | null;
  updated_at: string;
  updated_by: string | null;
}

function fromRow(row: DesligamentoRow): DesligamentoFinanceiro {
  return {
    colaboradorNome: row.colaborador_nome,
    valorRescisao: row.valor_rescisao,
    valorGrrf: row.valor_grrf,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? "",
  };
}

export async function getDesligamentosFinanceiros(): Promise<DesligamentoFinanceiro[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_desligamentos").select("*");
  if (error) throw new Error(`Falha ao carregar fechamento financeiro do Supabase: ${error.message}`);
  return (data as DesligamentoRow[]).map(fromRow);
}

export async function salvarFechamentoFinanceiro(
  colaboradorNome: string,
  valorRescisao: number | null,
  valorGrrf: number | null,
  updatedBy: string,
): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("peopleflow_desligamentos").upsert(
    {
      colaborador_nome: colaboradorNome,
      valor_rescisao: valorRescisao,
      valor_grrf: valorGrrf,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: "colaborador_nome" },
  );
  if (error) throw new Error(`Falha ao salvar fechamento financeiro no Supabase: ${error.message}`);
}

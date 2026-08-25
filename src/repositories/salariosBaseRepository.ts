// Camada de acesso à tabela `peopleflow_salarios_base` — fallback de
// salário importado de planilha, usado só quando o colaborador não tem
// nenhum salário derivável de movimentação de pessoal (ver salarioVigente()
// em domain/salario.ts). RLS libera qualquer autenticado, mesmo padrão das
// demais tabelas deste projeto.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { SalarioBase } from "../types/domain";

interface SalarioBaseRow {
  colaborador_nome: string;
  salario: number;
  importado_em: string;
  importado_por: string | null;
}

function fromRow(row: SalarioBaseRow): SalarioBase {
  return {
    colaboradorNome: row.colaborador_nome,
    salario: row.salario,
    importadoEm: row.importado_em,
    importadoPor: row.importado_por ?? "",
  };
}

export async function getSalariosBase(): Promise<SalarioBase[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_salarios_base").select("colaborador_nome, salario, importado_em, importado_por");

  if (error) throw new Error(`Falha ao carregar salários base do Supabase: ${error.message}`);
  return (data as SalarioBaseRow[]).map(fromRow);
}

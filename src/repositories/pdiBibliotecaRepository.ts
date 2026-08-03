// Camada de acesso à tabela `peopleflow_pdi_biblioteca` — modelos de
// objetivo/ações por competência, mantidos pelo RH. RLS libera qualquer
// autenticado, mesmo padrão do resto do módulo.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { PdiBibliotecaItem, TipoCompetenciaPdi } from "../types/domain";

interface PdiBibliotecaRow {
  chave: string;
  tipo_competencia: string;
  objetivo_sugerido: string;
  acoes_sugeridas: string[];
  updated_at: string;
  updated_by: string | null;
}

function fromRow(row: PdiBibliotecaRow): PdiBibliotecaItem {
  return {
    chave: row.chave,
    tipoCompetencia: row.tipo_competencia as TipoCompetenciaPdi,
    objetivoSugerido: row.objetivo_sugerido,
    acoesSugeridas: row.acoes_sugeridas ?? [],
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? "",
  };
}

export async function getPdiBiblioteca(): Promise<PdiBibliotecaItem[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_pdi_biblioteca").select("*").order("chave");
  if (error) throw new Error(`Falha ao carregar biblioteca de PDI do Supabase: ${error.message}`);
  return (data as PdiBibliotecaRow[]).map(fromRow);
}

/** Cria ou atualiza um modelo (upsert pela chave composta chave+tipo). */
export async function salvarItemBiblioteca(item: PdiBibliotecaItem, editadoPor: string): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("peopleflow_pdi_biblioteca").upsert(
    {
      chave: item.chave,
      tipo_competencia: item.tipoCompetencia,
      objetivo_sugerido: item.objetivoSugerido,
      acoes_sugeridas: item.acoesSugeridas,
      updated_at: new Date().toISOString(),
      updated_by: editadoPor,
    },
    { onConflict: "chave,tipo_competencia" },
  );
  if (error) throw new Error(`Falha ao salvar modelo da biblioteca de PDI no Supabase: ${error.message}`);
}

export async function excluirItemBiblioteca(chave: string, tipoCompetencia: TipoCompetenciaPdi): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase
    .from("peopleflow_pdi_biblioteca")
    .delete()
    .eq("chave", chave)
    .eq("tipo_competencia", tipoCompetencia);
  if (error) throw new Error(`Falha ao excluir modelo da biblioteca de PDI no Supabase: ${error.message}`);
}

// Camada de acesso à tabela `peopleflow_competencias_comportamentais` —
// catálogo corporativo de competências comportamentais da Avaliação de
// Desempenho. RLS libera qualquer autenticado, mesmo padrão de
// avaliacoesExperienciaRepository.ts.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { CompetenciaComportamental } from "../types/domain";

interface CompetenciaComportamentalRow {
  id: string;
  nome: string;
  descricao: string | null;
  afirmacoes: string[] | null;
  ordem: number;
  ativo: boolean;
  updated_at: string;
  updated_by: string | null;
}

function fromRow(row: CompetenciaComportamentalRow): CompetenciaComportamental {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao ?? "",
    afirmacoes: row.afirmacoes ?? [],
    ordem: row.ordem,
    ativo: row.ativo,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? "",
  };
}

export async function getCompetenciasComportamentais(): Promise<CompetenciaComportamental[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_competencias_comportamentais").select("*").order("ordem");
  if (error) throw new Error(`Falha ao carregar competências comportamentais do Supabase: ${error.message}`);
  return (data as CompetenciaComportamentalRow[]).map(fromRow);
}

/** Cria ou atualiza uma competência (upsert por id) — usado tanto pra cadastrar uma nova quanto pra editar uma existente. */
export async function salvarCompetenciaComportamental(competencia: CompetenciaComportamental, editadoPor: string): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("peopleflow_competencias_comportamentais").upsert(
    {
      id: competencia.id,
      nome: competencia.nome,
      descricao: competencia.descricao,
      afirmacoes: competencia.afirmacoes,
      ordem: competencia.ordem,
      ativo: competencia.ativo,
      updated_at: new Date().toISOString(),
      updated_by: editadoPor,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`Falha ao salvar competência comportamental no Supabase: ${error.message}`);
}

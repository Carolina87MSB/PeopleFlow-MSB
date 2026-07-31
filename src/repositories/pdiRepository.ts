// Camada de acesso à tabela `peopleflow_pdi` — etapa 1: só leitura (a
// geração de ações a partir de avaliações chega numa próxima etapa). RLS
// libera qualquer autenticado, mesmo padrão de avaliacoesExperienciaRepository.ts.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { Pdi } from "../types/domain";

interface PdiRow {
  id: number;
  colaborador_nome: string;
  avaliacao_id: string | null;
  origem: string | null;
  acao: string;
  prazo: string | null;
  status: string;
  responsavel: string | null;
  criado_em: string;
  updated_at: string;
}

function fromRow(row: PdiRow): Pdi {
  return {
    id: row.id,
    colaboradorNome: row.colaborador_nome,
    avaliacaoId: row.avaliacao_id,
    origem: row.origem ?? "",
    acao: row.acao,
    prazo: row.prazo,
    status: row.status,
    responsavel: row.responsavel ?? "",
    criadoEm: row.criado_em,
    updatedAt: row.updated_at,
  };
}

export async function getPdi(): Promise<Pdi[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_pdi").select("*").order("criado_em", { ascending: false });
  if (error) throw new Error(`Falha ao carregar PDI do Supabase: ${error.message}`);
  return (data as PdiRow[]).map(fromRow);
}

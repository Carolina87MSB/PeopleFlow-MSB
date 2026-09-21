// Camada de acesso ao catálogo próprio de competências comportamentais da
// Descrição de Cargo (`peopleflow_catalogo_competencias_cargo`) e à relação
// Cargo × Competência (`peopleflow_descricao_cargo_competencias`) — RLS
// libera qualquer autenticado, mesmo padrão do resto do módulo de Cargos.
// Estrutura própria do PeopleFlow (RH, 2026-09) — não é o catálogo da AVD
// (peopleflow_competencias_comportamentais) nem nada do Portal de
// Treinamentos. Ver comentário da seção 33 em supabase/schema.sql.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { CompetenciaCargoCatalogo, DescricaoCargoCompetencia } from "../types/domain";

interface CompetenciaCargoCatalogoRow {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  ordem: number;
}

interface DescricaoCargoCompetenciaRow {
  cargo_nome: string;
  competencia_id: string;
  origem: string;
  created_at: string;
  created_by: string | null;
}

function fromRowCatalogo(row: CompetenciaCargoCatalogoRow): CompetenciaCargoCatalogo {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao ?? "",
    ativo: row.ativo,
    ordem: row.ordem,
  };
}

function fromRowRelacao(row: DescricaoCargoCompetenciaRow): DescricaoCargoCompetencia {
  return {
    cargoNome: row.cargo_nome,
    competenciaId: row.competencia_id,
    origem: row.origem === "Migração automática" ? "Migração automática" : "Manual",
    criadoEm: row.created_at,
    criadoPor: row.created_by ?? "",
  };
}

/** Catálogo fechado das 18 competências — só leitura pela tela de Cargos
 * (não há tela de edição do catálogo nesta etapa; ativo/ordem só servem
 * pra uma manutenção futura via SQL direto do RH). */
export async function getCatalogoCompetenciasCargo(): Promise<CompetenciaCargoCatalogo[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_catalogo_competencias_cargo").select("*").eq("ativo", true).order("ordem");
  if (error) throw new Error(`Falha ao carregar catálogo de competências do Supabase: ${error.message}`);
  return (data as CompetenciaCargoCatalogoRow[]).map(fromRowCatalogo);
}

export async function getDescricaoCargoCompetencias(): Promise<DescricaoCargoCompetencia[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_descricao_cargo_competencias").select("*");
  if (error) throw new Error(`Falha ao carregar competências dos cargos do Supabase: ${error.message}`);
  return (data as DescricaoCargoCompetenciaRow[]).map(fromRowRelacao);
}

/** Idempotente (`on conflict do nothing`) — clicar 2x na mesma competência,
 * ou uma corrida entre 2 abas, nunca gera erro nem duplicidade (a
 * constraint unique(cargo_nome, competencia_id) já garante isso no banco;
 * aqui só evitamos que isso apareça como uma falha pro usuário). */
export async function adicionarCompetenciaCargo(cargoNome: string, competenciaId: string, criadoPor: string): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase
    .from("peopleflow_descricao_cargo_competencias")
    .upsert({ cargo_nome: cargoNome, competencia_id: competenciaId, created_by: criadoPor }, { onConflict: "cargo_nome,competencia_id", ignoreDuplicates: true });
  if (error) throw new Error(`Falha ao adicionar competência ao cargo no Supabase: ${error.message}`);
}

export async function removerCompetenciaCargo(cargoNome: string, competenciaId: string): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase
    .from("peopleflow_descricao_cargo_competencias")
    .delete()
    .eq("cargo_nome", cargoNome)
    .eq("competencia_id", competenciaId);
  if (error) throw new Error(`Falha ao remover competência do cargo no Supabase: ${error.message}`);
}

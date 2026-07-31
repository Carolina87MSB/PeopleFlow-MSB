// Camada de acesso à tabela `peopleflow_kpis_cargo` — KPIs (Competências
// Técnicas) por cargo da Avaliação de Desempenho. RLS libera qualquer
// autenticado, mesmo padrão de avaliacoesExperienciaRepository.ts.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { KpiCargo } from "../types/domain";

interface KpiCargoRow {
  id: number;
  cargo_nome: string;
  nome_indicador: string;
  meta: number | null;
  unidade_medida: string | null;
  sentido_meta: string;
  peso: number | null;
  observacao: string | null;
  ordem: number;
  updated_at: string;
  updated_by: string | null;
}

function fromRow(row: KpiCargoRow): KpiCargo {
  return {
    id: row.id,
    cargoNome: row.cargo_nome,
    nomeIndicador: row.nome_indicador,
    meta: row.meta,
    unidadeMedida: row.unidade_medida ?? "",
    sentidoMeta: row.sentido_meta as KpiCargo["sentidoMeta"],
    peso: row.peso,
    observacao: row.observacao ?? "",
    ordem: row.ordem,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? "",
  };
}

export async function getKpisCargo(): Promise<KpiCargo[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_kpis_cargo").select("*").order("cargo_nome").order("ordem");
  if (error) throw new Error(`Falha ao carregar KPIs por cargo do Supabase: ${error.message}`);
  return (data as KpiCargoRow[]).map(fromRow);
}

export async function criarKpiCargo(kpi: Omit<KpiCargo, "id" | "updatedAt" | "updatedBy">, editadoPor: string): Promise<KpiCargo> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase
    .from("peopleflow_kpis_cargo")
    .insert({
      cargo_nome: kpi.cargoNome,
      nome_indicador: kpi.nomeIndicador,
      meta: kpi.meta,
      unidade_medida: kpi.unidadeMedida,
      sentido_meta: kpi.sentidoMeta,
      peso: kpi.peso,
      observacao: kpi.observacao,
      ordem: kpi.ordem,
      updated_by: editadoPor,
    })
    .select()
    .single();
  if (error) throw new Error(`Falha ao criar KPI no Supabase: ${error.message}`);
  return fromRow(data as KpiCargoRow);
}

export async function atualizarKpiCargo(kpi: KpiCargo, editadoPor: string): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase
    .from("peopleflow_kpis_cargo")
    .update({
      cargo_nome: kpi.cargoNome,
      nome_indicador: kpi.nomeIndicador,
      meta: kpi.meta,
      unidade_medida: kpi.unidadeMedida,
      sentido_meta: kpi.sentidoMeta,
      peso: kpi.peso,
      observacao: kpi.observacao,
      ordem: kpi.ordem,
      updated_at: new Date().toISOString(),
      updated_by: editadoPor,
    })
    .eq("id", kpi.id);
  if (error) throw new Error(`Falha ao atualizar KPI no Supabase: ${error.message}`);
}

export async function excluirKpiCargo(id: number): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("peopleflow_kpis_cargo").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir KPI no Supabase: ${error.message}`);
}

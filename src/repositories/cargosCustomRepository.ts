// Camada de acesso à tabela `peopleflow_cargos_custom` — cargos criados via
// movimentação "Novo Cargo" após aprovação final. Exclusiva deste portal.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { CargoCustom } from "../types/domain";

interface CargoCustomRow {
  nome: string;
  depto: string;
  gestor: string;
  vagas: string | null;
  faixa: string | null;
  nivel: string;
  descricao: string;
}

function fromRow(row: CargoCustomRow): CargoCustom {
  return {
    nome: row.nome,
    depto: row.depto,
    gestor: row.gestor,
    vagas: row.vagas ?? "",
    faixa: row.faixa ?? "",
    nivel: row.nivel,
    descricao: row.descricao === "OK" ? "OK" : "Pendente",
  };
}

export async function getCargosCustom(): Promise<CargoCustom[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_cargos_custom").select("*");
  if (error) throw new Error(`Falha ao carregar cargos personalizados do Supabase: ${error.message}`);
  return (data as CargoCustomRow[]).map(fromRow);
}

export async function criarCargoCustom(c: CargoCustom): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("peopleflow_cargos_custom").upsert(
    {
      nome: c.nome,
      depto: c.depto,
      gestor: c.gestor,
      vagas: c.vagas ?? "",
      faixa: c.faixa ?? "",
      nivel: c.nivel,
      descricao: c.descricao,
    },
    { onConflict: "nome" },
  );
  if (error) throw new Error(`Falha ao criar cargo personalizado no Supabase: ${error.message}`);
}

export async function atualizarDescricaoCargoCustom(nome: string, descricao: "OK" | "Pendente"): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("peopleflow_cargos_custom").update({ descricao }).eq("nome", nome);
  if (error) throw new Error(`Falha ao atualizar cargo personalizado no Supabase: ${error.message}`);
}

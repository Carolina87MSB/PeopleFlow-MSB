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

/** Cria um cargo só com nome/depto/gestor (botão "Novo Cargo" em
 * CargosPage.tsx) — 0 ocupantes até a primeira Admissão/Promoção/
 * Transferência ser concluída para ele. `nivel` sempre nasce "Novo cargo"
 * (mesmo marcador já usado quando uma movimentação de Novo Cargo é
 * aprovada) e `descricao` "Pendente", só pra manter a linha compatível com
 * o resto do schema — nenhum dos dois é lido pelo resto do app depois desta
 * etapa (a Descrição de Cargo real, com aprovação, é quem manda). */
export async function criarCargoCustom(nome: string, depto: string, gestor: string): Promise<CargoCustom> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("peopleflow_cargos_custom").insert({
    nome,
    depto,
    gestor,
    nivel: "Novo cargo",
    descricao: "Pendente",
  });
  if (error) throw new Error(`Falha ao criar cargo no Supabase: ${error.message}`);
  return { nome, depto, gestor, vagas: "", faixa: "", nivel: "Novo cargo", descricao: "Pendente" };
}

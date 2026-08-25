// Camada de acesso à tabela `peopleflow_reajustes_salariais` — reajustes
// salariais estruturados (ex.: resultado da AVD 2º Ciclo). RLS libera
// qualquer autenticado, mesmo padrão das demais tabelas deste projeto.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { ReajusteSalarial } from "../types/domain";

interface ReajusteSalarialRow {
  id: string;
  colaborador_nome: string;
  competencia: string;
  competencia_iso: string;
  origem: string;
  salario_anterior: number;
  reajuste_base: number;
  fatorial: number;
  reajuste_efetivo: number;
  novo_salario: number;
  aplicado_em: string;
  aplicado_por: string;
}

function fromRow(row: ReajusteSalarialRow): ReajusteSalarial {
  return {
    id: row.id,
    colaboradorNome: row.colaborador_nome,
    competencia: row.competencia,
    competenciaIso: row.competencia_iso,
    origem: row.origem,
    salarioAnterior: row.salario_anterior,
    reajusteBase: row.reajuste_base,
    fatorial: row.fatorial,
    reajusteEfetivo: row.reajuste_efetivo,
    novoSalario: row.novo_salario,
    aplicadoEm: row.aplicado_em,
    aplicadoPor: row.aplicado_por,
  };
}

function toRow(r: ReajusteSalarial): ReajusteSalarialRow {
  return {
    id: r.id,
    colaborador_nome: r.colaboradorNome,
    competencia: r.competencia,
    competencia_iso: r.competenciaIso,
    origem: r.origem,
    salario_anterior: r.salarioAnterior,
    reajuste_base: r.reajusteBase,
    fatorial: r.fatorial,
    reajuste_efetivo: r.reajusteEfetivo,
    novo_salario: r.novoSalario,
    aplicado_em: r.aplicadoEm,
    aplicado_por: r.aplicadoPor,
  };
}

export async function getReajustesSalariais(): Promise<ReajusteSalarial[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_reajustes_salariais").select("*").order("aplicado_em", { ascending: false });
  if (error) throw new Error(`Falha ao carregar reajustes salariais do Supabase: ${error.message}`);
  return (data as ReajusteSalarialRow[]).map(fromRow);
}

/** Insere só os reajustes que ainda não existem pra (colaborador_nome,
 * competencia_iso, origem) — mesmo padrão de dedup de
 * criarAvaliacoesPotencial() (checa existentes antes, filtra, só então
 * insere). A constraint unique da tabela é o reforço final contra corrida,
 * não a única defesa. Retorna só os efetivamente criados, pra a tela
 * informar quantos foram aplicados e quantos já existiam. */
export async function criarReajustesSalariais(reajustes: ReajusteSalarial[]): Promise<ReajusteSalarial[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();
  if (reajustes.length === 0) return [];

  const origem = reajustes[0].origem;
  const competenciaIso = reajustes[0].competenciaIso;
  const { data: existentes, error: errorExistentes } = await supabase
    .from("peopleflow_reajustes_salariais")
    .select("colaborador_nome")
    .eq("origem", origem)
    .eq("competencia_iso", competenciaIso);
  if (errorExistentes) {
    throw new Error(`Falha ao validar reajustes salariais já existentes no Supabase: ${errorExistentes.message}`);
  }

  const nomesExistentes = new Set((existentes ?? []).map((r) => r.colaborador_nome));
  const novos = reajustes.filter((r) => !nomesExistentes.has(r.colaboradorNome));
  if (novos.length === 0) return [];

  const { error } = await supabase.from("peopleflow_reajustes_salariais").insert(novos.map(toRow));
  if (error) throw new Error(`Falha ao registrar reajustes salariais no Supabase: ${error.message}`);
  return novos;
}

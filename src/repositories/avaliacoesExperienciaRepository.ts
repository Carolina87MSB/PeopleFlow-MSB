// Camada de acesso à tabela `peopleflow_avaliacoes_experiencia` — leitura e
// escrita acontecem direto do navegador: RLS libera qualquer autenticado (ver
// supabase/schema.sql), mesmo padrão de movimentacoesRepository.ts.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type {
  AvaliacaoExperiencia,
  DispensaAvaliacaoExperiencia,
  EtapaAvaliacaoExperiencia,
  RespostaAvaliacaoExperiencia,
  ResultadoAvaliacaoExperiencia,
} from "../types/domain";

interface AvaliacaoExperienciaRow {
  id: string;
  colaborador_nome: string;
  etapa: string;
  respostas: RespostaAvaliacaoExperiencia[];
  nota_final_pct: number;
  indicacao: string;
  decisao_final: string;
  justificativa_divergencia: string | null;
  avaliado_por: string;
  avaliado_em: string;
}

function fromRow(row: AvaliacaoExperienciaRow): AvaliacaoExperiencia {
  return {
    id: row.id,
    colaboradorNome: row.colaborador_nome,
    etapa: row.etapa as EtapaAvaliacaoExperiencia,
    respostas: row.respostas,
    notaFinalPct: row.nota_final_pct,
    indicacao: row.indicacao as ResultadoAvaliacaoExperiencia,
    decisaoFinal: row.decisao_final as ResultadoAvaliacaoExperiencia,
    justificativaDivergencia: row.justificativa_divergencia ?? "",
    avaliadoPor: row.avaliado_por,
    avaliadoEm: row.avaliado_em,
  };
}

export async function getAvaliacoesExperiencia(): Promise<AvaliacaoExperiencia[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase
    .from("peopleflow_avaliacoes_experiencia")
    .select("*")
    .order("avaliado_em", { ascending: false });

  if (error) throw new Error(`Falha ao carregar avaliações de experiência do Supabase: ${error.message}`);
  return (data as AvaliacaoExperienciaRow[]).map(fromRow);
}

export async function criarAvaliacaoExperiencia(a: AvaliacaoExperiencia): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("peopleflow_avaliacoes_experiencia").insert({
    id: a.id,
    colaborador_nome: a.colaboradorNome,
    etapa: a.etapa,
    respostas: a.respostas,
    nota_final_pct: a.notaFinalPct,
    indicacao: a.indicacao,
    decisao_final: a.decisaoFinal,
    justificativa_divergencia: a.justificativaDivergencia,
    avaliado_por: a.avaliadoPor,
    avaliado_em: a.avaliadoEm,
  });
  if (error) throw new Error(`Falha ao registrar avaliação de experiência no Supabase: ${error.message}`);
}

interface DispensaAvaliacaoExperienciaRow {
  colaborador_nome: string;
  motivo: string | null;
  dispensado_por: string;
  dispensado_em: string;
}

function dispensaFromRow(row: DispensaAvaliacaoExperienciaRow): DispensaAvaliacaoExperiencia {
  return {
    colaboradorNome: row.colaborador_nome,
    motivo: row.motivo ?? "",
    dispensadoPor: row.dispensado_por,
    dispensadoEm: row.dispensado_em,
  };
}

export async function getDispensasAvaliacaoExperiencia(): Promise<DispensaAvaliacaoExperiencia[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_avaliacoes_experiencia_dispensas").select("*");
  if (error) throw new Error(`Falha ao carregar dispensas de avaliação de experiência do Supabase: ${error.message}`);
  return (data as DispensaAvaliacaoExperienciaRow[]).map(dispensaFromRow);
}

export async function criarDispensaAvaliacaoExperiencia(colaboradorNome: string, motivo: string, dispensadoPor: string): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase
    .from("peopleflow_avaliacoes_experiencia_dispensas")
    .insert({ colaborador_nome: colaboradorNome, motivo, dispensado_por: dispensadoPor });
  if (error) throw new Error(`Falha ao registrar dispensa de avaliação de experiência no Supabase: ${error.message}`);
}

// Camada de acesso à tabela `peopleflow_log_avaliacao_desempenho` — auditoria
// básica da AVD (ciclo criado, avaliações geradas, avaliação iniciada/salva/
// concluída). Gravação best-effort: nunca lança, só registra no console,
// pra nunca bloquear a ação principal (mesmo padrão do sst_log no Portal SST).

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import type { LogAvaliacaoDesempenho } from "../types/domain";

interface LogAvaliacaoDesempenhoRow {
  id: number;
  ciclo_id: string | null;
  avaliacao_id: string | null;
  acao: string;
  detalhe: string | null;
  usuario: string;
  criado_em: string;
}

function fromRow(row: LogAvaliacaoDesempenhoRow): LogAvaliacaoDesempenho {
  return {
    id: row.id,
    cicloId: row.ciclo_id,
    avaliacaoId: row.avaliacao_id,
    acao: row.acao,
    detalhe: row.detalhe ?? "",
    usuario: row.usuario,
    criadoEm: row.criado_em,
  };
}

export async function getLogAvaliacaoDesempenho(cicloId?: string): Promise<LogAvaliacaoDesempenho[]> {
  if (!supabaseConfigured) return [];

  let query = supabase.from("peopleflow_log_avaliacao_desempenho").select("*").order("criado_em", { ascending: false });
  if (cicloId) query = query.eq("ciclo_id", cicloId);
  const { data, error } = await query;
  if (error) {
    console.error("Falha ao carregar log de avaliação de desempenho do Supabase:", error.message);
    return [];
  }
  return (data as LogAvaliacaoDesempenhoRow[]).map(fromRow);
}

export interface InicioAvaliacaoDesempenho {
  avaliacaoId: string;
  iniciadoEm: string;
}

/** Data de início de cada avaliação = 1º registro "AVALIACAO_INICIADA" no log
 * — usado pela coluna "Início" em AvaliacoesTab.tsx, sem precisar de um
 * campo novo dedicado. */
export async function getIniciosAvaliacoesDesempenho(): Promise<InicioAvaliacaoDesempenho[]> {
  if (!supabaseConfigured) return [];

  const { data, error } = await supabase
    .from("peopleflow_log_avaliacao_desempenho")
    .select("avaliacao_id, criado_em")
    .eq("acao", "AVALIACAO_INICIADA")
    .order("criado_em", { ascending: true });
  if (error) {
    console.error("Falha ao carregar datas de início de avaliações de desempenho do Supabase:", error.message);
    return [];
  }
  return (data as { avaliacao_id: string | null; criado_em: string }[])
    .filter((r): r is { avaliacao_id: string; criado_em: string } => r.avaliacao_id !== null)
    .map((r) => ({ avaliacaoId: r.avaliacao_id, iniciadoEm: r.criado_em }));
}

export async function registrarLogAvaliacaoDesempenho(entrada: {
  cicloId?: string | null;
  avaliacaoId?: string | null;
  acao: string;
  detalhe?: string;
  usuario: string;
}): Promise<void> {
  if (!supabaseConfigured) return;

  const { error } = await supabase.from("peopleflow_log_avaliacao_desempenho").insert({
    ciclo_id: entrada.cicloId ?? null,
    avaliacao_id: entrada.avaliacaoId ?? null,
    acao: entrada.acao,
    detalhe: entrada.detalhe ?? null,
    usuario: entrada.usuario,
  });
  if (error) console.error("Falha ao registrar log de avaliação de desempenho no Supabase:", error.message);
}

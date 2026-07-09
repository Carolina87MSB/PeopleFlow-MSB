// Camada de acesso à tabela `peopleflow_movimentacoes` — exclusiva deste
// portal (não existe no Portal SST). Leitura e escrita acontecem direto do
// navegador: RLS libera qualquer usuário autenticado (ver supabase/schema.sql),
// já que não há dado de saúde/CPF aqui, só o fluxo de aprovação de RH.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { AprovacaoFinal, DadoField, Etapa, Movimentacao, NovoCargoInfo, TipoCod } from "../types/domain";

interface MovimentacaoRow {
  id: string;
  tipo: string;
  tipo_cod: string;
  colaborador: string;
  depto: string;
  resumo: string;
  solicitante: string;
  data_solicitacao: string;
  prioridade: string;
  status: string;
  justificativa: string | null;
  dados: DadoField[] | null;
  etapas: Etapa[] | null;
  novo_cargo: NovoCargoInfo | null;
  aprovacao_final: AprovacaoFinal | null;
  legado: boolean;
}

function fromRow(row: MovimentacaoRow): Movimentacao {
  return {
    id: row.id,
    tipo: row.tipo,
    tipoCod: row.tipo_cod as TipoCod,
    colaborador: row.colaborador,
    depto: row.depto,
    resumo: row.resumo,
    solicitante: row.solicitante,
    dataSolicitacao: row.data_solicitacao,
    prioridade: row.prioridade as Movimentacao["prioridade"],
    status: row.status as Movimentacao["status"],
    justificativa: row.justificativa ?? undefined,
    dados: row.dados ?? undefined,
    etapas: row.etapas ?? [],
    novoCargo: row.novo_cargo ?? undefined,
    aprovacaoFinal: row.aprovacao_final ?? null,
    legado: row.legado,
  };
}

function toRow(m: Movimentacao): Omit<MovimentacaoRow, "legado"> & { legado: boolean } {
  return {
    id: m.id,
    tipo: m.tipo,
    tipo_cod: m.tipoCod,
    colaborador: m.colaborador,
    depto: m.depto,
    resumo: m.resumo,
    solicitante: m.solicitante,
    data_solicitacao: m.dataSolicitacao,
    prioridade: m.prioridade,
    status: m.status,
    justificativa: m.justificativa ?? "",
    dados: m.dados ?? [],
    etapas: m.etapas,
    novo_cargo: m.novoCargo ?? null,
    aprovacao_final: m.aprovacaoFinal ?? null,
    legado: m.legado ?? false,
  };
}

export async function getMovimentacoes(): Promise<Movimentacao[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase
    .from("peopleflow_movimentacoes")
    .select("*")
    .order("id", { ascending: false });

  if (error) throw new Error(`Falha ao carregar movimentações do Supabase: ${error.message}`);
  return (data as MovimentacaoRow[]).map(fromRow);
}

export async function criarMovimentacao(m: Movimentacao): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("peopleflow_movimentacoes").insert(toRow(m));
  if (error) throw new Error(`Falha ao criar movimentação no Supabase: ${error.message}`);
}

/** Persiste o novo estado de uma movimentação após aprovar/reprovar uma etapa. */
export async function atualizarMovimentacao(m: Movimentacao): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase
    .from("peopleflow_movimentacoes")
    .update({
      status: m.status,
      etapas: m.etapas,
      aprovacao_final: m.aprovacaoFinal ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", m.id);
  if (error) throw new Error(`Falha ao atualizar movimentação no Supabase: ${error.message}`);
}

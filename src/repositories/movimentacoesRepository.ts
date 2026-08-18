// Camada de acesso à tabela `peopleflow_movimentacoes` — exclusiva deste
// portal (não existe no Portal SST). Leitura e escrita acontecem direto do
// navegador: RLS libera qualquer usuário autenticado (ver supabase/schema.sql),
// já que não há dado de saúde/CPF aqui, só o fluxo de aprovação de RH.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError, atualizarCargoDepto } from "./colaboradoresRepository";
import { hojeIso } from "../domain/dates";
import type {
  AdmissaoInfo,
  AprovacaoFinal,
  AtualizacaoCargoDeptoInfo,
  CartaMovimentacao,
  DadoField,
  DesligamentoInfo,
  Etapa,
  EventoHistoricoMovimentacao,
  Movimentacao,
  TipoCod,
} from "../types/domain";

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
  admissao_info: AdmissaoInfo | null;
  atualizacao_info: AtualizacaoCargoDeptoInfo | null;
  desligamento_info: DesligamentoInfo | null;
  aprovacao_final: AprovacaoFinal | null;
  sincronizado_em: string | null;
  historico: EventoHistoricoMovimentacao[] | null;
  carta_movimentacao: CartaMovimentacao | null;
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
    admissaoInfo: row.admissao_info ?? undefined,
    atualizacaoInfo: row.atualizacao_info ?? undefined,
    desligamentoInfo: row.desligamento_info ?? undefined,
    aprovacaoFinal: row.aprovacao_final ?? null,
    sincronizadoEm: row.sincronizado_em ?? null,
    historico: row.historico ?? undefined,
    cartaMovimentacao: row.carta_movimentacao ?? null,
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
    admissao_info: m.admissaoInfo ?? null,
    atualizacao_info: m.atualizacaoInfo ?? null,
    desligamento_info: m.desligamentoInfo ?? null,
    aprovacao_final: m.aprovacaoFinal ?? null,
    sincronizado_em: m.sincronizadoEm ?? null,
    historico: m.historico ?? [],
    carta_movimentacao: m.cartaMovimentacao ?? null,
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

/** Persiste o novo estado de uma movimentação após aprovar/reprovar/reabrir
 * uma etapa, ou editar um campo de `dados` (ver domain/workflow.ts) — inclui
 * `dados`/`*_info`/`historico` mesmo quando aprovar/reprovar não os altera
 * (só reabrir/editar o fazem), pra manter uma única função de persistência
 * em vez de uma por tipo de mutação. */
export async function atualizarMovimentacao(m: Movimentacao): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase
    .from("peopleflow_movimentacoes")
    .update({
      status: m.status,
      etapas: m.etapas,
      dados: m.dados ?? [],
      admissao_info: m.admissaoInfo ?? null,
      atualizacao_info: m.atualizacaoInfo ?? null,
      desligamento_info: m.desligamentoInfo ?? null,
      aprovacao_final: m.aprovacaoFinal ?? null,
      historico: m.historico ?? [],
      carta_movimentacao: m.cartaMovimentacao ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", m.id);
  if (error) throw new Error(`Falha ao atualizar movimentação no Supabase: ${error.message}`);
}

async function marcarSincronizado(id: string): Promise<string> {
  const sincronizadoEm = new Date().toISOString();
  const { error } = await supabase.from("peopleflow_movimentacoes").update({ sincronizado_em: sincronizadoEm }).eq("id", id);
  if (error) throw new Error(`Falha ao marcar movimentação como sincronizada: ${error.message}`);
  return sincronizadoEm;
}

/** Aplica em `colaboradores` as promoções/transferências aprovadas cuja "Data
 * prevista" (atualizacaoInfo.dataPrevistaIso) já chegou e que ainda não foram
 * sincronizadas — chamado a cada carga de dados (ver PortalStoreContext.tsx),
 * já que não há job/cron neste projeto (Vercel serverless + Supabase). Uma
 * movimentação com `sincronizadoEm` preenchido nunca é reprocessada. Falhas
 * individuais (ex.: nome não bate mais com `colaboradores`) não interrompem
 * as demais — ficam pendentes para a próxima carga. */
export async function efetivarSincronizacoesPendentes(movimentacoes: Movimentacao[]): Promise<Movimentacao[]> {
  const hoje = hojeIso();
  const pendentes = movimentacoes.filter(
    (m) =>
      (m.tipoCod === "PRO" || m.tipoCod === "TRF") &&
      m.status === "Aprovado" &&
      m.atualizacaoInfo &&
      !m.sincronizadoEm &&
      (!m.atualizacaoInfo.dataPrevistaIso || m.atualizacaoInfo.dataPrevistaIso <= hoje),
  );
  if (pendentes.length === 0) return movimentacoes;

  const sincronizadas = new Map<string, string>();
  for (const m of pendentes) {
    const info = m.atualizacaoInfo!;
    try {
      await atualizarCargoDepto(info.nome, info.novoCargo, info.novoDepto, info.novoGestor);
      sincronizadas.set(m.id, await marcarSincronizado(m.id));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[efetivarSincronizacoesPendentes] Falha ao sincronizar "${info.nome}" (${m.id})`, err);
    }
  }
  if (sincronizadas.size === 0) return movimentacoes;
  return movimentacoes.map((m) => (sincronizadas.has(m.id) ? { ...m, sincronizadoEm: sincronizadas.get(m.id) } : m));
}

// Triagem do PDI por ITEM (Fase 7 — Etapa 1B): leituras (sob RLS, só o RH enxerga) e gravações
// (sempre pelo servidor, api/desenvolvimento.ts). A fonte de verdade da triagem são as views
// peopleflow_dev_v_pdi_acoes_triagem / peopleflow_dev_v_pdi_sugestoes e as ações de origem das
// sugestões — NÃO mais necessidades.pdi_acao_id nem a tabela legada de sugestões dispensadas.

import { supabase } from "../../lib/supabaseClient";
import { gravar } from "./devRepository";

export type DestinoAcao = "sem_decisao" | "sugestao_pendente" | "confirmada" | "mantida_no_pdi";
export type EstadoSugestao = "pendente" | "validada" | "mantida_no_pdi" | "substituida";

/** Destino de cada ação ATUAL do PDI (view peopleflow_dev_v_pdi_acoes_triagem). */
export interface AcaoTriagem {
  pdi_acao_id: string;
  pdi_item_id: string;
  pdi_id: number;
  descricao: string;
  acao_status: string;
  sugestao_id: number | null;
  sugestao_estado: EstadoSugestao | null;
  destino: DestinoAcao;
}

/** Sugestão de Necessidade (view peopleflow_dev_v_pdi_sugestoes: já traz "origem alterada?" calculado ao vivo). */
export interface SugestaoPdi {
  id: number;
  interpretacao_id: number | null;
  origem_sugestao: "regra_local" | "ia" | "rh" | "legado";
  derivada_de_id: number | null;
  pdi_id: number;
  pdi_item_id: string;
  item_competencia_nome: string;
  item_tipo_competencia: string | null;
  item_objetivo: string;
  texto_sugerido: string;
  categoria_sugerida: string | null;
  estado: EstadoSugestao;
  texto_final: string | null;
  editada: boolean;
  decidido_em: string | null;
  motivo_decisao: string | null;
  necessidade_id: number | null;
  created_at: string;
  acoes_total: number;
  origem_alterada: boolean;
  contexto_do_item_alterado: boolean;
  origem_alterada_apos_decisao: boolean;
}

export interface AcaoDaSugestao {
  sugestao_id: number;
  pdi_acao_id: string;
  acao_texto: string;
  ativa: boolean;
}

/** Necessidade de origem PDI ainda existente na Base (para reconhecer a que foi criada e ficou sem vínculo com a sugestão). */
export interface NecessidadePdi {
  id: number;
  pdi_acao_id: string | null;
  status: string;
  descricao: string;
  categoria: string | null;
  prioridade: string;
}

export interface TriagemPdi {
  acoes: AcaoTriagem[];
  sugestoes: SugestaoPdi[];
  acoesDasSugestoes: AcaoDaSugestao[];
  necessidadesPdi: NecessidadePdi[];
}

const COLS_ACAO = "pdi_acao_id, pdi_item_id, pdi_id, descricao, acao_status, sugestao_id, sugestao_estado, destino";
const COLS_SUGESTAO =
  "id, interpretacao_id, origem_sugestao, derivada_de_id, pdi_id, pdi_item_id, item_competencia_nome, item_tipo_competencia, item_objetivo, texto_sugerido, categoria_sugerida, estado, texto_final, editada, decidido_em, motivo_decisao, necessidade_id, created_at, acoes_total, origem_alterada, contexto_do_item_alterado, origem_alterada_apos_decisao";

async function lerTudo<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, contexto: string): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) throw new Error(`${contexto}: ${error.message}`);
    const linhas = (data ?? []) as T[];
    out.push(...linhas);
    if (linhas.length < 1000) return out;
  }
}

export async function lerTriagemPdi(): Promise<TriagemPdi> {
  const [acoes, sugestoes, acoesDasSugestoes, necessidadesPdi] = await Promise.all([
    lerTudo<AcaoTriagem>((de, ate) => supabase.from("peopleflow_dev_v_pdi_acoes_triagem").select(COLS_ACAO).order("pdi_acao_id").range(de, ate), "Triagem do PDI"),
    lerTudo<SugestaoPdi>((de, ate) => supabase.from("peopleflow_dev_v_pdi_sugestoes").select(COLS_SUGESTAO).order("id").range(de, ate), "Sugestões do PDI"),
    lerTudo<AcaoDaSugestao>((de, ate) => supabase.from("peopleflow_dev_pdi_sugestao_acoes").select("sugestao_id, pdi_acao_id, acao_texto, ativa").order("id").range(de, ate), "Ações das sugestões"),
    lerTudo<NecessidadePdi>(
      (de, ate) => supabase.from("peopleflow_dev_necessidades").select("id, pdi_acao_id, status, descricao, categoria, prioridade").eq("origem", "pdi").in("status", ["sugerida", "validada", "planejada", "atendida"]).order("id").range(de, ate),
      "Necessidades de origem PDI",
    ),
  ]);
  return { acoes, sugestoes, acoesDasSugestoes, necessidadesPdi };
}

export interface CamposConfirmacao {
  texto: string;
  categoria: string;
  prioridade: string;
  justificativa?: string;
  sugestao_capacitacao?: string;
}

/** "pendente" = a decisão foi gravada, mas o registro de auditoria não (fica identificado no log do servidor). */
export type EstadoAuditoria = "ok" | "pendente";

export interface ResultadoConfirmacao {
  repetida: boolean;
  /** Já existia uma necessidade criada antes de uma falha: ela foi concluída (vinculada), sem criar outra. */
  recuperada: boolean;
  divergencias?: { texto: boolean; categoria: boolean; prioridade: boolean };
  auditoria: EstadoAuditoria;
}

export interface GrupoSeparacao {
  acao_ids: string[];
  texto?: string;
}

/** Gravações (RH): o servidor revalida tudo; aqui só vão ids e os textos de decisão. */
export const triagemPdi = {
  gerar: (itemIds?: string[]) => gravar<{ interpretacao_id: number | null; itens: number; sugestoes: number; auditoria: EstadoAuditoria; incompletas_pendentes: number[] }>("pdi_triagem_gerar", itemIds ? { pdi_item_ids: itemIds } : {}),
  confirmar: (sugestaoId: number, c: CamposConfirmacao) => gravar<ResultadoConfirmacao>("pdi_sugestao_confirmar", { sugestao_id: sugestaoId, ...c }),
  manter: (sugestaoId: number, motivo?: string) => gravar<{ motivo: string; auditoria: EstadoAuditoria }>("pdi_sugestao_manter_no_pdi", { sugestao_id: sugestaoId, motivo: motivo ?? "" }),
  separar: (sugestaoId: number, grupos: GrupoSeparacao[]) => gravar<{ original: number; auditoria: EstadoAuditoria }>("pdi_sugestao_separar", { sugestao_id: sugestaoId, grupos }),
  regenerar: (sugestaoId: number) => gravar<{ original: number; auditoria: EstadoAuditoria }>("pdi_sugestao_regenerar", { sugestao_id: sugestaoId }),
};

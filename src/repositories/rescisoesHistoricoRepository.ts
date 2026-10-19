// Leitura do histórico de rescisões (`peopleflow_rescisoes_historico`) — só para os indicadores do Dashboard Executivo.
// As rubricas financeiras (`..._rubricas`) ficam apenas no servidor e não são lidas aqui.
//
// IMPORTANTE: este carregamento NUNCA pode derrubar o portal. Se a tabela ainda não existe (migration não aplicada) ou a leitura
// falha, devolve lista vazia e o Dashboard segue só com o cadastro (como antes).

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import type { NaturezaRescisao, RescisaoHistorica } from "../domain/rescisoesHistorico";

interface RescisaoRow {
  id: number;
  codigo_folha: number;
  nome: string;
  nome_normalizado: string;
  admissao: string;
  demissao: string;
  tipo_rescisao: string | null;
  departamento: string | null;
  natureza: NaturezaRescisao;
  efetivacao_em: string | null;
  colaborador_id: number | null;
}

const COLUNAS = "id, codigo_folha, nome, nome_normalizado, admissao, demissao, tipo_rescisao, departamento, natureza, efetivacao_em, colaborador_id";

function fromRow(row: RescisaoRow): RescisaoHistorica {
  return {
    id: row.id,
    codigoFolha: row.codigo_folha,
    nome: row.nome,
    nomeNormalizado: row.nome_normalizado,
    admissaoIso: row.admissao,
    demissaoIso: row.demissao,
    tipoRescisao: row.tipo_rescisao ?? "",
    departamento: row.departamento,
    natureza: row.natureza,
    efetivacaoEmIso: row.efetivacao_em,
    colaboradorId: row.colaborador_id,
  };
}

export async function getRescisoesHistorico(): Promise<RescisaoHistorica[]> {
  if (!supabaseConfigured) return [];
  try {
    const { data, error } = await supabase.from("peopleflow_rescisoes_historico").select(COLUNAS).order("demissao", { ascending: true });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[rescisoesHistorico] histórico indisponível (migration aplicada?):", error.message);
      return [];
    }
    return ((data as RescisaoRow[] | null) ?? []).map(fromRow);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[rescisoesHistorico] falha ao ler o histórico:", e);
    return [];
  }
}

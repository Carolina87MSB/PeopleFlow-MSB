// Camada de acesso ao financeiro dos desligamentos — TUDO pelo servidor (api/desenvolvimento.ts, ações `financeiro_*`).
// O navegador não lê nem grava mais `peopleflow_desligamentos` direto: o RH recebe os valores individuais (conferência), (por decisão do RH, por ora) a Diretoria e os Gestores nada: nem totais
// mensais e os demais perfis nada. A carga inicial NUNCA derruba o portal: sem permissão (não-RH) ou com falha, devolve vazio.

import { gravar } from "../features/desenvolvimento/devRepository";
import { supabaseConfigured } from "../lib/supabaseClient";
import type { ConferenciaFinanceira, CoberturaFinanceira, CustoMesFinanceiro, DecisaoDivergencia, FechamentoFinanceiro } from "../domain/custosRescisao";
import type { DesligamentoFinanceiro } from "../types/domain";

export interface FinanceiroRH {
  fechamentos: DesligamentoFinanceiro[];
  conferencia: ConferenciaFinanceira | null;
}

const VAZIO: FinanceiroRH = { fechamentos: [], conferencia: null };

function paraDesligamento(f: FechamentoFinanceiro): DesligamentoFinanceiro {
  return { colaboradorNome: f.colaboradorNome, valorRescisao: f.valorRescisao, valorGrrf: f.valorGrrf, updatedAt: f.updatedAt, updatedBy: f.updatedBy };
}

export async function getFinanceiroDesligados(): Promise<FinanceiroRH> {
  if (!supabaseConfigured) return VAZIO;
  try {
    const d = await gravar<ConferenciaFinanceira & { fechamentos: FechamentoFinanceiro[] }>("financeiro_listar", {});
    return { fechamentos: d.fechamentos.map(paraDesligamento), conferencia: { instalado: d.instalado, saidas: d.saidas, conversoes: d.conversoes, cobertura: d.cobertura } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // não-RH recebe 403 por desenho (os valores individuais são só do RH): não é erro
    if (!/Somente o RH|Conta não encontrada|sem acesso/i.test(msg)) {
      // eslint-disable-next-line no-console
      console.warn("[financeiro] valores dos desligamentos indisponíveis:", msg);
    }
    return VAZIO;
  }
}

export interface FiltrosCustos {
  inicio: string;
  fim: string;
  setor: string;
  gestor: string;
  cargo: string;
}

export interface CustosAgregados {
  instalado: boolean;
  meses: CustoMesFinanceiro[];
  cobertura: CoberturaFinanceira;
}

/** Totais mensais do quadro "Custos de Rescisão por mês" — SOMENTE RH por ora (o servidor recusa os demais perfis); só agregados, nenhum valor individual. */
export async function getCustosAgregados(f: FiltrosCustos): Promise<CustosAgregados> {
  return gravar<CustosAgregados>("financeiro_agregado", { ...f });
}

export interface ItemValidacao {
  rescisao_id: number;
  zero_conferido?: boolean;
}
export interface ResultadoValidacao {
  rescisao_id: number;
  resultado: "validada" | "ja_validada" | "divergente" | "conferir_zero" | "recusada";
  detalhe?: string;
}

export async function validarRescisoes(itens: ItemValidacao[]): Promise<ResultadoValidacao[]> {
  return (await gravar<{ resultados: ResultadoValidacao[] }>("financeiro_rescisao_validar", { itens })).resultados;
}

export async function decidirDivergencia(p: { rescisao_id: number; decisao: DecisaoDivergencia; motivo: string; zero_conferido?: boolean }): Promise<void> {
  await gravar("financeiro_rescisao_decidir", p);
}

export async function confirmarModalidade(p: { rescisao_id: number; modalidade: string }): Promise<void> {
  await gravar("financeiro_modalidade_confirmar", p);
}

export interface LancamentoConfirmado {
  /** Desligamento com rescisão da folha: informe `rescisao_id`. Sem folha: informe `colaborador_nome` e `valor_rescisao`. */
  rescisao_id?: number;
  colaborador_nome?: string;
  valor_rescisao?: number | null;
  /** Folha: confirma o líquido da folha junto (divergência e R$ 0,00 seguem exigindo decisão/conferência expressa). */
  confirmar_liquido?: boolean;
  grrf_modo: "valor" | "pendente" | "nao_aplicavel";
  valor_grrf?: number | null;
  justificativa?: string;
  /** Obrigatório ao alterar um valor já confirmado. */
  motivo?: string;
  zero_conferido?: boolean;
  /** Confirmação expressa do RH: salva e valida numa única operação. */
  confirmacao_rh: true;
}

/** Diálogo único: lança e confirma Rescisão e GRRF. Usuário, data, origem ("Informado e confirmado pelo RH") e trilha ficam no servidor. */
export async function confirmarLancamento(p: LancamentoConfirmado): Promise<void> {
  await gravar("financeiro_lancamento_confirmar", { ...p });
}

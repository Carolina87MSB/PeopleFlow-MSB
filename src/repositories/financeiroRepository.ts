// Camada de acesso ao financeiro dos desligamentos — TUDO pelo servidor (api/desenvolvimento.ts, ações `financeiro_*`).
// O navegador não lê nem grava mais `peopleflow_desligamentos` direto: o RH recebe os valores individuais (conferência), a Diretoria só os totais
// mensais e os demais perfis nada. A carga inicial NUNCA derruba o portal: sem permissão (não-RH) ou com falha, devolve vazio.

import { gravar } from "../features/desenvolvimento/devRepository";
import { supabaseConfigured } from "../lib/supabaseClient";
import type { ConferenciaFinanceira, CoberturaFinanceira, CustoMesFinanceiro, DecisaoDivergencia, FechamentoFinanceiro, FonteGrrf } from "../domain/custosRescisao";
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

/** Totais mensais do quadro "Custos de Rescisão por mês" (RH e Diretoria) — só agregados, nenhum valor individual. */
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

export interface RegistroGrrf {
  rescisao_id: number;
  nao_aplicavel?: boolean;
  deposito?: number | string | null;
  multa?: number | string | null;
  total?: number | string | null;
  fonte?: FonteGrrf;
  observacao?: string;
  motivo?: string;
  confirmar_substituicao?: boolean;
}

export async function registrarGrrf(p: RegistroGrrf): Promise<void> {
  await gravar("financeiro_grrf_registrar", { ...p });
}

export async function salvarFechamentoManual(colaboradorNome: string, valorRescisao: number | null, valorGrrf: number | null): Promise<void> {
  await gravar("financeiro_fechamento_salvar", { colaborador_nome: colaboradorNome, valor_rescisao: valorRescisao, valor_grrf: valorGrrf });
}

export interface ValidacaoManual {
  colaborador_nome: string;
  componente: "rescisao" | "grrf";
  fonte?: string;
  observacao?: string;
  nao_aplicavel?: boolean;
  justificativa?: string;
  zero_conferido?: boolean;
  confirmar_substituicao?: boolean;
}

/** Confirmação expressa do RH de um componente do lançamento manual (sem folha): fonte documental, responsável e data ficam no servidor. */
export async function validarLancamentoManual(p: ValidacaoManual): Promise<void> {
  await gravar("financeiro_fechamento_validar", { ...p });
}

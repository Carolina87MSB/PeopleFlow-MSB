// Camada de acesso à tabela `peopleflow_ciclos_avaliacao_desempenho`. RLS
// libera qualquer autenticado, mesmo padrão de avaliacoesExperienciaRepository.ts.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import { criarAvaliacoesDesempenho } from "./avaliacoesDesempenhoRepository";
import type { AvaliacaoDesempenho, CicloAvaliacaoDesempenho } from "../types/domain";

interface CicloAvaliacaoDesempenhoRow {
  id: string;
  nome: string;
  periodo_referencia: string;
  data_inicio: string;
  data_encerramento: string;
  status: string;
  criado_por: string | null;
  criado_em: string;
}

function fromRow(row: CicloAvaliacaoDesempenhoRow): CicloAvaliacaoDesempenho {
  return {
    id: row.id,
    nome: row.nome,
    periodoReferencia: row.periodo_referencia,
    dataInicio: row.data_inicio,
    dataEncerramento: row.data_encerramento,
    status: row.status as CicloAvaliacaoDesempenho["status"],
    criadoPor: row.criado_por ?? "",
    criadoEm: row.criado_em,
  };
}

export async function getCiclosAvaliacaoDesempenho(): Promise<CicloAvaliacaoDesempenho[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_ciclos_avaliacao_desempenho").select("*").order("criado_em", { ascending: false });
  if (error) throw new Error(`Falha ao carregar ciclos de avaliação de desempenho do Supabase: ${error.message}`);
  return (data as CicloAvaliacaoDesempenhoRow[]).map(fromRow);
}

export interface ResultadoCriacaoCiclo {
  /** Avaliações efetivamente inseridas (exclui duplicadas — ver abaixo). */
  avaliacoesCriadas: AvaliacaoDesempenho[];
  /** Quantos colaboradores da leva recebida já tinham avaliação neste ciclo (não reinseridos). */
  duplicadas: number;
}

/** Cria o ciclo e, em seguida, as avaliações já geradas pra ele (uma por
 * colaborador ativo — ver criarCicloAvaliacaoDesempenho() em usePortalData.ts).
 * Dois inserts sequenciais, sem transação (o Supabase client não oferece
 * transação multi-tabela) — se o segundo falhar, o ciclo fica criado sem
 * avaliações; aceitável nesta etapa.
 *
 * Validação contra duplicidade: antes de inserir, confere quais (tipo,
 * colaborador) já têm avaliação para este `ciclo_id` (id sempre novo, mas
 * protege contra reenvio duplo do formulário/corrida de rede que já tenha
 * inserido parte das avaliações) — nunca insere uma segunda avaliação do
 * mesmo tipo pro mesmo colaborador no mesmo ciclo. A chave é `tipo:colaborador`
 * (não `colaborador` sozinho) porque, desde a Etapa 2.1, cada colaborador
 * pode ter até 3 fichas legítimas (GESTOR/AUTOAVALIACAO/LIDERANCA) no mesmo
 * ciclo. */
export async function criarCicloComAvaliacoes(
  ciclo: CicloAvaliacaoDesempenho,
  avaliacoes: AvaliacaoDesempenho[],
): Promise<ResultadoCriacaoCiclo> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("peopleflow_ciclos_avaliacao_desempenho").insert({
    id: ciclo.id,
    nome: ciclo.nome,
    periodo_referencia: ciclo.periodoReferencia,
    data_inicio: ciclo.dataInicio,
    data_encerramento: ciclo.dataEncerramento,
    criado_por: ciclo.criadoPor || null,
  });
  if (error) throw new Error(`Falha ao criar ciclo de avaliação de desempenho no Supabase: ${error.message}`);

  const { data: existentes, error: errorExistentes } = await supabase
    .from("peopleflow_avaliacoes_desempenho")
    .select("colaborador_nome, tipo")
    .eq("ciclo_id", ciclo.id);
  if (errorExistentes) {
    throw new Error(`Falha ao validar avaliações já existentes no ciclo no Supabase: ${errorExistentes.message}`);
  }

  const chavesExistentes = new Set((existentes ?? []).map((r) => `${r.tipo}:${r.colaborador_nome}`));
  const avaliacoesCriadas = avaliacoes.filter((a) => !chavesExistentes.has(`${a.tipo}:${a.colaboradorNome}`));

  await criarAvaliacoesDesempenho(avaliacoesCriadas);
  return { avaliacoesCriadas, duplicadas: avaliacoes.length - avaliacoesCriadas.length };
}

/** Encerra o ciclo — trava todas as avaliações vinculadas a ele, mesmo as
 * "Em andamento" (ver podeEditarAvaliacaoDesempenho() em usePortalData.ts).
 * Sem reabertura nesta etapa. */
export async function encerrarCiclo(id: string): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("peopleflow_ciclos_avaliacao_desempenho").update({ status: "Encerrado" }).eq("id", id);
  if (error) throw new Error(`Falha ao encerrar ciclo de avaliação de desempenho no Supabase: ${error.message}`);
}

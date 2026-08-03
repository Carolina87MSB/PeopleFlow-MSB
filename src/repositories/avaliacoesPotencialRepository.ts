// Camada de acesso à tabela `peopleflow_avaliacoes_potencial`. RLS libera
// qualquer autenticado, mesmo padrão de avaliacoesDesempenhoRepository.ts.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { AvaliacaoPotencial, RespostaPotencial, StatusAvaliacaoDesempenho } from "../types/domain";

interface AvaliacaoPotencialRow {
  id: string;
  ciclo_id: string;
  ciclo: string;
  colaborador_nome: string;
  cargo: string | null;
  departamento: string | null;
  gestor_avaliador: string | null;
  respostas: RespostaPotencial[] | null;
  comentario: string | null;
  status: string;
  nota_potencial: number | null;
  status_calibracao: string | null;
  nota_potencial_calibrada: number | null;
  nota_oficial: number | null;
  justificativa_calibracao: string | null;
  calibrado_por: string | null;
  calibrado_em: string | null;
  homologado_por: string | null;
  homologado_em: string | null;
  concluido_por: string | null;
  concluido_em: string | null;
  criado_em: string;
  updated_at: string;
}

function fromRow(row: AvaliacaoPotencialRow): AvaliacaoPotencial {
  return {
    id: row.id,
    cicloId: row.ciclo_id,
    ciclo: row.ciclo,
    colaboradorNome: row.colaborador_nome,
    cargo: row.cargo ?? "",
    departamento: row.departamento ?? "",
    gestorAvaliador: row.gestor_avaliador ?? "",
    respostas: row.respostas ?? [],
    comentario: row.comentario ?? "",
    status: row.status as StatusAvaliacaoDesempenho,
    notaPotencial: row.nota_potencial,
    statusCalibracao: (row.status_calibracao as AvaliacaoPotencial["statusCalibracao"]) ?? "Não iniciada",
    notaPotencialCalibrada: row.nota_potencial_calibrada,
    notaOficial: row.nota_oficial,
    justificativaCalibracao: row.justificativa_calibracao ?? "",
    calibradoPor: row.calibrado_por ?? "",
    calibradoEm: row.calibrado_em,
    homologadoPor: row.homologado_por ?? "",
    homologadoEm: row.homologado_em,
    concluidoPor: row.concluido_por ?? "",
    concluidoEm: row.concluido_em,
    criadoEm: row.criado_em,
    updatedAt: row.updated_at,
  };
}

// Tipado contra a Row (menos id/criado_em/updated_at) — mesma proteção em
// tempo de compilação contra campo novo esquecido (ver avaliacoesDesempenhoRepository.ts).
function toRow(a: AvaliacaoPotencial): Omit<AvaliacaoPotencialRow, "id" | "criado_em" | "updated_at"> {
  return {
    ciclo_id: a.cicloId,
    ciclo: a.ciclo,
    colaborador_nome: a.colaboradorNome,
    cargo: a.cargo || null,
    departamento: a.departamento || null,
    gestor_avaliador: a.gestorAvaliador || null,
    respostas: a.respostas,
    comentario: a.comentario,
    status: a.status,
    nota_potencial: a.notaPotencial,
    status_calibracao: a.statusCalibracao,
    nota_potencial_calibrada: a.notaPotencialCalibrada,
    nota_oficial: a.notaOficial,
    justificativa_calibracao: a.justificativaCalibracao,
    calibrado_por: a.calibradoPor || null,
    calibrado_em: a.calibradoEm,
    homologado_por: a.homologadoPor || null,
    homologado_em: a.homologadoEm,
    concluido_por: a.concluidoPor || null,
    concluido_em: a.concluidoEm,
  };
}

export async function getAvaliacoesPotencial(): Promise<AvaliacaoPotencial[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_avaliacoes_potencial").select("*").order("criado_em", { ascending: false });
  if (error) throw new Error(`Falha ao carregar avaliações de potencial do Supabase: ${error.message}`);
  return (data as AvaliacaoPotencialRow[]).map(fromRow);
}

/** Bulk-insert usado só na abertura de um ciclo (uma avaliação de potencial
 * por colaborador elegível) — dedup por `colaborador_nome` dentro do
 * `ciclo_id` antes de inserir (mesmo padrão de criarCicloComAvaliacoes),
 * protege contra reenvio duplo/corrida na abertura do ciclo. */
export async function criarAvaliacoesPotencial(avaliacoes: AvaliacaoPotencial[]): Promise<AvaliacaoPotencial[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();
  if (avaliacoes.length === 0) return [];

  const cicloId = avaliacoes[0].cicloId;
  const { data: existentes, error: errorExistentes } = await supabase
    .from("peopleflow_avaliacoes_potencial")
    .select("colaborador_nome")
    .eq("ciclo_id", cicloId);
  if (errorExistentes) {
    throw new Error(`Falha ao validar avaliações de potencial já existentes no Supabase: ${errorExistentes.message}`);
  }

  const nomesExistentes = new Set((existentes ?? []).map((r) => r.colaborador_nome));
  const avaliacoesCriadas = avaliacoes.filter((a) => !nomesExistentes.has(a.colaboradorNome));
  if (avaliacoesCriadas.length === 0) return [];

  const { error } = await supabase.from("peopleflow_avaliacoes_potencial").insert(avaliacoesCriadas.map((a) => ({ id: a.id, ...toRow(a) })));
  if (error) throw new Error(`Falha ao gerar avaliações de potencial no Supabase: ${error.message}`);
  return avaliacoesCriadas;
}

/** Usado tanto pro salvamento normal (progresso/conclusão) quanto pra
 * reabertura — o chamador decide o `status`/demais campos a gravar. */
export async function atualizarAvaliacaoPotencial(avaliacao: AvaliacaoPotencial): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase
    .from("peopleflow_avaliacoes_potencial")
    .update({ ...toRow(avaliacao), updated_at: new Date().toISOString() })
    .eq("id", avaliacao.id);
  if (error) throw new Error(`Falha ao salvar avaliação de potencial no Supabase: ${error.message}`);
}

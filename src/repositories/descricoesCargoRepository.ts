// Camada de acesso às tabelas `peopleflow_descricoes_cargo` e
// `peopleflow_descricoes_cargo_historico` — formulário de descrição de
// cargo (POP-RH-001), seu fluxo de revisão/aprovação (colunas `status` e
// `pendente`, ver types/domain.ts) e o histórico de edições campo a campo.
// Exclusiva deste portal; cargo_nome referencia o mesmo texto usado em
// colaboradores.cargo / peopleflow_cargos_custom.nome.

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import { labelForCampoDescricaoCargo } from "../domain/descricaoCargo";
import type { CampoDescricaoCargo } from "../domain/descricaoCargo";
import type { DescricaoCargo, HistoricoDescricaoCargo, StatusDescricaoCargo } from "../types/domain";

interface DescricaoCargoRow {
  cargo_nome: string;
  codigo_formulario: string | null;
  revisao_formulario: string | null;
  data_formulario: string | null;
  data_revisao_cargo: string | null;
  subordinacao: string | null;
  localidade: string | null;
  nivel_documento: string | null;
  sumario: string | null;
  responsabilidades: string | null;
  escolaridade: string | null;
  experiencia: string | null;
  habilidades_tecnicas: string | null;
  habilidades_comportamentais: string | null;
  epis: string | null;
  updated_at: string;
  updated_by: string | null;
  status: string | null;
  pendente: Record<string, string> | null;
  elaborado_por: string | null;
  elaborado_em: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
}

interface HistoricoRow {
  id: number;
  cargo_nome: string;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  editado_por: string;
  perfil: string | null;
  editado_em: string;
}

function fromRow(row: DescricaoCargoRow): DescricaoCargo {
  return {
    cargoNome: row.cargo_nome,
    codigoFormulario: row.codigo_formulario ?? "",
    revisaoFormulario: row.revisao_formulario ?? "",
    dataFormulario: row.data_formulario ?? "",
    dataRevisaoCargo: row.data_revisao_cargo ?? "",
    subordinacao: row.subordinacao ?? "",
    localidade: row.localidade ?? "",
    nivelDocumento: row.nivel_documento ?? "",
    sumario: row.sumario ?? "",
    responsabilidades: row.responsabilidades ?? "",
    escolaridade: row.escolaridade ?? "",
    experiencia: row.experiencia ?? "",
    habilidadesTecnicas: row.habilidades_tecnicas ?? "",
    habilidadesComportamentais: row.habilidades_comportamentais ?? "",
    epis: row.epis ?? "",
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? "",
    status: (row.status as StatusDescricaoCargo) ?? "Aprovada",
    pendente: row.pendente ?? null,
    elaboradoPor: row.elaborado_por ?? "",
    elaboradoEm: row.elaborado_em ?? "",
    aprovadoPor: row.aprovado_por ?? "",
    aprovadoEm: row.aprovado_em ?? "",
  };
}

function historicoFromRow(row: HistoricoRow): HistoricoDescricaoCargo {
  return {
    id: row.id,
    cargoNome: row.cargo_nome,
    campo: row.campo,
    campoLabel: labelForCampoDescricaoCargo(row.campo),
    valorAnterior: row.valor_anterior ?? "",
    valorNovo: row.valor_novo ?? "",
    editadoPor: row.editado_por,
    perfil: row.perfil ?? "",
    editadoEm: row.editado_em,
  };
}

export async function getDescricoesCargo(): Promise<DescricaoCargo[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_descricoes_cargo").select("*");
  if (error) throw new Error(`Falha ao carregar descrições de cargo do Supabase: ${error.message}`);
  return (data as DescricaoCargoRow[]).map(fromRow);
}

export async function getHistoricoDescricaoCargo(cargoNome: string): Promise<HistoricoDescricaoCargo[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase
    .from("peopleflow_descricoes_cargo_historico")
    .select("*")
    .eq("cargo_nome", cargoNome)
    .order("editado_em", { ascending: false });
  if (error) throw new Error(`Falha ao carregar histórico da descrição de cargo: ${error.message}`);
  return (data as HistoricoRow[]).map(historicoFromRow);
}

/** Nome da coluna oficial de cada campo de conteúdo — usado tanto pra
 * edição direta (RH/Diretoria) quanto pra aplicar uma proposta de Gestor
 * aprovada (ver aprovarDescricaoCargo em usePortalData.ts). */
export const COLUNA_POR_CAMPO: Record<CampoDescricaoCargo, string> = {
  codigoFormulario: "codigo_formulario",
  revisaoFormulario: "revisao_formulario",
  dataFormulario: "data_formulario",
  dataRevisaoCargo: "data_revisao_cargo",
  subordinacao: "subordinacao",
  localidade: "localidade",
  nivelDocumento: "nivel_documento",
  sumario: "sumario",
  responsabilidades: "responsabilidades",
  escolaridade: "escolaridade",
  experiencia: "experiencia",
  habilidadesTecnicas: "habilidades_tecnicas",
  habilidadesComportamentais: "habilidades_comportamentais",
  epis: "epis",
};

export interface HistoricoDescricaoCargoInput {
  campo: string;
  valorAnterior: string;
  valorNovo: string;
  editadoPor: string;
  perfil: string;
}

/** Ponto único de gravação pra todo o fluxo de revisão/aprovação da
 * Descrição de Cargo: upsert (cria a linha se o cargo ainda não tiver
 * descrição) com as colunas de `patch` (nomes de coluna já em snake_case —
 * quem chama decide se grava direto nas colunas oficiais, em `pendente`, ou
 * ambos, ver usePortalData.ts) + opcionalmente 1 linha de histórico. */
export async function salvarRevisaoDescricaoCargo(
  cargoNome: string,
  patch: Record<string, unknown>,
  historico: HistoricoDescricaoCargoInput | null,
): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error: updateError } = await supabase
    .from("peopleflow_descricoes_cargo")
    .upsert({ cargo_nome: cargoNome, ...patch }, { onConflict: "cargo_nome" });
  if (updateError) throw new Error(`Falha ao salvar descrição de cargo no Supabase: ${updateError.message}`);

  if (!historico) return;
  const { error: histError } = await supabase.from("peopleflow_descricoes_cargo_historico").insert({
    cargo_nome: cargoNome,
    campo: historico.campo,
    valor_anterior: historico.valorAnterior,
    valor_novo: historico.valorNovo,
    editado_por: historico.editadoPor,
    perfil: historico.perfil,
  });
  if (histError) throw new Error(`Falha ao registrar histórico de alteração: ${histError.message}`);
}

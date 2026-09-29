// Camada de acesso à tabela `peopleflow_vagas` — exclusiva deste portal. Sem
// CPF/dado sensível (só nome digitado, cargo, data), então leitura e escrita
// acontecem direto do navegador (RLS libera qualquer autenticado), igual
// `peopleflow_movimentacoes` — nada aqui precisa do padrão service-role do
// Aviso Prévio (esse sim tem CPF).

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { OrigemVaga, StatusVaga, Vaga } from "../types/domain";

interface VagaRow {
  id: number;
  movimentacao_id: string;
  origem: string;
  cargo: string | null;
  status: string;
  novo_colaborador_nome: string | null;
  cargo_preenchimento: string | null;
  admissao_prevista_iso: string | null;
  observacao: string | null;
  registrado_por: string | null;
  registrado_em: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  criado_por: string;
  criado_em: string;
}

function fromRow(row: VagaRow): Vaga {
  return {
    id: row.id,
    movimentacaoId: row.movimentacao_id,
    origem: row.origem as OrigemVaga,
    cargo: row.cargo,
    status: row.status as StatusVaga,
    novoColaboradorNome: row.novo_colaborador_nome,
    cargoPreenchimento: row.cargo_preenchimento,
    admissaoPrevistaIso: row.admissao_prevista_iso,
    observacao: row.observacao,
    registradoPor: row.registrado_por,
    registradoEm: row.registrado_em,
    aprovadoPor: row.aprovado_por,
    aprovadoEm: row.aprovado_em,
    criadoPor: row.criado_por,
    criadoEm: row.criado_em,
  };
}

/** Todas as vagas (qualquer MP) — carregada uma vez junto com o resto dos
 * dados do portal, igual `colaboradores`/`movimentacoes` (ver usePortalData.ts). */
export async function getVagas(): Promise<Vaga[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase.from("peopleflow_vagas").select("*").order("id", { ascending: true });
  if (error) throw new Error(`Falha ao carregar vagas do Supabase: ${error.message}`);
  return (data as VagaRow[]).map(fromRow);
}

/** Cria `quantidade` vagas autorizadas por uma MP (Desligamento com
 * substituição, ou Admissão com Quantidade de vagas > 1) — chamado ao
 * concluir a última etapa de aprovação (ver aprovarEtapaFn em
 * store/usePortalData.ts). Nunca cria uma MP de Admissão nova. */
export async function criarVagas(movimentacaoId: string, origem: OrigemVaga, cargo: string | null, quantidade: number, criadoPor: string): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const linhas = Array.from({ length: quantidade }, () => ({
    movimentacao_id: movimentacaoId,
    origem,
    cargo,
    status: "pendente",
    criado_por: criadoPor,
  }));
  const { error } = await supabase.from("peopleflow_vagas").insert(linhas);
  if (error) throw new Error(`Falha ao criar vaga(s) no Supabase: ${error.message}`);
}

/** "Registrar preenchimento" (RH) — não conclui a vaga: fica aguardando a
 * aprovação do gestor (ver aprovarPreenchimento() em usePortalData.ts). O
 * nome nunca é buscado no cadastro atual — a pessoa ainda não é colaboradora. */
export async function registrarPreenchimento(
  vagaId: number,
  dados: { novoColaboradorNome: string; cargo: string; admissaoPrevistaIso: string; observacao: string },
  registradoPor: string,
): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase
    .from("peopleflow_vagas")
    .update({
      status: "aguardando_aprovacao_gestor",
      novo_colaborador_nome: dados.novoColaboradorNome.trim(),
      cargo_preenchimento: dados.cargo,
      admissao_prevista_iso: dados.admissaoPrevistaIso,
      observacao: dados.observacao.trim() || null,
      registrado_por: registradoPor,
      registrado_em: new Date().toISOString(),
    })
    .eq("id", vagaId)
    .eq("status", "pendente");
  if (error) throw new Error(`Falha ao registrar o preenchimento: ${error.message}`);
}

/** Aprovação do gestor (ou RH) — a vaga só vira "preenchida" aqui; é este o
 * momento em que o novo colaborador entra de fato em `colaboradores` (ver
 * aprovarPreenchimentoFn em usePortalData.ts, que chama criarPreCadastro
 * logo em seguida). */
export async function aprovarPreenchimento(vagaId: number, aprovadoPor: string): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase
    .from("peopleflow_vagas")
    .update({ status: "preenchida", aprovado_por: aprovadoPor, aprovado_em: new Date().toISOString() })
    .eq("id", vagaId)
    .eq("status", "aguardando_aprovacao_gestor");
  if (error) throw new Error(`Falha ao aprovar o preenchimento: ${error.message}`);
}

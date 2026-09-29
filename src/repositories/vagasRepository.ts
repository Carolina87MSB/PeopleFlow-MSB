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
  preenchido_por_movimentacao_id: string | null;
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
    preenchidoPorMovimentacaoId: row.preenchido_por_movimentacao_id,
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

/** "Editar preenchimento" (RH, 2026-09) — só enquanto a vaga está
 * "aguardando_aprovacao_gestor" (antes da conclusão); depois de "preenchida"
 * o registro fica congelado (ver aprovarPreenchimentoFn/editarPreenchimentoFn
 * em usePortalData.ts, que grava o histórico da alteração na própria MP). */
export async function editarPreenchimento(
  vagaId: number,
  dados: { novoColaboradorNome: string; cargo: string; admissaoPrevistaIso: string; observacao: string },
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
    })
    .eq("id", vagaId)
    .eq("status", "aguardando_aprovacao_gestor");
  if (error) throw new Error(`Falha ao editar o preenchimento: ${error.message}`);
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

// ── Preenchimento interno por Promoção/Transferência (RH, 2026-09) ────────
// Uma PRO/TRF pode preencher uma vaga já autorizada, sem os dois passos
// (registrar + aprovar) do preenchimento externo — a aprovação da PRO/TRF É
// a aprovação do preenchimento. Ver seção 39 do schema.sql.

/** Reserva a vaga pra uma PRO/TRF recém-criada ("Em Aprovação") — chamado por
 * criarMovimentacaoFn ANTES de gravar a movimentação, pra nunca existir uma
 * MP com vaga_origem_id apontando pra uma vaga que não conseguiu reservar.
 * UPDATE CONDICIONAL (`where status = 'pendente'`): é a proteção de verdade
 * contra duplo preenchimento (seção 15 — "garantir no banco, não só na
 * interface"), não uma checagem só no cliente. Devolve `false` quando outra
 * movimentação reservou a vaga primeiro (corrida) — nesse caso a MP não deve
 * ser criada. */
export async function reservarVaga(vagaId: number, movimentacaoId: string): Promise<boolean> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase
    .from("peopleflow_vagas")
    .update({ status: "reservada", preenchido_por_movimentacao_id: movimentacaoId })
    .eq("id", vagaId)
    .eq("status", "pendente")
    .select("id");
  if (error) throw new Error(`Falha ao reservar a vaga: ${error.message}`);
  return (data?.length ?? 0) === 1;
}

/** Libera a vaga de volta pra "pendente" — PRO/TRF vinculada foi reprovada
 * (ver reprovarEtapaFn em usePortalData.ts). Só libera se ainda estava
 * reservada POR ESSA MESMA movimentação (nunca libera um preenchimento já
 * concluído por engano). */
export async function liberarVaga(vagaId: number, movimentacaoId: string): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase
    .from("peopleflow_vagas")
    .update({ status: "pendente", preenchido_por_movimentacao_id: null })
    .eq("id", vagaId)
    .eq("status", "reservada")
    .eq("preenchido_por_movimentacao_id", movimentacaoId);
  if (error) throw new Error(`Falha ao liberar a vaga: ${error.message}`);
}

/** Conclui o preenchimento interno — chamado quando a PRO/TRF que reservou a
 * vaga é APROVADA (ver aprovarEtapaFn em usePortalData.ts). Diferente do
 * preenchimento externo: não passa por "aguardando_aprovacao_gestor" (a
 * aprovação da própria PRO/TRF já é a aprovação) e nunca chama
 * criarPreCadastro — o colaborador já existe. */
export async function concluirPreenchimentoInterno(
  vagaId: number,
  movimentacaoId: string,
  dados: { novoColaboradorNome: string; cargoPreenchimento: string | null; admissaoPrevistaIso: string | null },
  aprovadoPor: string,
): Promise<void> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase
    .from("peopleflow_vagas")
    .update({
      status: "preenchida",
      novo_colaborador_nome: dados.novoColaboradorNome,
      cargo_preenchimento: dados.cargoPreenchimento,
      admissao_prevista_iso: dados.admissaoPrevistaIso,
      aprovado_por: aprovadoPor,
      aprovado_em: new Date().toISOString(),
    })
    .eq("id", vagaId)
    .eq("status", "reservada")
    .eq("preenchido_por_movimentacao_id", movimentacaoId);
  if (error) throw new Error(`Falha ao concluir o preenchimento interno: ${error.message}`);
}

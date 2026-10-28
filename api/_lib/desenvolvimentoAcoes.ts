// Gravações do módulo Desenvolvimento (Fase 2: Lista Mestra, Catálogo de
// Habilidades, Requisitos por Cargo). Usado só por api/desenvolvimento.ts.
//
// Regras gerais:
//   • quem chama precisa de sessão do módulo válida (peopleflow_dev_contas,
//     gerada por acao=sessao, validade 12 h) — perfil e escopo vêm dali;
//   • RH administra; Gestor só sugere requisito para cargos da própria equipe;
//   • nenhuma exclusão física — inativação/obsolescência com motivo;
//   • toda alteração relevante grava peopleflow_dev_auditoria (antes/depois);
//   • nunca grava em tabelas existentes do PeopleFlow.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { supabaseAdmin } from "./adminAuth.js";
import { emailOf, perfilOf } from "../../src/domain/hierarquia.js";
import { dataEfetivaDeRealizacao } from "../../src/domain/dataRealizacao.js";
import { DECLARACAO_GRAVACAO, NOTA_LISTA_GRAVACAO, localParaLista, podeConfirmarPorGravacao, validarLinkGravacao } from "../../src/domain/gravacao.js";
import { diaEmBrasilia, elegivelParaReacao, fimDoPrazoDaReacao, indicadorAdesao, mediasConsolidadas, MINIMO_RESPOSTAS_PARA_MEDIAS, QUESTOES, situacaoDaReacao, validarRespostas, VERSAO_FORMULARIO, type SituacaoReacao } from "../../src/domain/avaliacaoReacao.js";
import { gerarPdfListaPresenca, type ParticipanteLista } from "./listaPresencaPdf.js";
import { ACOES_LNT, ErroLnt } from "./lntAcoes.js";
import { ACOES_PDI_ENCERRAMENTO } from "./pdiEncerramentoAcoes.js";
import { criarTriagemPdi } from "./pdiTriagemAcoes.js";

import { COLUNAS_SITUACAO, linhaAtiva } from "./situacaoColaboradores.js";
export interface ContaDev {
  userId: string;
  colaboradorId: number;
  perfil: "RH" | "Gestor" | "Responsavel";
  /** Habilitação permanente concedida pelo RH (consulta ao vivo). O RH não depende dela; sem ela ninguém administra treinamentos. */
  habilitado?: boolean;
}

class ErroHttp extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const VALIDADE_SESSAO_MS = 12 * 3600 * 1000;

async function exigirConta(req: VercelRequest): Promise<ContaDev> {
  const raw = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  const token = raw?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new ErroHttp(401, "Token de autenticação ausente.");
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) throw new ErroHttp(401, "Sessão inválida ou expirada.");
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_contas")
    .select("colaborador_id, perfil, atualizado_em")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error) throw new ErroHttp(500, error.message);
  if (!data || Date.now() - new Date(data.atualizado_em as string).getTime() > VALIDADE_SESSAO_MS) {
    throw new ErroHttp(401, "A sessão do módulo expirou. Recarregue a página.");
  }
  const perfil = data.perfil as ContaDev["perfil"];
  const colaboradorId = data.colaborador_id as number;
  return { userId: userData.user.id, colaboradorId, perfil, habilitado: perfil === "RH" ? true : await temHabilitacaoAtiva(colaboradorId) };
}

function exigirRH(conta: ContaDev) {
  if (conta.perfil !== "RH") throw new ErroHttp(403, "Somente o RH pode fazer esta alteração.");
}

// ── Validação de entrada ────────────────────────────────────────────────
type Corpo = Record<string, unknown>;

function texto(corpo: Corpo, campo: string, opts: { obrigatorio?: boolean; max?: number; rotulo?: string } = {}): string {
  const v = corpo[campo];
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  if (opts.obrigatorio && !s) throw new ErroHttp(422, `Informe ${opts.rotulo ?? campo}.`);
  if (s.length > (opts.max ?? 2000)) throw new ErroHttp(422, `${opts.rotulo ?? campo} excede ${opts.max ?? 2000} caracteres.`);
  return s;
}

function inteiroOpcional(corpo: Corpo, campo: string, rotulo: string, min = 1, max = 600): number | null {
  const v = corpo[campo];
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ErroHttp(422, `${rotulo} deve ser um número inteiro entre ${min} e ${max}.`);
  return n;
}

function idObrigatorio(corpo: Corpo, campo: string, rotulo: string): number {
  const n = Number(corpo[campo]);
  if (!Number.isInteger(n) || n <= 0) throw new ErroHttp(422, `${rotulo} inválido.`);
  return n;
}

function dataOpcional(corpo: Corpo, campo: string, rotulo: string): string | null {
  const s = texto(corpo, campo, { max: 10 });
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new ErroHttp(422, `${rotulo} inválida.`);
  return s;
}

function umDe<T extends string>(valor: string, opcoes: readonly T[], rotulo: string): T {
  if (!(opcoes as readonly string[]).includes(valor)) throw new ErroHttp(422, `${rotulo} inválido.`);
  return valor as T;
}

/** Nome padronizado: sem acento, minúsculo, espaços simples — base da regra de
 * não duplicidade. IDÊNTICA a public.peopleflow_dev_normalizar_nome()
 * (supabase/desenvolvimento_fase2.sql): mesmos passos, mesma ordem e o mesmo
 * conjunto explícito de espaços (espaço, tab, \n, \v, \f, \r, NBSP). */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ \t\n\v\f\r ]+/g, " ")
    .replace(/^ +| +$/g, "");
}

function erroBanco(error: { code?: string; message: string }, contexto: string): never {
  if (error.code === "23505") throw new ErroHttp(409, `${contexto}: já existe um registro igual.`);
  if (error.code === "23514" || error.code === "23503" || error.code === "22P02") throw new ErroHttp(422, `${contexto}: dados inválidos (${error.message}).`);
  throw new ErroHttp(500, `${contexto}: ${error.message}`);
}

async function auditar(conta: ContaDev, acao: string, entidade: string, entidadeId: string, detalhe: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("peopleflow_dev_auditoria").insert({
    user_id: conta.userId,
    colaborador_id: conta.colaboradorId,
    acao,
    entidade,
    entidade_id: entidadeId,
    detalhe,
  });
  if (error) throw new ErroHttp(500, `Auditoria: ${error.message}`);
}

/** Só os campos que mudaram, no formato { campo: { antes, depois } }. */
function diferencas(antes: Record<string, unknown>, depois: Record<string, unknown>) {
  const out: Record<string, { antes: unknown; depois: unknown }> = {};
  for (const k of Object.keys(depois)) if (JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null)) out[k] = { antes: antes[k] ?? null, depois: depois[k] };
  return out;
}

// ── Lista Mestra ────────────────────────────────────────────────────────
const COLS_LM = "codigo, titulo, revisao_atual, data_revisao, situacao, periodicidade_meses, observacao";

async function listaMestraSalvar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const novo = corpo.novo === true;
  const codigo = texto(corpo, "codigo", { obrigatorio: true, max: 40, rotulo: "o código" });
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/.test(codigo)) throw new ErroHttp(422, "Código com caracteres inválidos.");
  const campos = {
    titulo: texto(corpo, "titulo", { obrigatorio: true, max: 300, rotulo: "o título" }),
    periodicidade_meses: inteiroOpcional(corpo, "periodicidade_meses", "Periodicidade (meses)"),
    observacao: texto(corpo, "observacao", { max: 2000 }),
  };

  if (novo) {
    const revisao = texto(corpo, "revisao", { obrigatorio: true, max: 20, rotulo: "a revisão" });
    const dataRevisao = dataOpcional(corpo, "data_revisao", "Data da revisão");
    const { data, error } = await supabaseAdmin
      .from("peopleflow_dev_lista_mestra")
      .insert({ codigo, ...campos, revisao_atual: revisao, data_revisao: dataRevisao, situacao: "vigente", origem_registro: "sistema", created_by: conta.userId, updated_by: conta.userId })
      .select(COLS_LM)
      .single();
    if (error) erroBanco(error, "Lista Mestra");
    const { error: revError } = await supabaseAdmin
      .from("peopleflow_dev_lista_mestra_revisoes")
      .insert({ codigo, revisao, data_revisao: dataRevisao, observacao: "Revisão vigente no cadastro", registrado_por: conta.userId });
    if (revError) erroBanco(revError, "Histórico de revisões");
    await auditar(conta, "lista_mestra_criada", "peopleflow_dev_lista_mestra", codigo, { depois: data });
    return data;
  }

  const { data: antes, error: lerErro } = await supabaseAdmin.from("peopleflow_dev_lista_mestra").select(COLS_LM).eq("codigo", codigo).maybeSingle();
  if (lerErro) erroBanco(lerErro, "Lista Mestra");
  if (!antes) throw new ErroHttp(404, "Documento não encontrado na Lista Mestra.");
  const mudou = diferencas(antes, campos);
  if (Object.keys(mudou).length === 0) return antes;
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_lista_mestra")
    .update({ ...campos, updated_by: conta.userId })
    .eq("codigo", codigo)
    .select(COLS_LM)
    .single();
  if (error) erroBanco(error, "Lista Mestra");
  await auditar(conta, "lista_mestra_editada", "peopleflow_dev_lista_mestra", codigo, { alteracoes: mudou });
  return data;
}

async function listaMestraRevisao(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const codigo = texto(corpo, "codigo", { obrigatorio: true, max: 40, rotulo: "o código" });
  const revisao = texto(corpo, "revisao", { obrigatorio: true, max: 20, rotulo: "a nova revisão" });
  const dataRevisao = dataOpcional(corpo, "data_revisao", "Data da revisão");
  const observacao = texto(corpo, "observacao", { max: 2000 });
  const { data: doc, error: lerErro } = await supabaseAdmin.from("peopleflow_dev_lista_mestra").select(COLS_LM).eq("codigo", codigo).maybeSingle();
  if (lerErro) erroBanco(lerErro, "Lista Mestra");
  if (!doc) throw new ErroHttp(404, "Documento não encontrado na Lista Mestra.");
  if (doc.revisao_atual === revisao) throw new ErroHttp(422, "Essa já é a revisão vigente.");
  const { error: revError } = await supabaseAdmin
    .from("peopleflow_dev_lista_mestra_revisoes")
    .insert({ codigo, revisao, data_revisao: dataRevisao, observacao, registrado_por: conta.userId });
  if (revError) erroBanco(revError, "Histórico de revisões");
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_lista_mestra")
    .update({ revisao_atual: revisao, data_revisao: dataRevisao, updated_by: conta.userId })
    .eq("codigo", codigo)
    .select(COLS_LM)
    .single();
  if (error) erroBanco(error, "Lista Mestra");
  await auditar(conta, "lista_mestra_revisao", "peopleflow_dev_lista_mestra", codigo, {
    revisao_anterior: doc.revisao_atual,
    revisao_nova: revisao,
    data_revisao: dataRevisao,
    observacao,
  });
  return data;
}

async function listaMestraSituacao(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const codigo = texto(corpo, "codigo", { obrigatorio: true, max: 40, rotulo: "o código" });
  const situacao = umDe(texto(corpo, "situacao"), ["vigente", "obsoleto"] as const, "Situação");
  const motivo = texto(corpo, "motivo", { obrigatorio: situacao === "obsoleto", max: 1000, rotulo: "o motivo" });
  const { data: doc, error: lerErro } = await supabaseAdmin.from("peopleflow_dev_lista_mestra").select("situacao").eq("codigo", codigo).maybeSingle();
  if (lerErro) erroBanco(lerErro, "Lista Mestra");
  if (!doc) throw new ErroHttp(404, "Documento não encontrado na Lista Mestra.");
  if (doc.situacao === situacao) throw new ErroHttp(422, "O documento já está nessa situação.");
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_lista_mestra")
    .update({ situacao, updated_by: conta.userId })
    .eq("codigo", codigo)
    .select(COLS_LM)
    .single();
  if (error) erroBanco(error, "Lista Mestra");
  await auditar(conta, situacao === "obsoleto" ? "lista_mestra_inativada" : "lista_mestra_reativada", "peopleflow_dev_lista_mestra", codigo, {
    situacao: { antes: doc.situacao, depois: situacao },
    motivo,
  });
  return data;
}

// ── Catálogo de habilidades ─────────────────────────────────────────────
const COLS_HAB = "id, nome, descricao, tipo, categoria, norma, ativo";

async function habilidadeSalvar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const id = corpo.id == null || corpo.id === "" ? null : idObrigatorio(corpo, "id", "Habilidade");
  const nome = texto(corpo, "nome", { obrigatorio: true, max: 200, rotulo: "o nome" }).replace(/\s+/g, " ");
  const campos = {
    nome,
    nome_normalizado: normalizarNome(nome),
    descricao: texto(corpo, "descricao", { max: 2000 }),
    tipo: umDe(texto(corpo, "tipo"), ["tecnica", "regulatoria"] as const, "Tipo"),
    categoria: texto(corpo, "categoria", { max: 80 }) || null,
    norma: (texto(corpo, "norma") || null) as string | null,
  };
  if (campos.norma) umDe(campos.norma, ["iso_13485", "rdc_665", "ambas", "nao_aplicavel"] as const, "Norma");

  const { data: igual, error: dupErro } = await supabaseAdmin
    .from("peopleflow_dev_habilidades")
    .select("id, nome, ativo")
    .eq("nome_normalizado", campos.nome_normalizado)
    .maybeSingle();
  if (dupErro) erroBanco(dupErro, "Habilidades");
  if (igual && igual.id !== id) {
    throw new ErroHttp(409, `Já existe a habilidade "${igual.nome}"${igual.ativo ? "" : " (inativa — reative-a em vez de cadastrar de novo)"}.`);
  }

  if (!id) {
    const { data, error } = await supabaseAdmin
      .from("peopleflow_dev_habilidades")
      .insert({ ...campos, ativo: true, origem_registro: "sistema", created_by: conta.userId, updated_by: conta.userId })
      .select(COLS_HAB)
      .single();
    if (error) erroBanco(error, "Habilidades");
    await auditar(conta, "habilidade_criada", "peopleflow_dev_habilidades", String(data.id), { depois: data });
    return data;
  }

  const { data: antes, error: lerErro } = await supabaseAdmin.from("peopleflow_dev_habilidades").select(COLS_HAB).eq("id", id).maybeSingle();
  if (lerErro) erroBanco(lerErro, "Habilidades");
  if (!antes) throw new ErroHttp(404, "Habilidade não encontrada.");
  const { nome_normalizado: _n, ...comparaveis } = campos;
  void _n;
  const mudou = diferencas(antes, comparaveis);
  if (Object.keys(mudou).length === 0) return antes;
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_habilidades").update({ ...campos, updated_by: conta.userId }).eq("id", id).select(COLS_HAB).single();
  if (error) erroBanco(error, "Habilidades");
  await auditar(conta, "habilidade_editada", "peopleflow_dev_habilidades", String(id), { alteracoes: mudou });
  return data;
}

async function habilidadeAtivo(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const id = idObrigatorio(corpo, "id", "Habilidade");
  const ativo = corpo.ativo === true;
  const motivo = texto(corpo, "motivo", { obrigatorio: !ativo, max: 1000, rotulo: "o motivo" });
  const { data: antes, error: lerErro } = await supabaseAdmin.from("peopleflow_dev_habilidades").select("ativo").eq("id", id).maybeSingle();
  if (lerErro) erroBanco(lerErro, "Habilidades");
  if (!antes) throw new ErroHttp(404, "Habilidade não encontrada.");
  if (antes.ativo === ativo) throw new ErroHttp(422, ativo ? "A habilidade já está ativa." : "A habilidade já está inativa.");
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_habilidades").update({ ativo, updated_by: conta.userId }).eq("id", id).select(COLS_HAB).single();
  if (error) erroBanco(error, "Habilidades");
  await auditar(conta, ativo ? "habilidade_reativada" : "habilidade_inativada", "peopleflow_dev_habilidades", String(id), { motivo });
  return data;
}

// ── Requisitos por cargo ────────────────────────────────────────────────
const COLS_REQ =
  "id, cargo_nome, tipo_requisito, habilidade_id, lista_mestra_codigo, descricao_sugerida, obrigatorio, periodicidade_meses, recicla_na_revisao, observacao, justificativa, origem, status, status_motivo, sugerido_por_colaborador_id, validado_em, created_at, updated_at";

async function exigirCargoOficial(cargoNome: string, permitirObsoleto: boolean) {
  const { data, error } = await supabaseAdmin.from("peopleflow_descricoes_cargo").select("cargo_nome, obsoleto").eq("cargo_nome", cargoNome).maybeSingle();
  if (error) erroBanco(error, "Cargo");
  if (!data) throw new ErroHttp(422, "Cargo sem Descrição de Cargo no PeopleFlow.");
  if (data.obsoleto && !permitirObsoleto) throw new ErroHttp(422, "Cargo marcado como obsoleto.");
}

async function exigirCargoNaEquipe(conta: ContaDev, cargoNome: string) {
  if (conta.perfil !== "RH") exigirNaoResponsavel(conta);
  if (conta.perfil === "RH") return;
  const { data: ids, error } = await supabaseAdmin.from("peopleflow_dev_escopo").select("colaborador_id").eq("gestor_colaborador_id", conta.colaboradorId);
  if (error) erroBanco(error, "Escopo");
  const lista = (ids ?? []).map((r) => r.colaborador_id as number);
  if (lista.length === 0) throw new ErroHttp(403, "Cargo fora da sua equipe.");
  const { data: ocupantes, error: ocupErro } = await supabaseAdmin.from("colaboradores").select("id").in("id", lista).eq("cargo", cargoNome).limit(1);
  if (ocupErro) erroBanco(ocupErro, "Escopo");
  if (!ocupantes || ocupantes.length === 0) throw new ErroHttp(403, "Cargo fora da sua equipe.");
}

async function exigirReferencias(tipo: "habilidade" | "treinamento", habilidadeId: number | null, codigo: string | null) {
  if (tipo === "habilidade" && habilidadeId) {
    const { data, error } = await supabaseAdmin.from("peopleflow_dev_habilidades").select("ativo").eq("id", habilidadeId).maybeSingle();
    if (error) erroBanco(error, "Habilidades");
    if (!data) throw new ErroHttp(422, "Habilidade não encontrada no catálogo.");
    if (!data.ativo) throw new ErroHttp(422, "Habilidade inativa no catálogo.");
  }
  if (tipo === "treinamento" && codigo) {
    const { data, error } = await supabaseAdmin.from("peopleflow_dev_lista_mestra").select("situacao").eq("codigo", codigo).maybeSingle();
    if (error) erroBanco(error, "Lista Mestra");
    if (!data) throw new ErroHttp(422, "Documento não encontrado na Lista Mestra.");
    if (data.situacao !== "vigente") throw new ErroHttp(422, "Documento obsoleto na Lista Mestra.");
  }
}

function lerRequisito(corpo: Corpo) {
  const tipo = umDe(texto(corpo, "tipo_requisito"), ["habilidade", "treinamento"] as const, "Tipo do requisito");
  const habilidadeId = tipo === "habilidade" && corpo.habilidade_id ? idObrigatorio(corpo, "habilidade_id", "Habilidade") : null;
  const codigo = tipo === "treinamento" ? texto(corpo, "lista_mestra_codigo", { max: 40 }) || null : null;
  const descricaoSugerida = texto(corpo, "descricao_sugerida", { max: 500 }) || null;
  return {
    tipo_requisito: tipo,
    habilidade_id: habilidadeId,
    lista_mestra_codigo: codigo,
    descricao_sugerida: habilidadeId || codigo ? null : descricaoSugerida,
    obrigatorio: corpo.obrigatorio !== false,
    periodicidade_meses: tipo === "treinamento" ? inteiroOpcional(corpo, "periodicidade_meses", "Periodicidade (meses)") : null,
    // Nova revisão do documento exige novo treinamento → gap "Nova revisão" até treinar na revisão vigente.
    recicla_na_revisao: tipo === "treinamento" && corpo.recicla_na_revisao === true,
    observacao: texto(corpo, "observacao", { max: 2000 }),
    justificativa: texto(corpo, "justificativa", { max: 2000 }),
  };
}

function temReferencia(r: { habilidade_id: number | null; lista_mestra_codigo: string | null }) {
  return Boolean(r.habilidade_id || r.lista_mestra_codigo);
}

async function requisitoSalvar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const id = corpo.id == null || corpo.id === "" ? null : idObrigatorio(corpo, "id", "Requisito");
  const campos = lerRequisito(corpo);
  await exigirReferencias(campos.tipo_requisito, campos.habilidade_id, campos.lista_mestra_codigo);

  if (!id) {
    const cargoNome = texto(corpo, "cargo_nome", { obrigatorio: true, max: 200, rotulo: "o cargo" });
    await exigirCargoOficial(cargoNome, false);
    const status = umDe(texto(corpo, "status") || "sugerido", ["sugerido", "vigente"] as const, "Status");
    if (status === "vigente" && !temReferencia(campos)) throw new ErroHttp(422, "Para cadastrar como vigente, vincule a habilidade do catálogo ou o documento da Lista Mestra.");
    if (!temReferencia(campos) && !campos.descricao_sugerida) throw new ErroHttp(422, "Selecione a habilidade/documento ou descreva o requisito.");
    const agora = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("peopleflow_dev_cargo_requisitos")
      .insert({
        ...campos,
        cargo_nome: cargoNome,
        status,
        origem: "rh",
        origem_registro: "sistema",
        validado_em: status === "vigente" ? agora : null,
        validado_por: status === "vigente" ? conta.userId : null,
        created_by: conta.userId,
        updated_by: conta.userId,
      })
      .select(COLS_REQ)
      .single();
    if (error) erroBanco(error, "Requisito");
    await auditar(conta, "requisito_criado", "peopleflow_dev_cargo_requisitos", String(data.id), { depois: data });
    return data;
  }

  const { data: antes, error: lerErro } = await supabaseAdmin.from("peopleflow_dev_cargo_requisitos").select(COLS_REQ).eq("id", id).maybeSingle();
  if (lerErro) erroBanco(lerErro, "Requisito");
  if (!antes) throw new ErroHttp(404, "Requisito não encontrado.");
  if (antes.status === "vigente" && !temReferencia(campos)) throw new ErroHttp(422, "Requisito vigente precisa manter a habilidade/documento vinculado.");
  if (!temReferencia(campos) && !campos.descricao_sugerida) throw new ErroHttp(422, "Selecione a habilidade/documento ou descreva o requisito.");
  // Justificativa e texto original de uma sugestão do gestor são preservados
  // como foram registrados, mesmo depois que o RH vincula o item do catálogo.
  const atualizacao =
    antes.origem === "gestor" ? { ...campos, justificativa: antes.justificativa, descricao_sugerida: antes.descricao_sugerida } : campos;
  const mudou = diferencas(antes, atualizacao);
  if (Object.keys(mudou).length === 0) return antes;
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_cargo_requisitos")
    .update({ ...atualizacao, updated_by: conta.userId })
    .eq("id", id)
    .select(COLS_REQ)
    .single();
  if (error) erroBanco(error, "Requisito");
  await auditar(conta, "requisito_editado", "peopleflow_dev_cargo_requisitos", String(id), { cargo_nome: antes.cargo_nome, alteracoes: mudou });
  return data;
}

async function requisitoStatus(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const id = idObrigatorio(corpo, "id", "Requisito");
  const status = umDe(texto(corpo, "status"), ["vigente", "inativo"] as const, "Status");
  const motivo = texto(corpo, "motivo", { obrigatorio: status === "inativo", max: 1000, rotulo: "o motivo" });
  const { data: antes, error: lerErro } = await supabaseAdmin.from("peopleflow_dev_cargo_requisitos").select(COLS_REQ).eq("id", id).maybeSingle();
  if (lerErro) erroBanco(lerErro, "Requisito");
  if (!antes) throw new ErroHttp(404, "Requisito não encontrado.");
  if (antes.status === status) throw new ErroHttp(422, "O requisito já está nesse status.");
  if (status === "vigente") {
    if (!temReferencia(antes)) throw new ErroHttp(422, "Antes de validar, edite o requisito e vincule a habilidade do catálogo ou o documento da Lista Mestra.");
    await exigirReferencias(antes.tipo_requisito, antes.habilidade_id, antes.lista_mestra_codigo);
    await exigirCargoOficial(antes.cargo_nome, false);
  }
  const agora = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_cargo_requisitos")
    .update({
      status,
      status_motivo: motivo || null,
      ...(status === "vigente" ? { validado_em: agora, validado_por: conta.userId } : {}),
      updated_by: conta.userId,
    })
    .eq("id", id)
    .select(COLS_REQ)
    .single();
  if (error) erroBanco(error, "Requisito");
  const acao = status === "vigente" ? (antes.status === "sugerido" ? "requisito_validado" : "requisito_reativado") : "requisito_inativado";
  await auditar(conta, acao, "peopleflow_dev_cargo_requisitos", String(id), { cargo_nome: antes.cargo_nome, status: { antes: antes.status, depois: status }, motivo });
  return data;
}

async function requisitoSugerir(conta: ContaDev, corpo: Corpo) {
  const cargoNome = texto(corpo, "cargo_nome", { obrigatorio: true, max: 200, rotulo: "o cargo" });
  await exigirCargoOficial(cargoNome, false);
  await exigirCargoNaEquipe(conta, cargoNome);
  const campos = lerRequisito(corpo);
  if (!campos.justificativa) throw new ErroHttp(422, "Informe a justificativa da sugestão.");
  if (!temReferencia(campos) && !campos.descricao_sugerida) throw new ErroHttp(422, "Selecione a habilidade/documento ou descreva o requisito sugerido.");
  await exigirReferencias(campos.tipo_requisito, campos.habilidade_id, campos.lista_mestra_codigo);
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_cargo_requisitos")
    .insert({
      ...campos,
      cargo_nome: cargoNome,
      status: "sugerido",
      origem: conta.perfil === "RH" ? "rh" : "gestor",
      origem_registro: "sistema",
      sugerido_por_colaborador_id: conta.colaboradorId,
      created_by: conta.userId,
      updated_by: conta.userId,
    })
    .select(COLS_REQ)
    .single();
  if (error) {
    if (error.code === "23505") throw new ErroHttp(409, "Esse requisito já existe para o cargo (vigente, sugerido ou inativo).");
    erroBanco(error, "Sugestão de requisito");
  }
  await auditar(conta, "requisito_sugerido", "peopleflow_dev_cargo_requisitos", String(data.id), { cargo_nome: cargoNome, justificativa: campos.justificativa, depois: data });
  return data;
}

// ── Base de Necessidades (Fase 4) ───────────────────────────────────────
const CATEGORIAS_NEC = ["tecnica", "qualidade_regulatorio", "seguranca", "sistemas_ferramentas", "comportamental", "lideranca", "integracao", "outra"] as const;
const PRIORIDADES = ["alta", "media", "baixa"] as const;
const COLS_NEC =
  "id, colaborador_id, cargo_nome, origem, descricao, justificativa, categoria, prioridade, sugestao_capacitacao, observacao, status, status_motivo, gestor_colaborador_id, departamento, requisito_id, pdi_id, pdi_item_id, pdi_acao_id, pdi_item_nome, grupo_id, solicitado_por_colaborador_id, validada_em, created_at, updated_at";

/** Colaborador ativo + fotografia de departamento e gestor (id) na data do registro. */
async function lerColaboradorParaNecessidade(colaboradorId: number) {
  const { data: c, error } = await supabaseAdmin.from("colaboradores").select(`id, nome, cargo, departamento, gestor, ${COLUNAS_SITUACAO}`).eq("id", colaboradorId).maybeSingle();
  if (error) erroBanco(error, "Colaborador");
  if (!c || !linhaAtiva(c)) throw new ErroHttp(422, "Colaborador não encontrado ou desligado.");
  let gestorId: number | null = null;
  if (c.gestor) {
    const { data: g, error: gErro } = await supabaseAdmin.from("colaboradores").select(`id, ${COLUNAS_SITUACAO}`).eq("nome", c.gestor);
    if (gErro) erroBanco(gErro, "Gestor");
    const ativosDoNome = (g ?? []).filter((x) => linhaAtiva(x));
    if (ativosDoNome.length === 1) gestorId = ativosDoNome[0].id as number;
  }
  return { id: c.id as number, cargo: c.cargo as string, departamento: (c.departamento as string) || null, gestorId };
}

/** A habilitação de Responsável por Treinamentos NÃO dá acesso a outras áreas do módulo (Necessidades, Requisitos, Habilidades). */
function exigirNaoResponsavel(conta: ContaDev) {
  if (conta.perfil === "Responsavel") throw new ErroHttp(403, "O perfil de Responsável por Treinamentos acessa somente a Gestão de Treinamentos: Necessidades, Requisitos e Habilidades são do RH e das lideranças.");
}
async function exigirColaboradorNaEquipe(conta: ContaDev, colaboradorId: number) {
  if (conta.perfil === "RH") return;
  exigirNaoResponsavel(conta);
  if (colaboradorId === conta.colaboradorId) throw new ErroHttp(422, "Registre Necessidades de Desenvolvimento para os seus liderados.");
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_escopo")
    .select("colaborador_id")
    .eq("gestor_colaborador_id", conta.colaboradorId)
    .eq("colaborador_id", colaboradorId)
    .maybeSingle();
  if (error) erroBanco(error, "Escopo");
  if (!data) throw new ErroHttp(403, "Colaborador fora da sua equipe.");
}

function lerCamposNecessidade(corpo: Corpo) {
  return {
    descricao: texto(corpo, "descricao", { obrigatorio: true, max: 500, rotulo: "a Necessidade de Desenvolvimento" }),
    categoria: umDe(texto(corpo, "categoria"), CATEGORIAS_NEC, "Categoria"),
    prioridade: umDe(texto(corpo, "prioridade") || "media", PRIORIDADES, "Prioridade"),
    sugestao_capacitacao: texto(corpo, "sugestao_capacitacao", { max: 500 }),
    observacao: texto(corpo, "observacao", { max: 2000 }),
  };
}

async function necessidadeRegistrar(conta: ContaDev, corpo: Corpo) {
  const colaboradorId = idObrigatorio(corpo, "colaborador_id", "Colaborador");
  await exigirColaboradorNaEquipe(conta, colaboradorId);
  const colab = await lerColaboradorParaNecessidade(colaboradorId);
  const campos = lerCamposNecessidade(corpo);
  const justificativa = texto(corpo, "justificativa", { obrigatorio: true, max: 2000, rotulo: "a justificativa" });
  const agora = new Date().toISOString();

  let origem: string = "gestor";
  let vinculoRequisito: Record<string, unknown> = {};
  if (conta.perfil === "RH") {
    origem = umDe(texto(corpo, "origem") || "rh", ["rh", "operacional"] as const, "Origem");
    const requisitoId = corpo.requisito_id ? idObrigatorio(corpo, "requisito_id", "Requisito") : null;
    if (requisitoId) {
      // Preparação da integração com requisitos: só requisito VIGENTE do cargo do colaborador.
      const { data: req, error } = await supabaseAdmin
        .from("peopleflow_dev_cargo_requisitos")
        .select("id, cargo_nome, status, tipo_requisito, habilidade_id, lista_mestra_codigo")
        .eq("id", requisitoId)
        .maybeSingle();
      if (error) erroBanco(error, "Requisito");
      if (!req || req.status !== "vigente") throw new ErroHttp(422, "Somente requisito VIGENTE pode originar Necessidade de Desenvolvimento.");
      if (req.cargo_nome !== colab.cargo) throw new ErroHttp(422, "O requisito não é do cargo atual do colaborador.");
      origem = req.tipo_requisito === "habilidade" ? "habilidade" : "treinamento_obrigatorio";
      vinculoRequisito = { requisito_id: req.id, habilidade_id: req.habilidade_id, lista_mestra_codigo: req.lista_mestra_codigo };
    }
  }
  const status = conta.perfil === "RH" ? "validada" : "sugerida";
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_necessidades")
    .insert({
      ...campos,
      ...vinculoRequisito,
      justificativa,
      colaborador_id: colab.id,
      departamento: colab.departamento,
      gestor_colaborador_id: colab.gestorId,
      origem,
      status,
      validada_em: status === "validada" ? agora : null,
      validada_por: status === "validada" ? conta.userId : null,
      solicitado_por_colaborador_id: conta.colaboradorId,
      origem_registro: "sistema",
      created_by: conta.userId,
      updated_by: conta.userId,
    })
    .select(COLS_NEC)
    .single();
  if (error) erroBanco(error, "Necessidade de Desenvolvimento");
  await auditar(conta, "necessidade_registrada", "peopleflow_dev_necessidades", String(data.id), { depois: data });
  return data;
}

async function lerNecessidade(id: number) {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_necessidades").select(COLS_NEC).eq("id", id).maybeSingle();
  if (error) erroBanco(error, "Necessidade de Desenvolvimento");
  if (!data) throw new ErroHttp(404, "Necessidade de Desenvolvimento não encontrada.");
  return data;
}

async function necessidadeEditar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const id = idObrigatorio(corpo, "id", "Necessidade de Desenvolvimento");
  const antes = await lerNecessidade(id);
  if (antes.status === "cancelada") throw new ErroHttp(422, "Reabra a Necessidade de Desenvolvimento antes de editar.");
  const campos = lerCamposNecessidade(corpo);
  const mudou = diferencas(antes, campos);
  if (Object.keys(mudou).length === 0) return antes;
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_necessidades").update({ ...campos, updated_by: conta.userId }).eq("id", id).select(COLS_NEC).single();
  if (error) erroBanco(error, "Necessidade de Desenvolvimento");
  await auditar(conta, "necessidade_editada", "peopleflow_dev_necessidades", String(id), { alteracoes: mudou });
  return data;
}

async function necessidadeStatus(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const id = idObrigatorio(corpo, "id", "Necessidade de Desenvolvimento");
  const status = umDe(texto(corpo, "status"), ["validada", "cancelada", "sugerida"] as const, "Status");
  const motivo = texto(corpo, "motivo", { obrigatorio: status === "cancelada", max: 1000, rotulo: "a justificativa" });
  const antes = await lerNecessidade(id);
  // PLANEJADA e ATENDIDA serão definidas pelo vínculo com treinamento (fase seguinte), não manualmente.
  const permitidas: Record<string, string[]> = { sugerida: ["validada", "cancelada"], validada: ["cancelada"], cancelada: ["sugerida"] };
  if (!(permitidas[antes.status] ?? []).includes(status)) throw new ErroHttp(422, `Não é possível passar de ${antes.status} para ${status}.`);
  const agora = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_necessidades")
    .update({
      status,
      status_motivo: motivo || null,
      ...(status === "validada" ? { validada_em: agora, validada_por: conta.userId } : {}),
      ...(status === "sugerida" ? { validada_em: null, validada_por: null } : {}),
      updated_by: conta.userId,
    })
    .eq("id", id)
    .select(COLS_NEC)
    .single();
  if (error) erroBanco(error, "Necessidade de Desenvolvimento");
  const acao = status === "validada" ? "necessidade_validada" : status === "cancelada" ? "necessidade_cancelada" : "necessidade_reaberta";
  await auditar(conta, acao, "peopleflow_dev_necessidades", String(id), { status: { antes: antes.status, depois: status }, motivo });
  return data;
}

async function necessidadeConsolidar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const ids = Array.isArray(corpo.ids) ? [...new Set(corpo.ids.map(Number))].filter((n) => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) throw new ErroHttp(422, "Selecione ao menos uma Necessidade de Desenvolvimento.");
  if (ids.length > 500) throw new ErroHttp(422, "Selecione no máximo 500 Necessidades de Desenvolvimento por vez.");
  let grupoId = corpo.grupo_id ? idObrigatorio(corpo, "grupo_id", "Grupo") : null;
  if (grupoId) {
    const { data: g, error } = await supabaseAdmin.from("peopleflow_dev_necessidade_grupos").select("id, ativo").eq("id", grupoId).maybeSingle();
    if (error) erroBanco(error, "Grupo");
    if (!g || !g.ativo) throw new ErroHttp(422, "Grupo não encontrado.");
  } else {
    const titulo = texto(corpo, "titulo", { obrigatorio: true, max: 200, rotulo: "o título do grupo" });
    const categoria = texto(corpo, "categoria") || null;
    if (categoria) umDe(categoria, CATEGORIAS_NEC, "Categoria");
    const { data: g, error } = await supabaseAdmin
      .from("peopleflow_dev_necessidade_grupos")
      .insert({ titulo, categoria, descricao: texto(corpo, "descricao", { max: 2000 }), created_by: conta.userId, updated_by: conta.userId })
      .select("id, titulo, categoria")
      .single();
    if (error) {
      if (error.code === "23505") throw new ErroHttp(409, "Já existe um grupo com esse título — selecione-o na lista.");
      erroBanco(error, "Grupo");
    }
    grupoId = g.id as number;
    await auditar(conta, "grupo_necessidades_criado", "peopleflow_dev_necessidade_grupos", String(grupoId), { depois: g });
  }
  const { data: alvo, error: lerErro } = await supabaseAdmin.from("peopleflow_dev_necessidades").select("id, status, grupo_id").in("id", ids);
  if (lerErro) erroBanco(lerErro, "Necessidade de Desenvolvimento");
  const validos = (alvo ?? []).filter((n) => n.status !== "cancelada").map((n) => n.id as number);
  if (validos.length === 0) throw new ErroHttp(422, "Nenhuma das Necessidades de Desenvolvimento selecionadas pode ser consolidada (canceladas não entram).");
  const { error } = await supabaseAdmin.from("peopleflow_dev_necessidades").update({ grupo_id: grupoId, updated_by: conta.userId }).in("id", validos);
  if (error) erroBanco(error, "Consolidação");
  await auditar(conta, "necessidades_consolidadas", "peopleflow_dev_necessidade_grupos", String(grupoId), {
    necessidades: validos,
    grupos_anteriores: Object.fromEntries((alvo ?? []).filter((n) => validos.includes(n.id as number)).map((n) => [n.id, n.grupo_id])),
  });
  return { grupo_id: grupoId, consolidadas: validos.length, ignoradas: ids.length - validos.length };
}

async function necessidadeDesagrupar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const id = idObrigatorio(corpo, "id", "Necessidade de Desenvolvimento");
  const antes = await lerNecessidade(id);
  if (!antes.grupo_id) throw new ErroHttp(422, "A Necessidade de Desenvolvimento não está consolidada.");
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_necessidades").update({ grupo_id: null, updated_by: conta.userId }).eq("id", id).select(COLS_NEC).single();
  if (error) erroBanco(error, "Necessidade de Desenvolvimento");
  await auditar(conta, "necessidade_desagrupada", "peopleflow_dev_necessidades", String(id), { grupo_anterior: antes.grupo_id });
  return data;
}

// ── Integração com PDI: SOMENTE LEITURA do PDI ──────────────────────────
// A triagem do PDI (por item) vive em pdiTriagemAcoes.ts. As ações antigas por ação isolada
// (pdi_sugestao_aceitar / pdi_sugestao_dispensar) continuam existindo por compatibilidade, mas
// DELEGAM ao novo fluxo (sugestão de 1 ação): não há mais decisão só no legado.
const TRIAGEM_PDI = criarTriagemPdi({ ErroHttp, exigirRH, texto, umDe, erroBanco, lerColaboradorParaNecessidade, CATEGORIAS_NEC, PRIORIDADES, COLS_NEC });

// ══ Fase 5 — Gestão de Treinamentos ═════════════════════════════════════
const COLS_TRE =
  "id, codigo, titulo, tipo, lista_mestra_codigo, lista_mestra_revisao, lista_mestra_titulo, modalidade, formato, data_inicio, data_fim, carga_horaria_min, instrutor_colaborador_id, instrutor_externo, responsavel_colaborador_id, justificativa, local_link, observacao, exige_eficacia, eficacia_prazo, data_realizacao, carga_realizada_min, status, status_motivo, solicitado_por_colaborador_id, planejado_em, iniciado_em, concluido_em, reposicao_de_id, reposicao_raiz_id, reposicao_numero, homologacao, created_at, updated_at";
const COLS_PART =
  "id, treinamento_id, colaborador_id, origem_inclusao, presenca_status, presenca_metodo, presenca_em, presenca_por, presenca_motivo, eficacia_resultado, eficacia_observacao, eficacia_em, eficacia_por_colaborador_id, removido_em, removido_motivo";
// Tipo (classificação) ≠ Modalidade (interno/externo) ≠ Formato (presencial/online/híbrido).
const TIPOS_TREINAMENTO = [
  "novo_pop", "revisao_pop", "instrucao_trabalho", "integracao", "reciclagem", "capacitacao_tecnica",
  "desenvolvimento", "qualidade_regulatorio", "saude_seguranca", "sistemas_ferramentas", "outro",
] as const;
/** Novo POP, Revisão de POP e Instrução de Trabalho: documento da Lista Mestra obrigatório. */
const TIPOS_COM_DOCUMENTO = new Set(["novo_pop", "revisao_pop", "instrucao_trabalho"]);
const STATUS_ATIVOS = ["planejado", "em_andamento"];
type Treinamento = Record<string, any>;

async function lerTreinamento(id: number): Promise<Treinamento> {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select(COLS_TRE).eq("id", id).maybeSingle();
  if (error) erroBanco(error, "Treinamento");
  if (!data) throw new ErroHttp(404, "Treinamento não encontrado.");
  return data;
}

function ehResponsavel(conta: ContaDev, t: Treinamento): boolean {
  return [t.responsavel_colaborador_id, t.instrutor_colaborador_id].some((v) => v != null && Number(v) === conta.colaboradorId);
}
function ehSolicitante(conta: ContaDev, t: Treinamento): boolean {
  return t.solicitado_por_colaborador_id != null && Number(t.solicitado_por_colaborador_id) === conta.colaboradorId;
}
/** ADMINISTRA o treinamento: RH; ou colaborador com a habilitação permanente concedida pelo RH que esteja vinculado a ele como
 * responsável principal ou instrutor INTERNO. O vínculo sozinho não basta (sem habilitação não há poder administrativo) e a
 * habilitação sozinha não dá acesso a treinamentos de outros responsáveis. Instrutor externo é só um nome: não tem login. */
function ehAdministrador(conta: ContaDev, t: Treinamento): boolean {
  return conta.perfil === "RH" || (conta.habilitado === true && ehResponsavel(conta, t));
}
/** Treinamento da minha GESTÃO — só ACOMPANHAMENTO (leitura): registrado por mim ou por alguém da minha equipe (perfil Gestor). */
async function ehDaGestao(conta: ContaDev, t: Treinamento): Promise<boolean> {
  if (conta.perfil !== "Gestor") return false;
  if (ehSolicitante(conta, t)) return true;
  if (t.solicitado_por_colaborador_id == null) return false;
  return (await idsNoEscopo(conta)).has(Number(t.solicitado_por_colaborador_id));
}
/** O Gestor acompanha (somente leitura) os treinamentos da sua área: que a gestão registrou, cujo responsável/instrutor é da equipe, ou com participante da equipe. */
async function gestorAcompanha(conta: ContaDev, t: Treinamento): Promise<boolean> {
  if (conta.perfil !== "Gestor") return false;
  if (await ehDaGestao(conta, t)) return true;
  const escopo = await idsNoEscopo(conta);
  if ([t.responsavel_colaborador_id, t.instrutor_colaborador_id].some((id) => id != null && escopo.has(Number(id)))) return true;
  return (await participantesAtivos(t.id)).some((p) => escopo.has(Number(p.colaborador_id)));
}
/** Planejamento (editar/cancelar): RH sempre; quem administra o treinamento enquanto a realização não começou. Sem aprovação do RH. */
async function podeEditarTreinamento(conta: ContaDev, t: Treinamento): Promise<boolean> {
  if (conta.perfil === "RH") return true;
  return ["solicitado", "planejado"].includes(t.status) && !t.iniciado_em && ehAdministrador(conta, t);
}
/** Quem monta a turma: RH ou quem administra o treinamento (responsável/instrutor interno habilitado). */
async function podeGerirParticipantes(conta: ContaDev, t: Treinamento): Promise<boolean> {
  if (t.status === "concluido" || t.status === "cancelado") return false;
  return ehAdministrador(conta, t);
}
/** Visualização (espelho do RLS): RH; quem administra; o Gestor da área (acompanhamento). */
async function podeVerTreinamento(conta: ContaDev, t: Treinamento): Promise<boolean> {
  return ehAdministrador(conta, t) || (await gestorAcompanha(conta, t));
}
/** Registrar treinamento: RH ou colaborador habilitado pelo RH. */
async function exigirPodeRegistrar(conta: ContaDev) {
  if (conta.perfil === "RH" || conta.habilitado === true) return;
  throw new ErroHttp(403, "Registrar treinamento exige a habilitação concedida pelo RH. Peça à sua liderança para solicitá-la ao RH.");
}
/** Condução e registro operacional (iniciar, realização, presença, QR, evidências, gravação, concluir): RH ou responsável/instrutor interno HABILITADO. */
async function exigirConduzir(conta: ContaDev, t: Treinamento) {
  if (ehAdministrador(conta, t)) return;
  throw new ErroHttp(403, "Somente o RH ou o responsável/instrutor interno habilitado deste treinamento.");
}

function semTabela(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message ?? "")));
}
/** Habilitação ATIVA agora (consulta ao vivo: a revogação vale na hora, sem esperar a sessão do módulo expirar). */
async function temHabilitacaoAtiva(colaboradorId: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_responsaveis_gestao").select("id").eq("colaborador_id", colaboradorId).eq("ativo", true).limit(1);
  if (error) {
    if (semTabela(error)) return false;
    erroBanco(error, "Habilitações");
  }
  return (data ?? []).length > 0;
}
/** Quem pode ser responsável PRINCIPAL: integrante do RH ou colaborador com habilitação ativa. */
async function podemSerResponsaveis(ids: number[]): Promise<Set<number>> {
  const ok = new Set<number>();
  if (ids.length === 0) return ok;
  const { data: hab, error } = await supabaseAdmin.from("peopleflow_dev_responsaveis_gestao").select("colaborador_id").in("colaborador_id", ids).eq("ativo", true);
  if (error && !semTabela(error)) erroBanco(error, "Habilitações");
  for (const h of hab ?? []) ok.add(Number(h.colaborador_id));
  const { data: cs, error: cErro } = await supabaseAdmin.from("colaboradores").select("id, nome, cargo, departamento").in("id", ids);
  if (cErro) erroBanco(cErro, "Colaborador");
  for (const c of cs ?? []) {
    const perfil = perfilOf({ nome: String(c.nome), cargo: String(c.cargo ?? ""), depto: String(c.departamento ?? "") } as never, new Set<string>());
    if (perfil === "RH") ok.add(Number(c.id));
  }
  return ok;
}
/** Todo treinamento tem um responsável principal identificado, e ele precisa ser do RH ou habilitado (senão ninguém o administraria).
 * O colaborador habilitado (perfil Responsavel) só registra o que ele mesmo vai administrar (responsável ou instrutor interno); o Gestor
 * habilitado pode registrar para outra pessoa da sua área, que passa a ser a responsável, e segue acompanhando (somente leitura). */
async function exigirResponsavelPrincipal(campos: { responsavel_colaborador_id: number | null; instrutor_colaborador_id: number | null }, conta: ContaDev) {
  const resp = campos.responsavel_colaborador_id;
  if (!resp) throw new ErroHttp(422, "Defina o responsável principal pelo treinamento.");
  if (!(await podemSerResponsaveis([resp])).has(resp)) throw new ErroHttp(422, "O responsável principal precisa ser do RH ou ter a habilitação concedida pelo RH.");
  if (conta.perfil === "Responsavel" && resp !== conta.colaboradorId && campos.instrutor_colaborador_id !== conta.colaboradorId) {
    throw new ErroHttp(422, "Quem registra o treinamento precisa ser o responsável principal ou o instrutor interno dele (senão perderia o acesso ao que registrou).");
  }
}

async function idsNoEscopo(conta: ContaDev): Promise<Set<number>> {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_escopo").select("colaborador_id").eq("gestor_colaborador_id", conta.colaboradorId);
  if (error) erroBanco(error, "Escopo");
  return new Set((data ?? []).map((r) => Number(r.colaborador_id)));
}

async function exigirColaboradoresAtivos(ids: number[]) {
  if (ids.length === 0) return;
  const { data, error } = await supabaseAdmin.from("colaboradores").select(`id, ${COLUNAS_SITUACAO}`).in("id", ids);
  if (error) erroBanco(error, "Colaborador");
  const ativos = new Set((data ?? []).filter((c) => linhaAtiva(c)).map((c) => Number(c.id)));
  const faltando = ids.filter((i) => !ativos.has(i));
  if (faltando.length) throw new ErroHttp(422, "Há colaborador inexistente ou desligado na seleção.");
}

/** Fotografia do documento no momento do vínculo — nunca atualizada retroativamente. */
async function fotografiaDocumento(codigo: string) {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_lista_mestra").select("codigo, titulo, revisao_atual, situacao").eq("codigo", codigo).maybeSingle();
  if (error) erroBanco(error, "Lista Mestra");
  if (!data) throw new ErroHttp(422, "Documento não encontrado na Lista Mestra.");
  if (data.situacao !== "vigente") throw new ErroHttp(422, "Documento obsoleto na Lista Mestra.");
  return { lista_mestra_codigo: data.codigo, lista_mestra_titulo: data.titulo, lista_mestra_revisao: data.revisao_atual };
}

function lerCamposTreinamento(corpo: Corpo) {
  if (!texto(corpo, "tipo")) throw new ErroHttp(422, "Selecione o tipo de treinamento.");
  if (!texto(corpo, "modalidade")) throw new ErroHttp(422, "Selecione a modalidade (Interno ou Externo).");
  const tipo = umDe(texto(corpo, "tipo"), TIPOS_TREINAMENTO, "Tipo de treinamento");
  const modalidade = umDe(texto(corpo, "modalidade"), ["interno", "externo"] as const, "Modalidade");
  const formato = texto(corpo, "formato") ? umDe(texto(corpo, "formato"), ["presencial", "online", "hibrido"] as const, "Formato") : null;
  const inicio = dataOpcional(corpo, "data_inicio", "Data prevista");
  const fim = dataOpcional(corpo, "data_fim", "Data final") ;
  if (inicio && fim && fim < inicio) throw new ErroHttp(422, "A data final não pode ser anterior à data prevista.");
  const exigeEficacia = corpo.exige_eficacia === true;
  return {
    titulo: texto(corpo, "titulo", { max: 300 }),
    tipo,
    modalidade,
    formato,
    justificativa: texto(corpo, "justificativa", { max: 2000 }),
    data_inicio: inicio,
    data_fim: fim,
    carga_horaria_min: inteiroOpcional(corpo, "carga_horaria_min", "Carga horária (minutos)", 1, 100000),
    local_link: texto(corpo, "local_link", { max: 500 }),
    observacao: texto(corpo, "observacao", { max: 2000 }),
    exige_eficacia: exigeEficacia,
    eficacia_prazo: exigeEficacia ? dataOpcional(corpo, "eficacia_prazo", "Prazo da eficácia") : null,
    responsavel_colaborador_id: corpo.responsavel_colaborador_id ? idObrigatorio(corpo, "responsavel_colaborador_id", "Responsável") : null,
    instrutor_colaborador_id: corpo.instrutor_colaborador_id ? idObrigatorio(corpo, "instrutor_colaborador_id", "Instrutor") : null,
    instrutor_externo: texto(corpo, "instrutor_externo", { max: 200 }) || null,
    lista_mestra_codigo: texto(corpo, "lista_mestra_codigo", { max: 40 }) || null,
  };
}

/** Título do treinamento é sempre gravado em CAIXA ALTA (justificativa/observação ficam como digitadas). */
const caixaAlta = (s: string) => s.toLocaleUpperCase("pt-BR");

/** Novo POP / Revisão de POP / Instrução de Trabalho: o título É o título oficial do documento (fotografado). */
function tituloDoTreinamento(tipo: string, titulo: string, doc: { lista_mestra_titulo?: string | null }): string {
  if (!TIPOS_COM_DOCUMENTO.has(tipo)) return caixaAlta(titulo);
  if (!doc.lista_mestra_titulo) throw new ErroHttp(422, "Selecione o documento da Lista Mestra (Novo POP, Revisão de POP ou Instrução de Trabalho).");
  return caixaAlta(doc.lista_mestra_titulo);
}

/** Data de hoje no fuso da empresa (YYYY-MM-DD). */
const fmtDiaSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
export const hojeSaoPaulo = () => fmtDiaSP.format(new Date());

/** Novo registro (inclusive reposição): o treinamento é registrado ANTES da realização. Não se aplica a edições nem a dados históricos. */
function exigirDataPrevistaNaoRetroativa(dataInicio: unknown) {
  if (dataInicio && String(dataInicio) < hojeSaoPaulo())
    throw new ErroHttp(422, "A data prevista não pode ser anterior à data de registro do treinamento. O treinamento deve ser registrado antes de sua realização.");
}

function exigirMinimoPlanejamento(t: Record<string, unknown>) {
  if (!String(t.titulo ?? "").trim()) throw new ErroHttp(422, "Informe o título do treinamento.");
  if (!t.data_inicio) throw new ErroHttp(422, "Informe a data prevista.");
  if (!t.responsavel_colaborador_id) throw new ErroHttp(422, "Defina o responsável pelo treinamento.");
  if (TIPOS_COM_DOCUMENTO.has(String(t.tipo)) && !t.lista_mestra_codigo) throw new ErroHttp(422, "Selecione o documento da Lista Mestra (Novo POP, Revisão de POP ou Instrução de Trabalho).");
}

// ── Necessidades ligadas ao treinamento: regras de status ───────────────
/** Associações VALIDADAS pelo RH — as únicas com efeito oficial (planejar/atender/devolver). */
async function vinculosAtivos(treinamentoId: number) {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_treinamento_necessidades").select("id, necessidade_id").eq("treinamento_id", treinamentoId).eq("ativo", true).eq("situacao", "validada");
  if (error) erroBanco(error, "Vínculos");
  return (data ?? []) as { id: number; necessidade_id: number }[];
}

async function temOutroTreinamentoAtivo(necessidadeId: number, exceto: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_treinamento_necessidades").select("treinamento_id").eq("necessidade_id", necessidadeId).eq("ativo", true).eq("situacao", "validada");
  if (error) erroBanco(error, "Vínculos");
  const outros = (data ?? []).map((r) => Number(r.treinamento_id)).filter((id) => id !== exceto);
  if (outros.length === 0) return false;
  const { data: ts, error: tErro } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select("id, status").in("id", outros);
  if (tErro) erroBanco(tErro, "Treinamento");
  return (ts ?? []).some((t) => STATUS_ATIVOS.includes(t.status as string));
}

async function mudarStatusNecessidade(conta: ContaDev, necessidadeId: number, de: string[], para: string, extra: Record<string, unknown>, motivo: string, treinamentoId: number) {
  const { data: n, error } = await supabaseAdmin.from("peopleflow_dev_necessidades").select("id, status").eq("id", necessidadeId).maybeSingle();
  if (error) erroBanco(error, "Necessidade de Desenvolvimento");
  if (!n || !de.includes(n.status as string)) return;
  const { error: uErro } = await supabaseAdmin.from("peopleflow_dev_necessidades").update({ status: para, ...extra, updated_by: conta.userId }).eq("id", necessidadeId);
  if (uErro) erroBanco(uErro, "Necessidade de Desenvolvimento");
  await auditar(conta, `necessidade_${para}`, "peopleflow_dev_necessidades", String(necessidadeId), { status: { antes: n.status, depois: para }, treinamento_id: treinamentoId, motivo });
}

/** Treinamento passou a PLANEJADO/EM ANDAMENTO: VALIDADA → PLANEJADA. */
async function planejarNecessidadesDoTreinamento(conta: ContaDev, treinamentoId: number) {
  for (const v of await vinculosAtivos(treinamentoId)) await mudarStatusNecessidade(conta, v.necessidade_id, ["validada"], "planejada", {}, "Treinamento planejado", treinamentoId);
}

/** Volta PLANEJADA → VALIDADA se não houver outro treinamento ativo para a necessidade. */
async function devolverNecessidade(conta: ContaDev, necessidadeId: number, treinamentoId: number, motivo: string) {
  if (await temOutroTreinamentoAtivo(necessidadeId, treinamentoId)) return;
  await mudarStatusNecessidade(conta, necessidadeId, ["planejada"], "validada", {}, motivo, treinamentoId);
}

/** Após conclusão (ou eficácia registrada depois): decide, por colaborador, se a necessidade foi ATENDIDA. */
async function processarNecessidadesDoParticipante(conta: ContaDev, t: Treinamento, participante: Record<string, any>) {
  if (t.status !== "concluido") return;
  if (t.homologacao) return; // teste nunca atende Necessidade de Desenvolvimento
  const vinculos = await vinculosAtivos(t.id);
  if (vinculos.length === 0) return;
  const { data: nec, error } = await supabaseAdmin
    .from("peopleflow_dev_necessidades")
    .select("id, colaborador_id, status")
    .in("id", vinculos.map((v) => v.necessidade_id))
    .eq("colaborador_id", participante.colaborador_id);
  if (error) erroBanco(error, "Necessidade de Desenvolvimento");
  for (const n of nec ?? []) {
    const realizou = participante.presenca_status === "presente" && !participante.removido_em;
    if (realizou && (!t.exige_eficacia || participante.eficacia_resultado === "eficaz")) {
      await mudarStatusNecessidade(conta, n.id as number, ["planejada", "validada"], "atendida", { atendida_em: new Date().toISOString(), atendida_treinamento_id: t.id }, "Ação realizada pelo colaborador", t.id);
    } else if (!realizou || !participante.eficacia_resultado) {
      // Ausente: obrigação continua pendente (PLANEJADA) até realizar numa reposição.
      // Presente com eficácia a avaliar: permanece PLANEJADA até o resultado.
    } else {
      await devolverNecessidade(conta, n.id as number, t.id, "Eficácia não comprovada");
    }
  }
}

// ── Solicitação / edição ───────────────────────────────────────────────
/** Link da gravação enviado no cadastro/edição: undefined = campo ausente (nada muda); null = vazio; senão a URL já validada (SharePoint, https). */
function linkGravacaoDoCorpo(corpo: Corpo): string | null | undefined {
  if (!("gravacao_url" in corpo) || corpo.gravacao_url === undefined) return undefined;
  const bruto = typeof corpo.gravacao_url === "string" ? corpo.gravacao_url.trim() : corpo.gravacao_url;
  if (bruto === null || bruto === "") return null;
  const valido = validarLinkGravacao(bruto);
  if (!valido) throw new ErroHttp(422, "Informe o link da gravação no SharePoint (https://…sharepoint.com/…).");
  return valido;
}

async function treinamentoSalvar(conta: ContaDev, corpo: Corpo) {
  const id = corpo.id == null || corpo.id === "" ? null : idObrigatorio(corpo, "id", "Treinamento");
  const campos = lerCamposTreinamento(corpo);
  const pessoas = [campos.responsavel_colaborador_id, campos.instrutor_colaborador_id].filter((x): x is number => x != null);
  await exigirColaboradoresAtivos(pessoas);

  if (!id) {
    const doc = campos.lista_mestra_codigo ? await fotografiaDocumento(campos.lista_mestra_codigo) : {};
    const titulo = tituloDoTreinamento(campos.tipo, campos.titulo, doc as { lista_mestra_titulo?: string });
    if (!titulo) throw new ErroHttp(422, "Informe o título do treinamento.");
    // Registro único: quem registra planeja — o treinamento já nasce PLANEJADO (sem aprovação do RH).
    await exigirPodeRegistrar(conta);
    // Homologação/teste: só o RH marca (flag administrativa, não é Tipo).
    const homologacao = corpo.homologacao === true;
    if (homologacao && conta.perfil !== "RH") throw new ErroHttp(403, "Somente o RH marca treinamento de homologação/teste.");
    await exigirResponsavelPrincipal(campos, conta);
    // "Permitir participação por gravação": só envia a coluna quando ligada (treinamento existente nunca é afetado; sem a migration, recusa com clareza).
    const querGravacao = corpo.permite_gravacao === true;
    const linkGravacao = querGravacao ? linkGravacaoDoCorpo(corpo) : undefined;
    if (querGravacao) {
      const { error: colErro } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select("permite_gravacao").limit(1);
      if (colErro && colunaGravacaoAusente(colErro)) throw new ErroHttp(422, "A participação por gravação ainda não está disponível (recurso não ativado).");
    }
    const linha = { ...campos, ...doc, titulo, lista_mestra_codigo: campos.lista_mestra_codigo, homologacao };
    exigirMinimoPlanejamento(linha);
    exigirDataPrevistaNaoRetroativa(linha.data_inicio);
    const agora = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("peopleflow_dev_treinamentos")
      .insert({
        ...linha,
        status: "planejado",
        planejado_em: agora,
        planejado_por: conta.userId,
        solicitado_por_colaborador_id: conta.colaboradorId,
        origem_registro: "sistema",
        created_by: conta.userId,
        updated_by: conta.userId,
      })
      .select(COLS_TRE)
      .single();
    if (error) erroBanco(error, "Treinamento");
    await auditar(conta, "treinamento_planejado", "peopleflow_dev_treinamentos", String(data.id), { registro: true, perfil: conta.perfil, depois: data });
    // O link informado no próprio cadastro vai direto para o registro da gravação (mesma regra e auditoria da página do treinamento).
    if (querGravacao) await atualizarGravacao(conta, data as Treinamento, { permitir: true, url: linkGravacao });
    return data;
  }

  const antes = await lerTreinamento(id);
  if (antes.status === "cancelado") throw new ErroHttp(422, "Treinamento cancelado não pode ser editado.");
  if (!(await podeEditarTreinamento(conta, antes))) throw new ErroHttp(403, "Somente o RH, ou o responsável/instrutor interno habilitado (antes do início da realização), pode editar.");
  if (antes.status !== "solicitado" && (campos.responsavel_colaborador_id ?? null) !== (antes.responsavel_colaborador_id ?? null)) {
    throw new ErroHttp(422, "A troca do responsável principal é feita pelo RH em \"Transferir responsabilidade\", com motivo e histórico.");
  }
  const linkGravacao = linkGravacaoDoCorpo(corpo);
  const motivo = texto(corpo, "motivo", { max: 1000 });
  if (antes.status === "concluido" && !motivo) throw new ErroHttp(422, "Alteração em treinamento concluído exige justificativa.");
  // Documento: só refotografa quando o código muda — a revisão treinada nunca é atualizada retroativamente.
  let doc: Record<string, unknown> = { lista_mestra_codigo: antes.lista_mestra_codigo, lista_mestra_titulo: antes.lista_mestra_titulo, lista_mestra_revisao: antes.lista_mestra_revisao };
  if (campos.lista_mestra_codigo !== antes.lista_mestra_codigo) {
    if (antes.status === "concluido") throw new ErroHttp(422, "O documento de um treinamento concluído não pode ser trocado.");
    doc = campos.lista_mestra_codigo ? await fotografiaDocumento(campos.lista_mestra_codigo) : { lista_mestra_codigo: null, lista_mestra_titulo: null, lista_mestra_revisao: null };
  }
  const atualizacao = { ...campos, ...doc, titulo: TIPOS_COM_DOCUMENTO.has(campos.tipo) ? tituloDoTreinamento(campos.tipo, "", doc as { lista_mestra_titulo?: string }) : caixaAlta(campos.titulo || antes.titulo) };
  if (antes.status !== "solicitado") exigirMinimoPlanejamento(atualizacao);
  const homologacao = typeof corpo.homologacao === "boolean" ? corpo.homologacao : Boolean(antes.homologacao);
  if (homologacao !== Boolean(antes.homologacao)) {
    if (conta.perfil !== "RH") throw new ErroHttp(403, "Somente o RH altera a condição de homologação/teste.");
    if (!["solicitado", "planejado"].includes(antes.status) || antes.iniciado_em) throw new ErroHttp(422, "A condição de homologação/teste não pode ser alterada depois do início da realização.");
    if (!homologacao && antes.reposicao_de_id && (await lerTreinamento(Number(antes.reposicao_de_id))).homologacao) throw new ErroHttp(422, "Reposição de treinamento de homologação/teste também é homologação/teste.");
    if (homologacao && (await vinculosAtivosTodos(id)).length) throw new ErroHttp(422, "Desvincule as Necessidades de Desenvolvimento antes de marcar como homologação/teste.");
  }
  (atualizacao as Record<string, unknown>).homologacao = homologacao;
  const mudou = diferencas(antes, atualizacao);
  if (Object.keys(mudou).length === 0) return antes;
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_treinamentos").update({ ...atualizacao, updated_by: conta.userId }).eq("id", id).select(COLS_TRE).single();
  if (error) erroBanco(error, "Treinamento");
  await auditar(conta, antes.status === "concluido" ? "treinamento_retificado" : "treinamento_editado", "peopleflow_dev_treinamentos", String(id), { alteracoes: mudou, motivo });
  if (antes.status === "concluido" && data.modalidade === "interno") await gerarListaPresenca(conta, data, `Retificação do treinamento: ${motivo}`);
  // Permissão de gravação (só quando o formulário a envia): aplica depois de gravar o resto, com auditoria própria.
  if ((typeof corpo.permite_gravacao === "boolean" || linkGravacao !== undefined) && ["planejado", "em_andamento"].includes(data.status)) {
    const atual = await lerGravacao(id);
    const permitir = typeof corpo.permite_gravacao === "boolean" ? corpo.permite_gravacao : undefined;
    if (!atual) {
      if (permitir || linkGravacao) throw new ErroHttp(422, "A participação por gravação ainda não está disponível (recurso não ativado).");
    } else {
      const mudanca: { permitir?: boolean; url?: string | null } = {};
      if (permitir !== undefined && atual.permite_gravacao !== permitir) mudanca.permitir = permitir;
      // o link só é gravado com a participação por gravação habilitada (o formulário só o envia nesse caso)
      if (linkGravacao !== undefined && (permitir ?? atual.permite_gravacao)) mudanca.url = linkGravacao;
      if (mudanca.permitir !== undefined || mudanca.url !== undefined) await atualizarGravacao(conta, data as Treinamento, mudanca);
    }
  }
  return data;
}

async function treinamentoRealizacao(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "id", "Treinamento"));
  await exigirConduzir(conta, t);
  if (!["planejado", "em_andamento"].includes(t.status)) throw new ErroHttp(422, "Realização só pode ser registrada em treinamento planejado ou em andamento.");
  const campos = {
    data_realizacao: dataOpcional(corpo, "data_realizacao", "Data de realização"),
    carga_realizada_min: inteiroOpcional(corpo, "carga_realizada_min", "Carga realizada (minutos)", 1, 100000),
  };
  const mudou = diferencas(t, campos);
  if (Object.keys(mudou).length === 0) return t;
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_treinamentos").update({ ...campos, updated_by: conta.userId }).eq("id", t.id).select(COLS_TRE).single();
  if (error) erroBanco(error, "Treinamento");
  await auditar(conta, "treinamento_realizacao", "peopleflow_dev_treinamentos", String(t.id), { alteracoes: mudou });
  return data;
}

// ── Situação ────────────────────────────────────────────────────────────
async function treinamentoPlanejar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const t = await lerTreinamento(idObrigatorio(corpo, "id", "Treinamento"));
  if (t.status !== "solicitado") throw new ErroHttp(422, "Só treinamentos SOLICITADOS podem ser planejados.");
  exigirMinimoPlanejamento(t);
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_treinamentos")
    .update({ status: "planejado", planejado_em: new Date().toISOString(), planejado_por: conta.userId, updated_by: conta.userId })
    .eq("id", t.id)
    .select(COLS_TRE)
    .single();
  if (error) erroBanco(error, "Treinamento");
  await auditar(conta, "treinamento_planejado", "peopleflow_dev_treinamentos", String(t.id), { status: { antes: "solicitado", depois: "planejado" } });
  await planejarNecessidadesDoTreinamento(conta, t.id);
  return data;
}

async function treinamentoIniciar(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "id", "Treinamento"));
  await exigirConduzir(conta, t);
  if (t.status !== "planejado") throw new ErroHttp(422, "Só treinamentos PLANEJADOS podem ser iniciados.");
  // A revisão treinada é a vigente NO INÍCIO da realização: se o documento foi revisado desde o planejamento, a fotografia é
  // atualizada agora (com auditoria). Depois do início ela nunca mais muda — revisões posteriores não alteram o que foi treinado.
  let revisaoDoDocumento: Record<string, unknown> = {};
  let mudouDocumento: Record<string, unknown> | null = null;
  if (t.lista_mestra_codigo) {
    const atual = await fotografiaDocumento(t.lista_mestra_codigo).catch((e: unknown) => {
      if (e instanceof ErroHttp && e.status === 422) throw new ErroHttp(422, `O documento ${t.lista_mestra_codigo} não está vigente na Lista Mestra. Edite o treinamento e selecione o documento correto antes de iniciar.`);
      throw e;
    });
    if (atual.lista_mestra_revisao !== t.lista_mestra_revisao || atual.lista_mestra_titulo !== t.lista_mestra_titulo) {
      revisaoDoDocumento = { ...atual, ...(TIPOS_COM_DOCUMENTO.has(t.tipo) ? { titulo: caixaAlta(String(atual.lista_mestra_titulo)) } : {}) };
      mudouDocumento = { codigo: t.lista_mestra_codigo, revisao: { antes: t.lista_mestra_revisao, depois: atual.lista_mestra_revisao }, titulo: { antes: t.lista_mestra_titulo, depois: atual.lista_mestra_titulo } };
    }
  }
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_treinamentos")
    .update({ ...revisaoDoDocumento, status: "em_andamento", iniciado_em: new Date().toISOString(), iniciado_por: conta.userId, updated_by: conta.userId })
    .eq("id", t.id)
    .select(COLS_TRE)
    .single();
  if (error) erroBanco(error, "Treinamento");
  await auditar(conta, "treinamento_iniciado", "peopleflow_dev_treinamentos", String(t.id), { status: { antes: "planejado", depois: "em_andamento" } });
  if (mudouDocumento) await auditar(conta, "treinamento_revisao_atualizada", "peopleflow_dev_treinamentos", String(t.id), { motivo: "Documento revisado entre o planejamento e o início da realização", ...mudouDocumento });
  return data;
}

async function participantesAtivos(treinamentoId: number) {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_participantes").select(COLS_PART).eq("treinamento_id", treinamentoId);
  if (error) erroBanco(error, "Participantes");
  return (data ?? []).filter((p) => !p.removido_em) as Record<string, any>[];
}

async function encerrarQr(conta: ContaDev, treinamentoId: number) {
  const { data } = await supabaseAdmin.from("peopleflow_dev_qr_tokens").select("ativo").eq("treinamento_id", treinamentoId).maybeSingle();
  if (!data?.ativo) return false;
  const { error } = await supabaseAdmin.from("peopleflow_dev_qr_tokens").update({ ativo: false, encerrado_em: new Date().toISOString(), encerrado_por: conta.userId }).eq("treinamento_id", treinamentoId);
  if (error) erroBanco(error, "QR");
  return true;
}

async function treinamentoConcluir(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "id", "Treinamento"));
  await exigirConduzir(conta, t); // RH ou responsável/instrutor interno habilitado
  const externo = t.modalidade === "externo";
  // Conferência antes da conclusão: o que impede e o que permanece pendente depois (ausentes com reposição NÃO impedem).
  const conferencia = await conferirConclusao(t);
  if (conferencia.impedimentos.length) {
    const msgs = conferencia.impedimentos.map((i) => i.mensagem);
    throw new ErroHttp(422, msgs.length === 1 ? msgs[0] : `Não é possível concluir: ${msgs.join(" ")}`);
  }
  const participantes = await participantesAtivos(t.id);
  const efetiva = dataEfetivaDeRealizacao(t) as NonNullable<ReturnType<typeof dataEfetivaDeRealizacao>>;
  const dataRealizacao = efetiva.data;
  const agora = new Date().toISOString();
  const cargaRealizada = t.carga_realizada_min ?? t.carga_horaria_min;
  // Presença controlada pelo PeopleFlow (interno): a Lista de Presença é gerada dos registros individuais.
  const lista = externo ? null : await prepararListaPresenca(conta, { ...t, status: "concluido", data_realizacao: dataRealizacao, carga_realizada_min: cargaRealizada }, participantes, null);
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_treinamentos")
    .update({ status: "concluido", concluido_em: agora, concluido_por: conta.userId, data_realizacao: dataRealizacao, carga_realizada_min: cargaRealizada, updated_by: conta.userId })
    .eq("id", t.id)
    .select(COLS_TRE)
    .single();
  if (error) erroBanco(error, "Treinamento");
  await encerrarQr(conta, t.id);
  await auditar(conta, "treinamento_concluido", "peopleflow_dev_treinamentos", String(t.id), {
    status: { antes: t.status, depois: "concluido" },
    data_realizacao: { valor: dataRealizacao, origem: efetiva.origem, planejada_inicio: t.data_inicio, planejada_fim: t.data_fim },
    realizaram: participantes.filter((p) => p.presenca_status === "presente").length,
    ausentes: participantes.filter((p) => p.presenca_status === "ausente").length,
    concluido_por_perfil: conta.perfil,
    pendencias_apos_conclusao: conferencia.pendencias_apos.map((i) => ({ codigo: i.codigo, mensagem: i.mensagem })),
  });
  if (lista) await registrarListaPresenca(conta, data, lista);
  for (const p of participantes) await processarNecessidadesDoParticipante(conta, data, p);
  return data;
}

async function treinamentoCancelar(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "id", "Treinamento"));
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "a justificativa do cancelamento" });
  if (t.status === "concluido" || t.status === "cancelado") throw new ErroHttp(422, "Treinamento já encerrado.");
  if (!(await podeEditarTreinamento(conta, t))) throw new ErroHttp(403, "Somente o RH, ou o responsável/instrutor interno habilitado (antes do início da realização), pode cancelar.");
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_treinamentos").update({ status: "cancelado", status_motivo: motivo, updated_by: conta.userId }).eq("id", t.id).select(COLS_TRE).single();
  if (error) erroBanco(error, "Treinamento");
  await encerrarQr(conta, t.id);
  await auditar(conta, "treinamento_cancelado", "peopleflow_dev_treinamentos", String(t.id), { status: { antes: t.status, depois: "cancelado" }, motivo });
  for (const v of await vinculosAtivos(t.id)) await devolverNecessidade(conta, v.necessidade_id, t.id, "Treinamento cancelado");
  return data;
}

// ── Participantes ───────────────────────────────────────────────────────
async function participantesAdicionar(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  if (t.status === "concluido" || t.status === "cancelado") throw new ErroHttp(422, "Treinamento encerrado.");
  if (!(await podeGerirParticipantes(conta, t))) throw new ErroHttp(403, "Somente o RH ou o responsável/instrutor interno habilitado deste treinamento inclui participantes.");
  const ids = Array.isArray(corpo.colaborador_ids) ? [...new Set(corpo.colaborador_ids.map(Number))].filter((n) => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) throw new ErroHttp(422, "Selecione ao menos um colaborador.");
  if (ids.length > 500) throw new ErroHttp(422, "No máximo 500 por vez.");
  // Treinamentos podem ser transversais: qualquer colaborador ATIVO da empresa pode ser incluído
  // (a exceção vale só para montar a turma — não amplia o acesso a outros dados).
  await exigirColaboradoresAtivos(ids);
  const { data: existentes, error } = await supabaseAdmin.from("peopleflow_dev_participantes").select("id, colaborador_id, removido_em").eq("treinamento_id", t.id).in("colaborador_id", ids);
  if (error) erroBanco(error, "Participantes");
  const porColab = new Map((existentes ?? []).map((p) => [Number(p.colaborador_id), p]));
  let incluidos = 0, restaurados = 0;
  const novos = ids.filter((i) => !porColab.has(i));
  if (novos.length) {
    const { error: iErro } = await supabaseAdmin.from("peopleflow_dev_participantes").insert(
      novos.map((c) => ({ treinamento_id: t.id, colaborador_id: c, origem_inclusao: ["criterio", "reposicao"].includes(String(corpo.origem_inclusao)) ? corpo.origem_inclusao : "manual", origem_registro: "sistema", created_by: conta.userId, updated_by: conta.userId })),
    );
    if (iErro) erroBanco(iErro, "Participantes");
    incluidos = novos.length;
  }
  for (const p of (existentes ?? []).filter((x) => x.removido_em)) {
    const { error: rErro } = await supabaseAdmin.from("peopleflow_dev_participantes").update({ removido_em: null, removido_por: null, removido_motivo: null, updated_by: conta.userId }).eq("id", p.id);
    if (rErro) erroBanco(rErro, "Participantes");
    restaurados++;
  }
  await auditar(conta, "participantes_incluidos", "peopleflow_dev_treinamentos", String(t.id), { colaboradores: ids, incluidos, restaurados });
  return { incluidos, restaurados, ja_existiam: ids.length - incluidos - restaurados };
}

async function lerParticipante(id: number) {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_participantes").select(COLS_PART).eq("id", id).maybeSingle();
  if (error) erroBanco(error, "Participante");
  if (!data) throw new ErroHttp(404, "Participante não encontrado.");
  return data as Record<string, any>;
}

async function participanteRemover(conta: ContaDev, corpo: Corpo) {
  const p = await lerParticipante(idObrigatorio(corpo, "participante_id", "Participante"));
  const t = await lerTreinamento(p.treinamento_id);
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "o motivo" });
  if (t.status === "concluido" || t.status === "cancelado") throw new ErroHttp(422, "Treinamento encerrado.");
  if (!(await podeGerirParticipantes(conta, t))) throw new ErroHttp(403, "Somente o RH ou o responsável/instrutor interno habilitado deste treinamento retira participantes.");
  if (p.removido_em) throw new ErroHttp(422, "Participante já retirado.");
  // A pendência individual de quem faltou não se elimina retirando o participante: justifique e encaminhe (reposição) ou peça a dispensa ao RH, com justificativa.
  if (p.presenca_status === "ausente") throw new ErroHttp(422, "Participante ausente não é retirado da turma: registre a justificativa e o encaminhamento (reposição) ou a dispensa pelo RH, com justificativa. A pendência individual não se encerra retirando o participante.");
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_participantes")
    .update({ removido_em: new Date().toISOString(), removido_por: conta.userId, removido_motivo: motivo, updated_by: conta.userId })
    .eq("id", p.id)
    .select(COLS_PART)
    .single();
  if (error) erroBanco(error, "Participante");
  await auditar(conta, "participante_retirado", "peopleflow_dev_participantes", String(p.id), { treinamento_id: t.id, colaborador_id: p.colaborador_id, motivo });
  // Necessidades desse colaborador ligadas a este treinamento (indicadas ou validadas) deixam de valer para ele.
  const vinculos = await vinculosAtivosTodos(t.id);
  if (vinculos.length) {
    const { data: nec } = await supabaseAdmin.from("peopleflow_dev_necessidades").select("id").in("id", vinculos.map((v) => v.necessidade_id)).eq("colaborador_id", p.colaborador_id);
    for (const n of nec ?? []) {
      const v = vinculos.find((x) => x.necessidade_id === Number(n.id))!;
      await supabaseAdmin.from("peopleflow_dev_treinamento_necessidades").update({ ativo: false, desvinculado_em: new Date().toISOString(), desvinculado_por: conta.userId, desvinculado_motivo: "Participante retirado do treinamento" }).eq("id", v.id);
      await devolverNecessidade(conta, Number(n.id), t.id, "Participante retirado do treinamento");
    }
  }
  return data;
}

/** Lista para MONTAR A TURMA: todos os colaboradores ativos, só nome/cargo/departamento.
 * Liberada apenas a quem gere os participantes deste treinamento — não é uma
 * consulta geral de colaboradores. */
async function participantesOpcoes(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  if (!(await podeGerirParticipantes(conta, t))) throw new ErroHttp(403, "Sem permissão para montar a turma deste treinamento.");
  const { data, error } = await supabaseAdmin.from("colaboradores").select(`id, nome, cargo, departamento, ${COLUNAS_SITUACAO}`);
  if (error) erroBanco(error, "Colaboradores");
  return (data ?? [])
    .filter((c) => linhaAtiva(c))
    .map((c) => ({ id: Number(c.id), nome: String(c.nome), cargo: (c.cargo as string | null) ?? "", departamento: (c.departamento as string | null) ?? "" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// ── Reposição para faltantes ───────────────────────────────────────────
/** Ausentes de um treinamento concluído que ainda não estão numa reposição (não cancelada) dele. */
async function faltantesDe(t: Treinamento) {
  const ausentes = (await participantesAtivos(t.id)).filter((p) => p.presenca_status === "ausente");
  if (ausentes.length === 0) return [];
  const { data: filhos, error } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select("id, status").eq("reposicao_de_id", t.id);
  if (error) erroBanco(error, "Reposições");
  const ativos = (filhos ?? []).filter((f) => f.status !== "cancelado").map((f) => Number(f.id));
  const jaRepondo = new Set<number>();
  if (ativos.length) {
    const { data: ps, error: pErro } = await supabaseAdmin.from("peopleflow_dev_participantes").select("colaborador_id, removido_em").in("treinamento_id", ativos);
    if (pErro) erroBanco(pErro, "Participantes");
    for (const p of ps ?? []) if (!p.removido_em) jaRepondo.add(Number(p.colaborador_id));
  }
  // Quem já saiu da empresa não volta para a lista de reposição (o registro de ausência continua no histórico).
  const candidatos = ausentes.filter((p) => !jaRepondo.has(Number(p.colaborador_id)));
  if (candidatos.length === 0) return candidatos;
  const { data: situacoes, error: sErro } = await supabaseAdmin.from("colaboradores").select(`id, ${COLUNAS_SITUACAO}`).in("id", candidatos.map((p) => Number(p.colaborador_id)));
  if (sErro) erroBanco(sErro, "Colaboradores");
  const ativosIds = new Set((situacoes ?? []).filter((c) => linhaAtiva(c)).map((c) => Number(c.id)));
  // Dispensados pelo RH (com justificativa) não voltam para a lista de reposição.
  const { data: dispensas, error: dErro } = await supabaseAdmin.from("peopleflow_dev_participantes").select("id, ausencia_encaminhamento").in("id", candidatos.map((p) => Number(p.id)));
  if (dErro) erroBanco(dErro, "Ausências");
  const dispensados = new Set((dispensas ?? []).filter((d) => d.ausencia_encaminhamento === "dispensa").map((d) => Number(d.id)));
  return candidatos.filter((p) => ativosIds.has(Number(p.colaborador_id)) && !dispensados.has(Number(p.id)));
}

async function exigirPodeRepor(conta: ContaDev, t: Treinamento) {
  if (!ehAdministrador(conta, t)) throw new ErroHttp(403, "Somente o RH ou o responsável/instrutor interno habilitado deste treinamento.");
  if (t.status !== "concluido") throw new ErroHttp(422, "A reposição é agendada a partir de um treinamento concluído com faltantes.");
}

async function reposicaoFaltantes(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  await exigirPodeRepor(conta, t);
  const faltantes = await faltantesDe(t);
  const { data: pessoas, error } = faltantes.length
    ? await supabaseAdmin.from("colaboradores").select("id, nome, cargo, departamento").in("id", faltantes.map((p) => Number(p.colaborador_id)))
    : { data: [], error: null };
  if (error) erroBanco(error, "Colaboradores");
  const porId = new Map((pessoas ?? []).map((c) => [Number(c.id), c]));
  return faltantes.map((p) => {
    const c = porId.get(Number(p.colaborador_id));
    return { participante_id: p.id, colaborador_id: Number(p.colaborador_id), nome: c?.nome ?? "", cargo: c?.cargo ?? "", departamento: c?.departamento ?? "" };
  });
}

/** Cria a reposição: novo treinamento (o original não é reaberto) só com os faltantes,
 * pré-preenchido pelo original; a data é definida por quem agenda. */
async function treinamentoReposicao(conta: ContaDev, corpo: Corpo) {
  const origem = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento de origem"));
  await exigirPodeRepor(conta, origem);
  const faltantes = await faltantesDe(origem);
  if (faltantes.length === 0) throw new ErroHttp(422, "Não há faltantes pendentes de reposição neste treinamento.");
  let escolhidos = faltantes;
  if (Array.isArray(corpo.colaborador_ids)) {
    const pedidos = new Set(corpo.colaborador_ids.map(Number));
    escolhidos = faltantes.filter((p) => pedidos.has(Number(p.colaborador_id)));
    if (escolhidos.length !== pedidos.size) throw new ErroHttp(422, "A reposição só pode incluir faltantes deste treinamento.");
    if (escolhidos.length === 0) throw new ErroHttp(422, "Selecione ao menos um faltante.");
  }
  const campos = lerCamposTreinamento({ tipo: origem.tipo, modalidade: origem.modalidade, ...corpo });
  await exigirColaboradoresAtivos([campos.responsavel_colaborador_id, campos.instrutor_colaborador_id].filter((x): x is number => x != null));
  await exigirResponsavelPrincipal(campos, conta); // a reposição também tem um responsável principal habilitado (ou do RH)
  // Mesmo documento: mantém a fotografia do original (mesma revisão treinada).
  const doc =
    campos.lista_mestra_codigo && campos.lista_mestra_codigo !== origem.lista_mestra_codigo
      ? await fotografiaDocumento(campos.lista_mestra_codigo)
      : { lista_mestra_codigo: origem.lista_mestra_codigo, lista_mestra_titulo: origem.lista_mestra_titulo, lista_mestra_revisao: origem.lista_mestra_revisao };
  const raiz = Number(origem.reposicao_raiz_id ?? origem.id);
  const { data: irmaos, error: iErro } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select("id").eq("reposicao_raiz_id", raiz);
  if (iErro) erroBanco(iErro, "Reposições");
  const linha = { ...campos, ...doc, titulo: TIPOS_COM_DOCUMENTO.has(campos.tipo) ? tituloDoTreinamento(campos.tipo, "", doc) : caixaAlta(campos.titulo || origem.titulo) };
  exigirMinimoPlanejamento(linha); // reposição também nasce PLANEJADA (a nova data é definida por quem agenda)
  exigirDataPrevistaNaoRetroativa(linha.data_inicio);
  const agora = new Date().toISOString();
  const { data: nova, error } = await supabaseAdmin
    .from("peopleflow_dev_treinamentos")
    .insert({
      ...linha,
      status: "planejado",
      planejado_em: agora,
      planejado_por: conta.userId,
      solicitado_por_colaborador_id: conta.colaboradorId,
      reposicao_de_id: origem.id,
      reposicao_raiz_id: raiz,
      reposicao_numero: (irmaos ?? []).length + 1,
      homologacao: Boolean(origem.homologacao), // herdado; não pode ser retirado
      origem_registro: "sistema",
      created_by: conta.userId,
      updated_by: conta.userId,
    })
    .select(COLS_TRE)
    .single();
  if (error) erroBanco(error, "Reposição");
  const colabs = escolhidos.map((p) => Number(p.colaborador_id));
  const { error: pErro } = await supabaseAdmin
    .from("peopleflow_dev_participantes")
    .insert(colabs.map((c) => ({ treinamento_id: nova.id, colaborador_id: c, origem_inclusao: "reposicao", origem_registro: "sistema", created_by: conta.userId, updated_by: conta.userId })));
  if (pErro) erroBanco(pErro, "Participantes");
  // Necessidades dos faltantes ainda em aberto passam a ser atendidas também pela reposição.
  const vinculos = await vinculosAtivos(origem.id);
  let necessidades: number[] = [];
  if (vinculos.length) {
    const { data: nec, error: nErro } = await supabaseAdmin
      .from("peopleflow_dev_necessidades")
      .select("id, colaborador_id, status")
      .in("id", vinculos.map((v) => v.necessidade_id))
      .in("colaborador_id", colabs);
    if (nErro) erroBanco(nErro, "Necessidade de Desenvolvimento");
    necessidades = (nec ?? []).filter((n) => ["validada", "planejada"].includes(n.status as string)).map((n) => Number(n.id));
    if (necessidades.length) {
      const { error: vErro } = await supabaseAdmin
        .from("peopleflow_dev_treinamento_necessidades")
        .insert(necessidades.map((n) => ({ treinamento_id: nova.id, necessidade_id: n, vinculado_por: conta.userId, situacao: "validada", analisado_em: agora, analisado_por: conta.userId, analise_motivo: "Herdada do treinamento de origem (associação já validada pelo RH)" })));
      if (vErro) erroBanco(vErro, "Vínculo");
    }
  }
  // Quem ainda não tinha encaminhamento passa a "reposição", com a data prevista = a da reposição agendada (a justificativa continua a do original).
  for (const p of escolhidos) {
    const { data: atual } = await supabaseAdmin.from("peopleflow_dev_participantes").select("ausencia_encaminhamento").eq("id", p.id).maybeSingle();
    if (atual && !atual.ausencia_encaminhamento) {
      const { error: eErro } = await supabaseAdmin.from("peopleflow_dev_participantes").update({ ausencia_encaminhamento: "reposicao", reposicao_prevista_em: nova.data_inicio ?? null, ausencia_atualizada_em: agora, ausencia_atualizada_por: conta.userId, updated_by: conta.userId }).eq("id", p.id);
      if (eErro) erroBanco(eErro, "Ausência");
    }
  }
  await auditar(conta, "reposicao_criada", "peopleflow_dev_treinamentos", String(nova.id), {
    reposicao_de: origem.id, raiz, numero: nova.reposicao_numero, faltantes: colabs, necessidades, depois: nova,
  });
  await planejarNecessidadesDoTreinamento(conta, nova.id);
  return nova;
}

// ── Vínculo com a Base de Necessidades ─────────────────────────────────
/** Todas as associações ativas (indicadas + validadas). */
async function vinculosAtivosTodos(treinamentoId: number) {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_treinamento_necessidades").select("id, necessidade_id, situacao").eq("treinamento_id", treinamentoId).eq("ativo", true);
  if (error) erroBanco(error, "Vínculos");
  return (data ?? []) as { id: number; necessidade_id: number; situacao: string }[];
}

/** Gestão/Responsável INDICA; o RH vincula já validado. Só a validada produz efeito oficial. */
async function necessidadesVincular(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  const ehRH = conta.perfil === "RH";
  if (!ehRH && !(await podeGerirParticipantes(conta, t))) throw new ErroHttp(403, "Somente o RH ou o responsável/instrutor interno habilitado deste treinamento indica Necessidades de Desenvolvimento.");
  if (t.status === "concluido" || t.status === "cancelado") throw new ErroHttp(422, "Treinamento encerrado.");
  if (t.homologacao) throw new ErroHttp(422, "Treinamento de homologação/teste não pode ser vinculado a Necessidades de Desenvolvimento.");
  const ids = Array.isArray(corpo.necessidade_ids) ? [...new Set(corpo.necessidade_ids.map(Number))].filter((n) => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) throw new ErroHttp(422, "Selecione ao menos uma Necessidade de Desenvolvimento.");
  const { data: nec, error } = await supabaseAdmin.from("peopleflow_dev_necessidades").select("id, status, colaborador_id").in("id", ids);
  if (error) erroBanco(error, "Necessidade de Desenvolvimento");
  const invalidas = (nec ?? []).filter((n) => !["validada", "planejada"].includes(n.status as string) || !n.colaborador_id);
  if ((nec ?? []).length !== ids.length || invalidas.length) throw new ErroHttp(422, "Só Necessidades de Desenvolvimento VALIDADAS (ou já PLANEJADAS) de um colaborador podem ser vinculadas.");
  if (!ehRH) {
    const escopo = await idsNoEscopo(conta);
    if ((nec ?? []).some((n) => !escopo.has(Number(n.colaborador_id)))) throw new ErroHttp(403, "Há Necessidade de Desenvolvimento de colaborador fora da sua gestão.");
  }
  const ja = new Set((await vinculosAtivosTodos(t.id)).map((v) => v.necessidade_id));
  const novas = ids.filter((i) => !ja.has(i));
  const agora = new Date().toISOString();
  if (novas.length) {
    const { error: iErro } = await supabaseAdmin.from("peopleflow_dev_treinamento_necessidades").insert(
      novas.map((n) => ({
        treinamento_id: t.id,
        necessidade_id: n,
        vinculado_por: conta.userId,
        indicado_por_colaborador_id: conta.colaboradorId,
        situacao: ehRH ? "validada" : "indicada",
        analisado_em: ehRH ? agora : null,
        analisado_por: ehRH ? conta.userId : null,
      })),
    );
    if (iErro) erroBanco(iErro, "Vínculo");
  }
  // O colaborador da necessidade entra como participante (se ainda não estiver).
  const colabs = [...new Set((nec ?? []).filter((n) => novas.includes(Number(n.id))).map((n) => Number(n.colaborador_id)))];
  if (colabs.length) await participantesAdicionar({ ...conta }, { treinamento_id: t.id, colaborador_ids: colabs, origem_inclusao: "manual" }).catch((e) => {
    if (!(e instanceof ErroHttp && e.status === 422)) throw e;
  });
  if (colabs.length) await supabaseAdmin.from("peopleflow_dev_participantes").update({ origem_inclusao: "lnt" }).eq("treinamento_id", t.id).in("colaborador_id", colabs).eq("origem_inclusao", "manual");
  await auditar(conta, ehRH ? "necessidades_vinculadas" : "necessidades_indicadas", "peopleflow_dev_treinamentos", String(t.id), { necessidades: novas, situacao: ehRH ? "validada" : "indicada" });
  if (ehRH && STATUS_ATIVOS.includes(t.status)) for (const n of novas) await mudarStatusNecessidade(conta, n, ["validada"], "planejada", {}, "Vinculada a treinamento planejado", t.id);
  return { vinculadas: novas.length, ja_vinculadas: ids.length - novas.length, situacao: ehRH ? "validada" : "indicada" };
}

async function lerVinculoAtivo(treinamentoId: number, necessidadeId: number) {
  const v = (await vinculosAtivosTodos(treinamentoId)).find((x) => x.necessidade_id === necessidadeId);
  if (!v) throw new ErroHttp(404, "Associação não encontrada.");
  return v;
}

/** RH valida a associação indicada: a partir daqui ela produz efeito oficial. */
async function necessidadeAssociacaoValidar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  const necessidadeId = idObrigatorio(corpo, "necessidade_id", "Necessidade de Desenvolvimento");
  if (t.homologacao) throw new ErroHttp(422, "Treinamento de homologação/teste não pode ser vinculado a Necessidades de Desenvolvimento.");
  const v = await lerVinculoAtivo(t.id, necessidadeId);
  if (v.situacao !== "indicada") throw new ErroHttp(422, "Esta associação já foi analisada.");
  const { error } = await supabaseAdmin.from("peopleflow_dev_treinamento_necessidades").update({ situacao: "validada", analisado_em: new Date().toISOString(), analisado_por: conta.userId }).eq("id", v.id);
  if (error) erroBanco(error, "Vínculo");
  await auditar(conta, "necessidade_associacao_validada", "peopleflow_dev_treinamentos", String(t.id), { necessidade_id: necessidadeId });
  if (STATUS_ATIVOS.includes(t.status)) await mudarStatusNecessidade(conta, necessidadeId, ["validada"], "planejada", {}, "Associação validada pelo RH", t.id);
  if (t.status === "concluido") {
    // Validada depois da conclusão: aplica as regras de atendimento a quem realizou.
    const { data: n } = await supabaseAdmin.from("peopleflow_dev_necessidades").select("colaborador_id").eq("id", necessidadeId).maybeSingle();
    const p = (await participantesAtivos(t.id)).find((x) => Number(x.colaborador_id) === Number(n?.colaborador_id));
    if (p) await processarNecessidadesDoParticipante(conta, t, p);
  }
  return { ok: true };
}

async function necessidadeAssociacaoRejeitar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  const necessidadeId = idObrigatorio(corpo, "necessidade_id", "Necessidade de Desenvolvimento");
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "o motivo" });
  const v = await lerVinculoAtivo(t.id, necessidadeId);
  if (v.situacao !== "indicada") throw new ErroHttp(422, "Esta associação já foi analisada.");
  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("peopleflow_dev_treinamento_necessidades")
    .update({ situacao: "rejeitada", ativo: false, analisado_em: agora, analisado_por: conta.userId, analise_motivo: motivo, desvinculado_em: agora, desvinculado_por: conta.userId, desvinculado_motivo: `Não validada pelo RH: ${motivo}` })
    .eq("id", v.id);
  if (error) erroBanco(error, "Vínculo");
  await auditar(conta, "necessidade_associacao_rejeitada", "peopleflow_dev_treinamentos", String(t.id), { necessidade_id: necessidadeId, motivo });
  return { ok: true };
}

/** Lista as associações do treinamento (para quem pode vê-lo), com o resumo da necessidade. */
async function vinculosListar(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  if (!(await podeVerTreinamento(conta, t))) throw new ErroHttp(403, "Sem acesso a este treinamento.");
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_treinamento_necessidades")
    .select("id, necessidade_id, ativo, situacao, indicado_por_colaborador_id, vinculado_em, analisado_em, analise_motivo")
    .eq("treinamento_id", t.id);
  if (error) erroBanco(error, "Vínculos");
  const linhas = (data ?? []).filter((v) => v.ativo || v.situacao === "rejeitada");
  if (!linhas.length) return [];
  const { data: nec, error: nErro } = await supabaseAdmin.from("peopleflow_dev_necessidades").select("id, colaborador_id, descricao, categoria, prioridade, status").in("id", linhas.map((v) => Number(v.necessidade_id)));
  if (nErro) erroBanco(nErro, "Necessidade de Desenvolvimento");
  const porId = new Map((nec ?? []).map((n) => [Number(n.id), n]));
  const ids = [...new Set([...(nec ?? []).map((n) => Number(n.colaborador_id)), ...linhas.map((v) => Number(v.indicado_por_colaborador_id)).filter(Boolean)])];
  const { data: pessoas } = ids.length ? await supabaseAdmin.from("colaboradores").select("id, nome").in("id", ids) : { data: [] };
  const nome = new Map((pessoas ?? []).map((c) => [Number(c.id), String(c.nome)]));
  return linhas.map((v) => {
    const n = porId.get(Number(v.necessidade_id));
    return {
      id: Number(v.id),
      necessidade_id: Number(v.necessidade_id),
      situacao: v.situacao,
      indicado_por: v.indicado_por_colaborador_id ? (nome.get(Number(v.indicado_por_colaborador_id)) ?? null) : null,
      vinculado_em: v.vinculado_em,
      analisado_em: v.analisado_em,
      analise_motivo: v.analise_motivo,
      necessidade: n ? { id: Number(n.id), colaborador_id: Number(n.colaborador_id), colaborador_nome: nome.get(Number(n.colaborador_id)) ?? null, descricao: n.descricao, categoria: n.categoria, prioridade: n.prioridade, status: n.status } : null,
    };
  });
}

/** Necessidades de Desenvolvimento que podem ser indicadas/vinculadas: RH todas; gestão só as da sua equipe. */
async function necessidadesOpcoes(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  const ehRH = conta.perfil === "RH";
  if (!ehRH && !(await podeGerirParticipantes(conta, t))) throw new ErroHttp(403, "Sem permissão para indicar Necessidades de Desenvolvimento neste treinamento.");
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_necessidades").select("id, colaborador_id, descricao, categoria, prioridade, status").in("status", ["validada", "planejada"]);
  if (error) erroBanco(error, "Necessidade de Desenvolvimento");
  let linhas = (data ?? []).filter((n) => n.colaborador_id);
  if (!ehRH) {
    const escopo = await idsNoEscopo(conta);
    linhas = linhas.filter((n) => escopo.has(Number(n.colaborador_id)));
  }
  const busca = texto(corpo, "busca", { max: 100 }).toLocaleLowerCase("pt-BR");
  const ids = [...new Set(linhas.map((n) => Number(n.colaborador_id)))];
  const { data: pessoas } = ids.length ? await supabaseAdmin.from("colaboradores").select("id, nome").in("id", ids) : { data: [] };
  const nome = new Map((pessoas ?? []).map((c) => [Number(c.id), String(c.nome)]));
  return linhas
    .map((n) => ({ id: Number(n.id), colaborador_id: Number(n.colaborador_id), colaborador_nome: nome.get(Number(n.colaborador_id)) ?? "", descricao: String(n.descricao), categoria: n.categoria, prioridade: n.prioridade, status: n.status }))
    .filter((n) => !busca || `${n.colaborador_nome} ${n.descricao}`.toLocaleLowerCase("pt-BR").includes(busca))
    .sort((a, b) => a.colaborador_nome.localeCompare(b.colaborador_nome, "pt-BR"))
    .slice(0, 300);
}

/** RH desvincula qualquer associação; a gestão só retira a própria INDICAÇÃO (ainda não validada). */
async function necessidadeDesvincular(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  const necessidadeId = idObrigatorio(corpo, "necessidade_id", "Necessidade de Desenvolvimento");
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "o motivo" });
  if (t.status === "concluido") throw new ErroHttp(422, "Vínculos de treinamento concluído são históricos.");
  const v = await lerVinculoAtivo(t.id, necessidadeId);
  if (conta.perfil !== "RH" && !(v.situacao === "indicada" && (await podeGerirParticipantes(conta, t)))) throw new ErroHttp(403, "Somente o RH desvincula uma associação validada.");
  const { error } = await supabaseAdmin.from("peopleflow_dev_treinamento_necessidades").update({ ativo: false, desvinculado_em: new Date().toISOString(), desvinculado_por: conta.userId, desvinculado_motivo: motivo }).eq("id", v.id);
  if (error) erroBanco(error, "Vínculo");
  await auditar(conta, "necessidade_desvinculada", "peopleflow_dev_treinamentos", String(t.id), { necessidade_id: necessidadeId, motivo });
  if (v.situacao === "validada") await devolverNecessidade(conta, necessidadeId, t.id, "Desvinculada do treinamento");
  return { ok: true };
}

// ── Presença ────────────────────────────────────────────────────────────
async function presencaManual(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  await exigirConduzir(conta, t);
  const presenca = umDe(texto(corpo, "presenca"), ["presente", "ausente", "pendente"] as const, "Presença");
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "a origem/justificativa do registro" });
  const retificacao = t.status === "concluido";
  if (retificacao && conta.perfil !== "RH") throw new ErroHttp(403, "Após a conclusão, só o RH retifica presença.");
  if (!(t.status === "em_andamento" || retificacao || (t.modalidade === "externo" && t.status === "planejado"))) throw new ErroHttp(422, "Presença só pode ser registrada com o treinamento em andamento.");
  if (retificacao && presenca === "pendente") throw new ErroHttp(422, "Treinamento concluído não aceita presença pendente.");
  const ids = Array.isArray(corpo.participante_ids) ? [...new Set(corpo.participante_ids.map(Number))].filter((n) => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) throw new ErroHttp(422, "Selecione ao menos um participante.");
  const { data: parts, error } = await supabaseAdmin.from("peopleflow_dev_participantes").select(`${COLS_PART}, ausencia_justificativa`).in("id", ids).eq("treinamento_id", t.id);
  if (error) erroBanco(error, "Participantes");
  if ((parts ?? []).length !== ids.length || (parts ?? []).some((p) => p.removido_em)) throw new ErroHttp(422, "Participante inválido para este treinamento.");
  const agora = new Date().toISOString();
  const alterados: Record<string, any>[] = [];
  for (const p of parts ?? []) {
    if (p.presenca_status === presenca) continue;
    const { data, error: uErro } = await supabaseAdmin
      .from("peopleflow_dev_participantes")
      .update({ presenca_status: presenca, presenca_metodo: presenca === "pendente" ? null : "manual", presenca_em: presenca === "pendente" ? null : agora, presenca_por: conta.userId, presenca_motivo: motivo, updated_by: conta.userId, ...(presenca === "ausente" && !String((p as Record<string, unknown>).ausencia_justificativa ?? "").trim() ? { ausencia_justificativa: motivo, ausencia_atualizada_em: agora, ausencia_atualizada_por: conta.userId } : {}) })
      .eq("id", p.id)
      .select(COLS_PART)
      .single();
    if (uErro) erroBanco(uErro, "Presença");
    alterados.push(data);
    await auditar(conta, retificacao ? "presenca_retificada" : "presenca_manual", "peopleflow_dev_participantes", String(p.id), {
      treinamento_id: t.id, colaborador_id: p.colaborador_id, presenca: { antes: p.presenca_status, depois: presenca }, metodo_anterior: p.presenca_metodo, motivo,
    });
    if (retificacao) await processarNecessidadesDoParticipante(conta, t, data);
  }
  if (retificacao && alterados.length && t.modalidade === "interno") await gerarListaPresenca(conta, t, `Retificação de presença: ${motivo}`);
  return { alterados: alterados.length };
}

// ── QR de presença (token aleatório, com validade; só o servidor o lê) ──
async function qrGerar(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  await exigirConduzir(conta, t);
  if (t.status !== "em_andamento") throw new ErroHttp(422, "Inicie o treinamento para gerar o QR de presença.");
  const { data: atual } = await supabaseAdmin.from("peopleflow_dev_qr_tokens").select("token, ativo, expira_em").eq("treinamento_id", t.id).maybeSingle();
  const renovar = corpo.renovar === true;
  if (atual?.ativo && new Date(atual.expira_em as string).getTime() > Date.now() && !renovar) return { token: atual.token, expira_em: atual.expira_em };
  const token = randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
  const linha = { treinamento_id: t.id, token, ativo: true, expira_em: expira, criado_em: new Date().toISOString(), criado_por: conta.userId, encerrado_em: null, encerrado_por: null };
  const { error } = atual
    ? await supabaseAdmin.from("peopleflow_dev_qr_tokens").update(linha).eq("treinamento_id", t.id)
    : await supabaseAdmin.from("peopleflow_dev_qr_tokens").insert(linha);
  if (error) erroBanco(error, "QR");
  await auditar(conta, "qr_gerado", "peopleflow_dev_treinamentos", String(t.id), { expira_em: expira, renovado: Boolean(atual) });
  return { token, expira_em: expira };
}

async function qrEncerrarAcao(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  await exigirConduzir(conta, t);
  const encerrou = await encerrarQr(conta, t.id);
  if (encerrou) await auditar(conta, "qr_encerrado", "peopleflow_dev_treinamentos", String(t.id), {});
  return { encerrado: encerrou };
}

// ── Evidências (bucket privado; só URL assinada emitida aqui) ──────────
const BUCKET = "desenvolvimento-evidencias";
const MIMES = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const TIPOS_EVID = ["lista_presenca", "certificado", "material", "ata", "foto", "comprovante", "avaliacao", "outro"] as const;

async function exigirPodeAnexar(conta: ContaDev, t: Treinamento) {
  await exigirConduzir(conta, t);
  if (t.status === "cancelado") throw new ErroHttp(422, "Treinamento cancelado.");
  if (t.status === "concluido" && conta.perfil !== "RH") throw new ErroHttp(403, "Após a conclusão, só o RH anexa evidências.");
}

async function evidenciaUploadUrl(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  await exigirPodeAnexar(conta, t);
  exigirTipoManual(t, texto(corpo, "tipo"));
  const mime = texto(corpo, "mime", { obrigatorio: true, max: 120, rotulo: "o tipo do arquivo" });
  if (!MIMES.has(mime)) throw new ErroHttp(422, "Formato não aceito (use PDF, imagem, Word, Excel ou PowerPoint).");
  const tamanho = inteiroOpcional(corpo, "tamanho_bytes", "Tamanho", 1, 20 * 1024 * 1024);
  if (!tamanho) throw new ErroHttp(422, "Arquivo vazio ou maior que 20 MB.");
  const nome = texto(corpo, "file_name", { obrigatorio: true, max: 200, rotulo: "o nome do arquivo" });
  const seguro = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120);
  const caminho = `treinamentos/${t.id}/${randomUUID()}-${seguro}`;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error || !data) throw new ErroHttp(500, `Storage: ${error?.message ?? "sem URL"}`);
  return { path: caminho, token: data.token };
}

async function evidenciaRegistrar(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  await exigirPodeAnexar(conta, t);
  const caminho = texto(corpo, "path", { obrigatorio: true, max: 400, rotulo: "o arquivo" });
  if (!caminho.startsWith(`treinamentos/${t.id}/`) || ehListaDoSistema(caminho)) throw new ErroHttp(422, "Arquivo não pertence a este treinamento.");
  exigirTipoManual(t, texto(corpo, "tipo"));
  const participanteId = corpo.participante_id ? idObrigatorio(corpo, "participante_id", "Participante") : null;
  if (participanteId) {
    const p = await lerParticipante(participanteId);
    if (Number(p.treinamento_id) !== t.id) throw new ErroHttp(422, "Participante não pertence a este treinamento.");
  }
  const pasta = caminho.slice(0, caminho.lastIndexOf("/"));
  const arquivo = caminho.slice(caminho.lastIndexOf("/") + 1);
  const { data: lista, error: lErro } = await supabaseAdmin.storage.from(BUCKET).list(pasta, { search: arquivo, limit: 5 });
  if (lErro) throw new ErroHttp(500, `Storage: ${lErro.message}`);
  const obj = (lista ?? []).find((o: { name: string }) => o.name === arquivo) as { name: string; metadata?: { size?: number; mimetype?: string } } | undefined;
  if (!obj) throw new ErroHttp(422, "O envio do arquivo não foi concluído.");
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_evidencias")
    .insert({
      treinamento_id: t.id,
      participante_id: participanteId,
      tipo: umDe(texto(corpo, "tipo") || "outro", TIPOS_EVID, "Tipo de evidência"),
      storage_path: caminho,
      file_name: texto(corpo, "file_name", { obrigatorio: true, max: 200, rotulo: "o nome do arquivo" }),
      mime: obj.metadata?.mimetype ?? texto(corpo, "mime", { max: 120 }),
      tamanho_bytes: obj.metadata?.size ?? null,
      observacao: texto(corpo, "observacao", { max: 1000 }),
      enviado_por: conta.userId,
    })
    .select("id, treinamento_id, participante_id, tipo, file_name, mime, tamanho_bytes, observacao, enviado_em")
    .single();
  if (error) erroBanco(error, "Evidência");
  await auditar(conta, "evidencia_anexada", "peopleflow_dev_evidencias", String(data.id), { treinamento_id: t.id, participante_id: participanteId, tipo: data.tipo, arquivo: data.file_name });
  return data;
}

// ── Lista de Presença gerada pelo PeopleFlow ───────────────────────────
// Fonte primária: registros individuais de presença (participantes + auditoria).
// O PDF consolidado fica no bucket privado, em treinamentos/{id}/sistema/ — pasta
// que só o servidor grava (uploads manuais recebem outro caminho), o que marca a
// origem = sistema. Versões anteriores nunca são apagadas: ficam "substituídas".
const ROTULO_TIPO: Record<string, string> = {
  novo_pop: "Novo POP", revisao_pop: "Revisão de POP", instrucao_trabalho: "Instrução de Trabalho", integracao: "Integração",
  reciclagem: "Reciclagem", capacitacao_tecnica: "Capacitação Técnica", desenvolvimento: "Desenvolvimento",
  qualidade_regulatorio: "Qualidade / Regulatório", saude_seguranca: "Saúde e Segurança", sistemas_ferramentas: "Sistemas e Ferramentas", outro: "Outro",
};
const ROTULO_MODALIDADE: Record<string, string> = { interno: "Interno", externo: "Externo" };
const ROTULO_FORMATO: Record<string, string> = { presencial: "Presencial", online: "Online", hibrido: "Híbrido" };

function ehListaDoSistema(caminho: string): boolean {
  return /^treinamentos\/\d+\/sistema\//.test(caminho);
}

function exigirTipoManual(t: Treinamento, tipo: string) {
  if (tipo === "lista_presenca" && t.modalidade !== "externo") {
    throw new ErroHttp(422, "Em treinamento interno a Lista de Presença é gerada automaticamente pelo PeopleFlow na conclusão.");
  }
}

const fmtDataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dataHoraBR = (iso: string | Date | null | undefined) => (iso ? fmtDataHora.format(new Date(iso)).replace(", ", " às ") : null);
function dataBR(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const iso = d instanceof Date ? d.toISOString() : String(d);
  return iso.slice(0, 10).split("-").reverse().join("/");
}
function cargaBR(min: number | null | undefined): string {
  if (!min) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  return h === 0 ? `${m} min` : m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

async function listasDoSistema(treinamentoId: number) {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_evidencias").select("id, storage_path, substituida_em").eq("treinamento_id", treinamentoId).eq("tipo", "lista_presenca");
  if (error) erroBanco(error, "Evidências");
  return (data ?? []).filter((e) => ehListaDoSistema(String(e.storage_path)));
}

interface ListaPreparada {
  path: string;
  fileName: string;
  versao: number;
  tamanho: number;
  presentes: number;
  ausentes: number;
  sha256: string;
  codigoVerificacao: string;
  motivo: string | null;
  anteriores: number[];
}

/** Monta o PDF a partir dos registros e grava no bucket privado (ainda sem registrar a evidência). */
async function prepararListaPresenca(conta: ContaDev, t: Treinamento, participantes: Record<string, any>[], motivo: string | null): Promise<ListaPreparada> {
  const listas = await listasDoSistema(t.id);
  const versao = listas.length + 1;
  const registradores = [...new Set(participantes.filter((p) => p.presenca_metodo === "manual" && p.presenca_por).map((p) => String(p.presenca_por)))];
  const { data: contas, error: cErro } = await supabaseAdmin.from("peopleflow_dev_contas").select("user_id, colaborador_id").in("user_id", [...registradores, conta.userId]);
  if (cErro) erroBanco(cErro, "Contas");
  const colabDaConta = new Map((contas ?? []).map((c) => [String(c.user_id), Number(c.colaborador_id)]));
  const ids = [
    ...participantes.map((p) => Number(p.colaborador_id)),
    ...[t.responsavel_colaborador_id, t.instrutor_colaborador_id, conta.colaboradorId].filter((x) => x != null).map(Number),
    ...colabDaConta.values(),
  ];
  const { data: pessoas, error: pErro } = await supabaseAdmin.from("colaboradores").select("id, nome, cargo, departamento").in("id", [...new Set(ids)]);
  if (pErro) erroBanco(pErro, "Colaboradores");
  const pessoa = new Map((pessoas ?? []).map((c) => [Number(c.id), c]));
  const nomeDe = (id: number | null | undefined) => (id != null ? String(pessoa.get(Number(id))?.nome ?? `#${id}`) : null);
  let reposicao: string | null = null;
  if (t.reposicao_de_id) {
    const { data: origem } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select("codigo").eq("id", t.reposicao_de_id).maybeSingle();
    reposicao = `Reposição ${t.reposicao_numero} — faltantes de ${origem?.codigo ?? `#${t.reposicao_de_id}`}`;
  }
  const linhas: ParticipanteLista[] = participantes
    .map((p) => {
      const c = pessoa.get(Number(p.colaborador_id));
      const manual = p.presenca_metodo === "manual";
      return {
        nome: String(c?.nome ?? `#${p.colaborador_id}`),
        cargo: String(c?.cargo ?? ""),
        departamento: String(c?.departamento ?? ""),
        situacao: p.presenca_status === "presente" ? "Presente" : "Ausente",
        forma: p.presenca_metodo === "qr" ? "QR Code" : p.presenca_metodo === "gravacao" ? "Gravação" : manual ? "Registro manual" : "—",
        confirmadoEm: dataHoraBR(p.presenca_em),
        registradoPor: manual ? nomeDe(colabDaConta.get(String(p.presenca_por))) : null,
        justificativa: manual ? (p.presenca_motivo ?? null) : null,
      } as ParticipanteLista;
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const registros = participantes.map((p) => [p.id, p.colaborador_id, p.presenca_status, p.presenca_metodo, p.presenca_em]).sort((a, b) => Number(a[0]) - Number(b[0]));
  const hashRegistros = createHash("sha256").update(JSON.stringify({ treinamento: t.id, versao, registros })).digest("hex");
  const codigoVerificacao = hashRegistros.slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
  const presentes = linhas.filter((l) => l.situacao === "Presente").length;
  const bytes = await gerarPdfListaPresenca({
    notaGravacao: linhas.some((l) => l.forma === "Gravação") ? NOTA_LISTA_GRAVACAO : null,
    codigo: t.codigo,
    titulo: t.titulo,
    tipo: ROTULO_TIPO[t.tipo] ?? t.tipo,
    modalidade: ROTULO_MODALIDADE[t.modalidade] ?? t.modalidade,
    formato: t.formato ? (ROTULO_FORMATO[t.formato] ?? t.formato) : "—",
    dataRealizacao: dataBR(t.data_realizacao),
    cargaRealizada: cargaBR(t.carga_realizada_min ?? t.carga_horaria_min),
    local: localParaLista(t.local_link, Boolean((await lerGravacao(t.id))?.permite_gravacao)),
    responsavel: nomeDe(t.responsavel_colaborador_id) ?? "—",
    instrutor: nomeDe(t.instrutor_colaborador_id) ?? t.instrutor_externo ?? "—",
    // Fotografia do treinamento (revisão treinada) — nunca a revisão atual da Lista Mestra.
    documento: t.lista_mestra_codigo ? { codigo: t.lista_mestra_codigo, titulo: t.lista_mestra_titulo ?? "", revisao: t.lista_mestra_revisao ?? "" } : null,
    reposicao,
    participantes: linhas,
    versao,
    motivoVersao: motivo,
    geradoEm: dataHoraBR(new Date().toISOString())!,
    geradoPor: nomeDe(conta.colaboradorId) ?? "PeopleFlow",
    codigoVerificacao,
    homologacao: Boolean(t.homologacao),
  });
  const path = `treinamentos/${t.id}/sistema/lista-presenca-v${versao}-${Date.now()}.pdf`;
  const { error: uErro } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (uErro) throw new ErroHttp(500, `Storage (lista de presença): ${uErro.message}`);
  return {
    path,
    fileName: `Lista de Presença ${t.codigo} v${versao}.pdf`,
    versao,
    tamanho: bytes.length,
    presentes,
    ausentes: linhas.length - presentes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    codigoVerificacao,
    motivo,
    anteriores: listas.filter((l) => !l.substituida_em).map((l) => Number(l.id)),
  };
}

/** Registra a evidência (origem sistema), marca a versão anterior como substituída e audita. */
async function registrarListaPresenca(conta: ContaDev, t: Treinamento, a: ListaPreparada) {
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_evidencias")
    .insert({
      treinamento_id: t.id,
      participante_id: null,
      tipo: "lista_presenca",
      storage_path: a.path,
      file_name: a.fileName,
      mime: "application/pdf",
      tamanho_bytes: a.tamanho,
      observacao: `Gerada automaticamente pelo PeopleFlow · versão ${a.versao} · ${a.presentes} presente${a.presentes === 1 ? "" : "s"} • ${a.ausentes} ausente${a.ausentes === 1 ? "" : "s"}`,
      enviado_por: conta.userId,
    })
    .select("id, treinamento_id, participante_id, tipo, file_name, mime, tamanho_bytes, observacao, enviado_em")
    .single();
  if (error) erroBanco(error, "Lista de presença");
  for (const anterior of a.anteriores) {
    const { error: sErro } = await supabaseAdmin
      .from("peopleflow_dev_evidencias")
      .update({ substituida_em: new Date().toISOString(), substituida_por: conta.userId, substituida_motivo: `Substituída pela versão ${a.versao}. ${a.motivo ?? ""}`.trim() })
      .eq("id", anterior);
    if (sErro) erroBanco(sErro, "Lista de presença");
  }
  await auditar(conta, "lista_presenca_gerada", "peopleflow_dev_evidencias", String(data.id), {
    treinamento_id: t.id, origem: "sistema", versao: a.versao, arquivo: a.path, sha256: a.sha256, codigo_verificacao: a.codigoVerificacao,
    presentes: a.presentes, ausentes: a.ausentes, motivo: a.motivo, substitui: a.anteriores,
  });
  return data;
}

async function gerarListaPresenca(conta: ContaDev, t: Treinamento, motivo: string | null) {
  const participantes = await participantesAtivos(t.id);
  return registrarListaPresenca(conta, t, await prepararListaPresenca(conta, t, participantes, motivo));
}

/** RH: gera a lista de um treinamento interno concluído (ex.: concluído antes deste recurso) ou uma nova versão, com motivo. */
async function listaPresencaGerar(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  await exigirConduzir(conta, t);
  if (t.status !== "concluido" || t.modalidade !== "interno") throw new ErroHttp(422, "A Lista de Presença é gerada para treinamentos internos concluídos.");
  const vigente = (await listasDoSistema(t.id)).some((l) => !l.substituida_em);
  const motivo = texto(corpo, "motivo", { obrigatorio: vigente, max: 1000, rotulo: "o motivo da nova versão" });
  return gerarListaPresenca(conta, t, motivo || null);
}

async function lerEvidencia(id: number) {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_evidencias").select("id, treinamento_id, participante_id, storage_path, file_name, substituida_em").eq("id", id).maybeSingle();
  if (error) erroBanco(error, "Evidência");
  if (!data) throw new ErroHttp(404, "Evidência não encontrada.");
  return data as Record<string, any>;
}

async function evidenciaUrl(conta: ContaDev, corpo: Corpo) {
  const ev = await lerEvidencia(idObrigatorio(corpo, "id", "Evidência"));
  const t = await lerTreinamento(ev.treinamento_id);
  let pode = ehAdministrador(conta, t);
  if (!pode && conta.perfil === "Gestor") {
    const escopo = await idsNoEscopo(conta);
    if (ev.participante_id) pode = escopo.has(Number((await lerParticipante(ev.participante_id)).colaborador_id));
    else pode = (await participantesAtivos(t.id)).some((p) => escopo.has(Number(p.colaborador_id))) || ehSolicitante(conta, t);
  }
  if (!pode) throw new ErroHttp(403, "Sem acesso a esta evidência.");
  // "visualizar": abre no navegador; padrão: baixa com o nome original. Link válido por 5 minutos.
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(ev.storage_path, 300, corpo.visualizar === true ? undefined : { download: ev.file_name });
  if (error || !data) throw new ErroHttp(500, `Storage: ${error?.message ?? "sem URL"}`);
  return { url: data.signedUrl };
}

async function evidenciaSubstituir(conta: ContaDev, corpo: Corpo) {
  const ev = await lerEvidencia(idObrigatorio(corpo, "id", "Evidência"));
  const t = await lerTreinamento(ev.treinamento_id);
  await exigirPodeAnexar(conta, t);
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "o motivo" });
  if (ev.substituida_em) throw new ErroHttp(422, "Evidência já substituída.");
  if (ehListaDoSistema(ev.storage_path)) throw new ErroHttp(422, "A Lista de Presença gerada pelo PeopleFlow não é substituída manualmente: retifique a presença (gera nova versão).");
  const { error } = await supabaseAdmin.from("peopleflow_dev_evidencias").update({ substituida_em: new Date().toISOString(), substituida_por: conta.userId, substituida_motivo: motivo }).eq("id", ev.id);
  if (error) erroBanco(error, "Evidência");
  await auditar(conta, "evidencia_substituida", "peopleflow_dev_evidencias", String(ev.id), { treinamento_id: t.id, motivo });
  return { ok: true };
}

// ── Eficácia (simples, individual; não é avaliação de desempenho) ──────
async function eficaciaRegistrar(conta: ContaDev, corpo: Corpo) {
  const p = await lerParticipante(idObrigatorio(corpo, "participante_id", "Participante"));
  const t = await lerTreinamento(p.treinamento_id);
  if (!t.exige_eficacia) throw new ErroHttp(422, "Este treinamento não exige avaliação de eficácia.");
  if (!["em_andamento", "concluido"].includes(t.status)) throw new ErroHttp(422, "A eficácia é avaliada depois da realização.");
  if (p.removido_em || p.presenca_status !== "presente") throw new ErroHttp(422, "Só participantes que realizaram o treinamento são avaliados.");
  if (conta.perfil !== "RH") {
    if (conta.perfil !== "Gestor" || Number(p.colaborador_id) === conta.colaboradorId || !(await idsNoEscopo(conta)).has(Number(p.colaborador_id))) {
      throw new ErroHttp(403, "A eficácia é avaliada pelo RH ou pelo gestor do participante.");
    }
  }
  const resultado = umDe(texto(corpo, "resultado"), ["eficaz", "parcialmente_eficaz", "nao_eficaz"] as const, "Resultado");
  const observacao = texto(corpo, "observacao", { obrigatorio: resultado !== "eficaz", max: 2000, rotulo: "a observação" });
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_participantes")
    .update({ eficacia_resultado: resultado, eficacia_observacao: observacao, eficacia_em: new Date().toISOString(), eficacia_por: conta.userId, eficacia_por_colaborador_id: conta.colaboradorId, updated_by: conta.userId })
    .eq("id", p.id)
    .select(COLS_PART)
    .single();
  if (error) erroBanco(error, "Eficácia");
  await auditar(conta, "eficacia_registrada", "peopleflow_dev_participantes", String(p.id), { treinamento_id: t.id, resultado: { antes: p.eficacia_resultado, depois: resultado }, observacao });
  await processarNecessidadesDoParticipante(conta, t, data);
  return data;
}

// ── Habilitação de Responsáveis por Treinamentos ─────────────────────────
// As lideranças informam o RH por e-mail; o RH HABILITA e REVOGA diretamente aqui. A habilitação é permanente (até revogar), vinculada
// à área/gestão do colaborador, e só vale para o módulo de Treinamentos (perfil Responsavel: sem AVD, PDI, salários ou movimentações).
// Quem não tem conta no portal (ex.: menos de seis meses de empresa) recebe SOMENTE o acesso ao PeopleFlow, sem o acesso do SST.
async function nomesDeColaboradores(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseAdmin.from("colaboradores").select("id, nome").in("id", [...new Set(ids)]);
  if (error) erroBanco(error, "Colaboradores");
  return new Map((data ?? []).map((c) => [Number(c.id), String(c.nome)]));
}

/** e-mail → id da conta no Supabase Auth (paginado). */
async function contasDeAcesso(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new ErroHttp(500, `Contas de acesso: ${error.message}`);
    for (const u of data.users) if (u.email) mapa.set(u.email.toLowerCase(), u.id);
    if (data.users.length < perPage) break;
  }
  return mapa;
}

async function habilitacaoListar(conta: ContaDev) {
  if (conta.perfil !== "RH" && conta.perfil !== "Gestor") throw new ErroHttp(403, "Somente o RH e as lideranças acompanham as habilitações.");
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_responsaveis_gestao")
    .select("id, gestor_colaborador_id, colaborador_id, ativo, departamento, referencia, habilitado_em, habilitado_por, revogado_em, revogado_por, revogado_motivo");
  if (error) erroBanco(error, "Habilitações");
  let linhas = (data ?? []) as Record<string, any>[];
  if (conta.perfil === "Gestor") {
    const escopo = await idsNoEscopo(conta);
    linhas = linhas.filter((r) => Number(r.gestor_colaborador_id) === conta.colaboradorId || escopo.has(Number(r.colaborador_id)));
  }
  const nomes = await nomesDeColaboradores(linhas.flatMap((r) => [Number(r.gestor_colaborador_id), Number(r.colaborador_id)]));
  const usuarios = [...new Set(linhas.flatMap((r) => [r.habilitado_por, r.revogado_por]).filter((u): u is string => typeof u === "string"))];
  const { data: contas, error: cErro } = usuarios.length ? await supabaseAdmin.from("peopleflow_dev_contas").select("user_id, colaborador_id").in("user_id", usuarios) : { data: [], error: null };
  if (cErro) erroBanco(cErro, "Contas");
  const porUsuario = new Map((contas ?? []).map((c) => [String(c.user_id), Number(c.colaborador_id)]));
  const autores = await nomesDeColaboradores([...porUsuario.values()]);
  const autor = (u: unknown) => (typeof u === "string" && porUsuario.has(u) ? (autores.get(porUsuario.get(u) as number) ?? null) : null);
  return linhas
    .sort((a, b) => Number(Boolean(b.ativo)) - Number(Boolean(a.ativo)) || String(b.habilitado_em ?? "").localeCompare(String(a.habilitado_em ?? "")) || Number(b.id) - Number(a.id))
    .map((r) => ({
      id: Number(r.id),
      ativa: Boolean(r.ativo),
      colaborador: { id: Number(r.colaborador_id), nome: nomes.get(Number(r.colaborador_id)) ?? "" },
      gestao: { id: Number(r.gestor_colaborador_id), nome: nomes.get(Number(r.gestor_colaborador_id)) ?? "" },
      departamento: (r.departamento as string | null) ?? "",
      referencia: (r.referencia as string | null) ?? "",
      habilitado_em: r.habilitado_em as string | null,
      habilitado_por: autor(r.habilitado_por),
      revogado_em: r.revogado_em as string | null,
      revogado_por: autor(r.revogado_por),
      revogado_motivo: (r.revogado_motivo as string | null) ?? "",
    }));
}

/** RH: colaboradores ativos com a gestão sugerida, se já têm habilitação e se já têm acesso ao portal. */
async function habilitacaoOpcoes(conta: ContaDev) {
  exigirRH(conta);
  const { data, error } = await supabaseAdmin.from("colaboradores").select(`id, nome, cargo, departamento, gestor, admissao, ${COLUNAS_SITUACAO}`);
  if (error) erroBanco(error, "Colaboradores");
  const ativos = (data ?? []).filter((c) => linhaAtiva(c));
  const { data: hab, error: hErro } = await supabaseAdmin.from("peopleflow_dev_responsaveis_gestao").select("colaborador_id").eq("ativo", true);
  if (hErro && !semTabela(hErro)) erroBanco(hErro, "Habilitações");
  const habilitados = new Set((hab ?? []).map((h) => Number(h.colaborador_id)));
  const contas = await contasDeAcesso();
  const idPorNome = new Map<string, number[]>();
  for (const c of ativos) idPorNome.set(String(c.nome), [...(idPorNome.get(String(c.nome)) ?? []), Number(c.id)]);
  return ativos
    .map((c) => {
      const candidatos = idPorNome.get(String(c.gestor ?? "")) ?? [];
      return {
        id: Number(c.id), nome: String(c.nome), cargo: (c.cargo as string | null) ?? "", departamento: (c.departamento as string | null) ?? "",
        gestor_nome: (c.gestor as string | null) ?? "", gestor_id: candidatos.length === 1 ? candidatos[0] : null, admissao: (c.admissao as string | null) ?? null,
        habilitado: habilitados.has(Number(c.id)), tem_acesso: contas.has(emailOf(String(c.nome))),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function habilitacaoConceder(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const colaboradorId = idObrigatorio(corpo, "colaborador_id", "Colaborador");
  const referencia = texto(corpo, "referencia", { obrigatorio: true, max: 500, rotulo: "a referência da solicitação da liderança (ex.: e-mail recebido, com a data)" });
  const { data: c, error } = await supabaseAdmin.from("colaboradores").select(`id, nome, cargo, departamento, gestor, ${COLUNAS_SITUACAO}`).eq("id", colaboradorId).maybeSingle();
  if (error) erroBanco(error, "Colaborador");
  if (!c || !linhaAtiva(c)) throw new ErroHttp(422, "Colaborador não encontrado ou desligado.");
  if (await temHabilitacaoAtiva(colaboradorId)) throw new ErroHttp(409, "Este colaborador já está habilitado. Revogue a habilitação atual (com motivo) para vinculá-lo a outra gestão.");
  // Gestão/área: informada pelo RH ou a liderança imediata cadastrada.
  let gestaoId: number | null = corpo.gestor_colaborador_id ? idObrigatorio(corpo, "gestor_colaborador_id", "Gestão") : null;
  if (!gestaoId) {
    const { data: lideres, error: lErro } = await supabaseAdmin.from("colaboradores").select(`id, nome, ${COLUNAS_SITUACAO}`).eq("nome", String(c.gestor ?? ""));
    if (lErro) erroBanco(lErro, "Colaboradores");
    const ativos = (lideres ?? []).filter((l) => linhaAtiva(l));
    if (ativos.length === 1) gestaoId = Number(ativos[0].id);
  }
  if (!gestaoId) throw new ErroHttp(422, "Informe a liderança/gestão à qual a habilitação fica vinculada (a liderança imediata não foi encontrada no cadastro).");
  if (gestaoId === colaboradorId) throw new ErroHttp(422, "A gestão deve ser a liderança do colaborador, não ele mesmo.");
  await exigirColaboradoresAtivos([gestaoId]);
  // Acesso ao portal: SOMENTE o módulo PeopleFlow (sem SST); o perfil Responsavel só alcança o módulo de Treinamentos.
  const email = emailOf(String(c.nome));
  const contas = await contasDeAcesso();
  let userId = contas.get(email);
  let acesso: "existente" | "criado" = "existente";
  let moduloConcedido = false;
  if (userId) {
    const { data: mod, error: mErro } = await supabaseAdmin.from("module_access").select("modulo").eq("user_id", userId).eq("modulo", "peopleflow").maybeSingle();
    if (mErro) erroBanco(mErro, "Acesso ao módulo");
    moduloConcedido = Boolean(mod);
  }
  if (!userId || !moduloConcedido) {
    if (corpo.criar_acesso !== true) {
      throw new ErroHttp(422, `${String(c.nome).split(" ")[0]} ainda não tem acesso ao portal. Marque "Criar acesso ao portal (somente Treinamentos)" para habilitar.`);
    }
    if (!userId) {
      const { data: novo, error: nErro } = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true });
      if (nErro || !novo?.user) throw new ErroHttp(500, `Conta de acesso: ${nErro?.message ?? "não foi possível criar"}`);
      userId = novo.user.id;
      acesso = "criado";
    }
    if (!moduloConcedido) {
      const { error: gErro } = await supabaseAdmin.from("module_access").insert({ user_id: userId, modulo: "peopleflow", concedido_por: "habilitacao-treinamentos" });
      if (gErro && gErro.code !== "23505") throw new ErroHttp(500, `Acesso ao módulo: ${gErro.message}`);
    }
  }
  const agora = new Date().toISOString();
  const { data, error: iErro } = await supabaseAdmin
    .from("peopleflow_dev_responsaveis_gestao")
    .insert({ gestor_colaborador_id: gestaoId, colaborador_id: colaboradorId, departamento: (c.departamento as string | null) ?? null, referencia, situacao: "habilitada", habilitado_em: agora, habilitado_por: conta.userId, indicado_por: conta.userId })
    .select("id")
    .single();
  if (iErro) erroBanco(iErro, "Habilitação");
  await auditar(conta, "habilitacao_concedida", "peopleflow_dev_responsaveis_gestao", String(data.id), { colaborador_id: colaboradorId, gestor_colaborador_id: gestaoId, departamento: c.departamento ?? null, referencia, acesso_ao_portal: acesso });
  return { id: Number(data.id), acesso };
}

/** Treinamentos pendentes (solicitado, planejado, em andamento) em que a pessoa é responsável principal ou instrutor. */
async function treinamentosPendentesDe(colaboradorId: number) {
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_treinamentos")
    .select("id, codigo, titulo, status, data_inicio, responsavel_colaborador_id, instrutor_colaborador_id")
    .or(`responsavel_colaborador_id.eq.${colaboradorId},instrutor_colaborador_id.eq.${colaboradorId}`)
    .in("status", ["solicitado", "planejado", "em_andamento"]);
  if (error) erroBanco(error, "Treinamentos");
  return (data ?? []).map((t) => ({
    id: Number(t.id), codigo: t.codigo as string, titulo: t.titulo as string, status: t.status as string, data_inicio: (t.data_inicio as string | null) ?? null,
    papel: Number(t.responsavel_colaborador_id) === colaboradorId ? "responsavel" : "instrutor",
  }));
}

async function habilitacaoPendencias(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  return treinamentosPendentesDe(idObrigatorio(corpo, "colaborador_id", "Colaborador"));
}

async function habilitacaoRevogar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const id = idObrigatorio(corpo, "id", "Habilitação");
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "o motivo da revogação" });
  const { data: r, error } = await supabaseAdmin.from("peopleflow_dev_responsaveis_gestao").select("id, gestor_colaborador_id, colaborador_id, ativo").eq("id", id).maybeSingle();
  if (error) erroBanco(error, "Habilitação");
  if (!r || !r.ativo) throw new ErroHttp(404, "Habilitação não encontrada ou já revogada.");
  const agora = new Date().toISOString();
  const { error: uErro } = await supabaseAdmin.from("peopleflow_dev_responsaveis_gestao").update({ ativo: false, revogado_em: agora, revogado_por: conta.userId, revogado_motivo: motivo }).eq("id", id);
  if (uErro) erroBanco(uErro, "Habilitação");
  // Encerra os poderes na hora: o escopo e a sessão do módulo são cópias derivadas (recriadas na próxima entrada, se ainda couber).
  const colaboradorId = Number(r.colaborador_id);
  const { error: eErro } = await supabaseAdmin.from("peopleflow_dev_escopo").delete().eq("gestor_colaborador_id", colaboradorId);
  if (eErro) erroBanco(eErro, "Escopo");
  const { error: sErro } = await supabaseAdmin.from("peopleflow_dev_contas").delete().eq("colaborador_id", colaboradorId).eq("perfil", "Responsavel");
  if (sErro) erroBanco(sErro, "Sessão do módulo");
  const pendentes = await treinamentosPendentesDe(colaboradorId);
  await auditar(conta, "habilitacao_revogada", "peopleflow_dev_responsaveis_gestao", String(id), { colaborador_id: colaboradorId, gestor_colaborador_id: Number(r.gestor_colaborador_id), motivo, treinamentos_pendentes: pendentes.map((p) => p.id) });
  return { ok: true, pendentes };
}

// ── Transferência de responsabilidade (RH) ───────────────────────────────
const MOTIVOS_TRANSFERENCIA = ["revogacao", "desligamento", "mudanca_responsabilidade", "outro"] as const;
async function treinamentoTransferir(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  if (!["solicitado", "planejado", "em_andamento"].includes(t.status)) throw new ErroHttp(422, "Só treinamentos pendentes (planejado ou em andamento) têm a responsabilidade transferida; os concluídos permanecem íntegros.");
  const para = idObrigatorio(corpo, "para_colaborador_id", "Novo responsável");
  const tipo = umDe(texto(corpo, "motivo_tipo"), MOTIVOS_TRANSFERENCIA, "Tipo do motivo");
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "o motivo da transferência" });
  const de = t.responsavel_colaborador_id != null ? Number(t.responsavel_colaborador_id) : null;
  if (para === de) throw new ErroHttp(422, "O novo responsável é o mesmo que já responde pelo treinamento.");
  await exigirColaboradoresAtivos([para]);
  if (!(await podemSerResponsaveis([para])).has(para)) throw new ErroHttp(422, "O novo responsável precisa ser do RH ou ter a habilitação concedida pelo RH.");
  let habilitacaoId: number | null = null;
  if (de) {
    const { data: h } = await supabaseAdmin.from("peopleflow_dev_responsaveis_gestao").select("id").eq("colaborador_id", de).order("id", { ascending: false }).limit(1);
    habilitacaoId = h && h.length ? Number(h[0].id) : null;
  }
  const { data: nova, error } = await supabaseAdmin.from("peopleflow_dev_treinamentos").update({ responsavel_colaborador_id: para, updated_by: conta.userId }).eq("id", t.id).select(COLS_TRE).single();
  if (error) erroBanco(error, "Treinamento");
  const { error: iErro } = await supabaseAdmin.from("peopleflow_dev_transferencias_responsabilidade").insert({
    treinamento_id: t.id, de_colaborador_id: de, para_colaborador_id: para, motivo_tipo: tipo, motivo, habilitacao_id: habilitacaoId, status_treinamento: t.status,
    transferido_por: conta.userId, transferido_por_colaborador_id: conta.colaboradorId,
  });
  if (iErro) {
    await supabaseAdmin.from("peopleflow_dev_treinamentos").update({ responsavel_colaborador_id: de, updated_by: conta.userId }).eq("id", t.id); // desfaz: sem histórico não há transferência
    erroBanco(iErro, "Transferência");
  }
  await auditar(conta, "responsabilidade_transferida", "peopleflow_dev_treinamentos", String(t.id), { de, para, motivo_tipo: tipo, motivo, status: t.status });
  return nova;
}

async function transferenciasListar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  let q = supabaseAdmin.from("peopleflow_dev_transferencias_responsabilidade").select("id, treinamento_id, de_colaborador_id, para_colaborador_id, motivo_tipo, motivo, status_treinamento, transferido_em, transferido_por_colaborador_id").order("id", { ascending: false });
  if (corpo.treinamento_id != null) q = q.eq("treinamento_id", idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  const { data, error } = await q.limit(500);
  if (error) erroBanco(error, "Transferências");
  const nomes = await nomesDeColaboradores((data ?? []).flatMap((r) => [r.de_colaborador_id, r.para_colaborador_id, r.transferido_por_colaborador_id].filter((x) => x != null).map(Number)));
  return (data ?? []).map((r) => ({
    id: Number(r.id), treinamento_id: Number(r.treinamento_id), motivo_tipo: r.motivo_tipo as string, motivo: r.motivo as string, status_treinamento: r.status_treinamento as string, transferido_em: r.transferido_em as string,
    de: r.de_colaborador_id != null ? (nomes.get(Number(r.de_colaborador_id)) ?? "") : null,
    para: nomes.get(Number(r.para_colaborador_id)) ?? "",
    por: r.transferido_por_colaborador_id != null ? (nomes.get(Number(r.transferido_por_colaborador_id)) ?? "") : null,
  }));
}

// ── Ausências: justificativa, encaminhamento e dispensa (a pendência individual segue aberta) ──
/** Treinamentos da mesma cadeia de reposição (original + reposições). */
async function idsDaCadeia(t: Treinamento): Promise<number[]> {
  const raiz = Number(t.reposicao_raiz_id ?? t.id);
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select("id").or(`id.eq.${raiz},reposicao_raiz_id.eq.${raiz}`);
  if (error) erroBanco(error, "Reposições");
  return (data ?? []).map((r) => Number(r.id));
}

async function ausenciaEncaminhar(conta: ContaDev, corpo: Corpo) {
  const pid = idObrigatorio(corpo, "participante_id", "Participante");
  const { data: p, error } = await supabaseAdmin
    .from("peopleflow_dev_participantes")
    .select("id, treinamento_id, colaborador_id, presenca_status, removido_em, ausencia_justificativa, ausencia_encaminhamento, reposicao_prevista_em, dispensado_em")
    .eq("id", pid)
    .maybeSingle();
  if (error) erroBanco(error, "Participante");
  if (!p || p.removido_em) throw new ErroHttp(404, "Participante não encontrado neste treinamento.");
  const t = await lerTreinamento(Number(p.treinamento_id));
  const encaminhamento = umDe(texto(corpo, "encaminhamento"), ["reposicao", "dispensa"] as const, "Encaminhamento");
  if (encaminhamento === "dispensa") {
    if (conta.perfil !== "RH") throw new ErroHttp(403, "A dispensa de reposição é autorizada pelo RH, com justificativa.");
  } else await exigirConduzir(conta, t);
  if (p.presenca_status !== "ausente") throw new ErroHttp(422, "Só participantes ausentes têm justificativa e encaminhamento de ausência.");
  if (t.status === "cancelado" || t.status === "solicitado") throw new ErroHttp(422, "Treinamento cancelado ou ainda não planejado.");
  if (p.ausencia_encaminhamento === "dispensa") throw new ErroHttp(409, "A dispensa já registrada é um registro histórico e não é alterada.");
  // Já regularizado (presente em alguma reposição da cadeia): nada a encaminhar.
  const cadeia = await idsDaCadeia(t);
  const { data: outras, error: oErro } = await supabaseAdmin.from("peopleflow_dev_participantes").select("id, presenca_status, removido_em").in("treinamento_id", cadeia).eq("colaborador_id", p.colaborador_id);
  if (oErro) erroBanco(oErro, "Participantes");
  if ((outras ?? []).some((o) => !o.removido_em && o.presenca_status === "presente")) throw new ErroHttp(409, "Este participante já realizou o treinamento (reposição concluída): a pendência está regularizada.");
  const justificativa = texto(corpo, "justificativa", { obrigatorio: true, max: 1000, rotulo: "a justificativa da ausência" });
  const prevista = encaminhamento === "reposicao" ? dataOpcional(corpo, "reposicao_prevista_em", "Data prevista da reposição") : null;
  const agora = new Date().toISOString();
  const atualizacao: Record<string, unknown> = {
    ausencia_justificativa: justificativa, ausencia_encaminhamento: encaminhamento, reposicao_prevista_em: prevista,
    ausencia_atualizada_em: agora, ausencia_atualizada_por: conta.userId, updated_by: conta.userId,
    ...(encaminhamento === "dispensa" ? { dispensado_em: agora, dispensado_por: conta.userId, dispensa_justificativa: justificativa } : {}),
  };
  const { error: uErro } = await supabaseAdmin.from("peopleflow_dev_participantes").update(atualizacao).eq("id", p.id);
  if (uErro) erroBanco(uErro, "Ausência");
  await auditar(conta, encaminhamento === "dispensa" ? "ausencia_dispensada" : "ausencia_encaminhada", "peopleflow_dev_participantes", String(p.id), {
    treinamento_id: t.id, colaborador_id: p.colaborador_id,
    antes: { justificativa: p.ausencia_justificativa ?? null, encaminhamento: p.ausencia_encaminhamento ?? null, reposicao_prevista_em: p.reposicao_prevista_em ?? null },
    depois: { justificativa, encaminhamento, reposicao_prevista_em: prevista },
  });
  return { participante_id: Number(p.id), encaminhamento, reposicao_prevista_em: prevista };
}

// ── Conferência antes da conclusão da SESSÃO (≠ regularização individual dos ausentes) ──
interface ItemConferencia {
  codigo: string;
  mensagem: string;
  participantes?: number[];
}
async function conferirConclusao(t: Treinamento) {
  const impedimentos: ItemConferencia[] = [];
  const externo = t.modalidade === "externo";
  if (!(t.status === "em_andamento" || (externo && t.status === "planejado"))) {
    impedimentos.push({ codigo: "status", mensagem: externo ? "Treinamento externo precisa estar planejado ou em andamento." : "Inicie o treinamento antes de concluir." });
  }
  if (!String(t.titulo ?? "").trim()) impedimentos.push({ codigo: "dados", mensagem: "Informe o título do treinamento." });
  if (!t.data_inicio) impedimentos.push({ codigo: "dados", mensagem: "Informe a data prevista." });
  if (!t.responsavel_colaborador_id) impedimentos.push({ codigo: "dados", mensagem: "Defina o responsável pelo treinamento." });
  if (TIPOS_COM_DOCUMENTO.has(String(t.tipo)) && !t.lista_mestra_codigo) impedimentos.push({ codigo: "documento", mensagem: "Selecione o documento da Lista Mestra (Novo POP, Revisão de POP ou Instrução de Trabalho)." });
  const participantes = await participantesAtivos(t.id);
  const presentes = participantes.filter((p) => p.presenca_status === "presente");
  const ausentes = participantes.filter((p) => p.presenca_status === "ausente");
  const pendentes = participantes.filter((p) => p.presenca_status === "pendente");
  if (participantes.length === 0) impedimentos.push({ codigo: "turma", mensagem: "O treinamento não tem participantes." });
  else if (pendentes.length) impedimentos.push({ codigo: "presenca_pendente", mensagem: `Registre a presença/realização de todos os participantes (${pendentes.length} pendente${pendentes.length > 1 ? "s" : ""}).`, participantes: pendentes.map((p) => Number(p.id)) });
  else if (presentes.length === 0) impedimentos.push({ codigo: "sem_presentes", mensagem: "Nenhum participante realizou o treinamento — cancele em vez de concluir." });
  if (!dataEfetivaDeRealizacao(t)) impedimentos.push({ codigo: "data_realizacao", mensagem: "Informe a data de realização (treinamento que não foi iniciado no PeopleFlow não tem data a presumir)." });
  // Ausentes: justificativa e encaminhamento (reposição ou dispensa) — a pendência individual NÃO se encerra com a sessão.
  let enc: Record<string, any>[] = [];
  if (ausentes.length) {
    const { data, error } = await supabaseAdmin.from("peopleflow_dev_participantes").select("id, ausencia_justificativa, ausencia_encaminhamento, reposicao_prevista_em").in("id", ausentes.map((p) => Number(p.id)));
    if (error) erroBanco(error, "Ausências");
    enc = (data ?? []) as Record<string, any>[];
    const semJust = enc.filter((p) => !String(p.ausencia_justificativa ?? "").trim());
    const semEnc = enc.filter((p) => !p.ausencia_encaminhamento);
    if (semJust.length) impedimentos.push({ codigo: "ausencia_sem_justificativa", mensagem: `Justifique a ausência de ${semJust.length} participante${semJust.length > 1 ? "s" : ""}.`, participantes: semJust.map((p) => Number(p.id)) });
    if (semEnc.length) impedimentos.push({ codigo: "ausencia_sem_encaminhamento", mensagem: `Indique o encaminhamento (reposição ou dispensa) de ${semEnc.length} ausente${semEnc.length > 1 ? "s" : ""}.`, participantes: semEnc.map((p) => Number(p.id)) });
  }
  if (externo) {
    const { data: ev, error } = await supabaseAdmin.from("peopleflow_dev_evidencias").select("id").eq("treinamento_id", t.id).is("substituida_em", null).limit(1);
    if (error) erroBanco(error, "Evidências");
    if (!ev || ev.length === 0) impedimentos.push({ codigo: "evidencia_externo", mensagem: "Treinamento externo precisa de evidência (certificado, comprovante…) antes da conclusão." });
  }
  // O que permanece pendente DEPOIS da conclusão (informativo: não impede concluir).
  const apos: ItemConferencia[] = [];
  const comReposicao = enc.filter((p) => p.ausencia_encaminhamento === "reposicao");
  const dispensados = enc.filter((p) => p.ausencia_encaminhamento === "dispensa");
  if (comReposicao.length) {
    const comData = comReposicao.filter((p) => p.reposicao_prevista_em).length;
    apos.push({ codigo: "reposicao_pendente", mensagem: `${comReposicao.length} reposição(ões) individual(is) seguem pendentes após a conclusão (${comData} com data prevista).`, participantes: comReposicao.map((p) => Number(p.id)) });
  }
  if (dispensados.length) apos.push({ codigo: "dispensas", mensagem: `${dispensados.length} ausência(s) dispensada(s) pelo RH.`, participantes: dispensados.map((p) => Number(p.id)) });
  if (!t.homologacao) {
    const base = await baseReacao(Number(t.id));
    const elegiveis = base.elegiveis.length;
    const respondidas = base.adesoes.length;
    if (elegiveis - respondidas > 0) apos.push({ codigo: "reacao_pendente", mensagem: `${elegiveis - respondidas} avaliação(ões) de reação ainda não respondida(s); a conclusão da sessão não as encerra.` });
    if (t.exige_eficacia) {
      const semEficacia = presentes.filter((p) => !p.eficacia_resultado).length;
      if (semEficacia) apos.push({ codigo: "eficacia_pendente", mensagem: `${semEficacia} avaliação(ões) de eficácia pendente(s)${t.eficacia_prazo ? ` (prazo ${String(t.eficacia_prazo).split("-").reverse().join("/")})` : ""}.` });
    }
  }
  return { pode_concluir: impedimentos.length === 0, impedimentos, pendencias_apos: apos, resumo: { total: participantes.length, presentes: presentes.length, ausentes: ausentes.length, pendentes: pendentes.length } };
}

async function treinamentoConferir(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "id", "Treinamento"));
  await exigirConduzir(conta, t);
  return conferirConclusao(t);
}

// ── Histórico de ações do treinamento: quem fez o quê e quando ───────────
const ROTULOS_HISTORICO: Record<string, string> = {
  treinamento_planejado: "Treinamento registrado",
  treinamento_editado: "Dados do treinamento editados",
  treinamento_retificado: "Treinamento retificado após a conclusão",
  treinamento_revisao_atualizada: "Revisão do documento atualizada no início",
  treinamento_iniciado: "Realização iniciada",
  treinamento_realizacao: "Dados da realização atualizados",
  treinamento_concluido: "Sessão concluída",
  treinamento_cancelado: "Treinamento cancelado",
  participantes_incluidos: "Participantes incluídos",
  participante_retirado: "Participante retirado",
  qr_gerado: "QR de presença gerado",
  qr_encerrado: "QR de presença encerrado",
  presenca_qr: "Presença confirmada pelo próprio participante (QR)",
  presenca_manual: "Presença registrada manualmente",
  presenca_retificada: "Presença retificada pelo RH",
  ausencia_encaminhada: "Ausência justificada e encaminhada",
  ausencia_dispensada: "Ausência dispensada pelo RH",
  evidencia_anexada: "Evidência anexada",
  evidencia_substituida: "Evidência substituída",
  lista_presenca_gerada: "Lista de presença gerada",
  gravacao_configurada: "Participação por gravação configurada",
  eficacia_registrada: "Eficácia registrada",
  reposicao_criada: "Reposição programada",
  responsabilidade_transferida: "Responsabilidade transferida pelo RH",
  reacao_respondida: "Avaliação de reação respondida",
};

/** Quem realizou cada ação (RH, quem administra e a liderança que acompanha). Mostra o autor, o que foi feito e, quando couber, o participante;
 * nunca o conteúdo de justificativas nem as notas da avaliação. */
async function treinamentoHistorico(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  if (!(await podeVerTreinamento(conta, t))) throw new ErroHttp(403, "Sem acesso a este treinamento.");
  const { data: ps, error: pErro } = await supabaseAdmin.from("peopleflow_dev_participantes").select("id, colaborador_id").eq("treinamento_id", t.id);
  if (pErro) erroBanco(pErro, "Participantes");
  const { data: es, error: eErro } = await supabaseAdmin.from("peopleflow_dev_evidencias").select("id").eq("treinamento_id", t.id);
  if (eErro) erroBanco(eErro, "Evidências");
  const colunas = "ts, colaborador_id, acao, entidade, entidade_id, detalhe";
  const consultas = [supabaseAdmin.from("peopleflow_dev_auditoria").select(colunas).eq("entidade", "peopleflow_dev_treinamentos").eq("entidade_id", String(t.id))];
  if ((ps ?? []).length) consultas.push(supabaseAdmin.from("peopleflow_dev_auditoria").select(colunas).eq("entidade", "peopleflow_dev_participantes").in("entidade_id", (ps ?? []).map((p) => String(p.id))));
  if ((es ?? []).length) consultas.push(supabaseAdmin.from("peopleflow_dev_auditoria").select(colunas).eq("entidade", "peopleflow_dev_evidencias").in("entidade_id", (es ?? []).map((e) => String(e.id))));
  const linhas: Record<string, any>[] = [];
  for (const c of consultas) {
    const { data, error } = await c;
    if (error) erroBanco(error, "Histórico");
    linhas.push(...((data ?? []) as Record<string, any>[]));
  }
  const colabDoPart = new Map((ps ?? []).map((p) => [String(p.id), Number(p.colaborador_id)]));
  const nomes = await nomesDeColaboradores([...linhas.map((l) => Number(l.colaborador_id)).filter((x) => x > 0), ...colabDoPart.values(), ...linhas.flatMap((l) => [l.detalhe?.de, l.detalhe?.para]).filter((x): x is number => typeof x === "number")]);
  return linhas
    .filter((l) => ROTULOS_HISTORICO[String(l.acao)])
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    .map((l) => {
      const d = (l.detalhe ?? {}) as Record<string, any>;
      const alvo = l.entidade === "peopleflow_dev_participantes" ? nomes.get(colabDoPart.get(String(l.entidade_id)) ?? 0) : null;
      let resumo = alvo ?? "";
      if (l.acao === "presenca_manual" || l.acao === "presenca_retificada") resumo = `${alvo ?? ""} — ${d.presenca?.depois === "presente" ? "presente" : d.presenca?.depois === "ausente" ? "ausente" : "pendente"}`;
      if (l.acao === "ausencia_encaminhada") resumo = `${alvo ?? ""} — ${d.depois?.encaminhamento === "dispensa" ? "dispensa" : "reposição"}`;
      if (l.acao === "treinamento_concluido") resumo = `${d.realizaram ?? 0} presente(s) · ${d.ausentes ?? 0} ausente(s)`;
      if (l.acao === "responsabilidade_transferida") resumo = `${nomes.get(Number(d.de)) ?? "—"} → ${nomes.get(Number(d.para)) ?? "—"}`;
      if (l.acao === "participantes_incluidos" && Array.isArray(d.incluidos)) resumo = `${d.incluidos.length} participante(s)`;
      return { em: new Date(l.ts).toISOString(), rotulo: ROTULOS_HISTORICO[String(l.acao)], por: nomes.get(Number(l.colaborador_id)) ?? "—", resumo: resumo.trim() };
    });
}

// ── Pendências (RH: todas; Gestor: da sua área; responsável habilitado: dos treinamentos que administra) ──
const dia = (v: unknown): string | null => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));
async function pendenciasListar(conta: ContaDev, corpo: Corpo = {}) {
  const ehRH = conta.perfil === "RH";
  if (!ehRH && conta.perfil !== "Gestor" && conta.habilitado !== true) throw new ErroHttp(403, "Sem acesso às pendências de treinamentos.");
  const { data: ts, error } = await supabaseAdmin
    .from("peopleflow_dev_treinamentos")
    .select("id, codigo, titulo, status, homologacao, modalidade, data_inicio, data_realizacao, exige_eficacia, eficacia_prazo, responsavel_colaborador_id, instrutor_colaborador_id, solicitado_por_colaborador_id, reposicao_raiz_id");
  if (error) erroBanco(error, "Treinamentos");
  // Treinamentos de homologação/teste ficam fora das pendências, a menos que o RH peça para incluí-los (ex.: durante a homologação do fluxo).
  const incluirTeste = ehRH && corpo.incluir_teste === true;
  const oficiais = ((ts ?? []) as Record<string, any>[]).filter((t) => (incluirTeste || !t.homologacao) && t.status !== "cancelado");
  const ids = oficiais.map((t) => Number(t.id));
  const { data: ps, error: pErro } = ids.length
    ? await supabaseAdmin.from("peopleflow_dev_participantes").select("id, treinamento_id, colaborador_id, presenca_status, removido_em, ausencia_justificativa, ausencia_encaminhamento, reposicao_prevista_em, dispensado_em, eficacia_resultado").in("treinamento_id", ids)
    : { data: [], error: null };
  if (pErro) erroBanco(pErro, "Participantes");
  const partes = ((ps ?? []) as Record<string, any>[]).filter((p) => !p.removido_em);
  const porTreino = new Map<number, Record<string, any>[]>();
  for (const p of partes) porTreino.set(Number(p.treinamento_id), [...(porTreino.get(Number(p.treinamento_id)) ?? []), p]);
  const escopo = conta.perfil === "Gestor" ? await idsNoEscopo(conta) : new Set<number>();
  const eu = conta.colaboradorId;
  const visivel = (t: Record<string, any>) =>
    ehRH ||
    (conta.habilitado === true && [t.responsavel_colaborador_id, t.instrutor_colaborador_id].some((v) => v != null && Number(v) === eu)) ||
    (conta.perfil === "Gestor" &&
      (Number(t.solicitado_por_colaborador_id) === eu || escopo.has(Number(t.solicitado_por_colaborador_id)) || [t.responsavel_colaborador_id, t.instrutor_colaborador_id].some((v) => v != null && escopo.has(Number(v))) ||
        (porTreino.get(Number(t.id)) ?? []).some((p) => escopo.has(Number(p.colaborador_id)))));
  const { data: cs, error: cErro } = await supabaseAdmin.from("colaboradores").select(`id, nome, ${COLUNAS_SITUACAO}`);
  if (cErro) erroBanco(cErro, "Colaboradores");
  const nomes = new Map((cs ?? []).map((c) => [Number(c.id), String(c.nome)]));
  const ativos = new Set((cs ?? []).filter((c) => linhaAtiva(c)).map((c) => Number(c.id)));

  // 1. Reposições individuais pendentes, por cadeia (treinamento original + reposições) e colaborador.
  const cadeias = new Map<number, Record<string, any>[]>();
  for (const t of oficiais) cadeias.set(Number(t.reposicao_raiz_id ?? t.id), [...(cadeias.get(Number(t.reposicao_raiz_id ?? t.id)) ?? []), t]);
  const reposicoes: Record<string, unknown>[] = [];
  for (const trs of cadeias.values()) {
    const linhas: Record<string, any>[] = trs.flatMap((t) => (porTreino.get(Number(t.id)) ?? []).map((p) => ({ ...p, t })));
    const colaboradores = new Set(linhas.filter((l) => l.presenca_status === "ausente" && l.t.status === "concluido").map((l) => Number(l.colaborador_id)));
    for (const colab of colaboradores) {
      if (!ativos.has(colab)) continue; // quem saiu da empresa não volta para a fila (o registro da ausência permanece)
      const dele = linhas.filter((l) => Number(l.colaborador_id) === colab);
      if (dele.some((l) => l.presenca_status === "presente")) continue; // regularizado
      if (dele.some((l) => l.ausencia_encaminhamento === "dispensa")) continue; // dispensado pelo RH, com justificativa
      const ultimo = dele.filter((l) => l.presenca_status === "ausente" && l.t.status === "concluido").sort((a, b) => Number(b.treinamento_id) - Number(a.treinamento_id))[0];
      if (!visivel(ultimo.t)) continue;
      const programada = dele.find((l) => l.presenca_status === "pendente" && ["planejado", "em_andamento"].includes(String(l.t.status)));
      reposicoes.push({
        tipo: "reposicao",
        teste: Boolean(ultimo.t.homologacao),
        situacao: programada ? "programada" : ultimo.ausencia_encaminhamento === "reposicao" ? "a_programar" : "sem_encaminhamento",
        treinamento_id: Number(ultimo.t.id), codigo: ultimo.t.codigo, titulo: ultimo.t.titulo, data_realizacao: dia(ultimo.t.data_realizacao ?? ultimo.t.data_inicio),
        colaborador_id: colab, nome: nomes.get(colab) ?? "", participante_id: Number(ultimo.id), justificativa: ultimo.ausencia_justificativa ?? "", prevista_em: dia(ultimo.reposicao_prevista_em),
        reposicao: programada ? { id: Number(programada.t.id), codigo: programada.t.codigo, data_inicio: dia(programada.t.data_inicio), status: programada.t.status } : null,
        responsavel_id: ultimo.t.responsavel_colaborador_id != null ? Number(ultimo.t.responsavel_colaborador_id) : null,
      });
    }
  }
  reposicoes.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));

  // 2. Eficácia pendente (treinamentos concluídos que a exigem).
  const hoje = hojeSaoPaulo();
  const eficacia = oficiais
    .filter((t) => t.status === "concluido" && t.exige_eficacia && visivel(t))
    .map((t) => ({ t, faltam: (porTreino.get(Number(t.id)) ?? []).filter((p) => p.presenca_status === "presente" && !p.eficacia_resultado).length }))
    .filter((x) => x.faltam > 0)
    .map(({ t, faltam }) => ({ tipo: "eficacia_pendente", teste: Boolean(t.homologacao), treinamento_id: Number(t.id), codigo: t.codigo, titulo: t.titulo, faltam, prazo: dia(t.eficacia_prazo), vencida: Boolean(t.eficacia_prazo && String(t.eficacia_prazo) < hoje) }));

  // 3. Só RH: treinamentos pendentes sem responsável habilitado e registros incompletos/inconsistentes.
  let semResponsavel: Record<string, unknown>[] = [];
  let inconsistencias: Record<string, unknown>[] = [];
  if (ehRH) {
    const pendentes = oficiais.filter((t) => ["solicitado", "planejado", "em_andamento"].includes(String(t.status)));
    const habilitados = await podemSerResponsaveis([...new Set(pendentes.map((t) => Number(t.responsavel_colaborador_id)).filter((n) => n > 0))]);
    semResponsavel = pendentes
      .map((t) => {
        const resp = t.responsavel_colaborador_id != null ? Number(t.responsavel_colaborador_id) : null;
        const motivo = !resp ? "sem_responsavel" : !ativos.has(resp) ? "responsavel_desligado" : !habilitados.has(resp) ? "responsavel_sem_habilitacao" : null;
        return motivo ? { tipo: "sem_responsavel_habilitado", teste: Boolean(t.homologacao), motivo, treinamento_id: Number(t.id), codigo: t.codigo, titulo: t.titulo, status: t.status, responsavel: resp ? (nomes.get(resp) ?? "") : null, responsavel_id: resp } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const concluidos = oficiais.filter((t) => t.status === "concluido");
    const { data: evs, error: eErro } = concluidos.length ? await supabaseAdmin.from("peopleflow_dev_evidencias").select("treinamento_id, tipo, storage_path, substituida_em").in("treinamento_id", concluidos.map((t) => Number(t.id))) : { data: [], error: null };
    if (eErro) erroBanco(eErro, "Evidências");
    const vigentes = ((evs ?? []) as Record<string, any>[]).filter((e) => !e.substituida_em);
    for (const t of concluidos) {
      const doTreino = vigentes.filter((e) => Number(e.treinamento_id) === Number(t.id));
      if (t.modalidade === "externo" && doTreino.length === 0) inconsistencias.push({ tipo: "inconsistencia", teste: Boolean(t.homologacao), motivo: "externo_sem_evidencia", treinamento_id: Number(t.id), codigo: t.codigo, titulo: t.titulo, mensagem: "Treinamento externo concluído sem evidência anexada." });
      if (t.modalidade === "interno" && !doTreino.some((e) => ehListaDoSistema(String(e.storage_path)))) inconsistencias.push({ tipo: "inconsistencia", teste: Boolean(t.homologacao), motivo: "interno_sem_lista", treinamento_id: Number(t.id), codigo: t.codigo, titulo: t.titulo, mensagem: "Treinamento interno concluído sem Lista de Presença vigente." });
    }
  }
  const dados = { reposicoes, eficacia, sem_responsavel: semResponsavel, inconsistencias };
  return dados;
}

// ── Página /participar/:token (qualquer conta do PeopleFlow; sem sessão do módulo) ──
async function identificarParticipante(req: VercelRequest) {
  const raw = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  const token = raw?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new ErroHttp(401, "Entre com seu e-mail corporativo para confirmar a presença.");
  const { data: u, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !u.user?.email) throw new ErroHttp(401, "Sessão inválida ou expirada.");
  const { data: acesso } = await supabaseAdmin.from("module_access").select("modulo").eq("user_id", u.user.id).eq("modulo", "peopleflow").maybeSingle();
  if (!acesso) throw new ErroHttp(403, "Conta sem acesso ao PeopleFlow. Procure o responsável pelo treinamento.");
  const email = u.user.email.toLowerCase();
  const { data: colabs, error: cErro } = await supabaseAdmin.from("colaboradores").select(`id, nome, ${COLUNAS_SITUACAO}`);
  if (cErro) erroBanco(cErro, "Colaborador");
  const meus = (colabs ?? []).filter((c) => linhaAtiva(c) && emailOf(c.nome as string) === email);
  if (meus.length !== 1) throw new ErroHttp(409, "Não foi possível identificar você no cadastro. Procure o responsável pelo treinamento.");
  return { userId: u.user.id, colaboradorId: Number(meus[0].id), primeiroNome: String(meus[0].nome).split(" ")[0] };
}

async function treinamentoPorToken(tokenQr: string) {
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(tokenQr)) throw new ErroHttp(404, "QR inválido ou expirado.");
  const { data: qr, error } = await supabaseAdmin.from("peopleflow_dev_qr_tokens").select("treinamento_id, ativo, expira_em").eq("token", tokenQr).maybeSingle();
  if (error) erroBanco(error, "QR");
  if (!qr || !qr.ativo || new Date(qr.expira_em as string).getTime() < Date.now()) throw new ErroHttp(404, "QR inválido ou expirado. Procure o responsável pelo treinamento.");
  const t = await lerTreinamento(Number(qr.treinamento_id));
  if (t.status !== "em_andamento") throw new ErroHttp(404, "Este treinamento não está com presença aberta.");
  return t;
}

// ── Participação por gravação ───────────────────────────────────────────
// O responsável disponibiliza o link da gravação (SharePoint) e habilita "Permitir participação por gravação". Participantes da turma
// (presentes, ausentes ou, no treinamento só gravado, todos) assistem e CONFIRMAM pelo PeopleFlow, autenticados, com a declaração
// "Declaro que assisti ao treinamento": presença "presente" + método "gravacao" + data/hora + usuário. É uma declaração do colaborador,
// não comprovação técnica de visualização integral. Só enquanto o treinamento está em andamento: o RH decide quando concluir.
// Sem QR e sem registro manual "por gravação" pelo RH.
function colunaGravacaoAusente(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42703" || error.code === "PGRST204" || /permite_gravacao|gravacao_url/i.test(error.message ?? "")));
}

interface ConfigGravacao {
  permite_gravacao: boolean;
  gravacao_url: string | null;
}

/** null = recurso ainda não ativado (migration não aplicada): nada quebra, a gravação simplesmente não existe. */
async function lerGravacao(treinamentoId: number): Promise<ConfigGravacao | null> {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select("permite_gravacao, gravacao_url").eq("id", treinamentoId).maybeSingle();
  if (error) {
    if (colunaGravacaoAusente(error)) return null;
    erroBanco(error, "Gravação");
  }
  return data ? { permite_gravacao: Boolean(data.permite_gravacao), gravacao_url: (data.gravacao_url as string | null) ?? null } : null;
}

/** Habilita/desabilita a participação por gravação e define/limpa o link (quem conduz: RH, responsável designado ou gestor da gestão). */
async function atualizarGravacao(conta: ContaDev, t: Treinamento, mudanca: { permitir?: boolean; url?: unknown }) {
  const concluido = t.status === "concluido";
  if (!["planejado", "em_andamento"].includes(t.status) && !concluido) throw new ErroHttp(422, "A gravação não pode ser configurada em treinamento cancelado.");
  // Depois da conclusão a confirmação por gravação está encerrada: só o RH corrige o LINK (ex.: o vídeo mudou de pasta), para que os
  // participantes continuem acessando a gravação; habilitar/desabilitar não muda mais.
  if (concluido && conta.perfil !== "RH") throw new ErroHttp(403, "Depois da conclusão, somente o RH atualiza o link da gravação.");
  if (concluido && mudanca.permitir !== undefined) throw new ErroHttp(422, "Depois da conclusão não é possível habilitar nem desabilitar a participação por gravação (a confirmação está encerrada).");
  const antes = await lerGravacao(t.id);
  if (!antes) throw new ErroHttp(422, "A participação por gravação ainda não está disponível (recurso não ativado).");
  let url: string | null = antes.gravacao_url;
  if (mudanca.url !== undefined) {
    const informado = typeof mudanca.url === "string" ? mudanca.url.trim() : mudanca.url;
    if (informado === null || informado === "") url = null;
    else {
      const valido = validarLinkGravacao(informado);
      if (!valido) throw new ErroHttp(422, "Informe o link da gravação no SharePoint (https://…sharepoint.com/…).");
      url = valido;
    }
  }
  const permite = mudanca.permitir === undefined ? antes.permite_gravacao : mudanca.permitir;
  if (permite === antes.permite_gravacao && url === antes.gravacao_url) return antes;
  const { error } = await supabaseAdmin
    .from("peopleflow_dev_treinamentos")
    .update({ permite_gravacao: permite, gravacao_url: url, gravacao_definida_em: new Date().toISOString(), gravacao_definida_por: conta.userId, updated_by: conta.userId })
    .eq("id", t.id);
  if (error) erroBanco(error, "Gravação");
  await auditar(conta, "gravacao_configurada", "peopleflow_dev_treinamentos", String(t.id), { antes, depois: { permite_gravacao: permite, gravacao_url: url } });
  return { permite_gravacao: permite, gravacao_url: url } as ConfigGravacao;
}

async function gravacaoDefinir(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  await exigirConduzir(conta, t);
  const permitir = typeof corpo.permitir === "boolean" ? corpo.permitir : undefined;
  return atualizarGravacao(conta, t, { permitir, url: "url" in corpo ? corpo.url : undefined });
}

/** O PRÓPRIO colaborador confirma a participação assistindo à gravação (qualquer conta do PeopleFlow, sem sessão do módulo). Uma vez só. */
async function gravacaoConfirmar(req: VercelRequest) {
  const corpo = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {})) as Corpo;
  const quem = await identificarParticipante(req);
  const codigo = texto(corpo, "codigo", { obrigatorio: true, max: 40, rotulo: "o treinamento" });
  if (corpo.declaro !== true) throw new ErroHttp(422, `Marque a declaração "${DECLARACAO_GRAVACAO}" para confirmar a participação.`);
  const { data: t, error: tErro } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select(COLS_TRE).eq("codigo", codigo).maybeSingle();
  if (tErro) erroBanco(tErro, "Treinamento");
  if (!t) throw new ErroHttp(404, "Treinamento não encontrado.");
  const cfg = await lerGravacao(Number(t.id));
  if (!cfg) throw new ErroHttp(422, "A participação por gravação ainda não está disponível.");
  if (!cfg.permite_gravacao) throw new ErroHttp(422, "Este treinamento não permite participação por gravação.");
  if (!cfg.gravacao_url) throw new ErroHttp(422, "A gravação ainda não foi disponibilizada pelo responsável.");
  if (t.status !== "em_andamento") throw new ErroHttp(422, t.status === "concluido" ? "O treinamento já foi concluído pelo RH: a confirmação por gravação está encerrada." : "A confirmação por gravação abre quando o treinamento é iniciado.");
  const { data: p, error: pErro } = await supabaseAdmin
    .from("peopleflow_dev_participantes")
    .select("id, presenca_status, presenca_metodo, presenca_motivo, removido_em")
    .eq("treinamento_id", t.id)
    .eq("colaborador_id", quem.colaboradorId)
    .maybeSingle();
  if (pErro) erroBanco(pErro, "Participante");
  if (!p || p.removido_em) throw new ErroHttp(403, "Você não consta na turma deste treinamento.");
  if (p.presenca_status === "presente") throw new ErroHttp(409, "Sua participação neste treinamento já está confirmada.");
  const agora = new Date().toISOString();
  // Condicional: duas confirmações simultâneas não duplicam (a segunda não encontra mais "não presente").
  const { data: atualizado, error: uErro } = await supabaseAdmin
    .from("peopleflow_dev_participantes")
    .update({ presenca_status: "presente", presenca_metodo: "gravacao", presenca_em: agora, presenca_por: quem.userId, presenca_motivo: null, updated_by: quem.userId })
    .eq("id", p.id)
    .neq("presenca_status", "presente")
    .select("id")
    .maybeSingle();
  if (uErro) erroBanco(uErro, "Presença");
  if (!atualizado) throw new ErroHttp(409, "Sua participação neste treinamento já está confirmada.");
  await supabaseAdmin.from("peopleflow_dev_auditoria").insert({
    user_id: quem.userId, colaborador_id: quem.colaboradorId, acao: "presenca_gravacao", entidade: "peopleflow_dev_participantes", entidade_id: String(p.id),
    detalhe: { treinamento_id: t.id, metodo: "gravacao", declaracao: DECLARACAO_GRAVACAO, status_anterior: p.presenca_status, metodo_anterior: p.presenca_metodo, motivo_anterior: p.presenca_motivo, homologacao: Boolean(t.homologacao) },
  });
  // A Avaliação de Reação segue as mesmas regras (presença confirmada, oficial, a partir da ativação, prazo de 7 dias).
  return { confirmada_em: agora, metodo: "gravacao", ...(await estadoReacao(t, { id: p.id as number, presenca_status: "presente", presenca_em: agora }, quem.colaboradorId)) };
}

// ── Avaliação de Reação ─────────────────────────────────────────────────
// Padrão único para todo treinamento OFICIAL: disponível ao participante com presença confirmada (qualquer método), a partir da ativação do
// recurso (peopleflow_dev_reacao_config.ativa_desde — sem envio retroativo), com prazo de 7 dias corridos após a confirmação da presença
// (Pendente, Vencida ou Respondida; vencida ainda pode ser respondida). Não é consultada ao concluir: a conclusão independe das respostas.
//
// Privacidade: o CONTROLE DE ADESÃO (quem respondeu e quando) fica em peopleflow_dev_avaliacoes_reacao; as NOTAS ficam em
// peopleflow_dev_reacao_respostas, SEM colaborador, SEM participação e SEM data/hora. Nenhuma ação devolve nota ligada a uma pessoa e as
// médias só saem com o mínimo de respostas.
function tabelaReacaoAusente(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message ?? "")));
}

/** null = recurso ainda não ativado (migration não aplicada): nada é elegível e nada quebra. */
async function ativaDesdeReacao(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_reacao_config").select("ativa_desde").eq("id", 1).maybeSingle();
  if (error) {
    if (tabelaReacaoAusente(error)) return null;
    erroBanco(error, "Avaliação de reação");
  }
  return (data?.ativa_desde as string | undefined) ?? null;
}

interface RespostaDoColaborador {
  respondido_em: string;
  prazo_em: string;
}

/** participante_id → quando respondeu e prazo vigente na época, das avaliações do colaborador. */
async function respondidasDoColaborador(colaboradorId: number): Promise<Map<number, RespostaDoColaborador>> {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_avaliacoes_reacao").select("participante_id, respondido_em, prazo_em").eq("colaborador_id", colaboradorId);
  if (error) {
    if (tabelaReacaoAusente(error)) return new Map();
    erroBanco(error, "Avaliação de reação");
  }
  return new Map((data ?? []).map((r) => [Number(r.participante_id), { respondido_em: String(r.respondido_em), prazo_em: String(r.prazo_em) }]));
}

interface EstadoDaAvaliacao {
  avaliacao: SituacaoReacao | null;
  /** Último dia para responder (AAAA-MM-DD, Brasília). */
  avaliacao_prazo: string | null;
  avaliacao_em: string | null;
}

/** Estado da avaliação de UMA participação para a própria pessoa (Meus treinamentos e página de presença). */
function estadoDaAvaliacao(t: Treinamento, meu: { presenca_status: string; presenca_em: string | null }, resp: RespostaDoColaborador | undefined, ativaDesde: string | null): EstadoDaAvaliacao {
  const nada = { avaliacao: null, avaliacao_prazo: null, avaliacao_em: null };
  if (!ativaDesde) return nada;
  if (resp) return { avaliacao: "respondida", avaliacao_prazo: diaEmBrasilia(new Date(resp.prazo_em)), avaliacao_em: resp.respondido_em };
  if (!elegivelParaReacao(meu, t as { homologacao?: boolean; status: string }, ativaDesde) || !meu.presenca_em) return nada;
  const s = situacaoDaReacao({ presenca_em: meu.presenca_em });
  return { avaliacao: s.situacao, avaliacao_prazo: s.prazo, avaliacao_em: null };
}

async function estadoReacao(t: Treinamento, p: { id: number; presenca_status: string; presenca_em: string | null }, colaboradorId: number): Promise<EstadoDaAvaliacao> {
  const ativaDesde = await ativaDesdeReacao();
  if (!ativaDesde) return estadoDaAvaliacao(t, p, undefined, null);
  return estadoDaAvaliacao(t, p, (await respondidasDoColaborador(colaboradorId)).get(Number(p.id)), ativaDesde);
}

/** O próprio colaborador responde (qualquer conta do PeopleFlow, sem sessão do módulo): identidade pela sessão, nunca pelo corpo. Uma vez só. */
async function reacaoResponder(req: VercelRequest) {
  const corpo = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {})) as Corpo;
  const quem = await identificarParticipante(req);
  const codigo = texto(corpo, "codigo", { obrigatorio: true, max: 40, rotulo: "o treinamento" });
  const respostas = validarRespostas(corpo.respostas);
  if (!respostas) throw new ErroHttp(422, "Responda as 5 perguntas com notas de 1 a 5.");
  const { data: t, error: tErro } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select(COLS_TRE).eq("codigo", codigo).maybeSingle();
  if (tErro) erroBanco(tErro, "Treinamento");
  if (!t) throw new ErroHttp(404, "Treinamento não encontrado.");
  const { data: p, error: pErro } = await supabaseAdmin
    .from("peopleflow_dev_participantes")
    .select("id, presenca_status, presenca_em, removido_em")
    .eq("treinamento_id", t.id)
    .eq("colaborador_id", quem.colaboradorId)
    .maybeSingle();
  if (pErro) erroBanco(pErro, "Participante");
  if (!p || p.removido_em) throw new ErroHttp(403, "Você não consta na turma deste treinamento.");
  const ativaDesde = await ativaDesdeReacao();
  if (!ativaDesde) throw new ErroHttp(422, "A avaliação de reação ainda não está disponível.");
  if (!elegivelParaReacao({ presenca_status: p.presenca_status as string, presenca_em: p.presenca_em as string | null }, t as { homologacao?: boolean; status: string }, ativaDesde)) {
    throw new ErroHttp(422, "A avaliação está disponível para quem participou (presença confirmada) de treinamentos oficiais, a partir da ativação do recurso.");
  }
  // Vencida ainda pode ser respondida: o prazo só classifica (no prazo × fora do prazo), nunca bloqueia.
  const prazoEm = fimDoPrazoDaReacao(p.presenca_em as string);
  // Adesão (com identificação) e notas (sem identificação) entram juntas, na mesma transação, pela função do banco.
  const { data: respondidaEm, error: iErro } = await supabaseAdmin.rpc("peopleflow_dev_reacao_registrar", {
    p_participante_id: p.id,
    p_treinamento_id: t.id,
    p_colaborador_id: quem.colaboradorId,
    p_usuario: quem.userId,
    p_versao: VERSAO_FORMULARIO,
    p_presenca_em: p.presenca_em,
    p_prazo_em: prazoEm.toISOString(),
    p_q1: respostas[0], p_q2: respostas[1], p_q3: respostas[2], p_q4: respostas[3], p_q5: respostas[4],
  });
  if (iErro) {
    if (iErro.code === "23505") throw new ErroHttp(409, "Você já respondeu a avaliação deste treinamento.");
    erroBanco(iErro, "Avaliação de reação");
  }
  // A auditoria registra QUE respondeu (e se foi no prazo), nunca as notas.
  await supabaseAdmin.from("peopleflow_dev_auditoria").insert({
    user_id: quem.userId, colaborador_id: quem.colaboradorId, acao: "reacao_respondida", entidade: "peopleflow_dev_avaliacoes_reacao", entidade_id: String(p.id),
    detalhe: { treinamento_id: t.id, participante_id: p.id, versao_formulario: VERSAO_FORMULARIO, no_prazo: Date.now() <= prazoEm.getTime() },
  });
  return { respondida_em: respondidaEm };
}

/** Participações elegíveis (de treinamentos oficiais), controle de adesão e notas anônimas — base dos indicadores do RH. */
async function baseReacao(somenteTreinamento?: number) {
  const vazio = { ativaDesde: null as string | null, treinamentos: [] as Treinamento[], elegiveis: [] as Record<string, any>[], adesoes: [] as Record<string, any>[], notas: [] as Record<string, any>[] };
  const ativaDesde = await ativaDesdeReacao();
  if (!ativaDesde) return vazio;
  let q = supabaseAdmin.from("peopleflow_dev_treinamentos").select("id, codigo, titulo, status, homologacao, data_inicio, data_realizacao").eq("homologacao", false);
  if (somenteTreinamento) q = q.eq("id", somenteTreinamento);
  const { data: ts, error } = await q;
  if (error) erroBanco(error, "Treinamentos");
  const treinamentos = ((ts ?? []) as Treinamento[]).filter((t) => ["em_andamento", "concluido"].includes(t.status));
  if (treinamentos.length === 0) return { ...vazio, ativaDesde, treinamentos };
  const ids = treinamentos.map((t) => Number(t.id));
  const { data: ps, error: pErro } = await supabaseAdmin.from("peopleflow_dev_participantes").select("id, treinamento_id, colaborador_id, presenca_status, presenca_em, removido_em").in("treinamento_id", ids);
  if (pErro) erroBanco(pErro, "Participantes");
  const porId = new Map(treinamentos.map((t) => [Number(t.id), t]));
  const elegiveis = (ps ?? []).filter((p) => elegivelParaReacao({ presenca_status: p.presenca_status as string, presenca_em: p.presenca_em as string | null, removido_em: p.removido_em as string | null }, porId.get(Number(p.treinamento_id)) as { homologacao?: boolean; status: string }, ativaDesde)) as Record<string, any>[];
  const { data: ad, error: aErro } = await supabaseAdmin.from("peopleflow_dev_avaliacoes_reacao").select("participante_id, treinamento_id, respondido_em, prazo_em").in("treinamento_id", ids);
  if (aErro) erroBanco(aErro, "Avaliações de reação");
  // Notas: só treinamento e as 5 notas — não há como ligá-las a uma pessoa.
  const { data: ns, error: nErro } = await supabaseAdmin.from("peopleflow_dev_reacao_respostas").select("treinamento_id, q1, q2, q3, q4, q5").in("treinamento_id", ids);
  if (nErro) erroBanco(nErro, "Notas da avaliação de reação");
  return { ativaDesde, treinamentos, elegiveis, adesoes: (ad ?? []) as Record<string, any>[], notas: (ns ?? []) as Record<string, any>[] };
}
const arrayDeNotas = (r: Record<string, any>) => [r.q1, r.q2, r.q3, r.q4, r.q5].map(Number);

/** RH: adesão geral e por treinamento (respondidos, pendentes, vencidas, taxa) e médias CONSOLIDADAS (com mínimo de respostas). Teste/homologação fora. */
async function reacaoResumo(conta: ContaDev) {
  exigirRH(conta);
  const { ativaDesde, treinamentos, elegiveis, adesoes, notas } = await baseReacao();
  const respondidosIds = new Set(adesoes.map((a) => Number(a.participante_id)));
  const agora = new Date();
  const vencidas = (lista: Record<string, any>[]) => lista.filter((p) => !respondidosIds.has(Number(p.id)) && situacaoDaReacao({ presenca_em: p.presenca_em }, agora).situacao === "vencida").length;
  const dentro = (lista: Record<string, any>[]) => lista.filter((p) => respondidosIds.has(Number(p.id))).length;
  const lista = treinamentos
    .map((t) => {
      const el = elegiveis.filter((p) => Number(p.treinamento_id) === Number(t.id));
      const ns = notas.filter((n) => Number(n.treinamento_id) === Number(t.id)).map(arrayDeNotas);
      return { id: Number(t.id), codigo: t.codigo, titulo: t.titulo, status: t.status, data: (t.data_realizacao ?? t.data_inicio) as string | null, ...indicadorAdesao(el.length, dentro(el)), vencidas: vencidas(el), medias: mediasConsolidadas(ns) };
    })
    .filter((x) => x.elegiveis > 0)
    .sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")) || b.id - a.id);
  return {
    ativa_desde: ativaDesde,
    prazo_dias: 7,
    minimo_respostas_para_medias: MINIMO_RESPOSTAS_PARA_MEDIAS,
    questoes: QUESTOES,
    geral: { ...indicadorAdesao(elegiveis.length, dentro(elegiveis)), vencidas: vencidas(elegiveis), medias: mediasConsolidadas(notas.map(arrayDeNotas)) },
    treinamentos: lista,
  };
}

/** RH: controle de adesão de UM treinamento (quem respondeu, quem está pendente ou vencido, prazo) + médias consolidadas. NUNCA notas por pessoa. */
/** Status de resposta e resultados permitidos: RH; quem administra o treinamento; o Gestor da área (somente acompanhamento). */
async function reacaoDetalhe(conta: ContaDev, corpo: Corpo) {
  const tid = idObrigatorio(corpo, "treinamento_id", "Treinamento");
  const tr = await lerTreinamento(tid);
  if (!ehAdministrador(conta, tr) && !(await gestorAcompanha(conta, tr))) throw new ErroHttp(403, "Sem acesso à avaliação de reação deste treinamento.");
  const { ativaDesde, treinamentos, elegiveis, adesoes, notas } = await baseReacao(tid);
  const t = treinamentos[0];
  const base = { ativa_desde: ativaDesde, prazo_dias: 7, minimo_respostas_para_medias: MINIMO_RESPOSTAS_PARA_MEDIAS, questoes: QUESTOES };
  if (!t) return { ...base, treinamento: null, ...indicadorAdesao(0, 0), vencidas: 0, medias: null, participantes: [] };
  const resp = new Map(adesoes.map((a) => [Number(a.participante_id), a]));
  const ids = [...new Set(elegiveis.map((p) => Number(p.colaborador_id)))];
  const { data: pessoas, error } = ids.length ? await supabaseAdmin.from("colaboradores").select("id, nome, cargo, departamento").in("id", ids) : { data: [], error: null };
  if (error) erroBanco(error, "Colaboradores");
  const pessoa = new Map((pessoas ?? []).map((c) => [Number(c.id), c]));
  const agora = new Date();
  const ordem = { vencida: 0, pendente: 1, respondida: 2 } as const;
  const participantes = elegiveis
    .map((p) => {
      const r = resp.get(Number(p.id));
      const c = pessoa.get(Number(p.colaborador_id));
      const s = situacaoDaReacao({ presenca_em: p.presenca_em, respondido_em: r ? String(r.respondido_em) : null }, agora);
      return {
        participante_id: Number(p.id), colaborador_id: Number(p.colaborador_id), nome: String(c?.nome ?? ""), cargo: String(c?.cargo ?? ""), departamento: String(c?.departamento ?? ""),
        situacao: s.situacao, prazo: s.prazo, respondido_em: r ? String(r.respondido_em) : null,
        fora_do_prazo: r ? new Date(r.respondido_em).getTime() > new Date(r.prazo_em).getTime() : false,
      };
    })
    .sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.nome.localeCompare(b.nome, "pt-BR"));
  const respondidos = participantes.filter((x) => x.situacao === "respondida").length;
  const ns = notas.map(arrayDeNotas);
  return { ...base, treinamento: { id: Number(t.id), codigo: t.codigo, titulo: t.titulo, status: t.status }, ...indicadorAdesao(participantes.length, respondidos), vencidas: participantes.filter((x) => x.situacao === "vencida").length, medias: mediasConsolidadas(ns), participantes };
}

async function presencaViaQr(acao: "presenca_info" | "presenca_confirmar", req: VercelRequest) {
  const corpo = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {})) as Corpo;
  const tokenQr = texto(corpo, "token", { obrigatorio: true, max: 100, rotulo: "o código" });
  const quem = await identificarParticipante(req);
  const t = await treinamentoPorToken(tokenQr);
  const { data: p, error } = await supabaseAdmin
    .from("peopleflow_dev_participantes")
    .select("id, presenca_status, presenca_em, removido_em")
    .eq("treinamento_id", t.id)
    .eq("colaborador_id", quem.colaboradorId)
    .maybeSingle();
  if (error) erroBanco(error, "Participante");
  // Só o necessário para a pessoa: nada de ids internos nem dados de outros participantes.
  const info = { codigo: t.codigo as string, titulo: t.titulo, documento: t.lista_mestra_codigo ? `${t.lista_mestra_codigo} rev. ${t.lista_mestra_revisao}` : null, data: t.data_inicio, primeiro_nome: quem.primeiroNome, homologacao: Boolean(t.homologacao) };
  if (!p || p.removido_em) return { ...info, situacao: "nao_inscrito" };
  if (p.presenca_status === "presente") return { ...info, situacao: "confirmada", confirmada_em: p.presenca_em, ...(await estadoReacao(t, { id: p.id as number, presenca_status: "presente", presenca_em: p.presenca_em as string | null }, quem.colaboradorId)) };
  if (acao === "presenca_info") return { ...info, situacao: "pendente" };
  const agora = new Date().toISOString();
  const { data: atualizado, error: uErro } = await supabaseAdmin
    .from("peopleflow_dev_participantes")
    .update({ presenca_status: "presente", presenca_metodo: "qr", presenca_em: agora, presenca_por: quem.userId, presenca_motivo: null, updated_by: quem.userId })
    .eq("id", p.id)
    .neq("presenca_status", "presente")
    .select("id")
    .maybeSingle();
  if (uErro) erroBanco(uErro, "Presença");
  if (atualizado) {
    await supabaseAdmin.from("peopleflow_dev_auditoria").insert({ user_id: quem.userId, colaborador_id: quem.colaboradorId, acao: "presenca_qr", entidade: "peopleflow_dev_participantes", entidade_id: String(p.id), detalhe: { treinamento_id: t.id } });
  }
  return { ...info, situacao: "confirmada", confirmada_em: agora, ...(await estadoReacao(t, { id: p.id as number, presenca_status: "presente", presenca_em: agora }, quem.colaboradorId)) };
}

/** Colaborador consulta o PRÓPRIO histórico (qualquer conta do PeopleFlow, sem sessão do módulo). Só concluídos e agendados oficiais
 * em que a pessoa está inscrita — nada de outros participantes, eficácia, justificativas ou treinamentos de homologação/teste. */
async function historicoDoParticipante(req: VercelRequest) {
  const quem = await identificarParticipante(req);
  const { data: parts, error } = await supabaseAdmin
    .from("peopleflow_dev_participantes")
    .select("id, treinamento_id, presenca_status, presenca_em, removido_em")
    .eq("colaborador_id", quem.colaboradorId);
  if (error) erroBanco(error, "Participações");
  const meusRegistros = new Map((parts ?? []).filter((p) => !p.removido_em).map((p) => [Number(p.treinamento_id), p]));
  const minhas = new Map([...meusRegistros].map(([id, p]) => [id, p.presenca_status as string]));
  const ativaDesde = await ativaDesdeReacao();
  const respondidas = ativaDesde ? await respondidasDoColaborador(quem.colaboradorId) : new Map<number, RespostaDoColaborador>();
  if (minhas.size === 0) return { primeiro_nome: quem.primeiroNome, treinamentos: [] };
  const { data: ts, error: tErro } = await supabaseAdmin
    .from("peopleflow_dev_treinamentos")
    .select("id, codigo, titulo, status, data_inicio, data_realizacao, carga_horaria_min, carga_realizada_min, lista_mestra_codigo, lista_mestra_revisao, homologacao")
    .in("id", [...minhas.keys()]);
  if (tErro) erroBanco(tErro, "Treinamentos");
  // Gravação (separada: sem a migration as colunas não existem e nada quebra)
  const { data: gs, error: gErro } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select("id, permite_gravacao, gravacao_url").in("id", [...minhas.keys()]);
  if (gErro && !colunaGravacaoAusente(gErro)) erroBanco(gErro, "Gravação");
  const gravacaoDe = new Map((gErro ? [] : (gs ?? [])).map((g) => [Number(g.id), { permite_gravacao: Boolean(g.permite_gravacao), gravacao_url: (g.gravacao_url as string | null) ?? null }]));
  // Treinamento de teste/homologação continua fora do histórico — exceto enquanto houver CONFIRMAÇÃO POR GRAVAÇÃO em aberto para esta pessoa
  // (para o RH validar o fluxo; vem marcado como teste e não entra em indicadores nem na avaliação).
  const confirmavel = (t: Record<string, any>) => { const g = gravacaoDe.get(Number(t.id)); return Boolean(g) && podeConfirmarPorGravacao({ ...g!, status: t.status as string }, minhas.get(Number(t.id)) ?? "pendente"); };
  const treinamentos = (ts ?? [])
    .filter((t) => ["planejado", "em_andamento", "concluido"].includes(t.status as string) && (!t.homologacao || confirmavel(t)))
    .map((t) => {
      const presenca = minhas.get(Number(t.id));
      const situacao = t.status !== "concluido" ? "agendado" : presenca === "presente" ? "realizado" : "ausente";
      return {
        codigo: t.codigo,
        titulo: t.titulo,
        documento: t.lista_mestra_codigo ? `${t.lista_mestra_codigo} rev. ${t.lista_mestra_revisao}` : null,
        data: (t.data_realizacao ?? t.data_inicio) as string | null,
        carga_min: (t.carga_realizada_min ?? t.carga_horaria_min) as number | null,
        situacao,
        // só a presença da PRÓPRIA pessoa (sem método, sem eficácia nem observações)
        presenca: (presenca ?? "pendente") as string,
        teste: Boolean(t.homologacao),
        // Participação por gravação: link só para quem está na turma; confirmar só com o treinamento em andamento e a pessoa ainda sem presença
        gravacao: (() => {
          const g = gravacaoDe.get(Number(t.id));
          if (!g || !g.permite_gravacao || !g.gravacao_url || !["em_andamento", "concluido"].includes(t.status as string)) return null;
          return { link: g.gravacao_url, pode_confirmar: podeConfirmarPorGravacao({ ...g, status: t.status as string }, presenca ?? "pendente") };
        })(),
        // Avaliação de reação: pendente | vencida (ainda pode responder) | respondida | não se aplica — com o prazo (7 dias após a presença)
        ...(() => {
          const meu = meusRegistros.get(Number(t.id));
          if (!meu) return { avaliacao: null, avaliacao_prazo: null, avaliacao_em: null };
          return estadoDaAvaliacao(t, { presenca_status: meu.presenca_status as string, presenca_em: meu.presenca_em as string | null }, respondidas.get(Number(meu.id)), ativaDesde);
        })(),
      };
    })
    .sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")));
  return { primeiro_nome: quem.primeiroNome, treinamentos };
}

export function ehAcaoDePresencaQr(acao: string): acao is "presenca_info" | "presenca_confirmar" | "meu_historico" | "reacao_responder" | "gravacao_confirmar" {
  return acao === "presenca_info" || acao === "presenca_confirmar" || acao === "meu_historico" || acao === "reacao_responder" || acao === "gravacao_confirmar";
}

export async function executarPresencaQr(acao: "presenca_info" | "presenca_confirmar" | "meu_historico" | "reacao_responder" | "gravacao_confirmar", req: VercelRequest, res: VercelResponse) {
  try {
    res.status(200).json({ ok: true, dados: acao === "meu_historico" ? await historicoDoParticipante(req) : acao === "reacao_responder" ? await reacaoResponder(req) : acao === "gravacao_confirmar" ? await gravacaoConfirmar(req) : await presencaViaQr(acao, req) });
  } catch (err) {
    if (err instanceof ErroHttp) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
}


// ══ Descrição de Cargo × Catálogo de Habilidades Técnicas ═══════════════
// A DC REFERENCIA o catálogo existente (peopleflow_dev_habilidades) pela mesma
// estrutura de "Por cargo": requisito tipo habilidade (peopleflow_dev_cargo_requisitos) — seção
// "Habilidades e competências". Obrigatória × Recomendada é característica da RELAÇÃO cargo ×
// habilidade (obrigatorio), definida pelo RH; nova seleção nasce Recomendada.
//   • RH seleciona → vigente (é quem valida).   • Gestor seleciona → sugerido (RH valida).
//   • Gestor sugere habilidade inexistente → sugerido com descricao_sugerida (fora do
//     catálogo); só vira habilidade oficial quando o RH valida. Não validar = inativo
//     com motivo (decisão preservada). Nada disso cria gap: habilidade não é avaliada
//     nesta etapa. O texto legado da DC nunca é alterado.
const OBS_DC = "Habilidade técnica da Descrição de Cargo";

async function lerRequisitoPorId(id: number) {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_cargo_requisitos").select(COLS_REQ).eq("id", id).maybeSingle();
  if (error) erroBanco(error, "Requisito");
  if (!data) throw new ErroHttp(404, "Habilidade da Descrição de Cargo não encontrada.");
  return data as Record<string, any>;
}

async function exigirHabilidadeTecnicaAtiva(id: number) {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_habilidades").select("id, nome, tipo, ativo").eq("id", id).maybeSingle();
  if (error) erroBanco(error, "Habilidades");
  if (!data || !data.ativo || data.tipo !== "tecnica") throw new ErroHttp(422, "Selecione uma habilidade técnica ativa do catálogo.");
  return data;
}

async function dcHabilidadeAdicionar(conta: ContaDev, corpo: Corpo) {
  const cargoNome = texto(corpo, "cargo_nome", { obrigatorio: true, max: 200, rotulo: "o cargo" });
  await exigirCargoOficial(cargoNome, false);
  await exigirCargoNaEquipe(conta, cargoNome);
  const hab = await exigirHabilidadeTecnicaAtiva(idObrigatorio(corpo, "habilidade_id", "Habilidade"));
  const ehRH = conta.perfil === "RH";
  const agora = new Date().toISOString();
  const { data: existente, error: eErro } = await supabaseAdmin
    .from("peopleflow_dev_cargo_requisitos")
    .select(COLS_REQ)
    .eq("cargo_nome", cargoNome)
    .eq("habilidade_id", hab.id)
    .maybeSingle();
  if (eErro) erroBanco(eErro, "Requisito");
  if (existente && existente.status !== "inativo") return existente; // já está no cargo (vigente ou aguardando o RH)
  const valores = ehRH
    ? { status: "vigente", validado_em: agora, validado_por: conta.userId, status_motivo: null }
    : { status: "sugerido", validado_em: null, validado_por: null, status_motivo: null };
  let data;
  if (existente) {
    // Reaproveita a linha (unicidade cargo × habilidade): reativa — o histórico fica na auditoria.
    const r = await supabaseAdmin
      .from("peopleflow_dev_cargo_requisitos")
      .update({ ...valores, ...(ehRH ? { obrigatorio: corpo.obrigatorio === true } : { origem: "gestor", sugerido_por_colaborador_id: conta.colaboradorId, justificativa: "Selecionada na Descrição de Cargo" }), updated_by: conta.userId })
      .eq("id", existente.id)
      .select(COLS_REQ)
      .single();
    if (r.error) erroBanco(r.error, "Requisito");
    data = r.data;
  } else {
    const r = await supabaseAdmin
      .from("peopleflow_dev_cargo_requisitos")
      .insert({
        cargo_nome: cargoNome,
        tipo_requisito: "habilidade",
        habilidade_id: hab.id,
        obrigatorio: ehRH && corpo.obrigatorio === true,
        observacao: OBS_DC,
        justificativa: ehRH ? "" : "Selecionada na Descrição de Cargo",
        origem: ehRH ? "rh" : "gestor",
        origem_registro: "sistema",
        sugerido_por_colaborador_id: ehRH ? null : conta.colaboradorId,
        created_by: conta.userId,
        updated_by: conta.userId,
        ...valores,
      })
      .select(COLS_REQ)
      .single();
    if (r.error) erroBanco(r.error, "Requisito");
    data = r.data;
  }
  await auditar(conta, "dc_habilidade_adicionada", "peopleflow_dev_cargo_requisitos", String(data.id), { cargo_nome: cargoNome, habilidade_id: hab.id, habilidade: hab.nome, status: data.status, reativada: Boolean(existente) });
  return data;
}

/** Habilidade que não está no catálogo: Gestor sugere (RH valida); RH já cadastra no catálogo. */
async function dcHabilidadeSugerir(conta: ContaDev, corpo: Corpo) {
  const cargoNome = texto(corpo, "cargo_nome", { obrigatorio: true, max: 200, rotulo: "o cargo" });
  await exigirCargoOficial(cargoNome, false);
  await exigirCargoNaEquipe(conta, cargoNome);
  const nome = texto(corpo, "nome", { obrigatorio: true, max: 200, rotulo: "o nome da habilidade técnica" }).replace(/\s+/g, " ");
  const descricao = texto(corpo, "descricao", { max: 2000 });
  const justificativa = texto(corpo, "justificativa", { max: 2000 });
  const { data: igual, error: dErro } = await supabaseAdmin.from("peopleflow_dev_habilidades").select("id, nome, ativo").eq("nome_normalizado", normalizarNome(nome)).maybeSingle();
  if (dErro) erroBanco(dErro, "Habilidades");
  if (igual) throw new ErroHttp(409, `Já existe no catálogo: "${igual.nome}"${igual.ativo ? " — selecione-a na lista." : " (inativa — peça ao RH para reativar)."}`);
  if (conta.perfil === "RH") {
    const h = (await habilidadeSalvar(conta, { nome, descricao, tipo: "tecnica" })) as Record<string, any>;
    return dcHabilidadeAdicionar(conta, { cargo_nome: cargoNome, habilidade_id: h.id });
  }
  const { data: pendenteIgual } = await supabaseAdmin
    .from("peopleflow_dev_cargo_requisitos")
    .select("id")
    .eq("cargo_nome", cargoNome)
    .eq("tipo_requisito", "habilidade")
    .eq("status", "sugerido")
    .is("habilidade_id", null);
  for (const r of pendenteIgual ?? []) {
    const lida = await lerRequisitoPorId(Number(r.id));
    if (normalizarNome(String(lida.descricao_sugerida ?? "")) === normalizarNome(nome)) throw new ErroHttp(409, "Essa sugestão já está aguardando validação do RH para este cargo.");
  }
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_cargo_requisitos")
    .insert({
      cargo_nome: cargoNome,
      tipo_requisito: "habilidade",
      habilidade_id: null,
      descricao_sugerida: nome,
      obrigatorio: false,
      observacao: descricao,
      justificativa: justificativa || "Sugerida na Descrição de Cargo",
      status: "sugerido",
      origem: "gestor",
      origem_registro: "sistema",
      sugerido_por_colaborador_id: conta.colaboradorId,
      created_by: conta.userId,
      updated_by: conta.userId,
    })
    .select(COLS_REQ)
    .single();
  if (error) erroBanco(error, "Sugestão de habilidade técnica");
  await auditar(conta, "dc_habilidade_sugerida", "peopleflow_dev_cargo_requisitos", String(data.id), { cargo_nome: cargoNome, nome, descricao });
  return data;
}

/** RH remove qualquer uma; Gestor só retira a PRÓPRIA sugestão ainda pendente. Nunca exclusão física. */
/** RH classifica a habilidade no cargo como Obrigatória ou Recomendada. Não gera gap: habilidade não é avaliada nesta etapa. */
async function dcHabilidadeClassificar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const antes = await lerRequisitoPorId(idObrigatorio(corpo, "id", "Habilidade da Descrição de Cargo"));
  if (antes.tipo_requisito !== "habilidade" || antes.status === "inativo") throw new ErroHttp(422, "A habilidade não está ativa nesta Descrição de Cargo.");
  if (typeof corpo.obrigatorio !== "boolean") throw new ErroHttp(422, "Informe se a habilidade é Obrigatória ou Recomendada.");
  if (antes.obrigatorio === corpo.obrigatorio) return antes;
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_cargo_requisitos")
    .update({ obrigatorio: corpo.obrigatorio, updated_by: conta.userId })
    .eq("id", antes.id)
    .select(COLS_REQ)
    .single();
  if (error) erroBanco(error, "Requisito");
  await auditar(conta, "dc_habilidade_classificada", "peopleflow_dev_cargo_requisitos", String(antes.id), {
    cargo_nome: antes.cargo_nome,
    obrigatorio: { antes: antes.obrigatorio, depois: corpo.obrigatorio },
  });
  return data;
}

async function dcHabilidadeRemover(conta: ContaDev, corpo: Corpo) {
  const r = await lerRequisitoPorId(idObrigatorio(corpo, "id", "Habilidade"));
  if (r.tipo_requisito !== "habilidade" || r.status === "inativo") throw new ErroHttp(422, "Esta habilidade não está ativa na Descrição de Cargo.");
  if (conta.perfil !== "RH") {
    await exigirCargoNaEquipe(conta, r.cargo_nome);
    if (!(r.status === "sugerido" && r.origem === "gestor" && Number(r.sugerido_por_colaborador_id) === conta.colaboradorId)) {
      throw new ErroHttp(403, "O Gestor retira apenas as próprias sugestões ainda pendentes. Para remover uma habilidade oficial, fale com o RH.");
    }
  }
  const motivo = texto(corpo, "motivo", { max: 1000 }) || (conta.perfil === "RH" ? "Removida da Descrição de Cargo" : "Sugestão retirada pelo gestor");
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_cargo_requisitos")
    .update({ status: "inativo", status_motivo: motivo, updated_by: conta.userId })
    .eq("id", r.id)
    .select(COLS_REQ)
    .single();
  if (error) erroBanco(error, "Requisito");
  await auditar(conta, "dc_habilidade_removida", "peopleflow_dev_cargo_requisitos", String(r.id), { cargo_nome: r.cargo_nome, habilidade_id: r.habilidade_id, descricao_sugerida: r.descricao_sugerida, motivo });
  return data;
}

/** RH valida a sugestão de habilidade NOVA: cadastra no catálogo (ou vincula a uma existente) e associa ao cargo. */
async function habilidadeSugestaoValidar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const r = await lerRequisitoPorId(idObrigatorio(corpo, "requisito_id", "Sugestão"));
  if (r.tipo_requisito !== "habilidade" || r.status !== "sugerido" || r.habilidade_id) throw new ErroHttp(422, "Esta não é uma sugestão de habilidade nova pendente.");
  let habilidadeId: number;
  if (corpo.habilidade_id) {
    habilidadeId = (await exigirHabilidadeTecnicaAtiva(idObrigatorio(corpo, "habilidade_id", "Habilidade"))).id as number;
  } else {
    const nome = texto(corpo, "nome", { max: 200 }) || String(r.descricao_sugerida ?? "");
    const h = (await habilidadeSalvar(conta, { nome, descricao: texto(corpo, "descricao", { max: 2000 }) || r.observacao || "", tipo: "tecnica", categoria: texto(corpo, "categoria", { max: 80 }) })) as Record<string, any>;
    habilidadeId = Number(h.id);
  }
  const { data: jaNoCargo } = await supabaseAdmin.from("peopleflow_dev_cargo_requisitos").select("id, status").eq("cargo_nome", r.cargo_nome).eq("habilidade_id", habilidadeId).maybeSingle();
  if (jaNoCargo) {
    // O cargo já tem essa habilidade: a sugestão é encerrada como atendida pela existente (sem duplicar).
    const { error: encErro } = await supabaseAdmin.from("peopleflow_dev_cargo_requisitos").update({ status: "inativo", status_motivo: "Sugestão atendida por habilidade já existente no cargo", updated_by: conta.userId }).eq("id", r.id);
    if (encErro) erroBanco(encErro, "Requisito");
    if (jaNoCargo.status !== "vigente") await requisitoStatus(conta, { id: jaNoCargo.id, status: "vigente" });
    await auditar(conta, "habilidade_sugestao_validada", "peopleflow_dev_cargo_requisitos", String(r.id), { cargo_nome: r.cargo_nome, habilidade_id: habilidadeId, via: "existente_no_cargo" });
    return lerRequisitoPorId(Number(jaNoCargo.id));
  }
  const agora = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_cargo_requisitos")
    .update({ habilidade_id: habilidadeId, descricao_sugerida: null, status: "vigente", validado_em: agora, validado_por: conta.userId, status_motivo: null, updated_by: conta.userId })
    .eq("id", r.id)
    .select(COLS_REQ)
    .single();
  if (error) erroBanco(error, "Requisito");
  await auditar(conta, "habilidade_sugestao_validada", "peopleflow_dev_cargo_requisitos", String(r.id), { cargo_nome: r.cargo_nome, sugerida: r.descricao_sugerida, habilidade_id: habilidadeId, criada_no_catalogo: !corpo.habilidade_id });
  return data;
}

/** Leitura para a DC (qualquer conta do PeopleFlow, como a própria DC): habilidades técnicas do cargo + catálogo ativo. */
async function dcHabilidadesDados(cargoNome: string) {
  const [req, cat, pend] = await Promise.all([
    supabaseAdmin
      .from("peopleflow_dev_cargo_requisitos")
      .select("id, habilidade_id, descricao_sugerida, status, origem, obrigatorio, observacao, sugerido_por_colaborador_id")
      .eq("cargo_nome", cargoNome)
      .eq("tipo_requisito", "habilidade")
      .in("status", ["vigente", "sugerido"]),
    supabaseAdmin.from("peopleflow_dev_habilidades").select("id, nome, descricao, categoria").eq("ativo", true).eq("tipo", "tecnica"),
    supabaseAdmin.from("peopleflow_dev_cargo_requisitos").select("cargo_nome, descricao_sugerida").eq("tipo_requisito", "habilidade").eq("status", "sugerido").is("habilidade_id", null).neq("origem", "importacao"),
  ]);
  if (req.error) erroBanco(req.error, "Requisitos");
  if (cat.error) erroBanco(cat.error, "Habilidades");
  const nomes = new Map((cat.data ?? []).map((h) => [Number(h.id), String(h.nome)]));
  // Na DC: vigentes (qualquer origem) + sugestões feitas na própria DC/Por cargo por Gestor ou RH.
  // Requisitos só importados do portal antigo (sugerido/importação) seguem em "Por cargo" até a validação.
  const selecionadas = (req.data ?? [])
    .filter((r) => r.status === "vigente" || r.origem !== "importacao")
    .map((r) => ({
      id: Number(r.id),
      habilidade_id: r.habilidade_id == null ? null : Number(r.habilidade_id),
      nome: r.habilidade_id ? (nomes.get(Number(r.habilidade_id)) ?? "Habilidade") : String(r.descricao_sugerida ?? ""),
      status: r.status,
      obrigatorio: Boolean(r.obrigatorio),
      nova: r.habilidade_id == null,
      descricao: r.habilidade_id == null ? (r.observacao ?? "") : "",
      sugerido_por_colaborador_id: r.sugerido_por_colaborador_id == null ? null : Number(r.sugerido_por_colaborador_id),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    selecionadas,
    catalogo: (cat.data ?? []).map((h) => ({ id: Number(h.id), nome: String(h.nome), descricao: String(h.descricao ?? ""), categoria: h.categoria ?? null })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    sugestoes_pendentes: (pend.data ?? []).map((p) => ({ cargo: String(p.cargo_nome), nome: String(p.descricao_sugerida ?? "") })),
  };
}

export async function executarLeituraDC(req: VercelRequest, res: VercelResponse) {
  try {
    const raw = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
    const token = raw?.replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new ErroHttp(401, "Sessão ausente.");
    const { data: u, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !u.user) throw new ErroHttp(401, "Sessão inválida ou expirada.");
    const { data: acesso } = await supabaseAdmin.from("module_access").select("modulo").eq("user_id", u.user.id).eq("modulo", "peopleflow").maybeSingle();
    if (!acesso) throw new ErroHttp(403, "Conta sem acesso ao PeopleFlow.");
    const corpo = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {})) as Corpo;
    const cargoNome = texto(corpo, "cargo_nome", { obrigatorio: true, max: 200, rotulo: "o cargo" });
    res.status(200).json({ ok: true, dados: await dcHabilidadesDados(cargoNome) });
  } catch (err) {
    if (err instanceof ErroHttp) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
}

// ── Roteamento ──────────────────────────────────────────────────────────
const ACOES: Record<string, (conta: ContaDev, corpo: Corpo) => Promise<unknown>> = {
  lista_mestra_salvar: listaMestraSalvar,
  lista_mestra_revisao: listaMestraRevisao,
  lista_mestra_situacao: listaMestraSituacao,
  habilidade_salvar: habilidadeSalvar,
  habilidade_ativo: habilidadeAtivo,
  requisito_salvar: requisitoSalvar,
  requisito_status: requisitoStatus,
  requisito_sugerir: requisitoSugerir,
  necessidade_registrar: necessidadeRegistrar,
  necessidade_editar: necessidadeEditar,
  necessidade_status: necessidadeStatus,
  necessidade_consolidar: necessidadeConsolidar,
  necessidade_desagrupar: necessidadeDesagrupar,
  pdi_sugestao_aceitar: TRIAGEM_PDI.aceitarLegado,
  pdi_sugestao_dispensar: TRIAGEM_PDI.dispensarLegado,
  ...TRIAGEM_PDI.acoes,
  treinamento_salvar: treinamentoSalvar,
  treinamento_realizacao: treinamentoRealizacao,
  treinamento_reposicao: treinamentoReposicao,
  reposicao_faltantes: reposicaoFaltantes,
  participantes_opcoes: participantesOpcoes,
  lista_presenca_gerar: listaPresencaGerar,
  dc_habilidade_adicionar: dcHabilidadeAdicionar,
  dc_habilidade_sugerir: dcHabilidadeSugerir,
  dc_habilidade_remover: dcHabilidadeRemover,
  dc_habilidade_classificar: dcHabilidadeClassificar,
  habilidade_sugestao_validar: habilidadeSugestaoValidar,
  treinamento_planejar: treinamentoPlanejar,
  treinamento_iniciar: treinamentoIniciar,
  treinamento_concluir: treinamentoConcluir,
  treinamento_cancelar: treinamentoCancelar,
  participantes_adicionar: participantesAdicionar,
  participante_remover: participanteRemover,
  necessidades_vincular: necessidadesVincular,
  necessidade_desvincular: necessidadeDesvincular,
  necessidade_associacao_validar: necessidadeAssociacaoValidar,
  necessidade_associacao_rejeitar: necessidadeAssociacaoRejeitar,
  vinculos_listar: vinculosListar,
  necessidades_opcoes: necessidadesOpcoes,
  habilitacao_listar: habilitacaoListar,
  habilitacao_opcoes: habilitacaoOpcoes,
  habilitacao_conceder: habilitacaoConceder,
  habilitacao_revogar: habilitacaoRevogar,
  habilitacao_pendencias: habilitacaoPendencias,
  treinamento_transferir: treinamentoTransferir,
  transferencias_listar: transferenciasListar,
  ausencia_encaminhar: ausenciaEncaminhar,
  treinamento_conferir: treinamentoConferir,
  pendencias_listar: pendenciasListar,
  treinamento_historico: treinamentoHistorico,
  presenca_manual: presencaManual,
  qr_gerar: qrGerar,
  qr_encerrar: qrEncerrarAcao,
  evidencia_upload_url: evidenciaUploadUrl,
  evidencia_registrar: evidenciaRegistrar,
  evidencia_url: evidenciaUrl,
  evidencia_substituir: evidenciaSubstituir,
  eficacia_registrar: eficaciaRegistrar,
  // Avaliação de Reação: acompanhamento (só RH). O colaborador responde por reacao_responder (família da página de presença).
  // Participação por gravação: configurar (quem conduz). O colaborador confirma por gravacao_confirmar (família da página de presença).
  gravacao_definir: gravacaoDefinir,
  reacao_resumo: reacaoResumo,
  reacao_detalhe: reacaoDetalhe,
  // LNT (Fase 6 — núcleo): ações só do RH, em api/_lib/lntAcoes.ts.
  ...ACOES_LNT,
  // PDI: encerramento por desligamento (RH) — api/_lib/pdiEncerramentoAcoes.ts.
  ...ACOES_PDI_ENCERRAMENTO,
};

export function ehAcaoDeGravacao(acao: string): boolean {
  return acao in ACOES;
}

export async function executarAcao(acao: string, req: VercelRequest, res: VercelResponse) {
  try {
    const conta = await exigirConta(req);
    const corpo = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {})) as Corpo;
    const resultado = await ACOES[acao](conta, corpo);
    res.status(200).json({ ok: true, dados: resultado });
  } catch (err) {
    if (err instanceof ErroHttp || err instanceof ErroLnt) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
}

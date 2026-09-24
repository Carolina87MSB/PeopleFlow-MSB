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
import { randomBytes, randomUUID } from "node:crypto";
import { supabaseAdmin } from "./adminAuth.js";
import { emailOf } from "../../src/domain/hierarquia.js";

export interface ContaDev {
  userId: string;
  colaboradorId: number;
  perfil: "RH" | "Gestor";
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
  return { userId: userData.user.id, colaboradorId: data.colaborador_id as number, perfil: data.perfil as ContaDev["perfil"] };
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
  "id, cargo_nome, tipo_requisito, habilidade_id, lista_mestra_codigo, descricao_sugerida, obrigatorio, periodicidade_meses, observacao, justificativa, origem, status, status_motivo, sugerido_por_colaborador_id, validado_em, created_at, updated_at";

async function exigirCargoOficial(cargoNome: string, permitirObsoleto: boolean) {
  const { data, error } = await supabaseAdmin.from("peopleflow_descricoes_cargo").select("cargo_nome, obsoleto").eq("cargo_nome", cargoNome).maybeSingle();
  if (error) erroBanco(error, "Cargo");
  if (!data) throw new ErroHttp(422, "Cargo sem Descrição de Cargo no PeopleFlow.");
  if (data.obsoleto && !permitirObsoleto) throw new ErroHttp(422, "Cargo marcado como obsoleto.");
}

async function exigirCargoNaEquipe(conta: ContaDev, cargoNome: string) {
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
  const { data: c, error } = await supabaseAdmin.from("colaboradores").select("id, nome, cargo, departamento, gestor, desligado").eq("id", colaboradorId).maybeSingle();
  if (error) erroBanco(error, "Colaborador");
  if (!c || c.desligado) throw new ErroHttp(422, "Colaborador não encontrado ou desligado.");
  let gestorId: number | null = null;
  if (c.gestor) {
    const { data: g, error: gErro } = await supabaseAdmin.from("colaboradores").select("id").eq("nome", c.gestor).eq("desligado", false);
    if (gErro) erroBanco(gErro, "Gestor");
    if (g && g.length === 1) gestorId = g[0].id as number;
  }
  return { id: c.id as number, cargo: c.cargo as string, departamento: (c.departamento as string) || null, gestorId };
}

async function exigirColaboradorNaEquipe(conta: ContaDev, colaboradorId: number) {
  if (conta.perfil === "RH") return;
  if (colaboradorId === conta.colaboradorId) throw new ErroHttp(422, "Registre necessidades para os seus liderados.");
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
    descricao: texto(corpo, "descricao", { obrigatorio: true, max: 500, rotulo: "a necessidade" }),
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
      if (!req || req.status !== "vigente") throw new ErroHttp(422, "Somente requisito VIGENTE pode originar necessidade.");
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
  if (error) erroBanco(error, "Necessidade");
  await auditar(conta, "necessidade_registrada", "peopleflow_dev_necessidades", String(data.id), { depois: data });
  return data;
}

async function lerNecessidade(id: number) {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_necessidades").select(COLS_NEC).eq("id", id).maybeSingle();
  if (error) erroBanco(error, "Necessidade");
  if (!data) throw new ErroHttp(404, "Necessidade não encontrada.");
  return data;
}

async function necessidadeEditar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const id = idObrigatorio(corpo, "id", "Necessidade");
  const antes = await lerNecessidade(id);
  if (antes.status === "cancelada") throw new ErroHttp(422, "Reabra a necessidade antes de editar.");
  const campos = lerCamposNecessidade(corpo);
  const mudou = diferencas(antes, campos);
  if (Object.keys(mudou).length === 0) return antes;
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_necessidades").update({ ...campos, updated_by: conta.userId }).eq("id", id).select(COLS_NEC).single();
  if (error) erroBanco(error, "Necessidade");
  await auditar(conta, "necessidade_editada", "peopleflow_dev_necessidades", String(id), { alteracoes: mudou });
  return data;
}

async function necessidadeStatus(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const id = idObrigatorio(corpo, "id", "Necessidade");
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
  if (error) erroBanco(error, "Necessidade");
  const acao = status === "validada" ? "necessidade_validada" : status === "cancelada" ? "necessidade_cancelada" : "necessidade_reaberta";
  await auditar(conta, acao, "peopleflow_dev_necessidades", String(id), { status: { antes: antes.status, depois: status }, motivo });
  return data;
}

async function necessidadeConsolidar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const ids = Array.isArray(corpo.ids) ? [...new Set(corpo.ids.map(Number))].filter((n) => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) throw new ErroHttp(422, "Selecione ao menos uma necessidade.");
  if (ids.length > 500) throw new ErroHttp(422, "Selecione no máximo 500 necessidades por vez.");
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
  if (lerErro) erroBanco(lerErro, "Necessidade");
  const validos = (alvo ?? []).filter((n) => n.status !== "cancelada").map((n) => n.id as number);
  if (validos.length === 0) throw new ErroHttp(422, "Nenhuma das necessidades selecionadas pode ser consolidada (canceladas não entram).");
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
  const id = idObrigatorio(corpo, "id", "Necessidade");
  const antes = await lerNecessidade(id);
  if (!antes.grupo_id) throw new ErroHttp(422, "A necessidade não está consolidada.");
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_necessidades").update({ grupo_id: null, updated_by: conta.userId }).eq("id", id).select(COLS_NEC).single();
  if (error) erroBanco(error, "Necessidade");
  await auditar(conta, "necessidade_desagrupada", "peopleflow_dev_necessidades", String(id), { grupo_anterior: antes.grupo_id });
  return data;
}

// ── Integração com PDI: SOMENTE LEITURA do PDI ──────────────────────────
/** Lê a ação do PDI, o item e o cabeçalho (o PDI é a fonte oficial; nada é gravado nele). */
async function lerAcaoPdi(pdiAcaoId: string) {
  const { data: acao, error } = await supabaseAdmin.from("peopleflow_pdi_acoes").select("id, item_id, descricao, status, prazo").eq("id", pdiAcaoId).maybeSingle();
  if (error) erroBanco(error, "PDI");
  if (!acao) throw new ErroHttp(404, "Ação do PDI não encontrada (pode ter sido removida do PDI).");
  const { data: item, error: iErro } = await supabaseAdmin.from("peopleflow_pdi_itens").select("id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento").eq("id", acao.item_id).maybeSingle();
  if (iErro) erroBanco(iErro, "PDI");
  if (!item) throw new ErroHttp(404, "Item do PDI não encontrado.");
  const { data: pdi, error: pErro } = await supabaseAdmin.from("peopleflow_pdi").select("id, colaborador_nome, ciclo").eq("id", item.pdi_id).maybeSingle();
  if (pErro) erroBanco(pErro, "PDI");
  if (!pdi) throw new ErroHttp(404, "PDI não encontrado.");
  return { acao, item, pdi };
}

async function pdiSugestaoAceitar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const pdiAcaoId = texto(corpo, "pdi_acao_id", { obrigatorio: true, max: 100, rotulo: "a ação do PDI" });
  const { acao, item, pdi } = await lerAcaoPdi(pdiAcaoId);
  const { data: dispensada } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestoes_dispensadas").select("pdi_acao_id").eq("pdi_acao_id", pdiAcaoId).maybeSingle();
  if (dispensada) throw new ErroHttp(422, "Esta sugestão já foi dispensada.");
  // O PDI identifica a pessoa por nome; aqui o vínculo passa a ser por id (homônimo → não vincula).
  const { data: pessoas, error: pErro } = await supabaseAdmin.from("colaboradores").select("id").eq("nome", pdi.colaborador_nome).eq("desligado", false);
  if (pErro) erroBanco(pErro, "Colaborador");
  if (!pessoas || pessoas.length !== 1) throw new ErroHttp(409, "Não foi possível identificar o colaborador do PDI de forma única.");
  const colab = await lerColaboradorParaNecessidade(pessoas[0].id as number);
  const categoria = umDe(texto(corpo, "categoria"), CATEGORIAS_NEC, "Categoria");
  const prioridade = umDe(texto(corpo, "prioridade") || "media", PRIORIDADES, "Prioridade");
  const justificativa =
    texto(corpo, "justificativa", { max: 2000 }) ||
    `PDI ${pdi.ciclo} — ${item.tipo_competencia === "Tecnica" ? "KPI" : "competência"} "${item.competencia_nome}"${item.objetivo_desenvolvimento ? `: ${item.objetivo_desenvolvimento}` : ""}`;
  const agora = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_necessidades")
    .insert({
      colaborador_id: colab.id,
      departamento: colab.departamento,
      gestor_colaborador_id: colab.gestorId,
      origem: "pdi",
      pdi_id: pdi.id,
      pdi_item_id: item.id,
      pdi_acao_id: acao.id,
      pdi_item_nome: item.competencia_nome,
      descricao: String(acao.descricao).slice(0, 500),
      justificativa,
      categoria,
      prioridade,
      sugestao_capacitacao: texto(corpo, "sugestao_capacitacao", { max: 500 }),
      observacao: texto(corpo, "observacao", { max: 2000 }),
      status: "validada",
      validada_em: agora,
      validada_por: conta.userId,
      solicitado_por_colaborador_id: conta.colaboradorId,
      origem_registro: "sistema",
      created_by: conta.userId,
      updated_by: conta.userId,
    })
    .select(COLS_NEC)
    .single();
  if (error) {
    if (error.code === "23505") throw new ErroHttp(409, "Esta ação do PDI já está na Base de Necessidades.");
    erroBanco(error, "Necessidade");
  }
  await auditar(conta, "necessidade_do_pdi", "peopleflow_dev_necessidades", String(data.id), { pdi_id: pdi.id, pdi_item_id: item.id, pdi_acao_id: acao.id, depois: data });
  return data;
}

async function pdiSugestaoDispensar(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const pdiAcaoId = texto(corpo, "pdi_acao_id", { obrigatorio: true, max: 100, rotulo: "a ação do PDI" });
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "o motivo" });
  const { item } = await lerAcaoPdi(pdiAcaoId);
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_pdi_sugestoes_dispensadas")
    .insert({ pdi_acao_id: pdiAcaoId, pdi_id: item.pdi_id, motivo, dispensada_por: conta.userId })
    .select("pdi_acao_id, motivo, dispensada_em")
    .single();
  if (error) {
    if (error.code === "23505") throw new ErroHttp(409, "Sugestão já dispensada.");
    erroBanco(error, "Sugestão do PDI");
  }
  await auditar(conta, "sugestao_pdi_dispensada", "peopleflow_dev_pdi_sugestoes_dispensadas", pdiAcaoId, { pdi_id: item.pdi_id, motivo });
  return data;
}

// ══ Fase 5 — Gestão de Treinamentos ═════════════════════════════════════
const COLS_TRE =
  "id, codigo, titulo, tipo, lista_mestra_codigo, lista_mestra_revisao, lista_mestra_titulo, modalidade, formato, data_inicio, data_fim, carga_horaria_min, instrutor_colaborador_id, instrutor_externo, responsavel_colaborador_id, justificativa, local_link, observacao, exige_eficacia, eficacia_prazo, data_realizacao, carga_realizada_min, status, status_motivo, solicitado_por_colaborador_id, planejado_em, iniciado_em, concluido_em, reposicao_de_id, reposicao_raiz_id, reposicao_numero, created_at, updated_at";
const COLS_PART =
  "id, treinamento_id, colaborador_id, origem_inclusao, presenca_status, presenca_metodo, presenca_em, presenca_motivo, eficacia_resultado, eficacia_observacao, eficacia_em, eficacia_por_colaborador_id, removido_em, removido_motivo";
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
/** Solicitante que não é RH só mexe na própria solicitação enquanto ela está SOLICITADA. */
function podeEditarSolicitacao(conta: ContaDev, t: Treinamento): boolean {
  return conta.perfil === "RH" || (t.status === "solicitado" && ehSolicitante(conta, t));
}
/** Quem monta a turma: RH, responsável/instrutor do treinamento ou quem o solicitou (Gestor). */
function podeGerirParticipantes(conta: ContaDev, t: Treinamento): boolean {
  if (t.status === "concluido" || t.status === "cancelado") return false;
  return conta.perfil === "RH" || ehResponsavel(conta, t) || ehSolicitante(conta, t);
}
function exigirRHouResponsavel(conta: ContaDev, t: Treinamento) {
  if (conta.perfil !== "RH" && !ehResponsavel(conta, t)) throw new ErroHttp(403, "Somente o RH ou o responsável/instrutor deste treinamento.");
}

async function idsNoEscopo(conta: ContaDev): Promise<Set<number>> {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_escopo").select("colaborador_id").eq("gestor_colaborador_id", conta.colaboradorId);
  if (error) erroBanco(error, "Escopo");
  return new Set((data ?? []).map((r) => Number(r.colaborador_id)));
}

async function exigirColaboradoresAtivos(ids: number[]) {
  if (ids.length === 0) return;
  const { data, error } = await supabaseAdmin.from("colaboradores").select("id, desligado").in("id", ids);
  if (error) erroBanco(error, "Colaborador");
  const ativos = new Set((data ?? []).filter((c) => !c.desligado).map((c) => Number(c.id)));
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

function exigirMinimoPlanejamento(t: Record<string, unknown>) {
  if (!String(t.titulo ?? "").trim()) throw new ErroHttp(422, "Informe o título do treinamento.");
  if (!t.data_inicio) throw new ErroHttp(422, "Informe a data prevista.");
  if (!t.responsavel_colaborador_id) throw new ErroHttp(422, "Defina o responsável pelo treinamento.");
  if (TIPOS_COM_DOCUMENTO.has(String(t.tipo)) && !t.lista_mestra_codigo) throw new ErroHttp(422, "Selecione o documento da Lista Mestra (Novo POP, Revisão de POP ou Instrução de Trabalho).");
}

// ── Necessidades ligadas ao treinamento: regras de status ───────────────
async function vinculosAtivos(treinamentoId: number) {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_treinamento_necessidades").select("id, necessidade_id").eq("treinamento_id", treinamentoId).eq("ativo", true);
  if (error) erroBanco(error, "Vínculos");
  return (data ?? []) as { id: number; necessidade_id: number }[];
}

async function temOutroTreinamentoAtivo(necessidadeId: number, exceto: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_treinamento_necessidades").select("treinamento_id").eq("necessidade_id", necessidadeId).eq("ativo", true);
  if (error) erroBanco(error, "Vínculos");
  const outros = (data ?? []).map((r) => Number(r.treinamento_id)).filter((id) => id !== exceto);
  if (outros.length === 0) return false;
  const { data: ts, error: tErro } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select("id, status").in("id", outros);
  if (tErro) erroBanco(tErro, "Treinamento");
  return (ts ?? []).some((t) => STATUS_ATIVOS.includes(t.status as string));
}

async function mudarStatusNecessidade(conta: ContaDev, necessidadeId: number, de: string[], para: string, extra: Record<string, unknown>, motivo: string, treinamentoId: number) {
  const { data: n, error } = await supabaseAdmin.from("peopleflow_dev_necessidades").select("id, status").eq("id", necessidadeId).maybeSingle();
  if (error) erroBanco(error, "Necessidade");
  if (!n || !de.includes(n.status as string)) return;
  const { error: uErro } = await supabaseAdmin.from("peopleflow_dev_necessidades").update({ status: para, ...extra, updated_by: conta.userId }).eq("id", necessidadeId);
  if (uErro) erroBanco(uErro, "Necessidade");
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
  const vinculos = await vinculosAtivos(t.id);
  if (vinculos.length === 0) return;
  const { data: nec, error } = await supabaseAdmin
    .from("peopleflow_dev_necessidades")
    .select("id, colaborador_id, status")
    .in("id", vinculos.map((v) => v.necessidade_id))
    .eq("colaborador_id", participante.colaborador_id);
  if (error) erroBanco(error, "Necessidade");
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
async function treinamentoSalvar(conta: ContaDev, corpo: Corpo) {
  const id = corpo.id == null || corpo.id === "" ? null : idObrigatorio(corpo, "id", "Treinamento");
  const campos = lerCamposTreinamento(corpo);
  const pessoas = [campos.responsavel_colaborador_id, campos.instrutor_colaborador_id].filter((x): x is number => x != null);
  await exigirColaboradoresAtivos(pessoas);

  if (!id) {
    const doc = campos.lista_mestra_codigo ? await fotografiaDocumento(campos.lista_mestra_codigo) : {};
    const titulo = campos.titulo || (doc as { lista_mestra_titulo?: string }).lista_mestra_titulo || "";
    if (!titulo) throw new ErroHttp(422, "Informe o título do treinamento.");
    const planejar = conta.perfil === "RH" && corpo.planejar === true;
    const linha = { ...campos, ...doc, titulo, lista_mestra_codigo: campos.lista_mestra_codigo };
    if (planejar) exigirMinimoPlanejamento(linha);
    const agora = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("peopleflow_dev_treinamentos")
      .insert({
        ...linha,
        status: planejar ? "planejado" : "solicitado",
        planejado_em: planejar ? agora : null,
        planejado_por: planejar ? conta.userId : null,
        solicitado_por_colaborador_id: conta.colaboradorId,
        origem_registro: "sistema",
        created_by: conta.userId,
        updated_by: conta.userId,
      })
      .select(COLS_TRE)
      .single();
    if (error) erroBanco(error, "Treinamento");
    await auditar(conta, planejar ? "treinamento_planejado" : "treinamento_solicitado", "peopleflow_dev_treinamentos", String(data.id), { depois: data });
    return data;
  }

  const antes = await lerTreinamento(id);
  if (antes.status === "cancelado") throw new ErroHttp(422, "Treinamento cancelado não pode ser editado.");
  if (!podeEditarSolicitacao(conta, antes)) throw new ErroHttp(403, "Somente o RH (ou o solicitante, enquanto SOLICITADO) pode editar.");
  const motivo = texto(corpo, "motivo", { max: 1000 });
  if (antes.status === "concluido" && !motivo) throw new ErroHttp(422, "Alteração em treinamento concluído exige justificativa.");
  // Documento: só refotografa quando o código muda — a revisão treinada nunca é atualizada retroativamente.
  let doc: Record<string, unknown> = { lista_mestra_codigo: antes.lista_mestra_codigo, lista_mestra_titulo: antes.lista_mestra_titulo, lista_mestra_revisao: antes.lista_mestra_revisao };
  if (campos.lista_mestra_codigo !== antes.lista_mestra_codigo) {
    if (antes.status === "concluido") throw new ErroHttp(422, "O documento de um treinamento concluído não pode ser trocado.");
    doc = campos.lista_mestra_codigo ? await fotografiaDocumento(campos.lista_mestra_codigo) : { lista_mestra_codigo: null, lista_mestra_titulo: null, lista_mestra_revisao: null };
  }
  const atualizacao = { ...campos, ...doc, titulo: campos.titulo || antes.titulo };
  if (antes.status !== "solicitado") exigirMinimoPlanejamento(atualizacao);
  const mudou = diferencas(antes, atualizacao);
  if (Object.keys(mudou).length === 0) return antes;
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_treinamentos").update({ ...atualizacao, updated_by: conta.userId }).eq("id", id).select(COLS_TRE).single();
  if (error) erroBanco(error, "Treinamento");
  await auditar(conta, antes.status === "concluido" ? "treinamento_retificado" : "treinamento_editado", "peopleflow_dev_treinamentos", String(id), { alteracoes: mudou, motivo });
  return data;
}

async function treinamentoRealizacao(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "id", "Treinamento"));
  exigirRHouResponsavel(conta, t);
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
  exigirRHouResponsavel(conta, t);
  if (t.status !== "planejado") throw new ErroHttp(422, "Só treinamentos PLANEJADOS podem ser iniciados.");
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_treinamentos")
    .update({ status: "em_andamento", iniciado_em: new Date().toISOString(), iniciado_por: conta.userId, updated_by: conta.userId })
    .eq("id", t.id)
    .select(COLS_TRE)
    .single();
  if (error) erroBanco(error, "Treinamento");
  await auditar(conta, "treinamento_iniciado", "peopleflow_dev_treinamentos", String(t.id), { status: { antes: "planejado", depois: "em_andamento" } });
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
  exigirRH(conta);
  const t = await lerTreinamento(idObrigatorio(corpo, "id", "Treinamento"));
  const externo = t.modalidade === "externo";
  if (!(t.status === "em_andamento" || (externo && t.status === "planejado"))) {
    throw new ErroHttp(422, externo ? "Treinamento externo precisa estar planejado ou em andamento." : "Inicie o treinamento antes de concluir.");
  }
  exigirMinimoPlanejamento(t);
  const participantes = await participantesAtivos(t.id);
  if (participantes.length === 0) throw new ErroHttp(422, "O treinamento não tem participantes.");
  const pendentes = participantes.filter((p) => p.presenca_status === "pendente").length;
  if (pendentes) throw new ErroHttp(422, `Registre a presença/realização de todos os participantes (${pendentes} pendente${pendentes > 1 ? "s" : ""}).`);
  if (!participantes.some((p) => p.presenca_status === "presente")) throw new ErroHttp(422, "Nenhum participante realizou o treinamento — cancele em vez de concluir.");
  const dataRealizacao = t.data_realizacao ?? t.data_fim ?? t.data_inicio;
  if (!dataRealizacao) throw new ErroHttp(422, "Informe a data de realização.");
  if (externo) {
    const { data: ev, error } = await supabaseAdmin.from("peopleflow_dev_evidencias").select("id").eq("treinamento_id", t.id).is("substituida_em", null).limit(1);
    if (error) erroBanco(error, "Evidências");
    if (!ev || ev.length === 0) throw new ErroHttp(422, "Treinamento externo precisa de evidência (certificado, comprovante…) antes da conclusão.");
  }
  const agora = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_treinamentos")
    .update({ status: "concluido", concluido_em: agora, concluido_por: conta.userId, data_realizacao: dataRealizacao, carga_realizada_min: t.carga_realizada_min ?? t.carga_horaria_min, updated_by: conta.userId })
    .eq("id", t.id)
    .select(COLS_TRE)
    .single();
  if (error) erroBanco(error, "Treinamento");
  await encerrarQr(conta, t.id);
  await auditar(conta, "treinamento_concluido", "peopleflow_dev_treinamentos", String(t.id), {
    status: { antes: t.status, depois: "concluido" },
    realizaram: participantes.filter((p) => p.presenca_status === "presente").length,
    ausentes: participantes.filter((p) => p.presenca_status === "ausente").length,
  });
  for (const p of participantes) await processarNecessidadesDoParticipante(conta, data, p);
  return data;
}

async function treinamentoCancelar(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "id", "Treinamento"));
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "a justificativa do cancelamento" });
  if (t.status === "concluido" || t.status === "cancelado") throw new ErroHttp(422, "Treinamento já encerrado.");
  if (!podeEditarSolicitacao(conta, t)) throw new ErroHttp(403, "Somente o RH (ou o solicitante, enquanto SOLICITADO) pode cancelar.");
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
  if (!podeGerirParticipantes(conta, t)) throw new ErroHttp(403, "Somente o RH, o responsável/instrutor ou o solicitante deste treinamento inclui participantes.");
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
  if (!podeGerirParticipantes(conta, t)) throw new ErroHttp(403, "Somente o RH, o responsável/instrutor ou o solicitante deste treinamento retira participantes.");
  if (p.removido_em) throw new ErroHttp(422, "Participante já retirado.");
  const { data, error } = await supabaseAdmin
    .from("peopleflow_dev_participantes")
    .update({ removido_em: new Date().toISOString(), removido_por: conta.userId, removido_motivo: motivo, updated_by: conta.userId })
    .eq("id", p.id)
    .select(COLS_PART)
    .single();
  if (error) erroBanco(error, "Participante");
  await auditar(conta, "participante_retirado", "peopleflow_dev_participantes", String(p.id), { treinamento_id: t.id, colaborador_id: p.colaborador_id, motivo });
  // Necessidades desse colaborador ligadas a este treinamento deixam de ser atendidas por ele.
  const vinculos = await vinculosAtivos(t.id);
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
  if (!podeGerirParticipantes(conta, t)) throw new ErroHttp(403, "Sem permissão para montar a turma deste treinamento.");
  const { data, error } = await supabaseAdmin.from("colaboradores").select("id, nome, cargo, departamento, desligado");
  if (error) erroBanco(error, "Colaboradores");
  return (data ?? [])
    .filter((c) => !c.desligado)
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
  return ausentes.filter((p) => !jaRepondo.has(Number(p.colaborador_id)));
}

function exigirPodeRepor(conta: ContaDev, t: Treinamento) {
  exigirRHouResponsavel(conta, t);
  if (t.status !== "concluido") throw new ErroHttp(422, "A reposição é agendada a partir de um treinamento concluído com faltantes.");
}

async function reposicaoFaltantes(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  exigirPodeRepor(conta, t);
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
  exigirPodeRepor(conta, origem);
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
  // Mesmo documento: mantém a fotografia do original (mesma revisão treinada).
  const doc =
    campos.lista_mestra_codigo && campos.lista_mestra_codigo !== origem.lista_mestra_codigo
      ? await fotografiaDocumento(campos.lista_mestra_codigo)
      : { lista_mestra_codigo: origem.lista_mestra_codigo, lista_mestra_titulo: origem.lista_mestra_titulo, lista_mestra_revisao: origem.lista_mestra_revisao };
  const raiz = Number(origem.reposicao_raiz_id ?? origem.id);
  const { data: irmaos, error: iErro } = await supabaseAdmin.from("peopleflow_dev_treinamentos").select("id").eq("reposicao_raiz_id", raiz);
  if (iErro) erroBanco(iErro, "Reposições");
  const planejar = conta.perfil === "RH" && corpo.planejar === true;
  const linha = { ...campos, ...doc, titulo: campos.titulo || origem.titulo };
  if (planejar) exigirMinimoPlanejamento(linha);
  const agora = new Date().toISOString();
  const { data: nova, error } = await supabaseAdmin
    .from("peopleflow_dev_treinamentos")
    .insert({
      ...linha,
      status: planejar ? "planejado" : "solicitado",
      planejado_em: planejar ? agora : null,
      planejado_por: planejar ? conta.userId : null,
      solicitado_por_colaborador_id: conta.colaboradorId,
      reposicao_de_id: origem.id,
      reposicao_raiz_id: raiz,
      reposicao_numero: (irmaos ?? []).length + 1,
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
    if (nErro) erroBanco(nErro, "Necessidade");
    necessidades = (nec ?? []).filter((n) => ["validada", "planejada"].includes(n.status as string)).map((n) => Number(n.id));
    if (necessidades.length) {
      const { error: vErro } = await supabaseAdmin
        .from("peopleflow_dev_treinamento_necessidades")
        .insert(necessidades.map((n) => ({ treinamento_id: nova.id, necessidade_id: n, vinculado_por: conta.userId })));
      if (vErro) erroBanco(vErro, "Vínculo");
    }
  }
  await auditar(conta, "reposicao_criada", "peopleflow_dev_treinamentos", String(nova.id), {
    reposicao_de: origem.id, raiz, numero: nova.reposicao_numero, faltantes: colabs, necessidades, depois: nova,
  });
  if (planejar) await planejarNecessidadesDoTreinamento(conta, nova.id);
  return nova;
}

// ── Vínculo com a Base de Necessidades ─────────────────────────────────
async function necessidadesVincular(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  if (t.status === "concluido" || t.status === "cancelado") throw new ErroHttp(422, "Treinamento encerrado.");
  const ids = Array.isArray(corpo.necessidade_ids) ? [...new Set(corpo.necessidade_ids.map(Number))].filter((n) => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) throw new ErroHttp(422, "Selecione ao menos uma necessidade.");
  const { data: nec, error } = await supabaseAdmin.from("peopleflow_dev_necessidades").select("id, status, colaborador_id").in("id", ids);
  if (error) erroBanco(error, "Necessidade");
  const invalidas = (nec ?? []).filter((n) => !["validada", "planejada"].includes(n.status as string) || !n.colaborador_id);
  if ((nec ?? []).length !== ids.length || invalidas.length) throw new ErroHttp(422, "Só necessidades VALIDADAS (ou já PLANEJADAS) de um colaborador podem ser vinculadas.");
  const ja = new Set((await vinculosAtivos(t.id)).map((v) => v.necessidade_id));
  const novas = ids.filter((i) => !ja.has(i));
  if (novas.length) {
    const { error: iErro } = await supabaseAdmin.from("peopleflow_dev_treinamento_necessidades").insert(novas.map((n) => ({ treinamento_id: t.id, necessidade_id: n, vinculado_por: conta.userId })));
    if (iErro) erroBanco(iErro, "Vínculo");
  }
  // O colaborador da necessidade entra como participante (se ainda não estiver).
  const colabs = [...new Set((nec ?? []).filter((n) => novas.includes(Number(n.id))).map((n) => Number(n.colaborador_id)))];
  if (colabs.length) await participantesAdicionar({ ...conta }, { treinamento_id: t.id, colaborador_ids: colabs, origem_inclusao: "manual" }).catch((e) => {
    if (!(e instanceof ErroHttp && e.status === 422)) throw e;
  });
  if (colabs.length) await supabaseAdmin.from("peopleflow_dev_participantes").update({ origem_inclusao: "lnt" }).eq("treinamento_id", t.id).in("colaborador_id", colabs).eq("origem_inclusao", "manual");
  await auditar(conta, "necessidades_vinculadas", "peopleflow_dev_treinamentos", String(t.id), { necessidades: novas });
  if (STATUS_ATIVOS.includes(t.status)) for (const n of novas) await mudarStatusNecessidade(conta, n, ["validada"], "planejada", {}, "Vinculada a treinamento planejado", t.id);
  return { vinculadas: novas.length, ja_vinculadas: ids.length - novas.length };
}

async function necessidadeDesvincular(conta: ContaDev, corpo: Corpo) {
  exigirRH(conta);
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  const necessidadeId = idObrigatorio(corpo, "necessidade_id", "Necessidade");
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "o motivo" });
  if (t.status === "concluido") throw new ErroHttp(422, "Vínculos de treinamento concluído são históricos.");
  const v = (await vinculosAtivos(t.id)).find((x) => x.necessidade_id === necessidadeId);
  if (!v) throw new ErroHttp(404, "Vínculo não encontrado.");
  const { error } = await supabaseAdmin.from("peopleflow_dev_treinamento_necessidades").update({ ativo: false, desvinculado_em: new Date().toISOString(), desvinculado_por: conta.userId, desvinculado_motivo: motivo }).eq("id", v.id);
  if (error) erroBanco(error, "Vínculo");
  await auditar(conta, "necessidade_desvinculada", "peopleflow_dev_treinamentos", String(t.id), { necessidade_id: necessidadeId, motivo });
  await devolverNecessidade(conta, necessidadeId, t.id, "Desvinculada do treinamento");
  return { ok: true };
}

// ── Presença ────────────────────────────────────────────────────────────
async function presencaManual(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  exigirRHouResponsavel(conta, t);
  const presenca = umDe(texto(corpo, "presenca"), ["presente", "ausente", "pendente"] as const, "Presença");
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "a origem/justificativa do registro" });
  const retificacao = t.status === "concluido";
  if (retificacao && conta.perfil !== "RH") throw new ErroHttp(403, "Após a conclusão, só o RH retifica presença.");
  if (!(t.status === "em_andamento" || retificacao || (t.modalidade === "externo" && t.status === "planejado"))) throw new ErroHttp(422, "Presença só pode ser registrada com o treinamento em andamento.");
  if (retificacao && presenca === "pendente") throw new ErroHttp(422, "Treinamento concluído não aceita presença pendente.");
  const ids = Array.isArray(corpo.participante_ids) ? [...new Set(corpo.participante_ids.map(Number))].filter((n) => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) throw new ErroHttp(422, "Selecione ao menos um participante.");
  const { data: parts, error } = await supabaseAdmin.from("peopleflow_dev_participantes").select(COLS_PART).in("id", ids).eq("treinamento_id", t.id);
  if (error) erroBanco(error, "Participantes");
  if ((parts ?? []).length !== ids.length || (parts ?? []).some((p) => p.removido_em)) throw new ErroHttp(422, "Participante inválido para este treinamento.");
  const agora = new Date().toISOString();
  const alterados: Record<string, any>[] = [];
  for (const p of parts ?? []) {
    if (p.presenca_status === presenca) continue;
    const { data, error: uErro } = await supabaseAdmin
      .from("peopleflow_dev_participantes")
      .update({ presenca_status: presenca, presenca_metodo: presenca === "pendente" ? null : "manual", presenca_em: presenca === "pendente" ? null : agora, presenca_por: conta.userId, presenca_motivo: motivo, updated_by: conta.userId })
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
  return { alterados: alterados.length };
}

// ── QR de presença (token aleatório, com validade; só o servidor o lê) ──
async function qrGerar(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  exigirRHouResponsavel(conta, t);
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
  exigirRHouResponsavel(conta, t);
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
  exigirRHouResponsavel(conta, t);
  if (t.status === "cancelado") throw new ErroHttp(422, "Treinamento cancelado.");
  if (t.status === "concluido" && conta.perfil !== "RH") throw new ErroHttp(403, "Após a conclusão, só o RH anexa evidências.");
}

async function evidenciaUploadUrl(conta: ContaDev, corpo: Corpo) {
  const t = await lerTreinamento(idObrigatorio(corpo, "treinamento_id", "Treinamento"));
  await exigirPodeAnexar(conta, t);
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
  if (!caminho.startsWith(`treinamentos/${t.id}/`)) throw new ErroHttp(422, "Arquivo não pertence a este treinamento.");
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

async function lerEvidencia(id: number) {
  const { data, error } = await supabaseAdmin.from("peopleflow_dev_evidencias").select("id, treinamento_id, participante_id, storage_path, file_name, substituida_em").eq("id", id).maybeSingle();
  if (error) erroBanco(error, "Evidência");
  if (!data) throw new ErroHttp(404, "Evidência não encontrada.");
  return data as Record<string, any>;
}

async function evidenciaUrl(conta: ContaDev, corpo: Corpo) {
  const ev = await lerEvidencia(idObrigatorio(corpo, "id", "Evidência"));
  const t = await lerTreinamento(ev.treinamento_id);
  let pode = conta.perfil === "RH" || ehResponsavel(conta, t);
  if (!pode && conta.perfil === "Gestor") {
    const escopo = await idsNoEscopo(conta);
    if (ev.participante_id) pode = escopo.has(Number((await lerParticipante(ev.participante_id)).colaborador_id));
    else pode = (await participantesAtivos(t.id)).some((p) => escopo.has(Number(p.colaborador_id))) || ehSolicitante(conta, t);
  }
  if (!pode) throw new ErroHttp(403, "Sem acesso a esta evidência.");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(ev.storage_path, 300, { download: ev.file_name });
  if (error || !data) throw new ErroHttp(500, `Storage: ${error?.message ?? "sem URL"}`);
  return { url: data.signedUrl };
}

async function evidenciaSubstituir(conta: ContaDev, corpo: Corpo) {
  const ev = await lerEvidencia(idObrigatorio(corpo, "id", "Evidência"));
  const t = await lerTreinamento(ev.treinamento_id);
  await exigirPodeAnexar(conta, t);
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "o motivo" });
  if (ev.substituida_em) throw new ErroHttp(422, "Evidência já substituída.");
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
  const { data: colabs, error: cErro } = await supabaseAdmin.from("colaboradores").select("id, nome").eq("desligado", false);
  if (cErro) erroBanco(cErro, "Colaborador");
  const meus = (colabs ?? []).filter((c) => emailOf(c.nome as string) === email);
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
  const info = { titulo: t.titulo, documento: t.lista_mestra_codigo ? `${t.lista_mestra_codigo} rev. ${t.lista_mestra_revisao}` : null, data: t.data_inicio, primeiro_nome: quem.primeiroNome };
  if (!p || p.removido_em) return { ...info, situacao: "nao_inscrito" };
  if (p.presenca_status === "presente") return { ...info, situacao: "confirmada", confirmada_em: p.presenca_em };
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
  return { ...info, situacao: "confirmada", confirmada_em: agora };
}

export function ehAcaoDePresencaQr(acao: string): acao is "presenca_info" | "presenca_confirmar" {
  return acao === "presenca_info" || acao === "presenca_confirmar";
}

export async function executarPresencaQr(acao: "presenca_info" | "presenca_confirmar", req: VercelRequest, res: VercelResponse) {
  try {
    res.status(200).json({ ok: true, dados: await presencaViaQr(acao, req) });
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
  pdi_sugestao_aceitar: pdiSugestaoAceitar,
  pdi_sugestao_dispensar: pdiSugestaoDispensar,
  treinamento_salvar: treinamentoSalvar,
  treinamento_realizacao: treinamentoRealizacao,
  treinamento_reposicao: treinamentoReposicao,
  reposicao_faltantes: reposicaoFaltantes,
  participantes_opcoes: participantesOpcoes,
  treinamento_planejar: treinamentoPlanejar,
  treinamento_iniciar: treinamentoIniciar,
  treinamento_concluir: treinamentoConcluir,
  treinamento_cancelar: treinamentoCancelar,
  participantes_adicionar: participantesAdicionar,
  participante_remover: participanteRemover,
  necessidades_vincular: necessidadesVincular,
  necessidade_desvincular: necessidadeDesvincular,
  presenca_manual: presencaManual,
  qr_gerar: qrGerar,
  qr_encerrar: qrEncerrarAcao,
  evidencia_upload_url: evidenciaUploadUrl,
  evidencia_registrar: evidenciaRegistrar,
  evidencia_url: evidenciaUrl,
  evidencia_substituir: evidenciaSubstituir,
  eficacia_registrar: eficaciaRegistrar,
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
    if (err instanceof ErroHttp) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
}

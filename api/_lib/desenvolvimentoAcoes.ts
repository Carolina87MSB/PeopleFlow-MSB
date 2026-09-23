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
import { supabaseAdmin } from "./adminAuth.js";

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

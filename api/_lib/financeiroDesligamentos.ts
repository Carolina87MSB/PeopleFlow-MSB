// Integração financeira dos desligamentos — ações do SERVIDOR (roteadas por api/desenvolvimento.ts, `?acao=financeiro_*`, sem criar nova Serverless Function).
//
// Regras:
//   • Os valores financeiros individuais só saem do servidor para o RH. A Diretoria recebe apenas TOTAIS MENSAIS agregados; os demais perfis, nada.
//   • Toda gravação é do servidor (service_role), exclusiva do RH, e registra uma linha na trilha peopleflow_fechamentos_log (valor anterior, novo,
//     origem, responsável, motivo). O fechamento financeiro já lançado NUNCA é sobrescrito sem decisão expressa do RH.
//   • Rescisão = líquido da folha, validado pelo RH; GRRF = total efetivamente recolhido, informado pelo RH (nada é calculado a partir do saldo FGTS).
//     Cada componente tem o seu status. Valores importados nunca são marcados como validados automaticamente.
//   • A autenticação NÃO depende da sessão do módulo Desenvolvimento: o perfil vem do cadastro (mesma regra do PeopleFlow: buildAccess).
//
// Limite conhecido: o cliente REST do Supabase não faz transação entre comandos. Cada ação grava o fechamento antes da validação e a trilha por último,
// de modo que uma queda no meio deixa, no pior caso, algo que a mesma ação, repetida, completa — nunca um valor validado sem origem.

import { supabaseAdmin } from "./adminAuth.js";
import { emailDeColaboradorDesligado } from "./situacaoColaboradores.js";
import { buildAccess } from "../../src/domain/hierarquia.js";
import { tempoDeEmpresa } from "../../src/domain/dates.js";
import { filtrarPorAtributos } from "../../src/domain/filtrosAtributos.js";
import {
  agregarCustosPorMes,
  apurarSaidas,
  coberturaDe,
  listarConversoes,
  type DecisaoDivergencia,
  type FechamentoFinanceiro,
  type FonteGrrf,
  type LinhaConferencia,
  type RubricaFinanceira,
} from "../../src/domain/custosRescisao.js";
import { filtrarHistorico, normalizarNomeHistorico, prepararHistorico, type NaturezaRescisao, type RescisaoHistorica } from "../../src/domain/rescisoesHistorico.js";
import type { Colaborador } from "../../src/types/domain.js";

export class ErroFin extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Corpo = Record<string, unknown>;
type Perfil = "RH" | "Diretoria" | "Gestor" | "Colaborador";
interface Conta {
  email: string;
  perfil: Perfil;
  nome: string;
  colaboradores: Colaborador[];
}

const COLUNAS_COLAB =
  "id, nome, cargo, departamento, vinculo, depto_code, nivel, gestor, admissao, desligado, data_desligamento, motivo_desligamento, desligado_by, matriz9box_visao_completa, empresa_afiliada";

interface ColaboradorRow {
  id: number;
  nome: string;
  cargo: string | null;
  departamento: string | null;
  vinculo: string | null;
  depto_code: string | null;
  nivel: string | null;
  gestor: string | null;
  admissao: string | null;
  desligado: boolean | null;
  data_desligamento: string | null;
  motivo_desligamento: string | null;
  desligado_by: string | null;
  matriz9box_visao_completa: boolean | null;
  empresa_afiliada: boolean | null;
}

function toColaborador(row: ColaboradorRow): Colaborador {
  return {
    id: row.id,
    vinculo: row.vinculo ?? "—",
    nome: row.nome,
    cargo: row.cargo ?? "",
    depto: row.departamento ?? "",
    deptoCode: row.depto_code ?? "—",
    nivel: (row.nivel as Colaborador["nivel"]) ?? "Operacional",
    gestor: row.gestor ?? "—",
    admissao: row.admissao ?? "",
    admissaoIso: row.admissao ?? "",
    tempoDeEmpresa: tempoDeEmpresa(row.admissao),
    desligado: row.desligado ?? false,
    dataDesligamento: row.data_desligamento ?? "",
    motivoDesligamento: row.motivo_desligamento ?? "",
    desligadoBy: row.desligado_by ?? "",
    matriz9BoxVisaoCompleta: row.matriz9box_visao_completa ?? false,
    empresaAfiliada: row.empresa_afiliada ?? false,
  };
}

function erroBanco(error: { message: string }, rotulo: string): never {
  throw new ErroFin(500, `${rotulo}: ${error.message}`);
}

// ── Autenticação / perfil (do cadastro, sem a sessão do módulo) ──────────────────────────────────────
async function identificar(authHeader: string | string[] | undefined): Promise<Conta> {
  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = raw?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new ErroFin(401, "Token de autenticação ausente.");
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user?.email) throw new ErroFin(401, "Sessão inválida ou expirada.");
  const email = userData.user.email.toLowerCase();
  const { data, error } = await supabaseAdmin.from("colaboradores").select(COLUNAS_COLAB);
  if (error) erroBanco(error, "Colaboradores");
  const linhas = (data ?? []) as unknown as (ColaboradorRow & { nome: string })[];
  if (emailDeColaboradorDesligado(email, linhas)) throw new ErroFin(403, "Conta de colaborador(a) desligado(a): sem acesso.");
  const colaboradores = linhas.map(toColaborador);
  const conta = buildAccess(colaboradores).find((a) => a.email === email);
  if (!conta) throw new ErroFin(403, "Conta não encontrada no cadastro de acessos.");
  return { email, perfil: conta.perfil as Perfil, nome: conta.nome, colaboradores };
}

function exigirRH(conta: Conta) {
  if (conta.perfil !== "RH") throw new ErroFin(403, "Somente o RH acessa e altera os valores financeiros individuais dos desligamentos.");
}

// ── Leitura dos dados financeiros (tolerante à migration ainda não aplicada) ─────────────────────────
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

interface Base {
  colaboradores: Colaborador[];
  historico: RescisaoHistorica[];
  rubricas: RubricaFinanceira[];
  fechamentos: FechamentoFinanceiro[];
  /** false = a migration supabase/desligamentos_financeiro.sql ainda não foi aplicada (só leitura, sem validação). */
  instalado: boolean;
}

async function carregarBase(colaboradores: Colaborador[]): Promise<Base> {
  const [h, r, f] = await Promise.all([
    supabaseAdmin
      .from("peopleflow_rescisoes_historico")
      .select("id, codigo_folha, nome, nome_normalizado, admissao, demissao, tipo_rescisao, departamento, natureza, efetivacao_em, colaborador_id")
      .order("demissao", { ascending: true }),
    supabaseAdmin.from("peopleflow_rescisoes_historico_rubricas").select("*"),
    supabaseAdmin.from("peopleflow_desligamentos").select("*"),
  ]);
  // histórico ausente (migration anterior não aplicada) → sem custos a apurar, nunca derruba
  const historicoRows = h.error ? [] : ((h.data ?? []) as Record<string, unknown>[]);
  const historico: RescisaoHistorica[] = historicoRows.map((x) => ({
    id: Number(x.id),
    codigoFolha: Number(x.codigo_folha),
    nome: String(x.nome),
    nomeNormalizado: String(x.nome_normalizado),
    admissaoIso: String(x.admissao),
    demissaoIso: String(x.demissao),
    tipoRescisao: (x.tipo_rescisao as string | null) ?? "",
    departamento: (x.departamento as string | null) ?? null,
    natureza: x.natureza as NaturezaRescisao,
    efetivacaoEmIso: (x.efetivacao_em as string | null) ?? null,
    colaboradorId: x.colaborador_id === null || x.colaborador_id === undefined ? null : Number(x.colaborador_id),
  }));
  const rubRows = r.error ? [] : ((r.data ?? []) as Record<string, unknown>[]);
  const instalado = rubRows.length === 0 || "rescisao_status" in rubRows[0];
  const rubricas: RubricaFinanceira[] = rubRows.map((x) => ({
    rescisaoId: Number(x.rescisao_id),
    liquido: Number(x.liquido ?? 0),
    fgtsRescisorio: Number(x.fgts_rescisorio ?? 0),
    saldoFgts: Number(x.saldo_fgts ?? 0),
    rescisaoStatus: ((x.rescisao_status as string | undefined) ?? "proposto") as RubricaFinanceira["rescisaoStatus"],
    rescisaoDecisao: (x.rescisao_decisao as DecisaoDivergencia | null | undefined) ?? null,
    rescisaoValorValidado: num(x.rescisao_valor_validado),
    rescisaoValidadaEm: (x.rescisao_validada_em as string | null | undefined) ?? null,
    rescisaoValidadaPor: (x.rescisao_validada_por as string | null | undefined) ?? null,
    zeroConferido: Boolean(x.zero_conferido_em),
    modalidadeConfirmada: (x.modalidade_confirmada as string | null | undefined) ?? null,
    grrfStatus: ((x.grrf_status as string | undefined) ?? "pendente") as RubricaFinanceira["grrfStatus"],
    grrfDeposito: num(x.grrf_deposito),
    grrfMulta: num(x.grrf_multa),
    grrfTotal: num(x.grrf_total),
    grrfFonte: (x.grrf_fonte as FonteGrrf | null | undefined) ?? null,
    grrfValidadaEm: (x.grrf_validada_em as string | null | undefined) ?? null,
    grrfValidadaPor: (x.grrf_validada_por as string | null | undefined) ?? null,
  }));
  if (f.error) erroBanco(f.error, "Fechamentos financeiros");
  const fechamentos: FechamentoFinanceiro[] = ((f.data ?? []) as Record<string, unknown>[]).map((x) => ({
    colaboradorNome: String(x.colaborador_nome),
    valorRescisao: num(x.valor_rescisao),
    valorGrrf: num(x.valor_grrf),
    origem: ((x.origem as string | undefined) ?? "manual") as FechamentoFinanceiro["origem"],
    rescisaoHistoricoId: x.rescisao_historico_id === null || x.rescisao_historico_id === undefined ? null : Number(x.rescisao_historico_id),
    rescisaoValidadaEm: (x.rescisao_validada_em as string | null | undefined) ?? null,
    rescisaoValidadaPor: (x.rescisao_validada_por as string | null | undefined) ?? null,
    rescisaoFonte: (x.rescisao_fonte as string | null | undefined) ?? null,
    grrfValidadaEm: (x.grrf_validada_em as string | null | undefined) ?? null,
    grrfValidadaPor: (x.grrf_validada_por as string | null | undefined) ?? null,
    grrfFonte: (x.grrf_fonte as string | null | undefined) ?? null,
    grrfNaoAplicavel: Boolean(x.grrf_nao_aplicavel),
    grrfJustificativa: (x.grrf_justificativa as string | null | undefined) ?? null,
    updatedAt: String(x.updated_at ?? ""),
    updatedBy: String(x.updated_by ?? ""),
  }));
  return { colaboradores, historico, rubricas, fechamentos, instalado };
}

function linhasDe(base: Base, extra: Partial<Parameters<typeof apurarSaidas>[0]> = {}): LinhaConferencia[] {
  return apurarSaidas({
    colaboradores: base.colaboradores,
    historicoCompleto: base.historico,
    historicoPreparado: prepararHistorico(base.historico, base.colaboradores),
    rubricas: base.rubricas,
    fechamentos: base.fechamentos,
    ...extra,
  });
}

// ── Leituras ──────────────────────────────────────────────────────────────────────────────────────────
async function listar(conta: Conta, _corpo: Corpo) {
  exigirRH(conta);
  const base = await carregarBase(conta.colaboradores);
  const saidas = linhasDe(base);
  return {
    instalado: base.instalado,
    saidas,
    conversoes: listarConversoes(base.historico, base.rubricas),
    cobertura: coberturaDe(saidas),
    fechamentos: base.fechamentos,
  };
}

/** Totais mensais para o Dashboard Executivo (RH e Diretoria): NENHUM valor individual sai daqui. Mesmos filtros e mesmo período do Dashboard. */
async function agregado(conta: Conta, corpo: Corpo) {
  if (conta.perfil !== "RH" && conta.perfil !== "Diretoria") throw new ErroFin(403, "Os valores financeiros agregados são do RH e da Diretoria.");
  const str = (k: string, padrao = "Todos") => (typeof corpo[k] === "string" && corpo[k] ? String(corpo[k]) : padrao);
  const iso = (k: string): string | undefined => (typeof corpo[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(corpo[k])) ? String(corpo[k]) : undefined);
  const filtros = { setor: str("setor"), gestor: str("gestor"), cargo: str("cargo") };
  const base = await carregarBase(conta.colaboradores);
  const colaboradoresFiltrados = filtrarPorAtributos(base.colaboradores, filtros);
  const preparado = filtrarHistorico(prepararHistorico(base.historico, base.colaboradores), filtros, colaboradoresFiltrados, true);
  const saidas = apurarSaidas({
    colaboradores: colaboradoresFiltrados,
    historicoCompleto: base.historico,
    historicoPreparado: preparado,
    rubricas: base.rubricas,
    fechamentos: base.fechamentos,
    inicioIso: iso("inicio"),
    fimIso: iso("fim"),
  });
  return { instalado: base.instalado, meses: agregarCustosPorMes(saidas), cobertura: coberturaDe(saidas) };
}

// ── Gravações ─────────────────────────────────────────────────────────────────────────────────────────
function valorMonetario(v: unknown, rotulo: string, obrigatorio = false): number | null {
  if (v === null || v === undefined || v === "") {
    if (obrigatorio) throw new ErroFin(422, `Informe ${rotulo}.`);
    return null;
  }
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new ErroFin(422, `${rotulo} deve ser um valor numérico maior ou igual a zero.`);
  return Math.round(n * 100) / 100;
}

function texto(corpo: Corpo, campo: string, opts: { obrigatorio?: boolean; max?: number; rotulo?: string } = {}): string {
  const v = corpo[campo];
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  if (opts.obrigatorio && !s) throw new ErroFin(422, `Informe ${opts.rotulo ?? campo}.`);
  if (s.length > (opts.max ?? 1000)) throw new ErroFin(422, `${opts.rotulo ?? campo} excede ${opts.max ?? 1000} caracteres.`);
  return s;
}

function idObrigatorio(corpo: Corpo, campo: string, rotulo: string): number {
  const n = Number(corpo[campo]);
  if (!Number.isInteger(n) || n <= 0) throw new ErroFin(422, `${rotulo} inválido.`);
  return n;
}

interface LogEntrada {
  acao: "validar_rescisao" | "decidir_divergencia" | "registrar_grrf" | "grrf_nao_aplicavel" | "confirmar_modalidade" | "lancamento_manual" | "validar_lancamento" | "conferir_zero";
  colaboradorNome?: string | null;
  rescisaoId?: number | null;
  campo?: string;
  anterior?: number | null;
  novo?: number | null;
  origem: string;
  motivo?: string;
  detalhe?: Record<string, unknown>;
}

async function registrar(conta: Conta, e: LogEntrada) {
  const { error } = await supabaseAdmin.from("peopleflow_fechamentos_log").insert({
    por: conta.nome,
    acao: e.acao,
    colaborador_nome: e.colaboradorNome ?? null,
    rescisao_id: e.rescisaoId ?? null,
    campo: e.campo ?? null,
    valor_anterior: e.anterior ?? null,
    valor_novo: e.novo ?? null,
    origem: e.origem,
    motivo: e.motivo ?? null,
    detalhe: e.detalhe ?? {},
  });
  if (error) throw new ErroFin(500, `Trilha de auditoria: ${error.message}`);
}

interface Alvo {
  h: RescisaoHistorica;
  rubrica: RubricaFinanceira;
  /** Pessoa do cadastro ligada à rescisão (quando houver) e o fechamento dela. */
  colaborador: Colaborador | null;
  fechamento: FechamentoFinanceiro | null;
}

async function alvoDaRescisao(base: Base, rescisaoId: number): Promise<Alvo> {
  if (!base.instalado) throw new ErroFin(409, "A migration da integração financeira ainda não foi aplicada neste ambiente.");
  const h = base.historico.find((x) => x.id === rescisaoId);
  const rubrica = base.rubricas.find((x) => x.rescisaoId === rescisaoId);
  if (!h || !rubrica) throw new ErroFin(404, "Rescisão não encontrada.");
  if (h.natureza !== "saida_efetiva") throw new ErroFin(422, "Conversão de estágio para CLT não é desligamento: não tem validação financeira de custos.");
  const colaborador = h.colaboradorId !== null ? base.colaboradores.find((c) => c.id === h.colaboradorId) ?? null : null;
  const fechamento = colaborador ? base.fechamentos.find((f) => f.colaboradorNome === colaborador.nome) ?? null : null;
  return { h, rubrica, colaborador, fechamento };
}

const iguais = (a: number, b: number) => Math.abs(a - b) < 0.005;

interface ValidacaoFechamento {
  rescisao?: { fonte: "folha_rescisao" | "demonstrativo_rescisao" | "outro_documento" };
  grrf?: { fonte: FonteGrrf | null; naoAplicavel?: boolean; justificativa?: string };
}

/** Cria ou atualiza o fechamento do desligado ligado à folha. Valores só mudam quando passados em `campos`; a validação por componente (fonte,
 * responsável, data) só é gravada quando a ação correspondente do RH a pede — nunca por efeito colateral. */
async function gravarFechamento(conta: Conta, a: Alvo, campos: { valor_rescisao?: number | null; valor_grrf?: number | null }, validacao: ValidacaoFechamento = {}) {
  if (!a.colaborador) return;
  const agora = new Date().toISOString();
  const extra: Record<string, unknown> = {};
  if (validacao.rescisao) Object.assign(extra, { rescisao_validada_em: agora, rescisao_validada_por: conta.nome, rescisao_fonte: validacao.rescisao.fonte });
  if (validacao.grrf) {
    Object.assign(extra, {
      grrf_validada_em: agora,
      grrf_validada_por: conta.nome,
      grrf_fonte: validacao.grrf.naoAplicavel ? null : validacao.grrf.fonte,
      grrf_nao_aplicavel: Boolean(validacao.grrf.naoAplicavel),
      grrf_justificativa: validacao.grrf.naoAplicavel ? validacao.grrf.justificativa ?? null : null,
    });
  }
  if (a.fechamento) {
    const { error } = await supabaseAdmin
      .from("peopleflow_desligamentos")
      .update({ ...campos, rescisao_historico_id: a.h.id, ...extra, updated_at: agora, updated_by: conta.nome })
      .eq("colaborador_nome", a.colaborador.nome);
    if (error) erroBanco(error, "Fechamento financeiro");
  } else {
    const { error } = await supabaseAdmin.from("peopleflow_desligamentos").insert({
      colaborador_nome: a.colaborador.nome,
      valor_rescisao: campos.valor_rescisao ?? null,
      valor_grrf: campos.valor_grrf ?? null,
      origem: "folha",
      rescisao_historico_id: a.h.id,
      ...extra,
      updated_at: agora,
      updated_by: conta.nome,
    });
    if (error) erroBanco(error, "Fechamento financeiro");
  }
}

interface ItemRescisao {
  rescisao_id: number;
  zero_conferido?: boolean;
}
interface ResultadoItem {
  rescisao_id: number;
  resultado: "validada" | "ja_validada" | "divergente" | "conferir_zero" | "recusada";
  detalhe?: string;
}

/** Valida o LÍQUIDO da folha como Rescisão (individual ou em lote). Divergência com lançamento existente e líquido R$ 0,00 exigem decisão expressa. */
async function rescisaoValidar(conta: Conta, corpo: Corpo) {
  exigirRH(conta);
  const itens = (Array.isArray(corpo.itens) ? corpo.itens : []) as ItemRescisao[];
  if (itens.length === 0) throw new ErroFin(422, "Selecione ao menos uma rescisão.");
  if (itens.length > 100) throw new ErroFin(422, "Selecione no máximo 100 rescisões por vez.");
  const base = await carregarBase(conta.colaboradores);
  const resultados: ResultadoItem[] = [];
  for (const item of itens) {
    const id = Number(item.rescisao_id);
    if (!Number.isInteger(id) || id <= 0) {
      resultados.push({ rescisao_id: id, resultado: "recusada", detalhe: "Rescisão inválida." });
      continue;
    }
    let a: Alvo;
    try {
      a = await alvoDaRescisao(base, id);
    } catch (e) {
      if (e instanceof ErroFin && e.status !== 500 && e.status !== 409) {
        resultados.push({ rescisao_id: id, resultado: "recusada", detalhe: e.message });
        continue;
      }
      throw e;
    }
    if (a.rubrica.rescisaoStatus === "validado") {
      resultados.push({ rescisao_id: id, resultado: "ja_validada" });
      continue;
    }
    const liquido = a.rubrica.liquido;
    const lancado = a.fechamento?.valorRescisao ?? null;
    if (lancado !== null && !iguais(lancado, liquido)) {
      resultados.push({ rescisao_id: id, resultado: "divergente", detalhe: `Lançado ${lancado.toFixed(2)} × líquido da folha ${liquido.toFixed(2)}: decida entre manter o lançado ou adotar a folha.` });
      continue;
    }
    if (liquido === 0 && item.zero_conferido !== true) {
      resultados.push({ rescisao_id: id, resultado: "conferir_zero", detalhe: "O líquido da folha é R$ 0,00: confira o demonstrativo e confirme expressamente." });
      continue;
    }
    const agora = new Date().toISOString();
    await gravarFechamento(conta, a, lancado === null ? { valor_rescisao: liquido } : {}, { rescisao: { fonte: "folha_rescisao" } });
    const { error } = await supabaseAdmin
      .from("peopleflow_rescisoes_historico_rubricas")
      .update({
        rescisao_status: "validado",
        rescisao_valor_validado: liquido,
        rescisao_validada_em: agora,
        rescisao_validada_por: conta.nome,
        ...(liquido === 0 ? { zero_conferido_em: agora, zero_conferido_por: conta.nome } : {}),
      })
      .eq("rescisao_id", id)
      .eq("rescisao_status", "proposto");
    if (error) erroBanco(error, "Validação da rescisão");
    await registrar(conta, { acao: "validar_rescisao", colaboradorNome: a.colaborador?.nome ?? a.h.nome, rescisaoId: id, campo: "valor_rescisao", anterior: lancado, novo: liquido, origem: "folha_2026-10-19", detalhe: { natureza: a.colaborador ? "cadastro" : "historico" } });
    resultados.push({ rescisao_id: id, resultado: "validada" });
  }
  return { resultados };
}

/** Decisão do RH sobre uma divergência entre o lançamento existente e o líquido da folha (a decisão precisa de motivo e fica na trilha). */
async function rescisaoDecidir(conta: Conta, corpo: Corpo) {
  exigirRH(conta);
  const id = idObrigatorio(corpo, "rescisao_id", "Rescisão");
  const decisao = texto(corpo, "decisao", { obrigatorio: true, rotulo: "a decisão" });
  if (decisao !== "adotar_folha" && decisao !== "manter_lancado") throw new ErroFin(422, "Decisão inválida.");
  const motivo = texto(corpo, "motivo", { obrigatorio: true, max: 1000, rotulo: "o motivo (ex.: demonstrativo conferido)" });
  const base = await carregarBase(conta.colaboradores);
  const a = await alvoDaRescisao(base, id);
  if (a.rubrica.rescisaoStatus === "validado") throw new ErroFin(422, "Esta rescisão já foi validada.");
  const lancado = a.fechamento?.valorRescisao ?? null;
  if (lancado === null || iguais(lancado, a.rubrica.liquido)) throw new ErroFin(422, "Não há divergência a decidir: use a validação normal.");
  const valor = decisao === "adotar_folha" ? a.rubrica.liquido : lancado;
  if (valor === 0 && corpo.zero_conferido !== true) throw new ErroFin(422, "O valor resultante é R$ 0,00: confirme expressamente que conferiu o demonstrativo.");
  const agora = new Date().toISOString();
  await gravarFechamento(conta, a, decisao === "adotar_folha" ? { valor_rescisao: valor } : {}, { rescisao: { fonte: decisao === "adotar_folha" ? "folha_rescisao" : "outro_documento" } });
  const { error } = await supabaseAdmin
    .from("peopleflow_rescisoes_historico_rubricas")
    .update({
      rescisao_status: "validado",
      rescisao_decisao: decisao,
      rescisao_valor_validado: valor,
      rescisao_validada_em: agora,
      rescisao_validada_por: conta.nome,
      rescisao_observacao: motivo,
      ...(valor === 0 ? { zero_conferido_em: agora, zero_conferido_por: conta.nome } : {}),
    })
    .eq("rescisao_id", id)
    .eq("rescisao_status", "proposto");
  if (error) erroBanco(error, "Decisão da divergência");
  await registrar(conta, {
    acao: "decidir_divergencia",
    colaboradorNome: a.colaborador?.nome ?? a.h.nome,
    rescisaoId: id,
    campo: "valor_rescisao",
    anterior: lancado,
    novo: valor,
    origem: decisao === "adotar_folha" ? "folha_2026-10-19" : "lancamento_manual",
    motivo,
    detalhe: { decisao, liquido_folha: a.rubrica.liquido },
  });
  return { rescisao_id: id, decisao, valor };
}

const MODALIDADES = ["dispensa_sem_justa_causa", "pedido_demissao", "termino_contrato_determinado", "antecipacao_empregador", "termino_estagio", "outra"] as const;

async function modalidadeConfirmar(conta: Conta, corpo: Corpo) {
  exigirRH(conta);
  const id = idObrigatorio(corpo, "rescisao_id", "Rescisão");
  const modalidade = texto(corpo, "modalidade", { obrigatorio: true, rotulo: "a modalidade" });
  if (!(MODALIDADES as readonly string[]).includes(modalidade)) throw new ErroFin(422, "Modalidade inválida.");
  const base = await carregarBase(conta.colaboradores);
  const a = await alvoDaRescisao(base, id);
  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("peopleflow_rescisoes_historico_rubricas")
    .update({ modalidade_confirmada: modalidade, modalidade_confirmada_em: agora, modalidade_confirmada_por: conta.nome })
    .eq("rescisao_id", id);
  if (error) erroBanco(error, "Modalidade");
  await registrar(conta, { acao: "confirmar_modalidade", colaboradorNome: a.colaborador?.nome ?? a.h.nome, rescisaoId: id, campo: "modalidade", origem: "rh", detalhe: { anterior: a.rubrica.modalidadeConfirmada, nova: modalidade, relatorio: a.h.tipoRescisao } });
  return { rescisao_id: id, modalidade };
}

const FONTES: FonteGrrf[] = ["guia_grrf", "demonstrativo_rescisao", "outro_documento"];

/** Registra a GRRF: depósito rescisório, multa e TOTAL efetivamente recolhido (ou "não aplicável"). Nada é calculado a partir do saldo FGTS. */
async function grrfRegistrar(conta: Conta, corpo: Corpo) {
  exigirRH(conta);
  const id = idObrigatorio(corpo, "rescisao_id", "Rescisão");
  const base = await carregarBase(conta.colaboradores);
  const a = await alvoDaRescisao(base, id);
  if (!a.h.tipoRescisao.trim() && !a.rubrica.modalidadeConfirmada) throw new ErroFin(422, "O relatório não informa a modalidade desta rescisão: confirme a modalidade antes de registrar a GRRF.");
  const lancado = a.fechamento?.valorGrrf ?? null;
  const anteriorValidado = a.rubrica.grrfStatus !== "pendente";
  const agora = new Date().toISOString();

  if (corpo.nao_aplicavel === true) {
    const motivo = texto(corpo, "motivo", { obrigatorio: true, rotulo: "o motivo (por que não há GRRF nesta rescisão)" });
    if (lancado !== null && lancado !== 0 && corpo.confirmar_substituicao !== true) throw new ErroFin(409, `Já existe GRRF lançada de ${lancado.toFixed(2)}: confirme a substituição.`);
    await gravarFechamento(conta, a, { valor_grrf: 0 }, { grrf: { fonte: null, naoAplicavel: true, justificativa: motivo } });
    const { error } = await supabaseAdmin
      .from("peopleflow_rescisoes_historico_rubricas")
      .update({ grrf_status: "nao_aplicavel", grrf_total: 0, grrf_deposito: null, grrf_multa: null, grrf_fonte: null, grrf_validada_em: agora, grrf_validada_por: conta.nome, grrf_observacao: motivo })
      .eq("rescisao_id", id);
    if (error) erroBanco(error, "GRRF");
    await registrar(conta, { acao: "grrf_nao_aplicavel", colaboradorNome: a.colaborador?.nome ?? a.h.nome, rescisaoId: id, campo: "valor_grrf", anterior: a.rubrica.grrfTotal ?? lancado, novo: 0, origem: "rh", motivo });
    return { rescisao_id: id, grrf_status: "nao_aplicavel", total: 0 };
  }

  const total = valorMonetario(corpo.total, "o total efetivamente recolhido da GRRF", true) as number;
  const deposito = valorMonetario(corpo.deposito, "o depósito rescisório");
  const multa = valorMonetario(corpo.multa, "a multa rescisória");
  if (deposito !== null && multa !== null && !iguais(total, deposito + multa)) throw new ErroFin(422, `O total (${total.toFixed(2)}) não confere com depósito + multa (${(deposito + multa).toFixed(2)}).`);
  const fonte = texto(corpo, "fonte", { obrigatorio: true, rotulo: "a fonte do valor (guia, demonstrativo…)" }) as FonteGrrf;
  if (!FONTES.includes(fonte)) throw new ErroFin(422, "Fonte inválida.");
  const observacao = texto(corpo, "observacao", { max: 1000 });
  if (anteriorValidado && !observacao) throw new ErroFin(422, "A GRRF desta rescisão já foi registrada: informe o motivo da correção.");
  if (lancado !== null && !iguais(lancado, total) && corpo.confirmar_substituicao !== true) throw new ErroFin(409, `Já existe GRRF lançada de ${lancado.toFixed(2)} diferente de ${total.toFixed(2)}: confirme a substituição.`);
  await gravarFechamento(conta, a, { valor_grrf: total }, { grrf: { fonte } });
  const { error } = await supabaseAdmin
    .from("peopleflow_rescisoes_historico_rubricas")
    .update({ grrf_status: "validado", grrf_total: total, grrf_deposito: deposito, grrf_multa: multa, grrf_fonte: fonte, grrf_validada_em: agora, grrf_validada_por: conta.nome, grrf_observacao: observacao || null })
    .eq("rescisao_id", id);
  if (error) erroBanco(error, "GRRF");
  await registrar(conta, {
    acao: "registrar_grrf",
    colaboradorNome: a.colaborador?.nome ?? a.h.nome,
    rescisaoId: id,
    campo: "valor_grrf",
    anterior: a.rubrica.grrfTotal ?? lancado,
    novo: total,
    origem: fonte,
    motivo: observacao || undefined,
    detalhe: { deposito, multa, lancado_anterior: lancado },
  });
  return { rescisao_id: id, grrf_status: "validado", total };
}

/** Lançamento manual (desligamentos SEM rescisão importada da folha): é a única via de digitação, e vale como validado porque o RH o registrou. */
const FONTES_RESCISAO = ["demonstrativo_rescisao", "outro_documento"] as const;

function desligadoSemFolha(base: Base, nome: string) {
  const desligados = base.colaboradores.filter((c) => c.nome === nome && c.desligado);
  if (desligados.length !== 1) throw new ErroFin(422, "Colaborador desligado não encontrado (ou há mais de um com este nome).");
  const c = desligados[0];
  const folha = base.historico.find((h) => h.natureza === "saida_efetiva" && (h.colaboradorId === c.id || (h.colaboradorId === null && h.nomeNormalizado === normalizarNomeHistorico(nome) && h.admissaoIso === c.admissaoIso)));
  if (folha) throw new ErroFin(409, "Este desligamento tem rescisão importada da folha: use a Conferência financeira (os valores vêm da folha e são validados lá).");
  return c;
}

/** Lançamento manual (desligamentos SEM rescisão importada da folha): grava os valores como LANÇADOS — não validados. A validação é uma confirmação
 * expressa à parte (financeiro_fechamento_validar), com fonte documental. Mudar um valor já validado desfaz a validação daquele componente. */
async function fechamentoSalvar(conta: Conta, corpo: Corpo) {
  exigirRH(conta);
  const nome = texto(corpo, "colaborador_nome", { obrigatorio: true, rotulo: "o colaborador" });
  const valorRescisao = valorMonetario(corpo.valor_rescisao, "o valor da rescisão");
  const valorGrrf = valorMonetario(corpo.valor_grrf, "o valor da GRRF");
  const base = await carregarBase(conta.colaboradores);
  desligadoSemFolha(base, nome);
  const existente = base.fechamentos.find((f) => f.colaboradorNome === nome) ?? null;
  const agora = new Date().toISOString();
  const registro: Record<string, unknown> = {
    colaborador_nome: nome,
    valor_rescisao: valorRescisao,
    valor_grrf: valorGrrf,
    origem: existente?.origem ?? "manual",
    updated_at: agora,
    updated_by: conta.nome,
  };
  if (base.instalado) {
    if (valorRescisao !== (existente?.valorRescisao ?? null)) Object.assign(registro, { rescisao_validada_em: null, rescisao_validada_por: null, rescisao_fonte: null });
    if (valorGrrf !== (existente?.valorGrrf ?? null)) Object.assign(registro, { grrf_validada_em: null, grrf_validada_por: null, grrf_fonte: null, grrf_nao_aplicavel: false, grrf_justificativa: null });
  }
  const { error } = await supabaseAdmin.from("peopleflow_desligamentos").upsert(registro, { onConflict: "colaborador_nome" });
  if (error) erroBanco(error, "Fechamento financeiro");
  if (valorRescisao !== (existente?.valorRescisao ?? null)) {
    await registrar(conta, { acao: "lancamento_manual", colaboradorNome: nome, campo: "valor_rescisao", anterior: existente?.valorRescisao ?? null, novo: valorRescisao, origem: "manual" });
  }
  if (valorGrrf !== (existente?.valorGrrf ?? null)) {
    await registrar(conta, { acao: "lancamento_manual", colaboradorNome: nome, campo: "valor_grrf", anterior: existente?.valorGrrf ?? null, novo: valorGrrf, origem: "manual" });
  }
  return { colaborador_nome: nome, valor_rescisao: valorRescisao, valor_grrf: valorGrrf, validado: false };
}

/** Confirmação EXPRESSA do RH de um componente do lançamento manual: fonte documental, responsável e data. GRRF "não aplicável" exige justificativa
 * (e vale R$ 0,00 resolvido); um 0 lançado, sozinho, nunca resolve a GRRF. */
async function fechamentoValidar(conta: Conta, corpo: Corpo) {
  exigirRH(conta);
  const nome = texto(corpo, "colaborador_nome", { obrigatorio: true, rotulo: "o colaborador" });
  const componente = texto(corpo, "componente", { obrigatorio: true, rotulo: "o componente" });
  if (componente !== "rescisao" && componente !== "grrf") throw new ErroFin(422, "Componente inválido.");
  const base = await carregarBase(conta.colaboradores);
  if (!base.instalado) throw new ErroFin(409, "A migration da integração financeira ainda não foi aplicada neste ambiente.");
  desligadoSemFolha(base, nome);
  const fech = base.fechamentos.find((f) => f.colaboradorNome === nome) ?? null;
  const agora = new Date().toISOString();
  if (componente === "rescisao") {
    if (!fech || fech.valorRescisao === null) throw new ErroFin(422, "Lance o valor da rescisão antes de validar.");
    if (fech.rescisaoValidadaEm) throw new ErroFin(422, "Esta rescisão já foi validada.");
    const fonte = texto(corpo, "fonte", { obrigatorio: true, rotulo: "a fonte documental" });
    if (!(FONTES_RESCISAO as readonly string[]).includes(fonte)) throw new ErroFin(422, "Fonte inválida.");
    if (fech.valorRescisao === 0 && corpo.zero_conferido !== true) throw new ErroFin(422, "O valor é R$ 0,00: confirme expressamente que conferiu o documento.");
    const { error } = await supabaseAdmin.from("peopleflow_desligamentos").update({ rescisao_validada_em: agora, rescisao_validada_por: conta.nome, rescisao_fonte: fonte }).eq("colaborador_nome", nome).is("rescisao_validada_em", null);
    if (error) erroBanco(error, "Validação da rescisão");
    await registrar(conta, { acao: "validar_lancamento", colaboradorNome: nome, campo: "valor_rescisao", anterior: fech.valorRescisao, novo: fech.valorRescisao, origem: fonte, motivo: texto(corpo, "observacao", { max: 1000 }) || undefined });
    return { colaborador_nome: nome, componente, validado: true };
  }
  if (!fech || fech.valorGrrf === null) {
    if (corpo.nao_aplicavel !== true) throw new ErroFin(422, "Lance o valor da GRRF antes de validar (ou declare que não se aplica, com justificativa).");
  }
  if (fech?.grrfValidadaEm) throw new ErroFin(422, "Esta GRRF já foi validada.");
  if (corpo.nao_aplicavel === true) {
    const justificativa = texto(corpo, "justificativa", { obrigatorio: true, rotulo: "a justificativa (por que não há GRRF nesta rescisão)" });
    if (fech?.valorGrrf !== null && fech?.valorGrrf !== undefined && fech.valorGrrf !== 0 && corpo.confirmar_substituicao !== true) throw new ErroFin(409, `Já existe GRRF lançada de ${fech.valorGrrf.toFixed(2)}: confirme a substituição por "não aplicável".`);
    const { error } = await supabaseAdmin.from("peopleflow_desligamentos").upsert(
      { colaborador_nome: nome, valor_rescisao: fech?.valorRescisao ?? null, valor_grrf: 0, origem: fech?.origem ?? "manual", grrf_validada_em: agora, grrf_validada_por: conta.nome, grrf_fonte: null, grrf_nao_aplicavel: true, grrf_justificativa: justificativa, updated_at: agora, updated_by: conta.nome },
      { onConflict: "colaborador_nome" },
    );
    if (error) erroBanco(error, "GRRF");
    await registrar(conta, { acao: "grrf_nao_aplicavel", colaboradorNome: nome, campo: "valor_grrf", anterior: fech?.valorGrrf ?? null, novo: 0, origem: "rh", motivo: justificativa });
    return { colaborador_nome: nome, componente, validado: true, nao_aplicavel: true };
  }
  const fonte = texto(corpo, "fonte", { obrigatorio: true, rotulo: "a fonte documental" }) as FonteGrrf;
  if (!FONTES.includes(fonte)) throw new ErroFin(422, "Fonte inválida.");
  const { error } = await supabaseAdmin.from("peopleflow_desligamentos").update({ grrf_validada_em: agora, grrf_validada_por: conta.nome, grrf_fonte: fonte, grrf_nao_aplicavel: false, grrf_justificativa: null }).eq("colaborador_nome", nome).is("grrf_validada_em", null);
  if (error) erroBanco(error, "Validação da GRRF");
  await registrar(conta, { acao: "validar_lancamento", colaboradorNome: nome, campo: "valor_grrf", anterior: fech!.valorGrrf, novo: fech!.valorGrrf, origem: fonte, motivo: texto(corpo, "observacao", { max: 1000 }) || undefined });
  return { colaborador_nome: nome, componente, validado: true };
}

const ACOES: Record<string, (conta: Conta, corpo: Corpo) => Promise<unknown>> = {
  financeiro_listar: listar,
  financeiro_agregado: agregado,
  financeiro_rescisao_validar: rescisaoValidar,
  financeiro_rescisao_decidir: rescisaoDecidir,
  financeiro_modalidade_confirmar: modalidadeConfirmar,
  financeiro_grrf_registrar: grrfRegistrar,
  financeiro_fechamento_salvar: fechamentoSalvar,
  financeiro_fechamento_validar: fechamentoValidar,
};

export function ehAcaoFinanceira(acao: string): boolean {
  return acao in ACOES;
}

interface RespostaLike {
  status(c: number): { json(b: unknown): unknown };
}

export async function executarFinanceiro(acao: string, req: { headers: { authorization?: string | string[] }; body?: unknown }, res: RespostaLike) {
  try {
    const conta = await identificar(req.headers.authorization);
    const corpo = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {})) as Corpo;
    const dados = await ACOES[acao](conta, corpo);
    res.status(200).json({ ok: true, dados });
  } catch (err) {
    if (err instanceof ErroFin) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
}

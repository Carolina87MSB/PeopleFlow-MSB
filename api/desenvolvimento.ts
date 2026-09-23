// Módulo Desenvolvimento — função única de servidor (roteada por ?acao=),
// para não multiplicar Serverless Functions na Vercel a cada fase.
//
// Fase 1: só `acao=sessao`, chamada quando o usuário ENTRA no módulo
// (nunca no login). Ela:
//   1. confere a sessão Supabase e o acesso ao módulo `peopleflow` (module_access);
//   2. deriva perfil e equipe pelas MESMAS regras do PeopleFlow
//      (buildAccess/descendants, importadas — nunca copiadas);
//   3. grava a cópia derivada em peopleflow_dev_contas / peopleflow_dev_escopo
//      (validade 12 h, usada pelas políticas RLS das tabelas do módulo);
//   4. devolve só o mínimo para a interface: perfil + pessoas no escopo
//      (id, nome, cargo, departamento — nada de CPF, salário ou avaliação).
//
// Nesta fase o módulo é liberado apenas a RH e Gestor. Colaborador e
// Diretoria recebem 403 (decisões deliberadamente pendentes).
// Nunca escreve em tabelas existentes do PeopleFlow.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_lib/adminAuth.js";
import { buildAccess, descendants } from "../src/domain/hierarquia.js";
import { tempoDeEmpresa } from "../src/domain/dates.js";
import type { Colaborador } from "../src/types/domain.js";

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

// Mesmas colunas e mesmo mapeamento de api/_lib/adminAuth.ts, acrescido do id.
// cpf/nascimento/exames nunca são lidos aqui.
const COLUNAS =
  "id, nome, cargo, departamento, vinculo, depto_code, nivel, gestor, admissao, desligado, data_desligamento, motivo_desligamento, desligado_by, matriz9box_visao_completa, empresa_afiliada";

function toColaborador(row: ColaboradorRow): Colaborador {
  return {
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

export interface PessoaDesenvolvimento {
  id: number;
  nome: string;
  cargo: string;
  departamento: string;
}

/** Postgres "undefined_table": a migration supabase/desenvolvimento_fase1.sql ainda não foi aplicada. */
function tabelaInexistente(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message ?? "")));
}

async function sessao(req: VercelRequest, res: VercelResponse) {
  const raw = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  const token = raw?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    res.status(401).json({ error: "Token de autenticação ausente." });
    return;
  }
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user?.email) {
    res.status(401).json({ error: "Sessão inválida ou expirada." });
    return;
  }
  const userId = userData.user.id;
  const email = userData.user.email.toLowerCase();

  const { data: acesso, error: acessoError } = await supabaseAdmin
    .from("module_access")
    .select("modulo")
    .eq("user_id", userId)
    .eq("modulo", "peopleflow")
    .maybeSingle();
  if (acessoError) {
    res.status(500).json({ error: acessoError.message });
    return;
  }
  if (!acesso) {
    res.status(403).json({ error: "Conta sem acesso ao PeopleFlow.", codigo: "sem_acesso" });
    return;
  }

  const { data: rows, error } = await supabaseAdmin.from("colaboradores").select(COLUNAS);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const linhas = rows as ColaboradorRow[];
  const colaboradores = linhas.map(toColaborador);
  const conta = buildAccess(colaboradores).find((a) => a.email === email);

  if (!conta || (conta.perfil !== "RH" && conta.perfil !== "Gestor")) {
    res.status(403).json({ error: "O módulo Desenvolvimento ainda não está liberado para este perfil.", codigo: "sem_acesso" });
    return;
  }

  // O PeopleFlow identifica pessoas por nome; aqui o vínculo passa a ser por id.
  const minhas = linhas.filter((r) => r.nome === conta.nome && !r.desligado);
  if (minhas.length !== 1) {
    res.status(409).json({ error: "Não foi possível identificar o colaborador desta conta de forma única. Fale com o RH.", codigo: "identificacao_ambigua" });
    return;
  }
  const eu = minhas[0];

  const ativos = linhas.filter((r) => !r.desligado);
  let escopo: ColaboradorRow[];
  if (conta.perfil === "RH") {
    escopo = ativos;
  } else {
    const nomes = descendants(colaboradores, conta.nome);
    nomes.add(conta.nome);
    escopo = ativos.filter((r) => nomes.has(r.nome));
  }

  const agora = new Date().toISOString();
  const { data: anterior, error: anteriorError } = await supabaseAdmin
    .from("peopleflow_dev_contas")
    .select("colaborador_id, perfil, atualizado_em")
    .eq("user_id", userId)
    .maybeSingle();
  if (tabelaInexistente(anteriorError)) {
    res.status(200).json({ instalado: false, perfil: conta.perfil });
    return;
  }
  if (anteriorError) {
    res.status(500).json({ error: anteriorError.message });
    return;
  }

  const { error: upsertError } = await supabaseAdmin
    .from("peopleflow_dev_contas")
    .upsert({ user_id: userId, colaborador_id: eu.id, perfil: conta.perfil, atualizado_em: agora }, { onConflict: "user_id" });
  if (upsertError) {
    res.status(500).json({ error: upsertError.message });
    return;
  }

  // Equipe do gestor: substitui a cópia anterior pela atual (tabela derivada;
  // RH não precisa — as políticas liberam tudo para o perfil RH).
  const { error: limparError } = await supabaseAdmin.from("peopleflow_dev_escopo").delete().eq("gestor_colaborador_id", eu.id);
  if (limparError) {
    res.status(500).json({ error: limparError.message });
    return;
  }
  if (conta.perfil === "Gestor" && escopo.length > 0) {
    const { error: escopoError } = await supabaseAdmin
      .from("peopleflow_dev_escopo")
      .insert(escopo.map((r) => ({ gestor_colaborador_id: eu.id, colaborador_id: r.id, atualizado_em: agora })));
    if (escopoError) {
      res.status(500).json({ error: escopoError.message });
      return;
    }
  }

  const expirada = !anterior || Date.now() - new Date(anterior.atualizado_em).getTime() > 12 * 3600 * 1000;
  if (expirada || anterior.perfil !== conta.perfil || anterior.colaborador_id !== eu.id) {
    await supabaseAdmin.from("peopleflow_dev_auditoria").insert({
      user_id: userId,
      colaborador_id: eu.id,
      acao: "sessao_iniciada",
      entidade: "peopleflow_dev_contas",
      entidade_id: userId,
      detalhe: { perfil: conta.perfil, pessoas_no_escopo: escopo.length },
    });
  }

  const pessoas: PessoaDesenvolvimento[] = escopo
    .map((r) => ({ id: r.id, nome: r.nome, cargo: r.cargo ?? "", departamento: r.departamento ?? "" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  res.status(200).json({ instalado: true, perfil: conta.perfil, colaboradorId: eu.id, pessoas });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const acao = typeof req.query.acao === "string" ? req.query.acao : "";
    if (acao === "sessao" && req.method === "POST") {
      await sessao(req, res);
      return;
    }
    res.status(404).json({ error: "Ação não encontrada." });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/desenvolvimento]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}

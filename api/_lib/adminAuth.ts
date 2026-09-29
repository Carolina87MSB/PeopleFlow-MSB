// Helper compartilhado pelas Vercel Serverless Functions em api/*.ts. NUNCA
// importado pelo bundle do navegador — só roda em Node, no servidor da
// Vercel. Usa a service_role key (SUPABASE_SERVICE_ROLE_KEY, sem prefixo
// VITE_) para operações administrativas no Supabase Auth, que o cliente
// nunca pode fazer diretamente.

import { createClient } from "@supabase/supabase-js";
import { buildAccess, descendants } from "../../src/domain/hierarquia.js";
import { tempoDeEmpresa } from "../../src/domain/dates.js";
import type { Colaborador } from "../../src/types/domain.js";

const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  // eslint-disable-next-line no-console
  console.error(
    "[api] Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente da Vercel " +
      "(Project Settings > Environment Variables). SUPABASE_SERVICE_ROLE_KEY nunca deve ter prefixo VITE_.",
  );
}

export const supabaseAdmin = createClient(url || "https://placeholder.supabase.co", serviceRoleKey || "placeholder-key", {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

function fromRow(row: ColaboradorRow): Colaborador {
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

export type RequireRHResult =
  | { ok: true; colaboradores: Colaborador[] }
  | { ok: false; status: number; error: string };

/** Confere que quem chamou a function está autenticado no Supabase E tem perfil RH. */
export async function requireRH(authHeader: string | string[] | undefined): Promise<RequireRHResult> {
  if (!url || !serviceRoleKey) {
    return {
      ok: false,
      status: 500,
      error: "SUPABASE_SERVICE_ROLE_KEY (ou VITE_SUPABASE_URL) não configurada nas variáveis de ambiente da Vercel.",
    };
  }

  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = raw?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, error: "Token de autenticação ausente." };

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user?.email) {
    return { ok: false, status: 401, error: "Sessão inválida ou expirada." };
  }

  const { data, error } = await supabaseAdmin
    .from("colaboradores")
    .select(
      "id, nome, cargo, departamento, vinculo, depto_code, nivel, gestor, admissao, desligado, data_desligamento, motivo_desligamento, desligado_by, matriz9box_visao_completa, empresa_afiliada",
    );
  if (error) return { ok: false, status: 500, error: error.message };

  const colaboradores = (data as ColaboradorRow[]).map(fromRow);
  const conta = buildAccess(colaboradores).find((a) => a.email === userData.user!.email!.toLowerCase());

  if (!conta || conta.perfil !== "RH") {
    return { ok: false, status: 403, error: "Apenas RH pode gerenciar acessos." };
  }
  return { ok: true, colaboradores };
}

export type RequireRHOuGestorResult =
  | { ok: true; perfil: "RH" | "Gestor"; nomeSolicitante: string; colaboradorNome: string; colaboradores: Colaborador[] }
  | { ok: false; status: number; error: string };

/** Autorização dos documentos da movimentação (Aviso Prévio) — RH, 2026-09.
 * RH sempre libera. Gestor só quando o colaborador do documento está no seu
 * escopo hierárquico (`descendants()`, o mesmo cálculo que já decide o que
 * um Gestor vê em qualquer outra tela — nunca recalculado do zero aqui).
 * `descendants()` NUNCA inclui a própria pessoa (só descendentes reais na
 * árvore) — deliberado: "ser o próprio colaborador" não concede acesso ao
 * documento por si só (pedido explícito da RH). Localiza o colaborador por
 * `colaboradorId`, nunca por nome. */
export async function requireRHOuGestorDoColaborador(
  authHeader: string | string[] | undefined,
  colaboradorId: number,
): Promise<RequireRHOuGestorResult> {
  if (!url || !serviceRoleKey) {
    return { ok: false, status: 500, error: "SUPABASE_SERVICE_ROLE_KEY (ou VITE_SUPABASE_URL) não configurada nas variáveis de ambiente da Vercel." };
  }

  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = raw?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, error: "Token de autenticação ausente." };

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user?.email) {
    return { ok: false, status: 401, error: "Sessão inválida ou expirada." };
  }

  const { data, error } = await supabaseAdmin
    .from("colaboradores")
    .select(
      "id, nome, cargo, departamento, vinculo, depto_code, nivel, gestor, admissao, desligado, data_desligamento, motivo_desligamento, desligado_by, matriz9box_visao_completa, empresa_afiliada",
    );
  if (error) return { ok: false, status: 500, error: error.message };

  const colaboradores = (data as ColaboradorRow[]).map(fromRow);
  const alvo = colaboradores.find((c) => c.id === colaboradorId);
  if (!alvo) return { ok: false, status: 404, error: "Colaborador não encontrado." };

  const conta = buildAccess(colaboradores).find((a) => a.email === userData.user!.email!.toLowerCase());
  if (!conta) return { ok: false, status: 403, error: "Conta não encontrada no cadastro de acessos." };

  if (conta.perfil === "RH") {
    return { ok: true, perfil: "RH", nomeSolicitante: conta.nome, colaboradorNome: alvo.nome, colaboradores };
  }
  if (conta.perfil === "Gestor" && descendants(colaboradores, conta.nome).has(alvo.nome)) {
    return { ok: true, perfil: "Gestor", nomeSolicitante: conta.nome, colaboradorNome: alvo.nome, colaboradores };
  }
  return { ok: false, status: 403, error: "Sem acesso a este documento." };
}

export type RequireAuthResult = { ok: true; email: string } | { ok: false; status: number; error: string };

/** Confere só que quem chamou a function tem uma sessão Supabase válida — sem
 * checar perfil. Usada por functions que qualquer conta autenticada (Gestor,
 * Diretoria, RH) pode disparar, como o envio de notificação de movimentação
 * (quem está agindo no fluxo varia por etapa, não é sempre RH). */
export async function requireAuth(authHeader: string | string[] | undefined): Promise<RequireAuthResult> {
  if (!url || !serviceRoleKey) {
    return {
      ok: false,
      status: 500,
      error: "SUPABASE_SERVICE_ROLE_KEY (ou VITE_SUPABASE_URL) não configurada nas variáveis de ambiente da Vercel.",
    };
  }

  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = raw?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, error: "Token de autenticação ausente." };

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user?.email) {
    return { ok: false, status: 401, error: "Sessão inválida ou expirada." };
  }
  return { ok: true, email: userData.user.email.toLowerCase() };
}

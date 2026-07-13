// Helper compartilhado pelas Vercel Serverless Functions em api/*.ts. NUNCA
// importado pelo bundle do navegador — só roda em Node, no servidor da
// Vercel. Usa a service_role key (SUPABASE_SERVICE_ROLE_KEY, sem prefixo
// VITE_) para operações administrativas no Supabase Auth, que o cliente
// nunca pode fazer diretamente.

import { createClient } from "@supabase/supabase-js";
import { buildAccess } from "../../src/domain/hierarquia.js";
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
  nome: string;
  cargo: string | null;
  departamento: string | null;
  matricula: string | null;
  depto_code: string | null;
  nivel: string | null;
  gestor: string | null;
  admissao: string | null;
}

function fromRow(row: ColaboradorRow): Colaborador {
  return {
    matricula: row.matricula ?? "—",
    nome: row.nome,
    cargo: row.cargo ?? "",
    depto: row.departamento ?? "",
    deptoCode: row.depto_code ?? "—",
    nivel: (row.nivel as Colaborador["nivel"]) ?? "Operacional",
    gestor: row.gestor ?? "—",
    admissao: row.admissao ?? "",
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
    .select("nome, cargo, departamento, matricula, depto_code, nivel, gestor, admissao");
  if (error) return { ok: false, status: 500, error: error.message };

  const colaboradores = (data as ColaboradorRow[]).map(fromRow);
  const conta = buildAccess(colaboradores).find((a) => a.email === userData.user!.email!.toLowerCase());

  if (!conta || conta.perfil !== "RH") {
    return { ok: false, status: 403, error: "Apenas RH pode gerenciar acessos." };
  }
  return { ok: true, colaboradores };
}

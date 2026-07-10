// Chama as Vercel Serverless Functions em api/*.ts (RH-only) — nunca fala com
// o Supabase Auth admin diretamente do navegador, que exigiria expor a
// service_role key no bundle.

import { supabase } from "../lib/supabaseClient";
import type { Perfil } from "../types/domain";

export interface ContaAcesso {
  nome: string;
  cargo: string;
  depto: string;
  email: string;
  perfil: Perfil;
  provisionado: boolean;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listarAcessos(): Promise<ContaAcesso[]> {
  const res = await fetch("/api/listar-acessos", { headers: await authHeaders() });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Falha ao carregar acessos.");
  return body.contas;
}

export async function provisionarAcesso(email: string): Promise<{ jaExistia: boolean }> {
  const res = await fetch("/api/provisionar-acesso", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ email }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Falha ao provisionar acesso.");
  return { jaExistia: Boolean(body.jaExistia) };
}

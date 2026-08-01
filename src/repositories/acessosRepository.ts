// Chama as Vercel Serverless Functions em api/*.ts (RH-only) — nunca fala com
// o Supabase Auth admin diretamente do navegador, que exigiria expor a
// service_role key no bundle.

import { supabase } from "../lib/supabaseClient";
import type { Perfil } from "../types/domain";

/** Perfil nunca inclui "Colaborador" aqui — essa tela sempre foi (e continua
 * sendo) só RH/Diretoria/gestor imediato (buildAccess()); o acesso restrito
 * da AVD tem sua própria lista separada, ver listarAcessosAvd() abaixo. */
export interface ContaAcesso {
  nome: string;
  cargo: string;
  depto: string;
  email: string;
  perfil: Exclude<Perfil, "Colaborador">;
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

/** Lista separada de candidatos ao acesso restrito da Avaliação de
 * Desempenho (perfil "Colaborador") — ver buildAccessAvd() em
 * domain/hierarquia.ts. Nunca aparece na tela "/acessos" principal. */
export async function listarAcessosAvd(): Promise<ContaAcesso[]> {
  const res = await fetch("/api/listar-acessos-avd", { headers: await authHeaders() });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Falha ao carregar acessos da AVD.");
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

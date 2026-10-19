// Leitura (RH) das pendências do módulo Desenvolvimento ligadas a colaboradores desligados — só leitura, via api/desenvolvimento.ts.
// Falha aqui nunca derruba a página: o painel mostra só o que o front já sabe e avisa que a parte do servidor não carregou.

import { supabase } from "../lib/supabaseClient";
import type { PendenciaDesligado } from "../domain/pendenciasDesligados";

export async function getPendenciasDesenvolvimentoDeDesligados(): Promise<PendenciaDesligado[]> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch("/api/desenvolvimento?acao=pendencias_desligados", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: "{}",
  });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(corpo.error || "Falha ao carregar as pendências do módulo Desenvolvimento.");
  return (corpo.dados as PendenciaDesligado[] | undefined) ?? [];
}

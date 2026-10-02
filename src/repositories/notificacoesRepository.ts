// Chama api/notificar.ts (Vercel Serverless Function) para enviar e-mail via
// Gmail SMTP. Best-effort: erros são engolidos aqui — a ação de workflow que
// disparou a notificação (aprovar/reprovar/criar movimentação) já foi salva
// antes de chamar isto e não deve falhar por causa de um e-mail não enviado.

import { supabase } from "../lib/supabaseClient";
import type { EmailNotificacao } from "../domain/notificacoes";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function notificar(email: EmailNotificacao): Promise<void> {
  try {
    await fetch("/api/notificar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(email),
    });
  } catch {
    // silencioso — ver comentário acima.
  }
}

/** Eventos de pendência que o servidor sabe transformar em notificação — o
 * navegador só informa QUAL aconteceu (um id); destinatário, assunto e texto
 * são decididos no servidor lendo o banco (ver api/notificacoes.ts). */
export type EventoNotificacao = "mp_etapa" | "vaga_preenchimento";

/** Avisa o servidor que uma pendência acabou de surgir (MP aguardando ação de
 * alguém, ou preenchimento de vaga aguardando aprovação). Best-effort, igual a
 * notificar(): a ação que disparou isto já foi salva e não pode falhar por um
 * e-mail não enviado. */
export async function solicitarNotificacao(evento: EventoNotificacao, id: string | number): Promise<void> {
  try {
    await fetch("/api/notificacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ evento, id: String(id) }),
    });
  } catch {
    // silencioso — ver comentário acima.
  }
}

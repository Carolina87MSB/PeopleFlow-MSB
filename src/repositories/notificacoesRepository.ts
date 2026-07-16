// Chama api/notificar.ts (Vercel Serverless Function) para enviar e-mail via
// Gmail SMTP. Best-effort: erros são engolidos aqui — a ação de workflow que
// disparou a notificação (aprovar/reprovar/criar movimentação) já foi salva
// antes de chamar isto e não deve falhar por causa de um e-mail não enviado.

import { supabase } from "../lib/supabaseClient";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function notificar(to: string, subject: string, text: string): Promise<void> {
  try {
    await fetch("/api/notificar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ to, subject, text }),
    });
  } catch {
    // silencioso — ver comentário acima.
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";
import { requireAuth } from "./_lib/adminAuth.js";

const gmailUser = process.env.GMAIL_USER;
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

/** Envia e-mail de notificação do fluxo de movimentação via Gmail SMTP
 * (GMAIL_USER / GMAIL_APP_PASSWORD nas variáveis de ambiente da Vercel — a
 * senha é uma "App Password" do Google, não a senha normal da conta, e exige
 * verificação em 2 etapas habilitada). Qualquer conta autenticada pode
 * chamar (quem está agindo no fluxo varia por etapa — Gestor, Diretor,
 * CEO ou RH), diferente das demais functions em api/*.ts que são RH-only. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Método não permitido." });
      return;
    }

    const auth = await requireAuth(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    if (!gmailUser || !gmailAppPassword) {
      // eslint-disable-next-line no-console
      console.error("[api/notificar] GMAIL_USER / GMAIL_APP_PASSWORD não configuradas — notificação não enviada.");
      res.status(200).json({ ok: false, skipped: true });
      return;
    }

    const body = req.body as { to?: string; subject?: string; text?: string } | undefined;
    const to = String(body?.to || "").trim();
    const subject = String(body?.subject || "").trim();
    const text = String(body?.text || "").trim();

    if (!to || !subject || !text) {
      res.status(400).json({ error: "Informe to, subject e text." });
      return;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailAppPassword },
    });

    await transporter.sendMail({
      from: `"Portal PeopleFlow — MSB" <${gmailUser}>`,
      to,
      subject,
      text,
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/notificar]", err);
    // Best-effort: falha no envio não deve quebrar a ação de workflow que
    // disparou a notificação (aprovar/reprovar/criar já foram salvos antes).
    res.status(200).json({ ok: false, error: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}

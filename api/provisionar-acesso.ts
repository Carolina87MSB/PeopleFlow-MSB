import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireRH, supabaseAdmin } from "./_lib/adminAuth.js";
import { emailOf } from "../src/domain/hierarquia.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Método não permitido." });
      return;
    }

    const auth = await requireRH(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const email = String((req.body as { email?: string } | undefined)?.email || "")
      .trim()
      .toLowerCase();
    if (!email) {
      res.status(400).json({ error: "Informe um e-mail." });
      return;
    }

    // Defesa extra: só provisiona e-mail que corresponde a um colaborador real
    // (o mesmo cálculo que o app usa para decidir quem pode logar).
    const colaboradorAlvo = auth.colaboradores.find((c) => emailOf(c.nome) === email);
    if (!colaboradorAlvo) {
      res.status(400).json({ error: "E-mail não corresponde a nenhum colaborador cadastrado." });
      return;
    }

    const { error } = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true });
    if (error) {
      if (/already registered|already exists/i.test(error.message)) {
        res.status(200).json({ ok: true, jaExistia: true });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ ok: true, jaExistia: false });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/provisionar-acesso]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}

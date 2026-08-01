import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireRH, supabaseAdmin } from "./_lib/adminAuth.js";
import { buildAccessAvd } from "../src/domain/hierarquia.js";

/** Espelha listar-acessos.ts, mas pra lista separada do acesso restrito da
 * AVD (perfil "Colaborador", ver buildAccessAvd()) — nunca mistura com a
 * lista principal (RH/Diretoria/gestor). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Método não permitido." });
      return;
    }

    const auth = await requireRH(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const emailsComConta = new Set<string>();
    const perPage = 200;
    for (let page = 1; ; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      data.users.forEach((u) => {
        if (u.email) emailsComConta.add(u.email.toLowerCase());
      });
      if (data.users.length < perPage) break;
    }

    const contas = buildAccessAvd(auth.colaboradores).map((conta) => ({
      ...conta,
      provisionado: emailsComConta.has(conta.email),
    }));

    res.status(200).json({ contas });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/listar-acessos-avd]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}

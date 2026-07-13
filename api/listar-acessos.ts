import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireRH, supabaseAdmin } from "./_lib/adminAuth";
import { emailOf, perfilOf } from "../src/domain/hierarquia";

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

    // Junta todos os e-mails já provisionados no Supabase Auth (paginado — listUsers
    // não devolve tudo de uma vez).
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

    const contas = auth.colaboradores.map((c) => {
      const email = emailOf(c.nome);
      return {
        nome: c.nome,
        cargo: c.cargo,
        depto: c.depto,
        email,
        perfil: perfilOf(c),
        provisionado: emailsComConta.has(email),
      };
    });

    res.status(200).json({ contas });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/listar-acessos]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}

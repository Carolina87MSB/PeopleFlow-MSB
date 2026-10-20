import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireRH, supabaseAdmin } from "./_lib/adminAuth.js";
import { montarContasAcesso } from "../src/domain/contasAcesso.js";

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
    // Conta banida (banned_until no futuro) = acesso REVOGADO: existe, mas não consegue entrar. Só leitura: esta rota nunca altera contas.
    const emailsRevogados = new Set<string>();
    const agora = Date.now();
    const perPage = 200;
    for (let page = 1; ; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      data.users.forEach((u) => {
        if (!u.email) return;
        const email = u.email.toLowerCase();
        emailsComConta.add(email);
        const banidoAte = (u as { banned_until?: string | null }).banned_until;
        if (banidoAte && new Date(banidoAte).getTime() > agora) emailsRevogados.add(email);
      });
      if (data.users.length < perPage) break;
    }

    // Quem pode receber acesso + quem já saiu e ainda tem conta de login (só para consulta e decisão do RH — nada é revogado aqui).
    const contas = montarContasAcesso(auth.colaboradores, emailsComConta, emailsRevogados);

    res.status(200).json({ contas });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/listar-acessos]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}

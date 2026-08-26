import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireRH, supabaseAdmin } from "./_lib/adminAuth.js";
import { buildAccess, buildAccessAvd } from "../src/domain/hierarquia.js";

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

    // Defesa extra: só provisiona e-mail de conta elegível — RH/Diretoria/
    // gestor imediato (buildAccess(), tela /acessos) OU colaborador elegível
    // pra AVD (buildAccessAvd(), tela /desempenho > Acessos AVD). Mesma
    // criação de conta serve pras duas listas, só a validação de quem pode
    // ser provisionado é mais ampla desde a Etapa 2.1.
    const contaAlvo =
      buildAccess(auth.colaboradores).find((c) => c.email === email) ??
      buildAccessAvd(auth.colaboradores).find((c) => c.email === email);
    if (!contaAlvo) {
      res.status(400).json({ error: "E-mail não corresponde a nenhuma conta elegível." });
      return;
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true });
    let userId = created?.user?.id;
    let jaExistia = false;

    if (error) {
      if (!/already registered|already exists/i.test(error.message)) {
        res.status(500).json({ error: error.message });
        return;
      }
      jaExistia = true;
      // createUser não devolve o id de um usuário já existente — busca na
      // lista de usuários do projeto (só ~100 contas, sem paginação real
      // necessária) para poder conceder module_access mesmo neste caso.
      const { data: lista, error: listaError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (listaError) {
        res.status(500).json({ error: listaError.message });
        return;
      }
      userId = lista.users.find((u) => u.email?.toLowerCase() === email)?.id;
    }

    // Concede explicitamente peopleflow+sst — antes isto era automático via
    // trigger em auth.users (on_auth_user_created_module_access), removido
    // porque também concedia essas duas mesmas permissões a contas criadas
    // pelo Treinamentos MSB, que devem ficar isoladas (ver Etapa 2 do
    // Treinamentos). Preserva o comportamento de sempre para esta tela.
    if (userId) {
      const { error: moduleError } = await supabaseAdmin.from("module_access").upsert(
        [
          { user_id: userId, modulo: "peopleflow", concedido_por: "provisionar-acesso" },
          { user_id: userId, modulo: "sst", concedido_por: "provisionar-acesso" },
        ],
        { onConflict: "user_id,modulo", ignoreDuplicates: true },
      );
      if (moduleError) {
        res.status(500).json({ error: moduleError.message });
        return;
      }
    }

    res.status(200).json({ ok: true, jaExistia });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/provisionar-acesso]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}

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

    // Quem não é elegível pro(s) ciclo(s) atualmente abertos (admissão depois
    // da data de corte de cada um) não entra na lista de candidatos a acesso
    // — sem ciclo aberto com corte definido, ou sem admissaoIso conhecido,
    // não filtra (mantém o comportamento de antes: só tenure de buildAccessAvd()).
    const { data: ciclosAbertos, error: erroCiclos } = await supabaseAdmin
      .from("peopleflow_ciclos_avaliacao_desempenho")
      .select("data_corte_admissao")
      .eq("status", "Aberto");
    if (erroCiclos) {
      res.status(500).json({ error: erroCiclos.message });
      return;
    }
    const cortesAbertos = (ciclosAbertos ?? [])
      .map((c) => c.data_corte_admissao as string | null)
      .filter((corte): corte is string => Boolean(corte));

    const colaboradorPorNome = new Map(auth.colaboradores.map((c) => [c.nome, c]));
    const contas = buildAccessAvd(auth.colaboradores)
      .filter((conta) => {
        if (cortesAbertos.length === 0) return true;
        const admissaoIso = colaboradorPorNome.get(conta.nome)?.admissaoIso;
        if (!admissaoIso) return true;
        return cortesAbertos.some((corte) => admissaoIso <= corte);
      })
      .map((conta) => ({
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

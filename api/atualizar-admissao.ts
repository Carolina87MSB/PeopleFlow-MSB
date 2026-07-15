import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireRH, supabaseAdmin } from "./_lib/adminAuth.js";

/** Único ponto de escrita do PeopleFlow na tabela `colaboradores` (compartilhada
 * com o SST) — RLS só libera SELECT para `authenticated`, então a atualização
 * precisa passar pela service_role key aqui no servidor. Igual em espírito ao
 * api/desligar-colaborador.ts do SST: RH-only, uma coluna específica. */
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

    const body = req.body as { nome?: string; admissao?: string } | undefined;
    const nome = String(body?.nome || "").trim();
    const admissao = String(body?.admissao || "").trim();

    if (!nome) {
      res.status(400).json({ error: "Informe o nome do colaborador." });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(admissao)) {
      res.status(400).json({ error: "Data de admissão inválida (esperado aaaa-mm-dd)." });
      return;
    }

    const { error, data } = await supabaseAdmin.from("colaboradores").update({ admissao }).eq("nome", nome).select("nome");
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data || data.length === 0) {
      res.status(404).json({ error: `Colaborador "${nome}" não encontrado.` });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/atualizar-admissao]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}

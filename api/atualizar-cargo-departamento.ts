import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireRH, supabaseAdmin } from "./_lib/adminAuth.js";

/** Sincroniza cargo/departamento em `colaboradores` quando uma movimentação de
 * Promoção, Transferência ou Mudança de Função é concluída — RH-only, mesma
 * service_role key das demais functions administrativas (RLS não libera
 * UPDATE direto do navegador). Só altera as colunas informadas. */
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

    const body = req.body as { nome?: string; novoCargo?: string; novoDepto?: string } | undefined;
    const nome = String(body?.nome || "").trim();
    const novoCargo = String(body?.novoCargo || "").trim();
    const novoDepto = String(body?.novoDepto || "").trim();

    if (!nome) {
      res.status(400).json({ error: "Informe o nome do colaborador." });
      return;
    }

    const patch: Record<string, string> = {};
    if (novoCargo) patch.cargo = novoCargo;
    if (novoDepto) patch.departamento = novoDepto;
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "Nada para atualizar (informe novoCargo e/ou novoDepto)." });
      return;
    }

    const { error, data } = await supabaseAdmin.from("colaboradores").update(patch).eq("nome", nome).select("nome");
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
    console.error("[api/atualizar-cargo-departamento]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}

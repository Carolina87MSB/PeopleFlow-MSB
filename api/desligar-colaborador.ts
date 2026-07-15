import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireRH, supabaseAdmin } from "./_lib/adminAuth.js";

/** Efetiva o desligamento em `colaboradores` quando uma movimentação de
 * Desligamento é concluída no PeopleFlow — mesma lógica/colunas do botão
 * "Desligar colaborador" do Portal SST (api/desligar-colaborador.ts de lá),
 * só que disparada pela aprovação final do fluxo em vez de um botão direto.
 * RH-only, service_role (RLS não libera UPDATE direto do navegador). */
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

    const body = req.body as { nome?: string; dataIso?: string; motivo?: string; by?: string } | undefined;
    const nome = String(body?.nome || "").trim();
    const dataIso = String(body?.dataIso || "").trim();
    const motivo = String(body?.motivo || "").trim();
    const by = String(body?.by || "").trim();

    if (!nome || !motivo) {
      res.status(400).json({ error: "Informe nome e motivo do desligamento." });
      return;
    }
    if (dataIso && !/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) {
      res.status(400).json({ error: "Data de desligamento inválida (esperado aaaa-mm-dd)." });
      return;
    }

    const { error, data } = await supabaseAdmin
      .from("colaboradores")
      .update({
        desligado: true,
        data_desligamento: dataIso || null,
        motivo_desligamento: motivo,
        desligado_by: by,
      })
      .eq("nome", nome)
      .select("nome");
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
    console.error("[api/desligar-colaborador]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}

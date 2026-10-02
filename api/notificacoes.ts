// Vercel Function: dispara as notificações por e-mail de pendência que nascem
// de uma ação no portal (RH, 2026-10) — MP que ficou aguardando ação de
// alguém, ou preenchimento de vaga aguardando aprovação do gestor. Qualquer
// conta autenticada pode chamar (quem age varia por etapa), mas o navegador
// só informa QUAL evento aconteceu (um id): destinatário, assunto e texto
// NUNCA vêm da requisição — o servidor relê o estado no banco, decide se há
// pendência e quem é o responsável (ver api/_lib/notificacoesGatilhos.ts).
// Best-effort: a ação que disparou isto já foi salva antes, então falha aqui
// nunca é erro pro usuário (resposta 200, com o resultado no corpo).
//
// Diferente de api/notificar.ts (e-mails de "aprovada"/"reprovada", intocado):
// aquele aceita to/subject/html livres; este NÃO.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "./_lib/adminAuth.js";
import { notificarEtapaDaMovimentacao, notificarPreenchimentoDaVaga } from "./_lib/notificacoesGatilhos.js";

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

    // Só estes dois campos são lidos — qualquer outro (to, subject, html…) é ignorado.
    const body = (req.body ?? {}) as { evento?: unknown; id?: unknown };
    const evento = typeof body.evento === "string" ? body.evento : "";
    const id = typeof body.id === "string" || typeof body.id === "number" ? String(body.id).trim() : "";
    if (!id) {
      res.status(400).json({ error: "Informe o id do evento." });
      return;
    }

    if (evento === "mp_etapa") {
      res.status(200).json(await notificarEtapaDaMovimentacao(id, auth.email));
      return;
    }
    if (evento === "vaga_preenchimento") {
      const vagaId = Number(id);
      if (!Number.isInteger(vagaId) || vagaId <= 0) {
        res.status(400).json({ error: "Id de vaga inválido." });
        return;
      }
      res.status(200).json(await notificarPreenchimentoDaVaga(vagaId, auth.email));
      return;
    }

    res.status(400).json({ error: "Evento inválido." });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/notificacoes]", err);
    res.status(200).json({ resultado: "erro", erro: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}

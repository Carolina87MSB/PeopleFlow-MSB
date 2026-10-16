// Vercel Function chamada pelo Vercel Cron (ver `crons` em vercel.json) uma vez
// por dia — hoje só cuida do aviso de vencimento da avaliação do período de
// experiência (45/90 dias), janela D-10 a D-8, 1 e-mail por colaborador/etapa
// (ver executarCronExperiencia em api/_lib/notificacoesGatilhos.ts). Tipos
// futuros de verificação periódica entram aqui, no mesmo cron.
//
// Autenticação: o Vercel Cron manda `Authorization: Bearer ${CRON_SECRET}`
// automaticamente quando a variável CRON_SECRET existe no projeto. Sem ela
// (ou com outro valor) a chamada é recusada — a function nunca fica aberta.
// Também aceita a SUPABASE_SERVICE_ROLE_KEY (segredo de servidor que já
// existe) pra execução manual/diagnóstico. `?dryRun=1` só lista quem seria
// notificado, sem enviar nem gravar nada.
//
// Também efetiva, no cadastro, os desligamentos de MPs aprovadas cuja data chegou (ver _lib/desligamentos.ts) e atende, por sessão
// de RH, o pedido de efetivação logo após a aprovação final de uma MP de Desligamento (acao "efetivar_desligamento").

import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireRH, supabaseAdmin } from "./_lib/adminAuth.js";
import { efetivarDesligamentos } from "./_lib/desligamentos.js";
import { executarCronExperiencia } from "./_lib/notificacoesGatilhos.js";

function segredoValido(authHeader: string | string[] | undefined): boolean {
  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = raw?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const aceitos = [process.env.CRON_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY].filter((s): s is string => Boolean(s));
  return aceitos.some((segredo) => {
    const a = Buffer.from(token);
    const b = Buffer.from(segredo);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/** "Hoje" no fuso de Brasília ("aaaa-mm-dd") — a Vercel roda em UTC, e perto
 * da meia-noite UTC a data local ainda é a do dia anterior. */
function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ error: "Método não permitido." });
      return;
    }
    const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";

    if (!segredoValido(req.headers.authorization)) {
      // Único caminho autenticado por sessão: o RH pede a efetivação do desligamento de UMA MP recém-aprovada
      // (o servidor relê a MP no banco e só efetiva se ela estiver Aprovada e a data já tiver chegado).
      const corpo = (req.method === "POST" ? req.body : null) as { acao?: string; movimentacaoId?: string } | null;
      if (corpo?.acao === "efetivar_desligamento" && corpo.movimentacaoId) {
        const auth = await requireRH(req.headers.authorization);
        if (!auth.ok) {
          res.status(auth.status).json({ error: auth.error });
          return;
        }
        const desligamentos = await efetivarDesligamentos(supabaseAdmin, { hojeIso: hojeEmBrasilia(), movimentacaoId: String(corpo.movimentacaoId) });
        res.status(200).json({ ok: true, desligamentos });
        return;
      }
      res.status(401).json({ error: "Não autorizado." });
      return;
    }

    const experiencia = await executarCronExperiencia({ hojeIso: hojeEmBrasilia(), dryRun });
    // Desligamentos aprovados cuja data chegou (inclui os que estavam com data futura): isolado para uma falha aqui não derrubar o resto.
    let desligamentos: unknown;
    try {
      desligamentos = await efetivarDesligamentos(supabaseAdmin, { hojeIso: hojeEmBrasilia(), dryRun });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[api/cron-notificacoes] desligamentos", e);
      desligamentos = { erro: e instanceof Error ? e.message : String(e) };
    }
    res.status(200).json({ ok: true, experiencia, desligamentos });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/cron-notificacoes]", err);
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}

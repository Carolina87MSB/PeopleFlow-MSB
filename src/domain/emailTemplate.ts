// Layout HTML compartilhado pelos e-mails de notificação do fluxo
// (notificacoes.ts). Estilos inline (obrigatório para clientes de e-mail —
// não interpretam CSS custom properties nem <style> em muitos casos) usando
// os mesmos tons de src/index.css, para manter a identidade visual do portal.
const COR_NAVY = "#33485a";
const COR_TEXTO = "#51606b";
const COR_MUTED = "#7d8c93";
const COR_BG = "#eef5f7";
const COR_BORDA = "#e6eef1";
const COR_SURFACE_ALT = "#f6fafb";

export interface DetalheEmail {
  label: string;
  valor: string;
}

export interface EmailLayoutOptions {
  /** Cor de destaque do badge/faixa superior do card — varia por tipo de evento. */
  accentColor: string;
  accentBg: string;
  badgeLabel: string;
  title: string;
  paragrafos: string[];
  detalhes?: DetalheEmail[];
  /** Botão de destaque abaixo do card de detalhes, ex.: link para o Workflow. */
  cta?: { label: string; url: string };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildEmailHtml(opts: EmailLayoutOptions): string {
  const paragrafosHtml = opts.paragrafos
    .map((p) => `<p style="margin:0 0 14px;color:${COR_TEXTO};font-size:14px;line-height:1.6;">${escapeHtml(p)}</p>`)
    .join("");

  const detalhesHtml = opts.detalhes?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;background:${COR_SURFACE_ALT};border:1px solid ${COR_BORDA};border-radius:10px;">
        <tr><td style="padding:14px 16px;">
          ${opts.detalhes
            .map(
              (d) =>
                `<div style="padding:4px 0;font-size:13px;">
                  <span style="color:${COR_MUTED};">${escapeHtml(d.label)}:</span>
                  <strong style="color:${COR_NAVY};"> ${escapeHtml(d.valor)}</strong>
                </div>`,
            )
            .join("")}
        </td></tr>
      </table>`
    : "";

  const ctaHtml = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 4px;">
        <tr><td style="border-radius:8px;background:${opts.accentColor};">
          <a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;padding:10px 20px;font-size:13px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(opts.cta.label)}</a>
        </td></tr>
      </table>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px 12px;background:${COR_BG};font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
      <tr>
        <td style="text-align:center;padding-bottom:18px;">
          <img src="cid:msb-logo" alt="MSB — Medical System do Brasil" width="120" style="display:inline-block;" />
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;border:1px solid ${COR_BORDA};border-radius:14px;overflow:hidden;">
          <div style="background:${opts.accentBg};border-bottom:1px solid ${COR_BORDA};padding:10px 24px;">
            <span style="display:inline-block;background:${opts.accentColor};color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:.03em;text-transform:uppercase;padding:4px 10px;border-radius:20px;">${escapeHtml(opts.badgeLabel)}</span>
          </div>
          <div style="padding:22px 24px 26px;">
            <h1 style="margin:0 0 14px;color:${COR_NAVY};font-size:17px;">${escapeHtml(opts.title)}</h1>
            ${paragrafosHtml}
            ${detalhesHtml}
            ${ctaHtml}
          </div>
        </td>
      </tr>
      <tr>
        <td style="text-align:center;padding-top:18px;color:${COR_MUTED};font-size:11px;line-height:1.6;">
          Portal PeopleFlow — MSB · e-mail automático, não responda.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

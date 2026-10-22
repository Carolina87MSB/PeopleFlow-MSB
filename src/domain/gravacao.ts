// Participação por gravação: regras puras compartilhadas entre servidor e telas.
//
//   • O participante assiste à gravação (link do SharePoint), marca a declaração e confirma pelo PeopleFlow, autenticado.
//   • A confirmação registra a DECLARAÇÃO do colaborador (data, hora, usuário, método "Gravação").
//     Ela NÃO é comprovação técnica de visualização integral do vídeo — e isso é dito nas telas e na lista de presença.
//   • Só enquanto o treinamento está EM ANDAMENTO: o RH decide quando concluir; não há encerramento automático.
//   • Sem QR e sem registro manual de presença "por gravação" pelo RH: quem confirma é o próprio colaborador.

export const DECLARACAO_GRAVACAO = "Declaro que assisti ao treinamento";

export const AVISO_DECLARACAO_GRAVACAO =
  "Esta confirmação é uma declaração sua de que assistiu ao vídeo. O sistema registra a declaração com data e hora, mas não comprova tecnicamente a visualização integral.";

export const NOTA_LISTA_GRAVACAO =
  "Participação por gravação: declaração do próprio colaborador de que assistiu ao vídeo, registrada pelo PeopleFlow com data e hora; não representa comprovação técnica de visualização integral.";

/** Hospedagem aceita para o link: SharePoint (https). Evita link de terceiros/phishing para a turma inteira. */
export const DOMINIO_GRAVACAO = "sharepoint.com";

/**
 * Valida e normaliza o link da gravação. Retorna a URL (https, sem credenciais) ou null se inválida.
 * Aceita somente https em *.sharepoint.com; recusa usuário/senha na URL, outros domínios (inclusive "sharepoint.com.alheio.com") e links enormes.
 */
export function validarLinkGravacao(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const texto = bruto.trim();
  if (!texto || texto.length > 1000) return null;
  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (host !== DOMINIO_GRAVACAO && !host.endsWith(`.${DOMINIO_GRAVACAO}`)) return null;
  return u.toString();
}

export interface GravacaoDoTreinamento {
  permite_gravacao: boolean;
  gravacao_url: string | null;
}

/** O participante pode confirmar agora? (permitido, com link, treinamento em andamento, ainda sem presença confirmada). */
export function podeConfirmarPorGravacao(t: GravacaoDoTreinamento & { status: string }, presencaStatus: string): boolean {
  return t.permite_gravacao && Boolean(t.gravacao_url) && t.status === "em_andamento" && presencaStatus !== "presente";
}

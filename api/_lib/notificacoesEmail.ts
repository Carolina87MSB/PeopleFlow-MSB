// Serviço de notificações automáticas por e-mail do PeopleFlow (RH, 2026-10) —
// SÓ servidor (Vercel Functions). Ponto único por onde passa toda notificação
// "você possui uma pendência": resolve o e-mail do destinatário, registra o
// evento em `peopleflow_notificacoes_email` (log + trava contra duplicidade,
// ver seção 42 do schema.sql), envia pelo Gmail SMTP e grava o resultado.
//
// Quem chama (api/notificacoes.ts, api/cron-notificacoes.ts) decide QUEM é o
// destinatário e QUAL é a chave de deduplicação a partir do estado lido do
// banco — nunca de dados vindos do navegador. Este módulo só executa:
// reservar a chave → enviar → registrar. O navegador nunca escolhe
// destinatário, assunto ou texto: o modelo do e-mail é fixo, por tipo, e
// não carrega salário, justificativa, dado pessoal nem detalhe da pendência
// (pedido explícito do RH).
//
// Tipo novo (AVD, PDI, treinamentos…) = uma entrada em CATALOGO_NOTIFICACOES,
// sem mexer na tabela (coluna `tipo` é texto livre) nem no fluxo de envio.

import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./adminAuth.js";
import { MSB_LOGO_PNG_BASE64 } from "./msbLogo.js";
import { buildEmailHtml } from "../../src/domain/emailTemplate.js";
import { emailOf } from "../../src/domain/hierarquia.js";

export type TipoNotificacao = "mp_aguardando_acao" | "experiencia_vencimento" | "vaga_aprovacao";

export const CATALOGO_NOTIFICACOES: Record<TipoNotificacao, { pendencia: string; referenciaTipo: string }> = {
  mp_aguardando_acao: {
    pendencia: "Movimentação de Pessoal aguardando sua aprovação",
    referenciaTipo: "movimentacao",
  },
  experiencia_vencimento: {
    pendencia: "Avaliação do período de experiência próxima do vencimento",
    referenciaTipo: "avaliacao_experiencia",
  },
  vaga_aprovacao: {
    pendencia: "Aprovação do preenchimento de uma vaga",
    referenciaTipo: "vaga",
  },
};

/** Endereço do portal usado no botão do e-mail — o cron não tem navegador de
 * onde ler `window.location.origin`. `APP_BASE_URL` (Vercel) sobrescreve. */
const BASE_URL_PADRAO = "https://people-flow-msb.vercel.app";

export function baseUrlDoPortal(): string {
  return (process.env.APP_BASE_URL || BASE_URL_PADRAO).trim().replace(/\/+$/, "");
}

export const ASSUNTO_PENDENCIA = "PeopleFlow | Você possui uma pendência";

export interface EmailMontado {
  subject: string;
  text: string;
  html: string;
}

/** "Olá, [Nome]!" usa só o primeiro nome do cadastro. */
function primeiroNome(nomeCompleto: string): string {
  return nomeCompleto.trim().split(/\s+/)[0] || nomeCompleto;
}

const COR_ACENTO = "#5f89a1";
const COR_ACENTO_BG = "#e3f0f4";

/** Modelo padrão de e-mail de pendência — mesmo texto pra todos os tipos, só a
 * linha "Pendência" muda. Sem nenhum dado da movimentação/avaliação/vaga. */
export function montarEmailPendencia(p: { nome: string; pendencia: string; url: string }): EmailMontado {
  const nome = primeiroNome(p.nome);
  const intro = "Você possui uma nova pendência no PeopleFlow que precisa da sua atenção.";
  const acesse = "Acesse o portal para visualizar as informações e realizar a ação necessária:";
  const aviso = "Este é um e-mail automático. Não é necessário respondê-lo.";
  const assinatura = "RH | MSB – Medical System do Brasil";

  return {
    subject: ASSUNTO_PENDENCIA,
    text: [`Olá, ${nome}!`, ``, intro, ``, `Pendência: ${p.pendencia}`, ``, acesse, p.url, ``, aviso, assinatura].join("\n"),
    html: buildEmailHtml({
      accentColor: COR_ACENTO,
      accentBg: COR_ACENTO_BG,
      badgeLabel: "Nova pendência",
      title: `Olá, ${nome}!`,
      paragrafos: [intro],
      detalhes: [{ label: "Pendência", valor: p.pendencia }],
      paragrafosAposDetalhes: [acesse],
      cta: { label: "Acessar o PeopleFlow", url: p.url },
      rodape: [aviso, assinatura],
    }),
  };
}

export interface MensagemEmail extends EmailMontado {
  to: string;
}

const gmailUser = process.env.GMAIL_USER;
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

/** Envio real — Gmail SMTP, mesmo remetente/logo de api/notificar.ts. */
async function enviarPeloGmail(msg: MensagemEmail): Promise<void> {
  if (!gmailUser || !gmailAppPassword) {
    throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD não configuradas.");
  }
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailAppPassword } });
  await transporter.sendMail({
    from: `"Portal PeopleFlow — MSB" <${gmailUser}>`,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    attachments: [{ filename: "msb-logo.png", content: Buffer.from(MSB_LOGO_PNG_BASE64, "base64"), cid: "msb-logo" }],
  });
}

export interface ResolucaoEmail {
  email: string;
  /** Preenchido quando o e-mail não pode ser usado — nada é enviado e o motivo vai pro log. */
  erro?: string;
}

export type ResolverEmail = (nomeCompleto: string) => Promise<ResolucaoEmail>;

/** E-mail do destinatário = `emailOf(nome)` (mesma regra do login — não existe
 * coluna de e-mail em `colaboradores`), CONFERIDO contra os usuários do
 * Supabase Auth: nunca enviamos pra um endereço derivado que não existe ou que
 * não tem acesso ao portal (a pessoa não conseguiria agir de qualquer forma).
 * A lista de usuários é lida uma única vez por instância (um cron usa a mesma
 * pra todas as avaliações do dia). */
export function criarResolvedorDeEmail(admin: SupabaseClient = supabaseAdmin): ResolverEmail {
  let usuarios: Set<string> | null = null;

  async function carregarUsuarios(): Promise<Set<string>> {
    if (usuarios) return usuarios;
    const conjunto = new Set<string>();
    for (let pagina = 1; pagina <= 50; pagina++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 });
      if (error) throw new Error(`Falha ao listar usuários do Supabase Auth: ${error.message}`);
      for (const u of data.users) if (u.email) conjunto.add(u.email.toLowerCase());
      if (data.users.length < 1000) break;
    }
    usuarios = conjunto;
    return conjunto;
  }

  return async (nomeCompleto: string) => {
    const email = emailOf(nomeCompleto).toLowerCase();
    const existentes = await carregarUsuarios();
    return existentes.has(email)
      ? { email }
      : { email, erro: `O e-mail ${email} não foi encontrado entre os usuários com acesso ao PeopleFlow.` };
  };
}

export interface PedidoNotificacao {
  tipo: TipoNotificacao;
  /** Chave única do evento de negócio (formatos na seção 42 do schema.sql). */
  chaveDedup: string;
  destinatarioNome: string;
  referenciaId: string;
  /** Rota do portal que o botão abre (ex.: "/workflow?id=M-2026-030") — sempre começando com "/". */
  rota: string;
  /** Dados mínimos pra remontar o e-mail num reenvio futuro — NUNCA sensíveis. */
  contexto?: Record<string, string | number | boolean | null>;
  /** E-mail de quem acabou de executar a ação que gerou a pendência. Se for o
   * mesmo do destinatário, a notificação é registrada como "ignorado" e não
   * enviada. Só compara com ESTA ação — participar de uma etapa anterior não
   * bloqueia nada. Omitido (ex.: cron) = nunca ignora. */
  atorEmail?: string;
  /** Quando quem chama já sabe que não há como notificar (ex.: colaborador sem
   * gestor cadastrado), registra a linha como "erro" com este motivo, sem
   * tentar resolver e-mail nem enviar — o caso fica visível no log. */
  falhaPrevia?: string;
}

export type ResultadoNotificacao =
  | { resultado: "enviado"; id: number; email: string }
  | { resultado: "erro"; id: number; erro: string }
  | { resultado: "ignorado"; id: number; motivo: string }
  | { resultado: "duplicada" };

export interface DependenciasNotificacao {
  supabase?: SupabaseClient;
  resolverEmail?: ResolverEmail;
  enviarEmail?: (msg: MensagemEmail) => Promise<void>;
  baseUrl?: string;
}

const MOTIVO_AUTOACAO = "A pendência pertence a quem acabou de executar a ação.";
const TABELA = "peopleflow_notificacoes_email";

function mensagemDeErro(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

/** Registra o evento (reservando a chave) e, se for o caso, envia. Nunca lança:
 * toda falha vira uma linha com status "erro". Chave já registrada → "duplicada"
 * sem enviar nada (não existe reenvio automático nesta versão). */
export async function notificar(pedido: PedidoNotificacao, deps: DependenciasNotificacao = {}): Promise<ResultadoNotificacao> {
  const supabase = deps.supabase ?? supabaseAdmin;
  const resolverEmail = deps.resolverEmail ?? criarResolvedorDeEmail(supabase);
  const enviarEmail = deps.enviarEmail ?? enviarPeloGmail;
  const catalogo = CATALOGO_NOTIFICACOES[pedido.tipo];

  const base = {
    tipo: pedido.tipo,
    destinatario_nome: pedido.destinatarioNome,
    referencia_tipo: catalogo.referenciaTipo,
    referencia_id: pedido.referenciaId,
    chave_dedup: pedido.chaveDedup,
    contexto: pedido.contexto ?? {},
  };

  /** Reserva a chave com o status inicial. `null` = chave já existia. */
  async function reservar(extra: Record<string, unknown>): Promise<number | null> {
    const { data, error } = await supabase.from(TABELA).insert({ ...base, ...extra }).select("id").single();
    if (error) {
      if (error.code === "23505") return null;
      throw new Error(`Falha ao registrar a notificação: ${error.message}`);
    }
    return (data as { id: number }).id;
  }

  let resolucao: ResolucaoEmail;
  if (pedido.falhaPrevia) {
    resolucao = { email: "", erro: pedido.falhaPrevia };
  } else {
    try {
      resolucao = await resolverEmail(pedido.destinatarioNome);
    } catch (err) {
      resolucao = { email: "", erro: mensagemDeErro(err) };
    }
  }
  const agora = () => new Date().toISOString();

  if (resolucao.erro) {
    const id = await reservar({
      destinatario_email: resolucao.email || null,
      status: "erro",
      erro: resolucao.erro,
      ultima_tentativa_em: agora(),
    });
    return id === null ? { resultado: "duplicada" } : { resultado: "erro", id, erro: resolucao.erro };
  }

  if (pedido.atorEmail && pedido.atorEmail.toLowerCase() === resolucao.email.toLowerCase()) {
    const id = await reservar({ destinatario_email: resolucao.email, status: "ignorado", motivo_ignorado: MOTIVO_AUTOACAO });
    return id === null ? { resultado: "duplicada" } : { resultado: "ignorado", id, motivo: MOTIVO_AUTOACAO };
  }

  const id = await reservar({ destinatario_email: resolucao.email, status: "pendente_envio" });
  if (id === null) return { resultado: "duplicada" };

  const url = `${(deps.baseUrl ?? baseUrlDoPortal()).replace(/\/+$/, "")}${pedido.rota}`;
  const email = montarEmailPendencia({ nome: pedido.destinatarioNome, pendencia: catalogo.pendencia, url });

  try {
    await enviarEmail({ to: resolucao.email, ...email });
    await supabase.from(TABELA).update({ status: "enviado", tentativas: 1, ultima_tentativa_em: agora(), enviado_em: agora() }).eq("id", id);
    return { resultado: "enviado", id, email: resolucao.email };
  } catch (err) {
    const erro = mensagemDeErro(err);
    await supabase.from(TABELA).update({ status: "erro", tentativas: 1, ultima_tentativa_em: agora(), erro }).eq("id", id);
    return { resultado: "erro", id, erro };
  }
}

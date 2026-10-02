import { buildEmailHtml } from "./emailTemplate";
import { emailOf } from "./hierarquia";
import type { Etapa, Movimentacao } from "../types/domain";

export interface EmailNotificacao {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Mesmos tons de src/index.css — --color-brand-dark / --color-success /
// --color-danger — usados como faixa de destaque de cada tipo de e-mail.
const ACCENT_CONCLUIDA = { cor: "#2f8f6b", bg: "#e4f3ed" };
const ACCENT_REPROVADA = { cor: "#c0584e", bg: "#f8e7e4" };

/** Primeiro nome pro "Olá, [Nome]." do e-mail — mesmo recorte de `emailOf()`
 * (primeira palavra do nome completo cadastrado), sem remover apelidos entre
 * parênteses aqui porque eles nunca vêm antes do primeiro nome. */
function primeiroNome(nomeCompleto: string): string {
  return nomeCompleto.trim().split(/\s+/)[0] || nomeCompleto;
}

/** Link direto pra movimentação: abre o Workflow já com o Drawer de detalhes
 * dela aberto (?id=, lido em WorkflowPage.tsx) — nunca só a tela genérica,
 * senão quem recebe o e-mail teria que procurar a movimentação certa entre
 * as pendentes. */
function linkMovimentacao(m: Movimentacao, baseUrl: string): string {
  return `${baseUrl}/workflow?id=${encodeURIComponent(m.id)}`;
}

/** Notifica o solicitante quando a movimentação é concluída (todas as etapas aprovadas). */
export function notificacaoConcluida(m: Movimentacao): EmailNotificacao {
  return {
    to: emailOf(m.solicitante),
    subject: `[PeopleFlow] Movimentação aprovada — ${m.tipo} de ${m.colaborador}`,
    text: [
      `Olá,`,
      ``,
      `Sua solicitação de ${m.tipo} para ${m.colaborador} foi aprovada em todas as etapas.`,
      ``,
      `Resumo: ${m.resumo}`,
      ``,
      `Acesse o Portal PeopleFlow para ver os detalhes.`,
    ].join("\n"),
    html: buildEmailHtml({
      accentColor: ACCENT_CONCLUIDA.cor,
      accentBg: ACCENT_CONCLUIDA.bg,
      badgeLabel: "Movimentação aprovada",
      title: `${m.tipo} de ${m.colaborador}`,
      paragrafos: [
        `Sua solicitação foi aprovada em todas as etapas.`,
        `Acesse o Portal PeopleFlow para ver os detalhes.`,
      ],
      detalhes: [
        { label: "Tipo", valor: m.tipo },
        { label: "Colaborador", valor: m.colaborador },
        { label: "Resumo", valor: m.resumo },
      ],
    }),
  };
}

/** Notifica o gestor/solicitante que abriu a movimentação quando uma etapa a
 * reprova, com a justificativa. Texto/assunto fixos, mesmo motivo de
 * `notificacaoNovaEtapa()`. */
export function notificacaoReprovada(m: Movimentacao, etapa: Etapa, baseUrl: string): EmailNotificacao {
  const justificativa = etapa.comentario || "(sem justificativa informada)";
  const nome = primeiroNome(m.solicitante);
  const link = linkMovimentacao(m, baseUrl);
  return {
    to: emailOf(m.solicitante),
    subject: `[PeopleFlow] Movimentação de Pessoal reprovada`,
    text: [
      `Olá, ${nome}.`,
      ``,
      `A Movimentação de Pessoal foi reprovada.`,
      ``,
      `Para consultar os detalhes da reprovação, acesse o PeopleFlow.`,
      link,
      ``,
      `Atenciosamente,`,
      `PeopleFlow | RH – MSB`,
    ].join("\n"),
    html: buildEmailHtml({
      accentColor: ACCENT_REPROVADA.cor,
      accentBg: ACCENT_REPROVADA.bg,
      badgeLabel: "Movimentação reprovada",
      title: "Movimentação de Pessoal reprovada",
      paragrafos: [`Olá, ${nome}.`, `A Movimentação de Pessoal foi reprovada.`, `Para consultar os detalhes da reprovação, acesse o PeopleFlow.`],
      detalhes: [
        { label: "Tipo", valor: m.tipo },
        { label: "Colaborador", valor: m.colaborador },
        { label: "Reprovado por", valor: etapa.aprovador },
        { label: "Justificativa", valor: justificativa },
      ],
      cta: { label: "ACESSAR MOVIMENTAÇÃO", url: link },
    }),
  };
}

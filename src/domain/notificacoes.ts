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
const ACCENT_PENDENTE = { cor: "#3d8499", bg: "#e3f0f4" };
const ACCENT_CONCLUIDA = { cor: "#2f8f6b", bg: "#e4f3ed" };
const ACCENT_REPROVADA = { cor: "#c0584e", bg: "#f8e7e4" };

/** Notifica quem precisa agir agora: a movimentação acabou de ser criada, ou
 * uma etapa anterior acabou de ser aprovada e a próxima entrou em análise. */
export function notificacaoNovaEtapa(m: Movimentacao, etapa: Etapa): EmailNotificacao {
  const subject = `[PeopleFlow] Aprovação pendente — ${m.tipo} de ${m.colaborador}`;
  return {
    to: emailOf(etapa.aprovador),
    subject,
    text: [
      `Olá,`,
      ``,
      `Uma movimentação de ${m.tipo} para ${m.colaborador} está aguardando sua aprovação (etapa: ${etapa.papel}).`,
      ``,
      `Resumo: ${m.resumo}`,
      `Solicitado por: ${m.solicitante}`,
      ``,
      `Acesse o Portal PeopleFlow, na tela Workflow, para aprovar ou reprovar.`,
    ].join("\n"),
    html: buildEmailHtml({
      accentColor: ACCENT_PENDENTE.cor,
      accentBg: ACCENT_PENDENTE.bg,
      badgeLabel: "Aprovação pendente",
      title: `${m.tipo} de ${m.colaborador}`,
      paragrafos: [
        `Uma movimentação está aguardando a sua aprovação na etapa "${etapa.papel}".`,
        `Acesse o Portal PeopleFlow, na tela Workflow, para aprovar ou reprovar.`,
      ],
      detalhes: [
        { label: "Tipo", valor: m.tipo },
        { label: "Colaborador", valor: m.colaborador },
        { label: "Solicitado por", valor: m.solicitante },
        { label: "Resumo", valor: m.resumo },
      ],
    }),
  };
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

/** Notifica o solicitante quando uma etapa reprova a movimentação, com a justificativa. */
export function notificacaoReprovada(m: Movimentacao, etapa: Etapa): EmailNotificacao {
  const justificativa = etapa.comentario || "(sem justificativa informada)";
  return {
    to: emailOf(m.solicitante),
    subject: `[PeopleFlow] Movimentação reprovada — ${m.tipo} de ${m.colaborador}`,
    text: [
      `Olá,`,
      ``,
      `Sua solicitação de ${m.tipo} para ${m.colaborador} foi reprovada na etapa "${etapa.papel}" por ${etapa.aprovador}.`,
      ``,
      `Justificativa: ${justificativa}`,
      ``,
      `Acesse o Portal PeopleFlow para ver os detalhes.`,
    ].join("\n"),
    html: buildEmailHtml({
      accentColor: ACCENT_REPROVADA.cor,
      accentBg: ACCENT_REPROVADA.bg,
      badgeLabel: "Movimentação reprovada",
      title: `${m.tipo} de ${m.colaborador}`,
      paragrafos: [`Sua solicitação foi reprovada na etapa "${etapa.papel}", por ${etapa.aprovador}.`, `Acesse o Portal PeopleFlow para ver os detalhes.`],
      detalhes: [
        { label: "Tipo", valor: m.tipo },
        { label: "Colaborador", valor: m.colaborador },
        { label: "Justificativa", valor: justificativa },
      ],
    }),
  };
}

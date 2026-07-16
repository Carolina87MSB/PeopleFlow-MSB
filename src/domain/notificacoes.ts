import { emailOf } from "./hierarquia";
import type { Etapa, Movimentacao } from "../types/domain";

export interface EmailNotificacao {
  to: string;
  subject: string;
  text: string;
}

/** Notifica quem precisa agir agora: a movimentação acabou de ser criada, ou
 * uma etapa anterior acabou de ser aprovada e a próxima entrou em análise. */
export function notificacaoNovaEtapa(m: Movimentacao, etapa: Etapa): EmailNotificacao {
  return {
    to: emailOf(etapa.aprovador),
    subject: `[PeopleFlow] Aprovação pendente — ${m.tipo} de ${m.colaborador}`,
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
  };
}

/** Notifica o solicitante quando uma etapa reprova a movimentação, com a justificativa. */
export function notificacaoReprovada(m: Movimentacao, etapa: Etapa): EmailNotificacao {
  return {
    to: emailOf(m.solicitante),
    subject: `[PeopleFlow] Movimentação reprovada — ${m.tipo} de ${m.colaborador}`,
    text: [
      `Olá,`,
      ``,
      `Sua solicitação de ${m.tipo} para ${m.colaborador} foi reprovada na etapa "${etapa.papel}" por ${etapa.aprovador}.`,
      ``,
      `Justificativa: ${etapa.comentario || "(sem justificativa informada)"}`,
      ``,
      `Acesse o Portal PeopleFlow para ver os detalhes.`,
    ].join("\n"),
  };
}

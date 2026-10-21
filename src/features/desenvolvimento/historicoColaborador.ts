// Regras de apresentação do histórico de treinamentos de um colaborador (RH / Gestor): eficácia e evidências de cada participação.
// Funções puras — a permissão de ver a pessoa e o arquivo continua no banco (RLS) e no servidor (link temporário da evidência).

import { EFICACIA, TIPO_EVIDENCIA, type Tom } from "./rotulos";
import type { TipoEvidencia } from "./devRepository";

export interface EvidenciaDoHistorico {
  id: number;
  treinamento_id: number;
  participante_id: number | null;
  tipo: TipoEvidencia;
  file_name: string;
  enviado_em: string;
}

export interface ParticipacaoParaEficacia {
  exige_eficacia: boolean;
  eficacia_resultado: "eficaz" | "parcialmente_eficaz" | "nao_eficaz" | null;
  presenca_status: "pendente" | "presente" | "ausente";
  status_treinamento: string;
  eficacia_prazo: string | null;
}

export interface SituacaoEficacia {
  texto: string;
  tom: Tom;
  /** Prazo da avaliação (só quando ainda pendente). */
  prazo: string | null;
  vencida: boolean;
}

/** Regra espelha o servidor: só quem PARTICIPOU é avaliado, e só depois de iniciada a realização, quando o treinamento exige eficácia. */
export function situacaoEficacia(p: ParticipacaoParaEficacia, hoje: string): SituacaoEficacia {
  if (!p.exige_eficacia) return { texto: "Não exigida", tom: "neutral", prazo: null, vencida: false };
  if (p.eficacia_resultado) return { texto: EFICACIA[p.eficacia_resultado].rotulo, tom: EFICACIA[p.eficacia_resultado].tom, prazo: null, vencida: false };
  if (p.presenca_status === "presente" && (p.status_treinamento === "concluido" || p.status_treinamento === "em_andamento")) {
    const vencida = Boolean(p.eficacia_prazo && p.eficacia_prazo < hoje);
    return { texto: "Pendente", tom: vencida ? "danger" : "warning", prazo: p.eficacia_prazo, vencida };
  }
  if (p.status_treinamento === "concluido") return { texto: "Não se aplica", tom: "neutral", prazo: null, vencida: false };
  return { texto: "Após a realização", tom: "neutral", prazo: p.eficacia_prazo, vencida: false };
}

export interface EvidenciaRotulada extends EvidenciaDoHistorico {
  rotulo: string;
}

/** Evidências desta participação: lista de presença e certificados do treinamento + o que foi anexado a ESTA pessoa. Nada de outros participantes. */
export function evidenciasDaParticipacao(h: { participante_id: number; treinamento_id: number }, todas: EvidenciaDoHistorico[]): EvidenciaRotulada[] {
  const doTreinamento = todas.filter((e) => e.treinamento_id === h.treinamento_id);
  const dela = doTreinamento.filter((e) => (e.participante_id === null ? e.tipo === "lista_presenca" || e.tipo === "certificado" : e.participante_id === h.participante_id));
  const ordem: Record<string, number> = { lista_presenca: 0, certificado: 1 };
  const ordenadas = [...dela].sort((a, b) => (ordem[a.tipo] ?? 2) - (ordem[b.tipo] ?? 2) || a.id - b.id);
  const contagem = new Map<string, number>();
  for (const e of ordenadas) contagem.set(e.tipo, (contagem.get(e.tipo) ?? 0) + 1);
  const vistos = new Map<string, number>();
  return ordenadas.map((e) => {
    const n = (vistos.get(e.tipo) ?? 0) + 1;
    vistos.set(e.tipo, n);
    return { ...e, rotulo: (contagem.get(e.tipo) ?? 0) > 1 ? `${TIPO_EVIDENCIA[e.tipo]} ${n}` : TIPO_EVIDENCIA[e.tipo] };
  });
}

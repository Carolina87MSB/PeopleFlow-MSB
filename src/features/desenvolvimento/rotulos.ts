import type {
  CategoriaNecessidade,
  OrigemNecessidade,
  Formato,
  Modalidade,
  SituacaoParticipacao,
  TipoTreinamento,
  Prioridade,
  ResultadoEficacia,
  Situacao,
  StatusNecessidade,
  StatusTreinamento,
  TipoEvidencia,
} from "./devRepository";

export type Tom = "success" | "warning" | "danger" | "neutral" | "info";

export const ROTULO_ORIGEM: Record<OrigemNecessidade, string> = {
  habilidade: "Gap de habilidade",
  treinamento_obrigatorio: "Treinamento obrigatório",
  revisao_pop: "Revisão de POP",
  integracao: "Integração",
  gestor: "Gestor",
  pdi: "PDI",
  rh: "RH",
  operacional: "Operacional",
};

export const STATUS_NECESSIDADE: Record<StatusNecessidade, { rotulo: string; tom: Tom }> = {
  sugerida: { rotulo: "Sugerida", tom: "warning" },
  validada: { rotulo: "Validada", tom: "info" },
  planejada: { rotulo: "Planejada", tom: "info" },
  atendida: { rotulo: "Atendida", tom: "success" },
  cancelada: { rotulo: "Cancelada", tom: "neutral" },
};

export const CATEGORIA_NECESSIDADE: Record<CategoriaNecessidade, string> = {
  tecnica: "Técnica",
  qualidade_regulatorio: "Qualidade / Regulatório",
  seguranca: "Segurança do trabalho",
  sistemas_ferramentas: "Sistemas e ferramentas",
  comportamental: "Comportamental",
  lideranca: "Liderança",
  integracao: "Integração",
  outra: "Outra",
};

export const PRIORIDADE: Record<Prioridade, { rotulo: string; tom: Tom }> = {
  alta: { rotulo: "Alta", tom: "danger" },
  media: { rotulo: "Média", tom: "warning" },
  baixa: { rotulo: "Baixa", tom: "neutral" },
};

export const STATUS_TREINAMENTO: Record<StatusTreinamento, { rotulo: string; tom: Tom }> = {
  solicitado: { rotulo: "Solicitado", tom: "warning" },
  planejado: { rotulo: "Planejado", tom: "info" },
  em_andamento: { rotulo: "Em andamento", tom: "warning" },
  concluido: { rotulo: "Concluído", tom: "success" },
  cancelado: { rotulo: "Cancelado", tom: "neutral" },
};

export const TIPO_TREINAMENTO: Record<TipoTreinamento, string> = {
  novo_pop: "Novo POP",
  revisao_pop: "Revisão de POP",
  instrucao_trabalho: "Instrução de Trabalho",
  integracao: "Integração",
  reciclagem: "Reciclagem",
  capacitacao_tecnica: "Capacitação Técnica",
  desenvolvimento: "Desenvolvimento",
  qualidade_regulatorio: "Qualidade / Regulatório",
  saude_seguranca: "Saúde e Segurança",
  sistemas_ferramentas: "Sistemas e Ferramentas",
  outro: "Outro",
};

/** Tipos que exigem documento da Lista Mestra (código + revisão fotografados). */
export const TIPOS_COM_DOCUMENTO: TipoTreinamento[] = ["novo_pop", "revisao_pop", "instrucao_trabalho"];

export const MODALIDADE: Record<Modalidade, string> = { interno: "Interno", externo: "Externo" };

export const FORMATO: Record<Formato, string> = { presencial: "Presencial", online: "Online", hibrido: "Híbrido" };

export const SITUACAO_PARTICIPACAO: Record<SituacaoParticipacao, { rotulo: string; tom: Tom }> = {
  previsto: { rotulo: "Previsto", tom: "neutral" },
  realizado: { rotulo: "Realizado", tom: "success" },
  ausente: { rotulo: "Ausente", tom: "danger" },
  realizado_reposicao: { rotulo: "Realizado em reposição", tom: "success" },
};

export const PRESENCA: Record<"pendente" | "presente" | "ausente", { rotulo: string; tom: Tom }> = {
  pendente: { rotulo: "Pendente", tom: "neutral" },
  presente: { rotulo: "Presente", tom: "success" },
  ausente: { rotulo: "Ausente", tom: "danger" },
};

export const METODO_PRESENCA: Record<string, string> = { qr: "QR", manual: "Manual", login: "Login", importacao: "Importação" };

export const EFICACIA: Record<ResultadoEficacia, { rotulo: string; tom: Tom }> = {
  eficaz: { rotulo: "Eficaz", tom: "success" },
  parcialmente_eficaz: { rotulo: "Parcialmente eficaz", tom: "warning" },
  nao_eficaz: { rotulo: "Não eficaz", tom: "danger" },
};

export const TIPO_EVIDENCIA: Record<TipoEvidencia, string> = {
  lista_presenca: "Lista de presença",
  certificado: "Certificado",
  material: "Material",
  ata: "Ata",
  foto: "Foto",
  comprovante: "Comprovante",
  avaliacao: "Avaliação",
  outro: "Outro",
};

export const SITUACAO: Record<Situacao, { rotulo: string; tom: Tom }> = {
  em_dia: { rotulo: "Em dia", tom: "success" },
  a_vencer: { rotulo: "A vencer", tom: "warning" },
  vencido: { rotulo: "Vencido", tom: "danger" },
  revisao_pendente: { rotulo: "Revisão pendente", tom: "warning" },
  agendado: { rotulo: "Agendado", tom: "info" },
  no_prazo_integracao: { rotulo: "No prazo de integração", tom: "neutral" },
  pendente: { rotulo: "Pendente", tom: "danger" },
};

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "—";
}

export function formatarCarga(minutos: number | null | undefined): string {
  if (!minutos) return "—";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export function formatarPeriodicidade(meses: number | null | undefined): string {
  if (!meses) return "Sem validade";
  if (meses % 12 === 0) return meses === 12 ? "Anual" : `A cada ${meses / 12} anos`;
  return meses === 6 ? "Semestral" : `A cada ${meses} meses`;
}

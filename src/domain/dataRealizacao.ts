// Data EFETIVA de realização de um treinamento — mesma regra no servidor (conclusão, Lista de Presença) e na tela.
//   1. data informada (data_realizacao) é sempre preservada;
//   2. sem ela, vale o DIA em que a realização foi iniciada, no horário de Brasília (iniciado_em é gravado em UTC);
//   3. a data final PLANEJADA nunca é usada como data efetiva (é só previsão).
// Treinamento que não chegou a ser iniciado (externo concluído a partir de "planejado") não tem data a presumir: precisa ser informada.

const diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

export type OrigemDataRealizacao = "informada" | "inicio_da_realizacao";

export function dataEfetivaDeRealizacao(t: { data_realizacao?: string | null; iniciado_em?: string | null }): { data: string; origem: OrigemDataRealizacao } | null {
  if (t.data_realizacao) return { data: t.data_realizacao, origem: "informada" };
  if (t.iniciado_em) return { data: diaSP.format(new Date(t.iniciado_em)), origem: "inicio_da_realizacao" };
  return null;
}

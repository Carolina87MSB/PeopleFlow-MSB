import type { Movimentacao } from "../types/domain";

const MESES: Record<string, number> = {
  jan: 0,
  fev: 1,
  mar: 2,
  abr: 3,
  mai: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  set: 8,
  out: 9,
  nov: 10,
  dez: 11,
};

/** Parses the seed's Brazilian "dd/mmm/yyyy" date strings (e.g. "16/jun/2026") into a comparable timestamp. */
function parseDataBr(data: string): number {
  const [dia, mes, ano] = data.split("/");
  const mesIndex = MESES[mes?.toLowerCase()] ?? 0;
  return new Date(Number(ano), mesIndex, Number(dia)).getTime();
}

export interface EventoHistorico {
  key: string;
  tipoCod: Movimentacao["tipoCod"];
  titulo: string;
  descricao: string;
  data: string;
  autor: string;
  timestamp: number;
}

/** Reconstrói a trilha de auditoria (criação + etapas concluídas) a partir de uma lista de movimentações. */
export function construirEventos(movimentacoes: Movimentacao[]): EventoHistorico[] {
  const eventos: EventoHistorico[] = [];

  for (const m of movimentacoes) {
    eventos.push({
      key: `${m.id}-criacao`,
      tipoCod: m.tipoCod,
      titulo: "Movimentação criada",
      descricao: `${m.colaborador} · ${m.resumo}`,
      data: m.dataSolicitacao,
      autor: m.solicitante,
      timestamp: parseDataBr(m.dataSolicitacao),
    });

    m.etapas.forEach((etapa, i) => {
      if (!etapa.data) return;
      if (etapa.status !== "Aprovado" && etapa.status !== "Reprovado") return;
      eventos.push({
        key: `${m.id}-etapa-${i}`,
        tipoCod: m.tipoCod,
        titulo: `Etapa ${etapa.status === "Aprovado" ? "aprovada" : "reprovada"} — ${etapa.papel}`,
        descricao: `${m.colaborador} · ${m.resumo}`,
        data: etapa.data,
        autor: etapa.aprovador,
        timestamp: parseDataBr(etapa.data),
      });
    });
  }

  return eventos.sort((a, b) => b.timestamp - a.timestamp);
}

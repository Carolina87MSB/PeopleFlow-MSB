import perguntasSeed from "../data/perguntasAvaliacaoExperiencia.json";
import type {
  AvaliacaoExperiencia,
  Colaborador,
  DispensaAvaliacaoExperiencia,
  EtapaAvaliacaoExperiencia,
  PerguntaAvaliacaoExperiencia,
  RespostaAvaliacaoExperiencia,
  ResultadoAvaliacaoExperiencia,
} from "../types/domain";

export const PERGUNTAS_AVALIACAO_EXPERIENCIA = perguntasSeed as PerguntaAvaliacaoExperiencia[];

export function gerarIdAvaliacaoExperiencia(): string {
  return `AV${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Metas (% da nota final) que definem a indicação automática — combinadas
 * com o formato de contrato de experiência 45+45 usado na MSB: a etapa de
 * 45 dias só decide entre Renovar/Desligar (ainda resta a segunda metade do
 * período); a de 90 dias é a decisão final, só entre Efetivar/Desligar (não
 * há uma terceira renovação possível pela CLT). */
export const META_45_DIAS = 50;
export const META_90_DIAS = 60;

/** Nota final = média das respostas (1 a 5) convertida em percentual (média ÷ 5 × 100), 1 casa decimal. */
export function calcularNotaFinalPct(respostas: RespostaAvaliacaoExperiencia[]): number {
  if (respostas.length === 0) return 0;
  const soma = respostas.reduce((acc, r) => acc + r.nota, 0);
  const mediaSobre5 = soma / respostas.length;
  return Math.round((mediaSobre5 / 5) * 1000) / 10;
}

/** Indicação automática — sugestão do sistema; a decisão final é sempre do gestor (ver AvaliacaoExperiencia.decisaoFinal). */
export function calcularIndicacao(etapa: EtapaAvaliacaoExperiencia, notaFinalPct: number): ResultadoAvaliacaoExperiencia {
  if (etapa === "45 dias") return notaFinalPct >= META_45_DIAS ? "Renovar" : "Desligar";
  return notaFinalPct >= META_90_DIAS ? "Efetivar" : "Desligar";
}

/** Opções de decisão final válidas para cada etapa — "45 dias" nunca efetiva (ainda não completou o
 * período), "90 dias" nunca renova (não há uma terceira etapa no contrato 45+45 da MSB). */
export function opcoesDecisao(etapa: EtapaAvaliacaoExperiencia): ResultadoAvaliacaoExperiencia[] {
  return etapa === "45 dias" ? ["Renovar", "Desligar"] : ["Efetivar", "Desligar"];
}

function diasDesdeAdmissao(admissaoIso: string, hoje: Date): number | null {
  if (!admissaoIso) return null;
  const [anoStr, mesStr, diaStr] = admissaoIso.split("-");
  const ano = parseInt(anoStr, 10);
  const mesIdx = parseInt(mesStr, 10) - 1;
  const dia = parseInt(diaStr, 10);
  if (Number.isNaN(ano) || Number.isNaN(mesIdx) || Number.isNaN(dia)) return null;
  const admissao = new Date(ano, mesIdx, dia);
  const diffMs = hoje.getTime() - admissao.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export interface PendenciaAvaliacaoExperiencia {
  colaborador: Colaborador;
  etapa: EtapaAvaliacaoExperiencia;
}

/**
 * Colaboradores ativos com admissão registrada que já passaram de 45/90 dias
 * de empresa e ainda não têm a avaliação daquela etapa registrada.
 *
 * Puramente baseada em tempo de casa — nunca as duas etapas ao mesmo tempo:
 * < 45 dias → nenhuma pendência; 45–89 dias → só "45 dias"; ≥ 90 dias → só
 * "90 dias", **mesmo que a de 45 dias nunca tenha sido registrada**. Isso é
 * deliberado: cobre a regra de transição para quem foi admitido antes da
 * implantação deste módulo (o portal não vai forçar retroativamente uma
 * avaliação de 45 dias em alguém que já passou dos 90 — só a de 90 dias fica
 * pendente). Para admissões depois da implantação, o fluxo natural (avaliar
 * aos 45 antes de chegar aos 90) já garante que a de 45 dias apareça a tempo.
 *
 * `dispensas` cobre colaboradores já avaliados fora do sistema antes da
 * implantação (ver DispensaAvaliacaoExperiencia) — ficam de fora da lista
 * inteiramente, sem checar dias nem etapa.
 */
export function pendenciasAvaliacaoExperiencia(
  colaboradores: Colaborador[],
  avaliacoes: AvaliacaoExperiencia[],
  dispensas: DispensaAvaliacaoExperiencia[] = [],
  hoje: Date = new Date(),
): PendenciaAvaliacaoExperiencia[] {
  const dispensados = new Set(dispensas.map((d) => d.colaboradorNome));
  const pendencias: PendenciaAvaliacaoExperiencia[] = [];

  for (const c of colaboradores) {
    if (c.desligado || dispensados.has(c.nome)) continue;
    const dias = diasDesdeAdmissao(c.admissaoIso, hoje);
    if (dias === null || dias < 45) continue;

    if (dias < 90) {
      const avaliacao45 = avaliacoes.some((a) => a.colaboradorNome === c.nome && a.etapa === "45 dias");
      if (!avaliacao45) pendencias.push({ colaborador: c, etapa: "45 dias" });
    } else {
      const avaliacao90 = avaliacoes.some((a) => a.colaboradorNome === c.nome && a.etapa === "90 dias");
      if (!avaliacao90) pendencias.push({ colaborador: c, etapa: "90 dias" });
    }
  }

  return pendencias;
}

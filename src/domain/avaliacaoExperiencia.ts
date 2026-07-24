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
 * Colaboradores ativos, admitidos há menos de 90 dias, que ainda não têm a
 * avaliação da etapa atual registrada.
 *
 * Só entram na lista enquanto o contrato de experiência (45+45 dias) ainda
 * está em curso — < 45 dias → nenhuma pendência; ≥ 90 dias → sai da lista
 * automaticamente, tenha ou não sido avaliado (a CLT não permite prorrogar
 * além dos 90 dias, então passado esse prazo a pendência automática deixa de
 * fazer sentido; um caso perdido vira trabalho manual do RH, não deste
 * relatório). Entre 45 e 89 dias: pendente "45 dias" enquanto essa avaliação
 * não existir; assim que ela é registrada, calcula automaticamente que a
 * etapa seguinte é a "90 dias" e ela passa a aparecer pendente — dando ao
 * gestor a janela que resta até o fim do contrato para completá-la.
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
    if (dias === null || dias < 45 || dias >= 90) continue;

    const avaliacao45 = avaliacoes.some((a) => a.colaboradorNome === c.nome && a.etapa === "45 dias");
    if (!avaliacao45) {
      pendencias.push({ colaborador: c, etapa: "45 dias" });
      continue;
    }

    const avaliacao90 = avaliacoes.some((a) => a.colaboradorNome === c.nome && a.etapa === "90 dias");
    if (!avaliacao90) pendencias.push({ colaborador: c, etapa: "90 dias" });
  }

  return pendencias;
}

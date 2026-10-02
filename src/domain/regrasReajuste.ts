// Regra de cada ciclo de Reajuste Salarial — registro de REFERÊNCIA pro RH
// consultar depois qual critério valeu em cada ciclo (RH, 2026-10).
//
// Só exibição: nada aqui entra em cálculo, validação ou importação — o
// Reajuste Efetivo de cada colaborador já está gravado na linha do reajuste
// (peopleflow_reajustes_salariais) e nunca é recalculado a partir desta regra.
// Cada entrada vale ESPECIFICAMENTE pro ciclo (competência + origem) a que
// pertence: os critérios podem mudar nos próximos ciclos, então não existe
// "regra padrão" nem fallback — ciclo sem entrada simplesmente não mostra
// regra. Pra registrar um ciclo novo, acrescente uma entrada em REGRAS_POR_CICLO.

import { norm } from "./hierarquia";
import { competenciaParaIso } from "./reajusteSalarial";

export interface RegraReajusteCiclo {
  /** Texto de exibição do ciclo, ex.: "Agosto/2026". */
  competencia: string;
  /** Ex.: "AVD 2º Ciclo". */
  origem: string;
  /** Reajuste Base — em pontos percentuais (5 = 5%) por período de admissão. */
  reajusteBase: { periodo: string; percentual: number }[];
  /** Descrição de como o Reajuste Base foi definido neste ciclo. */
  descricaoBase: string;
  /** Fatorial de desempenho (9 Box) — em pontos percentuais (150 = 150%). */
  fatorial: { posicao: string; percentual: number }[];
  /** Fórmula do Reajuste Efetivo neste ciclo. */
  calculo: string;
}

const REGRAS_POR_CICLO: RegraReajusteCiclo[] = [
  {
    competencia: "Agosto/2026",
    origem: "AVD 2º Ciclo",
    descricaoBase: "Percentual definido conforme o período de admissão",
    reajusteBase: [
      { periodo: "Até setembro/2025", percentual: 5 },
      { periodo: "Outubro/2025", percentual: 4.58 },
      { periodo: "Novembro/2025", percentual: 4.16 },
      { periodo: "Dezembro/2025", percentual: 3.74 },
    ],
    fatorial: [
      { posicao: "Talento Estratégico", percentual: 150 },
      { posicao: "Alto Desempenho", percentual: 125 },
      { posicao: "Talento em Desenvolvimento", percentual: 125 },
      { posicao: "Demais posições", percentual: 100 },
    ],
    calculo: "Reajuste Base × Fatorial = Reajuste Efetivo",
  },
];

/** Regra registrada pro ciclo exato (competência + origem, sem acento/caixa);
 * `null` quando o ciclo não tem regra registrada. */
export function regraDoCiclo(competencia: string, origem: string): RegraReajusteCiclo | null {
  const iso = competenciaParaIso(competencia);
  if (!iso || !origem.trim()) return null;
  return REGRAS_POR_CICLO.find((r) => competenciaParaIso(r.competencia) === iso && norm(r.origem) === norm(origem)) ?? null;
}

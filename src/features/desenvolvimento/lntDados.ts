// Dados de um ciclo da LNT para a tela, montados com as leituras da Etapa 2b (sob RLS) e os
// cálculos de src/domain/lnt.ts — a mesma função de indicadores que o servidor usa no fechamento.

import { calcularIndicadores, pendenciasDeFechamento, type IndicadoresCiclo, type PendenciaFechamento } from "../../domain/lnt";
import { listarItensDoCiclo, listarNecessidadesDoCiclo, type ItemLnt, type NecessidadeNoCicloComViva } from "./lntRepository";

export interface DadosCiclo {
  itens: ItemLnt[];
  linhas: NecessidadeNoCicloComViva[];
}

export async function carregarDadosCiclo(cicloId: number): Promise<DadosCiclo> {
  const [itens, linhas] = await Promise.all([listarItensDoCiclo(cicloId), listarNecessidadesDoCiclo(cicloId)]);
  return { itens, linhas };
}

function paraCalculo(d: DadosCiclo) {
  return d.linhas.map((l) => ({
    decisao: l.decisao,
    item_id: l.item_id,
    departamento_na_carga: l.departamento_na_carga,
    colaborador_id: l.viva?.colaborador_id ?? null,
    alerta_treinamento_id: l.alerta_treinamento_id,
    mudou_desde_carga_em: l.mudou_desde_carga_em,
  }));
}

export function indicadoresDe(d: DadosCiclo): IndicadoresCiclo {
  return calcularIndicadores(d.itens, paraCalculo(d));
}

export function pendenciasDe(d: DadosCiclo): PendenciaFechamento[] {
  return pendenciasDeFechamento(d.itens, paraCalculo(d));
}

export const candidatasDe = (d: DadosCiclo) => d.linhas.filter((l) => l.decisao === "candidata");
export const necessidadesNaoPriorizadasDe = (d: DadosCiclo) => d.linhas.filter((l) => l.decisao === "nao_priorizada");
export const membrosDoItem = (d: DadosCiclo, itemId: number) => d.linhas.filter((l) => l.item_id === itemId);

/** Números de apoio à decisão sobre um item (calculados, nunca gravados). */
export function resumoDoItem(d: DadosCiclo, item: ItemLnt) {
  const membros = membrosDoItem(d, item.id);
  const pessoas = new Set<number>();
  const departamentos = new Set<string>();
  for (const m of membros) {
    if (m.viva?.colaborador_id != null) pessoas.add(m.viva.colaborador_id);
    if (m.departamento_na_carga) departamentos.add(m.departamento_na_carga);
  }
  return {
    necessidades: membros.length,
    pessoas: pessoas.size,
    departamentos: [...departamentos].sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}

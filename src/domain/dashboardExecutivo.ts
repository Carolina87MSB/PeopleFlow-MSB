// Dashboard Executivo de RH (People Analytics) — evolução do Dashboard Gerencial.
// Funções puras de agregação, sem estado nem dependência de UI/Supabase. Ver
// README > "Dashboard Executivo de RH".
//
// Headcount em qualquer data é reconstruído a partir de `admissaoIso`/
// `dataDesligamento`, já existentes em cada Colaborador — nenhum snapshot
// histórico é persistido. Comparação de strings ISO "aaaa-mm-dd" é comparação
// cronológica válida (lexicográfica = cronológica nesse formato).

import { dataBrParaIso, mesIsoFromDataBr, mesLabel } from "./dates";
import { mesesCompletos } from "./dates";
import type { Colaborador } from "../types/domain";

export interface FiltrosAtributosDashboard {
  setor: string;
  gestor: string;
  cargo: string;
}

/** Setor/Gestor/Cargo usados aqui são sempre o valor ATUAL do colaborador — não
 * existe rastreio histórico de mudança de setor/cargo neste app (mesma
 * simplificação já aceita em agregarDepartamentos()/agregarCargos()). */
export function filtrarPorAtributos(colaboradores: Colaborador[], filtros: FiltrosAtributosDashboard): Colaborador[] {
  return colaboradores.filter(
    (c) =>
      (filtros.setor === "Todos" || c.depto === filtros.setor) &&
      (filtros.gestor === "Todos" || c.gestor === filtros.gestor) &&
      (filtros.cargo === "Todos" || c.cargo === filtros.cargo),
  );
}

/** Roster reconstruído — quem estava ativo numa data específica. Um colaborador
 * marcado `desligado: true` mas com `dataDesligamento` não-parseável (fora do
 * contrato do tipo, não deveria ocorrer) é tratado como "ainda ativo" em
 * qualquer data de referência — intencional, evita subcontar headcount
 * histórico por dado ruim; não é um bug a corrigir com mais lógica. */
export function colaboradoresAtivosEmData(colaboradores: Colaborador[], dataIso: string): Colaborador[] {
  return colaboradores.filter((c) => {
    if (!c.admissaoIso || c.admissaoIso > dataIso) return false;
    if (!c.desligado) return true;
    const desligamentoIso = dataBrParaIso(c.dataDesligamento);
    return desligamentoIso === null || desligamentoIso > dataIso;
  });
}

export function headcountEmData(colaboradores: Colaborador[], dataIso: string): number {
  return colaboradoresAtivosEmData(colaboradores, dataIso).length;
}

export function admissoesNoPeriodo(colaboradores: Colaborador[], inicioIso: string, fimIso: string): Colaborador[] {
  return colaboradores.filter((c) => c.admissaoIso && c.admissaoIso >= inicioIso && c.admissaoIso <= fimIso);
}

export function desligamentosNoPeriodo(colaboradores: Colaborador[], inicioIso: string, fimIso: string): Colaborador[] {
  return colaboradores.filter((c) => {
    if (!c.desligado) return false;
    const iso = dataBrParaIso(c.dataDesligamento);
    return iso !== null && iso >= inicioIso && iso <= fimIso;
  });
}

export interface ResultadoTurnover {
  turnover: number | null; // null se headcountMedio = 0 (evita divisão por zero)
  admissoes: number;
  desligamentos: number;
  headcountInicial: number;
  headcountFinal: number;
  headcountMedio: number;
}

/** Turnover = ((Admissões + Desligamentos) / 2 / HeadcountMédio) * 100,
 * HeadcountMédio = (HeadcountInicial + HeadcountFinal) / 2 — fórmula literal do
 * spec. Um colaborador que admite E desliga dentro do mesmo período conta nas
 * duas pontas (Admissões e Desligamentos) mas nunca aparece em
 * HeadcountInicial/HeadcountFinal (não estava ativo em nenhuma das duas
 * bordas) — o Turnover% pode então parecer "alto" sem que
 * HeadcountInicial/Final expliquem sozinhos o porquê. Comportamento esperado
 * da fórmula pedida, não um bug. */
export function calcularTurnover(colaboradores: Colaborador[], inicioIso: string, fimIso: string): ResultadoTurnover {
  const admissoes = admissoesNoPeriodo(colaboradores, inicioIso, fimIso).length;
  const desligamentos = desligamentosNoPeriodo(colaboradores, inicioIso, fimIso).length;
  const headcountInicial = headcountEmData(colaboradores, inicioIso);
  const headcountFinal = headcountEmData(colaboradores, fimIso);
  const headcountMedio = (headcountInicial + headcountFinal) / 2;
  const turnover = headcountMedio > 0 ? ((admissoes + desligamentos) / 2 / headcountMedio) * 100 : null;
  return { turnover, admissoes, desligamentos, headcountInicial, headcountFinal, headcountMedio };
}

/** Mesma fórmula, 1 vez por setor presente na população recebida — setores
 * cujo headcountMedio dá 0 (ex.: todo mundo já desligado nas duas pontas do
 * período, dentro do recorte atual) saem do array: turnover incalculável não
 * é a mesma coisa que "0% de turnover", não faz sentido plotar como barra. */
export function turnoverPorSetor(colaboradores: Colaborador[], inicioIso: string, fimIso: string): { setor: string; turnover: number }[] {
  const setores = [...new Set(colaboradores.map((c) => c.depto))];
  return setores
    .map((setor) => ({ setor, resultado: calcularTurnover(colaboradores.filter((c) => c.depto === setor), inicioIso, fimIso) }))
    .filter((s): s is { setor: string; resultado: ResultadoTurnover & { turnover: number } } => s.resultado.turnover !== null)
    .map((s) => ({ setor: s.setor, turnover: s.resultado.turnover }))
    .sort((a, b) => b.turnover - a.turnover);
}

export interface AdmissoesDesligamentosMes {
  mes: string; // "aaaa-mm"
  mesLabel: string; // "Jul/26"
  admissoes: number;
  desligamentos: number;
}

/** Mesmo padrão de bucket mensal de custosRescisaoPorMes() (domain/desligados.ts),
 * mas as duas pontas usam parsing DIFERENTE: `admissaoIso` já vem "aaaa-mm-dd"
 * (só `.slice(0, 7)` pro bucket "aaaa-mm"), `dataDesligamento` vem "dd/mmm/aaaa"
 * (usa mesIsoFromDataBr(), igual custosRescisaoPorMes já faz) — NUNCA aplicar
 * mesIsoFromDataBr() em admissaoIso (formato errado, sempre retorna null).
 * admissoesNoPeriodo/desligamentosNoPeriodo já limitam ao período. */
export function admissoesDesligamentosPorMes(colaboradores: Colaborador[], inicioIso: string, fimIso: string): AdmissoesDesligamentosMes[] {
  const porMes = new Map<string, AdmissoesDesligamentosMes>();
  function bucket(mes: string): AdmissoesDesligamentosMes {
    let b = porMes.get(mes);
    if (!b) {
      b = { mes, mesLabel: mesLabel(mes), admissoes: 0, desligamentos: 0 };
      porMes.set(mes, b);
    }
    return b;
  }
  admissoesNoPeriodo(colaboradores, inicioIso, fimIso).forEach((c) => {
    bucket(c.admissaoIso.slice(0, 7)).admissoes += 1;
  });
  desligamentosNoPeriodo(colaboradores, inicioIso, fimIso).forEach((c) => {
    const mes = mesIsoFromDataBr(c.dataDesligamento);
    if (mes) bucket(mes).desligamentos += 1;
  });
  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

/** Média de mesesCompletos(admissaoIso, dataReferenciaIso) dos colaboradores
 * ativos EM dataReferenciaIso (não necessariamente "hoje"), arredondada pro
 * inteiro mais próximo ANTES de separar em anos/meses — arredondar cada parte
 * separadamente pode gerar "X anos e 12 meses" por carry-over. `null` se não
 * houver ninguém ativo na data de referência. */
export function tempoMedioDeEmpresa(colaboradoresAtivos: Colaborador[], dataReferenciaIso: string): { anos: number; meses: number } | null {
  if (colaboradoresAtivos.length === 0) return null;
  const somaMeses = colaboradoresAtivos.reduce((acc, c) => acc + mesesCompletos(c.admissaoIso, dataReferenciaIso), 0);
  const totalMeses = Math.round(somaMeses / colaboradoresAtivos.length);
  return { anos: Math.floor(totalMeses / 12), meses: totalMeses % 12 };
}

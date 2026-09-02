// Dashboard Executivo de RH (People Analytics) — evolução do Dashboard Gerencial.
// Funções puras de agregação, sem estado nem dependência de UI/Supabase. Ver
// README > "Dashboard Executivo de RH".
//
// Headcount em qualquer data é reconstruído a partir de `admissaoIso`/
// `dataDesligamento`, já existentes em cada Colaborador — nenhum snapshot
// histórico é persistido. Comparação de strings ISO "aaaa-mm-dd" é comparação
// cronológica válida (lexicográfica = cronológica nesse formato).

import { dataBrParaIso, mesesCompletos } from "./dates";
import { filtrarFichasGestor, mediaNotasOficiais } from "./dashboardDesempenho";
import type { AvaliacaoDesempenho, CicloAvaliacaoDesempenho, Colaborador } from "../types/domain";

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
 * histórico por dado ruim; não é um bug a corrigir com mais lógica.
 * `empresaAfiliada` (pessoas de empresa afiliada do grupo econômico, com
 * cadastro em `colaboradores` só pra fins de acesso a portal) nunca conta,
 * em nenhuma data — única fonte de verdade pra headcount MSB, usada tanto
 * pelo Dashboard Executivo quanto por `ativosGlobal`/Lista de Colaboradores
 * (ver usePortalData.ts). */
export function colaboradoresAtivosEmData(colaboradores: Colaborador[], dataIso: string): Colaborador[] {
  return colaboradores.filter((c) => {
    if (c.empresaAfiliada) return false;
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

/** Ciclo "vigente" pro indicador Performance Média da MSB = o ciclo `"Aberto"`
 * mais recente (`dataInicio`). Não há garantia estrutural de um único ciclo
 * `"Aberto"` por vez neste app (ver `StatusCicloAvaliacaoDesempenho` em
 * types/domain.ts) — em caso de mais de um, usa o mais recente; `null` se
 * nenhum ciclo estiver aberto (nenhum "vigente" pra mostrar). */
/** Ciclo usado pro indicador "Performance Média da MSB": o ciclo Aberto mais
 * recente; sem nenhum ciclo Aberto (RH já encerrou o mais recente), cai pro
 * ciclo Encerrado mais recente — assim o indicador continua mostrando a
 * última performance conhecida em vez de ficar vazio assim que um ciclo
 * fecha. `PerformanceMediaMSB.cicloEncerrado` avisa a UI quando esse
 * fallback foi usado, pra rotular o card de forma diferente. */
export function cicloVigenteAvaliacaoDesempenho(ciclos: CicloAvaliacaoDesempenho[]): CicloAvaliacaoDesempenho | null {
  const abertos = ciclos.filter((c) => c.status === "Aberto").sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
  if (abertos[0]) return abertos[0];
  const encerrados = ciclos.filter((c) => c.status === "Encerrado").sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
  return encerrados[0] ?? null;
}

export interface PerformanceMediaMSB {
  media: number | null;
  quantidadeAvaliados: number;
  ciclo: CicloAvaliacaoDesempenho | null;
  /** true quando `ciclo` veio do fallback pro ciclo Encerrado mais recente (nenhum Aberto no momento). */
  cicloEncerrado: boolean;
}

/** Indicador "Performance Média da MSB" — reaproveita 100% a lógica já usada
 * nos dashboards de Gestão de Desempenho (`filtrarFichasGestor()` +
 * `mediaNotasOficiais()`, domain/dashboardDesempenho.ts): nunca recalcula
 * nem duplica a AVD. Só entram fichas tipo GESTOR (única fonte de Nota
 * Oficial) já `statusCalibracao === "Homologada"` do ciclo vigente — como
 * uma ficha só existe pra quem era elegível quando o ciclo abriu (ver
 * elegivelParaCicloAvaliacaoDesempenho() em domain/avaliacaoDesempenho.ts),
 * "Homologada" já garante sozinho "elegível e efetivamente avaliado", sem
 * precisar checar elegibilidade de novo aqui. Sempre empresa toda, nunca
 * recortado por Setor/Gestor/Cargo — o card se chama "da MSB", não "da minha
 * equipe" (mesmo princípio de Headcount Planejado/Aderência). */
export function performanceMediaMSB(avaliacoesDesempenho: AvaliacaoDesempenho[], ciclos: CicloAvaliacaoDesempenho[]): PerformanceMediaMSB {
  const ciclo = cicloVigenteAvaliacaoDesempenho(ciclos);
  if (!ciclo) return { media: null, quantidadeAvaliados: 0, ciclo: null, cicloEncerrado: false };
  const fichas = filtrarFichasGestor(avaliacoesDesempenho, {
    cicloId: ciclo.id,
    departamento: "Todos",
    gestor: "Todos",
    cargo: "Todos",
    statusAvaliacao: "Todos",
  });
  const homologadas = fichas.filter((f) => f.statusCalibracao === "Homologada");
  return {
    media: mediaNotasOficiais(homologadas),
    quantidadeAvaliados: homologadas.length,
    ciclo,
    cicloEncerrado: ciclo.status === "Encerrado",
  };
}

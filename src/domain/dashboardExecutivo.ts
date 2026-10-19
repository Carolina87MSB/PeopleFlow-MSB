// Dashboard Executivo de RH (People Analytics) — evolução do Dashboard Gerencial.
// Funções puras de agregação, sem estado nem dependência de UI/Supabase. Ver
// README > "Dashboard Executivo de RH".
//
// Headcount em qualquer data é reconstruído a partir de `admissaoIso`/
// `dataDesligamento`, já existentes em cada Colaborador — nenhum snapshot
// histórico é persistido. Comparação de strings ISO "aaaa-mm-dd" é comparação
// cronológica válida (lexicográfica = cronológica nesse formato).

import { mesesCompletos } from "./dates";
import { filtrarFichasGestor, mediaNotasOficiais } from "./dashboardDesempenho";
import { HISTORICO_VAZIO, type HistoricoPreparado } from "./rescisoesHistorico";
import { normalizarDataIso, situacaoFuncionalEm } from "./situacaoFuncional";
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

// ── Quadro de pessoas (base de TODOS os indicadores de headcount/admissões/desligamentos/turnover) ──────────────────────────────
// Uma "pessoa do quadro" vem do cadastro (colaboradores) ou, se saiu da empresa e nunca teve cadastro, do histórico de rescisões.
// Quem está ativo numa data é decidido SEMPRE pela regra central (domain/situacaoFuncional.ts, escopo "quadro").

interface PessoaQuadro {
  chave: string;
  depto: string;
  admissaoIso: string | null;
  desligado: boolean;
  desligamentoIso: string | null;
  afiliada: boolean;
}

/** Admissão efetiva para indicadores de pessoas: quem teve estágio encerrado para efetivação mantém o início do estágio
 * (a efetivação não é saída nem nova admissão). Só leitura sobre o histórico — nunca altera o cadastro nem as MPs. */
export function admissaoEfetivaPorId(historico: HistoricoPreparado = HISTORICO_VAZIO): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const r of historico.conversoes) {
    if (r.colaboradorId === null) continue;
    const atual = mapa.get(r.colaboradorId);
    if (!atual || r.admissaoIso < atual) mapa.set(r.colaboradorId, r.admissaoIso);
  }
  return mapa;
}

/** Admissão do cadastro, trocada pelo início do estágio quando houver efetivação (a mais antiga vale). */
function admissaoParaIndicadores(c: Colaborador, efetiva: Map<number, string>): string | null {
  const adm = normalizarDataIso(c.admissaoIso);
  const inicio = efetiva.get(c.id);
  return inicio && (!adm || inicio < adm) ? inicio : adm;
}

function pessoasDoQuadro(colaboradores: Colaborador[], historico: HistoricoPreparado): PessoaQuadro[] {
  const efetiva = admissaoEfetivaPorId(historico);
  const pessoas: PessoaQuadro[] = colaboradores.map((c) => ({
    chave: `c:${c.id}`,
    depto: c.depto,
    admissaoIso: admissaoParaIndicadores(c, efetiva),
    desligado: c.desligado,
    desligamentoIso: c.desligado ? normalizarDataIso(c.dataDesligamento) : null,
    afiliada: Boolean(c.empresaAfiliada),
  }));
  for (const r of historico.saidasSemCadastro) {
    pessoas.push({ chave: `h:${r.id}`, depto: r.departamento ?? "", admissaoIso: r.admissaoIso, desligado: true, desligamentoIso: r.demissaoIso, afiliada: false });
  }
  return pessoas;
}

function ativaEm(p: PessoaQuadro, dataIso: string): boolean {
  return situacaoFuncionalEm({ admissaoIso: p.admissaoIso, desligado: p.desligado, dataDesligamentoIso: p.desligamentoIso, empresaAfiliada: p.afiliada }, dataIso, "quadro").ativo;
}

/** Roster reconstruído — quem estava ativo numa data específica, pela regra central de situação funcional (escopo "quadro"):
 * afiliada nunca conta; precisa de admissão válida e já iniciada; desligado só sai do quadro a partir da data efetiva (data futura
 * continua ativo); desligado sem data conta como ativo em datas passadas e como desligado de hoje em diante.
 * Devolve só pessoas do CADASTRO (as do histórico não existem como Colaborador); `historico` serve à continuidade do vínculo. */
export function colaboradoresAtivosEmData(colaboradores: Colaborador[], dataIso: string, historico: HistoricoPreparado = HISTORICO_VAZIO): Colaborador[] {
  const efetiva = admissaoEfetivaPorId(historico);
  return colaboradores.filter((c) =>
    ativaEm({ chave: "", depto: c.depto, admissaoIso: admissaoParaIndicadores(c, efetiva), desligado: c.desligado, desligamentoIso: c.desligado ? normalizarDataIso(c.dataDesligamento) : null, afiliada: Boolean(c.empresaAfiliada) }, dataIso),
  );
}

/** Headcount na data = ativos do cadastro + (saídas efetivas SEM cadastro que ainda estavam na empresa nessa data). */
export function headcountEmData(colaboradores: Colaborador[], dataIso: string, historico: HistoricoPreparado = HISTORICO_VAZIO): number {
  return pessoasDoQuadro(colaboradores, historico).filter((p) => ativaEm(p, dataIso)).length;
}

export function admissoesNoPeriodo(colaboradores: Colaborador[], inicioIso: string, fimIso: string, historico: HistoricoPreparado = HISTORICO_VAZIO): Colaborador[] {
  const efetiva = admissaoEfetivaPorId(historico);
  return colaboradores.filter((c) => {
    if (c.empresaAfiliada) return false;
    const adm = admissaoParaIndicadores(c, efetiva);
    return Boolean(adm && adm >= inicioIso && adm <= fimIso);
  });
}

/** Colaboradores do CADASTRO desligados no período (afiliada nunca conta). Usado pelos custos de rescisão, que dependem do fechamento financeiro do cadastro. */
export function desligamentosNoPeriodo(colaboradores: Colaborador[], inicioIso: string, fimIso: string): Colaborador[] {
  return colaboradores.filter((c) => {
    if (!c.desligado || c.empresaAfiliada) return false;
    const iso = normalizarDataIso(c.dataDesligamento);
    return iso !== null && iso >= inicioIso && iso <= fimIso;
  });
}

export interface ResultadoTurnover {
  turnover: number | null; // null se headcountMedio = 0 (evita divisão por zero)
  /** Admissões de PESSOAS no período (efetivação de estágio não conta como nova admissão). */
  admissoes: number;
  /** Saídas efetivas de pessoas no período (cadastro + histórico sem cadastro). Não inclui conversões de estágio. */
  desligamentos: number;
  headcountInicial: number;
  headcountFinal: number;
  headcountMedio: number;
  /** Encerramentos de estágio com efetivação no período (a pessoa continua na empresa). */
  conversoes: number;
  /** Quantidade de rescisões contratuais no período = saídas efetivas + conversões. */
  rescisoesContratuais: number;
  /** Quantas das saídas efetivas vêm do histórico (pessoas sem cadastro). */
  desligamentosSemCadastro: number;
  /** Pessoas cuja admissão no cadastro cai no período mas é uma efetivação (o vínculo começou antes): não contadas como admissão. */
  efetivacoesNaoContadasComoAdmissao: number;
}

/** Turnover = ((Admissões + Desligamentos) / 2 / HeadcountMédio) * 100,
 * HeadcountMédio = (HeadcountInicial + HeadcountFinal) / 2 — a FÓRMULA não mudou. O que mudou são as fontes dos eventos:
 *  • desligamentos incluem saídas efetivas de pessoas sem cadastro (histórico de rescisões);
 *  • encerramento de estágio com efetivação NÃO é desligamento nem nova admissão de pessoa;
 *  • afiliadas não entram em nenhuma das pontas (antes só ficavam fora do headcount);
 *  • o headcount usa a regra central de situação funcional.
 * Um colaborador que admite E desliga dentro do mesmo período conta nas
 * duas pontas (Admissões e Desligamentos) mas nunca aparece em
 * HeadcountInicial/HeadcountFinal — comportamento esperado da fórmula. */
export function calcularTurnover(colaboradores: Colaborador[], inicioIso: string, fimIso: string, historico: HistoricoPreparado = HISTORICO_VAZIO): ResultadoTurnover {
  const efetiva = admissaoEfetivaPorId(historico);
  const pessoas = pessoasDoQuadro(colaboradores, historico).filter((p) => !p.afiliada);
  const noPeriodo = (iso: string | null) => iso !== null && iso >= inicioIso && iso <= fimIso;
  const admissoes = pessoas.filter((p) => noPeriodo(p.admissaoIso)).length;
  const saidas = pessoas.filter((p) => p.desligado && noPeriodo(p.desligamentoIso));
  const desligamentos = saidas.length;
  const desligamentosSemCadastro = saidas.filter((p) => p.chave.startsWith("h:")).length;
  const ids = new Set(colaboradores.map((c) => c.id));
  const conversoes = historico.conversoes.filter((r) => r.colaboradorId !== null && ids.has(r.colaboradorId) && noPeriodo(r.demissaoIso)).length;
  const efetivacoesNaoContadasComoAdmissao = colaboradores.filter((c) => {
    if (c.empresaAfiliada) return false;
    const inicio = efetiva.get(c.id);
    const adm = normalizarDataIso(c.admissaoIso);
    return Boolean(inicio && adm && inicio < adm && noPeriodo(adm));
  }).length;
  const headcountInicial = pessoas.filter((p) => ativaEm(p, inicioIso)).length;
  const headcountFinal = pessoas.filter((p) => ativaEm(p, fimIso)).length;
  const headcountMedio = (headcountInicial + headcountFinal) / 2;
  const turnover = headcountMedio > 0 ? ((admissoes + desligamentos) / 2 / headcountMedio) * 100 : null;
  return { turnover, admissoes, desligamentos, headcountInicial, headcountFinal, headcountMedio, conversoes, rescisoesContratuais: desligamentos + conversoes, desligamentosSemCadastro, efetivacoesNaoContadasComoAdmissao };
}

/** Mesma fórmula, 1 vez por setor presente na população recebida (cadastro + histórico) — setores
 * cujo headcountMedio dá 0 saem do array: turnover incalculável não
 * é a mesma coisa que "0% de turnover", não faz sentido plotar como barra. */
export function turnoverPorSetor(colaboradores: Colaborador[], inicioIso: string, fimIso: string, historico: HistoricoPreparado = HISTORICO_VAZIO): { setor: string; turnover: number }[] {
  const setores = [...new Set([...colaboradores.map((c) => c.depto), ...historico.saidasSemCadastro.map((r) => r.departamento ?? "")])];
  return setores
    .map((setor) => {
      const doSetor = colaboradores.filter((c) => c.depto === setor);
      const ids = new Set(doSetor.map((c) => c.id));
      const hSetor: HistoricoPreparado = {
        saidasSemCadastro: historico.saidasSemCadastro.filter((r) => (r.departamento ?? "") === setor),
        conversoes: historico.conversoes.filter((r) => r.colaboradorId !== null && ids.has(r.colaboradorId)),
        jaNoCadastro: [],
      };
      return { setor, resultado: calcularTurnover(doSetor, inicioIso, fimIso, hSetor) };
    })
    .filter((s): s is { setor: string; resultado: ResultadoTurnover & { turnover: number } } => s.resultado.turnover !== null)
    .map((s) => ({ setor: s.setor, turnover: s.resultado.turnover }))
    .sort((a, b) => b.turnover - a.turnover);
}

/** Média de mesesCompletos(admissaoIso, dataReferenciaIso) dos colaboradores
 * ativos EM dataReferenciaIso (não necessariamente "hoje"), arredondada pro
 * inteiro mais próximo ANTES de separar em anos/meses — arredondar cada parte
 * separadamente pode gerar "X anos e 12 meses" por carry-over. `null` se não
 * houver ninguém ativo na data de referência. */
export function tempoMedioDeEmpresa(
  colaboradoresAtivos: Colaborador[],
  dataReferenciaIso: string,
  /** Admissão efetiva (início do vínculo de estágio de quem foi efetivado) — ver admissaoEfetivaPorId(). */
  admissaoEfetiva?: Map<number, string>,
): { anos: number; meses: number } | null {
  if (colaboradoresAtivos.length === 0) return null;
  const somaMeses = colaboradoresAtivos.reduce((acc, c) => acc + mesesCompletos(admissaoEfetiva?.get(c.id) ?? c.admissaoIso, dataReferenciaIso), 0);
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

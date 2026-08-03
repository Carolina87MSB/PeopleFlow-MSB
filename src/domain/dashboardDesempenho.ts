// Dashboards e Relatórios (Etapa 8) — funções puras de agregação sobre dados
// já existentes (AVD, Avaliação de Potencial, Matriz 9 Box). Sem estado nem
// dependência de UI/Supabase. Ver README > "Gestão de Desempenho".

import { arredondar, mediaAfirmacoes, notaKpi } from "./avaliacaoDesempenho";
import { classificarFaixaMatriz9Box, posicionarMatriz9Box } from "./matriz9Box";
import type {
  AvaliacaoDesempenho,
  AvaliacaoPotencial,
  CicloAvaliacaoDesempenho,
  ConfigAvaliacaoDesempenho,
  FaixaMatriz9Box,
  StatusAvaliacaoDesempenho,
} from "../types/domain";

export interface FiltrosDashboard {
  /** "" = "Todos" — só relevante pra evolucaoPorCiclo(), que ignora este filtro por definição; os outros 2 blocos de "foto do momento" (média/distribuição/Matriz 9 Box) sempre recebem um ciclo real (o `<select>` de ciclo dos dashboards nunca oferece "Todos", pra não contar a mesma pessoa 2x). */
  cicloId: string;
  departamento: string;
  gestor: string;
  cargo: string;
  statusAvaliacao: StatusAvaliacaoDesempenho | "Todos";
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((soma, v) => soma + v, 0) / valores.length;
}

/** Aplica os 5 filtros compartilhados sobre um conjunto de fichas — sempre
 * restringe a `tipo === "GESTOR"` primeiro (única fonte de Nota Oficial e de
 * dado organizacional; AUTOAVALIACAO/LIDERANCA nunca entram nos dashboards,
 * senão contaminariam qualquer métrica "organizacional"). Mesma lógica pros
 * 3 dashboards — só muda a população de entrada (empresa toda pra
 * RH/Diretoria, só a equipe pra Gestor, ver `colaboradoresListagem` em
 * usePortalData.ts). */
export function filtrarFichasGestor(fichas: AvaliacaoDesempenho[], filtros: FiltrosDashboard): AvaliacaoDesempenho[] {
  return fichas.filter(
    (f) =>
      f.tipo === "GESTOR" &&
      (filtros.cicloId === "" || f.cicloId === filtros.cicloId) &&
      (filtros.departamento === "Todos" || f.departamento === filtros.departamento) &&
      (filtros.gestor === "Todos" || f.gestorAvaliador === filtros.gestor) &&
      (filtros.cargo === "Todos" || f.cargo === filtros.cargo) &&
      (filtros.statusAvaliacao === "Todos" || f.status === filtros.statusAvaliacao),
  );
}

/** Mesmos 4 filtros (sem `tipo`, que não existe em AvaliacaoPotencial — só
 * há 1 ficha de Potencial por colaborador/ciclo, não 3 como na AVD) sobre um
 * conjunto de fichas de Avaliação de Potencial — usado pelos mesmos 3
 * dashboards pro bloco "distribuição de notas de potencial". */
export function filtrarPotencial(fichas: AvaliacaoPotencial[], filtros: FiltrosDashboard): AvaliacaoPotencial[] {
  return fichas.filter(
    (f) =>
      (filtros.cicloId === "" || f.cicloId === filtros.cicloId) &&
      (filtros.departamento === "Todos" || f.departamento === filtros.departamento) &&
      (filtros.gestor === "Todos" || f.gestorAvaliador === filtros.gestor) &&
      (filtros.cargo === "Todos" || f.cargo === filtros.cargo) &&
      (filtros.statusAvaliacao === "Todos" || f.status === filtros.statusAvaliacao),
  );
}

/** Média das Notas Oficiais — só fichas já `statusCalibracao === "Homologada"`,
 * nunca a nota bruta do gestor (mesma regra da Etapa 6). */
export function mediaNotasOficiais(fichasHomologadas: AvaliacaoDesempenho[]): number | null {
  const notas = fichasHomologadas.map((f) => f.notaFinalOficial).filter((n): n is number => n !== null);
  return arredondar(media(notas));
}

export interface MediaPorSetor {
  setor: string;
  media: number | null;
  quantidade: number;
}

export function mediaPorSetor(fichasHomologadas: AvaliacaoDesempenho[]): MediaPorSetor[] {
  const porSetor = new Map<string, number[]>();
  for (const f of fichasHomologadas) {
    if (f.notaFinalOficial === null) continue;
    const lista = porSetor.get(f.departamento) ?? [];
    lista.push(f.notaFinalOficial);
    porSetor.set(f.departamento, lista);
  }
  return Array.from(porSetor.entries())
    .map(([setor, notas]) => ({ setor, media: arredondar(media(notas)), quantidade: notas.length }))
    .sort((a, b) => (b.media ?? 0) - (a.media ?? 0));
}

export interface EvolucaoCiclo {
  ciclo: string;
  media: number | null;
}

/** IGNORA o filtro de ciclo do dashboard (é o único bloco que sempre olha
 * todos) — `fichasHomologadas` deve vir filtrada por departamento/gestor/
 * cargo/status com `cicloId: ""` (`filtrarFichasGestor` com esse filtro
 * "desligado"). Ordena por `dataInicio` do ciclo, não por nome. */
export function evolucaoPorCiclo(fichasHomologadas: AvaliacaoDesempenho[], ciclos: CicloAvaliacaoDesempenho[]): EvolucaoCiclo[] {
  const porCiclo = new Map<string, number[]>();
  for (const f of fichasHomologadas) {
    if (f.notaFinalOficial === null) continue;
    const lista = porCiclo.get(f.cicloId) ?? [];
    lista.push(f.notaFinalOficial);
    porCiclo.set(f.cicloId, lista);
  }
  return ciclos
    .slice()
    .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))
    .filter((c) => porCiclo.has(c.id))
    .map((c) => ({ ciclo: c.nome, media: arredondar(media(porCiclo.get(c.id) ?? [])) }));
}

export interface DistribuicaoFaixa {
  faixa: FaixaMatriz9Box;
  quantidade: number;
}

const ORDEM_FAIXAS: FaixaMatriz9Box[] = ["Baixo", "Médio", "Alto"];

/** Reaproveita classificarFaixaMatriz9Box() — mesmos limiares configuráveis
 * já usados na Matriz 9 Box. Serve tanto pra distribuição de notas de
 * Desempenho quanto de Potencial (o chamador passa os limiares certos). */
export function distribuicaoPorFaixa(notas: (number | null)[], limiteMedio: number, limiteAlto: number): DistribuicaoFaixa[] {
  const contagem: Record<FaixaMatriz9Box, number> = { Baixo: 0, Médio: 0, Alto: 0 };
  for (const nota of notas) {
    if (nota === null) continue;
    contagem[classificarFaixaMatriz9Box(nota, limiteMedio, limiteAlto)] += 1;
  }
  return ORDEM_FAIXAS.map((faixa) => ({ faixa, quantidade: contagem[faixa] }));
}

/** Reaproveita posicionarMatriz9Box() — 1 par por colaborador (nota Oficial
 * de Desempenho + nota Oficial de Potencial, mesmo ciclo, ambas já
 * Homologadas — nunca "Todos" os ciclos agregados, pra não contar a mesma
 * pessoa 2x). Chave `${faixaPotencial}|${faixaDesempenho}` — o nome do
 * quadrante (NOMES_QUADRANTES_MATRIZ_9_BOX) é resolvido no componente. */
export function distribuicaoMatriz9Box(
  pares: { notaDesempenho: number; notaPotencial: number }[],
  config: ConfigAvaliacaoDesempenho | null,
): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const par of pares) {
    const posicao = posicionarMatriz9Box(par.notaDesempenho, par.notaPotencial, config);
    if (!posicao) continue;
    const chave = `${posicao.faixaPotencial}|${posicao.faixaDesempenho}`;
    contagem[chave] = (contagem[chave] ?? 0) + 1;
  }
  return contagem;
}

export interface MediaPorCompetencia {
  nome: string;
  media: number;
}

/** Varre resultadosComportamentais de fichas tipo "GESTOR" (garantido por
 * quem monta `fichasConcluidasGestor`, tipicamente via filtrarFichasGestor())
 * com `status === "Concluída"` — não precisa "Homologada", a calibração
 * nunca ajusta uma competência isolada, só o agregado comportamental.
 * Agrupa por `competenciaId` (catálogo único e estável) — o chamador decide
 * top/bottom N a partir do array ordenado (desc). */
export function mediasPorCompetencia(fichasConcluidasGestor: AvaliacaoDesempenho[]): MediaPorCompetencia[] {
  const porCompetencia = new Map<string, { nome: string; notas: number[] }>();
  for (const f of fichasConcluidasGestor) {
    for (const r of f.resultadosComportamentais) {
      const notaMedia = mediaAfirmacoes(r.notasAfirmacoes);
      if (notaMedia === null) continue;
      const entrada = porCompetencia.get(r.competenciaId) ?? { nome: r.competenciaNome, notas: [] };
      entrada.notas.push(notaMedia);
      porCompetencia.set(r.competenciaId, entrada);
    }
  }
  return Array.from(porCompetencia.values())
    .map(({ nome, notas }) => ({ nome, media: arredondar(media(notas)) as number }))
    .sort((a, b) => b.media - a.media);
}

export interface MediaPorKpi {
  nome: string;
  /** Cargo (código bruto, ver formatarNomeCargo em domain/formatoCargo.ts pra
   * exibição) — exposto à parte do nome do KPI porque `kpiNome` sozinho NÃO é
   * uma chave segura entre cargos diferentes (`KpiCargo` "sem id estável
   * entre cargos", ver types/domain.ts): dois cargos podem ter um KPI de
   * MESMO nome medindo coisas diferentes (ex.: "Produtividade" em Vendas vs.
   * em Produção). Mostrar o cargo junto ao nome no ranking é a mitigação
   * aceita (mesma simplificação já assumida na Biblioteca de KPI do PDI). */
  cargo: string;
  media: number;
}

/** Mesma ideia de mediasPorCompetencia() pra resultadosKpis, agrupado por
 * `kpiNome + cargo` (ver caveat em MediaPorKpi) em vez de só `kpiNome`. Usa
 * a nota derivada (1-5, notaKpi()) em vez do `resultado` bruto — escalas e
 * unidades de KPIs diferentes não são comparáveis entre si. */
export function mediasPorKpi(fichasConcluidasGestor: AvaliacaoDesempenho[]): MediaPorKpi[] {
  const porKpi = new Map<string, { nome: string; cargo: string; notas: number[] }>();
  for (const f of fichasConcluidasGestor) {
    for (const r of f.resultadosKpis) {
      const nota = notaKpi(r);
      if (nota === null) continue;
      const chave = `${r.kpiNome}::${f.cargo}`;
      const entrada = porKpi.get(chave) ?? { nome: r.kpiNome, cargo: f.cargo, notas: [] };
      entrada.notas.push(nota);
      porKpi.set(chave, entrada);
    }
  }
  return Array.from(porKpi.values())
    .map(({ nome, cargo, notas }) => ({ nome, cargo, media: arredondar(media(notas)) as number }))
    .sort((a, b) => b.media - a.media);
}

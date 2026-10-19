// Relatório de PENDÊNCIAS ligadas a colaboradores desligados — funções puras. Só LISTA: nada é encerrado, concluído ou reatribuído sozinho;
// cada item traz o módulo, o processo, a pessoa e a ação recomendada, para o RH decidir.
//
// Este arquivo cobre os dados que o front já carrega (AVD, potencial, PDI, movimentações, fechamento financeiro, qualidade de dados).
// As pendências do módulo Desenvolvimento (treinamentos, necessidades, responsáveis) vêm do servidor (api/_lib/pendenciasDesligados.ts).

import { estaAtivoHoje, hojeBrasilia, normalizarDataIso, situacaoFuncionalEm } from "./situacaoFuncional.js";
import type {
  AvaliacaoDesempenho,
  AvaliacaoPotencial,
  CicloAvaliacaoDesempenho,
  Colaborador,
  DesligamentoFinanceiro,
  Movimentacao,
  Pdi,
} from "../types/domain.js";

export interface PendenciaDesligado {
  modulo: string;
  processo: string;
  colaborador: string;
  detalhe: string;
  acaoRecomendada: string;
  /** Identificador do registro de origem (id da ficha, da MP, do PDI…), quando existir. */
  referencia?: string;
}

export interface DadosParaPendencias {
  colaboradores: Colaborador[];
  ciclos: CicloAvaliacaoDesempenho[];
  avaliacoesDesempenho: AvaliacaoDesempenho[];
  avaliacoesPotencial: AvaliacaoPotencial[];
  pdi: Pdi[];
  movimentacoes: Movimentacao[];
  desligamentosFinanceiros: DesligamentoFinanceiro[];
  hoje?: string;
}

/** Nomes de quem consta no cadastro só como desligado (nenhum registro ativo com o mesmo nome). */
export function nomesDeDesligados(colaboradores: Colaborador[], hoje: string = hojeBrasilia()): Set<string> {
  const ativos = new Set(colaboradores.filter((c) => estaAtivoHoje(c, "acesso", hoje)).map((c) => c.nome));
  return new Set(colaboradores.filter((c) => !estaAtivoHoje(c, "acesso", hoje) && !ativos.has(c.nome)).map((c) => c.nome));
}

const ETAPA_ABERTA = new Set(["Em análise", "Aguardando"]);

export function pendenciasFrontDeDesligados(d: DadosParaPendencias): PendenciaDesligado[] {
  const hoje = d.hoje ?? hojeBrasilia();
  const desligados = nomesDeDesligados(d.colaboradores, hoje);
  const ciclosAbertos = new Set(d.ciclos.filter((c) => c.status === "Aberto").map((c) => c.id));
  const out: PendenciaDesligado[] = [];

  // ── Avaliação de Desempenho / Potencial: só ciclos abertos, só o que ainda não foi concluído nem marcado "Não Elegível" ──
  for (const a of d.avaliacoesDesempenho) {
    if (!ciclosAbertos.has(a.cicloId) || a.status === "Concluída" || a.status === "Não Elegível") continue;
    const base = { modulo: "Avaliação de Desempenho", referencia: a.id } as const;
    if (a.tipo === "LIDERANCA") {
      if (desligados.has(a.colaboradorNome)) out.push({ ...base, processo: `Ficha de avaliação de liderança — ${a.ciclo}`, colaborador: a.colaboradorNome, detalhe: "O(a) avaliador(a) (liderado) foi desligado(a); a ficha segue pendente.", acaoRecomendada: "Marcar a ficha como Não Elegível (RH). Não concluir." });
      else if (desligados.has(a.avaliado)) out.push({ ...base, processo: `Ficha de avaliação de liderança — ${a.ciclo}`, colaborador: a.avaliado, detalhe: `${a.colaboradorNome} avalia um líder que já foi desligado.`, acaoRecomendada: "Marcar a ficha como Não Elegível (RH) ou avaliar o líder atual." });
      continue;
    }
    if (desligados.has(a.colaboradorNome)) {
      out.push({ ...base, processo: `Ficha ${a.tipo === "AUTOAVALIACAO" ? "de autoavaliação" : "do gestor"} — ${a.ciclo}`, colaborador: a.colaboradorNome, detalhe: `Status "${a.status}": a pessoa foi desligada e a ficha não foi concluída.`, acaoRecomendada: "Marcar como Não Elegível (RH). Concluir geraria PDI para quem saiu." });
    } else if (a.tipo === "GESTOR" && a.gestorAvaliador && desligados.has(a.gestorAvaliador)) {
      out.push({ ...base, processo: `Ficha do gestor — ${a.ciclo}`, colaborador: a.colaboradorNome, detalhe: `O gestor avaliador (${a.gestorAvaliador}) foi desligado; só o RH consegue editar a ficha.`, acaoRecomendada: "RH preenche/conclui a ficha ou define o novo avaliador." });
    }
  }
  for (const a of d.avaliacoesPotencial) {
    if (!ciclosAbertos.has(a.cicloId) || a.status === "Concluída" || a.status === "Não Elegível") continue;
    if (desligados.has(a.colaboradorNome)) out.push({ modulo: "Avaliação de Potencial", processo: `Ficha de potencial — ${a.ciclo}`, colaborador: a.colaboradorNome, detalhe: `Status "${a.status}": a pessoa foi desligada.`, acaoRecomendada: "Marcar como Não Elegível (RH).", referencia: a.id });
    else if (a.gestorAvaliador && desligados.has(a.gestorAvaliador)) out.push({ modulo: "Avaliação de Potencial", processo: `Ficha de potencial — ${a.ciclo}`, colaborador: a.colaboradorNome, detalhe: `O gestor avaliador (${a.gestorAvaliador}) foi desligado.`, acaoRecomendada: "RH preenche a ficha ou define o novo avaliador.", referencia: a.id });
  }

  // ── PDI em andamento de quem saiu ──
  for (const p of d.pdi) {
    if (p.status === "Concluído" || !desligados.has(p.colaboradorNome)) continue;
    out.push({ modulo: "PDI", processo: `PDI ${p.ciclo || ""}`.trim(), colaborador: p.colaboradorNome, detalhe: `PDI "${p.status}" de colaborador(a) desligado(a).`, acaoRecomendada: "Decisão do RH: arquivar/encerrar o PDI ou mantê-lo apenas como histórico.", referencia: String(p.id) });
  }

  // ── Movimentações de Pessoal em andamento ──
  for (const m of d.movimentacoes) {
    if (m.status !== "Em Aprovação") {
      // desligamento aprovado: efetivação cadastral e divergência de datas
      if (m.tipoCod === "DES" && m.status === "Aprovado" && m.desligamentoInfo?.nome) {
        const cad = d.colaboradores.filter((c) => c.nome === m.desligamentoInfo!.nome);
        const ativo = cad.find((c) => estaAtivoHoje(c, "acesso", hoje));
        const dataMp = m.desligamentoInfo.dataIso || null;
        if (ativo && dataMp && dataMp <= hoje && !m.sincronizadoEm) {
          out.push({ modulo: "Movimentações de Pessoal", processo: `Desligamento aprovado — ${m.id}`, colaborador: m.desligamentoInfo.nome, detalhe: `Aprovado com data ${dataMp}, mas o cadastro ainda o mostra como ativo.`, acaoRecomendada: "A rotina diária efetiva sozinha; se persistir, verificar nome/vínculo do cadastro.", referencia: m.id });
        }
        const desl = cad.find((c) => c.desligado && normalizarDataIso(c.dataDesligamento));
        if (desl && dataMp && normalizarDataIso(desl.dataDesligamento) !== dataMp) {
          out.push({ modulo: "Movimentações de Pessoal", processo: `Desligamento — ${m.id}`, colaborador: desl.nome, detalhe: `Data da MP (${dataMp}) difere da data no cadastro (${normalizarDataIso(desl.dataDesligamento)}).`, acaoRecomendada: "Conferir a data correta (folha/SST). Nada é alterado automaticamente.", referencia: m.id });
        }
      }
      continue;
    }
    if (m.tipoCod !== "DES" && desligados.has(m.colaborador)) {
      out.push({ modulo: "Movimentações de Pessoal", processo: `${m.tipoCod} em aprovação — ${m.id}`, colaborador: m.colaborador, detalhe: "Movimentação em andamento para colaborador(a) já desligado(a).", acaoRecomendada: "Revisar: reprovar/cancelar a MP (decisão do RH).", referencia: m.id });
    }
    const etapa = m.etapas.find((e) => ETAPA_ABERTA.has(e.status));
    if (etapa && desligados.has(etapa.aprovador)) {
      out.push({ modulo: "Movimentações de Pessoal", processo: `${m.tipoCod} em aprovação — ${m.id}`, colaborador: m.colaborador, detalhe: `Etapa "${etapa.papel}" aguarda ${etapa.aprovador}, que foi desligado(a).`, acaoRecomendada: "RH reabre/reatribui a etapa ao gestor atual.", referencia: m.id });
    }
    if (desligados.has(m.solicitante) && !(etapa && desligados.has(etapa.aprovador))) {
      out.push({ modulo: "Movimentações de Pessoal", processo: `${m.tipoCod} em aprovação — ${m.id}`, colaborador: m.colaborador, detalhe: `O solicitante (${m.solicitante}) foi desligado(a).`, acaoRecomendada: "Confirmar se a movimentação ainda é necessária.", referencia: m.id });
    }
  }

  // ── Financeiro e qualidade de dados ──
  for (const c of d.colaboradores) {
    if (!desligados.has(c.nome) || !c.desligado) continue;
    const fin = d.desligamentosFinanceiros.find((f) => f.colaboradorNome === c.nome);
    if (!fin || fin.valorRescisao == null || fin.valorGrrf == null) {
      out.push({ modulo: "Desligados", processo: "Fechamento financeiro", colaborador: c.nome, detalhe: "Valor da rescisão e/ou da GRRF ainda não lançado.", acaoRecomendada: "Lançar o fechamento financeiro na tela de Desligados." });
    }
    if (situacaoFuncionalEm(c, hoje, "acesso", hoje).alerta === "desligado_sem_data") {
      out.push({ modulo: "Cadastro", processo: "Qualidade de dados", colaborador: c.nome, detalhe: "Marcado como desligado, mas sem data de desligamento.", acaoRecomendada: "Informar a data efetiva do desligamento (SST/RH)." });
    }
  }
  return out;
}

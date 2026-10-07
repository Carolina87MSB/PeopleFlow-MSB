// Modelo de leitura da triagem do PDI POR ITEM (Fase 7 — Etapa 1B). Funções PURAS (sem tela, sem rede).
//
// O ITEM do PDI (competência/KPI + objetivo + ações) é a unidade. Um item pode estar em situações
// diferentes ao mesmo tempo (ex.: 2 ações já mantidas só no PDI, 1 ação ainda sem decisão, 1 sugestão
// pendente), então ele pode aparecer em mais de uma visão — cada visão mostra só o que lhe cabe.
// Competência/KPI e objetivo vêm do PDI exatamente como estão (ou da fotografia da sugestão, se o item
// já saiu do PDI); nada é renomeado nem consolidado por competência igual.

import { MOTIVO_PADRAO_MANTER_NO_PDI, acaoEmAberto, ehTextoADefinir } from "../../domain/pdiTriagem";
import { indiciosDaAcao, type FiltroForma, type FiltroTipo, type IndicioForma } from "./pdiClassificacao";
import type { AcaoDaSugestao, AcaoTriagem, DestinoAcao, NecessidadePdi, ResultadoIa, SugestaoPdi, TriagemPdi } from "./pdiTriagemRepository";

export interface PdiEntrada {
  id: number;
  colaboradorNome: string;
  ciclo: string;
  itens: {
    id: string;
    competenciaNome: string;
    tipoCompetencia: string;
    objetivoDesenvolvimento: string;
    ordem: number;
    acoes: { id: string; descricao: string; status: string; ordem: number }[];
  }[];
}

export interface AcaoCard {
  id: string;
  texto: string;
  ordem: number;
  status: string;
  destino: DestinoAcao | null;
  indicios: IndicioForma[];
}

export interface SugestaoCard {
  id: number;
  estado: SugestaoPdi["estado"];
  origem: SugestaoPdi["origem_sugestao"];
  textoSugerido: string;
  textoFinal: string | null;
  editada: boolean;
  categoriaSugerida: string | null;
  necessidadeId: number | null;
  decididoEm: string | null;
  /** Observação do RH ao manter somente no PDI (o texto padrão não conta). */
  observacao: string | null;
  /** Sugestão PENDENTE cujo PDI mudou depois dela: não pode ser decidida sem atualizar. */
  desatualizada: boolean;
  /** Decisão JÁ tomada cujo PDI mudou depois: só aviso histórico, a decisão não muda. */
  origemAlteradaAposDecisao: boolean;
  /** Sugerida pela regra local simples (sem IA). */
  automatica: boolean;
  /** Análise da IA (Fase 8): a interpretação a que a sugestão pertence; nulo nas demais origens. */
  ia: { interpretacaoId: number; resultado: ResultadoIa | null; observacao: string | null } | null;
  /** Título curto da necessidade sugerida pela IA. */
  tema: string | null;
  confianca: "alta" | "media" | "baixa" | null;
  justificativa: string | null;
  /** Sugestão NEUTRA da IA ("A definir pelo RH", sem confiança): cobre ações sem necessidade; NÃO é uma necessidade identificada. */
  neutraIa: boolean;
  /** A regra local não conseguiu sintetizar uma necessidade ("A definir pelo RH"): não é uma necessidade válida, o RH precisa descrevê-la. */
  aDefinir: boolean;
  /** Necessidade já criada na Base para esta sugestão cuja confirmação não foi concluída (queda no meio): só falta vincular. */
  necessidadeSolta: { id: number; descricao: string; categoria: string | null; prioridade: string } | null;
  acoes: AcaoCard[];
}

export interface ItemCard {
  chave: string;
  pdiId: number;
  itemId: string;
  colaboradorNome: string;
  departamento: string | undefined;
  competencia: string;
  tipo: string;
  objetivo: string;
  ciclo: string;
  totalAcoes: number;
  /** Sugestões da visão (pendentes em "aguardando", validadas em "confirmadas", mantidas em "mantidas"). */
  sugestoes: SugestaoCard[];
  /** Só em "aguardando": ações abertas do item que ainda não têm sugestão. */
  acoesSemSugestao: AcaoCard[];
  /** Resumo do que o item já tem decidido (para o card de "aguardando"). */
  decididas: { confirmadas: number; mantidas: number };
}

export interface ModeloTriagem {
  aguardando: ItemCard[];
  confirmadas: ItemCard[];
  mantidas: ItemCard[];
}

export interface Contagem {
  itens: number;
  acoes: number;
  /** confirmadas: nº de necessidades; mantidas: nº de decisões; aguardando: nº de sugestões pendentes. */
  decisoes: number;
}

const PADRAO = MOTIVO_PADRAO_MANTER_NO_PDI;

export function montarTriagem(entrada: { pdis: PdiEntrada[]; triagem: TriagemPdi; departamentoPorNome: Map<string, string> }): ModeloTriagem {
  const { pdis, triagem, departamentoPorNome } = entrada;
  const linhaPorAcao = new Map<string, AcaoTriagem>(triagem.acoes.map((a) => [a.pdi_acao_id, a]));
  const acoesPorSugestao = new Map<number, AcaoDaSugestao[]>();
  for (const a of triagem.acoesDasSugestoes) if (a.ativa) acoesPorSugestao.set(a.sugestao_id, [...(acoesPorSugestao.get(a.sugestao_id) ?? []), a]);
  // Necessidade de origem PDI que não está ligada a nenhuma sugestão = criada e ainda sem vínculo.
  const ligadas = new Set(triagem.sugestoes.map((s) => s.necessidade_id).filter((n): n is number => n !== null));
  const soltaPorAcao = new Map<string, NecessidadePdi>();
  for (const n of triagem.necessidadesPdi) if (n.pdi_acao_id && !ligadas.has(n.id)) soltaPorAcao.set(n.pdi_acao_id, n);
  const sugestoesPorItem = new Map<string, SugestaoPdi[]>();
  for (const s of triagem.sugestoes) sugestoesPorItem.set(s.pdi_item_id, [...(sugestoesPorItem.get(s.pdi_item_id) ?? []), s]);

  const storeItem = new Map<string, { pdi: PdiEntrada; item: PdiEntrada["itens"][number] }>();
  const storeAcao = new Map<string, { descricao: string; status: string; ordem: number }>();
  const pdiPorId = new Map<number, PdiEntrada>();
  for (const pdi of pdis) {
    pdiPorId.set(pdi.id, pdi);
    for (const item of pdi.itens) {
      storeItem.set(item.id, { pdi, item });
      for (const a of item.acoes) storeAcao.set(a.id, a);
    }
  }

  const cardAcao = (id: string, texto: string, ordem: number, status: string): AcaoCard => ({
    id,
    texto,
    ordem,
    status,
    destino: linhaPorAcao.get(id)?.destino ?? null,
    indicios: indiciosDaAcao(texto),
  });

  const cardSugestao = (s: SugestaoPdi): SugestaoCard => {
    const acoes = (acoesPorSugestao.get(s.id) ?? [])
      .map((a) => {
        const naPdi = storeAcao.get(a.pdi_acao_id);
        return cardAcao(a.pdi_acao_id, a.acao_texto, naPdi?.ordem ?? 9999, naPdi?.status ?? "");
      })
      .sort((a, b) => a.ordem - b.ordem || (a.id < b.id ? -1 : 1));
    const motivo = (s.motivo_decisao ?? "").trim();
    const aDefinir = ehTextoADefinir(s.texto_sugerido);
    const solta = s.estado === "pendente" ? acoes.map((a) => soltaPorAcao.get(a.id)).find(Boolean) : undefined;
    return {
      id: s.id,
      estado: s.estado,
      origem: s.origem_sugestao,
      textoSugerido: s.texto_sugerido,
      textoFinal: s.texto_final,
      // "Texto editado pelo RH" só faz sentido quando houve uma sugestão real: quando era "a definir", o RH apenas escreveu o texto.
      editada: s.editada && !aDefinir,
      categoriaSugerida: s.categoria_sugerida,
      necessidadeId: s.necessidade_id,
      decididoEm: s.decidido_em,
      observacao: s.estado === "mantida_no_pdi" && motivo && motivo !== PADRAO ? motivo : null,
      desatualizada: s.estado === "pendente" && (s.origem_alterada || s.contexto_do_item_alterado),
      origemAlteradaAposDecisao: s.origem_alterada_apos_decisao,
      automatica: s.origem_sugestao === "regra_local",
      ia: s.origem_sugestao === "ia" && s.interpretacao_id !== null ? { interpretacaoId: s.interpretacao_id, resultado: s.resultado_interpretacao, observacao: s.observacao_interpretacao } : null,
      tema: s.tema,
      confianca: s.confianca,
      justificativa: s.justificativa_interpretacao,
      neutraIa: s.origem_sugestao === "ia" && s.confianca === null,
      aDefinir,
      necessidadeSolta: solta ? { id: solta.id, descricao: solta.descricao, categoria: solta.categoria, prioridade: solta.prioridade } : null,
      acoes,
    };
  };

  const contexto = (itemId: string, sugs: SugestaoPdi[]) => {
    const ref = storeItem.get(itemId);
    const base = sugs[0];
    const nome = ref?.pdi.colaboradorNome ?? pdiPorId.get(base?.pdi_id ?? -1)?.colaboradorNome ?? "(PDI não localizado)";
    return {
      pdiId: ref?.pdi.id ?? base?.pdi_id ?? 0,
      colaboradorNome: nome,
      departamento: departamentoPorNome.get(nome),
      competencia: ref?.item.competenciaNome ?? base?.item_competencia_nome ?? "",
      tipo: ref?.item.tipoCompetencia ?? base?.item_tipo_competencia ?? "",
      objetivo: ref?.item.objetivoDesenvolvimento ?? base?.item_objetivo ?? "",
      ciclo: ref?.pdi.ciclo ?? "",
      totalAcoes: ref?.item.acoes.length ?? sugs.reduce((n, s) => n + (acoesPorSugestao.get(s.id)?.length ?? 0), 0),
    };
  };

  const ordenar = (cards: ItemCard[]) =>
    cards.sort((a, b) => a.colaboradorNome.localeCompare(b.colaboradorNome, "pt-BR") || a.competencia.localeCompare(b.competencia, "pt-BR") || a.itemId.localeCompare(b.itemId));

  // ── Aguardando análise: guiado pelo PDI atual ──────────────────────
  const aguardando: ItemCard[] = [];
  for (const pdi of pdis) {
    for (const item of pdi.itens) {
      const doItem = sugestoesPorItem.get(item.id) ?? [];
      // sugestão pendente sem nenhuma ação ativa é resíduo de uma criação interrompida: não pode ser decidida, não vira card
      const pendentes = doItem.filter((s) => s.estado === "pendente" && (acoesPorSugestao.get(s.id)?.length ?? 0) > 0);
      const abertas = item.acoes.filter((a) => acaoEmAberto(a.status, a.descricao));
      const semSugestao = abertas.filter((a) => (linhaPorAcao.get(a.id)?.destino ?? "sem_decisao") === "sem_decisao");
      if (pendentes.length === 0 && semSugestao.length === 0) continue;
      const decididas = { confirmadas: 0, mantidas: 0 };
      for (const a of item.acoes) {
        const d = linhaPorAcao.get(a.id)?.destino;
        if (d === "confirmada") decididas.confirmadas++;
        else if (d === "mantida_no_pdi") decididas.mantidas++;
      }
      aguardando.push({
        chave: item.id,
        itemId: item.id,
        ...contexto(item.id, doItem),
        sugestoes: pendentes.map(cardSugestao),
        acoesSemSugestao: semSugestao.sort((a, b) => a.ordem - b.ordem).map((a) => cardAcao(a.id, a.descricao, a.ordem, a.status)),
        decididas,
      });
    }
  }

  // ── Confirmadas e Mantidas: guiado pelas decisões (continuam visíveis mesmo se o item saiu do PDI) ──
  const porEstado = (estado: SugestaoPdi["estado"]): ItemCard[] => {
    const cards: ItemCard[] = [];
    for (const [itemId, sugs] of sugestoesPorItem) {
      const sel = sugs.filter((s) => s.estado === estado);
      if (sel.length === 0) continue;
      const ctx = contexto(itemId, sel);
      const doItem = storeItem.get(itemId)?.item.acoes ?? [];
      const decididas = { confirmadas: 0, mantidas: 0 };
      for (const a of doItem) {
        const d = linhaPorAcao.get(a.id)?.destino;
        if (d === "confirmada") decididas.confirmadas++;
        else if (d === "mantida_no_pdi") decididas.mantidas++;
      }
      cards.push({ chave: itemId, itemId, ...ctx, sugestoes: sel.map(cardSugestao), acoesSemSugestao: [], decididas });
    }
    return cards;
  };

  return { aguardando: ordenar(aguardando), confirmadas: ordenar(porEstado("validada")), mantidas: ordenar(porEstado("mantida_no_pdi")) };
}

export interface FiltrosItens {
  departamento: string;
  tipo: FiltroTipo;
  forma: FiltroForma;
}

const ehForma = (card: ItemCard, forma: FiltroForma) => {
  if (forma === "todas") return true;
  const todas = [...card.sugestoes.flatMap((s) => s.acoes), ...card.acoesSemSugestao];
  if (forma === "outra") return todas.some((a) => a.indicios.length === 0);
  return todas.some((a) => a.indicios.includes(forma));
};

/** Filtros AUXILIARES: só estreitam a vista; o universo de cada visão é sempre o completo. */
export function filtrarItens(cards: ItemCard[], f: FiltrosItens): ItemCard[] {
  return cards.filter((c) => (!f.departamento || c.departamento === f.departamento) && (f.tipo === "todos" || c.tipo === f.tipo) && ehForma(c, f.forma));
}

/** Quantos itens cada chip de forma mostraria, respeitando departamento e tipo (não a própria forma). */
export function contagemPorFormaItens(cards: ItemCard[], f: Omit<FiltrosItens, "forma">): Record<FiltroForma, number> {
  const base = filtrarItens(cards, { ...f, forma: "todas" });
  const conta = (forma: FiltroForma) => base.filter((c) => ehForma(c, forma)).length;
  return { todas: base.length, mentoria: conta("mentoria"), pratica: conta("pratica"), treinamento: conta("treinamento"), outra: conta("outra") };
}

export function contar(cards: ItemCard[]): Contagem {
  let acoes = 0;
  let decisoes = 0;
  for (const c of cards) {
    acoes += c.acoesSemSugestao.length + c.sugestoes.reduce((n, s) => n + s.acoes.length, 0);
    decisoes += c.sugestoes.length;
  }
  return { itens: cards.length, acoes, decisoes };
}

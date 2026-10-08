// Modelo de leitura da visão "Por temas" (triagem temática local). Funções PURAS: sem rede, sem banco, sem efeito colateral.
//
// Recebe os ItemCard da triagem (Fase 7) e só os REORGANIZA em grupos de leitura. O mesmo ItemCard (mesmo objeto, mesmas sugestões,
// mesmas decisões) pode aparecer em mais de um grupo, cada vez com as ações correspondentes ao tema — nunca é copiado, duplicado
// nem alterado. Não há contagem de itens/pessoas/áreas em duplicidade: os totais usam conjuntos únicos.

import { DESCRICAO_TEMA, ORDEM_TEMAS, ROTULO_TEMA, classificarItem, type TemaId } from "../../domain/pdiTemas";
import type { AcaoCard, ItemCard } from "./pdiTriagemItens";

export interface AcaoNoTema {
  acao: AcaoCard;
  origem: "acao" | "contexto" | "revisao";
  explicacao: string;
  nota?: string;
}

export interface ItemNoTema {
  /** O item da Fase 7 (decisão única): é o MESMO objeto em todos os grupos em que aparece. */
  card: ItemCard;
  /** Só as ações que correspondem a este tema (ou, na revisão individual, as que não puderam ser associadas). */
  acoes: AcaoNoTema[];
  /** Outros grupos em que o mesmo item também aparece. */
  tambemEm: TemaId[];
}

export interface TotaisTema {
  itens: number;
  colaboradores: number;
  departamentos: number;
  acoes: number;
}

export interface GrupoTema {
  tema: TemaId;
  rotulo: string;
  descricao: string;
  itens: ItemNoTema[];
  totais: TotaisTema;
}

export interface IndicadoresTemas {
  /** Itens (únicos) considerados. */
  itens: number;
  /** Grupos temáticos com algum item (a revisão individual não conta como grupo sugerido). */
  grupos: number;
  /** Itens (únicos) com pelo menos uma ação em revisão individual. */
  revisao: number;
}

export interface ModeloTemas {
  grupos: GrupoTema[];
  indicadores: IndicadoresTemas;
}

/** As ações que o card mostra (sugestões + sem sugestão), sem repetir nenhuma. */
export function acoesExibidas(card: ItemCard): AcaoCard[] {
  const vistas = new Set<string>();
  const out: AcaoCard[] = [];
  for (const a of [...card.sugestoes.flatMap((s) => s.acoes), ...card.acoesSemSugestao]) {
    if (vistas.has(a.id)) continue;
    vistas.add(a.id);
    out.push(a);
  }
  return out.sort((a, b) => a.ordem - b.ordem || (a.id < b.id ? -1 : 1));
}

function totais(itens: ItemNoTema[]): TotaisTema {
  const colaboradores = new Set<string>();
  const departamentos = new Set<string>();
  const acoes = new Set<string>();
  const cards = new Set<string>();
  for (const i of itens) {
    cards.add(i.card.chave);
    colaboradores.add(i.card.colaboradorChave);
    if (i.card.departamento) departamentos.add(i.card.departamento);
    for (const a of i.acoes) acoes.add(a.acao.id);
  }
  return { itens: cards.size, colaboradores: colaboradores.size, departamentos: departamentos.size, acoes: acoes.size };
}

export function montarTemas(cards: ItemCard[]): ModeloTemas {
  const porTema = new Map<TemaId, Map<string, ItemNoTema>>();
  const temasDoItem = new Map<string, Set<TemaId>>();
  const itensEmRevisao = new Set<string>();

  for (const card of cards) {
    const acoes = acoesExibidas(card);
    const classificacao = classificarItem({ competencia: card.competencia, objetivo: card.objetivo, acoes: acoes.map((a) => ({ id: a.id, texto: a.texto })) });
    const porId = new Map(acoes.map((a) => [a.id, a]));
    const colocar = (tema: TemaId, linha: AcaoNoTema) => {
      const grupo = porTema.get(tema) ?? new Map<string, ItemNoTema>();
      porTema.set(tema, grupo);
      const existente = grupo.get(card.chave);
      if (existente) existente.acoes.push(linha);
      else grupo.set(card.chave, { card, acoes: [linha], tambemEm: [] });
      const set = temasDoItem.get(card.chave) ?? new Set<TemaId>();
      set.add(tema);
      temasDoItem.set(card.chave, set);
    };
    for (const c of classificacao) {
      const acao = porId.get(c.acaoId);
      if (!acao) continue;
      if (c.revisao) {
        colocar("revisao", { acao, origem: "revisao", explicacao: c.revisao });
        itensEmRevisao.add(card.chave);
      } else for (const t of c.temas) colocar(t.tema, { acao, origem: t.origem, explicacao: t.explicacao, nota: t.nota });
    }
  }

  const grupos: GrupoTema[] = [];
  for (const tema of ORDEM_TEMAS) {
    const mapa = porTema.get(tema);
    if (!mapa || mapa.size === 0) continue;
    const itens = [...mapa.values()].map((i) => ({ ...i, tambemEm: ORDEM_TEMAS.filter((t) => t !== tema && temasDoItem.get(i.card.chave)?.has(t)) }));
    grupos.push({ tema, rotulo: ROTULO_TEMA[tema], descricao: DESCRICAO_TEMA[tema], itens, totais: totais(itens) });
  }
  return { grupos, indicadores: { itens: cards.length, grupos: grupos.filter((g) => g.tema !== "revisao").length, revisao: itensEmRevisao.size } };
}

// Sugestão de consolidação das candidatas da LNT — só a camada de dados/lógica (sem tela).
// Função PURA: recebe as candidatas (sem decisão) e devolve grupos de necessidades parecidas.
// Nada é consolidado aqui: a decisão final é sempre da RH (ação lnt_item_criar_consolidado).
//
// Critérios aprovados: mesma habilidade, mesmo documento/requisito (Lista Mestra, mesma
// revisão), grupo de consolidação já existente na Base e similaridade textual tolerante
// (ignora acento, caixa, plural simples e ordem das palavras).

import { normalizar } from "./buscaHabilidades";

export interface CandidataParaSugestao {
  necessidade_id: number;
  colaborador_id: number | null;
  descricao: string;
  sugestao_capacitacao: string;
  habilidade_id: number | null;
  lista_mestra_codigo: string | null;
  lista_mestra_revisao: string | null;
  grupo_id: number | null;
}

export type MotivoSugestao = "mesma_habilidade" | "mesmo_documento" | "mesmo_grupo" | "texto_parecido";

export interface SugestaoConsolidacao {
  chave: string;
  motivo: MotivoSugestao;
  necessidade_ids: number[];
  /** Colaboradores distintos entre as necessidades do grupo (público identificado). */
  colaboradores: number;
  titulo_sugerido: string;
}

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "em", "com", "para", "por", "uma", "uns", "umas", "nos", "nas", "ao", "aos", "que"]);

/** Chave tolerante de um texto: palavras significativas, sem plural simples, em ordem alfabética. Vazia se não sobrar nada. */
export function chaveDeTexto(texto: string): string {
  const palavras = normalizar(texto)
    .split(" ")
    .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p))
    .map((p) => (p.length > 4 && p.endsWith("s") ? p.slice(0, -1) : p));
  return [...new Set(palavras)].sort().join(" ");
}

function agrupar(candidatas: CandidataParaSugestao[], motivo: MotivoSugestao, chaveDe: (c: CandidataParaSugestao) => string | null): SugestaoConsolidacao[] {
  const grupos = new Map<string, CandidataParaSugestao[]>();
  for (const c of candidatas) {
    const k = chaveDe(c);
    if (k) grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  const out: SugestaoConsolidacao[] = [];
  for (const [k, membros] of grupos) {
    if (membros.length < 2) continue;
    const base = membros.find((m) => m.sugestao_capacitacao.trim()) ?? membros[0];
    out.push({
      chave: `${motivo}:${k}`,
      motivo,
      necessidade_ids: membros.map((m) => m.necessidade_id).sort((a, b) => a - b),
      colaboradores: new Set(membros.map((m) => m.colaborador_id).filter((c): c is number => c != null)).size,
      titulo_sugerido: (base.sugestao_capacitacao.trim() || base.descricao.trim()).slice(0, 200),
    });
  }
  return out;
}

/** Grupos de 2 ou mais candidatas parecidas, do maior para o menor. Uma necessidade pode aparecer em mais de uma sugestão. */
export function sugerirConsolidacoes(candidatas: CandidataParaSugestao[]): SugestaoConsolidacao[] {
  const todas = [
    ...agrupar(candidatas, "mesma_habilidade", (c) => (c.habilidade_id != null ? String(c.habilidade_id) : null)),
    ...agrupar(candidatas, "mesmo_documento", (c) => (c.lista_mestra_codigo ? `${c.lista_mestra_codigo}|${c.lista_mestra_revisao ?? ""}` : null)),
    ...agrupar(candidatas, "mesmo_grupo", (c) => (c.grupo_id != null ? String(c.grupo_id) : null)),
    ...agrupar(candidatas, "texto_parecido", (c) => chaveDeTexto(c.sugestao_capacitacao) || null),
    ...agrupar(candidatas, "texto_parecido", (c) => chaveDeTexto(c.descricao) || null),
  ];
  // o mesmo conjunto de necessidades por dois caminhos de texto vira uma sugestão só
  const vistos = new Set<string>();
  return todas
    .filter((s) => {
      const assinatura = `${s.motivo}|${s.necessidade_ids.join(",")}`;
      if (vistos.has(assinatura)) return false;
      vistos.add(assinatura);
      return true;
    })
    // um grupo contido em outro maior, pelo mesmo motivo, é redundante
    .filter((s, _i, lista) => !lista.some((o) => o !== s && o.motivo === s.motivo && o.necessidade_ids.length > s.necessidade_ids.length && s.necessidade_ids.every((id) => o.necessidade_ids.includes(id))))
    .sort((a, b) => b.necessidade_ids.length - a.necessidade_ids.length || a.titulo_sugerido.localeCompare(b.titulo_sugerido, "pt-BR"));
}

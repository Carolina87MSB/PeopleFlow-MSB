// Triagem do PDI por ITEM (Fase 7 — Etapa 1B): ações do servidor sobre peopleflow_dev_pdi_interpretacoes,
// peopleflow_dev_pdi_sugestoes e peopleflow_dev_pdi_sugestao_acoes (criadas na Etapa 1A).
// Usado só por api/desenvolvimento.ts, via ACOES de desenvolvimentoAcoes.ts.
//
// Regras:
//   • só o RH executa (sessão e perfil validados no servidor; nada vem do cliente além de ids e textos de decisão);
//   • o PDI nunca é alterado: aqui só há LEITURA de peopleflow_pdi / _itens / _acoes;
//   • o banco tira a fotografia do item e do texto das ações (triggers da 1A); o servidor não confia em texto de
//     fotografia enviado pelo cliente;
//   • SÓ a confirmação do RH cria a Necessidade na Base; a sugestão local nunca cria nada;
//   • nada é apagado: o que sai de cena vira `substituida` (histórico preservado);
//   • toda decisão grava um evento em peopleflow_dev_auditoria (sem tabela de auditoria nova);
//   • sem chamada externa, sem IA: a "sugestão" é a regra local pdi-item-v1 (src/domain/pdiTriagem.ts).
//
// Limite conhecido (igual ao das demais ações do módulo): o cliente REST não faz transação entre comandos.
//   • confirmar = criar a necessidade (1) + vincular a sugestão (2). Se o passo 2 falhar, a necessidade existe e a
//     sugestão segue pendente ("necessidade sem vínculo"). Nesse estado: manter/separar/regenerar são RECUSADOS (409) e
//     confirmar ADOTA a necessidade que já existe (mesmo PDI/item/ação de origem), sem criar outra e sem sobrescrevê-la;
//   • se a sugestão for decidida por outra via enquanto a necessidade era criada, a necessidade criada agora é cancelada
//     (compensação) para nunca haver Base = necessidade e triagem = mantida/substituída;
//   • separar/regenerar = substituir a sugestão (1) + criar as novas (2). Se o passo 2 falhar, as ações voltam à
//     fila sem sugestão ("Gerar sugestão"): nada se perde, só se refaz. A limpeza de sugestões criadas pela metade é
//     verificada; se ela própria falhar, o resíduo (sem ações) não pode ser decidido e "Gerar sugestão" o recolhe;
//   • a auditoria é gravada DEPOIS da decisão: se só ela falhar, a decisão é preservada e a resposta traz
//     `auditoria: "pendente"` (e o servidor registra [AUDITORIA_PENDENTE] no log); nunca vira um erro que induza a repetir.
//
// As funções auxiliares do módulo (erros, validação, auditoria…) chegam por injeção para não criar import circular
// com desenvolvimentoAcoes.ts, que registra estas ações.

import { createHash } from "node:crypto";
import { supabaseAdmin } from "./adminAuth.js";
import type { ContaDev } from "./desenvolvimentoAcoes.js";
import {
  MOTIVO_PADRAO_MANTER_NO_PDI,
  VERSAO_REGRA_LOCAL,
  acaoEmAberto,
  categoriaSugeridaPeloTipo,
  cortarTexto,
  ehTextoADefinir,
  escolherAcaoPrincipal,
  justificativaPadraoPdi,
  normalizarTextoPdi,
  sugerirNecessidadeLocal,
} from "../../src/domain/pdiTriagem.js";

type Corpo = Record<string, unknown>;

export interface DepsTriagemPdi {
  ErroHttp: new (status: number, message: string) => Error & { status: number };
  exigirRH: (conta: ContaDev) => void;
  texto: (corpo: Corpo, campo: string, opts?: { obrigatorio?: boolean; max?: number; rotulo?: string }) => string;
  umDe: (valor: string, opcoes: readonly string[], rotulo: string) => string;
  erroBanco: (error: { code?: string; message: string }, contexto: string) => never;
  lerColaboradorParaNecessidade: (colaboradorId: number) => Promise<{ id: number; cargo: string; departamento: string | null; gestorId: number | null }>;
  CATEGORIAS_NEC: readonly string[];
  PRIORIDADES: readonly string[];
  COLS_NEC: string;
}

interface AcaoPdi {
  id: string;
  item_id: string;
  descricao: string;
  status: string;
  ordem: number;
}
interface ItemPdi {
  id: string;
  pdi_id: number;
  competencia_nome: string;
  tipo_competencia: string;
  objetivo_desenvolvimento: string;
}
interface CabecalhoPdi {
  id: number;
  colaborador_nome: string;
  ciclo: string;
}
interface ContextoItem {
  item: ItemPdi;
  pdi: CabecalhoPdi;
  acoes: AcaoPdi[];
}
interface Sugestao {
  id: number;
  interpretacao_id: number | null;
  origem_sugestao: string;
  derivada_de_id: number | null;
  pdi_id: number;
  pdi_item_id: string;
  item_competencia_nome: string;
  item_tipo_competencia: string | null;
  hash_origem: string;
  texto_sugerido: string;
  categoria_sugerida: string | null;
  estado: string;
  texto_final: string | null;
  necessidade_id: number | null;
  editada: boolean;
}
interface AcaoDaSugestao {
  id: number;
  sugestao_id: number;
  pdi_acao_id: string;
  acao_texto: string;
  hash_texto: string;
  ativa: boolean;
}
interface NovaSugestao {
  interpretacaoId: number | null;
  origem: "regra_local" | "rh";
  derivadaDeId: number | null;
  item: ItemPdi;
  texto: string;
  categoria: string | null;
  acaoIds: string[];
}

const COLS_SUG =
  "id, interpretacao_id, origem_sugestao, derivada_de_id, pdi_id, pdi_item_id, item_competencia_nome, item_tipo_competencia, hash_origem, texto_sugerido, categoria_sugerida, estado, texto_final, necessidade_id, editada";
/** Necessidade que ainda "existe" na Base (só a cancelada deixa de contar). */
const STATUS_NEC_EXISTENTE = ["sugerida", "validada", "planejada", "atendida"];
interface EventoAuditoria {
  acao: string;
  entidade: string;
  id: string;
  detalhe: Record<string, unknown>;
}
export type EstadoAuditoria = "ok" | "pendente";

export const hashTextoPdi = (t: string) => createHash("md5").update(normalizarTextoPdi(t)).digest("hex");

export function criarTriagemPdi(d: DepsTriagemPdi) {
  const { exigirRH, texto, umDe, erroBanco, lerColaboradorParaNecessidade, CATEGORIAS_NEC, PRIORIDADES, COLS_NEC } = d;
  const erro = (status: number, mensagem: string) => new d.ErroHttp(status, mensagem);

  /** A limpeza de sugestões criadas pela metade falhou: o resíduo existe, não pode ser decidido e precisa de recuperação. */
  class ErroLimpezaFalhou extends d.ErroHttp {}

  async function auditarVarios(conta: ContaDev, eventos: EventoAuditoria[]) {
    if (eventos.length === 0) return;
    const { error } = await supabaseAdmin
      .from("peopleflow_dev_auditoria")
      .insert(eventos.map((e) => ({ user_id: conta.userId, colaborador_id: conta.colaboradorId, acao: e.acao, entidade: e.entidade, entidade_id: e.id, detalhe: e.detalhe })));
    if (error) throw erro(500, `Auditoria: ${error.message}`);
  }

  /**
   * Auditoria de uma decisão JÁ gravada. Tenta 2 vezes; se ainda assim falhar, NÃO desfaz nem repete a decisão e NÃO devolve 500:
   * devolve "pendente" (a resposta ao cliente carrega isso) e deixa [AUDITORIA_PENDENTE] no log do servidor, com os ids para
   * reconstruir os eventos. (Sem texto de necessidade no log: o conteúdo continua no banco, em sugestões/necessidades.)
   */
  async function registrarAuditoria(conta: ContaDev, eventos: EventoAuditoria[]): Promise<EstadoAuditoria> {
    if (eventos.length === 0) return "ok";
    let ultimo = "";
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        await auditarVarios(conta, eventos);
        return "ok";
      } catch (e) {
        ultimo = e instanceof Error ? e.message : String(e);
      }
    }
    console.error("[AUDITORIA_PENDENTE]", JSON.stringify({ usuario: conta.userId, erro: ultimo.slice(0, 300), eventos: eventos.map((e) => ({ acao: e.acao, entidade: e.entidade, id: e.id })) }));
    return "pendente";
  }

  // ── Leituras do PDI (somente leitura) ───────────────────────────────
  async function lerContextoItem(itemId: string): Promise<ContextoItem> {
    const { data: item, error } = await supabaseAdmin.from("peopleflow_pdi_itens").select("id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento").eq("id", itemId).maybeSingle();
    if (error) erroBanco(error, "PDI");
    if (!item) throw erro(404, "Item do PDI não encontrado (pode ter sido removido do PDI).");
    const { data: pdi, error: pErro } = await supabaseAdmin.from("peopleflow_pdi").select("id, colaborador_nome, ciclo").eq("id", item.pdi_id).maybeSingle();
    if (pErro) erroBanco(pErro, "PDI");
    if (!pdi) throw erro(404, "PDI não encontrado.");
    const { data: acoes, error: aErro } = await supabaseAdmin.from("peopleflow_pdi_acoes").select("id, item_id, descricao, status, ordem").eq("item_id", itemId).order("ordem");
    if (aErro) erroBanco(aErro, "PDI");
    return { item: item as ItemPdi, pdi: pdi as CabecalhoPdi, acoes: (acoes ?? []) as AcaoPdi[] };
  }

  /** Ações que já têm destino: cobertas por sugestão ATIVA na nova estrutura, ou (legado ainda não espelhado) com necessidade/mantida. */
  async function acoesIndisponiveis(ids: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    if (ids.length === 0) return out;
    const [ativas, necs, disp] = await Promise.all([
      supabaseAdmin.from("peopleflow_dev_pdi_sugestao_acoes").select("pdi_acao_id").eq("ativa", true).in("pdi_acao_id", ids),
      supabaseAdmin.from("peopleflow_dev_necessidades").select("pdi_acao_id").in("pdi_acao_id", ids),
      supabaseAdmin.from("peopleflow_dev_pdi_sugestoes_dispensadas").select("pdi_acao_id").in("pdi_acao_id", ids),
    ]);
    for (const r of [ativas, necs, disp]) {
      if (r.error) erroBanco(r.error, "Triagem do PDI");
      for (const x of r.data ?? []) out.add(x.pdi_acao_id as string);
    }
    return out;
  }

  async function acoesElegiveis(ctx: ContextoItem): Promise<AcaoPdi[]> {
    const abertas = ctx.acoes.filter((a) => acaoEmAberto(a.status, a.descricao));
    const indisp = await acoesIndisponiveis(abertas.map((a) => a.id));
    return abertas.filter((a) => !indisp.has(a.id));
  }

  async function lerSugestao(id: number): Promise<{ sug: Sugestao; acoes: AcaoDaSugestao[] }> {
    const { data: sug, error } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestoes").select(COLS_SUG).eq("id", id).maybeSingle();
    if (error) erroBanco(error, "Sugestão do PDI");
    if (!sug) throw erro(404, "Sugestão do PDI não encontrada.");
    const { data: acoes, error: aErro } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestao_acoes").select("id, sugestao_id, pdi_acao_id, acao_texto, hash_texto, ativa").eq("sugestao_id", id).order("id");
    if (aErro) erroBanco(aErro, "Sugestão do PDI");
    return { sug: sug as Sugestao, acoes: (acoes ?? []) as AcaoDaSugestao[] };
  }

  /** O PDI mudou depois da sugestão? (ações editadas/removidas ou contexto do item alterado). Calculado ao vivo, nunca gravado. */
  async function origemAlterada(sug: Sugestao, acoes: AcaoDaSugestao[]) {
    const ativas = acoes.filter((a) => a.ativa);
    const { data: atuais, error } = await supabaseAdmin.from("peopleflow_pdi_acoes").select("id, descricao").in("id", ativas.map((a) => a.pdi_acao_id));
    if (error) erroBanco(error, "PDI");
    const mapa = new Map((atuais ?? []).map((a) => [a.id as string, a.descricao as string]));
    let alteradas = 0;
    let removidas = 0;
    for (const a of ativas) {
      const atual = mapa.get(a.pdi_acao_id);
      if (atual === undefined) removidas++;
      else if (hashTextoPdi(atual) !== a.hash_texto) alteradas++;
    }
    const { data: hashItem, error: hErro } = await supabaseAdmin.rpc("peopleflow_dev_pdi_hash_item", { p_item_id: sug.pdi_item_id });
    if (hErro) erroBanco(hErro, "PDI");
    const contexto = hashItem !== sug.hash_origem;
    return { alteradas, removidas, contexto, desatualizada: alteradas > 0 || removidas > 0 || contexto };
  }

  function exigirPendente(sug: Sugestao) {
    if (sug.estado === "pendente") return;
    const frase: Record<string, string> = {
      validada: "Esta sugestão já foi confirmada como Necessidade de Desenvolvimento.",
      mantida_no_pdi: "Esta sugestão já foi mantida somente no PDI.",
      substituida: "Esta sugestão foi substituída por outra (ações separadas ou sugestão atualizada). Recarregue a tela.",
    };
    throw erro(409, frase[sug.estado] ?? "Esta sugestão não está mais pendente.");
  }

  async function exigirAtualizada(sug: Sugestao, acoes: AcaoDaSugestao[]) {
    const o = await origemAlterada(sug, acoes);
    if (o.desatualizada) throw erro(409, "O PDI foi alterado após esta sugestão. Atualize a sugestão antes de decidir.");
  }

  // ── Necessidade criada na Base mas ainda SEM vínculo com a sugestão (queda entre "criar" e "vincular") ──
  /** Necessidades de origem PDI, ainda existentes, que referenciam alguma das ações da sugestão e não estão ligadas a nenhuma sugestão. */
  async function necessidadesSoltas(ativas: AcaoDaSugestao[]): Promise<Record<string, unknown>[]> {
    if (ativas.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from("peopleflow_dev_necessidades")
      .select(COLS_NEC)
      .eq("origem", "pdi")
      .in("pdi_acao_id", ativas.map((a) => a.pdi_acao_id))
      .in("status", STATUS_NEC_EXISTENTE);
    if (error) erroBanco(error, "Necessidade de Desenvolvimento");
    const necs = (data ?? []) as unknown as Record<string, unknown>[];
    if (necs.length === 0) return [];
    const { data: ligadas, error: lErro } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestoes").select("necessidade_id").in("necessidade_id", necs.map((n) => n.id as number));
    if (lErro) erroBanco(lErro, "Sugestão do PDI");
    const jaLigadas = new Set((ligadas ?? []).map((l) => l.necessidade_id as number));
    return necs.filter((n) => !jaLigadas.has(n.id as number));
  }

  /** Manter/separar/atualizar não podem ocorrer com uma necessidade já criada e sem vínculo (Base e triagem se contradiriam). */
  async function exigirSemNecessidadeSolta(ativas: AcaoDaSugestao[], oQueSeTentou: string) {
    const soltas = await necessidadesSoltas(ativas);
    if (soltas.length === 0) return;
    throw erro(
      409,
      `Já existe a Necessidade de Desenvolvimento nº ${soltas.map((n) => n.id).join(", ")} criada para esta sugestão, mas a confirmação não foi concluída. Conclua pelo botão “Concluir confirmação” (ou “Confirmar necessidade”); enquanto isso não é possível ${oQueSeTentou}.`,
    );
  }

  // ── Criação de sugestões (em lote: poucas idas ao banco) ───────────
  async function inserirSugestoes(conta: ContaDev, novas: NovaSugestao[]): Promise<Sugestao[]> {
    if (novas.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from("peopleflow_dev_pdi_sugestoes")
      .insert(
        novas.map((n) => ({
          interpretacao_id: n.interpretacaoId,
          origem_sugestao: n.origem,
          derivada_de_id: n.derivadaDeId,
          pdi_id: n.item.pdi_id,
          pdi_item_id: n.item.id,
          texto_sugerido: n.texto,
          categoria_sugerida: n.categoria,
          created_by: conta.userId,
          updated_by: conta.userId,
        })),
      )
      .select(COLS_SUG);
    if (error) erroBanco(error, "Sugestão do PDI");
    const criadas = (data ?? []) as Sugestao[];
    if (criadas.length !== novas.length) throw erro(500, "Sugestão do PDI: o banco não devolveu todas as sugestões criadas.");
    const linhas = novas.flatMap((n, i) => n.acaoIds.map((acaoId) => ({ sugestao_id: criadas[i].id, pdi_item_id: n.item.id, pdi_acao_id: acaoId, acao_texto: "(o banco preenche a partir do PDI)" })));
    const { error: aErro } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestao_acoes").insert(linhas);
    if (aErro) {
      const limpeza = await descartarSugestoes(conta, criadas.map((c) => c.id), "Criação interrompida: ações indisponíveis");
      if (!limpeza.ok) {
        await registrarAuditoria(conta, [{ acao: "pdi_sugestao_limpeza_falhou", entidade: "peopleflow_dev_pdi_sugestoes", id: String(limpeza.pendentes[0] ?? criadas[0].id), detalhe: { sugestoes_residuais: limpeza.pendentes, erro: limpeza.erro ?? null, causa: aErro.message } }]);
        throw new ErroLimpezaFalhou(
          500,
          `A criação das sugestões foi interrompida e a limpeza automática também falhou (sugestão nº ${limpeza.pendentes.join(", ")}). Esses registros ficaram sem ações de origem e NÃO podem ser decididos. É necessário recuperar: use “Gerar sugestão” para refazer (os resíduos são recolhidos) e, se persistir, acione o suporte. (${aErro.message})`,
        );
      }
      if (aErro.code === "23505") throw erro(409, "Alguma ação desta lista já tem sugestão ativa (decidida por outra pessoa agora há pouco). Recarregue a tela.");
      erroBanco(aErro, "Ações de origem da sugestão");
    }
    return criadas;
  }

  /**
   * Limpeza de sugestões criadas pela metade: viram `substituida` (nada é apagado) e liberam as ações.
   * O resultado é VERIFICADO (relê o estado): `ok=false` quando alguma continua pendente — o resíduo não tem ações, e o banco
   * e o servidor recusam decidir sugestão sem ação de origem.
   */
  async function descartarSugestoes(conta: ContaDev, ids: number[], motivo: string): Promise<{ ok: boolean; pendentes: number[]; erro?: string }> {
    if (ids.length === 0) return { ok: true, pendentes: [] };
    const { error } = await supabaseAdmin
      .from("peopleflow_dev_pdi_sugestoes")
      .update({ estado: "substituida", decidido_por: conta.userId, decidido_em: new Date().toISOString(), motivo_decisao: motivo, updated_by: conta.userId })
      .in("id", ids)
      .eq("estado", "pendente");
    const { data: restantes, error: rErro } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestoes").select("id").in("id", ids).eq("estado", "pendente");
    if (rErro) return { ok: false, pendentes: ids, erro: rErro.message };
    const pendentes = (restantes ?? []).map((r) => r.id as number);
    return { ok: pendentes.length === 0, pendentes, ...(pendentes.length > 0 && error ? { erro: error.message } : {}) };
  }

  /** Recolhe sugestões PENDENTES sem nenhuma ação ativa (resíduo de uma criação interrompida). Roda ao gerar sugestões. */
  async function recolherIncompletas(conta: ContaDev): Promise<{ recolhidas: number; pendentes: number[] }> {
    const { data: pend, error } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestoes").select("id").eq("estado", "pendente").limit(5000);
    if (error) erroBanco(error, "Sugestão do PDI");
    const ids = (pend ?? []).map((p) => p.id as number);
    if (ids.length === 0) return { recolhidas: 0, pendentes: [] };
    const { data: comAcao, error: aErro } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestao_acoes").select("sugestao_id").eq("ativa", true).in("sugestao_id", ids).limit(10000);
    if (aErro) erroBanco(aErro, "Sugestão do PDI");
    const cobertas = new Set((comAcao ?? []).map((c) => c.sugestao_id as number));
    const orfas = ids.filter((id) => !cobertas.has(id));
    if (orfas.length === 0) return { recolhidas: 0, pendentes: [] };
    const r = await descartarSugestoes(conta, orfas, "Sugestão incompleta (sem ações de origem) recolhida");
    return { recolhidas: orfas.length - r.pendentes.length, pendentes: r.pendentes };
  }

  function planejarSugestao(ctx: ContextoItem, acoes: AcaoPdi[], opts: { interpretacaoId: number | null; origem: "regra_local" | "rh"; derivadaDeId: number | null; texto?: string }): NovaSugestao {
    const ordenadas = [...acoes].sort((a, b) => a.ordem - b.ordem || (a.id < b.id ? -1 : 1));
    const local = sugerirNecessidadeLocal({ objetivo: ctx.item.objetivo_desenvolvimento });
    return {
      interpretacaoId: opts.interpretacaoId,
      origem: opts.origem,
      derivadaDeId: opts.derivadaDeId,
      item: ctx.item,
      texto: cortarTexto(opts.texto ?? local.texto),
      categoria: categoriaSugeridaPeloTipo(ctx.item.tipo_competencia),
      acaoIds: ordenadas.map((a) => a.id),
    };
  }

  const detalheCriada = (s: Sugestao, acaoIds: string[]) => ({
    pdi_id: s.pdi_id,
    pdi_item_id: s.pdi_item_id,
    interpretacao_id: s.interpretacao_id,
    origem_sugestao: s.origem_sugestao,
    derivada_de_id: s.derivada_de_id,
    acoes: acaoIds,
    texto_sugerido: s.texto_sugerido,
  });

  async function abrirExecucao(conta: ContaDev): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from("peopleflow_dev_pdi_interpretacoes")
      .insert({ tipo: "regra_local", versao_regra: VERSAO_REGRA_LOCAL, solicitada_por: conta.userId, solicitada_por_colaborador_id: conta.colaboradorId })
      .select("id")
      .single();
    if (error) erroBanco(error, "Execução da triagem do PDI");
    if (!data) throw erro(500, "Execução da triagem do PDI: o banco não devolveu a execução criada.");
    return data.id as number;
  }

  async function encerrarExecucao(id: number, itens: number, sugestoes: number, hash: string | null, falha?: string) {
    const agora = new Date().toISOString();
    await supabaseAdmin
      .from("peopleflow_dev_pdi_interpretacoes")
      .update(falha ? { status: "falhou", concluida_em: agora, erro_tecnico: falha.slice(0, 500), itens_analisados: itens, sugestoes_geradas: sugestoes } : { status: "concluida", concluida_em: agora, itens_analisados: itens, sugestoes_geradas: sugestoes, hash_conteudo: hash })
      .eq("id", id)
      .eq("status", "em_andamento");
  }

  // ═══ Gerar sugestões locais (por item) ══════════════════════════════
  async function gerar(conta: ContaDev, corpo: Corpo) {
    exigirRH(conta);
    const pedidos = Array.isArray(corpo.pdi_item_ids) ? [...new Set(corpo.pdi_item_ids.map(String))].filter(Boolean) : null;
    if (pedidos && pedidos.length > 200) throw erro(422, "Selecione no máximo 200 itens por vez.");

    // Resíduo de uma criação interrompida (sugestão pendente sem nenhuma ação): é recolhido antes de gerar de novo.
    const incompletas = await recolherIncompletas(conta);

    // Itens e ações do PDI (leitura): todos os itens com ação em aberto, ou só os pedidos.
    const qItens = supabaseAdmin.from("peopleflow_pdi_itens").select("id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento").limit(5000);
    const { data: itens, error } = await (pedidos ? qItens.in("id", pedidos) : qItens);
    if (error) erroBanco(error, "PDI");
    if (pedidos && (itens ?? []).length !== pedidos.length) throw erro(404, "Algum item do PDI não foi encontrado (pode ter sido removido do PDI).");
    const { data: todasAcoes, error: aErro } = await supabaseAdmin.from("peopleflow_pdi_acoes").select("id, item_id, descricao, status, ordem").limit(5000);
    if (aErro) erroBanco(aErro, "PDI");
    const porItem = new Map<string, AcaoPdi[]>();
    for (const a of (todasAcoes ?? []) as AcaoPdi[]) porItem.set(a.item_id, [...(porItem.get(a.item_id) ?? []), a]);

    const abertas = [...porItem.values()].flat().filter((a) => acaoEmAberto(a.status, a.descricao)).map((a) => a.id);
    const indisp = await acoesIndisponiveis(abertas);
    const { data: pdis, error: pErro } = await supabaseAdmin.from("peopleflow_pdi").select("id, colaborador_nome, ciclo").limit(5000);
    if (pErro) erroBanco(pErro, "PDI");
    const pdiPorId = new Map(((pdis ?? []) as CabecalhoPdi[]).map((p) => [p.id, p]));

    const plano: { ctx: ContextoItem; acoes: AcaoPdi[] }[] = [];
    for (const item of (itens ?? []) as ItemPdi[]) {
      const todas = porItem.get(item.id) ?? [];
      const livres = todas.filter((a) => acaoEmAberto(a.status, a.descricao) && !indisp.has(a.id));
      const pdi = pdiPorId.get(item.pdi_id);
      if (livres.length > 0 && pdi) plano.push({ ctx: { item, pdi, acoes: todas }, acoes: livres });
    }
    const residuos = { incompletas_recolhidas: incompletas.recolhidas, incompletas_pendentes: incompletas.pendentes };
    if (plano.length === 0) return { interpretacao_id: null, itens: 0, sugestoes: 0, auditoria: "ok" as EstadoAuditoria, ...residuos };

    const execId = await abrirExecucao(conta);
    try {
      const novas = plano.map((p) => planejarSugestao(p.ctx, p.acoes, { interpretacaoId: execId, origem: "regra_local", derivadaDeId: null }));
      const criadas = await inserirSugestoes(conta, novas);
      const hash = createHash("md5").update(novas.map((n) => `${n.item.id}:${n.acaoIds.join(",")}`).sort().join("|")).digest("hex");
      await encerrarExecucao(execId, plano.length, criadas.length, hash);
      const auditoria = await registrarAuditoria(conta, [
        { acao: "pdi_interpretacao_executada", entidade: "peopleflow_dev_pdi_interpretacoes", id: String(execId), detalhe: { tipo: "regra_local", versao_regra: VERSAO_REGRA_LOCAL, itens: plano.length, sugestoes: criadas.length, hash_conteudo: hash } },
        ...criadas.map((s, i) => ({ acao: "pdi_sugestao_criada", entidade: "peopleflow_dev_pdi_sugestoes", id: String(s.id), detalhe: detalheCriada(s, novas[i].acaoIds) })),
      ]);
      return { interpretacao_id: execId, itens: plano.length, sugestoes: criadas.length, auditoria, ...residuos };
    } catch (e) {
      await encerrarExecucao(execId, plano.length, 0, null, e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  // ═══ Confirmar (cria a Necessidade na Base — ou conclui a que já foi criada e ficou sem vínculo) ═══
  interface CamposConfirmacao {
    texto: string;
    categoria: string;
    prioridade: string;
    justificativa: string;
    sugestao_capacitacao: string;
    observacao: string;
  }

  /** A sugestão foi decidida por outra via enquanto a necessidade era criada: a criada AGORA é cancelada (nunca Base ≠ triagem). */
  async function cancelarNecessidadeCriada(conta: ContaDev, nec: Record<string, unknown>, estadoSugestao: string) {
    const motivo = "Cancelada automaticamente: a sugestão do PDI foi decidida por outra via durante a confirmação.";
    const { error } = await supabaseAdmin.from("peopleflow_dev_necessidades").update({ status: "cancelada", status_motivo: motivo, updated_by: conta.userId }).eq("id", nec.id as number).eq("status", "validada");
    if (error) {
      throw erro(500, `Esta sugestão foi decidida por outra via durante a confirmação e a Necessidade nº ${nec.id}, criada neste clique, NÃO pôde ser cancelada automaticamente. Cancele-a manualmente na Base de Necessidades. (${error.message})`);
    }
    await registrarAuditoria(conta, [{ acao: "necessidade_cancelada", entidade: "peopleflow_dev_necessidades", id: String(nec.id), detalhe: { status: { antes: "validada", depois: "cancelada" }, motivo, automatica: true, estado_da_sugestao: estadoSugestao } }]);
  }

  /**
   * Recuperação: já existe uma necessidade do PDI (criada antes de uma queda) que referencia ação desta sugestão e não está ligada
   * a nenhuma sugestão. Valida PDI/item/ação (a ação principal é a JÁ GRAVADA na necessidade, nunca recalculada), vincula e conclui.
   * Não cria outra, não sobrescreve a existente: o texto final é o que está na necessidade; a resposta informa as divergências.
   */
  async function adotarNecessidade(conta: ContaDev, sug: Sugestao, ativas: AcaoDaSugestao[], soltas: Record<string, unknown>[], campos: CamposConfirmacao) {
    if (soltas.length > 1) throw erro(409, `Há mais de uma Necessidade de Desenvolvimento sem vínculo para esta sugestão (nº ${soltas.map((n) => n.id).join(", ")}). Não é seguro escolher uma delas automaticamente: peça apoio técnico.`);
    const nec = soltas[0];
    const idsAcoes = new Set(ativas.map((a) => a.pdi_acao_id));
    if (nec.origem !== "pdi" || nec.pdi_id !== sug.pdi_id || nec.pdi_item_id !== sug.pdi_item_id || !idsAcoes.has(nec.pdi_acao_id as string)) {
      throw erro(409, "A necessidade já criada não corresponde a esta sugestão (PDI, item ou ação de origem diferentes). Não é seguro concluir automaticamente: peça apoio técnico.");
    }
    // Colaborador: confere quando o PDI ainda permite identificá-lo de forma única (se o item saiu do PDI, a ligação por ids basta).
    const ctx = await lerContextoItem(sug.pdi_item_id).catch(() => null);
    if (ctx) {
      const { data: pessoas, error: pErro } = await supabaseAdmin.from("colaboradores").select("id").eq("nome", ctx.pdi.colaborador_nome).eq("desligado", false);
      if (pErro) erroBanco(pErro, "Colaborador");
      if (pessoas && pessoas.length === 1 && pessoas[0].id !== nec.colaborador_id) throw erro(409, "A necessidade já criada é de outro colaborador. Não é seguro concluir automaticamente: peça apoio técnico.");
    }
    const textoFinal = String(nec.descricao);
    const agora = new Date().toISOString();
    const { data: vinculada, error: vErro } = await supabaseAdmin
      .from("peopleflow_dev_pdi_sugestoes")
      .update({ estado: "validada", necessidade_id: nec.id as number, texto_final: textoFinal, decidido_por: conta.userId, decidido_em: agora, updated_by: conta.userId })
      .eq("id", sug.id)
      .eq("estado", "pendente")
      .select(COLS_SUG);
    if (vErro) erroBanco(vErro, "Sugestão do PDI");
    if ((vinculada ?? []).length === 0) {
      const { sug: atual } = await lerSugestao(sug.id);
      if (atual.estado === "validada" && atual.necessidade_id === nec.id) return { sugestao: atual, necessidade: nec, repetida: true, recuperada: false, auditoria: "ok" as EstadoAuditoria };
      throw erro(409, "Esta sugestão foi decidida por outra pessoa agora há pouco. Recarregue a tela.");
    }
    const final = (vinculada ?? [])[0] as Sugestao;
    const divergencias = { texto: textoFinal !== campos.texto, categoria: nec.categoria !== campos.categoria, prioridade: nec.prioridade !== campos.prioridade };
    const definido = ehTextoADefinir(sug.texto_sugerido);
    const editada = textoFinal !== sug.texto_sugerido && !definido;
    const auditoria = await registrarAuditoria(conta, [
      { acao: "necessidade_do_pdi", entidade: "peopleflow_dev_necessidades", id: String(nec.id), detalhe: { pdi_id: sug.pdi_id, pdi_item_id: sug.pdi_item_id, pdi_acao_id: nec.pdi_acao_id, sugestao_id: sug.id, recuperada: true, depois: nec } },
      {
        acao: editada ? "pdi_sugestao_editada_e_confirmada" : "pdi_sugestao_confirmada",
        entidade: "peopleflow_dev_pdi_sugestoes",
        id: String(sug.id),
        detalhe: {
          pdi_id: sug.pdi_id,
          pdi_item_id: sug.pdi_item_id,
          interpretacao_id: sug.interpretacao_id,
          origem_sugestao: sug.origem_sugestao,
          acoes: ativas.map((a) => a.pdi_acao_id),
          acao_principal: nec.pdi_acao_id,
          necessidade_id: nec.id,
          texto_sugerido: sug.texto_sugerido,
          texto_final: textoFinal,
          editada,
          texto_definido_pelo_rh: definido,
          recuperada: true,
          divergencias,
          texto_da_tentativa: campos.texto,
          categoria: nec.categoria,
          prioridade: nec.prioridade,
        },
      },
    ]);
    return { sugestao: final, necessidade: nec, repetida: false, recuperada: true, divergencias, auditoria };
  }

  async function confirmarInterno(conta: ContaDev, sugestaoId: number, campos: CamposConfirmacao) {
    // O texto neutro "A definir pelo RH" nunca é uma necessidade: o RH precisa descrevê-la.
    if (ehTextoADefinir(campos.texto)) throw erro(422, "Descreva a necessidade de desenvolvimento: o texto “A definir pelo RH” não pode ser confirmado como necessidade.");
    const { sug, acoes } = await lerSugestao(sugestaoId);
    exigirPendente(sug);
    const ativas = acoes.filter((a) => a.ativa);
    if (ativas.length === 0) throw erro(422, "Esta sugestão não tem ações de origem.");

    // Recuperação (queda entre criar a necessidade e vinculá-la): conclui a necessidade que já existe, sem criar outra.
    const soltas = await necessidadesSoltas(ativas);
    if (soltas.length > 0) return adotarNecessidade(conta, sug, ativas, soltas, campos);

    await exigirAtualizada(sug, acoes);
    const ctx = await lerContextoItem(sug.pdi_item_id);
    const naPdi = ctx.acoes.filter((a) => ativas.some((x) => x.pdi_acao_id === a.id));
    if (naPdi.length !== ativas.length) throw erro(409, "O PDI foi alterado após esta sugestão. Atualize a sugestão antes de decidir.");
    const principal = escolherAcaoPrincipal(naPdi);

    // O PDI identifica a pessoa por nome; aqui o vínculo passa a ser por id (homônimo → não vincula).
    const { data: pessoas, error: pErro } = await supabaseAdmin.from("colaboradores").select("id").eq("nome", ctx.pdi.colaborador_nome).eq("desligado", false);
    if (pErro) erroBanco(pErro, "Colaborador");
    if (!pessoas || pessoas.length !== 1) throw erro(409, "Não foi possível identificar o colaborador do PDI de forma única.");
    const colab = await lerColaboradorParaNecessidade(pessoas[0].id as number);

    const justificativa = campos.justificativa || justificativaPadraoPdi(ctx.pdi.ciclo, ctx.item.tipo_competencia, ctx.item.competencia_nome, ctx.item.objetivo_desenvolvimento);
    const agora = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("peopleflow_dev_necessidades")
      .insert({
        colaborador_id: colab.id,
        departamento: colab.departamento,
        gestor_colaborador_id: colab.gestorId,
        origem: "pdi",
        pdi_id: ctx.pdi.id,
        pdi_item_id: ctx.item.id,
        pdi_acao_id: principal.id, // ponteiro legado = AÇÃO PRINCIPAL; o conjunto de ações fica em peopleflow_dev_pdi_sugestao_acoes
        pdi_item_nome: ctx.item.competencia_nome,
        descricao: campos.texto,
        justificativa,
        categoria: campos.categoria,
        prioridade: campos.prioridade,
        sugestao_capacitacao: campos.sugestao_capacitacao,
        observacao: campos.observacao,
        status: "validada",
        validada_em: agora,
        validada_por: conta.userId,
        solicitado_por_colaborador_id: conta.colaboradorId,
        origem_registro: "sistema",
        created_by: conta.userId,
        updated_by: conta.userId,
      })
      .select(COLS_NEC)
      .single();
    if (error) {
      if (error.code !== "23505") erroBanco(error, "Necessidade de Desenvolvimento");
      // Duplicidade barrada pelo banco (outra requisição criou a necessidade agora): se ela ainda não tem vínculo, conclui com ela.
      const soltas2 = await necessidadesSoltas(ativas);
      if (soltas2.length > 0) return adotarNecessidade(conta, sug, ativas, soltas2, campos);
      throw erro(409, "Esta ação do PDI já está na Base de Necessidades de Desenvolvimento.");
    }
    const nec = data as unknown as Record<string, unknown>;

    const { data: vinculada, error: vErro } = await supabaseAdmin
      .from("peopleflow_dev_pdi_sugestoes")
      .update({ estado: "validada", necessidade_id: nec.id as number, texto_final: campos.texto, decidido_por: conta.userId, decidido_em: agora, updated_by: conta.userId })
      .eq("id", sug.id)
      .eq("estado", "pendente")
      .select(COLS_SUG);
    if (vErro) erroBanco(vErro, "Sugestão do PDI"); // a necessidade fica sem vínculo: repetir "Confirmar" conclui (ver adotarNecessidade)
    const eventoCriacao: EventoAuditoria = { acao: "necessidade_do_pdi", entidade: "peopleflow_dev_necessidades", id: String(nec.id), detalhe: { pdi_id: ctx.pdi.id, pdi_item_id: ctx.item.id, pdi_acao_id: principal.id, sugestao_id: sug.id, depois: nec } };
    if ((vinculada ?? []).length === 0) {
      const { sug: atual } = await lerSugestao(sug.id);
      if (atual.estado === "validada" && atual.necessidade_id === nec.id) {
        const auditoria = await registrarAuditoria(conta, [eventoCriacao]);
        return { sugestao: atual, necessidade: nec, repetida: true, recuperada: false, auditoria };
      }
      // Decidida por outra via no meio do caminho: desfaz o que ESTE clique criou, para a Base não contradizer a triagem.
      await cancelarNecessidadeCriada(conta, nec, atual.estado);
      throw erro(409, "Esta sugestão foi decidida por outra pessoa agora há pouco; a necessidade criada neste clique foi cancelada automaticamente. Recarregue a tela.");
    }
    const final = (vinculada ?? [])[0] as Sugestao;
    const definido = ehTextoADefinir(sug.texto_sugerido);
    const editada = campos.texto !== sug.texto_sugerido && !definido;
    const auditoria = await registrarAuditoria(conta, [
      eventoCriacao,
      {
        acao: editada ? "pdi_sugestao_editada_e_confirmada" : "pdi_sugestao_confirmada",
        entidade: "peopleflow_dev_pdi_sugestoes",
        id: String(sug.id),
        detalhe: {
          pdi_id: ctx.pdi.id,
          pdi_item_id: ctx.item.id,
          interpretacao_id: sug.interpretacao_id,
          origem_sugestao: sug.origem_sugestao,
          acoes: ativas.map((a) => a.pdi_acao_id),
          acao_principal: principal.id,
          necessidade_id: nec.id,
          texto_sugerido: sug.texto_sugerido,
          texto_final: campos.texto,
          editada,
          texto_definido_pelo_rh: definido,
          categoria: campos.categoria,
          prioridade: campos.prioridade,
        },
      },
    ]);
    return { sugestao: final, necessidade: nec, repetida: false, recuperada: false, auditoria };
  }

  function lerCamposConfirmacao(corpo: Corpo): CamposConfirmacao {
    return {
      texto: texto(corpo, "texto", { obrigatorio: true, max: 500, rotulo: "o texto da Necessidade de Desenvolvimento" }),
      categoria: umDe(texto(corpo, "categoria"), CATEGORIAS_NEC, "Categoria"),
      prioridade: umDe(texto(corpo, "prioridade") || "media", PRIORIDADES, "Prioridade"),
      justificativa: texto(corpo, "justificativa", { max: 2000 }),
      sugestao_capacitacao: texto(corpo, "sugestao_capacitacao", { max: 500 }),
      observacao: texto(corpo, "observacao", { max: 2000 }),
    };
  }

  const idSugestao = (corpo: Corpo) => {
    const n = Number(corpo.sugestao_id);
    if (!Number.isInteger(n) || n <= 0) throw erro(422, "Sugestão inválida.");
    return n;
  };

  async function confirmar(conta: ContaDev, corpo: Corpo) {
    exigirRH(conta);
    return confirmarInterno(conta, idSugestao(corpo), lerCamposConfirmacao(corpo));
  }

  // ═══ Manter somente no PDI ═════════════════════════════════════════
  async function manterInterno(conta: ContaDev, sugestaoId: number, motivo: string) {
    const { sug, acoes } = await lerSugestao(sugestaoId);
    exigirPendente(sug);
    const ativas = acoes.filter((a) => a.ativa);
    if (ativas.length === 0) throw erro(422, "Esta sugestão não tem ações de origem.");
    await exigirSemNecessidadeSolta(ativas, "manter somente no PDI");
    await exigirAtualizada(sug, acoes);
    const agora = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("peopleflow_dev_pdi_sugestoes")
      .update({ estado: "mantida_no_pdi", decidido_por: conta.userId, decidido_em: agora, motivo_decisao: motivo || MOTIVO_PADRAO_MANTER_NO_PDI, updated_by: conta.userId })
      .eq("id", sug.id)
      .eq("estado", "pendente")
      .select(COLS_SUG);
    if (error) erroBanco(error, "Sugestão do PDI");
    if ((data ?? []).length === 0) throw erro(409, "Esta sugestão foi decidida por outra pessoa agora há pouco. Recarregue a tela.");
    const auditoria = await registrarAuditoria(conta, [
      {
        acao: "pdi_sugestao_mantida_no_pdi",
        entidade: "peopleflow_dev_pdi_sugestoes",
        id: String(sug.id),
        detalhe: { pdi_id: sug.pdi_id, pdi_item_id: sug.pdi_item_id, origem_sugestao: sug.origem_sugestao, acoes: ativas.map((a) => a.pdi_acao_id), observacao: motivo || null },
      },
    ]);
    return { sugestao: (data ?? [])[0] as Sugestao, decidida_em: agora, motivo: motivo || MOTIVO_PADRAO_MANTER_NO_PDI, auditoria };
  }

  async function manter(conta: ContaDev, corpo: Corpo) {
    exigirRH(conta);
    return manterInterno(conta, idSugestao(corpo), texto(corpo, "motivo", { max: 1000, rotulo: "a observação" }));
  }

  // ═══ Separar ações (e atualizar sugestão) ═══════════════════════════
  interface Grupo {
    acaoIds: string[];
    texto?: string;
  }

  async function separarInterno(conta: ContaDev, sug: Sugestao, ativas: AcaoDaSugestao[], grupos: Grupo[], motivo: string): Promise<{ criadas: Sugestao[]; auditoria: EstadoAuditoria }> {
    const ctx = await lerContextoItem(sug.pdi_item_id);
    const porId = new Map(ctx.acoes.map((a) => [a.id, a]));
    const planejadas = grupos.map((g) => {
      const acoes = g.acaoIds.map((id) => porId.get(id)).filter((a): a is AcaoPdi => Boolean(a));
      if (acoes.length !== g.acaoIds.length) throw erro(409, "Uma das ações não está mais no PDI. Atualize a sugestão antes de separar.");
      return planejarSugestao(ctx, acoes, { interpretacaoId: null, origem: "rh", derivadaDeId: sug.id, texto: g.texto });
    });
    const agora = new Date().toISOString();
    // (1) A sugestão original sai de cena (substituida): as ações ficam livres. Nada é apagado.
    const { data: subst, error } = await supabaseAdmin
      .from("peopleflow_dev_pdi_sugestoes")
      .update({ estado: "substituida", decidido_por: conta.userId, decidido_em: agora, motivo_decisao: motivo, updated_by: conta.userId })
      .eq("id", sug.id)
      .eq("estado", "pendente")
      .select("id");
    if (error) erroBanco(error, "Sugestão do PDI");
    if ((subst ?? []).length === 0) throw erro(409, "Esta sugestão foi decidida por outra pessoa agora há pouco. Recarregue a tela.");
    // (2) As novas sugestões, uma por grupo, ligadas à original (derivada_de_id).
    let criadas: Sugestao[] = [];
    try {
      criadas = await inserirSugestoes(conta, planejadas);
    } catch (e) {
      await registrarAuditoria(conta, [{ acao: "pdi_sugestao_separada", entidade: "peopleflow_dev_pdi_sugestoes", id: String(sug.id), detalhe: { interrompida: true, acoes: ativas.map((a) => a.pdi_acao_id), motivo } }]);
      if (e instanceof ErroLimpezaFalhou) throw e; // já explica o resíduo e a recuperação
      const base = e instanceof Error ? e.message : String(e);
      throw erro(500, `A separação foi interrompida e as ações voltaram para a fila, sem sugestão. Use "Gerar sugestão" e refaça. (${base})`);
    }
    const auditoria = await registrarAuditoria(conta, [
      { acao: "pdi_sugestao_separada", entidade: "peopleflow_dev_pdi_sugestoes", id: String(sug.id), detalhe: { pdi_id: sug.pdi_id, pdi_item_id: sug.pdi_item_id, motivo, novas: criadas.map((c, i) => ({ id: c.id, acoes: planejadas[i].acaoIds })) } },
      ...criadas.map((s, i) => ({ acao: "pdi_sugestao_criada", entidade: "peopleflow_dev_pdi_sugestoes", id: String(s.id), detalhe: detalheCriada(s, planejadas[i].acaoIds) })),
    ]);
    return { criadas, auditoria };
  }

  async function separar(conta: ContaDev, corpo: Corpo) {
    exigirRH(conta);
    const { sug, acoes } = await lerSugestao(idSugestao(corpo));
    exigirPendente(sug);
    const ativas = acoes.filter((a) => a.ativa);
    await exigirSemNecessidadeSolta(ativas, "separar as ações");
    await exigirAtualizada(sug, acoes);
    const brutos = Array.isArray(corpo.grupos) ? corpo.grupos : [];
    if (brutos.length < 2 || brutos.length > Math.max(2, ativas.length)) throw erro(422, "Separe as ações em pelo menos 2 grupos.");
    const grupos: Grupo[] = brutos.map((g) => {
      const reg = (g ?? {}) as Corpo;
      const ids = Array.isArray(reg.acao_ids) ? [...new Set(reg.acao_ids.map(String))] : [];
      const textoG = texto(reg, "texto", { max: 500, rotulo: "o texto da sugestão" });
      return { acaoIds: ids, texto: textoG || undefined };
    });
    if (grupos.some((g) => g.acaoIds.length === 0)) throw erro(422, "Cada grupo precisa de pelo menos uma ação.");
    const todas = grupos.flatMap((g) => g.acaoIds);
    if (new Set(todas).size !== todas.length) throw erro(422, "Uma ação não pode estar em dois grupos.");
    const idsAtivos = new Set(ativas.map((a) => a.pdi_acao_id));
    if (todas.length !== idsAtivos.size || todas.some((id) => !idsAtivos.has(id))) throw erro(422, "Distribua todas as ações da sugestão entre os grupos, sem incluir ações de fora dela.");
    const { criadas, auditoria } = await separarInterno(conta, sug, ativas, grupos, "RH separou as ações");
    return { original: sug.id, novas: criadas, auditoria };
  }

  // ═══ Atualizar sugestão desatualizada (regenerar) ════════════════════
  async function regenerar(conta: ContaDev, corpo: Corpo) {
    exigirRH(conta);
    const { sug, acoes } = await lerSugestao(idSugestao(corpo));
    exigirPendente(sug);
    await exigirSemNecessidadeSolta(acoes.filter((a) => a.ativa), "atualizar a sugestão");
    const o = await origemAlterada(sug, acoes);
    if (!o.desatualizada) throw erro(409, "Esta sugestão está atualizada: não precisa ser refeita.");
    const execId = await abrirExecucao(conta);
    try {
      const agora = new Date().toISOString();
      const { data: subst, error } = await supabaseAdmin
        .from("peopleflow_dev_pdi_sugestoes")
        .update({ estado: "substituida", decidido_por: conta.userId, decidido_em: agora, motivo_decisao: "PDI alterado após a sugestão: sugestão atualizada", updated_by: conta.userId })
        .eq("id", sug.id)
        .eq("estado", "pendente")
        .select("id");
      if (error) erroBanco(error, "Sugestão do PDI");
      if ((subst ?? []).length === 0) throw erro(409, "Esta sugestão foi decidida por outra pessoa agora há pouco. Recarregue a tela.");
      const ctx = await lerContextoItem(sug.pdi_item_id).catch(() => null);
      const livres = ctx ? await acoesElegiveis(ctx) : [];
      let criada: Sugestao | null = null;
      if (ctx && livres.length > 0) {
        const plano = planejarSugestao(ctx, livres, { interpretacaoId: execId, origem: "regra_local", derivadaDeId: sug.id });
        [criada] = await inserirSugestoes(conta, [plano]);
      }
      await encerrarExecucao(execId, 1, criada ? 1 : 0, null);
      const auditoria = await registrarAuditoria(conta, [
        { acao: "pdi_sugestao_regenerada", entidade: "peopleflow_dev_pdi_sugestoes", id: String(sug.id), detalhe: { pdi_item_id: sug.pdi_item_id, acoes_alteradas: o.alteradas, acoes_removidas: o.removidas, contexto_alterado: o.contexto, nova_sugestao_id: criada?.id ?? null, interpretacao_id: execId } },
        ...(criada ? [{ acao: "pdi_sugestao_criada", entidade: "peopleflow_dev_pdi_sugestoes", id: String(criada.id), detalhe: detalheCriada(criada, livres.map((a) => a.id)) }] : []),
      ]);
      return { original: sug.id, nova: criada, auditoria };
    } catch (e) {
      await encerrarExecucao(execId, 1, 0, null, e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  // ═══ Compatibilidade: ações antigas por AÇÃO ISOLADA, agora delegando ao novo fluxo ═══
  async function lerAcaoIsolada(pdiAcaoId: string) {
    const { data: acao, error } = await supabaseAdmin.from("peopleflow_pdi_acoes").select("id, item_id, descricao, status, ordem").eq("id", pdiAcaoId).maybeSingle();
    if (error) erroBanco(error, "PDI");
    if (!acao) throw erro(404, "Ação do PDI não encontrada (pode ter sido removida do PDI).");
    const ctx = await lerContextoItem(acao.item_id as string);
    return { acao: acao as AcaoPdi, ctx };
  }

  /** Garante uma sugestão PENDENTE com exatamente esta ação (separando de outras, se preciso) e a devolve. Idempotente. */
  async function sugestaoDeUmaAcao(conta: ContaDev, acao: AcaoPdi, ctx: ContextoItem): Promise<number> {
    const { data: cobertura, error } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestao_acoes").select("sugestao_id").eq("pdi_acao_id", acao.id).eq("ativa", true).limit(1);
    if (error) erroBanco(error, "Triagem do PDI");
    const textoAcao = cortarTexto(acao.descricao);
    if ((cobertura ?? []).length === 0) {
      const [criada] = await inserirSugestoes(conta, [{ interpretacaoId: null, origem: "rh", derivadaDeId: null, item: ctx.item, texto: textoAcao, categoria: categoriaSugeridaPeloTipo(ctx.item.tipo_competencia), acaoIds: [acao.id] }]);
      await registrarAuditoria(conta, [{ acao: "pdi_sugestao_criada", entidade: "peopleflow_dev_pdi_sugestoes", id: String(criada.id), detalhe: detalheCriada(criada, [acao.id]) }]);
      return criada.id;
    }
    const sugId = cobertura![0].sugestao_id as number;
    const { sug, acoes } = await lerSugestao(sugId);
    exigirPendente(sug); // validada/mantida já tratadas pelo chamador
    const ativas = acoes.filter((a) => a.ativa);
    if (ativas.length === 1) return sug.id;
    const resto = ativas.filter((a) => a.pdi_acao_id !== acao.id).map((a) => a.pdi_acao_id);
    await exigirSemNecessidadeSolta(ativas, "separar as ações");
    const { criadas } = await separarInterno(conta, sug, ativas, [{ acaoIds: [acao.id], texto: textoAcao }, { acaoIds: resto }], "Decisão por ação isolada (tela antiga)");
    return criadas[0].id;
  }

  async function estadoDaCobertura(pdiAcaoId: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestao_acoes").select("sugestao_id").eq("pdi_acao_id", pdiAcaoId).eq("ativa", true).limit(1);
    if (error) erroBanco(error, "Triagem do PDI");
    if ((data ?? []).length === 0) return null;
    const { data: s, error: sErro } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestoes").select("estado").eq("id", data![0].sugestao_id as number).maybeSingle();
    if (sErro) erroBanco(sErro, "Triagem do PDI");
    return (s?.estado as string | undefined) ?? null;
  }

  /** `pdi_sugestao_aceitar`: confirma UMA ação como necessidade (sugestão de 1 ação) pelo novo fluxo. */
  async function aceitarLegado(conta: ContaDev, corpo: Corpo) {
    exigirRH(conta);
    const pdiAcaoId = texto(corpo, "pdi_acao_id", { obrigatorio: true, max: 100, rotulo: "a ação do PDI" });
    const { acao, ctx } = await lerAcaoIsolada(pdiAcaoId);
    const { data: dispensada } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestoes_dispensadas").select("pdi_acao_id").eq("pdi_acao_id", pdiAcaoId).maybeSingle();
    if (dispensada) throw erro(422, "Esta sugestão já foi dispensada.");
    const estado = await estadoDaCobertura(pdiAcaoId);
    if (estado === "mantida_no_pdi") throw erro(422, "Esta sugestão já foi dispensada.");
    const { data: jaNaBase } = await supabaseAdmin.from("peopleflow_dev_necessidades").select("id").eq("pdi_acao_id", pdiAcaoId).limit(1);
    if (estado === "validada" || (jaNaBase ?? []).length > 0) throw erro(409, "Esta ação do PDI já está na Base de Necessidades de Desenvolvimento.");
    const campos = {
      texto: cortarTexto(acao.descricao),
      categoria: umDe(texto(corpo, "categoria"), CATEGORIAS_NEC, "Categoria"),
      prioridade: umDe(texto(corpo, "prioridade") || "media", PRIORIDADES, "Prioridade"),
      justificativa: texto(corpo, "justificativa", { max: 2000 }),
      sugestao_capacitacao: texto(corpo, "sugestao_capacitacao", { max: 500 }),
      observacao: texto(corpo, "observacao", { max: 2000 }),
    };
    const sugId = await sugestaoDeUmaAcao(conta, acao, ctx);
    const r = await confirmarInterno(conta, sugId, campos);
    return r.necessidade; // mesmo retorno de antes: a linha da necessidade
  }

  /** `pdi_sugestao_dispensar`: mantém UMA ação somente no PDI (sugestão de 1 ação) pelo novo fluxo. */
  async function dispensarLegado(conta: ContaDev, corpo: Corpo) {
    exigirRH(conta);
    const pdiAcaoId = texto(corpo, "pdi_acao_id", { obrigatorio: true, max: 100, rotulo: "a ação do PDI" });
    const motivo = texto(corpo, "motivo", { max: 1000, rotulo: "a observação" });
    const { acao, ctx } = await lerAcaoIsolada(pdiAcaoId);
    const estado = await estadoDaCobertura(pdiAcaoId);
    const { data: jaNaBase } = await supabaseAdmin.from("peopleflow_dev_necessidades").select("id").eq("pdi_acao_id", pdiAcaoId).limit(1);
    if (estado === "validada" || (jaNaBase ?? []).length > 0) throw erro(409, "Esta ação do PDI já foi confirmada como Necessidade de Desenvolvimento.");
    const { data: dispensada } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestoes_dispensadas").select("pdi_acao_id").eq("pdi_acao_id", pdiAcaoId).maybeSingle();
    if (estado === "mantida_no_pdi" || dispensada) throw erro(409, "Esta ação já foi mantida somente no PDI.");
    const sugId = await sugestaoDeUmaAcao(conta, acao, ctx);
    const r = await manterInterno(conta, sugId, motivo);
    return { pdi_acao_id: pdiAcaoId, motivo: r.motivo, dispensada_em: r.decidida_em };
  }

  return {
    acoes: {
      pdi_triagem_gerar: gerar,
      pdi_sugestao_confirmar: confirmar,
      pdi_sugestao_manter_no_pdi: manter,
      pdi_sugestao_separar: separar,
      pdi_sugestao_regenerar: regenerar,
    } as Record<string, (conta: ContaDev, corpo: Corpo) => Promise<unknown>>,
    aceitarLegado,
    dispensarLegado,
  };
}

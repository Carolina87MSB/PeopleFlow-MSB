// Análise de UM item do PDI com IA (Fase 8C): ação RH-only `pdi_ia_analisar` (+ `pdi_ia_estado`).
//
// Regras:
//   • a IA só SUGERE: nada aqui cria Necessidade, decide, altera o PDI ou toca a LNT. Quem decide é o RH, pelas ações da 1B;
//   • a chamada ao provedor é feita ANTES de qualquer gravação de sugestão (e só depois de a interpretação estar 'em_andamento',
//     o que acende a trava do banco: 1 análise IA por item). Resposta inválida ou provedor fora do ar = nada é persistido;
//   • ordem de gravação exigida pelos guards da 8A: (1) substituir a sugestão antiga que será trocada, (2) criar as sugestões IA
//     e suas ações, (3) concluir a interpretação — o banco só aceita concluir com resultado coerente e cobertura integral;
//   • a sugestão antiga só é trocada se for da regra local ou de uma análise IA desatualizada; sugestão do RH, decisão tomada
//     e análise IA atual NUNCA são reescritas;
//   • sem cliente (chave/modelo ausentes ou IA desligada) a ação responde 503 e o fluxo manual da Fase 7 segue normal.

import { createHash } from "node:crypto";
import { supabaseAdmin } from "./adminAuth.js";
import type { ContaDev } from "./desenvolvimentoAcoes.js";
import type { criarTriagemPdi } from "./pdiTriagemAcoes.js";
import { TEXTO_A_DEFINIR_PELO_RH, acaoEmAberto, normalizarTextoPdi } from "../../src/domain/pdiTriagem.js";
import { ErroIa, MENSAGEM_INDISPONIVEL, estadoIa, obterClienteIa } from "./pdiIaCliente.js";
import { PROMPT_SISTEMA, SCHEMA_SAIDA, hashEntrada, mensagemUsuario, montarEntrada, validarSaida, versaoPromptCompleta, type SaidaValidada } from "./pdiIaNucleo.js";

type Corpo = Record<string, unknown>;
type Internos = ReturnType<typeof criarTriagemPdi>["internos"];
type Contexto = Awaited<ReturnType<Internos["lerContextoItem"]>>;

export interface DepsIa {
  ErroHttp: new (status: number, message: string) => Error & { status: number };
  exigirRH: (conta: ContaDev) => void;
  texto: (corpo: Corpo, campo: string, opts?: { obrigatorio?: boolean; max?: number; rotulo?: string }) => string;
  erroBanco: (error: { code?: string; message: string }, contexto: string) => never;
  internos: Internos;
}

/** Uma execução IA 'em_andamento' há mais tempo que isso é tratada como interrompida (a função da Vercel tem limite menor). */
export const PRAZO_EXECUCAO_PRESA_MS = 10 * 60 * 1000;
/** Teto de espera pelo provedor dentro da função (o cliente real tem o próprio timeout, menor). PDI_IA_PRAZO_MS existe só para teste. */
const prazoProvedorMs = () => Number(process.env.PDI_IA_PRAZO_MS) || 90_000;
const MOTIVO_SUBSTITUICAO = "Substituída pela análise da IA";

interface PlanoAnalise {
  ctx: Contexto;
  analisar: Contexto["acoes"];
  /** sugestões pendentes que serão trocadas (regra local ou análise IA desatualizada) */
  substituiveis: number[];
  hashItem: string | null;
  /** id → hash do texto atual, para detectar edição do PDI durante a chamada */
  hashesAcoes: Map<string, string>;
}

const hashTexto = (t: string) => createHash("md5").update(normalizarTextoPdi(t)).digest("hex");

export function criarIaPdi(d: DepsIa) {
  const { exigirRH, texto, erroBanco, internos: I } = d;
  const erro = (status: number, mensagem: string) => new d.ErroHttp(status, mensagem);

  // ── Estado (a tela usa para mostrar/esconder o botão e explicar a indisponibilidade) ──
  async function estado(conta: ContaDev) {
    exigirRH(conta);
    const e = estadoIa();
    return { disponivel: e.disponivel, motivo: e.motivo ?? null, mensagem: e.motivo ? MENSAGEM_INDISPONIVEL[e.motivo] : null };
  }

  // ── Execuções presas ──────────────────────────────────────────────
  /** Interpretação IA 'em_andamento' além do prazo vira 'falhou' e suas sugestões pendentes são descartadas (libera a trava do item). */
  async function varrerPresas(conta: ContaDev): Promise<number> {
    const limite = new Date(Date.now() - PRAZO_EXECUCAO_PRESA_MS).toISOString();
    const { data, error } = await supabaseAdmin.from("peopleflow_dev_pdi_interpretacoes").select("id").eq("tipo", "ia").eq("status", "em_andamento").lte("solicitada_em", limite);
    if (error) erroBanco(error, "Interpretações do PDI");
    const ids = (data ?? []).map((r) => r.id as number);
    if (ids.length === 0) return 0;
    const { data: pend, error: pErro } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestoes").select("id").in("interpretacao_id", ids).eq("estado", "pendente");
    if (pErro) erroBanco(pErro, "Sugestões do PDI");
    await I.descartarSugestoes(conta, (pend ?? []).map((r) => r.id as number), "Interpretação interrompida: sugestão descartada");
    const { error: uErro } = await supabaseAdmin
      .from("peopleflow_dev_pdi_interpretacoes")
      .update({ status: "falhou", concluida_em: new Date().toISOString(), erro_tecnico: "Interrompida: prazo máximo excedido (a função não terminou)." })
      .in("id", ids)
      .eq("status", "em_andamento");
    if (uErro) erroBanco(uErro, "Interpretações do PDI");
    await I.registrarAuditoria(conta, ids.map((id) => ({ acao: "pdi_ia_interrompida", entidade: "peopleflow_dev_pdi_interpretacoes", id: String(id), detalhe: { motivo: "prazo_excedido" } })));
    return ids.length;
  }

  // ── Planejamento: o que será analisado e o que será trocado ────────
  async function planejar(itemId: string, conta: ContaDev): Promise<PlanoAnalise> {
    void conta;
    const ctx = await I.lerContextoItem(itemId);
    const abertas = ctx.acoes.filter((a) => acaoEmAberto(a.status, a.descricao));
    if (abertas.length === 0) throw erro(409, "Este item não tem ação em aberto para analisar.");
    const ids = abertas.map((a) => a.id);
    const indisp = await I.acoesIndisponiveis(ids); // coberta por sugestão ativa OU decidida no legado
    const { data: links, error } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestao_acoes").select("sugestao_id, pdi_acao_id").eq("ativa", true).in("pdi_acao_id", ids);
    if (error) erroBanco(error, "Ações das sugestões");
    const sugIds = [...new Set((links ?? []).map((l) => l.sugestao_id as number))];
    const substituiveis: number[] = [];
    let iaAtual = false;
    for (const id of sugIds) {
      const { sug, acoes } = await I.lerSugestao(id);
      if (sug.estado !== "pendente") continue;
      if (sug.origem_sugestao === "regra_local") substituiveis.push(id);
      else if (sug.origem_sugestao === "ia") {
        const o = await I.origemAlterada(sug, acoes);
        if (o.desatualizada) substituiveis.push(id);
        else iaAtual = true;
      }
      if (substituiveis.includes(id)) {
        // necessidade já criada e sem vínculo: concluir a confirmação vem antes de qualquer troca
        await I.exigirSemNecessidadeSolta(acoes.filter((a) => a.ativa), "analisar com IA");
      }
    }
    const dosSubstituiveis = new Set((links ?? []).filter((l) => substituiveis.includes(l.sugestao_id as number)).map((l) => l.pdi_acao_id as string));
    const analisar = abertas.filter((a) => dosSubstituiveis.has(a.id) || !indisp.has(a.id));
    if (analisar.length === 0) {
      throw erro(409, iaAtual ? "Este item já tem uma análise da IA aguardando decisão." : "Todas as ações abertas deste item já têm decisão ou sugestão do RH. Nada a analisar.");
    }
    const { data: hashItem, error: hErro } = await supabaseAdmin.rpc("peopleflow_dev_pdi_hash_item", { p_item_id: itemId });
    if (hErro) erroBanco(hErro, "PDI");
    return { ctx, analisar, substituiveis: substituiveis.sort((a, b) => a - b), hashItem: (hashItem as string | null) ?? null, hashesAcoes: new Map(analisar.map((a) => [a.id, hashTexto(a.descricao)])) };
  }

  /** Depois da chamada: o PDI e as sugestões continuam como estavam? */
  async function revalidar(itemId: string, plano: PlanoAnalise, conta: ContaDev) {
    const { data: pend, error } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestoes").select("id, estado").in("id", plano.substituiveis.length ? plano.substituiveis : [-1]);
    if (error) erroBanco(error, "Sugestões do PDI");
    if ((pend ?? []).some((s) => s.estado !== "pendente")) throw erro(409, "A sugestão deste item foi decidida enquanto a IA analisava. Nada foi alterado.");
    let novo: PlanoAnalise;
    try {
      novo = await planejar(itemId, conta);
    } catch (e) {
      if (e instanceof d.ErroHttp) throw erro(409, "O PDI ou as sugestões deste item mudaram enquanto a IA analisava. Nada foi alterado; analise de novo.");
      throw e;
    }
    const mesmosIds = novo.analisar.length === plano.analisar.length && novo.analisar.every((a) => plano.hashesAcoes.has(a.id));
    const mesmosTextos = [...novo.hashesAcoes].every(([id, h]) => plano.hashesAcoes.get(id) === h);
    const mesmasSubst = novo.substituiveis.join() === plano.substituiveis.join();
    if (!mesmosIds || !mesmosTextos || !mesmasSubst || novo.hashItem !== plano.hashItem) {
      throw erro(409, "O PDI ou as sugestões deste item mudaram enquanto a IA analisava. Nada foi alterado; analise de novo.");
    }
  }

  // ── Interpretação (execução IA) ───────────────────────────────────
  async function abrirInterpretacao(conta: ContaDev, itemId: string, modelo: string): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from("peopleflow_dev_pdi_interpretacoes")
      .insert({ tipo: "ia", solicitada_por: conta.userId, solicitada_por_colaborador_id: conta.colaboradorId, provedor: "anthropic", modelo, versao_prompt: versaoPromptCompleta(), pdi_item_id: itemId })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw erro(409, "Já existe uma análise da IA em andamento para este item. Aguarde a conclusão.");
      erroBanco(error, "Interpretação do PDI");
    }
    if (!data) throw erro(500, "Interpretação do PDI: o banco não devolveu a execução criada.");
    return data.id as number;
  }

  async function marcarFalha(id: number, motivo: string) {
    await supabaseAdmin
      .from("peopleflow_dev_pdi_interpretacoes")
      .update({ status: "falhou", concluida_em: new Date().toISOString(), erro_tecnico: motivo.slice(0, 500) })
      .eq("id", id)
      .eq("status", "em_andamento");
  }

  const comPrazo = <T,>(p: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((ok, ko) => {
      const t = setTimeout(() => ko(new ErroIa("timeout", "A IA demorou demais para responder.", true)), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          ok(v);
        },
        (e) => {
          clearTimeout(t);
          ko(e);
        },
      );
    });

  // ── Persistência (ordem exigida pelos guards da 8A) ────────────────
  async function persistir(conta: ContaDev, execId: number, plano: PlanoAnalise, saida: SaidaValidada) {
    const { ctx } = plano;
    const agora = new Date().toISOString();
    // (1) a sugestão antiga que está sendo trocada sai de cena (substituida): as ações ficam livres. Nada é apagado.
    if (plano.substituiveis.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("peopleflow_dev_pdi_sugestoes")
        .update({ estado: "substituida", decidido_por: conta.userId, decidido_em: agora, motivo_decisao: MOTIVO_SUBSTITUICAO, updated_by: conta.userId })
        .in("id", plano.substituiveis)
        .eq("estado", "pendente")
        .select("id");
      if (error) erroBanco(error, "Sugestão do PDI");
      if ((data ?? []).length !== plano.substituiveis.length) throw erro(409, "A sugestão deste item foi decidida enquanto a IA analisava. Nada foi criado.");
    }
    // (2) sugestões da IA (uma por necessidade) + a neutra, que cobre as ações sem necessidade; depois as ações de origem
    const semNecessidade = saida.resultado === "evidencia_insuficiente" || saida.resultado === "somente_acao_pdi" ? plano.analisar.map((a) => a.id) : saida.acoesSemNecessidade;
    const base = { interpretacao_id: execId, origem_sugestao: "ia", derivada_de_id: plano.substituiveis.length === 1 ? plano.substituiveis[0] : null, pdi_id: ctx.item.pdi_id, pdi_item_id: ctx.item.id, created_by: conta.userId, updated_by: conta.userId };
    const linhas = [
      ...saida.necessidades.map((n) => ({ ...base, texto_sugerido: n.descricao, tema: n.titulo, confianca: n.confianca, justificativa_interpretacao: n.justificativa })),
      ...(semNecessidade.length > 0 ? [{ ...base, texto_sugerido: TEXTO_A_DEFINIR_PELO_RH, tema: null, confianca: null, justificativa_interpretacao: null }] : []),
    ];
    const conjuntos = [...saida.necessidades.map((n) => n.acaoIds), ...(semNecessidade.length > 0 ? [semNecessidade] : [])];
    const { data: criadas, error } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestoes").insert(linhas).select("id");
    if (error) erroBanco(error, "Sugestão do PDI");
    const ids = (criadas ?? []).map((c) => c.id as number);
    if (ids.length !== linhas.length) throw erro(500, "Sugestão do PDI: o banco não devolveu todas as sugestões criadas.");
    const acoesLinhas = conjuntos.flatMap((acaoIds, i) => acaoIds.map((acaoId) => ({ sugestao_id: ids[i], pdi_item_id: ctx.item.id, pdi_acao_id: acaoId, acao_texto: "(o banco preenche a partir do PDI)" })));
    const { error: aErro } = await supabaseAdmin.from("peopleflow_dev_pdi_sugestao_acoes").insert(acoesLinhas);
    if (aErro) {
      const limpeza = await I.descartarSugestoes(conta, ids, "Criação interrompida: ações indisponíveis");
      if (!limpeza.ok) throw erro(500, `A análise foi interrompida e a limpeza automática falhou (sugestão nº ${limpeza.pendentes.join(", ")}). Esses registros ficaram sem ações e NÃO podem ser decididos; analise o item de novo para recolhê-los.`);
      if (aErro.code === "23505") throw erro(409, "Alguma ação deste item foi ocupada por outra sugestão enquanto a IA analisava. Nada foi criado.");
      erroBanco(aErro, "Ações de origem da sugestão");
    }
    return { ids, neutra: semNecessidade.length > 0 };
  }

  // ═══ Ação principal ═════════════════════════════════════════════════
  async function analisar(conta: ContaDev, corpo: Corpo) {
    exigirRH(conta);
    const itemId = texto(corpo, "pdi_item_id", { obrigatorio: true, max: 100, rotulo: "o item do PDI" });
    const cliente = obterClienteIa();
    if (!cliente) {
      const e = estadoIa();
      throw erro(503, MENSAGEM_INDISPONIVEL[e.motivo ?? "desabilitada"]);
    }

    await varrerPresas(conta);
    const plano = await planejar(itemId, conta);

    // texto livre: nomes de colaboradores do cadastro saem do que vai ao provedor (falha ao ler = não envia)
    const { data: pessoas, error: nErro } = await supabaseAdmin.from("colaboradores").select("nome").limit(5000);
    if (nErro) erroBanco(nErro, "Colaboradores");
    const montada = montarEntrada(
      { competenciaNome: plano.ctx.item.competencia_nome, tipoCompetencia: plano.ctx.item.tipo_competencia, objetivo: plano.ctx.item.objetivo_desenvolvimento },
      plano.analisar.map((a) => ({ id: a.id, descricao: a.descricao, ordem: a.ordem })),
      (pessoas ?? []).map((p) => String(p.nome ?? "")),
    );
    const execId = await abrirInterpretacao(conta, itemId, cliente.modelo);
    const hash = hashEntrada(montada.entrada);
    try {
      // ── chamada ao provedor (nenhuma gravação de sugestão ainda) ──
      let resposta;
      try {
        resposta = await comPrazo(cliente.analisar({ sistema: PROMPT_SISTEMA, usuario: mensagemUsuario(montada.entrada), schema: SCHEMA_SAIDA }), prazoProvedorMs());
      } catch (e) {
        const ia = e instanceof ErroIa ? e : new ErroIa("indisponivel", "Falha inesperada ao chamar a IA.", true);
        await marcarFalha(execId, `provedor:${ia.codigo}`);
        await I.registrarAuditoria(conta, [{ acao: "pdi_ia_falhou", entidade: "peopleflow_dev_pdi_interpretacoes", id: String(execId), detalhe: { pdi_item_id: itemId, etapa: "provedor", codigo: ia.codigo, retentavel: ia.retentavel, versao_prompt: versaoPromptCompleta() } }]);
        throw erro(ia.codigo === "timeout" ? 504 : 502, `${ia.message} Nada foi gravado; tente novamente.`);
      }

      // ── validação rigorosa ANTES de persistir ──
      const textosAcoes = new Map<string, string>();
      for (const [ref, id] of montada.mapaAcoes) textosAcoes.set(ref, plano.analisar.find((a) => a.id === id)?.descricao ?? "");
      const v = validarSaida(resposta.bruto, { competencia: plano.ctx.item.competencia_nome, mapaAcoes: montada.mapaAcoes, textosAcoes });
      if (!v.ok) {
        await marcarFalha(execId, `validacao:${v.erros.join(",")}`);
        await I.registrarAuditoria(conta, [{ acao: "pdi_ia_falhou", entidade: "peopleflow_dev_pdi_interpretacoes", id: String(execId), detalhe: { pdi_item_id: itemId, etapa: "validacao", erros: v.erros, modelo: resposta.modelo, versao_prompt: versaoPromptCompleta() } }]);
        throw erro(502, "A resposta da IA veio fora do formato esperado e foi descartada. Nada foi gravado; tente novamente.");
      }

      // ── o PDI e as sugestões continuam como estavam? ──
      try {
        await revalidar(itemId, plano, conta);
      } catch (e) {
        await marcarFalha(execId, "stale:pdi_ou_sugestao_mudou_durante_a_analise");
        throw e;
      }

      // ── persistir sugestões + ações e concluir a interpretação ──
      let gravado: { ids: number[]; neutra: boolean };
      try {
        gravado = await persistir(conta, execId, plano, v.saida);
      } catch (e) {
        await marcarFalha(execId, `persistencia:${e instanceof Error ? e.message : String(e)}`);
        throw e;
      }
      const { error: fErro } = await supabaseAdmin
        .from("peopleflow_dev_pdi_interpretacoes")
        .update({
          status: "concluida",
          concluida_em: new Date().toISOString(),
          itens_analisados: 1,
          sugestoes_geradas: gravado.ids.length,
          resultado_interpretacao: v.saida.resultado,
          observacao_interpretacao: v.saida.observacao,
          tokens_entrada: resposta.tokensEntrada,
          tokens_saida: resposta.tokensSaida,
          hash_conteudo: hash,
        })
        .eq("id", execId)
        .eq("status", "em_andamento");
      if (fErro) {
        // o banco recusou concluir (resultado incoerente ou ação em aberto sem cobertura): desfaz o que foi criado e libera as ações
        const limpeza = await I.descartarSugestoes(conta, gravado.ids, "Interpretação não pôde ser concluída: sugestões descartadas");
        await marcarFalha(execId, `fechamento:${fErro.message}`);
        throw erro(500, limpeza.ok ? "Não foi possível concluir a análise (o banco recusou o fechamento). Nada ficou pendente; tente novamente." : `Não foi possível concluir a análise e a limpeza automática falhou (sugestão nº ${limpeza.pendentes.join(", ")}). Analise o item de novo para recolher os resíduos.`);
      }

      const auditoria = await I.registrarAuditoria(conta, [
        {
          acao: "pdi_ia_analisada",
          entidade: "peopleflow_dev_pdi_interpretacoes",
          id: String(execId),
          detalhe: {
            pdi_item_id: itemId,
            resultado: v.saida.resultado,
            sugestoes: gravado.ids,
            neutra: gravado.neutra,
            substituidas: plano.substituiveis,
            acoes_analisadas: plano.analisar.map((a) => a.id),
            confiancas: v.saida.necessidades.map((n) => n.confianca),
            provedor: cliente.provedor,
            modelo_configurado: cliente.modelo,
            modelo_respondeu: resposta.modelo,
            versao_prompt: versaoPromptCompleta(),
            hash_conteudo: hash,
            tokens_entrada: resposta.tokensEntrada,
            tokens_saida: resposta.tokensSaida,
            sanitizacoes: montada.sanitizacoes,
          },
        },
        ...gravado.ids.map((id) => ({ acao: "pdi_sugestao_criada", entidade: "peopleflow_dev_pdi_sugestoes", id: String(id), detalhe: { pdi_item_id: itemId, interpretacao_id: execId, origem_sugestao: "ia" } })),
      ]);
      return { interpretacao_id: execId, resultado: v.saida.resultado, observacao: v.saida.observacao, sugestoes: gravado.ids, neutra: gravado.neutra, substituidas: plano.substituiveis, auditoria };
    } catch (e) {
      // qualquer saída por erro deixa a interpretação encerrada (a trava do item é liberada); marcarFalha só age em 'em_andamento'
      await marcarFalha(execId, `erro:${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }

  return { acoes: { pdi_ia_analisar: analisar, pdi_ia_estado: estado } as Record<string, (conta: ContaDev, corpo: Corpo) => Promise<unknown>> };
}

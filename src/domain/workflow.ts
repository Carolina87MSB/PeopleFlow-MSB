import { formatarDataAtual, formatarHoraAtual } from "./dates";
import { ehCEO, roleApprover } from "./hierarquia";
import type {
  AdmissaoInfo,
  AtualizacaoCargoDeptoInfo,
  Colaborador,
  DesligamentoInfo,
  Etapa,
  EventoHistoricoMovimentacao,
  Movimentacao,
  TipoMovimentacao,
} from "../types/domain";

export function nextId(movimentacoes: Movimentacao[]): string {
  const nums = movimentacoes
    .map((m) => parseInt(m.id.split("-")[2], 10))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return "M-2026-" + String(max + 1).padStart(3, "0");
}

/** The etapa awaiting action right now — "Em análise" if present, else the first "Aguardando". */
export function etapaAtual(m: Movimentacao): Etapa | undefined {
  return m.etapas.find((e) => e.status === "Em análise") ?? m.etapas.find((e) => e.status === "Aguardando");
}

export function podeAgir(m: Movimentacao, me: string): boolean {
  if (m.status !== "Em Aprovação") return false;
  const atual = etapaAtual(m);
  return Boolean(atual && atual.status === "Em análise" && atual.aprovador === me);
}

/**
 * Monta as etapas de aprovação de uma movimentação. Quando quem solicita é o
 * CEO (ver ehCEO() em hierarquia.ts — checagem por cargo, não por perfil,
 * já que "Diretoria" também cobre o Diretor Industrial), a matriz normal é
 * ignorada: a movimentação pula Gestor Solicitante e Diretor Industrial e
 * vai direto para RH — regra válida para todos os tipos.
 *
 * Para Promoção e Transferência, `solicitanteGestor` já vem resolvido pelo
 * chamador (construirMovimentacao() em formMovimentacao.ts) para o gestor
 * correto de cada caso — gestor atual (promoção sem mudança de
 * departamento) ou gestor do departamento de destino (promoção com mudança
 * de departamento, e toda transferência) — nunca é pulado, sempre precisa
 * de aprovação explícita.
 */
export function montarEtapas(
  tipo: TipoMovimentacao,
  solicitanteGestor: string,
  solicitanteNome: string,
  colaboradores: Colaborador[],
): Etapa[] {
  const solicitanteColab = colaboradores.find((c) => c.nome === solicitanteNome);
  const papeis = ehCEO(solicitanteColab) ? ["RH"] : tipo.etapas;
  return papeis.map((papel, i) => ({
    papel,
    aprovador: roleApprover(papel, { solicitanteGestor }),
    status: i === 0 ? "Em análise" : "Aguardando",
    data: "",
    hora: "",
    comentario: "",
  }));
}

export interface ApproveResult {
  movimentacoes: Movimentacao[];
  admissaoRegistrada: AdmissaoInfo | null;
  atualizacaoRegistrada: AtualizacaoCargoDeptoInfo | null;
  desligamentoRegistrado: DesligamentoInfo | null;
}

/** Advances the first pending/in-review etapa to "Aprovado"; completes the movement once the last etapa clears. */
export function aprovarEtapa(movimentacoes: Movimentacao[], id: string): ApproveResult {
  let admissaoRegistrada: AdmissaoInfo | null = null;
  let atualizacaoRegistrada: AtualizacaoCargoDeptoInfo | null = null;
  let desligamentoRegistrado: DesligamentoInfo | null = null;
  const hoje = formatarDataAtual();
  const agora = formatarHoraAtual();

  const novasMovimentacoes = movimentacoes.map((m) => {
    if (m.id !== id || m.status !== "Em Aprovação") return m;
    const etapas = m.etapas.map((e) => ({ ...e }));
    const idx = etapas.findIndex((e) => e.status === "Em análise" || e.status === "Aguardando");
    if (idx < 0) return m;

    etapas[idx].status = "Aprovado";
    etapas[idx].data = hoje;
    etapas[idx].hora = agora;

    let status: Movimentacao["status"] = m.status;
    let aprovacaoFinal = m.aprovacaoFinal || null;

    if (idx + 1 < etapas.length) {
      etapas[idx + 1].status = "Em análise";
    } else {
      status = m.tipoCod === "ADM" ? "Concluído" : "Aprovado";
      aprovacaoFinal = { data: etapas[idx].data, hora: etapas[idx].hora! };
      if (m.tipoCod === "ADM" && m.admissaoInfo?.candidato) admissaoRegistrada = m.admissaoInfo;
      if (
        (m.tipoCod === "PRO" || m.tipoCod === "TRF") &&
        m.atualizacaoInfo &&
        (m.atualizacaoInfo.novoCargo || m.atualizacaoInfo.novoDepto || m.atualizacaoInfo.novoGestor)
      ) {
        atualizacaoRegistrada = m.atualizacaoInfo;
      }
      if (m.tipoCod === "DES" && m.desligamentoInfo?.nome) desligamentoRegistrado = m.desligamentoInfo;
    }

    return { ...m, etapas, status, aprovacaoFinal };
  });

  return { movimentacoes: novasMovimentacoes, admissaoRegistrada, atualizacaoRegistrada, desligamentoRegistrado };
}

export function reprovarEtapa(movimentacoes: Movimentacao[], id: string, comentario: string): Movimentacao[] {
  const hoje = formatarDataAtual();
  const agora = formatarHoraAtual();
  return movimentacoes.map((m) => {
    if (m.id !== id || m.status !== "Em Aprovação") return m;
    const etapas = m.etapas.map((e) => ({ ...e }));
    const idx = etapas.findIndex((e) => e.status === "Em análise" || e.status === "Aguardando");
    if (idx < 0) return m;
    etapas[idx].status = "Reprovado";
    etapas[idx].data = hoje;
    etapas[idx].hora = agora;
    etapas[idx].comentario = comentario;
    return { ...m, etapas, status: "Reprovado" };
  });
}

/** true só quando quem reprovou foi a própria etapa de RH — a última de toda
 * matriz (ver tiposMovimentacao.json, "RH" é sempre o último papel). É o
 * único caso em que "restaurar para o RH" faz sentido: se quem reprovou foi
 * Gestor Solicitante ou Diretor Industrial, a decisão de reabrir é daquela
 * etapa, não do RH. */
export function reprovadaPeloRH(m: Movimentacao): boolean {
  if (m.status !== "Reprovado") return false;
  const ultima = m.etapas[m.etapas.length - 1];
  return Boolean(ultima && ultima.papel === "RH" && ultima.status === "Reprovado");
}

/** Reabre uma movimentação reprovada pelo próprio RH, devolvendo-a para "Em
 * Aprovação" com a etapa de RH de volta em "Em análise" (limpa data/hora/
 * comentário da tentativa anterior) — as etapas já aprovadas antes dela
 * (Gestor Solicitante, Diretor Industrial) não são tocadas, então a
 * movimentação não volta ao início do fluxo. O motivo da reprovação anterior
 * é preservado no histórico, não perdido. */
export function reabrirParaRH(movimentacoes: Movimentacao[], id: string, autor: string): Movimentacao[] {
  const hoje = formatarDataAtual();
  const agora = formatarHoraAtual();
  return movimentacoes.map((m) => {
    if (m.id !== id || !reprovadaPeloRH(m)) return m;
    const idxRH = m.etapas.length - 1;
    const motivoAnterior = m.etapas[idxRH].comentario;
    const etapas = m.etapas.map((e, i) =>
      i === idxRH ? { ...e, status: "Em análise" as const, data: "", hora: "", comentario: "" } : e,
    );
    const evento: EventoHistoricoMovimentacao = {
      data: hoje,
      hora: agora,
      autor,
      acao: "Movimentação restaurada para nova análise do RH",
      detalhe: motivoAnterior ? `Motivo da reprovação anterior: "${motivoAnterior}"` : undefined,
    };
    return { ...m, status: "Em Aprovação", etapas, historico: [...(m.historico ?? []), evento] };
  });
}

export interface EdicaoDadoMovimentacao {
  label: string;
  valorAnterior: string;
  valorNovo: string;
}

/** Aplica edições pontuais a campos de exibição (`dados`) de uma
 * movimentação — hoje só usado pelo RH pra corrigir Salário/Data prevista ao
 * reabrir uma reprovação (ver reabrirParaRH()). Quando `novaDataPrevistaIso`
 * vem preenchido, também atualiza o campo estruturado correspondente
 * (atualizacaoInfo.dataPrevistaIso / admissaoInfo.admissaoIso /
 * desligamentoInfo.dataIso) — são esses campos que de fato disparam a
 * sincronização com `colaboradores`, então não podem ficar defasados em
 * relação ao texto exibido em `dados`. Cada edição entra no histórico. */
export function editarDadosMovimentacao(
  movimentacoes: Movimentacao[],
  id: string,
  edicoes: EdicaoDadoMovimentacao[],
  novaDataPrevistaIso: string | undefined,
  autor: string,
): Movimentacao[] {
  if (edicoes.length === 0) return movimentacoes;
  const hoje = formatarDataAtual();
  const agora = formatarHoraAtual();

  return movimentacoes.map((m) => {
    if (m.id !== id) return m;

    const dados = (m.dados ?? []).map((d) => {
      const edicao = edicoes.find((e) => e.label === d.label);
      return edicao ? { ...d, value: edicao.valorNovo } : d;
    });

    const historicoNovo: EventoHistoricoMovimentacao[] = edicoes.map((e) => ({
      data: hoje,
      hora: agora,
      autor,
      acao: `Campo "${e.label}" editado pelo RH`,
      detalhe: `De "${e.valorAnterior}" para "${e.valorNovo}".`,
    }));

    const atualizacaoInfo =
      novaDataPrevistaIso !== undefined && m.atualizacaoInfo ? { ...m.atualizacaoInfo, dataPrevistaIso: novaDataPrevistaIso } : m.atualizacaoInfo;
    const admissaoInfo =
      novaDataPrevistaIso !== undefined && m.admissaoInfo ? { ...m.admissaoInfo, admissaoIso: novaDataPrevistaIso } : m.admissaoInfo;
    const desligamentoInfo =
      novaDataPrevistaIso !== undefined && m.desligamentoInfo ? { ...m.desligamentoInfo, dataIso: novaDataPrevistaIso } : m.desligamentoInfo;

    return {
      ...m,
      dados,
      atualizacaoInfo,
      admissaoInfo,
      desligamentoInfo,
      historico: [...(m.historico ?? []), ...historicoNovo],
    };
  });
}

export function calcularPercentual(atual: string, novo: string): string {
  const parse = (x: string) => parseFloat(String(x || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  const pa = parse(atual);
  const pn = parse(novo);
  if (Number.isNaN(pa) || Number.isNaN(pn) || pa <= 0) return "—";
  return ((pn - pa) / pa * 100).toFixed(1).replace(".", ",") + "%";
}

import { formatarDataAtual, formatarHoraAtual } from "./dates";
import { ehCEO, roleApprover } from "./hierarquia";
import type { AdmissaoInfo, AtualizacaoCargoDeptoInfo, Colaborador, DesligamentoInfo, Etapa, Movimentacao, TipoMovimentacao } from "../types/domain";

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

export function calcularPercentual(atual: string, novo: string): string {
  const parse = (x: string) => parseFloat(String(x || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  const pa = parse(atual);
  const pn = parse(novo);
  if (Number.isNaN(pa) || Number.isNaN(pn) || pa <= 0) return "—";
  return ((pn - pa) / pa * 100).toFixed(1).replace(".", ",") + "%";
}

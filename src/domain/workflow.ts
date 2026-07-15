import { formatarDataAtual, formatarHoraAtual } from "./dates";
import { roleApprover } from "./hierarquia";
import type {
  AdmissaoInfo,
  AtualizacaoCargoDeptoInfo,
  CargoCustom,
  DesligamentoInfo,
  Etapa,
  Movimentacao,
  NovoCargoInfo,
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

export function montarEtapas(tipo: TipoMovimentacao, solicitanteGestor: string): Etapa[] {
  return tipo.etapas.map((papel, i) => ({
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
  cargoRegistrado: NovoCargoInfo | null;
  admissaoRegistrada: AdmissaoInfo | null;
  atualizacaoRegistrada: AtualizacaoCargoDeptoInfo | null;
  desligamentoRegistrado: DesligamentoInfo | null;
}

/** Advances the first pending/in-review etapa to "Aprovado"; completes the movement once the last etapa clears. */
export function aprovarEtapa(movimentacoes: Movimentacao[], id: string): ApproveResult {
  let cargoRegistrado: NovoCargoInfo | null = null;
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
      status = m.tipoCod === "ADM" || m.tipoCod === "NOV" ? "Concluído" : "Aprovado";
      aprovacaoFinal = { data: etapas[idx].data, hora: etapas[idx].hora! };
      if (m.tipoCod === "NOV" && m.novoCargo) cargoRegistrado = m.novoCargo;
      if (m.tipoCod === "ADM" && m.admissaoInfo?.candidato) admissaoRegistrada = m.admissaoInfo;
      if (
        (m.tipoCod === "PRO" || m.tipoCod === "TRF" || m.tipoCod === "FUN") &&
        m.atualizacaoInfo &&
        (m.atualizacaoInfo.novoCargo || m.atualizacaoInfo.novoDepto)
      ) {
        atualizacaoRegistrada = m.atualizacaoInfo;
      }
      if (m.tipoCod === "DES" && m.desligamentoInfo?.nome) desligamentoRegistrado = m.desligamentoInfo;
    }

    return { ...m, etapas, status, aprovacaoFinal };
  });

  return { movimentacoes: novasMovimentacoes, cargoRegistrado, admissaoRegistrada, atualizacaoRegistrada, desligamentoRegistrado };
}

export function reprovarEtapa(movimentacoes: Movimentacao[], id: string): Movimentacao[] {
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
    return { ...m, etapas, status: "Reprovado" };
  });
}

export function cargoCustomDeNovoCargo(info: NovoCargoInfo): CargoCustom {
  return {
    nome: info.nome,
    depto: info.depto,
    gestor: info.gestor,
    vagas: info.vagas,
    faixa: info.faixa,
    nivel: "Novo cargo",
    descricao: "Pendente",
  };
}

export function calcularPercentual(atual: string, novo: string): string {
  const parse = (x: string) => parseFloat(String(x || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  const pa = parse(atual);
  const pn = parse(novo);
  if (Number.isNaN(pa) || Number.isNaN(pn) || pa <= 0) return "—";
  return ((pn - pa) / pa * 100).toFixed(1).replace(".", ",") + "%";
}

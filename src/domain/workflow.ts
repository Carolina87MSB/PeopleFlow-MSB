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
  OrigemVaga,
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
 * ignorada: a movimentação pula Gestor Solicitante e Diretoria e vai direto
 * para RH — regra válida para todos os tipos.
 *
 * Para Promoção e Transferência, `solicitanteGestor` já vem resolvido pelo
 * chamador (construirMovimentacao() em formMovimentacao.ts) para o gestor
 * correto de cada caso — gestor atual (promoção sem mudança de
 * departamento) ou gestor do departamento de destino (promoção com mudança
 * de departamento, e toda transferência) — nunca é pulado, sempre precisa
 * de aprovação explícita.
 *
 * `depto` decide quem aprova a etapa "Diretoria" (ver roleApprover() em
 * hierarquia.ts) — Yuri Ivonei Crispim, exceto Administrativo/Comercial/
 * Qualidade e Regulatório, que vão pro Daniel Emiliano Suguer (CEO).
 */
export function montarEtapas(
  tipo: TipoMovimentacao,
  solicitanteGestor: string,
  solicitanteNome: string,
  colaboradores: Colaborador[],
  depto: string,
  /** true só para Desligamento por "Pedido de demissão" (RH, 2026-09) —
   * dispensa a etapa "Diretoria", que nunca existe pra decidir sobre pedido
   * do próprio colaborador. Sem efeito quando `ehCEO()` já reduz a matriz
   * a só "RH". */
  pularDiretoria = false,
): Etapa[] {
  const solicitanteColab = colaboradores.find((c) => c.nome === solicitanteNome);
  const papeisBase = ehCEO(solicitanteColab) ? ["RH"] : tipo.etapas;
  const papeis = pularDiretoria ? papeisBase.filter((p) => p !== "Diretoria") : papeisBase;
  return papeis.map((papel, i) => ({
    papel,
    aprovador: roleApprover(papel, { solicitanteGestor, depto }),
    status: i === 0 ? "Em análise" : "Aguardando",
    data: "",
    hora: "",
    comentario: "",
  }));
}

/** Sinaliza que a MP recém-concluída autoriza `quantidade` Vaga(s) (RH,
 * 2026-09) — ver aprovarEtapaFn() em store/usePortalData.ts, que de fato cria
 * as linhas em peopleflow_vagas. Nunca mais de um descritor por aprovação
 * (só a MP com `id` pode disparar isso). */
export interface VagaParaCriar {
  movimentacaoId: string;
  origem: OrigemVaga;
  /** Cargo já escolhido no formulário — null só quando genuinamente
   * indisponível (nunca inventado). */
  cargo: string | null;
  quantidade: number;
}

/** Sinaliza que a PRO/TRF recém-aprovada preenche internamente a vaga
 * `vagaId` (que ela mesma já tinha reservado na criação, ver
 * criarMovimentacaoFn em usePortalData.ts) — ver seção 39 do schema.sql. */
export interface VagaParaPreencherInternamente {
  vagaId: number;
  movimentacaoId: string;
}

export interface ApproveResult {
  movimentacoes: Movimentacao[];
  admissaoRegistrada: AdmissaoInfo | null;
  atualizacaoRegistrada: AtualizacaoCargoDeptoInfo | null;
  desligamentoRegistrado: DesligamentoInfo | null;
  vagaParaCriar: VagaParaCriar | null;
  vagaParaPreencherInternamente: VagaParaPreencherInternamente | null;
}

/** Advances the first pending/in-review etapa to "Aprovado"; completes the movement once the last etapa clears. */
export function aprovarEtapa(movimentacoes: Movimentacao[], id: string): ApproveResult {
  let admissaoRegistrada: AdmissaoInfo | null = null;
  let atualizacaoRegistrada: AtualizacaoCargoDeptoInfo | null = null;
  let desligamentoRegistrado: DesligamentoInfo | null = null;
  let vagaParaCriar: VagaParaCriar | null = null;
  let vagaParaPreencherInternamente: VagaParaPreencherInternamente | null = null;
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

      if (m.tipoCod === "ADM") {
        // "Aumento de quadro" (Quantidade de vagas > 1): autoriza N vagas
        // preenchidas depois, uma a uma, pelo RH — não cria pré-cadastro
        // automático pro "Candidato" do formulário (ver seção 8 do pedido da
        // RH: um candidato preenchido não deve travar as demais vagas nem
        // ser presumido como já ocupando uma delas). Quantidade <= 1
        // preserva o comportamento antigo (pré-cadastro direto), intocado.
        const qtd = parseInt((m.dados ?? []).find((d) => d.label === "Quantidade de vagas")?.value ?? "1", 10) || 1;
        if (qtd > 1) {
          const cargoSolicitado = (m.dados ?? []).find((d) => d.label === "Cargo solicitado")?.value ?? null;
          vagaParaCriar = { movimentacaoId: m.id, origem: "aumento_quadro", cargo: cargoSolicitado, quantidade: qtd };
        } else if (m.admissaoInfo?.candidato) {
          admissaoRegistrada = m.admissaoInfo;
        }
      }
      if (
        (m.tipoCod === "PRO" || m.tipoCod === "TRF") &&
        m.atualizacaoInfo &&
        (m.atualizacaoInfo.novoCargo || m.atualizacaoInfo.novoDepto || m.atualizacaoInfo.novoGestor)
      ) {
        atualizacaoRegistrada = m.atualizacaoInfo;
      }
      if (m.tipoCod === "PRO" || m.tipoCod === "TRF") {
        // Ramificações/cadeia de movimentações (RH, 2026-09) — as duas coisas
        // abaixo NÃO são excludentes: a mesma PRO/TRF pode preencher uma vaga
        // anterior E gerar uma vaga nova ao mesmo tempo (ver seção 39 do
        // schema.sql). A vaga que ELA MESMA preenche já foi reservada na
        // criação (criarMovimentacaoFn) — aqui só confirma a conclusão.
        if (m.vagaOrigemId) {
          vagaParaPreencherInternamente = { vagaId: m.vagaOrigemId, movimentacaoId: m.id };
        }
        if (m.geraNovaVaga) {
          vagaParaCriar = {
            movimentacaoId: m.id,
            origem: m.tipoCod === "PRO" ? "vacancia_promocao" : "vacancia_transferencia",
            cargo: null,
            quantidade: 1,
          };
        }
      }
      if (m.tipoCod === "DES" && m.desligamentoInfo?.nome) desligamentoRegistrado = m.desligamentoInfo;
      if (m.tipoCod === "DES" && (m.dados ?? []).some((d) => d.label === "Substituição" && d.value === "Sim")) {
        // Cargo NUNCA é definido na abertura do desligamento (RH, 2026-09) —
        // a autorização é pra reposição da NECESSIDADE, não necessariamente
        // do mesmo cargo; quem escolhe o cargo é o RH, só em "Registrar
        // preenchimento", quando já existir candidato(a) aprovado(a).
        vagaParaCriar = { movimentacaoId: m.id, origem: "substituicao", cargo: null, quantidade: 1 };
      }
    }

    return { ...m, etapas, status, aprovacaoFinal };
  });

  return {
    movimentacoes: novasMovimentacoes,
    admissaoRegistrada,
    atualizacaoRegistrada,
    desligamentoRegistrado,
    vagaParaCriar,
    vagaParaPreencherInternamente,
  };
}

export interface ReproveResult {
  movimentacoes: Movimentacao[];
  /** Vaga a liberar de volta pra "pendente" — a PRO/TRF reprovada tinha
   * reservado uma vaga na criação (ver Movimentacao.vagaOrigemId, seção 39
   * do schema.sql); reprovar NUNCA deixa a vaga presa a uma movimentação que
   * não vai mais se concretizar. */
  vagaParaLiberar: VagaParaPreencherInternamente | null;
}

export function reprovarEtapa(movimentacoes: Movimentacao[], id: string, comentario: string): ReproveResult {
  const hoje = formatarDataAtual();
  const agora = formatarHoraAtual();
  let vagaParaLiberar: VagaParaPreencherInternamente | null = null;
  const novasMovimentacoes = movimentacoes.map((m) => {
    if (m.id !== id || m.status !== "Em Aprovação") return m;
    const etapas = m.etapas.map((e) => ({ ...e }));
    const idx = etapas.findIndex((e) => e.status === "Em análise" || e.status === "Aguardando");
    if (idx < 0) return m;
    etapas[idx].status = "Reprovado";
    etapas[idx].data = hoje;
    etapas[idx].hora = agora;
    etapas[idx].comentario = comentario;
    if (m.vagaOrigemId) vagaParaLiberar = { vagaId: m.vagaOrigemId, movimentacaoId: m.id };
    return { ...m, etapas, status: "Reprovado" as const };
  });
  return { movimentacoes: novasMovimentacoes, vagaParaLiberar };
}

/** true só quando quem reprovou foi a própria etapa de RH — a última de toda
 * matriz (ver tiposMovimentacao.json, "RH" é sempre o último papel). É o
 * único caso em que "restaurar para o RH" faz sentido: se quem reprovou foi
 * Gestor Solicitante ou Diretoria, a decisão de reabrir é daquela etapa, não
 * do RH. */
export function reprovadaPeloRH(m: Movimentacao): boolean {
  if (m.status !== "Reprovado") return false;
  const ultima = m.etapas[m.etapas.length - 1];
  return Boolean(ultima && ultima.papel === "RH" && ultima.status === "Reprovado");
}

/** Reabre uma movimentação reprovada pelo próprio RH, devolvendo-a para "Em
 * Aprovação" com a etapa de RH de volta em "Em análise" (limpa data/hora/
 * comentário da tentativa anterior) — as etapas já aprovadas antes dela
 * (Gestor Solicitante, Diretoria) não são tocadas, então a
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

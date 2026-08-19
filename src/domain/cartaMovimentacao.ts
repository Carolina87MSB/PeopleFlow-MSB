// Carta de Movimentação de Pessoal — funções puras, sem estado nem
// dependência de UI/Supabase. Integrada ao fluxo de Movimentação já
// existente (nunca cria uma movimentação nova, nunca toca em Etapas/status
// de aprovação — ver domain/workflow.ts, que permanece intocado). Só existe
// depois que a movimentação já foi aprovada pelo fluxo normal; as
// "assinaturas" aqui são ciência (nome/cargo/data/status), nunca aprovação.

import type { AssinaturaCarta, CartaMovimentacao, Colaborador, Movimentacao, TipoCod } from "../types/domain";

/** Tipos pra que o texto-modelo da carta ("sua condição funcional passará a
 * ser...") faz sentido — Admissão (contratação, não movimentação de quem já
 * está na empresa) e Desligamento (saída, não uma "nova condição") continuam
 * usando os documentos próprios que já existem (docsFor() em domain/documentos.ts). */
const TIPOS_ELEGIVEIS: TipoCod[] = ["PRO", "TRF", "SAL"];

/** true só quando a movimentação já passou pelo fluxo normal de aprovação
 * (nunca em "Em Aprovação"/"Rascunho"/"Reprovado"), é de um tipo elegível, e
 * ainda não tem carta emitida — emitir de novo não é uma ação deste módulo
 * (a carta, uma vez criada, só evolui via ciência/entrega). */
export function podeEmitirCarta(m: Movimentacao): boolean {
  return (m.status === "Aprovado" || m.status === "Concluído") && TIPOS_ELEGIVEIS.includes(m.tipoCod) && !m.cartaMovimentacao;
}

function valorDado(m: Movimentacao, label: string): string | null {
  return m.dados?.find((d) => d.label === label)?.value ?? null;
}

/** Frase que substitui "[descrever objetivamente a alteração realizada]" no
 * modelo — lida inteiramente de `dados`/`atualizacaoInfo` já registrados na
 * própria movimentação, nunca redigitada. Congelada uma única vez na emissão
 * (ver emitirCarta()) — não é recalculada se a movimentação for editada depois. */
export function gerarDescricaoAlteracao(m: Movimentacao): string {
  switch (m.tipoCod) {
    case "PRO": {
      const novoCargo = m.atualizacaoInfo?.novoCargo || valorDado(m, "Novo cargo") || "—";
      const novoDepto = m.atualizacaoInfo?.novoDepto || valorDado(m, "Departamento de destino");
      return novoDepto ? `passará a ocupar o cargo de ${novoCargo}, no departamento de ${novoDepto}.` : `passará a ocupar o cargo de ${novoCargo}.`;
    }
    case "TRF": {
      const novoDepto = m.atualizacaoInfo?.novoDepto || valorDado(m, "Novo departamento") || "—";
      return `passará a integrar o departamento de ${novoDepto}.`;
    }
    case "SAL": {
      const salarioAtual = valorDado(m, "Salário atual") || "—";
      const novoSalario = valorDado(m, "Novo salário") || "—";
      return `terá seu salário reajustado de ${salarioAtual} para ${novoSalario}.`;
    }
    default:
      return "";
  }
}

/** O "Gestor responsável" da carta é o mesmo já registrado na etapa "Gestor
 * Solicitante" do fluxo de aprovação — dado já existente, nunca uma nova
 * informação a coletar. */
export function gestorResponsavel(m: Movimentacao): string {
  return m.etapas.find((e) => e.papel === "Gestor Solicitante")?.aprovador ?? "";
}

function assinaturaPendente(nome: string, cargo: string): AssinaturaCarta {
  return { nome, cargo, data: null, status: "Pendente" };
}

/** Monta a carta inicial — a ciência do gestor nasce "Pendente"; nome/cargo
 * já vêm preenchidos pra exibição, mesmo antes de ele confirmar. */
export function emitirCarta(m: Movimentacao, emitidoPor: string, colaboradores: Colaborador[]): CartaMovimentacao {
  const colaboradorPorNome = new Map(colaboradores.map((c) => [c.nome, c]));
  const nomeGestor = gestorResponsavel(m);
  const cargoGestor = colaboradorPorNome.get(nomeGestor)?.cargo ?? "";
  return {
    emitidaEm: new Date().toISOString(),
    emitidaPor: emitidoPor,
    descricaoAlteracao: gerarDescricaoAlteracao(m),
    assinaturaGestor: assinaturaPendente(nomeGestor, cargoGestor),
    finalizadaEm: null,
    entregueAoColaborador: false,
    entregueEm: null,
    entreguePor: null,
  };
}

/** A carta fica finalizada só com a ciência do gestor responsável — não há
 * ciência de RH nem do colaborador registradas no sistema (a do colaborador
 * fica pra assinatura física, fora do portal, na carta impressa). */
export function cartaFinalizada(carta: CartaMovimentacao): boolean {
  return carta.assinaturaGestor.status === "Assinado";
}

/** Registra a ciência do gestor responsável — nunca aprovação, só
 * confirmação de que ele tomou conhecimento. Habilita o PDF. */
export function darCienciaGestor(carta: CartaMovimentacao, nome: string, cargo: string): CartaMovimentacao {
  const agora = new Date().toISOString();
  return {
    ...carta,
    assinaturaGestor: { nome, cargo, data: agora, status: "Assinado" },
    finalizadaEm: carta.finalizadaEm ?? agora,
  };
}

export function podeDarCienciaComoGestor(m: Movimentacao, me: string): boolean {
  return Boolean(m.cartaMovimentacao) && gestorResponsavel(m) === me && m.cartaMovimentacao?.assinaturaGestor.status === "Pendente";
}

/** RH-only — só depois da ciência do gestor, e só uma vez (sem "desmarcar"
 * no fluxo atual, mesmo padrão de outras confirmações do portal). */
export function podeMarcarEntregue(carta: CartaMovimentacao): boolean {
  return cartaFinalizada(carta) && !carta.entregueAoColaborador;
}

export function marcarEntregue(carta: CartaMovimentacao, entreguePor: string): CartaMovimentacao {
  return { ...carta, entregueAoColaborador: true, entregueEm: new Date().toISOString(), entreguePor };
}

export type StatusCarta = "Aguardando ciência" | "Finalizada" | "Entregue ao colaborador";

export function statusCarta(carta: CartaMovimentacao): StatusCarta {
  if (carta.entregueAoColaborador) return "Entregue ao colaborador";
  if (cartaFinalizada(carta)) return "Finalizada";
  return "Aguardando ciência";
}

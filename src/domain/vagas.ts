// Rótulos e regras puras de Vaga (RH, 2026-09) — compartilhados entre
// VagasAutorizadasBloco.tsx, CadeiaMovimentacaoBloco.tsx e
// NovaMovimentacaoModal.tsx (dropdown de "Qual vaga esta movimentação irá
// preencher?" em PRO/TRF).
import type { Colaborador, Movimentacao, OrigemVaga, StatusVaga, Vaga } from "../types/domain";

export const ORIGEM_VAGA_LABEL: Record<OrigemVaga, string> = {
  substituicao: "Substituição",
  aumento_quadro: "Aumento de quadro",
  vacancia_promocao: "Vacância por Promoção",
  vacancia_transferencia: "Vacância por Transferência",
};

export const STATUS_VAGA_LABEL: Record<StatusVaga, string> = {
  pendente: "Pendente de preenchimento",
  reservada: "Reservada por movimentação em aprovação",
  aguardando_aprovacao_gestor: "Aguardando aprovação do gestor",
  preenchida: "Preenchimento concluído",
};

/** true só quando a vaga tem saldo disponível pra ser selecionada como "Vaga
 * de origem" numa nova Promoção/Transferência (ver seção 15 do pedido da RH,
 * 2026-09: "evitar duplo preenchimento") — autorizada, sem preenchimento em
 * andamento nem concluído. A garantia de verdade contra corrida (dois
 * gestores escolhendo a mesma vaga ao mesmo tempo) é no banco, não aqui —
 * ver reservarVaga() em vagasRepository.ts (UPDATE condicional). */
export function vagaDisponivelParaPreenchimento(v: Vaga): boolean {
  return v.status === "pendente";
}

/** Texto de uma vaga pro dropdown "Qual vaga esta movimentação irá
 * preencher?" em PRO/TRF (RH, 2026-09) — o gestor precisa reconhecer a vaga
 * pelo departamento/motivo/colaborador, NUNCA pelo código da MP (que só
 * aparece por último, como referência). O `<select>` nativo só renderiza
 * texto em uma linha por opção, por isso as informações vêm concatenadas
 * (departamento e motivo primeiro, MP por último) em vez do layout em duas
 * linhas do mockup original — mesma hierarquia, adaptada à limitação do
 * elemento HTML (nenhum componente de dropdown custom existe hoje no app).
 * O cargo mostrado aqui é só do COLABORADOR QUE ORIGINOU a vaga (ajuda a
 * reconhecer) — nunca significa que a reposição terá esse mesmo cargo; isso
 * continua sendo definido só em "Registrar preenchimento". Nunca inventa um
 * dado que não exista (cargo/saldo omitidos quando indisponíveis). */
export function descreverVagaParaSelecao(vaga: Vaga, movimentacoes: Movimentacao[], colaboradores: Colaborador[], todasVagas: Vaga[]): string {
  const mpOrigem = movimentacoes.find((m) => m.id === vaga.movimentacaoId);
  const partes: string[] = [];

  if (vaga.origem === "substituicao") {
    const depto = mpOrigem?.depto ?? "—";
    const nomeColaborador = mpOrigem?.colaborador ?? "—";
    const colaboradorOrigem =
      (mpOrigem?.colaboradorId && colaboradores.find((c) => c.id === mpOrigem.colaboradorId)) || colaboradores.find((c) => c.nome === nomeColaborador);
    partes.push(`${depto} — Substituição de ${nomeColaborador}`);
    if (colaboradorOrigem?.cargo) partes.push(colaboradorOrigem.cargo);
  } else if (vaga.origem === "aumento_quadro") {
    const depto = mpOrigem?.depto ?? "—";
    const saldo = todasVagas.filter((v) => v.movimentacaoId === vaga.movimentacaoId && v.status === "pendente").length;
    partes.push(`${depto} — Aumento de quadro`);
    if (vaga.cargo) partes.push(vaga.cargo);
    partes.push(`${saldo} vaga${saldo === 1 ? "" : "s"} ${saldo === 1 ? "disponível" : "disponíveis"}`);
  } else {
    // vacancia_promocao | vacancia_transferencia
    const motivo = vaga.origem === "vacancia_promocao" ? "promoção" : "transferência";
    const nomeColaborador = mpOrigem?.colaborador ?? "—";
    const deptoOrigem = mpOrigem?.dados?.find((d) => d.label === "Departamento de origem" || d.label === "Departamento atual")?.value ?? mpOrigem?.depto ?? "—";
    const cargoOrigem = mpOrigem?.dados?.find((d) => d.label === "Cargo atual")?.value;
    partes.push(`${deptoOrigem} — Vacância por ${motivo} de ${nomeColaborador}`);
    if (cargoOrigem) partes.push(cargoOrigem);
  }

  if (mpOrigem) partes.push(mpOrigem.id);
  return partes.join(" · ");
}

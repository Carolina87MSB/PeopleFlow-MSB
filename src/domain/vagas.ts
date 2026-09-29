// Rótulos e regras puras de Vaga (RH, 2026-09) — compartilhados entre
// VagasAutorizadasBloco.tsx, CadeiaMovimentacaoBloco.tsx e
// NovaMovimentacaoModal.tsx (dropdown de "Vaga de origem" em PRO/TRF).
import type { OrigemVaga, StatusVaga, Vaga } from "../types/domain";

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

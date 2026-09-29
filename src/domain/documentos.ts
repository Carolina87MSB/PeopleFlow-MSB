import type { DocumentoGerado, Movimentacao } from "../types/domain";

function doc(nome: string, status: "Gerado" | "Pendente"): DocumentoGerado {
  return { nome, status };
}

/** Mirrors the prototype's docsFor(): the set of paperwork a movement type auto-generates on approval.
 * Desligamento (DES) não usa mais esta lista mockada — ver o bloco "Aviso
 * prévio"/"Documento assinado" com status real em MovimentacaoDetalhe.tsx. */
export function docsFor(m: Movimentacao): DocumentoGerado[] {
  if (m.tipoCod === "DES") return [];
  const list: DocumentoGerado[] = [];
  switch (m.tipoCod) {
    case "ADM":
      list.push(doc("Requisição de pessoal (RP)", "Gerado"), doc("Proposta de admissão", "Gerado"));
      break;
    case "PRO":
      list.push(doc("Termo de promoção", "Gerado"), doc("Tabela salarial atualizada", "Gerado"));
      break;
    case "SAL":
      list.push(doc("Termo de alteração salarial", "Gerado"));
      break;
    case "TRF":
      list.push(doc("Comunicado de transferência", "Gerado"));
      break;
    default:
      break;
  }
  list.push(doc("Trilha de aprovação (PDF)", "Gerado"));
  return list;
}

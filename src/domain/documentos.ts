import type { CargoCustom, DocumentoGerado, Movimentacao } from "../types/domain";

function doc(nome: string, status: "Gerado" | "Pendente"): DocumentoGerado {
  return { nome, status };
}

/** Mirrors the prototype's docsFor(): the set of paperwork a movement type auto-generates on approval. */
export function docsFor(m: Movimentacao, cargosCustom: CargoCustom[]): DocumentoGerado[] {
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
    case "FUN":
      list.push(doc("Termo de mudança de função", "Gerado"));
      break;
    case "DES":
      list.push(doc("Termo de desligamento", "Gerado"), doc("Aviso prévio", "Gerado"));
      break;
    case "NOV": {
      const cc = cargosCustom.find((c) => c.nome === m.novoCargo?.nome);
      const status = cc && cc.descricao === "OK" ? "Gerado" : "Pendente";
      list.push(doc("Descrição de cargo", status), doc("Comunicado de criação de cargo", "Gerado"));
      break;
    }
    default:
      break;
  }
  list.push(doc("Trilha de aprovação (PDF)", "Gerado"));
  return list;
}

import { aprovarEtapa, reprovarEtapa } from "../domain/workflow";
import type { PortalAction } from "./actions";
import type { PortalState } from "./types";

export const initialPortalState: PortalState = {
  colaboradores: [],
  movimentacoes: [],
  cargosCustom: [],
  tipos: [],
  perfis: [],
};

export function portalReducer(state: PortalState, action: PortalAction): PortalState {
  switch (action.type) {
    case "CARREGAR_DADOS":
      return {
        ...state,
        colaboradores: action.colaboradores,
        movimentacoes: action.movimentacoes,
        cargosCustom: action.cargosCustom,
        tipos: action.tipos,
        perfis: action.perfis,
      };

    case "RESET":
      return initialPortalState;

    case "APROVAR_ETAPA": {
      const { movimentacoes, cargoRegistrado } = aprovarEtapa(state.movimentacoes, action.id);
      const cargosCustom = cargoRegistrado
        ? state.cargosCustom.some((c) => c.nome === cargoRegistrado!.nome)
          ? state.cargosCustom
          : [
              ...state.cargosCustom,
              {
                nome: cargoRegistrado.nome,
                depto: cargoRegistrado.depto,
                gestor: cargoRegistrado.gestor,
                vagas: cargoRegistrado.vagas,
                faixa: cargoRegistrado.faixa,
                nivel: "Novo cargo",
                descricao: "Pendente" as const,
              },
            ]
        : state.cargosCustom;
      return { ...state, movimentacoes, cargosCustom };
    }

    case "REPROVAR_ETAPA":
      return { ...state, movimentacoes: reprovarEtapa(state.movimentacoes, action.id) };

    case "CRIAR_MOVIMENTACAO":
      return { ...state, movimentacoes: [action.movimentacao, ...state.movimentacoes] };

    case "REGISTRAR_CARGO_CUSTOM":
      if (state.cargosCustom.some((c) => c.nome === action.cargo.nome)) return state;
      return { ...state, cargosCustom: [...state.cargosCustom, action.cargo] };

    case "TOGGLE_DESCRICAO_CARGO":
      return {
        ...state,
        cargosCustom: state.cargosCustom.map((c) =>
          c.nome === action.nome ? { ...c, descricao: c.descricao === "OK" ? "Pendente" : "OK" } : c,
        ),
      };

    default:
      return state;
  }
}

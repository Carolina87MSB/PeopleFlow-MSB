import { aprovarEtapa, reprovarEtapa } from "../domain/workflow";
import type { PortalAction } from "./actions";
import type { PortalState } from "./types";

export const initialPortalState: PortalState = {
  colaboradores: [],
  movimentacoes: [],
  cargosCustom: [],
  tipos: [],
  perfis: [],
  desligamentosFinanceiros: [],
  descricoesCargo: [],
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
        desligamentosFinanceiros: action.desligamentosFinanceiros,
        descricoesCargo: action.descricoesCargo,
      };

    case "ATUALIZAR_ADMISSAO_COLABORADOR": {
      return {
        ...state,
        colaboradores: state.colaboradores.map((c) =>
          c.nome === action.nome
            ? { ...c, admissao: action.admissao, admissaoIso: action.admissaoIso, tempoDeEmpresa: action.tempoDeEmpresa }
            : c,
        ),
      };
    }

    case "ATUALIZAR_DESCRICAO_CARGO": {
      const existe = state.descricoesCargo.some((d) => d.cargoNome === action.descricao.cargoNome);
      const descricoesCargo = existe
        ? state.descricoesCargo.map((d) => (d.cargoNome === action.descricao.cargoNome ? action.descricao : d))
        : [...state.descricoesCargo, action.descricao];
      return { ...state, descricoesCargo };
    }

    case "SALVAR_FECHAMENTO_FINANCEIRO": {
      const existe = state.desligamentosFinanceiros.some((d) => d.colaboradorNome === action.desligamento.colaboradorNome);
      const desligamentosFinanceiros = existe
        ? state.desligamentosFinanceiros.map((d) => (d.colaboradorNome === action.desligamento.colaboradorNome ? action.desligamento : d))
        : [...state.desligamentosFinanceiros, action.desligamento];
      return { ...state, desligamentosFinanceiros };
    }

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
      return { ...state, movimentacoes: reprovarEtapa(state.movimentacoes, action.id, action.comentario) };

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

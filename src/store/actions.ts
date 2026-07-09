import type { CargoCustom, Colaborador, Movimentacao, Perfil2Info, TipoMovimentacao } from "../types/domain";

export type PortalAction =
  | { type: "CARREGAR_SEED"; colaboradores: Colaborador[]; movimentacoes: Movimentacao[]; tipos: TipoMovimentacao[]; perfis: Perfil2Info[] }
  | { type: "APROVAR_ETAPA"; id: string }
  | { type: "REPROVAR_ETAPA"; id: string }
  | { type: "CRIAR_MOVIMENTACAO"; movimentacao: Movimentacao }
  | { type: "REGISTRAR_CARGO_CUSTOM"; cargo: CargoCustom }
  | { type: "TOGGLE_DESCRICAO_CARGO"; nome: string };

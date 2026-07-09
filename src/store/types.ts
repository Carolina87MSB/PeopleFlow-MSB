import type { CargoCustom, Colaborador, Movimentacao, Perfil2Info, TipoMovimentacao } from "../types/domain";

export interface PortalState {
  colaboradores: Colaborador[];
  movimentacoes: Movimentacao[];
  cargosCustom: CargoCustom[];
  tipos: TipoMovimentacao[];
  perfis: Perfil2Info[];
}

import type {
  AvaliacaoExperiencia,
  CargoCustom,
  Colaborador,
  DescricaoCargo,
  DesligamentoFinanceiro,
  DispensaAvaliacaoExperiencia,
  Movimentacao,
  Perfil2Info,
  TipoMovimentacao,
} from "../types/domain";

export interface PortalState {
  colaboradores: Colaborador[];
  movimentacoes: Movimentacao[];
  cargosCustom: CargoCustom[];
  tipos: TipoMovimentacao[];
  perfis: Perfil2Info[];
  desligamentosFinanceiros: DesligamentoFinanceiro[];
  descricoesCargo: DescricaoCargo[];
  avaliacoesExperiencia: AvaliacaoExperiencia[];
  dispensasAvaliacaoExperiencia: DispensaAvaliacaoExperiencia[];
}

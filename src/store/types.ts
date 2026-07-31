import type {
  AvaliacaoDesempenho,
  AvaliacaoExperiencia,
  CargoCustom,
  Colaborador,
  CompetenciaComportamental,
  ConfigAvaliacaoDesempenho,
  DescricaoCargo,
  DesligamentoFinanceiro,
  DispensaAvaliacaoExperiencia,
  KpiCargo,
  Movimentacao,
  Pdi,
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
  configAvaliacaoDesempenho: ConfigAvaliacaoDesempenho | null;
  competenciasComportamentais: CompetenciaComportamental[];
  kpisCargo: KpiCargo[];
  avaliacoesDesempenho: AvaliacaoDesempenho[];
  pdi: Pdi[];
}

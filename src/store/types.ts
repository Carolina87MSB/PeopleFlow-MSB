import type {
  AvaliacaoDesempenho,
  AvaliacaoExperiencia,
  AvaliacaoPotencial,
  CargoCustom,
  CicloAvaliacaoDesempenho,
  Colaborador,
  CompetenciaComportamental,
  ConfigAvaliacaoDesempenho,
  ConfigDashboard,
  ConfigEncargosFolha,
  DescricaoCargo,
  DesligamentoFinanceiro,
  DispensaAvaliacaoExperiencia,
  Feedback,
  KpiCargo,
  Movimentacao,
  Pdi,
  PdiBibliotecaItem,
  Perfil2Info,
  ReajusteSalarial,
  SalarioBase,
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
  ciclosAvaliacaoDesempenho: CicloAvaliacaoDesempenho[];
  pdi: Pdi[];
  pdiBiblioteca: PdiBibliotecaItem[];
  avaliacoesPotencial: AvaliacaoPotencial[];
  configDashboard: ConfigDashboard | null;
  configEncargosFolha: ConfigEncargosFolha | null;
  salariosBase: SalarioBase[];
  reajustesSalariais: ReajusteSalarial[];
  feedbacks: Feedback[];
}

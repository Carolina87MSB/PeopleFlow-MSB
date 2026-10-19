import type { ConferenciaFinanceira } from "../domain/custosRescisao";
import type { RescisaoHistorica } from "../domain/rescisoesHistorico";
import type {
  AvaliacaoDesempenho,
  AvaliacaoExperiencia,
  AvaliacaoPotencial,
  CargoCustom,
  CicloAvaliacaoDesempenho,
  Colaborador,
  CompetenciaCargoCatalogo,
  CompetenciaComportamental,
  ConfigAvaliacaoDesempenho,
  ConfigDashboard,
  ConfigEncargosFolha,
  DescricaoCargo,
  DescricaoCargoCompetencia,
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
  Vaga,
} from "../types/domain";

export interface PortalState {
  colaboradores: Colaborador[];
  movimentacoes: Movimentacao[];
  cargosCustom: CargoCustom[];
  tipos: TipoMovimentacao[];
  perfis: Perfil2Info[];
  desligamentosFinanceiros: DesligamentoFinanceiro[];
  /** Conferência financeira dos desligamentos (valores individuais) — só o RH recebe; os demais perfis ficam com null. */
  conferenciaFinanceira: ConferenciaFinanceira | null;
  descricoesCargo: DescricaoCargo[];
  catalogoCompetenciasCargo: CompetenciaCargoCatalogo[];
  descricaoCargoCompetencias: DescricaoCargoCompetencia[];
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
  vagas: Vaga[];
  /** Histórico de rescisões da folha (indicadores do Dashboard Executivo); vazio se a migration ainda não foi aplicada. */
  rescisoesHistorico: RescisaoHistorica[];
}

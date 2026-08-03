import type {
  AvaliacaoDesempenho,
  AvaliacaoExperiencia,
  AvaliacaoPotencial,
  CargoCustom,
  CicloAvaliacaoDesempenho,
  Colaborador,
  CompetenciaComportamental,
  ConfigAvaliacaoDesempenho,
  DescricaoCargo,
  DesligamentoFinanceiro,
  DispensaAvaliacaoExperiencia,
  KpiCargo,
  Movimentacao,
  Pdi,
  PdiBibliotecaItem,
  Perfil2Info,
  TipoMovimentacao,
} from "../types/domain";

export type PortalAction =
  | {
      type: "CARREGAR_DADOS";
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
    }
  | { type: "CRIAR_AVALIACAO_EXPERIENCIA"; avaliacao: AvaliacaoExperiencia }
  | { type: "CRIAR_DISPENSA_AVALIACAO_EXPERIENCIA"; dispensa: DispensaAvaliacaoExperiencia }
  | { type: "APROVAR_ETAPA"; id: string }
  | { type: "REPROVAR_ETAPA"; id: string; comentario: string }
  | { type: "CRIAR_MOVIMENTACAO"; movimentacao: Movimentacao }
  | { type: "REGISTRAR_CARGO_CUSTOM"; cargo: CargoCustom }
  | { type: "TOGGLE_DESCRICAO_CARGO"; nome: string }
  | { type: "SALVAR_FECHAMENTO_FINANCEIRO"; desligamento: DesligamentoFinanceiro }
  | { type: "ATUALIZAR_DESCRICAO_CARGO"; descricao: DescricaoCargo }
  | { type: "ATUALIZAR_ADMISSAO_COLABORADOR"; nome: string; admissao: string; admissaoIso: string; tempoDeEmpresa: string }
  | { type: "ATUALIZAR_CONFIG_AVALIACAO_DESEMPENHO"; config: ConfigAvaliacaoDesempenho }
  | { type: "SALVAR_COMPETENCIA_COMPORTAMENTAL"; competencia: CompetenciaComportamental }
  | { type: "CRIAR_KPI_CARGO"; kpi: KpiCargo }
  | { type: "ATUALIZAR_KPI_CARGO"; kpi: KpiCargo }
  | { type: "EXCLUIR_KPI_CARGO"; id: number }
  | { type: "CRIAR_CICLO_AVALIACAO_DESEMPENHO"; ciclo: CicloAvaliacaoDesempenho; avaliacoes: AvaliacaoDesempenho[] }
  | { type: "ATUALIZAR_AVALIACAO_DESEMPENHO"; avaliacao: AvaliacaoDesempenho }
  | { type: "ENCERRAR_CICLO_AVALIACAO_DESEMPENHO"; id: string }
  | { type: "CRIAR_PDI"; pdi: Pdi }
  | { type: "ATUALIZAR_PDI"; pdi: Pdi }
  | { type: "SALVAR_ITEM_BIBLIOTECA_PDI"; item: PdiBibliotecaItem }
  | { type: "EXCLUIR_ITEM_BIBLIOTECA_PDI"; chave: string; tipoCompetencia: PdiBibliotecaItem["tipoCompetencia"] }
  | { type: "CRIAR_AVALIACOES_POTENCIAL"; avaliacoes: AvaliacaoPotencial[] }
  | { type: "ATUALIZAR_AVALIACAO_POTENCIAL"; avaliacao: AvaliacaoPotencial }
  | { type: "RESET" };

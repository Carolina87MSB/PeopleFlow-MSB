import { aprovarEtapa, editarDadosMovimentacao, reabrirParaRH, reprovarEtapa } from "../domain/workflow";
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
  avaliacoesExperiencia: [],
  dispensasAvaliacaoExperiencia: [],
  configAvaliacaoDesempenho: null,
  competenciasComportamentais: [],
  kpisCargo: [],
  avaliacoesDesempenho: [],
  ciclosAvaliacaoDesempenho: [],
  pdi: [],
  pdiBiblioteca: [],
  avaliacoesPotencial: [],
  configDashboard: null,
  configEncargosFolha: null,
  salariosBase: [],
  reajustesSalariais: [],
  feedbacks: [],
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
        avaliacoesExperiencia: action.avaliacoesExperiencia,
        dispensasAvaliacaoExperiencia: action.dispensasAvaliacaoExperiencia,
        configAvaliacaoDesempenho: action.configAvaliacaoDesempenho,
        competenciasComportamentais: action.competenciasComportamentais,
        kpisCargo: action.kpisCargo,
        avaliacoesDesempenho: action.avaliacoesDesempenho,
        ciclosAvaliacaoDesempenho: action.ciclosAvaliacaoDesempenho,
        pdi: action.pdi,
        pdiBiblioteca: action.pdiBiblioteca,
        avaliacoesPotencial: action.avaliacoesPotencial,
        configDashboard: action.configDashboard,
        configEncargosFolha: action.configEncargosFolha,
        salariosBase: action.salariosBase,
        reajustesSalariais: action.reajustesSalariais,
        feedbacks: action.feedbacks,
      };

    case "ADICIONAR_REAJUSTES_SALARIAIS":
      return { ...state, reajustesSalariais: [...action.reajustes, ...state.reajustesSalariais] };

    case "CRIAR_AVALIACAO_EXPERIENCIA":
      return { ...state, avaliacoesExperiencia: [action.avaliacao, ...state.avaliacoesExperiencia] };

    case "CRIAR_DISPENSA_AVALIACAO_EXPERIENCIA":
      return { ...state, dispensasAvaliacaoExperiencia: [action.dispensa, ...state.dispensasAvaliacaoExperiencia] };

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
      const { movimentacoes } = aprovarEtapa(state.movimentacoes, action.id);
      return { ...state, movimentacoes };
    }

    case "REPROVAR_ETAPA":
      return { ...state, movimentacoes: reprovarEtapa(state.movimentacoes, action.id, action.comentario) };

    case "REABRIR_MOVIMENTACAO_RH":
      return { ...state, movimentacoes: reabrirParaRH(state.movimentacoes, action.id, action.autor) };

    case "EDITAR_DADOS_MOVIMENTACAO":
      return {
        ...state,
        movimentacoes: editarDadosMovimentacao(state.movimentacoes, action.id, action.edicoes, action.novaDataPrevistaIso, action.autor),
      };

    case "ATUALIZAR_CARTA_MOVIMENTACAO":
      return {
        ...state,
        movimentacoes: state.movimentacoes.map((m) => (m.id === action.id ? { ...m, cartaMovimentacao: action.carta } : m)),
      };

    case "CRIAR_MOVIMENTACAO":
      return { ...state, movimentacoes: [action.movimentacao, ...state.movimentacoes] };

    case "REGISTRAR_CARGO_CUSTOM":
      if (state.cargosCustom.some((c) => c.nome === action.cargo.nome)) return state;
      return { ...state, cargosCustom: [...state.cargosCustom, action.cargo] };

    case "ATUALIZAR_CONFIG_AVALIACAO_DESEMPENHO":
      return { ...state, configAvaliacaoDesempenho: action.config };

    case "ATUALIZAR_CONFIG_DASHBOARD":
      return { ...state, configDashboard: action.config };

    case "SALVAR_COMPETENCIA_COMPORTAMENTAL": {
      const existe = state.competenciasComportamentais.some((c) => c.id === action.competencia.id);
      const competenciasComportamentais = existe
        ? state.competenciasComportamentais.map((c) => (c.id === action.competencia.id ? action.competencia : c))
        : [...state.competenciasComportamentais, action.competencia];
      return { ...state, competenciasComportamentais };
    }

    case "CRIAR_KPI_CARGO":
      return { ...state, kpisCargo: [...state.kpisCargo, action.kpi] };

    case "ATUALIZAR_KPI_CARGO":
      return { ...state, kpisCargo: state.kpisCargo.map((k) => (k.id === action.kpi.id ? action.kpi : k)) };

    case "EXCLUIR_KPI_CARGO":
      return { ...state, kpisCargo: state.kpisCargo.filter((k) => k.id !== action.id) };

    case "CRIAR_CICLO_AVALIACAO_DESEMPENHO":
      return {
        ...state,
        ciclosAvaliacaoDesempenho: [action.ciclo, ...state.ciclosAvaliacaoDesempenho],
        avaliacoesDesempenho: [...action.avaliacoes, ...state.avaliacoesDesempenho],
      };

    case "ATUALIZAR_AVALIACAO_DESEMPENHO":
      return {
        ...state,
        avaliacoesDesempenho: state.avaliacoesDesempenho.map((a) => (a.id === action.avaliacao.id ? action.avaliacao : a)),
      };

    case "ENCERRAR_CICLO_AVALIACAO_DESEMPENHO":
      return {
        ...state,
        ciclosAvaliacaoDesempenho: state.ciclosAvaliacaoDesempenho.map((c) =>
          c.id === action.id ? { ...c, status: "Encerrado" } : c,
        ),
      };

    case "CRIAR_PDI":
      return { ...state, pdi: [action.pdi, ...state.pdi] };

    case "ATUALIZAR_PDI":
      return { ...state, pdi: state.pdi.map((p) => (p.id === action.pdi.id ? action.pdi : p)) };

    case "SALVAR_ITEM_BIBLIOTECA_PDI": {
      const existe = state.pdiBiblioteca.some(
        (b) => b.chave === action.item.chave && b.tipoCompetencia === action.item.tipoCompetencia,
      );
      const pdiBiblioteca = existe
        ? state.pdiBiblioteca.map((b) =>
            b.chave === action.item.chave && b.tipoCompetencia === action.item.tipoCompetencia ? action.item : b,
          )
        : [...state.pdiBiblioteca, action.item];
      return { ...state, pdiBiblioteca };
    }

    case "EXCLUIR_ITEM_BIBLIOTECA_PDI":
      return {
        ...state,
        pdiBiblioteca: state.pdiBiblioteca.filter(
          (b) => !(b.chave === action.chave && b.tipoCompetencia === action.tipoCompetencia),
        ),
      };

    case "CRIAR_AVALIACOES_POTENCIAL":
      return { ...state, avaliacoesPotencial: [...action.avaliacoes, ...state.avaliacoesPotencial] };

    case "ATUALIZAR_AVALIACAO_POTENCIAL":
      return {
        ...state,
        avaliacoesPotencial: state.avaliacoesPotencial.map((a) => (a.id === action.avaliacao.id ? action.avaliacao : a)),
      };

    case "CRIAR_FEEDBACK":
      return { ...state, feedbacks: [action.feedback, ...state.feedbacks] };

    default:
      return state;
  }
}

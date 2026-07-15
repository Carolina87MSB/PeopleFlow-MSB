import type { CargoCustom, Colaborador, DescricaoCargo, DesligamentoFinanceiro, Movimentacao, Perfil2Info, TipoMovimentacao } from "../types/domain";

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
    }
  | { type: "APROVAR_ETAPA"; id: string }
  | { type: "REPROVAR_ETAPA"; id: string; comentario: string }
  | { type: "CRIAR_MOVIMENTACAO"; movimentacao: Movimentacao }
  | { type: "REGISTRAR_CARGO_CUSTOM"; cargo: CargoCustom }
  | { type: "TOGGLE_DESCRICAO_CARGO"; nome: string }
  | { type: "SALVAR_FECHAMENTO_FINANCEIRO"; desligamento: DesligamentoFinanceiro }
  | { type: "ATUALIZAR_DESCRICAO_CARGO"; descricao: DescricaoCargo }
  | { type: "ATUALIZAR_ADMISSAO_COLABORADOR"; nome: string; admissao: string; admissaoIso: string; tempoDeEmpresa: string }
  | { type: "RESET" };

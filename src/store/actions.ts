import type { CargoCustom, Colaborador, DesligamentoFinanceiro, Movimentacao, Perfil2Info, TipoMovimentacao } from "../types/domain";

export type PortalAction =
  | {
      type: "CARREGAR_DADOS";
      colaboradores: Colaborador[];
      movimentacoes: Movimentacao[];
      cargosCustom: CargoCustom[];
      tipos: TipoMovimentacao[];
      perfis: Perfil2Info[];
      desligamentosFinanceiros: DesligamentoFinanceiro[];
    }
  | { type: "APROVAR_ETAPA"; id: string }
  | { type: "REPROVAR_ETAPA"; id: string }
  | { type: "CRIAR_MOVIMENTACAO"; movimentacao: Movimentacao }
  | { type: "REGISTRAR_CARGO_CUSTOM"; cargo: CargoCustom }
  | { type: "TOGGLE_DESCRICAO_CARGO"; nome: string }
  | { type: "SALVAR_FECHAMENTO_FINANCEIRO"; desligamento: DesligamentoFinanceiro }
  | { type: "RESET" };

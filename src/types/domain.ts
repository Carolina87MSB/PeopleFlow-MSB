export type Perfil = "RH" | "Gestor" | "Diretoria";

export type Nivel =
  | "Diretoria"
  | "Gerência"
  | "Liderança"
  | "Especialista"
  | "Analista"
  | "Técnico"
  | "Operacional"
  | "Aprendiz / Estágio";

export interface Colaborador {
  vinculo: string;
  nome: string;
  cargo: string;
  depto: string;
  deptoCode: string;
  nivel: Nivel;
  gestor: string;
  admissao: string;
  /** Mesma data de `admissao`, no formato ISO "aaaa-mm-dd" — usado para prefill do editor (input type="date") sem precisar reverter o parsing de "dd/mmm/aaaa". */
  admissaoIso: string;
  /** Calculado a partir de `admissao` — ver tempoDeEmpresa() em domain/dates.ts. */
  tempoDeEmpresa: string;
  desligado: boolean;
  dataDesligamento: string; // "dd/mmm/aaaa" ou "" se não desligado
  motivoDesligamento: string;
  desligadoBy: string;
}

export interface DesligamentoFinanceiro {
  colaboradorNome: string;
  valorRescisao: number | null;
  valorGrrf: number | null;
  updatedAt: string;
  updatedBy: string;
}

export interface CargoCustom {
  nome: string;
  depto: string;
  gestor: string;
  vagas: string;
  faixa: string;
  nivel: string;
  descricao: "OK" | "Pendente";
}

export interface Conta {
  nome: string;
  cargo: string;
  depto: string;
  email: string;
  perfil: Perfil;
}

export type TipoCod = "ADM" | "PRO" | "SAL" | "TRF" | "FUN" | "DES" | "NOV" | "AFA";

export interface TipoMovimentacao {
  cod: TipoCod;
  nome: string;
  desc: string;
  etapas: string[];
  sla: number;
  impacto: string;
}

export interface Perfil2Info {
  papel: string;
  desc: string;
  pode: string;
  cor: string;
}

export type EtapaStatus = "Em análise" | "Aguardando" | "Aprovado" | "Reprovado";

export interface Etapa {
  papel: string;
  aprovador: string;
  status: EtapaStatus;
  data: string;
  hora?: string;
  comentario?: string;
}

export type MovStatus = "Em Aprovação" | "Rascunho" | "Aprovado" | "Reprovado" | "Concluído";

export type Prioridade = "Alta" | "Média" | "Baixa";

export interface DadoField {
  label: string;
  value: string;
}

export interface NovoCargoInfo {
  nome: string;
  depto: string;
  gestor: string;
  vagas: string;
  faixa: string;
  data: string;
  obs: string;
}

export interface AprovacaoFinal {
  data: string;
  hora: string;
}

export interface Movimentacao {
  id: string;
  tipo: string;
  tipoCod: TipoCod;
  colaborador: string;
  depto: string;
  resumo: string;
  solicitante: string;
  dataSolicitacao: string;
  prioridade: Prioridade;
  status: MovStatus;
  justificativa?: string;
  dados?: DadoField[];
  etapas: Etapa[];
  novoCargo?: NovoCargoInfo;
  aprovacaoFinal?: AprovacaoFinal | null;
  legado?: boolean;
}

export interface NovaMovimentacaoForm {
  tipo: TipoCod | "";
  colab: string;
  destino: string;
  prioridade: Prioridade;
  justificativa: string;
  cargoNome: string;
  cargoDepto: string;
  cargoGestor: string;
  cargoVagas: string;
  cargoFaixa: string;
  cargoData: string;
  cargoObs: string;
  admMotivo: string;
  admCandidato: string;
  admCargo: string;
  admDepto: string;
  admGestor: string;
  admVagas: string;
  admData: string;
  admFaixa: string;
  proNovoCargo: string;
  proJustProg: string;
  proAltSal: "Sim" | "Não";
  proNovoSalario: string;
  proData: string;
  salAtual: string;
  salNovo: string;
  trfNovoDepto: string;
  trfNovoCargo: string;
  funNova: string;
  funMotivo: string;
  funTreinos: string;
  desMotivo: string;
  desData: string;
  desUltimoDia: string;
  desSubst: "Sim" | "Não";
  desObs: string;
}

export interface DepartamentoAgregado {
  nome: string;
  code: string;
  count: number;
  gestores: Record<string, number>;
  cargos: Set<string>;
}

export interface CargoAgregado {
  nome: string;
  nivel: string;
  count: number;
  deptos: Set<string>;
  novo?: boolean;
  vagas?: string;
  descricao?: "OK" | "Pendente";
  faixa?: string;
}

export interface DocumentoGerado {
  nome: string;
  status: "Gerado" | "Pendente";
}

export interface HistoricoEvento {
  id: string;
  tipoCod: TipoCod;
  titulo: string;
  descricao: string;
  data: string;
  autor: string;
}

export interface DescricaoCargo {
  cargoNome: string;
  codigoFormulario: string;
  revisaoFormulario: string;
  dataFormulario: string;
  dataRevisaoCargo: string;
  subordinacao: string;
  localidade: string;
  nivelDocumento: string;
  sumario: string;
  responsabilidades: string;
  escolaridade: string;
  experiencia: string;
  habilidadesTecnicas: string;
  habilidadesComportamentais: string;
  epis: string;
  updatedAt: string;
  updatedBy: string;
}

export interface HistoricoDescricaoCargo {
  id: number;
  cargoNome: string;
  campo: string;
  campoLabel: string;
  valorAnterior: string;
  valorNovo: string;
  editadoPor: string;
  editadoEm: string;
}

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

/** Snapshot dos dados do candidato no momento da solicitação — usado para criar o
 * pré-cadastro em `colaboradores` quando a movimentação de Admissão é concluída
 * (ver aprovarEtapa() em domain/workflow.ts e criarPreCadastro() no repositório). */
export interface AdmissaoInfo {
  candidato: string;
  cargo: string;
  depto: string;
  gestor: string;
  vinculo: string;
  admissaoIso: string;
}

/** Snapshot para sincronizar cargo/departamento em `colaboradores` quando uma
 * movimentação de Promoção, Transferência ou Mudança de Função é concluída —
 * ver aprovarEtapa() em domain/workflow.ts e atualizarCargoDepto() no
 * repositório. Campos ausentes (undefined) não são tocados no UPDATE. */
export interface AtualizacaoCargoDeptoInfo {
  nome: string;
  novoCargo?: string;
  novoDepto?: string;
}

/** Snapshot para desligar de fato em `colaboradores` quando uma movimentação
 * de Desligamento é concluída — mesma lógica/colunas do botão "Desligar
 * colaborador" do Portal SST (ver api/desligar-colaborador.ts deste projeto). */
export interface DesligamentoInfo {
  nome: string;
  motivo: string;
  dataIso: string;
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
  admissaoInfo?: AdmissaoInfo;
  atualizacaoInfo?: AtualizacaoCargoDeptoInfo;
  desligamentoInfo?: DesligamentoInfo;
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
  admVinculo: string;
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

export interface PerguntaAvaliacaoExperiencia {
  id: string;
  categoria: string;
  texto: string;
}

/** Contrato de experiência 45+45 (MSB): a etapa "45 dias" decide entre
 * Renovar/Desligar; a "90 dias" (final) decide entre Efetivar/Desligar —
 * ver opcoesDecisao() em domain/avaliacaoExperiencia.ts. */
export type EtapaAvaliacaoExperiencia = "45 dias" | "90 dias";

export type ResultadoAvaliacaoExperiencia = "Renovar" | "Efetivar" | "Desligar";

export interface RespostaAvaliacaoExperiencia {
  perguntaId: string;
  /** Escala 1 (Insatisfatório) a 5 (Excelente). */
  nota: number;
}

/**
 * Avaliação de experiência (45 ou 90 dias) feita pelo gestor imediato.
 * `indicacao` é a sugestão automática (ver calcularIndicacao()); `decisaoFinal`
 * é o que o gestor de fato escolheu — quando diferente da indicação, exige
 * `justificativaDivergencia` preenchida (nos dois sentidos: tanto pra
 * efetivar/renovar apesar da nota baixa quanto pra desligar apesar da nota
 * ter batido a meta).
 */
export interface AvaliacaoExperiencia {
  id: string;
  colaboradorNome: string;
  etapa: EtapaAvaliacaoExperiencia;
  respostas: RespostaAvaliacaoExperiencia[];
  notaFinalPct: number;
  indicacao: ResultadoAvaliacaoExperiencia;
  decisaoFinal: ResultadoAvaliacaoExperiencia;
  justificativaDivergencia: string;
  avaliadoPor: string;
  avaliadoEm: string;
}

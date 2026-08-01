/** "Colaborador" é um perfil restrito: só acesso à Avaliação de Desempenho
 * (suas próprias fichas) — ver buildAccessAvd() em domain/hierarquia.ts e o
 * bloqueio de rota em AppShell.tsx. */
export type Perfil = "RH" | "Gestor" | "Diretoria" | "Colaborador";

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

export type TipoCod = "ADM" | "PRO" | "SAL" | "TRF" | "DES" | "AFA";

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

/** Snapshot para sincronizar cargo/departamento/gestor em `colaboradores` quando
 * uma movimentação de Promoção ou Transferência é concluída — ver aprovarEtapa()
 * em domain/workflow.ts e atualizarCargoDepto() no repositório. Campos
 * ausentes (undefined) não são tocados no UPDATE. */
export interface AtualizacaoCargoDeptoInfo {
  nome: string;
  novoCargo?: string;
  novoDepto?: string;
  /** Preenchido quando a movimentação foi aberta por um gestor diferente do gestor
   * atual do colaborador (ex.: gestor do setor de destino promovendo/transferindo
   * alguém para a própria equipe) — ver montarEtapas()/construirMovimentacao(). */
  novoGestor?: string;
  /** "Data prevista da movimentação" (aaaa-mm-dd) escolhida no formulário — a
   * sincronização com `colaboradores` só é aplicada nesta data (ou depois),
   * nunca antes, mesmo que a aprovação final já tenha acontecido. Ver
   * efetivarSincronizacoesPendentes() em movimentacoesRepository.ts. */
  dataPrevistaIso?: string;
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
  admissaoInfo?: AdmissaoInfo;
  atualizacaoInfo?: AtualizacaoCargoDeptoInfo;
  desligamentoInfo?: DesligamentoInfo;
  aprovacaoFinal?: AprovacaoFinal | null;
  /** Quando a sincronização de cargo/departamento/gestor com `colaboradores` foi
   * de fato aplicada (só PRO/TRF). Null/undefined = aprovada mas ainda esperando
   * a "Data prevista" (atualizacaoInfo.dataPrevistaIso) chegar. */
  sincronizadoEm?: string | null;
  legado?: boolean;
}

export interface NovaMovimentacaoForm {
  tipo: TipoCod | "";
  colab: string;
  destino: string;
  prioridade: Prioridade;
  justificativa: string;
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
  proSalarioAtual: string;
  proAltSal: "Sim" | "Não";
  proNovoSalario: string;
  proMudaDepto: "Sim" | "Não";
  proNovoDepto: string;
  proData: string;
  salAtual: string;
  salNovo: string;
  trfNovoDepto: string;
  trfData: string;
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

/**
 * Dispensa de avaliação de experiência — cobre colaboradores antigos já
 * avaliados fora do sistema (outra ferramenta/papel) antes da implantação
 * deste módulo: em vez de fabricar uma AvaliacaoExperiencia sem respostas
 * reais, o colaborador é excluído da lista de pendências, com o motivo
 * registrado (ver pendenciasAvaliacaoExperiencia() em domain/avaliacaoExperiencia.ts).
 */
export interface DispensaAvaliacaoExperiencia {
  colaboradorNome: string;
  motivo: string;
  dispensadoPor: string;
  dispensadoEm: string;
}

/** Configuração geral da Avaliação de Desempenho — linha única (pesos dos
 * blocos Competências Técnicas/Comportamentais que compõem a nota final).
 * Etapa 1: só estrutura, sem cálculo automático ainda. */
export interface ConfigAvaliacaoDesempenho {
  pesoKpis: number;
  pesoComportamental: number;
  updatedAt: string;
  updatedBy: string;
}

/** Competência comportamental do catálogo corporativo — igual para todos os
 * cargos (diferente dos KPIs, que são por cargo). `afirmacoes` fica vazio na
 * carga inicial, preenchido depois. `categoria` separa o catálogo usado nas
 * avaliações GESTOR/AUTOAVALIACAO ("Comportamental") do catálogo exclusivo
 * da avaliação LIDERANCA ("Lideranca") — mesma tabela, mesma estrutura,
 * só filtrada por categoria na hora de gerar o snapshot do ciclo. */
export interface CompetenciaComportamental {
  id: string;
  nome: string;
  descricao: string;
  afirmacoes: string[];
  ordem: number;
  ativo: boolean;
  categoria: "Comportamental" | "Lideranca";
  updatedAt: string;
  updatedBy: string;
}

/** KPI ("Competência Técnica") vinculado a um cargo — nunca reaproveita as
 * competências da Descrição de Cargo nem competências técnicas genéricas.
 * Carga inicial vem de planilha real do RH (ver README > "Gestão de
 * Desempenho"). */
export interface KpiCargo {
  id: number;
  cargoNome: string;
  nomeIndicador: string;
  meta: number | null;
  unidadeMedida: string;
  sentidoMeta: "Maior é Melhor" | "Menor é Melhor";
  peso: number | null;
  observacao: string;
  ordem: number;
  updatedAt: string;
  updatedBy: string;
}

/** Notas (1 a 5) de cada afirmação avaliativa de uma competência — o conjunto
 * de competências (e quantas afirmações cada uma tinha) fica travado no
 * momento em que o ciclo gera a avaliação, indexado nesta mesma ordem;
 * `null` = afirmação ainda não avaliada. `competenciaNome`/`competenciaDescricao`/
 * `afirmacoes` são um **snapshot** do catálogo no momento da criação — ficam
 * congelados durante todo o ciclo, mesmo que `competenciasComportamentais`
 * seja editado depois (renomeada, desativada, afirmações alteradas etc.).
 * `competenciaId` continua existindo pra referência, mas o texto exibido
 * nunca mais é lido ao vivo do catálogo. */
export interface ResultadoComportamental {
  competenciaId: string;
  competenciaNome: string;
  competenciaDescricao: string;
  afirmacoes: string[];
  notasAfirmacoes: (number | null)[];
}

/** Resultado obtido pelo colaborador em um KPI do cargo — o conjunto de KPIs
 * (do cargo no momento da criação da avaliação) fica travado; o gestor não
 * pode incluir indicador manualmente, só preencher `resultado`. `kpiNome`/
 * `kpiDescricao`/`meta`/`unidadeMedida`/`sentidoMeta`/`peso` são um
 * **snapshot** de `KpiCargo` no momento da criação (`kpiDescricao` vem de
 * `KpiCargo.observacao`) — ficam congelados durante todo o ciclo, mesmo que
 * `kpisCargo` seja editado depois. `kpiId` continua existindo pra
 * referência, mas os valores exibidos/usados no cálculo nunca mais são
 * lidos ao vivo do catálogo. */
export interface ResultadoKpi {
  kpiId: number;
  kpiNome: string;
  kpiDescricao: string;
  meta: number | null;
  unidadeMedida: string;
  sentidoMeta: "Maior é Melhor" | "Menor é Melhor";
  peso: number | null;
  resultado: number | null;
}

/** Ciclo de Avaliação de Desempenho (AVD), aberto pelo RH — ao criar, gera
 * automaticamente 1 AvaliacaoDesempenho por colaborador ativo. */
/** "Aberto" aceita edição das avaliações geradas por ele; "Encerrado" trava
 * todas de uma vez (mesmo as "Em andamento") — sem reabertura nesta etapa. */
export type StatusCicloAvaliacaoDesempenho = "Aberto" | "Encerrado";

export interface CicloAvaliacaoDesempenho {
  id: string;
  nome: string;
  periodoReferencia: string;
  dataInicio: string;
  dataEncerramento: string;
  status: StatusCicloAvaliacaoDesempenho;
  criadoPor: string;
  criadoEm: string;
}

/** Form de abertura de um novo ciclo (tela RH-only). */
export interface NovoCicloAvaliacaoForm {
  nome: string;
  periodoReferencia: string;
  dataInicio: string;
  dataEncerramento: string;
}

/** Status possíveis de uma AvaliacaoDesempenho — avança sozinho conforme o
 * gestor preenche (nunca regride); "Concluída" trava a edição por completo
 * (só reabertura de ciclo, funcionalidade futura, desfaz isso). */
export type StatusAvaliacaoDesempenho = "Não iniciada" | "Em andamento" | "Concluída";

/** Cada colaborador elegível pode ter até 3 fichas no mesmo ciclo, todas com
 * a mesma estrutura (`AvaliacaoDesempenho`), diferenciadas só por `tipo`:
 * GESTOR (nota oficial da AVD), AUTOAVALIACAO (mesma estrutura, nota
 * armazenada à parte, nunca compõe a oficial) e LIDERANCA (só competências
 * de liderança, sem KPI — gerada só se o colaborador tiver gestor). Ver
 * README > "Gestão de Desempenho". */
export type TipoAvaliacaoDesempenho = "GESTOR" | "AUTOAVALIACAO" | "LIDERANCA";

/** Avaliação de Desempenho por colaborador/ciclo/tipo — cálculo de nota
 * automático, sem fluxo de aprovação, calibração ou reabertura de ciclo
 * ainda (ver README > "Gestão de Desempenho"). `cargo`/`departamento`/
 * `gestorAvaliador` são snapshot da estrutura organizacional no momento da
 * criação — preservam o histórico mesmo que o colaborador seja promovido
 * depois. `notaFinal`/`mediaTecnica`/`mediaComportamental` são recalculados e
 * regravados a cada save — junto com `criadoEm`/`concluidoEm`, formam a base
 * do histórico do colaborador (comparativo entre ciclos, evolução, Matriz 9
 * Box ficam pra etapas futuras, mas o dado já fica disponível). */
export interface AvaliacaoDesempenho {
  id: string;
  tipo: TipoAvaliacaoDesempenho;
  /** Dono do conjunto de até 3 fichas geradas pra ele neste ciclo — sempre o
   * liderado, inclusive na ficha LIDERANCA (onde quem está sendo avaliado é
   * o gestor dele, ver `avaliado`). Garante que (cicloId, tipo,
   * colaboradorNome) seja sempre único. */
  colaboradorNome: string;
  /** Quem está sendo avaliado nesta ficha especificamente — igual a
   * `colaboradorNome` em GESTOR/AUTOAVALIACAO; na LIDERANCA é o gestor cujo
   * estilo de liderança está sendo avaliado (snapshot, não recalculado se o
   * colaborador trocar de gestor depois). */
  avaliado: string;
  cargo: string;
  departamento: string;
  /** Quem deve preencher esta ficha — o gestor real (tipo GESTOR) ou o
   * próprio colaborador (AUTOAVALIACAO/LIDERANCA). Vazio quando o
   * colaborador não tinha gestor definido no momento da geração (RH precisa
   * tratar). Nome mantido por compatibilidade — o significado é mais amplo
   * que "gestor" desde a Etapa 2.1. */
  gestorAvaliador: string;
  cicloId: string;
  ciclo: string;
  status: StatusAvaliacaoDesempenho;
  resultadosComportamentais: ResultadoComportamental[];
  resultadosKpis: ResultadoKpi[];
  comentarioComportamental: string;
  comentarioTecnico: string;
  comentarioGeral: string;
  avaliadoPor: string;
  /** Preenchidos só quando status = "Concluída". */
  concluidoPor: string;
  concluidoEm: string | null;
  notaFinal: number | null;
  mediaTecnica: number | null;
  mediaComportamental: number | null;
  criadoEm: string;
  updatedAt: string;
}

/** Auditoria básica da AVD — gravação best-effort (nunca bloqueia a ação
 * principal), ver logAvaliacaoDesempenhoRepository.ts. */
export interface LogAvaliacaoDesempenho {
  id: number;
  cicloId: string | null;
  avaliacaoId: string | null;
  acao: string;
  detalhe: string;
  usuario: string;
  criadoEm: string;
}

/** Plano de Desenvolvimento Individual — estrutura inicial, sem geração
 * automática a partir de competências com baixo desempenho ainda. */
export interface Pdi {
  id: number;
  colaboradorNome: string;
  avaliacaoId: string | null;
  origem: string;
  acao: string;
  prazo: string | null;
  status: string;
  responsavel: string;
  criadoEm: string;
  updatedAt: string;
}

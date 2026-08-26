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
  /** Exceção pontual: libera a um Gestor ver a Matriz 9 Box da empresa
   * inteira, não só quem tem `gestor === seu nome` — ver
   * colaboradoresParaMatriz9Box em usePortalData.ts. Sem efeito fora do
   * perfil Gestor. */
  matriz9BoxVisaoCompleta: boolean;
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

/** Configuração do Dashboard Executivo de RH — linha única. `headcountPlanejado`
 * é o único indicador parametrizado manualmente em todo o dashboard (usado pra
 * calcular "Aderência ao Planejamento"); `null` = ainda não definido pelo RH. */
export interface ConfigDashboard {
  headcountPlanejado: number | null;
  updatedAt: string;
  updatedBy: string;
}

/** Parâmetros do Custo Mensal Folha — linha única, todos em percentual puro
 * (20 = 20%), levantados pelo RH junto à Folha de Pagamento/DARF eSocial da
 * MSB (ver custoMensalFolha() em domain/salario.ts pra fórmula exata). `rat`
 * é o GIILRAT efetivo (RAT nominal × FAP) — o FAP da MSB foi confirmado em
 * 0,5000 via consulta oficial (gov.br/fap-mps, CNPJ 06.167.295/0001-71),
 * `ratObservacao` registra a fonte (nunca usada no cálculo, só exibida como
 * nota). `fgtsCeletista`/`fgtsAprendiz` são valores distintos porque o
 * percentual de FGTS depende
 * do vínculo do colaborador (ver ehAprendiz() em domain/salario.ts). */
export interface ConfigEncargosFolha {
  inssPatronal: number;
  rat: number;
  ratObservacao: string;
  terceiros: number;
  fgtsCeletista: number;
  fgtsAprendiz: number;
  provisaoDecimoTerceiro: number;
  provisaoFerias: number;
  provisaoTercoFerias: number;
  updatedAt: string;
  updatedBy: string;
}

/** Salário base importado de planilha (ver domain/salario.ts) — usado só
 * como fallback quando o colaborador não tem nenhum salário derivável de
 * movimentação de pessoal (PRO/SAL aprovada). `colaboradorNome` é o nome
 * exatamente como veio da planilha (comparado por norm() no momento do
 * lookup, não recasado aqui) — mantém rastreabilidade fiel à fonte. */
export interface SalarioBase {
  colaboradorNome: string;
  salario: number;
  importadoEm: string;
  importadoPor: string;
}

/** Reajuste salarial estruturado — resultado da AVD (ou de outra origem
 * futura, ver `origem`), consumido por salarioVigente() (domain/salario.ts,
 * mais uma fonte de salário, nunca uma segunda estrutura paralela) e por
 * montarTimelineCarreira() (evento "reajusteAvd"). `reajusteBase`/`fatorial`/
 * `reajusteEfetivo` em pontos percentuais (6 = 6%), mesma convenção de
 * `ConfigEncargosFolha`. Registro imutável — nunca editado depois de
 * aplicado, só consultado. */
export interface ReajusteSalarial {
  id: string;
  colaboradorNome: string;
  /** Texto de exibição, ex.: "Agosto/2026" — nunca a data de importação. */
  competencia: string;
  /** Mesma competência em "aaaa-mm-dd" (dia 01) — ordenação/unicidade. */
  competenciaIso: string;
  /** Ex.: "AVD 2º Ciclo" — nunca "Movimentação de Pessoal". */
  origem: string;
  salarioAnterior: number;
  reajusteBase: number;
  fatorial: number;
  reajusteEfetivo: number;
  novoSalario: number;
  aplicadoEm: string;
  aplicadoPor: string;
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

/** Evento de auditoria gravado dentro da própria movimentação — reabertura
 * pelo RH ou edição de um campo de `dados` (ver reabrirParaRH()/
 * editarDadosMovimentacao() em domain/workflow.ts). Nunca removido, mesmo que
 * o valor editado seja sobrescrito de novo depois — é a trilha de "o que foi
 * editado e por quem", pedida explicitamente pelo RH. */
export interface EventoHistoricoMovimentacao {
  data: string;
  hora: string;
  autor: string;
  acao: string;
  detalhe?: string;
}

/** Ciência (não aprovação — essa já aconteceu no fluxo de Etapas) do gestor
 * responsável pela Carta de Movimentação — só um registro de nome/cargo/data,
 * sem linha de assinatura física. `data` só é preenchida quando `status` vira
 * "Assinado". */
export interface AssinaturaCarta {
  nome: string;
  cargo: string;
  data: string | null;
  status: "Pendente" | "Assinado";
}

/** Carta de Movimentação de Pessoal — só existe pra PRO/TRF/SAL já aprovadas
 * (ver podeEmitirCarta() em domain/cartaMovimentacao.ts), gerada a partir dos
 * dados já registrados na própria movimentação (nunca redigitados).
 * `descricaoAlteracao` é um snapshot congelado no momento da emissão — não é
 * recalculado se a movimentação for editada depois. A única ciência
 * registrada é a do gestor responsável (`assinaturaGestor`) — nunca
 * aprovação, essa já aconteceu no fluxo de Etapas antes da carta existir. */
export interface CartaMovimentacao {
  emitidaEm: string;
  emitidaPor: string;
  descricaoAlteracao: string;
  assinaturaGestor: AssinaturaCarta;
  /** Preenchida quando o gestor dá ciência. */
  finalizadaEm: string | null;
  entregueAoColaborador: boolean;
  entregueEm: string | null;
  entreguePor: string | null;
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
  /** Trilha de reaberturas/edições pós-criação — ver EventoHistoricoMovimentacao. */
  historico?: EventoHistoricoMovimentacao[];
  /** null/undefined = carta ainda não emitida. Só existe pra PRO/TRF/SAL já
   * aprovadas — ver domain/cartaMovimentacao.ts. */
  cartaMovimentacao?: CartaMovimentacao | null;
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

/** Aprovada = versão oficial (colunas de conteúdo abaixo) já aprovada pelo
 * RH/Diretoria; Em revisão = existe uma proposta do Gestor em `pendente`
 * aguardando aprovação (o conteúdo oficial ainda é o último aprovado, não a
 * proposta); Rejeitada = a última proposta foi recusada — o conteúdo oficial
 * continua sendo o último aprovado, e o Gestor pode propor de novo. */
export type StatusDescricaoCargo = "Aprovada" | "Em revisão" | "Rejeitada";

export interface DescricaoCargo {
  cargoNome: string;
  codigoFormulario: string;
  revisaoFormulario: string;
  dataFormulario: string;
  dataRevisaoCargo: string;
  subordinacao: string;
  localidade: string;
  nivelDocumento: string;
  /** Conteúdo OFICIAL/aprovado — nunca escrito diretamente por um Gestor (ver
   * `pendente`); só passa a valer estes campos depois de aprovado. */
  sumario: string;
  responsabilidades: string;
  escolaridade: string;
  experiencia: string;
  habilidadesTecnicas: string;
  habilidadesComportamentais: string;
  epis: string;
  updatedAt: string;
  updatedBy: string;
  status: StatusDescricaoCargo;
  /** Proposta de alteração do Gestor, aguardando aprovação — só contém os
   * campos de conteúdo dos 4 grupos liberados (ver podeGestorEditarGrupo em
   * domain/descricaoCargo.ts), nunca os de controle/auditoria. `null` quando
   * não há revisão em aberto. Nunca é o valor lido pelo resto do sistema —
   * só existe pra exibição/revisão nesta tela (ver valorEfetivo()). */
  pendente: Record<string, string> | null;
  /** Bloco "Aprovações" — quem elaborou/revisou o conteúdo (preenchido
   * automaticamente a cada edição, seja proposta de Gestor ou edição direta
   * de RH/Diretoria) e quem aprovou a versão oficial atual (RH ou
   * Diretoria), cada um com sua data. Nunca digitado livremente. */
  elaboradoPor: string;
  elaboradoEm: string;
  aprovadoPor: string;
  aprovadoEm: string;
}

export interface HistoricoDescricaoCargo {
  id: number;
  cargoNome: string;
  campo: string;
  campoLabel: string;
  valorAnterior: string;
  valorNovo: string;
  editadoPor: string;
  /** Perfil de quem editou no momento da ação (Gestor/RH/Diretoria) — snapshot, não recalculado. */
  perfil: string;
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
  /** Nota mínima (escala 1-5) — competências/KPIs abaixo deste valor são
   * sugeridos automaticamente pro PDI na conclusão da avaliação GESTOR. */
  notaMinimaPdi: number;
  /** Limiares (escala 1-5) da Matriz 9 Box — abaixo de `*LimiteMedio` é
   * "Baixo", entre os dois é "Médio", igual ou acima de `*LimiteAlto` é
   * "Alto" (ver classificarFaixaMatriz9Box() em domain/matriz9Box.ts). */
  matrizDesempenhoLimiteMedio: number;
  matrizDesempenhoLimiteAlto: number;
  matrizPotencialLimiteMedio: number;
  matrizPotencialLimiteAlto: number;
  updatedAt: string;
  updatedBy: string;
}

/** Classificação de uma nota (Desempenho ou Potencial) pra posicionamento na
 * Matriz 9 Box — ver domain/matriz9Box.ts. */
export type FaixaMatriz9Box = "Baixo" | "Médio" | "Alto";

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
  /** Colaborador com admissão em ou antes desta data é elegível pra este
   * ciclo; depois dela não é (ver elegivelParaCicloAvaliacaoDesempenho() em
   * domain/avaliacaoDesempenho.ts). `null` só em ciclos criados antes desta
   * regra existir — nunca em ciclo novo, o formulário exige o campo. */
  dataCorteAdmissao: string | null;
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
  dataCorteAdmissao: string;
}

/** Status possíveis de uma AvaliacaoDesempenho — avança sozinho conforme o
 * gestor preenche (nunca regride); "Concluída" trava a edição por completo
 * (só reabertura de ciclo, funcionalidade futura, desfaz isso). "Não
 * Elegível" é a única exceção que pode ser aplicada a uma ficha já criada
 * (nunca avançada pelo fluxo normal) — RH corrige manualmente quando um
 * colaborador foi incluído no ciclo por engano (admissão depois da data de
 * corte); a partir daí a ficha some das listas de pendência de colaborador e
 * gestor, mas continua visível pro RH (auditoria). */
export type StatusAvaliacaoDesempenho = "Não iniciada" | "Em andamento" | "Concluída" | "Não Elegível";

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
  /** Fluxo de calibração do Comitê (RH), Etapa 6 — independente de `status`
   * acima (que nunca muda de significado). Só avança pra além de "Não
   * iniciada" em fichas tipo GESTOR, e só quando a ficha de Potencial irmã
   * (mesmo colaborador/ciclo) também estiver "Concluída". */
  statusCalibracao: StatusCalibracao;
  /** Override do RH pra `mediaComportamental` — `null` = sem calibração,
   * mantém o valor original do gestor. Média técnica (KPIs) nunca é
   * calibrável (resultado objetivo). */
  mediaComportamentalCalibrada: number | null;
  /** Nota Oficial da AVD — calculada só na homologação
   * (calcularNotaOficialAvd() em domain/calibracao.ts). É esta nota, nunca
   * `notaFinal` do gestor, que a Matriz 9 Box e demais módulos consomem. */
  notaFinalOficial: number | null;
  /** Obrigatória quando `mediaComportamentalCalibrada` difere do original. */
  justificativaCalibracao: string;
  /** Preenchidos só na homologação (mesmo usuário/timestamp de `homologadoPor`/`homologadoEm` nesta implementação — 1 ação só, sem rascunho salvo separado). */
  calibradoPor: string;
  calibradoEm: string | null;
  homologadoPor: string;
  homologadoEm: string | null;
  /** Devolutiva (Etapa 8) — conversa de feedback gestor→colaborador pós-
   * homologação. Só uma ação disponível pra ficha tipo GESTOR com
   * `statusCalibracao === "Homologada"`; sem "desmarcar" no fluxo atual. */
  devolutivaRealizada: boolean;
  devolutivaPor: string;
  devolutivaEm: string | null;
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

/** Uma resposta de Avaliação de Potencial — `pergunta` é snapshot do texto
 * no momento da geração (mesma lógica de snapshot da AVD), não reflete
 * mudanças futuras em PERGUNTAS_POTENCIAL (domain/avaliacaoPotencial.ts). */
export interface RespostaPotencial {
  perguntaId: string;
  pergunta: string;
  nota: number | null;
}

/** Avaliação de Potencial (Etapa 4) — independente da AVD, gerada
 * automaticamente junto com o ciclo (1 por colaborador elegível, mesma
 * elegibilidade da AVD). Nunca altera nota_final/media_* da AVD nem o PDI —
 * só alimenta a futura Matriz 9 Box. `cargo`/`departamento`/`gestorAvaliador`
 * são snapshot da estrutura organizacional no momento da geração (mesma
 * lógica da AVD). */
export interface AvaliacaoPotencial {
  id: string;
  cicloId: string;
  ciclo: string;
  colaboradorNome: string;
  cargo: string;
  departamento: string;
  /** Snapshot de colaborador.gestor no momento da geração. Vazio quando o
   * colaborador não tinha gestor definido (RH precisa tratar). */
  gestorAvaliador: string;
  respostas: RespostaPotencial[];
  comentario: string;
  status: StatusAvaliacaoDesempenho;
  notaPotencial: number | null;
  /** Fluxo de calibração do Comitê (RH), Etapa 6 — mesma regra da AVD
   * (avança junto com a ficha GESTOR irmã do mesmo colaborador/ciclo). */
  statusCalibracao: StatusCalibracao;
  /** Override do RH pra `notaPotencial` — `null` = sem calibração. */
  notaPotencialCalibrada: number | null;
  /** Nota Oficial de Potencial — calculada só na homologação
   * (calcularNotaOficialPotencial() em domain/calibracao.ts). */
  notaOficial: number | null;
  justificativaCalibracao: string;
  calibradoPor: string;
  calibradoEm: string | null;
  homologadoPor: string;
  homologadoEm: string | null;
  concluidoPor: string;
  concluidoEm: string | null;
  criadoEm: string;
  updatedAt: string;
}

/** Fluxo de calibração do Comitê de Calibração (Etapa 6) — RH revisa a AVD
 * (ficha GESTOR) e a Avaliação de Potencial já concluídas pelo gestor e,
 * quando necessário, ajusta as notas antes de virarem Nota Oficial. Campo
 * independente de `status` (que continua só indicando se o gestor
 * terminou). Ver domain/calibracao.ts. */
export type StatusCalibracao = "Não iniciada" | "Aguardando Calibração" | "Homologada";

/** Status do plano de PDI inteiro (diferente do status de cada item/ação). */
export type StatusPdi = "Não iniciado" | "Em andamento" | "Concluído";

/** Status de um item ou de uma ação do PDI — mesma escala pros dois níveis. */
export type StatusItemPdi = "Não iniciada" | "Em andamento" | "Concluída" | "Cancelada";

/** "Comportamental" (vem de resultadosComportamentais da AVD) ou "Tecnica"
 * (vem de resultadosKpis — nunca reaproveita "Comportamental" mesmo sendo o
 * termo usado noutros lugares pra competência, aqui é especificamente sobre
 * a origem do item: competência comportamental ou KPI). */
export type TipoCompetenciaPdi = "Comportamental" | "Tecnica";

/** Quem é responsável por uma ação/item do PDI — só informativo, sem regra
 * de acesso vinculada (colaborador não edita o PDI antes da conclusão,
 * mesmo que "responsavel" aponte pra ele). */
export type ResponsavelPdi = "Colaborador" | "Gestor" | "Ambos" | "";

/** Uma ação de desenvolvimento dentro de um PdiItem — sem limite de
 * quantidade, o gestor adiciona/edita/remove livremente. */
export interface PdiAcao {
  id: string;
  itemId: string;
  descricao: string;
  responsavel: ResponsavelPdi;
  prazo: string | null;
  status: StatusItemPdi;
  ordem: number;
  criadoEm: string;
  updatedAt: string;
}

/** Um item de desenvolvimento do PDI = 1 competência comportamental ou KPI.
 * Gerado automaticamente quando a nota dela ficou abaixo de
 * `ConfigAvaliacaoDesempenho.notaMinimaPdi` na avaliação GESTOR que originou
 * o plano (`origemManual: false`), ou incluído à mão pelo gestor depois
 * (`origemManual: true`). `objetivoDesenvolvimento` já nasce preenchido a
 * partir de `peopleflow_pdi_biblioteca` (ou um texto genérico, se a
 * competência não tiver modelo cadastrado) — editável livremente depois. */
export interface PdiItem {
  id: string;
  pdiId: number;
  competenciaId: string;
  competenciaNome: string;
  tipoCompetencia: TipoCompetenciaPdi;
  /** Nota que motivou a inclusão automática — null se incluído manualmente
   * sem uma nota de origem. */
  notaObtida: number | null;
  origemManual: boolean;
  objetivoDesenvolvimento: string;
  responsavel: ResponsavelPdi;
  dataInicio: string | null;
  dataPrevistaConclusao: string | null;
  status: StatusItemPdi;
  observacoes: string;
  ordem: number;
  acoes: PdiAcao[];
  criadoEm: string;
  updatedAt: string;
}

/** Plano de Desenvolvimento Individual — gerado automaticamente quando a
 * avaliação GESTOR de um ciclo é concluída (nunca por AUTOAVALIACAO/
 * LIDERANCA), permanece vinculado a esse ciclo. `gestorResponsavel` é
 * snapshot do `gestorAvaliador` da avaliação que originou o plano — a
 * autoridade de edição usa esse campo OU o gestor atual do colaborador
 * (união, ver `podeEditarPdi()` em usePortalData.ts), pra não perder acesso
 * numa transferência nem exigir intervenção do RH pro gestor novo assumir.
 * Colaborador só vê depois de `status === "Concluído"` (diferente da AVD,
 * onde a ficha GESTOR nunca é vista por ele). */
export interface Pdi {
  id: number;
  colaboradorNome: string;
  cicloId: string | null;
  ciclo: string;
  avaliacaoId: string | null;
  gestorResponsavel: string;
  status: StatusPdi;
  comentarios: string;
  concluidoPor: string;
  concluidoEm: string | null;
  itens: PdiItem[];
  criadoEm: string;
  updatedAt: string;
}

/** Modelo de objetivo/ações por competência, mantido pelo RH — consultado na
 * geração automática do PDI. `chave` é o id estável da competência
 * comportamental (tipoCompetencia="Comportamental") ou o nome do KPI
 * (tipoCompetencia="Tecnica", sem id estável entre cargos). */
export interface PdiBibliotecaItem {
  chave: string;
  tipoCompetencia: TipoCompetenciaPdi;
  objetivoSugerido: string;
  acoesSugeridas: string[];
  updatedAt: string;
  updatedBy: string;
}

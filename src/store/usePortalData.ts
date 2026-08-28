import { useCallback, useMemo } from "react";
import { useToast } from "../components/shared/ToastContext";
import { atualizarDescricaoCargoCustom } from "../repositories/cargosCustomRepository";
import {
  atualizarAdmissao as atualizarAdmissaoNoSupabase,
  criarPreCadastro as criarPreCadastroNoSupabase,
  criarSolicitacaoDesligamento as criarSolicitacaoDesligamentoNoSupabase,
} from "../repositories/colaboradoresRepository";
import { salvarFechamentoFinanceiro as salvarFechamentoNoSupabase } from "../repositories/desligadosRepository";
import {
  COLUNA_POR_CAMPO,
  getHistoricoDescricaoCargo,
  salvarRevisaoDescricaoCargo as salvarRevisaoDescricaoCargoNoSupabase,
} from "../repositories/descricoesCargoRepository";
import {
  atualizarMovimentacao,
  criarMovimentacao as criarMovimentacaoNoSupabase,
  efetivarSincronizacoesPendentes,
} from "../repositories/movimentacoesRepository";
import {
  criarAvaliacaoExperiencia as criarAvaliacaoExperienciaNoSupabase,
  criarDispensaAvaliacaoExperiencia as criarDispensaAvaliacaoExperienciaNoSupabase,
} from "../repositories/avaliacoesExperienciaRepository";
import { atualizarConfigAvaliacaoDesempenho as atualizarConfigAvaliacaoDesempenhoNoSupabase } from "../repositories/configAvaliacaoDesempenhoRepository";
import { atualizarConfigDashboard as atualizarConfigDashboardNoSupabase } from "../repositories/configDashboardRepository";
import { criarReajustesSalariais as criarReajustesSalariaisNoSupabase } from "../repositories/reajustesSalariaisRepository";
import { salvarCompetenciaComportamental as salvarCompetenciaComportamentalNoSupabase } from "../repositories/competenciasComportamentaisRepository";
import {
  atualizarKpiCargo as atualizarKpiCargoNoSupabase,
  criarKpiCargo as criarKpiCargoNoSupabase,
  excluirKpiCargo as excluirKpiCargoNoSupabase,
} from "../repositories/kpisCargoRepository";
import { atualizarAvaliacaoDesempenho as atualizarAvaliacaoDesempenhoNoSupabase } from "../repositories/avaliacoesDesempenhoRepository";
import {
  criarCicloComAvaliacoes as criarCicloComAvaliacoesNoSupabase,
  encerrarCiclo as encerrarCicloNoSupabase,
} from "../repositories/ciclosAvaliacaoDesempenhoRepository";
import { registrarLogAvaliacaoDesempenho as registrarLogAvaliacaoDesempenhoNoSupabase } from "../repositories/logAvaliacaoDesempenhoRepository";
import { criarPdi as criarPdiNoSupabase, salvarPdi as salvarPdiNoSupabase } from "../repositories/pdiRepository";
import { registrarFeedback as registrarFeedbackNoSupabase } from "../repositories/feedbacksRepository";
import {
  excluirItemBiblioteca as excluirItemBibliotecaNoSupabase,
  salvarItemBiblioteca as salvarItemBibliotecaNoSupabase,
} from "../repositories/pdiBibliotecaRepository";
import {
  atualizarAvaliacaoPotencial as atualizarAvaliacaoPotencialNoSupabase,
  criarAvaliacoesPotencial as criarAvaliacoesPotencialNoSupabase,
} from "../repositories/avaliacoesPotencialRepository";
import { notificar } from "../repositories/notificacoesRepository";
import { formatarDataIso, tempoDeEmpresa } from "../domain/dates";
import { colaboradoresDesligados, pendenteFechamento } from "../domain/desligados";
import {
  CAMPOS_DESCRICAO_CARGO,
  descricaoCargoVazia,
  podeGestorEditarGrupo,
  valorEfetivoDescricaoCargo,
  type CampoDescricaoCargo,
} from "../domain/descricaoCargo";
import {
  arredondar,
  calcularNotasAvaliacao,
  elegivelParaCicloAvaliacaoDesempenho,
  fichasIrmasDe,
  gerarIdAvaliacaoDesempenho,
  gerarIdCicloAvaliacaoDesempenho,
  mediaAfirmacoes,
  notaKpi,
  notasLiderancaPorCiclo,
  validarConfigAvaliacaoDesempenho,
} from "../domain/avaliacaoDesempenho";
import type { NotaLiderancaPorCiclo } from "../domain/avaliacaoDesempenho";
import { gerarIdPdiAcao, gerarIdPdiItem, sugerirObjetivoEAcoes, validarNotaMinimaPdi } from "../domain/pdi";
import { PERGUNTAS_POTENCIAL, calcularNotaPotencial, gerarIdAvaliacaoPotencial } from "../domain/avaliacaoPotencial";
import { validarLimiaresMatriz9Box } from "../domain/matriz9Box";
import { calcularNotaOficialAvd, calcularNotaOficialPotencial, validarCalibracao } from "../domain/calibracao";
import {
  calcularIndicacao,
  calcularNotaFinalPct,
  gerarIdAvaliacaoExperiencia,
  pendenciasAvaliacaoExperiencia as pendenciasAvaliacaoExperienciaDomain,
} from "../domain/avaliacaoExperiencia";
import { cargoSobLiderancaDe, descendants, ehDiretorIndustrial } from "../domain/hierarquia";
import {
  darCienciaGestor as darCienciaGestorCartaDomain,
  emitirCarta as emitirCartaDomain,
  marcarEntregue as marcarEntregueCartaDomain,
  podeDarCienciaComoGestor,
  podeEmitirCarta as podeEmitirCartaDomain,
  podeMarcarEntregue as podeMarcarEntregueDomain,
} from "../domain/cartaMovimentacao";
import { notificacaoConcluida, notificacaoNovaEtapa, notificacaoReprovada } from "../domain/notificacoes";
import { canCreate, canSeeMov, navCargos, navColab, navRegistro, showEquipes } from "../domain/permissoes";
import { construirMovimentacao, validarForm, type FormContext } from "../domain/formMovimentacao";
import {
  aprovarEtapa as aprovarEtapaDomain,
  editarDadosMovimentacao as editarDadosMovimentacaoDomain,
  type EdicaoDadoMovimentacao,
  etapaAtual,
  reabrirParaRH,
  reprovarEtapa as reprovarEtapaDomain,
} from "../domain/workflow";
import { usePortalStore } from "./PortalStoreContext";
import { useConta } from "./useConta";
import type {
  AvaliacaoDesempenho,
  AvaliacaoExperiencia,
  AvaliacaoPotencial,
  CicloAvaliacaoDesempenho,
  Colaborador,
  CompetenciaComportamental,
  ConfigAvaliacaoDesempenho,
  ConfigDashboard,
  ConfigEncargosFolha,
  Conta,
  DescricaoCargo,
  DesligamentoFinanceiro,
  DispensaAvaliacaoExperiencia,
  EtapaAvaliacaoExperiencia,
  Feedback,
  HistoricoDescricaoCargo,
  KpiCargo,
  Movimentacao,
  NovaMovimentacaoForm,
  NovoCicloAvaliacaoForm,
  Pdi,
  PdiBibliotecaItem,
  PdiItem,
  Perfil,
  ReajusteSalarial,
  RespostaAvaliacaoExperiencia,
  ResultadoAvaliacaoExperiencia,
  SalarioBase,
  TemaFeedback,
  TipoCompetenciaPdi,
} from "../types/domain";

export interface PortalData {
  conta: Conta;
  perfil: Perfil;
  colaboradores: Colaborador[];
  colaboradoresVisiveis: Colaborador[];
  /** Fonte da tela Colaboradores (`/colaboradores`), com regra própria por
   * perfil: RH e Diretoria veem a base inteira (Diretoria sem os botões de
   * edição, que são RH-only); Gestor vê só quem tem ele como gestor imediato
   * (reporte direto). Diferente de `colaboradoresVisiveis`, que continua
   * restrito à árvore hierárquica do Gestor (direta + indireta) em todo o
   * resto do app (ex.: seletor de colaborador em "Nova movimentação",
   * agregados do Dashboard). */
  colaboradoresListagem: Colaborador[];
  movimentacoes: Movimentacao[];
  movimentacoesVisiveis: Movimentacao[];
  desligados: Colaborador[];
  desligamentosFinanceiros: DesligamentoFinanceiro[];
  pendenciasFinanceirasCount: number;
  descricoesCargo: DescricaoCargo[];
  /** true quando `conta` pode editar o grupo `grupo` (ver
   * CAMPOS_DESCRICAO_CARGO) da Descrição de Cargo de `cargoNome` — RH e
   * Diretoria sempre, Gestor só nos 4 grupos de conteúdo liberados e só nos
   * cargos sob sua liderança (ver cargoSobLiderancaDe em domain/hierarquia.ts).
   * A edição do Gestor nunca grava direto no conteúdo oficial — vira uma
   * proposta em `DescricaoCargo.pendente`, com `status` "Em revisão", até o
   * RH/Diretoria aprovar ou rejeitar (ver aprovarDescricaoCargo/
   * rejeitarDescricaoCargo abaixo). RH/Diretoria editando grava direto no
   * oficial e já fica "Aprovada" (são a própria autoridade de aprovação). */
  podeEditarSecaoDescricaoCargo: (cargoNome: string, grupo: string) => boolean;
  /** Bloco "Aprovações" — quem pode aprovar/rejeitar uma proposta pendente:
   * RH ou Diretoria, pra qualquer cargo (papel de auditoria/governança do
   * documento, não de liderança direta) — nunca o próprio Gestor que
   * propôs. */
  podeAprovarDescricaoCargo: boolean;
  /** Só tem efeito quando `status === "Em revisão"`; aplica `pendente` nas
   * colunas oficiais, limpa `pendente` e marca `status` "Aprovada". */
  aprovarDescricaoCargo: (cargoNome: string) => Promise<{ ok: true } | { ok: false }>;
  /** Só tem efeito quando `status === "Em revisão"`; descarta `pendente`
   * (nunca chega a virar oficial) e marca `status` "Rejeitada" — o Gestor
   * pode propor de novo depois. */
  rejeitarDescricaoCargo: (cargoNome: string) => Promise<{ ok: true } | { ok: false }>;
  podeEditarAdmissao: boolean;
  scopeSet: Set<string> | null;
  podeCriar: boolean;
  podeVerColaboradores: boolean;
  podeVerCadastros: boolean;
  /** `/cargos` — RH sempre; Gestor também, pra editar a Descrição de Cargo
   * dos cargos sob sua liderança (a lista já vem escopada, ver navCargos em
   * domain/permissoes.ts). Diferente de `podeVerCadastros`, que continua
   * RH-only pra Departamentos/Acessos/etc. */
  podeVerCargos: boolean;
  mostrarEquipes: boolean;
  loading: boolean;
  aprovarEtapa: (id: string) => void;
  reprovarEtapa: (id: string, comentario: string) => void;
  /** RH-only — só tem efeito quando a última etapa (RH) é quem reprovou (ver
   * reprovadaPeloRH() em domain/workflow.ts); devolve a movimentação para
   * "Em Aprovação" com a etapa de RH de volta em "Em análise". */
  restaurarMovimentacaoParaRH: (id: string) => void;
  /** RH-only — corrige campos de exibição (`dados`) de uma movimentação
   * ainda em aberto (hoje só Salário/Data prevista, ver MovimentacaoDetalhe.tsx);
   * grava cada mudança no histórico da movimentação. */
  editarDadosMovimentacao: (id: string, edicoes: EdicaoDadoMovimentacao[], novaDataPrevistaIso?: string) => void;
  /** RH-only — só quando `podeEmitirCarta()` (Aprovado/Concluído, tipo
   * PRO/TRF/SAL, sem carta ainda). Nunca cria uma movimentação nova; só
   * preenche `cartaMovimentacao` na própria movimentação. */
  emitirCartaMovimentacao: (id: string) => void;
  /** Ciência (não aprovação) do gestor responsável — a permissão de quem
   * pode clicar é checada dentro da função. */
  darCienciaCartaMovimentacao: (id: string) => void;
  /** RH-only, só depois da ciência do gestor — não cria movimentação nova,
   * só marca a entrega na mesma linha. */
  marcarCartaMovimentacaoEntregue: (id: string) => void;
  criarMovimentacao: (form: NovaMovimentacaoForm) => Promise<{ ok: true; movimentacao: Movimentacao } | { ok: false; error?: string }>;
  toggleDescricaoCargo: (nome: string) => void;
  salvarFechamentoFinanceiro: (colaboradorNome: string, valorRescisao: number | null, valorGrrf: number | null) => Promise<{ ok: true } | { ok: false }>;
  atualizarCampoDescricaoCargo: (cargoNome: string, campo: CampoDescricaoCargo, valorNovo: string) => Promise<{ ok: true } | { ok: false }>;
  carregarHistoricoDescricaoCargo: (cargoNome: string) => Promise<HistoricoDescricaoCargo[]>;
  atualizarAdmissao: (nome: string, admissaoIso: string) => Promise<{ ok: true } | { ok: false }>;
  avaliacoesExperiencia: AvaliacaoExperiencia[];
  /** Colaboradores com etapa (45/90 dias) vencida e ainda sem avaliação — RH vê
   * todo mundo, quem tem `colaborador.gestor === conta.nome` (Gestor ou
   * Diretoria que também é gestor imediato de alguém) só vê os próprios. */
  pendenciasAvaliacaoExperiencia: { colaborador: Colaborador; etapa: EtapaAvaliacaoExperiencia }[];
  criarAvaliacaoExperiencia: (
    colaboradorNome: string,
    etapa: EtapaAvaliacaoExperiencia,
    respostas: RespostaAvaliacaoExperiencia[],
    decisaoFinal: ResultadoAvaliacaoExperiencia,
    justificativaDivergencia: string,
  ) => Promise<{ ok: true } | { ok: false }>;
  dispensasAvaliacaoExperiencia: DispensaAvaliacaoExperiencia[];
  /** Registra que um colaborador já foi avaliado fora do sistema (antes da
   * implantação deste módulo) e não deve mais aparecer em pendências. */
  dispensarAvaliacaoExperiencia: (colaboradorNome: string, motivo: string) => Promise<{ ok: true } | { ok: false }>;
  /** Gestão de Desempenho — etapa 1, só estrutura (ver README). */
  configAvaliacaoDesempenho: ConfigAvaliacaoDesempenho | null;
  atualizarConfigAvaliacaoDesempenho: (
    config: Omit<ConfigAvaliacaoDesempenho, "updatedAt" | "updatedBy">,
  ) => Promise<{ ok: true } | { ok: false }>;
  competenciasComportamentais: CompetenciaComportamental[];
  salvarCompetenciaComportamental: (competencia: CompetenciaComportamental) => Promise<{ ok: true } | { ok: false }>;
  kpisCargo: KpiCargo[];
  criarKpiCargo: (kpi: Omit<KpiCargo, "id" | "updatedAt" | "updatedBy">) => Promise<{ ok: true } | { ok: false }>;
  atualizarKpiCargo: (kpi: KpiCargo) => Promise<{ ok: true } | { ok: false }>;
  excluirKpiCargo: (id: number) => Promise<{ ok: true } | { ok: false }>;
  avaliacoesDesempenho: AvaliacaoDesempenho[];
  /** RH vê todas; Gestor só as de colaboradores com `gestor === conta.nome` (reporte direto). */
  avaliacoesDesempenhoVisiveis: AvaliacaoDesempenho[];
  notasLiderancaVisiveis: NotaLiderancaPorCiclo[];
  ciclosAvaliacaoDesempenho: CicloAvaliacaoDesempenho[];
  criarCicloAvaliacaoDesempenho: (form: NovoCicloAvaliacaoForm) => Promise<{ ok: true; quantidade: number } | { ok: false }>;
  /** Trava todas as avaliações do ciclo (mesmo as "Em andamento") — sem reabertura nesta etapa. */
  encerrarCicloAvaliacaoDesempenho: (id: string) => Promise<{ ok: true } | { ok: false }>;
  salvarAvaliacaoDesempenho: (avaliacao: AvaliacaoDesempenho) => Promise<{ ok: true } | { ok: false }>;
  /** true quando `conta` pode editar ESSA avaliação especificamente — RH sempre, Gestor só se
   * for o gestor do colaborador avaliado — e ela ainda não estiver "Concluída" (trava total). */
  podeEditarAvaliacaoDesempenho: (avaliacao: AvaliacaoDesempenho) => boolean;
  /** RH-only — só quando `status === "Concluída"` e ainda não entrou no
   * fluxo de calibração (`statusCalibracao === "Não iniciada"`); depois
   * disso, a correção é responsabilidade da aba Calibração, não deste
   * caminho (mesmo padrão de podeEditarAvaliacaoPotencial/
   * reabrirAvaliacaoPotencial). Só devolve a própria ficha pra "Em
   * andamento" — nunca toca em `colaboradores` ou em outra ficha. */
  podeReabrirAvaliacaoDesempenho: (avaliacao: AvaliacaoDesempenho) => boolean;
  reabrirAvaliacaoDesempenho: (avaliacao: AvaliacaoDesempenho) => Promise<{ ok: true } | { ok: false }>;
  pdi: Pdi[];
  /** RH vê todo mundo; dono só vê depois de "Concluído"; quem é gestor atual do dono vê sempre. */
  pdiVisiveis: Pdi[];
  /** RH sempre (inclusive pra reabrir um PDI concluído); senão, quem originou o plano
   * (gestorResponsavel) OU o gestor atual do colaborador — e só enquanto não estiver "Concluído". */
  podeEditarPdi: (pdi: Pdi) => boolean;
  /** Retorna o Pdi salvo (com o `updatedAt` novo gerado pelo Supabase) — o
   * chamador deve substituir seu rascunho local por ele antes de qualquer
   * gravação seguinte, senão a trava de concorrência otimista (ver
   * salvarPdi() em pdiRepository.ts) rejeitaria o próprio salvamento. */
  salvarPdi: (pdi: Pdi) => Promise<{ ok: true; pdi: Pdi } | { ok: false }>;
  /** RH-only — volta um PDI concluído pra "Em andamento", limpando concluidoPor/Em. */
  reabrirPdi: (pdi: Pdi) => Promise<{ ok: true; pdi: Pdi } | { ok: false }>;
  pdiBiblioteca: PdiBibliotecaItem[];
  salvarItemBibliotecaPdi: (item: PdiBibliotecaItem) => Promise<{ ok: true } | { ok: false }>;
  excluirItemBibliotecaPdi: (chave: string, tipoCompetencia: TipoCompetenciaPdi) => Promise<{ ok: true } | { ok: false }>;
  /** Mesma lista de liderados de `colaboradoresListagem` (RH/Diretoria: empresa
   * toda; Gestor: quem tem `gestor === me` hoje) — Feedback nunca usa uma
   * hierarquia própria. Colaborador nunca vê nada aqui. */
  feedbacksVisiveis: Feedback[];
  podeRegistrarFeedback: (colaboradorNome: string) => boolean;
  registrarFeedback: (input: {
    colaboradorNome: string;
    dataFeedback: string;
    tema: TemaFeedback;
    comentarios: string;
  }) => Promise<{ ok: true; feedback: Feedback } | { ok: false }>;
  podeEditarGestaoDesempenho: boolean;
  avaliacoesPotencial: AvaliacaoPotencial[];
  /** RH vê tudo; senão, só quem é gestor ATUAL do colaborador — o próprio
   * colaborador NUNCA vê a própria ficha (regra absoluta, mais restrita que
   * a AVD), mesmo sendo Gestor/Diretoria de outras pessoas. */
  avaliacoesPotencialVisiveis: AvaliacaoPotencial[];
  /** RH sempre, incondicionalmente (inclusive depois de reabrir com o ciclo já
   * encerrado); senão, só quem `gestorAvaliador` aponta (congelado, igual à
   * AVD) — e só enquanto não "Concluída" e o ciclo não estiver "Encerrado". */
  podeEditarAvaliacaoPotencial: (avaliacao: AvaliacaoPotencial) => boolean;
  salvarAvaliacaoPotencial: (avaliacao: AvaliacaoPotencial) => Promise<{ ok: true } | { ok: false }>;
  /** RH-only — sem gate de ciclo encerrado (é o caminho de correção pra isso). */
  reabrirAvaliacaoPotencial: (avaliacao: AvaliacaoPotencial) => Promise<{ ok: true } | { ok: false }>;
  /** RH vê todos (incl. desligados); Gestor/Diretoria só quem tem `gestor === me`;
   * Colaborador, nunca — fonte de colaboradores pra Matriz 9 Box (etapa 5), que
   * faz o join com avaliacoesDesempenho/avaliacoesPotencial localmente. */
  colaboradoresParaMatriz9Box: Colaborador[];
  /** RH e Diretoria veem a empresa toda (incl. desligados); Gestor só quem tem
   * `gestor === me`; Colaborador vê o próprio registro — fonte de colaboradores
   * pro Histórico (etapa 9), que faz o join com avaliacoesDesempenho/
   * avaliacoesPotencial/pdi/ciclosAvaliacaoDesempenho localmente. */
  colaboradoresParaHistorico: Colaborador[];
  /** RH-only, e só quando a ficha GESTOR já está "Aguardando Calibração"
   * (Comitê de Calibração, etapa 6). */
  podeCalibrarAvaliacaoDesempenho: (avaliacao: AvaliacaoDesempenho) => boolean;
  /** Homologa um par (ficha GESTOR + Potencial) de uma vez — RH-only,
   * checado dentro da própria função. */
  homologarCalibracao: (
    avaliacaoDesempenho: AvaliacaoDesempenho,
    avaliacaoPotencial: AvaliacaoPotencial,
    ajustes: { mediaComportamentalCalibrada: number | null; notaPotencialCalibrada: number | null; justificativa: string },
  ) => Promise<{ ok: true } | { ok: false }>;
  /** RH ou o `gestorAvaliador` da ficha, só quando `statusCalibracao ===
   * "Homologada"` e ainda não marcada (Etapa 8). */
  podeMarcarDevolutiva: (avaliacao: AvaliacaoDesempenho) => boolean;
  marcarDevolutivaRealizada: (avaliacao: AvaliacaoDesempenho) => Promise<{ ok: true } | { ok: false }>;
  /** RH e Diretoria veem a empresa toda (incl. desligados); Gestor toda a árvore
   * de reportes (`scopeSet`, mesma hierarquia de `colaboradoresVisiveis`) — fonte
   * de colaboradores pro Dashboard Executivo de RH, que reconstrói
   * headcount/turnover em qualquer data a partir de admissaoIso/dataDesligamento. */
  colaboradoresParaDashboardExecutivo: Colaborador[];
  configDashboard: ConfigDashboard | null;
  /** RH-only — único indicador manual do Dashboard Executivo. */
  atualizarConfigDashboard: (headcountPlanejado: number) => Promise<{ ok: true } | { ok: false }>;
  /** Componentes/percentuais de encargos usados no Custo Mensal Folha (ver
   * domain/salario.ts) — `null`/`componentes: []` = RH ainda não parametrizou. */
  configEncargosFolha: ConfigEncargosFolha | null;
  /** Fallback de salário importado de planilha — só usado por salarioVigente()
   * quando o colaborador não tem salário derivável de movimentação. */
  salariosBase: SalarioBase[];
  /** Reajustes salariais estruturados já aplicados (ex.: resultado da AVD) —
   * ver ReajusteSalarialTab.tsx e domain/reajusteSalarial.ts. */
  reajustesSalariais: ReajusteSalarial[];
  /** RH-only. Registra os reajustes já validados pela tela; ignora
   * silenciosamente (no repositório) quem já tiver sido aplicado antes. */
  aplicarReajustesSalariais: (
    reajustes: ReajusteSalarial[],
  ) => Promise<{ ok: true; criados: number; duplicados: number } | { ok: false }>;
}

/**
 * Central read/write seam for feature pages: combines the authenticated conta
 * with the portal store to produce role-scoped colaboradores/movimentacoes and
 * the workflow actions, mirroring the prototype's renderVals() derivations.
 *
 * As ações de escrita (aprovar/reprovar/criar/alternar) gravam primeiro no
 * Supabase (peopleflow_movimentacoes / peopleflow_cargos_custom) e só então
 * atualizam o estado local — se a gravação falhar, o estado local não muda e
 * um toast de erro aparece, evitando que a UI mostre algo que não foi salvo.
 */
export function usePortalData(): PortalData {
  const conta = useConta();
  const { state, dispatch, loading, reload } = usePortalStore();
  const { flash } = useToast();

  if (!conta) throw new Error("usePortalData requer uma conta resolvida — use dentro de <AppShell>, depois que os colaboradores carregarem");

  const perfil = conta.perfil;
  const me = conta.nome;

  const scopeSet = useMemo(() => {
    if (perfil !== "Gestor") return null;
    const set = descendants(state.colaboradores, me);
    set.add(me);
    return set;
  }, [perfil, me, state.colaboradores]);

  const ativosGlobal = useMemo(() => state.colaboradores.filter((c) => !c.desligado), [state.colaboradores]);

  const colaboradoresVisiveis = useMemo(() => {
    return perfil === "Gestor" && scopeSet ? ativosGlobal.filter((c) => scopeSet.has(c.nome)) : ativosGlobal;
  }, [perfil, scopeSet, ativosGlobal]);

  /** Fonte da tela Colaboradores (/colaboradores), com regra própria por perfil:
   * RH e Diretoria veem a base inteira (Diretoria sem os botões de edição, que
   * são RH-only); Gestor vê só quem tem ele como gestor imediato — reporte
   * direto, sem descer a árvore como `scopeSet`/`colaboradoresVisiveis` fazem
   * para o resto do app (workflow, seletor de "Nova movimentação"). */
  const colaboradoresListagem = useMemo(() => {
    if (perfil === "Gestor") return ativosGlobal.filter((c) => c.gestor === me);
    return ativosGlobal;
  }, [perfil, me, ativosGlobal]);

  /** Matriz 9 Box (etapa 5) — RH vê todos, incl. desligados (o filtro de
   * status Ativo/Inativo é da própria tela); Gestor/Diretoria vê quem `me`
   * avaliou como GESTOR em algum ciclo (`gestorAvaliador`, congelado na
   * ficha) — pra não perder, numa promoção/transferência posterior, alguém
   * que eu de fato avaliei (achado real: Ana Maria/os Auxiliares de Produção
   * mudaram de gestor depois do 2º Ciclo e sumiam da visão de quem realmente
   * os avaliou) — UNIDO com `gestor === me` (gestor atual) só pra quem
   * NINGUÉM MAIS já avaliou como GESTOR em nenhum ciclo (cobre reportes
   * novos/ainda sem avaliação nenhuma, que devem aparecer como "sem posição"
   * na tela). Sem essa ressalva, o mesmo problema aparece ao contrário: um
   * colaborador que hoje reporta a mim mas foi avaliado por OUTRO gestor
   * (achado real: Fabiana Santos Sousa reporta a Tainara hoje, mas quem a
   * avaliou no 2º Ciclo foi Ravena Peixoto) vazava pra minha Matriz 9 Box só
   * por ser meu liderado atual — o registro de quem avaliou pertence a quem
   * avaliou, não a quem gerencia agora. Colaborador, nunca (defesa em
   * profundidade — a aba já é bloqueada em GestaoDesempenhoPage.tsx).
   * Exceção pontual: `colaboradores.matriz9box_visao_completa` (ligada
   * manualmente pelo RH via SQL) libera a empresa inteira pra um Gestor
   * específico que avalia gente fora da própria árvore no organograma — ver
   * seção 22 do schema.sql. */
  const colaboradoresParaMatriz9Box = useMemo(() => {
    if (perfil === "RH") return state.colaboradores;
    if (perfil === "Colaborador") return [];
    const proprio = state.colaboradores.find((c) => c.nome === me);
    if (proprio?.matriz9BoxVisaoCompleta) return state.colaboradores;
    const avaliadosPorMimComoGestor = new Set<string>();
    const avaliadosPorOutroGestor = new Set<string>();
    for (const a of state.avaliacoesDesempenho) {
      if (a.tipo !== "GESTOR" || !a.gestorAvaliador) continue;
      if (a.gestorAvaliador === me) avaliadosPorMimComoGestor.add(a.colaboradorNome);
      else avaliadosPorOutroGestor.add(a.colaboradorNome);
    }
    return state.colaboradores.filter(
      (c) => avaliadosPorMimComoGestor.has(c.nome) || (c.gestor === me && !avaliadosPorOutroGestor.has(c.nome)),
    );
  }, [state.colaboradores, state.avaliacoesDesempenho, perfil, me]);

  /** Histórico (etapa 9) — inclui desligados, mesma ideia de
   * `colaboradoresParaMatriz9Box` (histórico é registro, não gestão do
   * presente), mas com escopo por perfil DIFERENTE: RH e Diretoria veem a
   * empresa toda (decisão confirmada com o usuário — o spec desta etapa só
   * lista RH/Gestor/Colaborador, omitindo Diretoria; tratado como RH em vez
   * de como Gestor); Gestor só quem tem `gestor === me`; Colaborador vê o
   * próprio registro (não `[]` como em Matriz 9 Box — aqui o colaborador tem
   * acesso à própria linha do tempo). */
  const colaboradoresParaHistorico = useMemo(() => {
    if (perfil === "RH" || perfil === "Diretoria") return state.colaboradores;
    if (perfil === "Colaborador") return state.colaboradores.filter((c) => c.nome === me);
    return state.colaboradores.filter((c) => c.gestor === me);
  }, [state.colaboradores, perfil, me]);

  /** Dashboard Executivo de RH — mesma regra de escopo de `colaboradoresVisiveis`
   * (RH/Diretoria: empresa toda; Gestor: toda a árvore de reportes via
   * `scopeSet`, não só diretos), mas a partir de `state.colaboradores` em vez
   * de `ativosGlobal` — precisa também dos desligados do escopo pra
   * reconstruir headcount/turnover em datas passadas (`domain/dashboardExecutivo.ts`). */
  const colaboradoresParaDashboardExecutivo = useMemo(
    () => (perfil === "Gestor" && scopeSet ? state.colaboradores.filter((c) => scopeSet.has(c.nome)) : state.colaboradores),
    [perfil, scopeSet, state.colaboradores],
  );

  const souDiretorIndustrial = useMemo(
    () => ehDiretorIndustrial(state.colaboradores.find((c) => c.nome === me)),
    [state.colaboradores, me],
  );

  const movimentacoesVisiveis = useMemo(
    () =>
      perfil === "RH"
        ? state.movimentacoes
        : state.movimentacoes.filter((m) => canSeeMov(m, perfil, me, scopeSet, souDiretorIndustrial)),
    [perfil, me, scopeSet, state.movimentacoes, souDiretorIndustrial],
  );

  const desligados = useMemo(() => colaboradoresDesligados(state.colaboradores), [state.colaboradores]);

  const pendenciasFinanceirasCount = useMemo(
    () => desligados.filter((c) => pendenteFechamento(c.nome, state.desligamentosFinanceiros)).length,
    [desligados, state.desligamentosFinanceiros],
  );

  const pendenciasAvaliacaoExperiencia = useMemo(() => {
    const todas = pendenciasAvaliacaoExperienciaDomain(
      state.colaboradores,
      state.avaliacoesExperiencia,
      state.dispensasAvaliacaoExperiencia,
    );
    return perfil === "RH" ? todas : todas.filter((p) => p.colaborador.gestor === me);
  }, [state.colaboradores, state.avaliacoesExperiencia, state.dispensasAvaliacaoExperiencia, perfil, me]);

  const colaboradorPorNome = useMemo(() => new Map(state.colaboradores.map((c) => [c.nome, c])), [state.colaboradores]);

  /** RH vê tudo. Fora isso: cada um vê suas próprias 3 fichas do ciclo (a
   * ficha GESTOR sobre si mesmo fica oculta pro perfil "Colaborador" — regra
   * explícita, ele nunca vê a avaliação que o gestor fez dele — mas visível
   * pra Gestor/Diretoria, que também são "colaborador" de alguém); e quem é
   * gestor definido para AQUELE ciclo (`gestorAvaliador` congelado na
   * própria ficha GESTOR do colaborador — não `colaborador.gestor`, atual/
   * ao vivo: RH pode substituir manualmente quem avalia sem que o cadastro
   * mude, ver comentário abaixo) vê as até 3 fichas desse liderado, mas só
   * edita a do tipo GESTOR (podeEditarAvaliacaoDesempenho já cuida disso via
   * gestorAvaliador). */
  // Quem é "o gestor" de um colaborador NUM CICLO é definido pela própria
  // ficha GESTOR dele (gestorAvaliador) — não por colaborador.gestor (atual/
  // ao vivo). Nos ciclos gerados normalmente os dois valores são iguais (a
  // ficha nasce com gestorAvaliador = colaborador.gestor daquele momento),
  // mas RH pode corrigir manualmente qual gestor avalia sem tocar no
  // cadastro (ex.: substituição pontual) — usar o campo vivo aqui faria o
  // gestor errado continuar vendo a ficha, e o gestor certo (definido na
  // correção) nunca a ver. Mapa por `cicloId::colaboradorNome` porque o
  // mesmo colaborador pode ter gestores diferentes em ciclos diferentes.
  const gestorAvaliadorPorColaboradorCiclo = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const a of state.avaliacoesDesempenho) {
      if (a.tipo === "GESTOR") mapa.set(`${a.cicloId}::${a.colaboradorNome}`, a.gestorAvaliador);
    }
    return mapa;
  }, [state.avaliacoesDesempenho]);

  const avaliacoesDesempenhoVisiveis = useMemo(() => {
    // "Não Elegível" (RH corrigiu inclusão por engano) nunca aparece na
    // lista de trabalho de ninguém, nem do RH — o histórico completo
    // continua em `avaliacoesDesempenho` (usado só pela seção "Ciclos",
    // RH-only) e no log de auditoria do ciclo.
    const semNaoElegivel = state.avaliacoesDesempenho.filter((a) => a.status !== "Não Elegível");
    if (perfil === "RH") return semNaoElegivel;
    return semNaoElegivel.filter((a) => {
      // Ficha LIDERANCA (liderado avalia o próprio líder): a ficha crua (com
      // respostas/comentários individuais) só é visível pro RH (linha acima)
      // e pra Diretoria — nunca pro líder avaliado, mesmo sendo "gestor" de
      // quem preencheu (a checagem genérica abaixo daria falso-positivo
      // nesse caso específico: o líder AVALIADO é sempre gestor do liderado
      // que preencheu). O líder avaliado só recebe as notas agregadas, em
      // separado (ver notasLiderancaVisiveis). Quem preencheu continua vendo
      // a própria ficha sempre.
      if (a.tipo === "LIDERANCA") {
        if (perfil === "Diretoria") return true;
        return a.colaboradorNome === me;
      }
      if (a.colaboradorNome === me) {
        if (a.tipo === "GESTOR") return perfil !== "Colaborador";
        return true;
      }
      return gestorAvaliadorPorColaboradorCiclo.get(`${a.cicloId}::${a.colaboradorNome}`) === me;
    });
  }, [state.avaliacoesDesempenho, gestorAvaliadorPorColaboradorCiclo, perfil, me]);

  // Única visão que o líder avaliado tem da própria Avaliação de Liderança:
  // 1 média por ciclo, nunca a ficha individual (ver comentário acima em
  // avaliacoesDesempenhoVisiveis). Lida direto de `state.avaliacoesDesempenho`
  // (não da lista já filtrada), já que o agregado em si é seguro de expor —
  // só a ficha crua que precisa ficar restrita.
  const notasLiderancaVisiveis = useMemo(
    () => notasLiderancaPorCiclo(state.avaliacoesDesempenho, me),
    [state.avaliacoesDesempenho, me],
  );

  const podeEditarAvaliacaoDesempenhoFn = useCallback(
    (avaliacao: AvaliacaoDesempenho) => {
      if (avaliacao.status === "Concluída" || avaliacao.status === "Não Elegível") return false;
      const ciclo = state.ciclosAvaliacaoDesempenho.find((c) => c.id === avaliacao.cicloId);
      if (ciclo?.status === "Encerrado") return false;
      if (perfil === "RH") return true;
      return avaliacao.gestorAvaliador === me;
    },
    [perfil, me, state.ciclosAvaliacaoDesempenho],
  );

  /** RH vê tudo. Dono (`colaboradorNome === me`) só vê depois de concluído —
   * diferente da AVD (lá a ficha GESTOR nunca é vista pelo perfil
   * Colaborador), aqui é só uma questão de tempo: vê assim que o gestor
   * concluir. Senão, só `gestorResponsavel` (congelado, sempre preenchido
   * com o `gestorAvaliador` da avaliação que gerou o PDI — nunca vazio, ver
   * `usePortalData.ts` onde o PDI é criado) — nunca o gestor atual (ao
   * vivo): um PDI pertence a quem de fato avaliou e o gerou, não a quem
   * gerencia o colaborador agora (achado real: Fabiana Santos Sousa reporta
   * a Tainara hoje, mas foi Ravena Peixoto quem a avaliou e gerou o PDI dela
   * — o PDI de Fabiana não pode vazar pra lista de Tainara só por isso).
   * `podeEditarPdiFn` é DIFERENTE de propósito (permite um gestor novo
   * assumir a edição de um PDI em andamento sem depender do RH) e continua
   * unindo com o gestor atual — aqui é só visibilidade de leitura. */
  const pdiVisiveis = useMemo(() => {
    if (perfil === "RH") return state.pdi;
    return state.pdi.filter((p) => {
      if (p.colaboradorNome === me) return p.status === "Concluído";
      return p.gestorResponsavel === me;
    });
  }, [state.pdi, perfil, me]);

  /** RH sempre — inclusive um PDI já concluído, é assim que ele "reabre".
   * Senão, quem originou o plano (gestorResponsavel, congelado — mesma
   * lógica de gestorAvaliador na AVD, pra não perder acesso numa
   * transferência) OU o gestor atual do colaborador (pra um gestor novo
   * poder assumir sem precisar do RH) — e só enquanto não "Concluído". */
  const podeEditarPdiFn = useCallback(
    (pdi: Pdi) => {
      if (perfil === "RH") return true;
      if (pdi.status === "Concluído") return false;
      return pdi.gestorResponsavel === me || colaboradorPorNome.get(pdi.colaboradorNome)?.gestor === me;
    },
    [perfil, me, colaboradorPorNome],
  );

  /** Regra absoluta (mais restrita que a AVD): o colaborador NUNCA vê a
   * própria Avaliação de Potencial — checagem explícita e incondicional,
   * antes de qualquer outra, pra não depender só da comparação com o
   * gestor atual (que poderia dar falso-positivo numa qualidade de dado
   * onde colaborador.gestor === colaborador.nome). RH vê tudo; senão, só
   * quem a própria ficha aponta como `gestorAvaliador` (congelado na
   * geração) — não o `colaboradores.gestor` ao vivo, senão uma correção
   * manual de gestor (via SQL, mesmo mecanismo já usado na AVD) nunca
   * mudaria quem vê a ficha, só quem pode editá-la. */
  const avaliacoesPotencialVisiveis = useMemo(() => {
    // Mesma exclusão universal de avaliacoesDesempenhoVisiveis.
    const semNaoElegivel = state.avaliacoesPotencial.filter((a) => a.status !== "Não Elegível");
    if (perfil === "RH") return semNaoElegivel;
    return semNaoElegivel.filter((a) => {
      if (a.colaboradorNome === me) return false;
      return a.gestorAvaliador === me;
    });
  }, [state.avaliacoesPotencial, perfil, me]);

  /** RH sempre, checado PRIMEIRO e incondicionalmente (diferente da AVD,
   * que bloqueia até o RH quando o ciclo está encerrado — aqui isso seria
   * um beco sem saída depois de reabrir uma ficha de ciclo já encerrado) —
   * **exceto** se já entrou no fluxo de calibração (achado da revisão da
   * Etapa 6: sem esse guard, o RH conseguiria editar respostas ou reabrir
   * uma ficha já "Aguardando Calibração"/"Homologada" por este caminho,
   * recalculando notaPotencial e desincronizando a Nota Oficial/Matriz 9
   * Box sem justificativa nem rastro — a calibração de verdade só acontece
   * pela aba Calibração). Senão, só quem `gestorAvaliador` aponta
   * (congelado, igual à AVD) — e só enquanto não "Concluída" e o ciclo não
   * estiver "Encerrado". */
  const podeEditarAvaliacaoPotencialFn = useCallback(
    (avaliacao: AvaliacaoPotencial) => {
      if (avaliacao.statusCalibracao !== "Não iniciada") return false;
      if (perfil === "RH") return true;
      if (avaliacao.status === "Concluída" || avaliacao.status === "Não Elegível") return false;
      const ciclo = state.ciclosAvaliacaoDesempenho.find((c) => c.id === avaliacao.cicloId);
      if (ciclo?.status === "Encerrado") return false;
      return avaliacao.gestorAvaliador === me;
    },
    [perfil, me, state.ciclosAvaliacaoDesempenho],
  );

  const aprovarEtapaFn = useCallback(
    (id: string) => {
      const { movimentacoes, admissaoRegistrada, atualizacaoRegistrada, desligamentoRegistrado } = aprovarEtapaDomain(
        state.movimentacoes,
        id,
      );
      const atualizada = movimentacoes.find((m) => m.id === id);
      if (!atualizada) return;
      (async () => {
        try {
          await atualizarMovimentacao(atualizada);
          let msg = "Etapa aprovada — movimentação atualizada.";
          if (admissaoRegistrada) {
            const { jaExistia } = await criarPreCadastroNoSupabase(admissaoRegistrada);
            msg = jaExistia
              ? `Admissão concluída — já existe um colaborador chamado "${admissaoRegistrada.candidato}", pré-cadastro não duplicado.`
              : `Admissão concluída — pré-cadastro de "${admissaoRegistrada.candidato}" criado (CPF e demais dados do SST ainda precisam ser completados).`;
            reload();
          }
          if (atualizacaoRegistrada) {
            const [efetivada] = await efetivarSincronizacoesPendentes([atualizada]);
            if (efetivada.sincronizadoEm) {
              msg = `Cadastro de "${atualizacaoRegistrada.nome}" atualizado com o novo cargo/departamento nos dois portais.`;
              reload();
            } else {
              const previstaLabel = atualizacaoRegistrada.dataPrevistaIso ? formatarDataIso(atualizacaoRegistrada.dataPrevistaIso) : null;
              msg = previstaLabel
                ? `Movimentação de "${atualizacaoRegistrada.nome}" aprovada — cargo/departamento serão atualizados automaticamente em ${previstaLabel}.`
                : `Movimentação de "${atualizacaoRegistrada.nome}" aprovada — cargo/departamento serão atualizados na próxima carga do portal.`;
            }
          }
          if (desligamentoRegistrado) {
            await criarSolicitacaoDesligamentoNoSupabase(
              desligamentoRegistrado.nome,
              desligamentoRegistrado.dataIso,
              desligamentoRegistrado.motivo,
              conta.email,
            );
            msg = `Desligamento de "${desligamentoRegistrado.nome}" aprovado — agora aguarda o RH efetivar no Portal SST (anexando o ASO demissional, se aplicável).`;
          }
          dispatch({ type: "APROVAR_ETAPA", id });
          flash(msg);

          // Notificação por e-mail: best-effort, não bloqueia nem afeta o
          // resultado da aprovação (ver notificacoesRepository.ts).
          const proximaEtapa = etapaAtual(atualizada);
          const email = proximaEtapa
            ? notificacaoNovaEtapa(atualizada, proximaEtapa, window.location.origin)
            : notificacaoConcluida(atualizada);
          void notificar(email);
        } catch (err) {
          flash(err instanceof Error ? err.message : "Falha ao aprovar etapa.");
        }
      })();
    },
    [dispatch, state.movimentacoes, flash, reload, conta.email],
  );

  const reprovarEtapaFn = useCallback(
    (id: string, comentario: string) => {
      const movimentacoes = reprovarEtapaDomain(state.movimentacoes, id, comentario);
      const atualizada = movimentacoes.find((m) => m.id === id);
      if (!atualizada) return;
      (async () => {
        try {
          await atualizarMovimentacao(atualizada);
          dispatch({ type: "REPROVAR_ETAPA", id, comentario });
          flash("Movimentação reprovada e registrada na trilha.");

          const etapaReprovada = atualizada.etapas.find((e) => e.status === "Reprovado");
          if (etapaReprovada) {
            const email = notificacaoReprovada(atualizada, etapaReprovada, window.location.origin);
            void notificar(email);
          }
        } catch (err) {
          flash(err instanceof Error ? err.message : "Falha ao reprovar etapa.");
        }
      })();
    },
    [dispatch, state.movimentacoes, flash],
  );

  const restaurarMovimentacaoParaRHFn = useCallback(
    (id: string) => {
      const movimentacoes = reabrirParaRH(state.movimentacoes, id, me);
      const atualizada = movimentacoes.find((m) => m.id === id);
      if (!atualizada) return;
      (async () => {
        try {
          await atualizarMovimentacao(atualizada);
          dispatch({ type: "REABRIR_MOVIMENTACAO_RH", id, autor: me });
          flash("Movimentação restaurada para nova análise do RH.");
        } catch (err) {
          flash(err instanceof Error ? err.message : "Falha ao restaurar movimentação.");
        }
      })();
    },
    [dispatch, state.movimentacoes, flash, me],
  );

  const editarDadosMovimentacaoFn = useCallback(
    (id: string, edicoes: EdicaoDadoMovimentacao[], novaDataPrevistaIso?: string) => {
      const movimentacoes = editarDadosMovimentacaoDomain(state.movimentacoes, id, edicoes, novaDataPrevistaIso, me);
      const atualizada = movimentacoes.find((m) => m.id === id);
      if (!atualizada) return;
      (async () => {
        try {
          await atualizarMovimentacao(atualizada);
          dispatch({ type: "EDITAR_DADOS_MOVIMENTACAO", id, edicoes, novaDataPrevistaIso, autor: me });
          flash("Alterações salvas na movimentação.");
        } catch (err) {
          flash(err instanceof Error ? err.message : "Falha ao salvar alterações.");
        }
      })();
    },
    [dispatch, state.movimentacoes, flash, me],
  );

  const emitirCartaMovimentacaoFn = useCallback(
    (id: string) => {
      if (perfil !== "RH") {
        flash("Só o RH pode emitir a Carta de Movimentação.");
        return;
      }
      const movimentacao = state.movimentacoes.find((m) => m.id === id);
      if (!movimentacao || !podeEmitirCartaDomain(movimentacao)) {
        flash("Esta movimentação não pode emitir carta agora.");
        return;
      }
      const carta = emitirCartaDomain(movimentacao, me, state.colaboradores);
      const atualizada = { ...movimentacao, cartaMovimentacao: carta };
      (async () => {
        try {
          await atualizarMovimentacao(atualizada);
          dispatch({ type: "ATUALIZAR_CARTA_MOVIMENTACAO", id, carta });
          flash("Carta de Movimentação emitida.");
        } catch (err) {
          flash(err instanceof Error ? err.message : "Falha ao emitir a carta de movimentação.");
        }
      })();
    },
    [dispatch, state.movimentacoes, state.colaboradores, flash, me, perfil],
  );

  const darCienciaCartaMovimentacaoFn = useCallback(
    (id: string) => {
      const movimentacao = state.movimentacoes.find((m) => m.id === id);
      const carta = movimentacao?.cartaMovimentacao;
      if (!movimentacao || !carta) return;
      if (!podeDarCienciaComoGestor(movimentacao, me)) {
        flash("Você não pode dar ciência nesta carta.");
        return;
      }
      const cargo = state.colaboradores.find((c) => c.nome === me)?.cargo ?? "";
      const cartaAtualizada = darCienciaGestorCartaDomain(carta, me, cargo);
      const atualizada = { ...movimentacao, cartaMovimentacao: cartaAtualizada };
      (async () => {
        try {
          await atualizarMovimentacao(atualizada);
          dispatch({ type: "ATUALIZAR_CARTA_MOVIMENTACAO", id, carta: cartaAtualizada });
          flash("Ciência registrada.");
        } catch (err) {
          flash(err instanceof Error ? err.message : "Falha ao registrar ciência.");
        }
      })();
    },
    [dispatch, state.movimentacoes, state.colaboradores, flash, me],
  );

  const marcarCartaMovimentacaoEntregueFn = useCallback(
    (id: string) => {
      if (perfil !== "RH") {
        flash("Só o RH pode marcar a carta como entregue.");
        return;
      }
      const movimentacao = state.movimentacoes.find((m) => m.id === id);
      const carta = movimentacao?.cartaMovimentacao;
      if (!movimentacao || !carta || !podeMarcarEntregueDomain(carta)) {
        flash("Esta carta ainda não pode ser marcada como entregue.");
        return;
      }
      const cartaAtualizada = marcarEntregueCartaDomain(carta, me);
      const atualizada = { ...movimentacao, cartaMovimentacao: cartaAtualizada };
      (async () => {
        try {
          await atualizarMovimentacao(atualizada);
          dispatch({ type: "ATUALIZAR_CARTA_MOVIMENTACAO", id, carta: cartaAtualizada });
          flash("Carta marcada como entregue ao colaborador.");
        } catch (err) {
          flash(err instanceof Error ? err.message : "Falha ao marcar entrega.");
        }
      })();
    },
    [dispatch, state.movimentacoes, flash, me, perfil],
  );

  const toggleDescricaoCargoFn = useCallback(
    (nome: string) => {
      const atual = state.cargosCustom.find((c) => c.nome === nome);
      if (!atual) return;
      const novaDescricao = atual.descricao === "OK" ? "Pendente" : "OK";
      (async () => {
        try {
          await atualizarDescricaoCargoCustom(nome, novaDescricao);
          dispatch({ type: "TOGGLE_DESCRICAO_CARGO", nome });
        } catch (err) {
          flash(err instanceof Error ? err.message : "Falha ao atualizar descrição de cargo.");
        }
      })();
    },
    [dispatch, state.cargosCustom, flash],
  );

  const criarMovimentacaoFn = useCallback(
    async (form: NovaMovimentacaoForm) => {
      const validacao = validarForm(form, { me, colaboradores: state.colaboradores });
      if (!validacao.ok) return { ok: false as const, error: validacao.error };
      const ctx: FormContext = { me, tipos: state.tipos, colaboradores: state.colaboradores, movimentacoes: state.movimentacoes };
      const movimentacao = construirMovimentacao(form, ctx);
      try {
        await criarMovimentacaoNoSupabase(movimentacao);
        dispatch({ type: "CRIAR_MOVIMENTACAO", movimentacao });

        const primeiraEtapa = etapaAtual(movimentacao);
        if (primeiraEtapa) {
          const email = notificacaoNovaEtapa(movimentacao, primeiraEtapa, window.location.origin);
          void notificar(email);
        }

        return { ok: true as const, movimentacao };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Falha ao criar movimentação.";
        flash(error);
        return { ok: false as const, error };
      }
    },
    [dispatch, me, state.tipos, state.colaboradores, state.movimentacoes, flash],
  );

  /** RH e Diretoria sempre; Gestor só nos grupos liberados (ver
   * podeGestorEditarGrupo) e só nos cargos sob sua liderança (ver
   * cargoSobLiderancaDe). */
  const podeEditarSecaoDescricaoCargoFn = useCallback(
    (cargoNome: string, grupo: string) => {
      if (perfil === "RH" || perfil === "Diretoria") return true;
      if (perfil !== "Gestor") return false;
      if (!podeGestorEditarGrupo(grupo)) return false;
      return cargoSobLiderancaDe(state.colaboradores, cargoNome, scopeSet);
    },
    [perfil, scopeSet, state.colaboradores],
  );

  /** Gestor: grava a edição como PROPOSTA em `pendente` (nunca no conteúdo
   * oficial) e marca `status` "Em revisão" — precisa da aprovação do RH/
   * Diretoria pra virar oficial. RH/Diretoria: grava direto no conteúdo
   * oficial e já fica "Aprovada", com `aprovado_por/em` = o próprio editor
   * (são a autoridade de aprovação, não precisam de uma segunda aprovação
   * pra sua própria edição). Em ambos os casos, `elaborado_por/em` é
   * atualizado automaticamente pra refletir quem fez esta edição. */
  const atualizarCampoDescricaoCargoFn = useCallback(
    async (cargoNome: string, campo: CampoDescricaoCargo, valorNovo: string) => {
      const meta = CAMPOS_DESCRICAO_CARGO.find((c) => c.key === campo);
      if (!meta || !podeEditarSecaoDescricaoCargoFn(cargoNome, meta.grupo)) {
        flash("Você não pode editar este campo.");
        return { ok: false as const };
      }

      const atual = state.descricoesCargo.find((d) => d.cargoNome === cargoNome) ?? descricaoCargoVazia(cargoNome);
      const valorAnterior = valorEfetivoDescricaoCargo(atual, campo);
      const agora = new Date().toISOString();
      const ehRevisor = perfil === "RH" || perfil === "Diretoria";
      const coluna = COLUNA_POR_CAMPO[campo];

      const patch: Record<string, unknown> = ehRevisor
        ? {
            [coluna]: valorNovo,
            pendente: null,
            status: "Aprovada",
            elaborado_por: me,
            elaborado_em: agora,
            aprovado_por: me,
            aprovado_em: agora,
            updated_at: agora,
            updated_by: me,
          }
        : {
            pendente: { ...(atual.pendente ?? {}), [campo]: valorNovo },
            status: "Em revisão",
            elaborado_por: me,
            elaborado_em: agora,
            updated_at: agora,
            updated_by: me,
          };

      try {
        await salvarRevisaoDescricaoCargoNoSupabase(cargoNome, patch, {
          campo,
          valorAnterior,
          valorNovo,
          editadoPor: me,
          perfil,
        });
        dispatch({
          type: "ATUALIZAR_DESCRICAO_CARGO",
          descricao: ehRevisor
            ? {
                ...atual,
                [campo]: valorNovo,
                pendente: null,
                status: "Aprovada",
                elaboradoPor: me,
                elaboradoEm: agora,
                aprovadoPor: me,
                aprovadoEm: agora,
                updatedAt: agora,
                updatedBy: me,
              }
            : {
                ...atual,
                pendente: { ...(atual.pendente ?? {}), [campo]: valorNovo },
                status: "Em revisão",
                elaboradoPor: me,
                elaboradoEm: agora,
                updatedAt: agora,
                updatedBy: me,
              },
        });
        flash(ehRevisor ? "Descrição de cargo atualizada." : "Alteração enviada para aprovação do RH/Diretoria.");
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao atualizar descrição de cargo.");
        return { ok: false as const };
      }
    },
    [dispatch, me, perfil, state.descricoesCargo, podeEditarSecaoDescricaoCargoFn, flash],
  );

  const carregarHistoricoDescricaoCargoFn = useCallback(
    (cargoNome: string) => getHistoricoDescricaoCargo(cargoNome),
    [],
  );

  /** RH/Diretoria-only, e só quando há uma proposta pendente — aplica cada
   * campo de `pendente` na coluna oficial correspondente, limpa `pendente`
   * e marca `status` "Aprovada". */
  const aprovarDescricaoCargoFn = useCallback(
    async (cargoNome: string) => {
      if (perfil !== "RH" && perfil !== "Diretoria") {
        flash("Só RH ou Diretoria podem aprovar.");
        return { ok: false as const };
      }
      const atual = state.descricoesCargo.find((d) => d.cargoNome === cargoNome);
      if (!atual || atual.status !== "Em revisão" || !atual.pendente) {
        flash("Não há alteração pendente para aprovar.");
        return { ok: false as const };
      }

      const agora = new Date().toISOString();
      const patch: Record<string, unknown> = {
        pendente: null,
        status: "Aprovada",
        aprovado_por: me,
        aprovado_em: agora,
        updated_at: agora,
        updated_by: me,
      };
      Object.entries(atual.pendente).forEach(([campo, valor]) => {
        const coluna = COLUNA_POR_CAMPO[campo as CampoDescricaoCargo];
        if (coluna) patch[coluna] = valor;
      });

      try {
        await salvarRevisaoDescricaoCargoNoSupabase(cargoNome, patch, {
          campo: "status",
          valorAnterior: "Em revisão",
          valorNovo: "Aprovada",
          editadoPor: me,
          perfil,
        });
        dispatch({
          type: "ATUALIZAR_DESCRICAO_CARGO",
          descricao: { ...atual, ...atual.pendente, pendente: null, status: "Aprovada", aprovadoPor: me, aprovadoEm: agora, updatedAt: agora, updatedBy: me },
        });
        flash("Alteração aprovada.");
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao aprovar alteração.");
        return { ok: false as const };
      }
    },
    [dispatch, me, perfil, state.descricoesCargo, flash],
  );

  /** RH/Diretoria-only, e só quando há uma proposta pendente — descarta
   * `pendente` (nunca chega a virar oficial) e marca `status` "Rejeitada". */
  const rejeitarDescricaoCargoFn = useCallback(
    async (cargoNome: string) => {
      if (perfil !== "RH" && perfil !== "Diretoria") {
        flash("Só RH ou Diretoria podem rejeitar.");
        return { ok: false as const };
      }
      const atual = state.descricoesCargo.find((d) => d.cargoNome === cargoNome);
      if (!atual || atual.status !== "Em revisão") {
        flash("Não há alteração pendente para rejeitar.");
        return { ok: false as const };
      }

      const agora = new Date().toISOString();
      try {
        await salvarRevisaoDescricaoCargoNoSupabase(
          cargoNome,
          { pendente: null, status: "Rejeitada", updated_at: agora, updated_by: me },
          { campo: "status", valorAnterior: "Em revisão", valorNovo: "Rejeitada", editadoPor: me, perfil },
        );
        dispatch({
          type: "ATUALIZAR_DESCRICAO_CARGO",
          descricao: { ...atual, pendente: null, status: "Rejeitada", updatedAt: agora, updatedBy: me },
        });
        flash("Alteração rejeitada.");
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao rejeitar alteração.");
        return { ok: false as const };
      }
    },
    [dispatch, me, perfil, state.descricoesCargo, flash],
  );

  const atualizarAdmissaoFn = useCallback(
    async (nome: string, admissaoIso: string) => {
      try {
        await atualizarAdmissaoNoSupabase(nome, admissaoIso);
        dispatch({
          type: "ATUALIZAR_ADMISSAO_COLABORADOR",
          nome,
          admissao: formatarDataIso(admissaoIso),
          admissaoIso,
          tempoDeEmpresa: tempoDeEmpresa(admissaoIso),
        });
        flash("Data de admissão atualizada.");
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao atualizar data de admissão.");
        return { ok: false as const };
      }
    },
    [dispatch, flash],
  );

  const salvarFechamentoFinanceiroFn = useCallback(
    async (colaboradorNome: string, valorRescisao: number | null, valorGrrf: number | null) => {
      try {
        await salvarFechamentoNoSupabase(colaboradorNome, valorRescisao, valorGrrf, me);
        dispatch({
          type: "SALVAR_FECHAMENTO_FINANCEIRO",
          desligamento: { colaboradorNome, valorRescisao, valorGrrf, updatedAt: new Date().toISOString(), updatedBy: me },
        });
        flash("Fechamento financeiro salvo.");
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao salvar fechamento financeiro.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash],
  );

  const criarAvaliacaoExperienciaFn = useCallback(
    async (
      colaboradorNome: string,
      etapa: EtapaAvaliacaoExperiencia,
      respostas: RespostaAvaliacaoExperiencia[],
      decisaoFinal: ResultadoAvaliacaoExperiencia,
      justificativaDivergencia: string,
    ) => {
      const notaFinalPct = calcularNotaFinalPct(respostas);
      const indicacao = calcularIndicacao(etapa, notaFinalPct);
      const avaliacao: AvaliacaoExperiencia = {
        id: gerarIdAvaliacaoExperiencia(),
        colaboradorNome,
        etapa,
        respostas,
        notaFinalPct,
        indicacao,
        decisaoFinal,
        justificativaDivergencia,
        avaliadoPor: me,
        avaliadoEm: new Date().toISOString(),
      };
      try {
        await criarAvaliacaoExperienciaNoSupabase(avaliacao);
        dispatch({ type: "CRIAR_AVALIACAO_EXPERIENCIA", avaliacao });
        flash(`Avaliação de ${etapa} de ${colaboradorNome} registrada.`);
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao registrar avaliação de experiência.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash],
  );

  const dispensarAvaliacaoExperienciaFn = useCallback(
    async (colaboradorNome: string, motivo: string) => {
      const dispensa: DispensaAvaliacaoExperiencia = {
        colaboradorNome,
        motivo,
        dispensadoPor: me,
        dispensadoEm: new Date().toISOString(),
      };
      try {
        await criarDispensaAvaliacaoExperienciaNoSupabase(colaboradorNome, motivo, me);
        dispatch({ type: "CRIAR_DISPENSA_AVALIACAO_EXPERIENCIA", dispensa });
        flash(`${colaboradorNome} dispensado(a) da avaliação de experiência.`);
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao registrar dispensa de avaliação de experiência.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash],
  );

  const atualizarConfigAvaliacaoDesempenhoFn = useCallback(
    async (config: Omit<ConfigAvaliacaoDesempenho, "updatedAt" | "updatedBy">) => {
      // Validação de negócio, independente de UI — bloqueia qualquer soma
      // diferente de 100%, nota mínima ou limiares da Matriz 9 Box fora da
      // escala, antes de sequer tentar gravar, não importa por onde esta
      // função seja chamada (ver validarConfigAvaliacaoDesempenho()/
      // validarNotaMinimaPdi()/validarLimiaresMatriz9Box()).
      const validacaoPesos = validarConfigAvaliacaoDesempenho(config.pesoKpis, config.pesoComportamental);
      if (!validacaoPesos.ok) {
        flash(validacaoPesos.error);
        return { ok: false as const };
      }
      const validacaoNota = validarNotaMinimaPdi(config.notaMinimaPdi);
      if (!validacaoNota.ok) {
        flash(validacaoNota.error);
        return { ok: false as const };
      }
      const validacaoDesempenho = validarLimiaresMatriz9Box(config.matrizDesempenhoLimiteMedio, config.matrizDesempenhoLimiteAlto);
      if (!validacaoDesempenho.ok) {
        flash(validacaoDesempenho.error);
        return { ok: false as const };
      }
      const validacaoPotencial = validarLimiaresMatriz9Box(config.matrizPotencialLimiteMedio, config.matrizPotencialLimiteAlto);
      if (!validacaoPotencial.ok) {
        flash(validacaoPotencial.error);
        return { ok: false as const };
      }
      try {
        await atualizarConfigAvaliacaoDesempenhoNoSupabase(config, me);
        dispatch({
          type: "ATUALIZAR_CONFIG_AVALIACAO_DESEMPENHO",
          config: { ...config, updatedAt: new Date().toISOString(), updatedBy: me },
        });
        flash("Configuração da Avaliação de Desempenho atualizada.");
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao atualizar configuração da Avaliação de Desempenho.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash],
  );

  /** Headcount Planejado — único indicador manual do Dashboard Executivo,
   * RH-only. */
  const atualizarConfigDashboardFn = useCallback(
    async (headcountPlanejado: number) => {
      if (perfil !== "RH") {
        flash("Só o RH pode atualizar o Headcount Planejado.");
        return { ok: false as const };
      }
      if (!Number.isFinite(headcountPlanejado) || headcountPlanejado < 0) {
        flash("Headcount Planejado precisa ser um número maior ou igual a zero.");
        return { ok: false as const };
      }
      try {
        await atualizarConfigDashboardNoSupabase(headcountPlanejado, me);
        dispatch({
          type: "ATUALIZAR_CONFIG_DASHBOARD",
          config: { headcountPlanejado, updatedAt: new Date().toISOString(), updatedBy: me },
        });
        flash("Headcount Planejado atualizado.");
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao atualizar o Headcount Planejado.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash, perfil],
  );

  /** RH-only. Registra os reajustes já validados (ver ReajusteSalarialTab.tsx
   * — só linhas "elegivel" chegam aqui) — a checagem de duplicidade final é
   * feita de novo no repositório (contra o Supabase, não o estado local),
   * mesmo padrão de criarAvaliacoesPotencial(). */
  const aplicarReajustesSalariaisFn = useCallback(
    async (reajustes: ReajusteSalarial[]) => {
      if (perfil !== "RH") {
        flash("Só o RH pode aplicar reajustes salariais.");
        return { ok: false as const };
      }
      if (reajustes.length === 0) return { ok: false as const };
      try {
        const criados = await criarReajustesSalariaisNoSupabase(reajustes);
        if (criados.length > 0) dispatch({ type: "ADICIONAR_REAJUSTES_SALARIAIS", reajustes: criados });
        const duplicados = reajustes.length - criados.length;
        flash(
          duplicados > 0
            ? `${criados.length} reajuste(s) aplicado(s) — ${duplicados} já existiam e foram ignorados.`
            : `${criados.length} reajuste(s) aplicado(s).`,
        );
        return { ok: true as const, criados: criados.length, duplicados };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao aplicar reajustes salariais.");
        return { ok: false as const };
      }
    },
    [dispatch, flash, perfil],
  );

  const salvarCompetenciaComportamentalFn = useCallback(
    async (competencia: CompetenciaComportamental) => {
      try {
        await salvarCompetenciaComportamentalNoSupabase(competencia, me);
        dispatch({
          type: "SALVAR_COMPETENCIA_COMPORTAMENTAL",
          competencia: { ...competencia, updatedAt: new Date().toISOString(), updatedBy: me },
        });
        flash("Competência comportamental salva.");
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao salvar competência comportamental.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash],
  );

  const criarKpiCargoFn = useCallback(
    async (kpi: Omit<KpiCargo, "id" | "updatedAt" | "updatedBy">) => {
      try {
        const criado = await criarKpiCargoNoSupabase(kpi, me);
        dispatch({ type: "CRIAR_KPI_CARGO", kpi: criado });
        flash(`KPI "${kpi.nomeIndicador}" cadastrado para ${kpi.cargoNome}.`);
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao cadastrar KPI.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash],
  );

  const atualizarKpiCargoFn = useCallback(
    async (kpi: KpiCargo) => {
      try {
        await atualizarKpiCargoNoSupabase(kpi, me);
        dispatch({ type: "ATUALIZAR_KPI_CARGO", kpi: { ...kpi, updatedAt: new Date().toISOString(), updatedBy: me } });
        flash("KPI atualizado.");
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao atualizar KPI.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash],
  );

  const excluirKpiCargoFn = useCallback(
    async (id: number) => {
      try {
        await excluirKpiCargoNoSupabase(id);
        dispatch({ type: "EXCLUIR_KPI_CARGO", id });
        flash("KPI excluído.");
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao excluir KPI.");
        return { ok: false as const };
      }
    },
    [dispatch, flash],
  );

  const criarCicloAvaliacaoDesempenhoFn = useCallback(
    async (form: NovoCicloAvaliacaoForm) => {
      const agora = new Date().toISOString();
      const ciclo: CicloAvaliacaoDesempenho = {
        id: gerarIdCicloAvaliacaoDesempenho(),
        nome: form.nome.trim(),
        periodoReferencia: form.periodoReferencia.trim(),
        dataInicio: form.dataInicio,
        dataEncerramento: form.dataEncerramento,
        dataCorteAdmissao: form.dataCorteAdmissao,
        status: "Aberto",
        criadoPor: me,
        criadoEm: agora,
      };

      // Elegibilidade: ativo + admissão em ou antes da data de corte definida
      // pelo RH neste ciclo — quem não passa não recebe nenhuma ficha, só um
      // registro no log de auditoria com o motivo.
      const naoElegiveis: { nome: string; motivo: string }[] = [];
      const elegiveis: Colaborador[] = [];
      for (const c of state.colaboradores) {
        const resultado = elegivelParaCicloAvaliacaoDesempenho(c, ciclo.dataCorteAdmissao!);
        if (resultado.elegivel) elegiveis.push(c);
        else naoElegiveis.push({ nome: c.nome, motivo: resultado.motivo ?? "Não elegível" });
      }

      const competenciasComportamentaisAtivas = state.competenciasComportamentais.filter(
        (c) => c.ativo && c.categoria !== "Lideranca",
      );
      const competenciasLiderancaAtivas = state.competenciasComportamentais.filter(
        (c) => c.ativo && c.categoria === "Lideranca",
      );

      function snapshotComportamental(competencias: CompetenciaComportamental[]) {
        return competencias.map((comp) => ({
          competenciaId: comp.id,
          competenciaNome: comp.nome,
          competenciaDescricao: comp.descricao,
          afirmacoes: [...comp.afirmacoes],
          notasAfirmacoes: comp.afirmacoes.map(() => null),
        }));
      }

      function snapshotKpis(kpis: KpiCargo[]) {
        return kpis.map((k) => ({
          kpiId: k.id,
          kpiNome: k.nomeIndicador,
          kpiDescricao: k.observacao,
          meta: k.meta,
          unidadeMedida: k.unidadeMedida,
          sentidoMeta: k.sentidoMeta,
          peso: k.peso,
          resultado: null,
        }));
      }

      // Snapshot da estrutura organizacional e do catálogo no momento da
      // criação — não é recalculado depois, mesmo que o colaborador seja
      // promovido/mude de gestor ou o catálogo mude (ver comentário em
      // types/domain.ts). Colaborador sem gestor cadastrado nasce com
      // gestorAvaliador vazio na ficha GESTOR — só o RH enxerga essa ficha —
      // e não recebe ficha LIDERANCA (não existe gestor pra avaliar).
      // Avaliação de Potencial (Etapa 4) — módulo independente, gerado junto
      // com a AVD pra cada colaborador elegível (mesma regra de
      // elegibilidade), sempre (mesmo sem gestor, igual à ficha GESTOR).
      // Nunca compõe nota_final/media_* da AVD nem o PDI.
      const avaliacoesPotencial: AvaliacaoPotencial[] = elegiveis.map((c) => ({
        id: gerarIdAvaliacaoPotencial(),
        cicloId: ciclo.id,
        ciclo: ciclo.nome,
        colaboradorNome: c.nome,
        cargo: c.cargo,
        departamento: c.depto,
        gestorAvaliador: c.gestor || "",
        respostas: PERGUNTAS_POTENCIAL.map((p) => ({ perguntaId: p.id, pergunta: p.pergunta, nota: null })),
        comentario: "",
        status: "Não iniciada",
        notaPotencial: null,
        statusCalibracao: "Não iniciada",
        notaPotencialCalibrada: null,
        notaOficial: null,
        justificativaCalibracao: "",
        calibradoPor: "",
        calibradoEm: null,
        homologadoPor: "",
        homologadoEm: null,
        concluidoPor: "",
        concluidoEm: null,
        criadoEm: agora,
        updatedAt: agora,
      }));

      const avaliacoes: AvaliacaoDesempenho[] = [];
      for (const c of elegiveis) {
        const kpisDoCargo = state.kpisCargo.filter((k) => k.cargoNome === c.cargo);
        const base = {
          cicloId: ciclo.id,
          ciclo: ciclo.nome,
          cargo: c.cargo,
          departamento: c.depto,
          status: "Não iniciada" as const,
          comentarioComportamental: "",
          comentarioTecnico: "",
          comentarioGeral: "",
          avaliadoPor: "",
          concluidoPor: "",
          concluidoEm: null,
          notaFinal: null,
          mediaTecnica: null,
          mediaComportamental: null,
          statusCalibracao: "Não iniciada" as const,
          mediaComportamentalCalibrada: null,
          notaFinalOficial: null,
          justificativaCalibracao: "",
          calibradoPor: "",
          calibradoEm: null,
          homologadoPor: "",
          homologadoEm: null,
          devolutivaRealizada: false,
          devolutivaPor: "",
          devolutivaEm: null,
          criadoEm: agora,
          updatedAt: agora,
        };

        avaliacoes.push({
          ...base,
          id: gerarIdAvaliacaoDesempenho(),
          tipo: "AUTOAVALIACAO",
          colaboradorNome: c.nome,
          avaliado: c.nome,
          gestorAvaliador: c.nome,
          resultadosComportamentais: snapshotComportamental(competenciasComportamentaisAtivas),
          resultadosKpis: snapshotKpis(kpisDoCargo),
        });

        avaliacoes.push({
          ...base,
          id: gerarIdAvaliacaoDesempenho(),
          tipo: "GESTOR",
          colaboradorNome: c.nome,
          avaliado: c.nome,
          gestorAvaliador: c.gestor || "",
          resultadosComportamentais: snapshotComportamental(competenciasComportamentaisAtivas),
          resultadosKpis: snapshotKpis(kpisDoCargo),
        });

        if (c.gestor) {
          avaliacoes.push({
            ...base,
            id: gerarIdAvaliacaoDesempenho(),
            tipo: "LIDERANCA",
            colaboradorNome: c.nome,
            avaliado: c.gestor,
            gestorAvaliador: c.nome,
            resultadosComportamentais: snapshotComportamental(competenciasLiderancaAtivas),
            resultadosKpis: [],
          });
        }
      }

      try {
        const { avaliacoesCriadas, duplicadas } = await criarCicloComAvaliacoesNoSupabase(ciclo, avaliacoes);
        dispatch({ type: "CRIAR_CICLO_AVALIACAO_DESEMPENHO", ciclo, avaliacoes: avaliacoesCriadas });
        flash(
          duplicadas > 0
            ? `Ciclo "${ciclo.nome}" aberto — ${avaliacoesCriadas.length} avaliação(ões) gerada(s) (${duplicadas} já existentes ignoradas).`
            : `Ciclo "${ciclo.nome}" aberto — ${avaliacoesCriadas.length} avaliação(ões) gerada(s)${naoElegiveis.length > 0 ? `, ${naoElegiveis.length} colaborador(es) não elegível(is)` : ""}.`,
        );
        void registrarLogAvaliacaoDesempenhoNoSupabase({ cicloId: ciclo.id, acao: "CICLO_CRIADO", usuario: me });
        void registrarLogAvaliacaoDesempenhoNoSupabase({
          cicloId: ciclo.id,
          acao: "AVALIACOES_GERADAS",
          detalhe: `${avaliacoesCriadas.length} avaliação(ões) geradas`,
          usuario: me,
        });
        for (const item of naoElegiveis) {
          void registrarLogAvaliacaoDesempenhoNoSupabase({
            cicloId: ciclo.id,
            acao: "COLABORADOR_NAO_ELEGIVEL",
            detalhe: `${item.nome}: ${item.motivo}`,
            usuario: me,
          });
        }

        // 3º passo sequencial, best-effort: gerar as Avaliações de Potencial
        // do ciclo. Falhar aqui não desfaz a abertura do ciclo nem as
        // avaliações da AVD já criadas — só avisa (mesmo espírito do
        // gerarPdiSeNecessario() em salvarAvaliacaoDesempenhoFn).
        try {
          const potencialCriadas = await criarAvaliacoesPotencialNoSupabase(avaliacoesPotencial);
          if (potencialCriadas.length > 0) {
            dispatch({ type: "CRIAR_AVALIACOES_POTENCIAL", avaliacoes: potencialCriadas });
          }
          void registrarLogAvaliacaoDesempenhoNoSupabase({
            cicloId: ciclo.id,
            acao: "POTENCIAL_GERADO",
            detalhe: `${potencialCriadas.length} avaliação(ões) de potencial geradas`,
            usuario: me,
          });
        } catch (err) {
          flash(
            err instanceof Error
              ? `Ciclo aberto, mas falhou ao gerar avaliações de potencial: ${err.message}`
              : "Ciclo aberto, mas falhou ao gerar avaliações de potencial.",
          );
        }

        return { ok: true as const, quantidade: avaliacoesCriadas.length };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao abrir ciclo de avaliação de desempenho.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash, state.colaboradores, state.competenciasComportamentais, state.kpisCargo],
  );

  const encerrarCicloAvaliacaoDesempenhoFn = useCallback(
    async (id: string) => {
      try {
        await encerrarCicloNoSupabase(id);
        dispatch({ type: "ENCERRAR_CICLO_AVALIACAO_DESEMPENHO", id });
        flash("Ciclo encerrado — as avaliações vinculadas não aceitam mais edição.");
        void registrarLogAvaliacaoDesempenhoNoSupabase({ cicloId: id, acao: "CICLO_ENCERRADO", usuario: me });
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao encerrar ciclo de avaliação de desempenho.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash],
  );

  /** Comitê de Calibração (Etapa 6) — quando a ficha GESTOR e a ficha de
   * Potencial de um mesmo colaborador/ciclo estão AMBAS "Concluída" (pelo
   * gestor) e nenhuma delas já entrou no fluxo de calibração, as duas viram
   * "Aguardando Calibração" juntas. Best-effort — uma falha aqui não desfaz
   * a conclusão que disparou a checagem, só avisa (mesmo espírito do
   * gerarPdiSeNecessario). Quem acabou de ser salvo é passado direto (não
   * relido de `state`, que ainda não reflete um dispatch em andamento na
   * mesma execução) — só o lado QUE NÃO acabou de ser salvo é lido de
   * `state` (correto ali, pois reflete uma conclusão anterior já renderizada). */
  const verificarEIniciarCalibracaoFn = useCallback(
    async (
      avdRecemSalva: AvaliacaoDesempenho | null,
      potencialRecemSalva: AvaliacaoPotencial | null,
      colaboradorNome: string,
      cicloId: string,
    ) => {
      const avd =
        avdRecemSalva ?? state.avaliacoesDesempenho.find((a) => a.tipo === "GESTOR" && a.colaboradorNome === colaboradorNome && a.cicloId === cicloId);
      const potencial = potencialRecemSalva ?? state.avaliacoesPotencial.find((a) => a.colaboradorNome === colaboradorNome && a.cicloId === cicloId);
      if (!avd || !potencial) return;
      if (avd.status !== "Concluída" || potencial.status !== "Concluída") return;
      if (avd.statusCalibracao !== "Não iniciada" || potencial.statusCalibracao !== "Não iniciada") return;

      const avdAtualizada: AvaliacaoDesempenho = { ...avd, statusCalibracao: "Aguardando Calibração" };
      const potencialAtualizada: AvaliacaoPotencial = { ...potencial, statusCalibracao: "Aguardando Calibração" };
      try {
        await atualizarAvaliacaoDesempenhoNoSupabase(avdAtualizada);
        dispatch({ type: "ATUALIZAR_AVALIACAO_DESEMPENHO", avaliacao: avdAtualizada });
        await atualizarAvaliacaoPotencialNoSupabase(potencialAtualizada);
        dispatch({ type: "ATUALIZAR_AVALIACAO_POTENCIAL", avaliacao: potencialAtualizada });
        void registrarLogAvaliacaoDesempenhoNoSupabase({
          cicloId,
          avaliacaoId: avdAtualizada.id,
          acao: "AGUARDANDO_CALIBRACAO",
          detalhe: colaboradorNome,
          usuario: me,
        });
      } catch (err) {
        flash(err instanceof Error ? `Falha ao iniciar a calibração de ${colaboradorNome}: ${err.message}` : `Falha ao iniciar a calibração de ${colaboradorNome}.`);
      }
    },
    [dispatch, me, flash, state.avaliacoesDesempenho, state.avaliacoesPotencial],
  );

  /** RH-only — sem checagem de ciclo encerrado (mesma decisão do reabrir do
   * Potencial: a autoridade de correção do RH não fica presa a um lock
   * pensado pro gestor). Só a ficha GESTOR é calibrável — AUTOAVALIACAO/
   * LIDERANCA nunca saem de "Não iniciada" em statusCalibracao. */
  const podeCalibrarAvaliacaoDesempenhoFn = useCallback(
    (avaliacao: AvaliacaoDesempenho) => perfil === "RH" && avaliacao.tipo === "GESTOR" && avaliacao.statusCalibracao === "Aguardando Calibração",
    [perfil],
  );

  /** A média comportamental oficial de uma ficha GESTOR consolida também a
   * ficha AUTOAVALIACAO já concluída do mesmo colaborador/ciclo (ver
   * mediaComportamentalConsolidada em domain/avaliacaoDesempenho.ts — a
   * LIDERANCA nunca entra nessa conta). Se a GESTOR já estava "Concluída"
   * quando a Autoavaliação conclui DEPOIS, nada recalcularia a GESTOR de
   * novo sozinho — mesma classe de bug (edge-triggered) já corrigida nesta
   * sessão para o disparo da calibração. Aqui, sempre que a Autoavaliação
   * conclui, a GESTOR irmã é recalculada com os dados mais atuais. Só mexe
   * enquanto a GESTOR ainda não foi "Homologada" —
   * "Aguardando Calibração" é só uma fila de revisão do Comitê (RH ainda
   * não decidiu nada sobre esse número), então recalcular aí é seguro e
   * esperado; só depois de Homologada existe uma decisão registrada
   * (nota_final_oficial/homologado_por/homologado_em) que não deve ser
   * mexida em silêncio — aí a correção é manual/RH pontual. Best-effort —
   * falha aqui não desfaz o salvamento que disparou a checagem. */
  const recalcularGestorSeNecessarioFn = useCallback(
    async (colaboradorNome: string, cicloId: string) => {
      const gestor = state.avaliacoesDesempenho.find(
        (a) => a.tipo === "GESTOR" && a.colaboradorNome === colaboradorNome && a.cicloId === cicloId,
      );
      if (!gestor || gestor.status !== "Concluída" || gestor.statusCalibracao === "Homologada") return;

      const irmas = fichasIrmasDe(state.avaliacoesDesempenho, gestor);
      const { mediaComportamental: novaMedia, notaFinal: novaNota } = calcularNotasAvaliacao(
        gestor,
        state.kpisCargo,
        state.configAvaliacaoDesempenho,
        irmas,
      );
      if (novaMedia === gestor.mediaComportamental && novaNota === gestor.notaFinal) return;

      const atualizado: AvaliacaoDesempenho = { ...gestor, mediaComportamental: novaMedia, notaFinal: novaNota };
      try {
        await atualizarAvaliacaoDesempenhoNoSupabase(atualizado);
        dispatch({ type: "ATUALIZAR_AVALIACAO_DESEMPENHO", avaliacao: atualizado });
      } catch (err) {
        flash(
          err instanceof Error
            ? `Falha ao atualizar a nota comportamental de ${colaboradorNome}: ${err.message}`
            : `Falha ao atualizar a nota comportamental de ${colaboradorNome}.`,
        );
      }
    },
    [dispatch, flash, state.avaliacoesDesempenho, state.kpisCargo, state.configAvaliacaoDesempenho],
  );

  const salvarAvaliacaoDesempenhoFn = useCallback(
    async (avaliacao: AvaliacaoDesempenho) => {
      const anterior = state.avaliacoesDesempenho.find((a) => a.id === avaliacao.id);
      // Ponto único de cálculo — o mesmo usado no preview do Drawer e na
      // lista de Avaliações, pra nota exibida e nota gravada serem sempre
      // idênticas (ver calcularNotasAvaliacao() em domain/avaliacaoDesempenho.ts).
      const { mediaTecnica: mediaTecnicaValor, mediaComportamental: mediaComportamentalValor, notaFinal: notaFinalValor } =
        calcularNotasAvaliacao(avaliacao, state.kpisCargo, state.configAvaliacaoDesempenho, fichasIrmasDe(state.avaliacoesDesempenho, avaliacao));
      // "Concluída" trava — concluidoPor/Em só são gravados na transição, nunca
      // recalculados depois (preserva quem/quando concluiu de fato).
      const concluindoAgora = avaliacao.status === "Concluída" && anterior?.status !== "Concluída";
      const atualizado: AvaliacaoDesempenho = {
        ...avaliacao,
        mediaTecnica: mediaTecnicaValor,
        mediaComportamental: mediaComportamentalValor,
        notaFinal: notaFinalValor,
        concluidoPor: concluindoAgora ? me : anterior?.concluidoPor ?? avaliacao.concluidoPor,
        concluidoEm: concluindoAgora ? new Date().toISOString() : anterior?.concluidoEm ?? avaliacao.concluidoEm,
      };
      try {
        await atualizarAvaliacaoDesempenhoNoSupabase(atualizado);
        dispatch({ type: "ATUALIZAR_AVALIACAO_DESEMPENHO", avaliacao: atualizado });
        flash(atualizado.status === "Concluída" ? "Avaliação concluída." : "Progresso da avaliação salvo.");

        const iniciandoAgora = anterior?.status === "Não iniciada" && atualizado.status !== "Não iniciada";
        const acao = concluindoAgora ? "AVALIACAO_CONCLUIDA" : iniciandoAgora ? "AVALIACAO_INICIADA" : "AVALIACAO_SALVA";
        void registrarLogAvaliacaoDesempenhoNoSupabase({ cicloId: atualizado.cicloId, avaliacaoId: atualizado.id, acao, usuario: me });

        // PDI é gerado automaticamente só na 1ª conclusão de uma avaliação
        // GESTOR (nota oficial da AVD) — nunca por AUTOAVALIACAO/LIDERANCA.
        if (concluindoAgora && atualizado.tipo === "GESTOR") {
          void gerarPdiSeNecessario(atualizado);
        }
        // Comitê de Calibração (Etapa 6) — verifica se a ficha de Potencial
        // irmã (mesmo colaborador/ciclo) também já foi concluída; se sim, as
        // duas viram "Aguardando Calibração" juntas. Corrigido pra rodar
        // sempre que esta ficha estiver "Concluída" e ainda "Não iniciada"
        // em calibração — não só na transição exata pra "Concluída"
        // (`concluindoAgora`). Antes, se a ficha de Potencial irmã só fosse
        // concluída depois — ou se esta ficha chegasse a "Concluída" por um
        // caminho que não passasse por `concluindoAgora` nesta mesma
        // chamada (ex.: correção manual/RH direto no banco) — o par nunca
        // era reavaliado de novo e ficava preso em "Não iniciada" pra
        // sempre, mesmo com as duas fichas já concluídas (bug real
        // reportado pelo RH). Passa `atualizado` direto (não relê de
        // `state`, que ainda reflete o valor pré-dispatch nesta mesma
        // execução — só o lado da Potencial é lido de `state`).
        if (atualizado.tipo === "GESTOR" && atualizado.status === "Concluída" && atualizado.statusCalibracao === "Não iniciada") {
          void verificarEIniciarCalibracaoFn(atualizado, null, atualizado.colaboradorNome, atualizado.cicloId);
        }
        // A GESTOR já pode ter sido concluída antes da Autoavaliação — a
        // média comportamental oficial da AVD agora depende também dela
        // (ver comentário de recalcularGestorSeNecessarioFn; LIDERANCA nunca
        // entra nessa conta, então concluir uma LIDERANCA não precisa disparar nada aqui).
        if (concluindoAgora && atualizado.tipo === "AUTOAVALIACAO") {
          void recalcularGestorSeNecessarioFn(atualizado.colaboradorNome, atualizado.cicloId);
        }

        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao salvar avaliação de desempenho.");
        return { ok: false as const };
      }

      // Identifica competências comportamentais/KPIs abaixo da nota mínima
      // configurável e monta o PDI (cabeçalho sempre criado, mesmo com zero
      // itens) — objetivo/ações vêm da biblioteca do RH quando existe um
      // modelo pra essa competência, senão um texto genérico. A
      // duplicidade é checada no repositório (consulta o Supabase direto,
      // não o estado local — protege contra RH+gestor concluindo a mesma
      // avaliação quase ao mesmo tempo).
      async function gerarPdiSeNecessario(avaliacaoConcluida: AvaliacaoDesempenho) {
        const kpisPorId = new Map(state.kpisCargo.map((k) => [k.id, k]));
        const notaMinima = state.configAvaliacaoDesempenho?.notaMinimaPdi ?? 3;
        const agora = new Date().toISOString();
        const itens: PdiItem[] = [];

        for (const resultado of avaliacaoConcluida.resultadosComportamentais) {
          const media = mediaAfirmacoes(resultado.notasAfirmacoes);
          if (media === null || media >= notaMinima) continue;
          const itemId = gerarIdPdiItem();
          const { objetivo, acoesSugeridas } = sugerirObjetivoEAcoes(
            resultado.competenciaId,
            "Comportamental",
            resultado.competenciaNome,
            state.pdiBiblioteca,
          );
          itens.push({
            id: itemId,
            pdiId: 0, // placeholder — o repositório substitui pelo id real após criar o cabeçalho
            competenciaId: resultado.competenciaId,
            competenciaNome: resultado.competenciaNome,
            tipoCompetencia: "Comportamental",
            notaObtida: arredondar(media),
            origemManual: false,
            objetivoDesenvolvimento: objetivo,
            responsavel: "",
            dataInicio: null,
            dataPrevistaConclusao: null,
            status: "Não iniciada",
            observacoes: "",
            ordem: itens.length,
            acoes: acoesSugeridas.map((descricao, i) => ({
              id: gerarIdPdiAcao(),
              itemId,
              descricao,
              responsavel: "",
              prazo: null,
              status: "Não iniciada",
              ordem: i,
              evidenciaStoragePath: null,
              evidenciaFileName: null,
              evidenciaUploadedEm: null,
              evidenciaUploadedPor: null,
              criadoEm: agora,
              updatedAt: agora,
            })),
            criadoEm: agora,
            updatedAt: agora,
          });
        }

        for (const resultado of avaliacaoConcluida.resultadosKpis) {
          const kpi = kpisPorId.get(resultado.kpiId);
          const nota = notaKpi(resultado, kpi);
          if (nota === null || nota >= notaMinima) continue;
          const nomeKpi = resultado.kpiNome || kpi?.nomeIndicador || `KPI #${resultado.kpiId}`;
          const itemId = gerarIdPdiItem();
          const { objetivo, acoesSugeridas } = sugerirObjetivoEAcoes(nomeKpi, "Tecnica", nomeKpi, state.pdiBiblioteca);
          itens.push({
            id: itemId,
            pdiId: 0,
            competenciaId: "",
            competenciaNome: nomeKpi,
            tipoCompetencia: "Tecnica",
            notaObtida: nota,
            origemManual: false,
            objetivoDesenvolvimento: objetivo,
            responsavel: "",
            dataInicio: null,
            dataPrevistaConclusao: null,
            status: "Não iniciada",
            observacoes: "",
            ordem: itens.length,
            acoes: acoesSugeridas.map((descricao, i) => ({
              id: gerarIdPdiAcao(),
              itemId,
              descricao,
              responsavel: "",
              prazo: null,
              status: "Não iniciada",
              ordem: i,
              evidenciaStoragePath: null,
              evidenciaFileName: null,
              evidenciaUploadedEm: null,
              evidenciaUploadedPor: null,
              criadoEm: agora,
              updatedAt: agora,
            })),
            criadoEm: agora,
            updatedAt: agora,
          });
        }

        const novoPdi: Pdi = {
          id: 0, // placeholder — o repositório substitui pelo id bigint gerado pelo Supabase
          colaboradorNome: avaliacaoConcluida.colaboradorNome,
          cicloId: avaliacaoConcluida.cicloId,
          ciclo: avaliacaoConcluida.ciclo,
          avaliacaoId: avaliacaoConcluida.id,
          gestorResponsavel: avaliacaoConcluida.gestorAvaliador,
          status: "Não iniciado",
          comentarios: "",
          concluidoPor: "",
          concluidoEm: null,
          itens,
          criadoEm: agora,
          updatedAt: agora,
        };

        try {
          const criado = await criarPdiNoSupabase(novoPdi);
          if (!criado) return; // já existia (corrida RH+gestor concluindo quase ao mesmo tempo)
          dispatch({ type: "CRIAR_PDI", pdi: criado });
          void registrarLogAvaliacaoDesempenhoNoSupabase({
            cicloId: criado.cicloId,
            avaliacaoId: criado.avaliacaoId,
            acao: "PDI_GERADO",
            detalhe: `${itens.length} item(ns) de desenvolvimento`,
            usuario: me,
          });
        } catch (err) {
          flash(err instanceof Error ? err.message : "Falha ao gerar o PDI automaticamente.");
        }
      }
    },
    [
      dispatch,
      me,
      flash,
      state.avaliacoesDesempenho,
      state.kpisCargo,
      state.configAvaliacaoDesempenho,
      state.pdiBiblioteca,
      verificarEIniciarCalibracaoFn,
      recalcularGestorSeNecessarioFn,
    ],
  );

  const podeReabrirAvaliacaoDesempenhoFn = useCallback(
    (avaliacao: AvaliacaoDesempenho) => perfil === "RH" && avaliacao.status === "Concluída" && avaliacao.statusCalibracao === "Não iniciada",
    [perfil],
  );

  /** Devolve uma ficha "Concluída" pra "Em andamento" pra quem preenche (o
   * `gestorAvaliador`, ver comentário na interface) poder corrigir alguma
   * informação — só o status/concluidoPor/concluidoEm da própria ficha
   * mudam; nota, cargo/departamento (snapshot) e o cadastro em
   * `colaboradores` não são tocados. Uma vez que a ficha entra em
   * calibração (Etapa 6), a correção passa a ser responsabilidade da aba
   * Calibração — este caminho fecha (mesmo padrão de reabrirAvaliacaoPotencial). */
  const reabrirAvaliacaoDesempenhoFn = useCallback(
    async (avaliacao: AvaliacaoDesempenho) => {
      if (!podeReabrirAvaliacaoDesempenhoFn(avaliacao)) {
        flash("Esta avaliação não pode ser reaberta por aqui — se já estiver em calibração, use a aba Calibração.");
        return { ok: false as const };
      }
      const reaberta: AvaliacaoDesempenho = { ...avaliacao, status: "Em andamento", concluidoPor: "", concluidoEm: null };
      try {
        await atualizarAvaliacaoDesempenhoNoSupabase(reaberta);
        dispatch({ type: "ATUALIZAR_AVALIACAO_DESEMPENHO", avaliacao: reaberta });
        flash("Avaliação reaberta para edição.");
        void registrarLogAvaliacaoDesempenhoNoSupabase({
          cicloId: reaberta.cicloId,
          avaliacaoId: reaberta.id,
          acao: "AVALIACAO_DESEMPENHO_REABERTA",
          usuario: me,
        });
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao reabrir avaliação.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash, podeReabrirAvaliacaoDesempenhoFn],
  );

  /** Salva um PDI (comentários, itens/ações, mudança de status, conclusão)
   * — um só ponto pra tudo, igual salvarAvaliacaoDesempenho. Detecta a
   * transição pra "Concluído" e grava concluidoPor/Em só nesse momento.
   * `pdi.updatedAt` (o valor lido por último) vai pro repositório como
   * trava de concorrência otimista — se alguém salvou por cima entre a
   * leitura e esta gravação, PdiConflitoError avisa em vez de apagar o
   * trabalho da outra pessoa (ver salvarPdi() em pdiRepository.ts). */
  const salvarPdiFn = useCallback(
    async (pdi: Pdi) => {
      const anterior = state.pdi.find((p) => p.id === pdi.id);
      const concluindoAgora = pdi.status === "Concluído" && anterior?.status !== "Concluído";
      const atualizado: Pdi = {
        ...pdi,
        concluidoPor: concluindoAgora ? me : anterior?.concluidoPor ?? pdi.concluidoPor,
        concluidoEm: concluindoAgora ? new Date().toISOString() : anterior?.concluidoEm ?? pdi.concluidoEm,
      };
      try {
        const salvo = await salvarPdiNoSupabase(atualizado, pdi.updatedAt);
        dispatch({ type: "ATUALIZAR_PDI", pdi: salvo });
        flash(concluindoAgora ? "PDI concluído." : "PDI salvo.");
        void registrarLogAvaliacaoDesempenhoNoSupabase({
          cicloId: salvo.cicloId,
          avaliacaoId: salvo.avaliacaoId,
          acao: concluindoAgora ? "PDI_CONCLUIDO" : "PDI_SALVO",
          usuario: me,
        });
        return { ok: true as const, pdi: salvo };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao salvar o PDI.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash, state.pdi],
  );

  const reabrirPdiFn = useCallback(
    async (pdi: Pdi) => {
      if (perfil !== "RH") {
        flash("Só o RH pode reabrir um PDI.");
        return { ok: false as const };
      }
      const reaberto: Pdi = { ...pdi, status: "Em andamento", concluidoPor: "", concluidoEm: null };
      try {
        const salvo = await salvarPdiNoSupabase(reaberto, pdi.updatedAt);
        dispatch({ type: "ATUALIZAR_PDI", pdi: salvo });
        flash("PDI reaberto.");
        void registrarLogAvaliacaoDesempenhoNoSupabase({ cicloId: salvo.cicloId, avaliacaoId: salvo.avaliacaoId, acao: "PDI_REABERTO", usuario: me });
        return { ok: true as const, pdi: salvo };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao reabrir o PDI.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash, perfil],
  );

  const salvarItemBibliotecaPdiFn = useCallback(
    async (item: PdiBibliotecaItem) => {
      try {
        await salvarItemBibliotecaNoSupabase(item, me);
        dispatch({ type: "SALVAR_ITEM_BIBLIOTECA_PDI", item: { ...item, updatedAt: new Date().toISOString(), updatedBy: me } });
        flash("Modelo salvo na biblioteca de PDI.");
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao salvar modelo da biblioteca de PDI.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash],
  );

  const excluirItemBibliotecaPdiFn = useCallback(
    async (chave: string, tipoCompetencia: TipoCompetenciaPdi) => {
      try {
        await excluirItemBibliotecaNoSupabase(chave, tipoCompetencia);
        dispatch({ type: "EXCLUIR_ITEM_BIBLIOTECA_PDI", chave, tipoCompetencia });
        flash("Modelo removido da biblioteca de PDI.");
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao remover modelo da biblioteca de PDI.");
        return { ok: false as const };
      }
    },
    [dispatch, flash],
  );

  /** Feedback (Gestão de Desempenho → Desenvolvimento → Feedback) — histórico
   * contínuo de gestão, deliberadamente independente de AVD/PDI/ciclo (ver
   * types/domain.ts > Feedback). Visibilidade e permissão pra registrar usam
   * a MESMA lista de liderados de sempre (`colaboradoresListagem`: RH/
   * Diretoria veem a empresa toda, Gestor só quem tem `gestor === me` hoje —
   * reaproveitado, nenhuma estrutura paralela de hierarquia criada aqui).
   * Colaborador nunca alcança esta função (a aba já é bloqueada em
   * GestaoDesempenhoPage.tsx), mas a checagem explícita aqui é defesa em
   * profundidade, mesmo padrão de colaboradoresParaMatriz9Box. */
  const feedbacksVisiveis = useMemo(() => {
    if (perfil === "Colaborador") return [];
    const nomesPermitidos = new Set(colaboradoresListagem.map((c) => c.nome));
    return state.feedbacks.filter((f) => nomesPermitidos.has(f.colaboradorNome));
  }, [state.feedbacks, colaboradoresListagem, perfil]);

  const podeRegistrarFeedbackFn = useCallback(
    (colaboradorNome: string) => perfil !== "Colaborador" && colaboradoresListagem.some((c) => c.nome === colaboradorNome),
    [perfil, colaboradoresListagem],
  );

  const registrarFeedbackFn = useCallback(
    async (input: { colaboradorNome: string; dataFeedback: string; tema: TemaFeedback; comentarios: string }) => {
      if (!podeRegistrarFeedbackFn(input.colaboradorNome)) {
        flash("Você só pode registrar feedback para colaboradores da sua equipe.");
        return { ok: false as const };
      }
      try {
        const feedback = await registrarFeedbackNoSupabase({ ...input, gestorNome: me });
        dispatch({ type: "CRIAR_FEEDBACK", feedback });
        flash("Feedback registrado.");
        return { ok: true as const, feedback };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao registrar feedback.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash, podeRegistrarFeedbackFn],
  );

  /** Salva uma Avaliação de Potencial (respostas/comentário, mudança de
   * status, conclusão) — um só ponto pra tudo, igual salvarAvaliacaoDesempenho.
   * Recalcula notaPotencial via calcularNotaPotencial() antes de gravar
   * (ponto único de cálculo, nunca recalculado em outro lugar). Detecta a
   * transição pra "Concluída" e grava concluidoPor/Em só nesse momento. */
  const salvarAvaliacaoPotencialFn = useCallback(
    async (avaliacao: AvaliacaoPotencial) => {
      const anterior = state.avaliacoesPotencial.find((a) => a.id === avaliacao.id);
      const notaPotencial = calcularNotaPotencial(avaliacao.respostas);
      const concluindoAgora = avaliacao.status === "Concluída" && anterior?.status !== "Concluída";
      const iniciandoAgora = anterior?.status === "Não iniciada" && avaliacao.status !== "Não iniciada";
      const atualizado: AvaliacaoPotencial = {
        ...avaliacao,
        notaPotencial,
        concluidoPor: concluindoAgora ? me : anterior?.concluidoPor ?? avaliacao.concluidoPor,
        concluidoEm: concluindoAgora ? new Date().toISOString() : anterior?.concluidoEm ?? avaliacao.concluidoEm,
      };
      try {
        await atualizarAvaliacaoPotencialNoSupabase(atualizado);
        dispatch({ type: "ATUALIZAR_AVALIACAO_POTENCIAL", avaliacao: atualizado });
        flash(concluindoAgora ? "Avaliação de potencial concluída." : "Progresso da avaliação de potencial salvo.");
        const acao = concluindoAgora ? "POTENCIAL_CONCLUIDA" : iniciandoAgora ? "POTENCIAL_INICIADA" : "POTENCIAL_SALVA";
        void registrarLogAvaliacaoDesempenhoNoSupabase({ cicloId: atualizado.cicloId, avaliacaoId: atualizado.id, acao, usuario: me });

        // Comitê de Calibração (Etapa 6) — ver comentário em salvarAvaliacaoDesempenhoFn
        // (mesma correção: roda sempre que "Concluída" + "Não iniciada" em
        // calibração, não só na transição exata, pra não ficar presa se a
        // ficha AVD irmã só completar depois ou por outro caminho).
        if (atualizado.status === "Concluída" && atualizado.statusCalibracao === "Não iniciada") {
          void verificarEIniciarCalibracaoFn(null, atualizado, atualizado.colaboradorNome, atualizado.cicloId);
        }

        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao salvar avaliação de potencial.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash, state.avaliacoesPotencial, verificarEIniciarCalibracaoFn],
  );

  /** RH-only — sem gate de ciclo encerrado (é o caminho de correção pra
   * uma ficha de potencial cujo ciclo já foi encerrado). Bloqueado assim
   * que a ficha entra no fluxo de calibração (achado da revisão da Etapa
   * 6 — ver podeEditarAvaliacaoPotencialFn): a partir daí, reabrir é
   * responsabilidade da aba Calibração, não deste caminho. */
  const reabrirAvaliacaoPotencialFn = useCallback(
    async (avaliacao: AvaliacaoPotencial) => {
      if (perfil !== "RH") {
        flash("Só o RH pode reabrir uma avaliação de potencial.");
        return { ok: false as const };
      }
      if (avaliacao.statusCalibracao !== "Não iniciada") {
        flash("Esta avaliação já está no fluxo de calibração — use a aba Calibração.");
        return { ok: false as const };
      }
      const reaberta: AvaliacaoPotencial = { ...avaliacao, status: "Em andamento", concluidoPor: "", concluidoEm: null };
      try {
        await atualizarAvaliacaoPotencialNoSupabase(reaberta);
        dispatch({ type: "ATUALIZAR_AVALIACAO_POTENCIAL", avaliacao: reaberta });
        flash("Avaliação de potencial reaberta.");
        void registrarLogAvaliacaoDesempenhoNoSupabase({ cicloId: reaberta.cicloId, avaliacaoId: reaberta.id, acao: "POTENCIAL_REABERTA", usuario: me });
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao reabrir avaliação de potencial.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash, perfil],
  );

  /** Homologa um par (ficha GESTOR + Avaliação de Potencial) — ação única
   * do Comitê de Calibração: RH define (ou deixa em branco, mantendo o
   * original) a média comportamental e/ou a nota de potencial calibradas,
   * justifica se alterou algo, e a Nota Oficial de cada uma é calculada e
   * gravada nas duas fichas de uma vez (calibradoPor/Em e homologadoPor/Em
   * = mesmo usuário/timestamp — não existe rascunho de calibração salvo
   * separadamente nesta implementação). RH-only, checado dentro da própria
   * função (mesmo padrão de reabrirAvaliacaoPotencialFn). */
  const homologarCalibracaoFn = useCallback(
    async (
      avaliacaoDesempenho: AvaliacaoDesempenho,
      avaliacaoPotencial: AvaliacaoPotencial,
      ajustes: { mediaComportamentalCalibrada: number | null; notaPotencialCalibrada: number | null; justificativa: string },
    ) => {
      if (perfil !== "RH") {
        flash("Só o RH pode homologar uma avaliação.");
        return { ok: false as const };
      }
      const validacao = validarCalibracao(
        avaliacaoDesempenho.mediaComportamental,
        ajustes.mediaComportamentalCalibrada,
        avaliacaoPotencial.notaPotencial,
        ajustes.notaPotencialCalibrada,
        ajustes.justificativa,
      );
      if (!validacao.ok) {
        flash(validacao.error);
        return { ok: false as const };
      }

      const agora = new Date().toISOString();
      const notaFinalOficial = calcularNotaOficialAvd(
        avaliacaoDesempenho.mediaTecnica,
        avaliacaoDesempenho.mediaComportamental,
        ajustes.mediaComportamentalCalibrada,
        state.configAvaliacaoDesempenho,
      );
      const notaOficial = calcularNotaOficialPotencial(avaliacaoPotencial.notaPotencial, ajustes.notaPotencialCalibrada);

      const avdHomologada: AvaliacaoDesempenho = {
        ...avaliacaoDesempenho,
        mediaComportamentalCalibrada: ajustes.mediaComportamentalCalibrada,
        notaFinalOficial,
        justificativaCalibracao: ajustes.justificativa,
        calibradoPor: me,
        calibradoEm: agora,
        homologadoPor: me,
        homologadoEm: agora,
        statusCalibracao: "Homologada",
      };
      const potencialHomologada: AvaliacaoPotencial = {
        ...avaliacaoPotencial,
        notaPotencialCalibrada: ajustes.notaPotencialCalibrada,
        notaOficial,
        justificativaCalibracao: ajustes.justificativa,
        calibradoPor: me,
        calibradoEm: agora,
        homologadoPor: me,
        homologadoEm: agora,
        statusCalibracao: "Homologada",
      };

      try {
        await atualizarAvaliacaoDesempenhoNoSupabase(avdHomologada);
        dispatch({ type: "ATUALIZAR_AVALIACAO_DESEMPENHO", avaliacao: avdHomologada });
        await atualizarAvaliacaoPotencialNoSupabase(potencialHomologada);
        dispatch({ type: "ATUALIZAR_AVALIACAO_POTENCIAL", avaliacao: potencialHomologada });
        flash("Avaliação homologada.");
        void registrarLogAvaliacaoDesempenhoNoSupabase({
          cicloId: avdHomologada.cicloId,
          avaliacaoId: avdHomologada.id,
          acao: "AVALIACAO_HOMOLOGADA",
          detalhe: avdHomologada.colaboradorNome,
          usuario: me,
        });
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao homologar avaliação.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash, perfil, state.configAvaliacaoDesempenho],
  );

  /** Devolutiva (Etapa 8) — marca que a conversa de feedback pós-homologação
   * já aconteceu. Permitido pro RH ou por quem `gestorAvaliador` aponta
   * (congelado, mesmo padrão de sempre), só quando `statusCalibracao ===
   * "Homologada"` e ainda não marcada. Espelha deliberadamente o mesmo
   * precedente de `podeCalibrarAvaliacaoDesempenhoFn`/`homologarCalibracaoFn`:
   * SEM gate de ciclo-encerrado — homologação (e agora devolutiva)
   * naturalmente acontece perto ou depois do fechamento do ciclo, herdar
   * esse gate deixaria a ação inacessível bem no momento em que mais se usa.
   * Sem "desmarcar" — nada no spec pede isso. */
  const podeMarcarDevolutivaFn = useCallback(
    (avaliacao: AvaliacaoDesempenho) =>
      (perfil === "RH" || avaliacao.gestorAvaliador === me) &&
      avaliacao.statusCalibracao === "Homologada" &&
      !avaliacao.devolutivaRealizada,
    [perfil, me],
  );

  const marcarDevolutivaRealizadaFn = useCallback(
    async (avaliacao: AvaliacaoDesempenho) => {
      if (!podeMarcarDevolutivaFn(avaliacao)) {
        flash("Você não pode marcar a devolutiva desta avaliação.");
        return { ok: false as const };
      }
      const atualizado: AvaliacaoDesempenho = {
        ...avaliacao,
        devolutivaRealizada: true,
        devolutivaPor: me,
        devolutivaEm: new Date().toISOString(),
      };
      try {
        await atualizarAvaliacaoDesempenhoNoSupabase(atualizado);
        dispatch({ type: "ATUALIZAR_AVALIACAO_DESEMPENHO", avaliacao: atualizado });
        flash("Devolutiva marcada como realizada.");
        void registrarLogAvaliacaoDesempenhoNoSupabase({
          cicloId: atualizado.cicloId,
          avaliacaoId: atualizado.id,
          acao: "DEVOLUTIVA_REALIZADA",
          detalhe: atualizado.colaboradorNome,
          usuario: me,
        });
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao marcar devolutiva.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash, podeMarcarDevolutivaFn],
  );

  return {
    conta,
    perfil,
    colaboradores: state.colaboradores,
    colaboradoresVisiveis,
    colaboradoresListagem,
    movimentacoes: state.movimentacoes,
    movimentacoesVisiveis,
    desligados,
    desligamentosFinanceiros: state.desligamentosFinanceiros,
    pendenciasFinanceirasCount,
    descricoesCargo: state.descricoesCargo,
    podeEditarSecaoDescricaoCargo: podeEditarSecaoDescricaoCargoFn,
    podeAprovarDescricaoCargo: perfil === "RH" || perfil === "Diretoria",
    aprovarDescricaoCargo: aprovarDescricaoCargoFn,
    rejeitarDescricaoCargo: rejeitarDescricaoCargoFn,
    podeEditarAdmissao: perfil === "RH",
    scopeSet,
    podeCriar: canCreate(perfil),
    podeVerColaboradores: navColab(perfil),
    podeVerCadastros: navRegistro(perfil),
    podeVerCargos: navCargos(perfil),
    mostrarEquipes: showEquipes(perfil),
    loading,
    aprovarEtapa: aprovarEtapaFn,
    reprovarEtapa: reprovarEtapaFn,
    restaurarMovimentacaoParaRH: restaurarMovimentacaoParaRHFn,
    editarDadosMovimentacao: editarDadosMovimentacaoFn,
    emitirCartaMovimentacao: emitirCartaMovimentacaoFn,
    darCienciaCartaMovimentacao: darCienciaCartaMovimentacaoFn,
    marcarCartaMovimentacaoEntregue: marcarCartaMovimentacaoEntregueFn,
    criarMovimentacao: criarMovimentacaoFn,
    toggleDescricaoCargo: toggleDescricaoCargoFn,
    salvarFechamentoFinanceiro: salvarFechamentoFinanceiroFn,
    atualizarCampoDescricaoCargo: atualizarCampoDescricaoCargoFn,
    carregarHistoricoDescricaoCargo: carregarHistoricoDescricaoCargoFn,
    atualizarAdmissao: atualizarAdmissaoFn,
    avaliacoesExperiencia: state.avaliacoesExperiencia,
    pendenciasAvaliacaoExperiencia,
    criarAvaliacaoExperiencia: criarAvaliacaoExperienciaFn,
    dispensasAvaliacaoExperiencia: state.dispensasAvaliacaoExperiencia,
    dispensarAvaliacaoExperiencia: dispensarAvaliacaoExperienciaFn,
    configAvaliacaoDesempenho: state.configAvaliacaoDesempenho,
    atualizarConfigAvaliacaoDesempenho: atualizarConfigAvaliacaoDesempenhoFn,
    competenciasComportamentais: state.competenciasComportamentais,
    salvarCompetenciaComportamental: salvarCompetenciaComportamentalFn,
    avaliacoesDesempenhoVisiveis,
    notasLiderancaVisiveis,
    ciclosAvaliacaoDesempenho: state.ciclosAvaliacaoDesempenho,
    criarCicloAvaliacaoDesempenho: criarCicloAvaliacaoDesempenhoFn,
    encerrarCicloAvaliacaoDesempenho: encerrarCicloAvaliacaoDesempenhoFn,
    salvarAvaliacaoDesempenho: salvarAvaliacaoDesempenhoFn,
    podeEditarAvaliacaoDesempenho: podeEditarAvaliacaoDesempenhoFn,
    podeReabrirAvaliacaoDesempenho: podeReabrirAvaliacaoDesempenhoFn,
    reabrirAvaliacaoDesempenho: reabrirAvaliacaoDesempenhoFn,
    kpisCargo: state.kpisCargo,
    criarKpiCargo: criarKpiCargoFn,
    atualizarKpiCargo: atualizarKpiCargoFn,
    excluirKpiCargo: excluirKpiCargoFn,
    avaliacoesDesempenho: state.avaliacoesDesempenho,
    pdi: state.pdi,
    pdiVisiveis,
    podeEditarPdi: podeEditarPdiFn,
    salvarPdi: salvarPdiFn,
    reabrirPdi: reabrirPdiFn,
    pdiBiblioteca: state.pdiBiblioteca,
    salvarItemBibliotecaPdi: salvarItemBibliotecaPdiFn,
    excluirItemBibliotecaPdi: excluirItemBibliotecaPdiFn,
    feedbacksVisiveis,
    podeRegistrarFeedback: podeRegistrarFeedbackFn,
    registrarFeedback: registrarFeedbackFn,
    podeEditarGestaoDesempenho: perfil === "RH",
    avaliacoesPotencial: state.avaliacoesPotencial,
    avaliacoesPotencialVisiveis,
    podeEditarAvaliacaoPotencial: podeEditarAvaliacaoPotencialFn,
    salvarAvaliacaoPotencial: salvarAvaliacaoPotencialFn,
    reabrirAvaliacaoPotencial: reabrirAvaliacaoPotencialFn,
    colaboradoresParaMatriz9Box,
    podeCalibrarAvaliacaoDesempenho: podeCalibrarAvaliacaoDesempenhoFn,
    homologarCalibracao: homologarCalibracaoFn,
    podeMarcarDevolutiva: podeMarcarDevolutivaFn,
    marcarDevolutivaRealizada: marcarDevolutivaRealizadaFn,
    colaboradoresParaHistorico,
    colaboradoresParaDashboardExecutivo,
    configDashboard: state.configDashboard,
    atualizarConfigDashboard: atualizarConfigDashboardFn,
    configEncargosFolha: state.configEncargosFolha,
    salariosBase: state.salariosBase,
    reajustesSalariais: state.reajustesSalariais,
    aplicarReajustesSalariais: aplicarReajustesSalariaisFn,
  };
}

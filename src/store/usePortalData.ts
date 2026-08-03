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
  atualizarCampoDescricaoCargo as atualizarCampoDescricaoCargoNoSupabase,
  getHistoricoDescricaoCargo,
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
import { notificar } from "../repositories/notificacoesRepository";
import { formatarDataIso, tempoDeEmpresa } from "../domain/dates";
import { colaboradoresDesligados, pendenteFechamento } from "../domain/desligados";
import { descricaoCargoVazia, type CampoDescricaoCargo } from "../domain/descricaoCargo";
import {
  calcularNotasAvaliacao,
  elegivelParaCicloAvaliacaoDesempenho,
  gerarIdAvaliacaoDesempenho,
  gerarIdCicloAvaliacaoDesempenho,
  validarConfigAvaliacaoDesempenho,
} from "../domain/avaliacaoDesempenho";
import {
  calcularIndicacao,
  calcularNotaFinalPct,
  gerarIdAvaliacaoExperiencia,
  pendenciasAvaliacaoExperiencia as pendenciasAvaliacaoExperienciaDomain,
} from "../domain/avaliacaoExperiencia";
import { descendants, ehDiretorIndustrial } from "../domain/hierarquia";
import { notificacaoConcluida, notificacaoNovaEtapa, notificacaoReprovada } from "../domain/notificacoes";
import { canCreate, canSeeMov, navColab, navRegistro, showEquipes } from "../domain/permissoes";
import { construirMovimentacao, validarForm, type FormContext } from "../domain/formMovimentacao";
import { aprovarEtapa as aprovarEtapaDomain, etapaAtual, reprovarEtapa as reprovarEtapaDomain } from "../domain/workflow";
import { usePortalStore } from "./PortalStoreContext";
import { useConta } from "./useConta";
import type {
  AvaliacaoDesempenho,
  AvaliacaoExperiencia,
  CicloAvaliacaoDesempenho,
  Colaborador,
  CompetenciaComportamental,
  ConfigAvaliacaoDesempenho,
  Conta,
  DescricaoCargo,
  DesligamentoFinanceiro,
  DispensaAvaliacaoExperiencia,
  EtapaAvaliacaoExperiencia,
  HistoricoDescricaoCargo,
  KpiCargo,
  Movimentacao,
  NovaMovimentacaoForm,
  NovoCicloAvaliacaoForm,
  Pdi,
  Perfil,
  RespostaAvaliacaoExperiencia,
  ResultadoAvaliacaoExperiencia,
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
  podeEditarDescricaoCargo: boolean;
  podeEditarAdmissao: boolean;
  scopeSet: Set<string> | null;
  podeCriar: boolean;
  podeVerColaboradores: boolean;
  podeVerCadastros: boolean;
  mostrarEquipes: boolean;
  loading: boolean;
  aprovarEtapa: (id: string) => void;
  reprovarEtapa: (id: string, comentario: string) => void;
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
  atualizarConfigAvaliacaoDesempenho: (pesoKpis: number, pesoComportamental: number) => Promise<{ ok: true } | { ok: false }>;
  competenciasComportamentais: CompetenciaComportamental[];
  salvarCompetenciaComportamental: (competencia: CompetenciaComportamental) => Promise<{ ok: true } | { ok: false }>;
  kpisCargo: KpiCargo[];
  criarKpiCargo: (kpi: Omit<KpiCargo, "id" | "updatedAt" | "updatedBy">) => Promise<{ ok: true } | { ok: false }>;
  atualizarKpiCargo: (kpi: KpiCargo) => Promise<{ ok: true } | { ok: false }>;
  excluirKpiCargo: (id: number) => Promise<{ ok: true } | { ok: false }>;
  avaliacoesDesempenho: AvaliacaoDesempenho[];
  /** RH vê todas; Gestor só as de colaboradores com `gestor === conta.nome` (reporte direto). */
  avaliacoesDesempenhoVisiveis: AvaliacaoDesempenho[];
  ciclosAvaliacaoDesempenho: CicloAvaliacaoDesempenho[];
  criarCicloAvaliacaoDesempenho: (form: NovoCicloAvaliacaoForm) => Promise<{ ok: true; quantidade: number } | { ok: false }>;
  /** Trava todas as avaliações do ciclo (mesmo as "Em andamento") — sem reabertura nesta etapa. */
  encerrarCicloAvaliacaoDesempenho: (id: string) => Promise<{ ok: true } | { ok: false }>;
  salvarAvaliacaoDesempenho: (avaliacao: AvaliacaoDesempenho) => Promise<{ ok: true } | { ok: false }>;
  /** true quando `conta` pode editar ESSA avaliação especificamente — RH sempre, Gestor só se
   * for o gestor do colaborador avaliado — e ela ainda não estiver "Concluída" (trava total). */
  podeEditarAvaliacaoDesempenho: (avaliacao: AvaliacaoDesempenho) => boolean;
  pdi: Pdi[];
  podeEditarGestaoDesempenho: boolean;
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
   * gestor de alguém (`colaborador.gestor === me`, atual/ao vivo) vê as até
   * 3 fichas desse liderado, mas só edita a do tipo GESTOR
   * (podeEditarAvaliacaoDesempenho já cuida disso via gestorAvaliador). */
  const avaliacoesDesempenhoVisiveis = useMemo(() => {
    if (perfil === "RH") return state.avaliacoesDesempenho;
    return state.avaliacoesDesempenho.filter((a) => {
      if (a.colaboradorNome === me) {
        if (a.tipo === "GESTOR") return perfil !== "Colaborador";
        return true;
      }
      return colaboradorPorNome.get(a.colaboradorNome)?.gestor === me;
    });
  }, [state.avaliacoesDesempenho, colaboradorPorNome, perfil, me]);

  const podeEditarAvaliacaoDesempenhoFn = useCallback(
    (avaliacao: AvaliacaoDesempenho) => {
      if (avaliacao.status === "Concluída") return false;
      const ciclo = state.ciclosAvaliacaoDesempenho.find((c) => c.id === avaliacao.cicloId);
      if (ciclo?.status === "Encerrado") return false;
      if (perfil === "RH") return true;
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
            const email = notificacaoReprovada(atualizada, etapaReprovada);
            void notificar(email);
          }
        } catch (err) {
          flash(err instanceof Error ? err.message : "Falha ao reprovar etapa.");
        }
      })();
    },
    [dispatch, state.movimentacoes, flash],
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

  const atualizarCampoDescricaoCargoFn = useCallback(
    async (cargoNome: string, campo: CampoDescricaoCargo, valorNovo: string) => {
      const atual = state.descricoesCargo.find((d) => d.cargoNome === cargoNome) ?? descricaoCargoVazia(cargoNome);
      const valorAnterior = atual[campo];
      try {
        await atualizarCampoDescricaoCargoNoSupabase(cargoNome, campo, valorAnterior, valorNovo, me);
        dispatch({
          type: "ATUALIZAR_DESCRICAO_CARGO",
          descricao: { ...atual, [campo]: valorNovo, updatedAt: new Date().toISOString(), updatedBy: me },
        });
        flash("Descrição de cargo atualizada.");
        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao atualizar descrição de cargo.");
        return { ok: false as const };
      }
    },
    [dispatch, me, state.descricoesCargo, flash],
  );

  const carregarHistoricoDescricaoCargoFn = useCallback(
    (cargoNome: string) => getHistoricoDescricaoCargo(cargoNome),
    [],
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
    async (pesoKpis: number, pesoComportamental: number) => {
      // Validação de negócio, independente de UI — bloqueia qualquer soma
      // diferente de 100% antes de sequer tentar gravar, não importa por
      // onde esta função seja chamada (ver validarConfigAvaliacaoDesempenho()
      // em domain/avaliacaoDesempenho.ts).
      const validacao = validarConfigAvaliacaoDesempenho(pesoKpis, pesoComportamental);
      if (!validacao.ok) {
        flash(validacao.error);
        return { ok: false as const };
      }
      try {
        await atualizarConfigAvaliacaoDesempenhoNoSupabase(pesoKpis, pesoComportamental, me);
        dispatch({
          type: "ATUALIZAR_CONFIG_AVALIACAO_DESEMPENHO",
          config: { pesoKpis, pesoComportamental, updatedAt: new Date().toISOString(), updatedBy: me },
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
        status: "Aberto",
        criadoPor: me,
        criadoEm: agora,
      };

      // Elegibilidade: ativo + 6 meses completos de empresa até a data de
      // corte (data de encerramento do ciclo) — quem não passa não recebe
      // nenhuma ficha, só um registro no log de auditoria com o motivo.
      const naoElegiveis: { nome: string; motivo: string }[] = [];
      const elegiveis: Colaborador[] = [];
      for (const c of state.colaboradores) {
        const resultado = elegivelParaCicloAvaliacaoDesempenho(c, ciclo.dataEncerramento);
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

  const salvarAvaliacaoDesempenhoFn = useCallback(
    async (avaliacao: AvaliacaoDesempenho) => {
      const anterior = state.avaliacoesDesempenho.find((a) => a.id === avaliacao.id);
      // Ponto único de cálculo — o mesmo usado no preview do Drawer e na
      // lista de Avaliações, pra nota exibida e nota gravada serem sempre
      // idênticas (ver calcularNotasAvaliacao() em domain/avaliacaoDesempenho.ts).
      const { mediaTecnica: mediaTecnicaValor, mediaComportamental: mediaComportamentalValor, notaFinal: notaFinalValor } =
        calcularNotasAvaliacao(avaliacao, state.kpisCargo, state.configAvaliacaoDesempenho);
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

        return { ok: true as const };
      } catch (err) {
        flash(err instanceof Error ? err.message : "Falha ao salvar avaliação de desempenho.");
        return { ok: false as const };
      }
    },
    [dispatch, me, flash, state.avaliacoesDesempenho, state.kpisCargo, state.configAvaliacaoDesempenho],
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
    podeEditarDescricaoCargo: perfil === "RH",
    podeEditarAdmissao: perfil === "RH",
    scopeSet,
    podeCriar: canCreate(perfil),
    podeVerColaboradores: navColab(perfil),
    podeVerCadastros: navRegistro(perfil),
    mostrarEquipes: showEquipes(perfil),
    loading,
    aprovarEtapa: aprovarEtapaFn,
    reprovarEtapa: reprovarEtapaFn,
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
    ciclosAvaliacaoDesempenho: state.ciclosAvaliacaoDesempenho,
    criarCicloAvaliacaoDesempenho: criarCicloAvaliacaoDesempenhoFn,
    encerrarCicloAvaliacaoDesempenho: encerrarCicloAvaliacaoDesempenhoFn,
    salvarAvaliacaoDesempenho: salvarAvaliacaoDesempenhoFn,
    podeEditarAvaliacaoDesempenho: podeEditarAvaliacaoDesempenhoFn,
    kpisCargo: state.kpisCargo,
    criarKpiCargo: criarKpiCargoFn,
    atualizarKpiCargo: atualizarKpiCargoFn,
    excluirKpiCargo: excluirKpiCargoFn,
    avaliacoesDesempenho: state.avaliacoesDesempenho,
    pdi: state.pdi,
    podeEditarGestaoDesempenho: perfil === "RH",
  };
}

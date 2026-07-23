import { useCallback, useMemo } from "react";
import { useToast } from "../components/shared/ToastContext";
import { atualizarDescricaoCargoCustom, criarCargoCustom } from "../repositories/cargosCustomRepository";
import {
  atualizarAdmissao as atualizarAdmissaoNoSupabase,
  atualizarCargoDepto as atualizarCargoDeptoNoSupabase,
  criarPreCadastro as criarPreCadastroNoSupabase,
  criarSolicitacaoDesligamento as criarSolicitacaoDesligamentoNoSupabase,
} from "../repositories/colaboradoresRepository";
import { salvarFechamentoFinanceiro as salvarFechamentoNoSupabase } from "../repositories/desligadosRepository";
import {
  atualizarCampoDescricaoCargo as atualizarCampoDescricaoCargoNoSupabase,
  getHistoricoDescricaoCargo,
} from "../repositories/descricoesCargoRepository";
import { atualizarMovimentacao, criarMovimentacao as criarMovimentacaoNoSupabase } from "../repositories/movimentacoesRepository";
import {
  criarAvaliacaoExperiencia as criarAvaliacaoExperienciaNoSupabase,
  criarDispensaAvaliacaoExperiencia as criarDispensaAvaliacaoExperienciaNoSupabase,
} from "../repositories/avaliacoesExperienciaRepository";
import { notificar } from "../repositories/notificacoesRepository";
import { formatarDataIso, tempoDeEmpresa } from "../domain/dates";
import { colaboradoresDesligados, pendenteFechamento } from "../domain/desligados";
import { descricaoCargoVazia, type CampoDescricaoCargo } from "../domain/descricaoCargo";
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
import { aprovarEtapa as aprovarEtapaDomain, cargoCustomDeNovoCargo, etapaAtual, reprovarEtapa as reprovarEtapaDomain } from "../domain/workflow";
import { usePortalStore } from "./PortalStoreContext";
import { useConta } from "./useConta";
import type {
  AvaliacaoExperiencia,
  Colaborador,
  Conta,
  DescricaoCargo,
  DesligamentoFinanceiro,
  DispensaAvaliacaoExperiencia,
  EtapaAvaliacaoExperiencia,
  HistoricoDescricaoCargo,
  Movimentacao,
  NovaMovimentacaoForm,
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

  const aprovarEtapaFn = useCallback(
    (id: string) => {
      const { movimentacoes, cargoRegistrado, admissaoRegistrada, atualizacaoRegistrada, desligamentoRegistrado } = aprovarEtapaDomain(
        state.movimentacoes,
        id,
      );
      const atualizada = movimentacoes.find((m) => m.id === id);
      if (!atualizada) return;
      (async () => {
        try {
          await atualizarMovimentacao(atualizada);
          let msg = "Etapa aprovada — movimentação atualizada.";
          if (cargoRegistrado) {
            await criarCargoCustom(cargoCustomDeNovoCargo(cargoRegistrado));
            msg = `Cargo "${cargoRegistrado.nome}" aprovado e incorporado ao cadastro oficial.`;
          }
          if (admissaoRegistrada) {
            const { jaExistia } = await criarPreCadastroNoSupabase(admissaoRegistrada);
            msg = jaExistia
              ? `Admissão concluída — já existe um colaborador chamado "${admissaoRegistrada.candidato}", pré-cadastro não duplicado.`
              : `Admissão concluída — pré-cadastro de "${admissaoRegistrada.candidato}" criado (CPF e demais dados do SST ainda precisam ser completados).`;
            reload();
          }
          if (atualizacaoRegistrada) {
            await atualizarCargoDeptoNoSupabase(atualizacaoRegistrada.nome, atualizacaoRegistrada.novoCargo, atualizacaoRegistrada.novoDepto);
            msg = `Cadastro de "${atualizacaoRegistrada.nome}" atualizado com o novo cargo/departamento nos dois portais.`;
            reload();
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
      const validacao = validarForm(form);
      if (!validacao.ok) return { ok: false as const };
      const ctx: FormContext = { perfil, me, tipos: state.tipos, colaboradores: state.colaboradores, movimentacoes: state.movimentacoes };
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
    [dispatch, perfil, me, state.tipos, state.colaboradores, state.movimentacoes, flash],
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
  };
}

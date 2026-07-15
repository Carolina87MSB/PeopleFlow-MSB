import { useCallback, useMemo } from "react";
import { useToast } from "../components/shared/ToastContext";
import { atualizarDescricaoCargoCustom, criarCargoCustom } from "../repositories/cargosCustomRepository";
import {
  atualizarAdmissao as atualizarAdmissaoNoSupabase,
  atualizarCargoDepto as atualizarCargoDeptoNoSupabase,
  criarPreCadastro as criarPreCadastroNoSupabase,
  desligarColaborador as desligarColaboradorNoSupabase,
} from "../repositories/colaboradoresRepository";
import { salvarFechamentoFinanceiro as salvarFechamentoNoSupabase } from "../repositories/desligadosRepository";
import {
  atualizarCampoDescricaoCargo as atualizarCampoDescricaoCargoNoSupabase,
  getHistoricoDescricaoCargo,
} from "../repositories/descricoesCargoRepository";
import { atualizarMovimentacao, criarMovimentacao as criarMovimentacaoNoSupabase } from "../repositories/movimentacoesRepository";
import { formatarDataIso, tempoDeEmpresa } from "../domain/dates";
import { colaboradoresDesligados, pendenteFechamento } from "../domain/desligados";
import { descricaoCargoVazia, type CampoDescricaoCargo } from "../domain/descricaoCargo";
import { descendants } from "../domain/hierarquia";
import { canCreate, canSeeMov, navColab, navRegistro, showEquipes } from "../domain/permissoes";
import { construirMovimentacao, validarForm, type FormContext } from "../domain/formMovimentacao";
import { aprovarEtapa as aprovarEtapaDomain, cargoCustomDeNovoCargo, reprovarEtapa as reprovarEtapaDomain } from "../domain/workflow";
import { usePortalStore } from "./PortalStoreContext";
import { useConta } from "./useConta";
import type {
  Colaborador,
  Conta,
  DescricaoCargo,
  DesligamentoFinanceiro,
  HistoricoDescricaoCargo,
  Movimentacao,
  NovaMovimentacaoForm,
  Perfil,
} from "../types/domain";

export interface PortalData {
  conta: Conta;
  perfil: Perfil;
  colaboradores: Colaborador[];
  colaboradoresVisiveis: Colaborador[];
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

  const colaboradoresVisiveis = useMemo(() => {
    const ativos = state.colaboradores.filter((c) => !c.desligado);
    return perfil === "Gestor" && scopeSet ? ativos.filter((c) => scopeSet.has(c.nome)) : ativos;
  }, [perfil, scopeSet, state.colaboradores]);

  const movimentacoesVisiveis = useMemo(
    () => (perfil === "RH" ? state.movimentacoes : state.movimentacoes.filter((m) => canSeeMov(m, perfil, me, scopeSet))),
    [perfil, me, scopeSet, state.movimentacoes],
  );

  const desligados = useMemo(() => colaboradoresDesligados(state.colaboradores), [state.colaboradores]);

  const pendenciasFinanceirasCount = useMemo(
    () => desligados.filter((c) => pendenteFechamento(c.nome, state.desligamentosFinanceiros)).length,
    [desligados, state.desligamentosFinanceiros],
  );

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
            const dataIso = desligamentoRegistrado.dataIso || new Date().toISOString().slice(0, 10);
            await desligarColaboradorNoSupabase(desligamentoRegistrado.nome, dataIso, desligamentoRegistrado.motivo, conta.email);
            msg = `Desligamento de "${desligamentoRegistrado.nome}" registrado — some das listas ativas nos dois portais.`;
            reload();
          }
          dispatch({ type: "APROVAR_ETAPA", id });
          flash(msg);
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

  return {
    conta,
    perfil,
    colaboradores: state.colaboradores,
    colaboradoresVisiveis,
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
  };
}

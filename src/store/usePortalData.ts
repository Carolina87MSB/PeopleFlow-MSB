import { useCallback, useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import { descendants } from "../domain/hierarquia";
import { canCreate, canSeeMov, navColab, navRegistro, showEquipes } from "../domain/permissoes";
import { construirMovimentacao, validarForm, type FormContext } from "../domain/formMovimentacao";
import { usePortalStore } from "./PortalStoreContext";
import type { Colaborador, Conta, Movimentacao, NovaMovimentacaoForm, Perfil } from "../types/domain";

export interface PortalData {
  conta: Conta;
  perfil: Perfil;
  colaboradores: Colaborador[];
  colaboradoresVisiveis: Colaborador[];
  movimentacoes: Movimentacao[];
  movimentacoesVisiveis: Movimentacao[];
  scopeSet: Set<string> | null;
  podeCriar: boolean;
  podeVerColaboradores: boolean;
  podeVerCadastros: boolean;
  mostrarEquipes: boolean;
  loading: boolean;
  aprovarEtapa: (id: string) => void;
  reprovarEtapa: (id: string) => void;
  criarMovimentacao: (form: NovaMovimentacaoForm) => { ok: true; movimentacao: Movimentacao } | { ok: false };
  toggleDescricaoCargo: (nome: string) => void;
}

/**
 * Central read/write seam for feature pages: combines the authenticated conta
 * with the portal store to produce role-scoped colaboradores/movimentacoes and
 * the workflow actions, mirroring the prototype's renderVals() derivations.
 */
export function usePortalData(): PortalData {
  const { conta } = useAuth();
  const { state, dispatch, loading } = usePortalStore();

  if (!conta) throw new Error("usePortalData requer uma conta autenticada — use dentro de <RequireAuth>");

  const perfil = conta.perfil;
  const me = conta.nome;

  const scopeSet = useMemo(() => {
    if (perfil !== "Gestor") return null;
    const set = descendants(state.colaboradores, me);
    set.add(me);
    return set;
  }, [perfil, me, state.colaboradores]);

  const colaboradoresVisiveis = useMemo(
    () => (perfil === "Gestor" && scopeSet ? state.colaboradores.filter((c) => scopeSet.has(c.nome)) : state.colaboradores),
    [perfil, scopeSet, state.colaboradores],
  );

  const movimentacoesVisiveis = useMemo(
    () => (perfil === "RH" ? state.movimentacoes : state.movimentacoes.filter((m) => canSeeMov(m, perfil, me, scopeSet))),
    [perfil, me, scopeSet, state.movimentacoes],
  );

  const aprovarEtapaFn = useCallback((id: string) => dispatch({ type: "APROVAR_ETAPA", id }), [dispatch]);
  const reprovarEtapaFn = useCallback((id: string) => dispatch({ type: "REPROVAR_ETAPA", id }), [dispatch]);
  const toggleDescricaoCargoFn = useCallback((nome: string) => dispatch({ type: "TOGGLE_DESCRICAO_CARGO", nome }), [dispatch]);

  const criarMovimentacaoFn = useCallback(
    (form: NovaMovimentacaoForm) => {
      const validacao = validarForm(form);
      if (!validacao.ok) return { ok: false as const };
      const ctx: FormContext = { perfil, me, tipos: state.tipos, colaboradores: state.colaboradores, movimentacoes: state.movimentacoes };
      const movimentacao = construirMovimentacao(form, ctx);
      dispatch({ type: "CRIAR_MOVIMENTACAO", movimentacao });
      return { ok: true as const, movimentacao };
    },
    [dispatch, perfil, me, state.tipos, state.colaboradores, state.movimentacoes],
  );

  return {
    conta,
    perfil,
    colaboradores: state.colaboradores,
    colaboradoresVisiveis,
    movimentacoes: state.movimentacoes,
    movimentacoesVisiveis,
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
  };
}

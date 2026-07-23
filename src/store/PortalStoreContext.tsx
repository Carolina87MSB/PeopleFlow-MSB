import { createContext, useContext, useEffect, useMemo, useReducer, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { getColaboradores } from "../repositories/colaboradoresRepository";
import { getCargosCustom } from "../repositories/cargosCustomRepository";
import { getDesligamentosFinanceiros } from "../repositories/desligadosRepository";
import { getDescricoesCargo } from "../repositories/descricoesCargoRepository";
import { getMovimentacoes } from "../repositories/movimentacoesRepository";
import { getAvaliacoesExperiencia, getDispensasAvaliacaoExperiencia } from "../repositories/avaliacoesExperienciaRepository";
import { getPerfis, getTiposMovimentacao } from "../repositories/portalRepository";
import type { PortalAction } from "./actions";
import { initialPortalState, portalReducer } from "./reducer";
import type { PortalState } from "./types";

interface PortalStoreValue {
  state: PortalState;
  dispatch: (action: PortalAction) => void;
  loading: boolean;
  error: string | null;
  /** Refaz a carga de colaboradores/movimentações/cargos do Supabase (ex.: após uma escrita externa). */
  reload: () => void;
}

const PortalStoreContext = createContext<PortalStoreValue | null>(null);

export function PortalStoreProvider({ children }: { children: ReactNode }) {
  const { email, status } = useAuth();
  const [state, dispatch] = useReducer(portalReducer, initialPortalState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    // Sem sessão autenticada não há como ler `colaboradores` (RLS só libera
    // SELECT para `authenticated`) — zera tudo ao deslogar.
    if (status !== "signed-in" || !email) {
      dispatch({ type: "RESET" });
      setError(null);
      setLoading(false);
      return;
    }

    let cancelado = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getColaboradores(),
      getMovimentacoes(),
      getCargosCustom(),
      getTiposMovimentacao(),
      getPerfis(),
      getDesligamentosFinanceiros(),
      getDescricoesCargo(),
      getAvaliacoesExperiencia(),
      getDispensasAvaliacaoExperiencia(),
    ])
      .then(
        ([
          colaboradores,
          movimentacoes,
          cargosCustom,
          tipos,
          perfis,
          desligamentosFinanceiros,
          descricoesCargo,
          avaliacoesExperiencia,
          dispensasAvaliacaoExperiencia,
        ]) => {
          if (cancelado) return;
          dispatch({
            type: "CARREGAR_DADOS",
            colaboradores,
            movimentacoes,
            cargosCustom,
            tipos,
            perfis,
            desligamentosFinanceiros,
            descricoesCargo,
            avaliacoesExperiencia,
            dispensasAvaliacaoExperiencia,
          });
        },
      )
      .catch((err: Error) => {
        if (cancelado) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [status, email, reloadTick]);

  const value = useMemo(
    () => ({ state, dispatch, loading, error, reload: () => setReloadTick((t) => t + 1) }),
    [state, loading, error],
  );

  return <PortalStoreContext.Provider value={value}>{children}</PortalStoreContext.Provider>;
}

export function usePortalStore(): PortalStoreValue {
  const ctx = useContext(PortalStoreContext);
  if (!ctx) throw new Error("usePortalStore precisa ser usado dentro de <PortalStoreProvider>");
  return ctx;
}

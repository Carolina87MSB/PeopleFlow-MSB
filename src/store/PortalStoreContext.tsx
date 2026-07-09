import { createContext, useContext, useEffect, useMemo, useReducer, useState } from "react";
import type { ReactNode } from "react";
import { getColaboradores, getMovimentacoesSeed, getPerfis, getTiposMovimentacao } from "../repositories/portalRepository";
import type { PortalAction } from "./actions";
import { initialPortalState, portalReducer } from "./reducer";
import type { PortalState } from "./types";

interface PortalStoreValue {
  state: PortalState;
  dispatch: (action: PortalAction) => void;
  loading: boolean;
}

const PortalStoreContext = createContext<PortalStoreValue | null>(null);

export function PortalStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(portalReducer, initialPortalState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    Promise.all([getColaboradores(), getMovimentacoesSeed(), getTiposMovimentacao(), getPerfis()]).then(
      ([colaboradores, movimentacoes, tipos, perfis]) => {
        if (cancelado) return;
        dispatch({ type: "CARREGAR_SEED", colaboradores, movimentacoes, tipos, perfis });
        setLoading(false);
      },
    );
    return () => {
      cancelado = true;
    };
  }, []);

  const value = useMemo(() => ({ state, dispatch, loading }), [state, loading]);

  return <PortalStoreContext.Provider value={value}>{children}</PortalStoreContext.Provider>;
}

export function usePortalStore(): PortalStoreValue {
  const ctx = useContext(PortalStoreContext);
  if (!ctx) throw new Error("usePortalStore precisa ser usado dentro de <PortalStoreProvider>");
  return ctx;
}

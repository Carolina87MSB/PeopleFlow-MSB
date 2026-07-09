import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import { buildAccess } from "../domain/hierarquia";
import { usePortalStore } from "./PortalStoreContext";
import type { Conta } from "../types/domain";

/**
 * Deriva a Conta (nome/cargo/depto/perfil) do e-mail autenticado no Supabase,
 * cruzando com a lista de colaboradores carregada do banco compartilhado com
 * o Portal SST. Retorna null enquanto os colaboradores ainda não carregaram,
 * ou se o e-mail autenticado não corresponde a nenhum gestor cadastrado.
 */
export function useConta(): Conta | null {
  const { email } = useAuth();
  const { state } = usePortalStore();

  return useMemo(() => {
    if (!email || state.colaboradores.length === 0) return null;
    return buildAccess(state.colaboradores).find((a) => a.email === email) ?? null;
  }, [email, state.colaboradores]);
}

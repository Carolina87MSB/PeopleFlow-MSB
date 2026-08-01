import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import { buildAccess, buildAccessAvd } from "../domain/hierarquia";
import { usePortalStore } from "./PortalStoreContext";
import type { Conta } from "../types/domain";

/**
 * Deriva a Conta (nome/cargo/depto/perfil) do e-mail autenticado no Supabase,
 * cruzando com a lista de colaboradores carregada do banco compartilhado com
 * o Portal SST. Tenta primeiro o acesso "principal" (RH/Diretoria/gestor —
 * buildAccess(), comportamento idêntico ao de antes da Etapa 2.1); se não
 * achar, cai pro acesso restrito da AVD (buildAccessAvd(), perfil
 * "Colaborador"). Retorna null enquanto os colaboradores ainda não
 * carregaram, ou se o e-mail autenticado não corresponde a nenhuma conta
 * elegível em nenhuma das duas listas.
 */
export function useConta(): Conta | null {
  const { email } = useAuth();
  const { state } = usePortalStore();

  return useMemo(() => {
    if (!email || state.colaboradores.length === 0) return null;
    return (
      buildAccess(state.colaboradores).find((a) => a.email === email) ??
      buildAccessAvd(state.colaboradores).find((a) => a.email === email) ??
      null
    );
  }, [email, state.colaboradores]);
}

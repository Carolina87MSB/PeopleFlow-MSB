import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import { buildAccess, buildAccessAvd, emailOf } from "../domain/hierarquia";
import { estaAtivoHoje } from "../domain/situacaoFuncional";
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
    const completa = buildAccess(state.colaboradores).find((a) => a.email === email) ?? buildAccessAvd(state.colaboradores).find((a) => a.email === email);
    if (completa) return completa;
    // Acesso específico a Treinamentos: colaborador ativo que ainda não é elegível à AVD (ex.: menos de seis meses de empresa) e que o RH
    // habilitou ou que apenas consulta "Meus treinamentos". Nada de AVD nem de outros módulos (ver AppShell e Sidebar).
    const restrita = state.colaboradores.find((c) => emailOf(c.nome) === email && estaAtivoHoje(c, "acesso"));
    return restrita ? { nome: restrita.nome, cargo: restrita.cargo, depto: restrita.depto, email, perfil: "Colaborador" as const, acesso: "treinamentos" as const } : null;
  }, [email, state.colaboradores]);
}

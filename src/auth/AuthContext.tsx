import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { buildAccess } from "../domain/hierarquia";
import type { Colaborador, Conta } from "../types/domain";

const DOMINIO_CORPORATIVO = "@msbbrasil.com";
const STORAGE_KEY = "msb_peopleflow_conta_v1";

export type LoginResult = { ok: true } | { ok: false; error: string };

interface AuthContextValue {
  conta: Conta | null;
  contasDemo: Conta[];
  login: (email: string) => LoginResult;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadPersisted(): Conta | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Conta) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children, colaboradores }: { children: ReactNode; colaboradores: Colaborador[] }) {
  const [conta, setConta] = useState<Conta | null>(loadPersisted);

  const contasDemo = useMemo(() => buildAccess(colaboradores), [colaboradores]);

  const login = useCallback(
    (rawEmail: string): LoginResult => {
      const email = (rawEmail || "").trim().toLowerCase();
      if (!email) return { ok: false, error: "Informe seu e-mail corporativo." };
      if (!email.endsWith(DOMINIO_CORPORATIVO)) {
        return {
          ok: false,
          error: "Acesso permitido apenas com e-mail corporativo @msbbrasil.com — e-mails pessoais não são aceitos.",
        };
      }
      const acc = buildAccess(colaboradores).find((a) => a.email === email);
      if (!acc) {
        return {
          ok: false,
          error: "E-mail corporativo válido, mas sem perfil de gestor cadastrado. O acesso ao portal é restrito a gestores.",
        };
      }
      setConta(acc);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(acc));
      } catch {
        // armazenamento indisponível — sessão segue apenas em memória
      }
      return { ok: true };
    },
    [colaboradores],
  );

  const logout = useCallback(() => {
    setConta(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignora
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ conta, contasDemo, login, logout }), [conta, contasDemo, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa ser usado dentro de <AuthProvider>");
  return ctx;
}

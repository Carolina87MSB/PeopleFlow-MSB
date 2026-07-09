import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";

const DOMINIO_CORPORATIVO = "@msbbrasil.com";

type AuthStatus = "loading" | "signed-out" | "signed-in";

export type MagicLinkResult = { ok: true } | { ok: false; error: string };

interface AuthContextValue {
  email: string | null;
  status: AuthStatus;
  /** Envia o link de acesso por e-mail. Não cria conta nova — só contas já provisionadas no Supabase funcionam. */
  requestMagicLink: (email: string) => Promise<MagicLinkResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    if (!supabaseConfigured) {
      setStatus("signed-out");
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setStatus(data.session ? "signed-in" : "signed-out");
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setStatus(newSession ? "signed-in" : "signed-out");
    });
    return () => subscription.unsubscribe();
  }, []);

  const requestMagicLink = useCallback(async (rawEmail: string): Promise<MagicLinkResult> => {
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { ok: false, error: "Informe um e-mail válido." };
    }
    if (!email.endsWith(DOMINIO_CORPORATIVO)) {
      return { ok: false, error: "Acesso permitido apenas com e-mail corporativo @msbbrasil.com — e-mails pessoais não são aceitos." };
    }
    if (!supabaseConfigured) {
      return { ok: false, error: "Supabase não configurado nesta instalação — veja .env.example." };
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        // Sem isso, o Supabase usa a "Site URL" configurada no painel como destino do link —
        // se estiver com o valor padrão (ex.: localhost), o link quebra em outro ambiente.
        // Precisa estar também na lista de "Redirect URLs" permitidas no painel do Supabase.
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      // Supabase retorna algo como "Signups not allowed for otp" quando o e-mail não tem
      // conta provisionada — traduzimos para a mensagem que faz sentido para quem usa o portal.
      if (/signup|not allowed|not found/i.test(error.message)) {
        return {
          ok: false,
          error: "E-mail corporativo válido, mas sem acesso provisionado. Peça ao RH para liberar seu acesso ao portal.",
        };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    if (supabaseConfigured) await supabase.auth.signOut();
    setSession(null);
    setStatus("signed-out");
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const email = session?.user?.email ?? null;
    return { email, status, requestMagicLink, logout };
  }, [session, status, requestMagicLink, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa ser usado dentro de <AuthProvider>");
  return ctx;
}

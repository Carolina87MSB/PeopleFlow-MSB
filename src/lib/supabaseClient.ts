import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
// Nome atual no painel do Supabase é "Publishable key" (substituiu a antiga "anon key").
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

/** true quando as variáveis de ambiente do Supabase foram configuradas (ver .env.example). */
export const supabaseConfigured = Boolean(url && publishableKey);

if (!supabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[Portal PeopleFlow] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY não configuradas — " +
      "copie .env.example para .env.local e preencha com os valores do MESMO projeto Supabase " +
      "usado pelo Portal SST MSB. Em Vite, só variáveis com prefixo VITE_ chegam ao navegador.",
  );
}

// Em dev sem .env.local configurado, cria o client com valores fictícios para não
// quebrar o import em todo o app; chamadas de rede vão falhar de forma explícita
// (ver AuthContext/repositories, que checam supabaseConfigured antes).
export const supabase = createClient(url || "https://placeholder.supabase.co", publishableKey || "placeholder-key");

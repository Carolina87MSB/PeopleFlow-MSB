// Camada de acesso à tabela `colaboradores` — COMPARTILHADA com o Portal SST
// MSB (mesmo projeto Supabase, mesmas pessoas). O PeopleFlow só lê as colunas
// que usa (nunca cpf/epis/exames, que são do domínio do SST) e nunca escreve
// nesta tabela — cadastro de colaborador é responsabilidade do RH via SST,
// inclusive o desligamento (ver api/desligar-colaborador.ts do SST).
//
// Trocar a fonte de novo no futuro é uma mudança isolada neste arquivo; nada
// mais no app importa o Supabase diretamente para dados de colaborador.

import { formatarDataIso, tempoDeEmpresa } from "../domain/dates";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import type { Colaborador, Nivel } from "../types/domain";

interface ColaboradorRow {
  nome: string;
  cargo: string | null;
  departamento: string | null;
  vinculo: string | null;
  depto_code: string | null;
  nivel: string | null;
  gestor: string | null;
  admissao: string | null;
  desligado: boolean | null;
  data_desligamento: string | null;
  motivo_desligamento: string | null;
  desligado_by: string | null;
}

const NIVEIS_VALIDOS: Nivel[] = [
  "Diretoria",
  "Gerência",
  "Liderança",
  "Especialista",
  "Analista",
  "Técnico",
  "Operacional",
  "Aprendiz / Estágio",
];

function fromRow(row: ColaboradorRow): Colaborador {
  const nivel = NIVEIS_VALIDOS.includes(row.nivel as Nivel) ? (row.nivel as Nivel) : "Operacional";
  return {
    vinculo: row.vinculo ?? "—",
    nome: row.nome,
    cargo: row.cargo ?? "",
    depto: row.departamento ?? "",
    deptoCode: row.depto_code ?? "—",
    nivel,
    gestor: row.gestor ?? "—",
    admissao: formatarDataIso(row.admissao),
    admissaoIso: row.admissao ?? "",
    tempoDeEmpresa: tempoDeEmpresa(row.admissao),
    desligado: row.desligado ?? false,
    dataDesligamento: formatarDataIso(row.data_desligamento),
    motivoDesligamento: row.motivo_desligamento ?? "",
    desligadoBy: row.desligado_by ?? "",
  };
}

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY em .env.local " +
        "(veja .env.example) para carregar a base de colaboradores compartilhada com o Portal SST.",
    );
    this.name = "SupabaseNotConfiguredError";
  }
}

export async function getColaboradores(): Promise<Colaborador[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase
    .from("colaboradores")
    .select("nome, cargo, departamento, vinculo, depto_code, nivel, gestor, admissao, desligado, data_desligamento, motivo_desligamento, desligado_by")
    .order("nome", { ascending: true });

  if (error) {
    throw new Error(`Falha ao carregar colaboradores do Supabase: ${error.message}`);
  }
  return (data as ColaboradorRow[]).map(fromRow);
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Único write do PeopleFlow em `colaboradores` — passa pela Vercel Function
 * RH-only em api/atualizar-admissao.ts (RLS não libera UPDATE direto do
 * navegador). `admissaoIso` no formato "aaaa-mm-dd". */
export async function atualizarAdmissao(nome: string, admissaoIso: string): Promise<void> {
  const res = await fetch("/api/atualizar-admissao", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ nome, admissao: admissaoIso }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Falha ao atualizar data de admissão.");
}

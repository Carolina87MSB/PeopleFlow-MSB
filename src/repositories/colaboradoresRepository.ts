// Camada de acesso à tabela `colaboradores` — COMPARTILHADA com o Portal SST
// MSB (mesmo projeto Supabase, mesmas pessoas). O PeopleFlow só lê as colunas
// que usa (nunca cpf/epis/exames, que são do domínio do SST) e nunca escreve
// nesta tabela — cadastro de colaborador é responsabilidade do RH via SST.
//
// Trocar a fonte de novo no futuro é uma mudança isolada neste arquivo; nada
// mais no app importa o Supabase diretamente para dados de colaborador.

import { formatarDataIso } from "../domain/dates";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import type { Colaborador, Nivel } from "../types/domain";

interface ColaboradorRow {
  nome: string;
  cargo: string | null;
  departamento: string | null;
  matricula: string | null;
  depto_code: string | null;
  nivel: string | null;
  gestor: string | null;
  admissao: string | null;
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
    matricula: row.matricula ?? "—",
    nome: row.nome,
    cargo: row.cargo ?? "",
    depto: row.departamento ?? "",
    deptoCode: row.depto_code ?? "—",
    nivel,
    gestor: row.gestor ?? "—",
    admissao: formatarDataIso(row.admissao),
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
    .select("nome, cargo, departamento, matricula, depto_code, nivel, gestor, admissao")
    .order("nome", { ascending: true });

  if (error) {
    throw new Error(`Falha ao carregar colaboradores do Supabase: ${error.message}`);
  }
  return (data as ColaboradorRow[]).map(fromRow);
}

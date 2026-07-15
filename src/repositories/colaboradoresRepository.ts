// Camada de acesso à tabela `colaboradores` — COMPARTILHADA com o Portal SST
// MSB (mesmo projeto Supabase, mesmas pessoas). O PeopleFlow só lê as colunas
// que usa (nunca cpf/epis/exames, que são do domínio do SST). Escritas em
// `colaboradores`, todas via Vercel Function RH-only (RLS só libera SELECT
// direto do navegador): atualizarAdmissao() (edição manual na tela
// Colaboradores), criarPreCadastro() (ao concluir uma Admissão) e
// atualizarCargoDepto() (ao concluir Promoção/Transferência/Mudança de
// Função) — todas disparadas em aprovarEtapaFn, store/usePortalData.ts. O
// restante do cadastro (cpf, nascimento, epis, exames, e o desligamento em
// si) continua exclusivo do SST — ver criarSolicitacaoDesligamento() abaixo,
// que só registra a solicitação numa tabela própria do PeopleFlow.
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

export interface DadosPreCadastro {
  candidato: string;
  cargo: string;
  depto: string;
  gestor: string;
  vinculo: string;
  admissaoIso: string;
}

/** Cria o pré-cadastro em `colaboradores` ao concluir uma movimentação de
 * Admissão — via api/criar-pre-cadastro.ts (RH-only, service_role). Não cria
 * duplicata: se já existir alguém com o mesmo nome, retorna jaExistia=true
 * sem alterar nada. */
export async function criarPreCadastro(dados: DadosPreCadastro): Promise<{ jaExistia: boolean }> {
  const res = await fetch("/api/criar-pre-cadastro", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      candidato: dados.candidato,
      cargo: dados.cargo,
      depto: dados.depto,
      gestor: dados.gestor,
      vinculo: dados.vinculo,
      admissao: dados.admissaoIso,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Falha ao criar pré-cadastro do colaborador.");
  return { jaExistia: Boolean(body.jaExistia) };
}

/** Sincroniza cargo/departamento ao concluir Promoção/Transferência/Mudança
 * de Função — via api/atualizar-cargo-departamento.ts (RH-only, service_role). */
export async function atualizarCargoDepto(nome: string, novoCargo?: string, novoDepto?: string): Promise<void> {
  const res = await fetch("/api/atualizar-cargo-departamento", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ nome, novoCargo, novoDepto }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Falha ao atualizar cargo/departamento do colaborador.");
}

/** Registra a solicitação de desligamento ao concluir a movimentação no
 * PeopleFlow — não desliga ninguém: só cria/atualiza uma linha em
 * `peopleflow_desligamento_pendente`, que o Portal SST lê para notificar o
 * RH no Dashboard dele. A efetivação real (`colaboradores.desligado`, com
 * ASO demissional se aplicável) acontece só quando o RH confirma pela tela
 * "Desligar colaborador" do SST — write direto (tabela exclusiva do
 * PeopleFlow, RLS já libera `authenticated`, sem precisar de service_role). */
export async function criarSolicitacaoDesligamento(nome: string, dataIso: string, motivo: string, solicitadoPor: string): Promise<void> {
  const { error } = await supabase.from("peopleflow_desligamento_pendente").upsert(
    { colaborador_nome: nome, data_desligamento: dataIso || null, motivo, solicitado_por: solicitadoPor },
    { onConflict: "colaborador_nome" },
  );
  if (error) throw new Error(`Falha ao registrar solicitação de desligamento: ${error.message}`);
}

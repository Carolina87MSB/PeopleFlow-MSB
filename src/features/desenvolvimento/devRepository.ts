// Acesso a dados do módulo Desenvolvimento. Carregado SOMENTE quando o
// usuário entra no módulo (chunk lazy) — nada aqui roda no login nem entra
// no PortalStore global. Leituras vão direto ao Supabase sob RLS (tabelas
// peopleflow_dev_*, perfil/escopo aplicados no banco); gravações passam por
// api/desenvolvimento.ts. Todas as listas são paginadas.

import { supabase } from "../../lib/supabaseClient";

export const TAMANHO_PAGINA = 50;

export type PerfilDesenvolvimento = "RH" | "Gestor";

export interface PessoaDesenvolvimento {
  id: number;
  nome: string;
  cargo: string;
  departamento: string;
}

export type SessaoDesenvolvimento =
  | { instalado: false; perfil: PerfilDesenvolvimento }
  | { instalado: true; perfil: PerfilDesenvolvimento; colaboradorId: number; pessoas: PessoaDesenvolvimento[] };

export class SemAcessoDesenvolvimentoError extends Error {}

export interface Pagina<T> {
  itens: T[];
  total: number;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function iniciarSessao(): Promise<SessaoDesenvolvimento> {
  const res = await fetch("/api/desenvolvimento?acao=sessao", { method: "POST", headers: await authHeaders() });
  const body = (await res.json().catch(() => ({}))) as { error?: string; codigo?: string } & Partial<SessaoDesenvolvimento>;
  if (res.status === 403) throw new SemAcessoDesenvolvimentoError(body.error ?? "Sem acesso ao módulo.");
  if (!res.ok) throw new Error(body.error ?? `Falha ao abrir o módulo (${res.status}).`);
  return body as SessaoDesenvolvimento;
}

function faixa(pagina: number): [number, number] {
  const de = pagina * TAMANHO_PAGINA;
  return [de, de + TAMANHO_PAGINA - 1];
}

function falha(contexto: string, message: string): never {
  throw new Error(`${contexto}: ${message}`);
}

// ── Lista Mestra ────────────────────────────────────────────────────────
export interface ItemListaMestra {
  codigo: string;
  titulo: string;
  revisao_atual: string;
  data_revisao: string | null;
  situacao: "vigente" | "obsoleto";
  periodicidade_meses: number | null;
}

export async function listarListaMestra(pagina: number, busca: string): Promise<Pagina<ItemListaMestra>> {
  let q = supabase
    .from("peopleflow_dev_lista_mestra")
    .select("codigo, titulo, revisao_atual, data_revisao, situacao, periodicidade_meses", { count: "exact" })
    .order("codigo")
    .range(...faixa(pagina));
  const termo = busca.trim().replace(/[%,()]/g, " ");
  if (termo) q = q.or(`codigo.ilike.%${termo}%,titulo.ilike.%${termo}%`);
  const { data, error, count } = await q;
  if (error) falha("Lista Mestra", error.message);
  return { itens: (data ?? []) as ItemListaMestra[], total: count ?? 0 };
}

export async function titulosListaMestra(codigos: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(codigos.filter(Boolean))];
  if (unicos.length === 0) return new Map();
  const { data, error } = await supabase.from("peopleflow_dev_lista_mestra").select("codigo, titulo").in("codigo", unicos);
  if (error) falha("Lista Mestra", error.message);
  return new Map((data ?? []).map((r) => [r.codigo as string, r.titulo as string]));
}

// ── Habilidades e requisitos ────────────────────────────────────────────
export interface Habilidade {
  id: number;
  nome: string;
  descricao: string;
  tipo: "tecnica" | "regulatoria";
  norma: string | null;
  ativo: boolean;
}

export async function listarHabilidades(pagina: number): Promise<Pagina<Habilidade>> {
  const { data, error, count } = await supabase
    .from("peopleflow_dev_habilidades")
    .select("id, nome, descricao, tipo, norma, ativo", { count: "exact" })
    .order("nome")
    .range(...faixa(pagina));
  if (error) falha("Habilidades", error.message);
  return { itens: (data ?? []) as Habilidade[], total: count ?? 0 };
}

export interface RequisitoCargo {
  id: number;
  tipo_requisito: "habilidade" | "treinamento";
  obrigatorio: boolean;
  periodicidade_meses: number | null;
  prazo_apos_admissao_dias: number | null;
  recicla_na_revisao: boolean;
  status: "sugerido" | "vigente" | "inativo";
  lista_mestra_codigo: string | null;
  habilidade: { nome: string } | null;
  lista_mestra: { titulo: string; periodicidade_meses: number | null } | null;
}

export async function listarRequisitosDoCargo(cargoNome: string): Promise<RequisitoCargo[]> {
  const { data, error } = await supabase
    .from("peopleflow_dev_cargo_requisitos")
    .select(
      "id, tipo_requisito, obrigatorio, periodicidade_meses, prazo_apos_admissao_dias, recicla_na_revisao, status, lista_mestra_codigo, habilidade:peopleflow_dev_habilidades(nome), lista_mestra:peopleflow_dev_lista_mestra(titulo, periodicidade_meses)",
    )
    .eq("cargo_nome", cargoNome)
    .neq("status", "inativo")
    .order("tipo_requisito")
    .limit(500);
  if (error) falha("Requisitos do cargo", error.message);
  return (data ?? []) as unknown as RequisitoCargo[];
}

// ── Conformidade / histórico ────────────────────────────────────────────
export type Situacao = "em_dia" | "a_vencer" | "vencido" | "revisao_pendente" | "agendado" | "no_prazo_integracao" | "pendente";

export interface LinhaConformidade {
  colaborador_id: number;
  requisito_id: number;
  cargo_nome: string;
  lista_mestra_codigo: string;
  revisao_atual: string;
  revisao_realizada: string | null;
  ultima_realizacao: string | null;
  validade_ate: string | null;
  situacao: Situacao;
}

const COLUNAS_CONFORMIDADE = "colaborador_id, requisito_id, cargo_nome, lista_mestra_codigo, revisao_atual, revisao_realizada, ultima_realizacao, validade_ate, situacao";

export async function listarGaps(pagina: number, situacoes: Situacao[]): Promise<Pagina<LinhaConformidade>> {
  const { data, error, count } = await supabase
    .from("peopleflow_dev_v_conformidade")
    .select(COLUNAS_CONFORMIDADE, { count: "exact" })
    .in("situacao", situacoes)
    .order("validade_ate", { ascending: true, nullsFirst: true })
    .order("colaborador_id")
    .range(...faixa(pagina));
  if (error) falha("Gaps", error.message);
  return { itens: (data ?? []) as LinhaConformidade[], total: count ?? 0 };
}

export async function conformidadeDoColaborador(colaboradorId: number): Promise<LinhaConformidade[]> {
  const { data, error } = await supabase
    .from("peopleflow_dev_v_conformidade")
    .select(COLUNAS_CONFORMIDADE)
    .eq("colaborador_id", colaboradorId)
    .order("lista_mestra_codigo")
    .limit(500);
  if (error) falha("Conformidade", error.message);
  return (data ?? []) as LinhaConformidade[];
}

export interface LinhaHistorico {
  participante_id: number;
  treinamento_codigo: string;
  titulo: string;
  tipo: "interno" | "externo";
  lista_mestra_codigo: string | null;
  lista_mestra_revisao: string | null;
  data_realizacao: string | null;
  carga_horaria_min: number | null;
  validade_ate: string | null;
}

export async function historicoDoColaborador(colaboradorId: number): Promise<LinhaHistorico[]> {
  const { data, error } = await supabase
    .from("peopleflow_dev_v_historico")
    .select("participante_id, treinamento_codigo, titulo, tipo, lista_mestra_codigo, lista_mestra_revisao, data_realizacao, carga_horaria_min, validade_ate")
    .eq("colaborador_id", colaboradorId)
    .order("data_realizacao", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) falha("Histórico", error.message);
  return (data ?? []) as LinhaHistorico[];
}

// ── Treinamentos ────────────────────────────────────────────────────────
export type StatusTreinamento = "planejado" | "em_andamento" | "concluido" | "cancelado";

export interface Treinamento {
  id: number;
  codigo: string;
  titulo: string;
  tipo: "interno" | "externo";
  modalidade: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  carga_horaria_min: number | null;
  status: StatusTreinamento;
  lista_mestra_codigo: string | null;
}

export async function listarTreinamentos(pagina: number, status: StatusTreinamento[], recentesPrimeiro: boolean): Promise<Pagina<Treinamento>> {
  const { data, error, count } = await supabase
    .from("peopleflow_dev_treinamentos")
    .select("id, codigo, titulo, tipo, modalidade, data_inicio, data_fim, carga_horaria_min, status, lista_mestra_codigo", { count: "exact" })
    .in("status", status)
    .order(recentesPrimeiro ? "data_fim" : "data_inicio", { ascending: !recentesPrimeiro, nullsFirst: false })
    .order("id", { ascending: !recentesPrimeiro })
    .range(...faixa(pagina));
  if (error) falha("Treinamentos", error.message);
  return { itens: (data ?? []) as Treinamento[], total: count ?? 0 };
}

// ── LNT ─────────────────────────────────────────────────────────────────
export type OrigemNecessidade = "habilidade" | "treinamento_obrigatorio" | "revisao_pop" | "integracao" | "gestor" | "pdi" | "rh";
export type StatusNecessidade = "aberta" | "planejada" | "atendida" | "cancelada";

export interface Necessidade {
  id: number;
  colaborador_id: number | null;
  cargo_nome: string | null;
  origem: OrigemNecessidade;
  descricao: string;
  prioridade: "alta" | "media" | "baixa" | null;
  prazo: string | null;
  status: StatusNecessidade;
  created_at: string;
}

export async function listarNecessidades(pagina: number, status: StatusNecessidade[], origem: OrigemNecessidade | null): Promise<Pagina<Necessidade>> {
  let q = supabase
    .from("peopleflow_dev_necessidades")
    .select("id, colaborador_id, cargo_nome, origem, descricao, prioridade, prazo, status, created_at", { count: "exact" })
    .in("status", status)
    .order("created_at", { ascending: false })
    .range(...faixa(pagina));
  if (origem) q = q.eq("origem", origem);
  const { data, error, count } = await q;
  if (error) falha("LNT", error.message);
  return { itens: (data ?? []) as Necessidade[], total: count ?? 0 };
}

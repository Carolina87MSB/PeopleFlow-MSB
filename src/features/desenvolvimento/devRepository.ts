// Acesso a dados do módulo Desenvolvimento. Carregado SOMENTE quando o
// usuário entra no módulo (chunk lazy) — nada aqui roda no login nem entra
// no PortalStore global. Leituras vão direto ao Supabase sob RLS (tabelas
// peopleflow_dev_*, perfil/escopo aplicados no banco); gravações passam por
// api/desenvolvimento.ts. Todas as listas são paginadas.

import { supabase } from "../../lib/supabaseClient";

export const TAMANHO_PAGINA = 50;

/** "Responsavel": conta que só conduz treinamentos (responsável/instrutor) — vê apenas esses. */
export type PerfilDesenvolvimento = "RH" | "Gestor" | "Responsavel";

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
  observacao: string;
}

export async function listarListaMestra(pagina: number, busca: string, situacao: "vigente" | "obsoleto" | null = null): Promise<Pagina<ItemListaMestra>> {
  let q = supabase
    .from("peopleflow_dev_lista_mestra")
    .select("codigo, titulo, revisao_atual, data_revisao, situacao, periodicidade_meses, observacao", { count: "exact" })
    .order("codigo")
    .range(...faixa(pagina));
  if (situacao) q = q.eq("situacao", situacao);
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
  categoria: string | null;
  ativo: boolean;
}

export interface FiltroHabilidades {
  busca: string;
  tipo: "tecnica" | "regulatoria" | null;
  ativo: boolean | null;
}

export async function listarHabilidades(pagina: number, filtro: FiltroHabilidades): Promise<Pagina<Habilidade>> {
  let q = supabase
    .from("peopleflow_dev_habilidades")
    .select("id, nome, descricao, tipo, norma, categoria, ativo", { count: "exact" })
    .order("nome")
    .range(...faixa(pagina));
  const termo = filtro.busca.trim().replace(/[%,()]/g, " ");
  if (termo) q = q.or(`nome.ilike.%${termo}%,categoria.ilike.%${termo}%,descricao.ilike.%${termo}%`);
  if (filtro.tipo) q = q.eq("tipo", filtro.tipo);
  if (filtro.ativo !== null) q = q.eq("ativo", filtro.ativo);
  const { data, error, count } = await q;
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
  status: StatusRequisito;
  status_motivo: string | null;
  lista_mestra_codigo: string | null;
  habilidade_id: number | null;
  descricao_sugerida: string | null;
  observacao: string;
  justificativa: string;
  origem: "rh" | "gestor" | "importacao";
  sugerido_por_colaborador_id: number | null;
  validado_em: string | null;
  created_at: string;
  updated_at: string;
  habilidade: { nome: string; ativo: boolean } | null;
  lista_mestra: { titulo: string; periodicidade_meses: number | null; situacao: string } | null;
}

export type StatusRequisito = "sugerido" | "vigente" | "inativo";

const COLUNAS_REQUISITO =
  "id, tipo_requisito, obrigatorio, periodicidade_meses, prazo_apos_admissao_dias, recicla_na_revisao, status, status_motivo, lista_mestra_codigo, habilidade_id, descricao_sugerida, observacao, justificativa, origem, sugerido_por_colaborador_id, validado_em, created_at, updated_at, habilidade:peopleflow_dev_habilidades(nome, ativo), lista_mestra:peopleflow_dev_lista_mestra(titulo, periodicidade_meses, situacao)";

/** O RLS decide o que cada perfil vê: RH tudo; Gestor só vigentes dos cargos da equipe + as próprias sugestões. */
export async function listarRequisitosDoCargo(cargoNome: string, status: StatusRequisito[]): Promise<RequisitoCargo[]> {
  const { data, error } = await supabase
    .from("peopleflow_dev_cargo_requisitos")
    .select(COLUNAS_REQUISITO)
    .eq("cargo_nome", cargoNome)
    .in("status", status)
    .order("tipo_requisito")
    .order("id")
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

// ── Treinamentos (Fase 5) ───────────────────────────────────────────────
export type StatusTreinamento = "solicitado" | "planejado" | "em_andamento" | "concluido" | "cancelado";
export type OrigemTreinamento = "desenvolvimento" | "pop_it" | "revisao_documental" | "integracao" | "requisito_regulatorio" | "reciclagem" | "operacional" | "outro";

export interface Treinamento {
  id: number;
  codigo: string;
  titulo: string;
  origem_tipo: OrigemTreinamento;
  lista_mestra_codigo: string | null;
  lista_mestra_revisao: string | null;
  lista_mestra_titulo: string | null;
  tipo: "interno" | "externo";
  modalidade: "presencial" | "ead" | "hibrido" | null;
  data_inicio: string | null;
  data_fim: string | null;
  carga_horaria_min: number | null;
  instrutor_colaborador_id: number | null;
  instrutor_externo: string | null;
  responsavel_colaborador_id: number | null;
  justificativa: string;
  local_link: string;
  observacao: string;
  exige_eficacia: boolean;
  eficacia_prazo: string | null;
  data_realizacao: string | null;
  carga_realizada_min: number | null;
  status: StatusTreinamento;
  status_motivo: string | null;
  solicitado_por_colaborador_id: number | null;
  planejado_em: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
  created_at: string;
  updated_at: string;
}

const COLUNAS_TREINAMENTO =
  "id, codigo, titulo, origem_tipo, lista_mestra_codigo, lista_mestra_revisao, lista_mestra_titulo, tipo, modalidade, data_inicio, data_fim, carga_horaria_min, instrutor_colaborador_id, instrutor_externo, responsavel_colaborador_id, justificativa, local_link, observacao, exige_eficacia, eficacia_prazo, data_realizacao, carga_realizada_min, status, status_motivo, solicitado_por_colaborador_id, planejado_em, iniciado_em, concluido_em, created_at, updated_at";

export type TreinamentoNaLista = Treinamento & { participantes: { count: number }[] };

export interface FiltroTreinamentos {
  status: StatusTreinamento[];
  busca: string;
  origem: OrigemTreinamento | null;
  recentesPrimeiro: boolean;
  /** Só os que a pessoa conduz (responsável ou instrutor). */
  conduzidosPor?: number;
}

/** O RLS decide o que cada perfil vê (RH tudo; Gestor equipe/solicitados/conduzidos; Responsável só os que conduz). */
export async function listarTreinamentos(pagina: number, f: FiltroTreinamentos): Promise<Pagina<TreinamentoNaLista>> {
  let q = supabase
    .from("peopleflow_dev_treinamentos")
    .select(`${COLUNAS_TREINAMENTO}, participantes:peopleflow_dev_participantes(count)`, { count: "exact" })
    .in("status", f.status)
    .is("participantes.removido_em", null)
    .order(f.recentesPrimeiro ? "data_realizacao" : "data_inicio", { ascending: !f.recentesPrimeiro, nullsFirst: false })
    .order("id", { ascending: !f.recentesPrimeiro })
    .range(...faixa(pagina));
  const termo = f.busca.trim().replace(/[%,()]/g, " ");
  if (termo) q = q.or(`titulo.ilike.%${termo}%,codigo.ilike.%${termo}%,lista_mestra_codigo.ilike.%${termo}%`);
  if (f.origem) q = q.eq("origem_tipo", f.origem);
  if (f.conduzidosPor) q = q.or(`responsavel_colaborador_id.eq.${f.conduzidosPor},instrutor_colaborador_id.eq.${f.conduzidosPor}`);
  const { data, error, count } = await q;
  if (error) falha("Treinamentos", error.message);
  return { itens: (data ?? []) as unknown as TreinamentoNaLista[], total: count ?? 0 };
}

export async function obterTreinamento(id: number): Promise<Treinamento | null> {
  const { data, error } = await supabase.from("peopleflow_dev_treinamentos").select(COLUNAS_TREINAMENTO).eq("id", id).maybeSingle();
  if (error) falha("Treinamento", error.message);
  return (data as Treinamento | null) ?? null;
}

export type ResultadoEficacia = "eficaz" | "parcialmente_eficaz" | "nao_eficaz";

export interface Participante {
  id: number;
  treinamento_id: number;
  colaborador_id: number;
  origem_inclusao: "manual" | "criterio" | "lnt";
  presenca_status: "pendente" | "presente" | "ausente";
  presenca_metodo: "manual" | "qr" | "login" | "importacao" | null;
  presenca_em: string | null;
  presenca_motivo: string | null;
  eficacia_resultado: ResultadoEficacia | null;
  eficacia_observacao: string | null;
  eficacia_em: string | null;
  removido_em: string | null;
  removido_motivo: string | null;
  pessoa: PessoaDesenvolvimento | null;
}

/** Nomes vêm do cadastro oficial (colaboradores), nunca de cópia local. */
export async function pessoasPorId(ids: number[]): Promise<Map<number, PessoaDesenvolvimento>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return new Map();
  const { data, error } = await supabase.from("colaboradores").select("id, nome, cargo, departamento").in("id", unicos);
  if (error) falha("Colaboradores", error.message);
  return new Map(
    (data ?? []).map((r) => [Number(r.id), { id: Number(r.id), nome: r.nome as string, cargo: (r.cargo as string | null) ?? "", departamento: (r.departamento as string | null) ?? "" }]),
  );
}

export async function listarParticipantes(treinamentoId: number): Promise<Participante[]> {
  const { data, error } = await supabase
    .from("peopleflow_dev_participantes")
    .select(
      "id, treinamento_id, colaborador_id, origem_inclusao, presenca_status, presenca_metodo, presenca_em, presenca_motivo, eficacia_resultado, eficacia_observacao, eficacia_em, removido_em, removido_motivo",
    )
    .eq("treinamento_id", treinamentoId)
    .order("id")
    .limit(1000);
  if (error) falha("Participantes", error.message);
  const linhas = (data ?? []) as Omit<Participante, "pessoa">[];
  const nomes = await pessoasPorId(linhas.map((p) => p.colaborador_id));
  return linhas
    .map((p) => ({ ...p, pessoa: nomes.get(p.colaborador_id) ?? null }))
    .sort((a, b) => (a.pessoa?.nome ?? "").localeCompare(b.pessoa?.nome ?? "", "pt-BR"));
}

export interface VinculoNecessidade {
  id: number;
  necessidade_id: number;
  vinculado_em: string;
  necessidade: Pick<Necessidade, "id" | "colaborador_id" | "descricao" | "status" | "categoria" | "prioridade" | "origem"> | null;
}

/** Somente RH e Gestor (RLS). */
export async function listarVinculos(treinamentoId: number): Promise<VinculoNecessidade[]> {
  const { data, error } = await supabase
    .from("peopleflow_dev_treinamento_necessidades")
    .select("id, necessidade_id, vinculado_em, necessidade:peopleflow_dev_necessidades(id, colaborador_id, descricao, status, categoria, prioridade, origem)")
    .eq("treinamento_id", treinamentoId)
    .eq("ativo", true)
    .order("id")
    .limit(1000);
  if (error) falha("Necessidades vinculadas", error.message);
  return (data ?? []) as unknown as VinculoNecessidade[];
}

export type TipoEvidencia = "lista_presenca" | "certificado" | "material" | "ata" | "foto" | "comprovante" | "avaliacao" | "outro";

export interface Evidencia {
  id: number;
  participante_id: number | null;
  tipo: TipoEvidencia;
  file_name: string;
  mime: string | null;
  tamanho_bytes: number | null;
  observacao: string;
  enviado_em: string;
  substituida_em: string | null;
  substituida_motivo: string | null;
}

export async function listarEvidencias(treinamentoId: number): Promise<Evidencia[]> {
  const { data, error } = await supabase
    .from("peopleflow_dev_evidencias")
    .select("id, participante_id, tipo, file_name, mime, tamanho_bytes, observacao, enviado_em, substituida_em, substituida_motivo")
    .eq("treinamento_id", treinamentoId)
    .order("enviado_em", { ascending: false })
    .limit(500);
  if (error) falha("Evidências", error.message);
  return (data ?? []) as Evidencia[];
}

const BUCKET_EVIDENCIAS = "desenvolvimento-evidencias";

/** Envio em 3 passos: o servidor emite a URL assinada → o arquivo vai direto ao bucket privado → o servidor confere e registra. */
export async function enviarEvidencia(treinamentoId: number, arquivo: File, tipo: TipoEvidencia, participanteId: number | null, observacao: string): Promise<Evidencia> {
  const alvo = await gravar<{ path: string; token: string }>("evidencia_upload_url", {
    treinamento_id: treinamentoId,
    tipo,
    file_name: arquivo.name,
    mime: arquivo.type,
    tamanho_bytes: arquivo.size,
  });
  const { error } = await supabase.storage.from(BUCKET_EVIDENCIAS).uploadToSignedUrl(alvo.path, alvo.token, arquivo, { contentType: arquivo.type });
  if (error) falha("Envio do arquivo", error.message);
  return gravar<Evidencia>("evidencia_registrar", { treinamento_id: treinamentoId, participante_id: participanteId, path: alvo.path, tipo, file_name: arquivo.name, mime: arquivo.type, observacao });
}

// ── LNT ─────────────────────────────────────────────────────────────────
export type OrigemNecessidade = "habilidade" | "treinamento_obrigatorio" | "revisao_pop" | "integracao" | "gestor" | "pdi" | "rh" | "operacional";
export type StatusNecessidade = "sugerida" | "validada" | "planejada" | "atendida" | "cancelada";
export type CategoriaNecessidade = "tecnica" | "qualidade_regulatorio" | "seguranca" | "sistemas_ferramentas" | "comportamental" | "lideranca" | "integracao" | "outra";
export type Prioridade = "alta" | "media" | "baixa";

export interface Necessidade {
  id: number;
  colaborador_id: number | null;
  cargo_nome: string | null;
  origem: OrigemNecessidade;
  descricao: string;
  justificativa: string;
  categoria: CategoriaNecessidade | null;
  prioridade: Prioridade | null;
  sugestao_capacitacao: string;
  observacao: string;
  status: StatusNecessidade;
  status_motivo: string | null;
  gestor_colaborador_id: number | null;
  departamento: string | null;
  requisito_id: number | null;
  pdi_id: number | null;
  pdi_item_id: string | null;
  pdi_acao_id: string | null;
  pdi_item_nome: string | null;
  grupo_id: number | null;
  solicitado_por_colaborador_id: number | null;
  validada_em: string | null;
  created_at: string;
  updated_at: string;
}

export const COLUNAS_NECESSIDADE =
  "id, colaborador_id, cargo_nome, origem, descricao, justificativa, categoria, prioridade, sugestao_capacitacao, observacao, status, status_motivo, gestor_colaborador_id, departamento, requisito_id, pdi_id, pdi_item_id, pdi_acao_id, pdi_item_nome, grupo_id, solicitado_por_colaborador_id, validada_em, created_at, updated_at";

export interface FiltroNecessidades {
  status: StatusNecessidade[];
  busca: string;
  origem: OrigemNecessidade | null;
  categoria: CategoriaNecessidade | null;
  prioridade: Prioridade | null;
  colaboradorId: number | null;
  gestorId: number | null;
  departamento: string | null;
  grupoId: number | null;
}

/** O RLS decide o escopo: RH vê tudo; Gestor, a própria equipe e o que registrou. */
export async function listarNecessidades(pagina: number, f: FiltroNecessidades): Promise<Pagina<Necessidade>> {
  let q = supabase
    .from("peopleflow_dev_necessidades")
    .select(COLUNAS_NECESSIDADE, { count: "exact" })
    .in("status", f.status)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(...faixa(pagina));
  const termo = f.busca.trim().replace(/[%,()]/g, " ");
  if (termo) q = q.or(`descricao.ilike.%${termo}%,sugestao_capacitacao.ilike.%${termo}%,justificativa.ilike.%${termo}%`);
  if (f.origem) q = q.eq("origem", f.origem);
  if (f.categoria) q = q.eq("categoria", f.categoria);
  if (f.prioridade) q = q.eq("prioridade", f.prioridade);
  if (f.colaboradorId) q = q.eq("colaborador_id", f.colaboradorId);
  if (f.gestorId) q = q.eq("gestor_colaborador_id", f.gestorId);
  if (f.departamento) q = q.eq("departamento", f.departamento);
  if (f.grupoId) q = q.eq("grupo_id", f.grupoId);
  const { data, error, count } = await q;
  if (error) falha("Necessidades", error.message);
  return { itens: (data ?? []) as Necessidade[], total: count ?? 0 };
}

export async function obterNecessidade(id: number): Promise<Necessidade | null> {
  const { data, error } = await supabase.from("peopleflow_dev_necessidades").select(COLUNAS_NECESSIDADE).eq("id", id).maybeSingle();
  if (error) falha("Necessidade", error.message);
  return (data as Necessidade | null) ?? null;
}

export interface GrupoNecessidades {
  id: number;
  titulo: string;
  categoria: CategoriaNecessidade | null;
}

/** Somente RH (RLS). */
export async function listarGrupos(): Promise<GrupoNecessidades[]> {
  const { data, error } = await supabase.from("peopleflow_dev_necessidade_grupos").select("id, titulo, categoria").eq("ativo", true).order("titulo").limit(1000);
  if (error) falha("Grupos", error.message);
  return (data ?? []) as GrupoNecessidades[];
}

/** Ações do PDI que já viraram necessidade ou foram dispensadas (para não sugerir de novo). Somente RH. */
export async function acoesPdiJaTratadas(): Promise<Set<string>> {
  const [nec, disp] = await Promise.all([
    supabase.from("peopleflow_dev_necessidades").select("pdi_acao_id").not("pdi_acao_id", "is", null).limit(5000),
    supabase.from("peopleflow_dev_pdi_sugestoes_dispensadas").select("pdi_acao_id").limit(5000),
  ]);
  if (nec.error) falha("Necessidades", nec.error.message);
  if (disp.error) falha("Sugestões dispensadas", disp.error.message);
  return new Set([...(nec.data ?? []), ...(disp.data ?? [])].map((r) => r.pdi_acao_id as string));
}

export interface OpcaoRequisito {
  id: number;
  tipo_requisito: "habilidade" | "treinamento";
  descricao: string;
}

/** Requisitos VIGENTES do cargo — única fonte permitida para necessidade de origem "requisito". */
export async function requisitosVigentesDoCargo(cargoNome: string): Promise<OpcaoRequisito[]> {
  const { data, error } = await supabase
    .from("peopleflow_dev_cargo_requisitos")
    .select("id, tipo_requisito, lista_mestra_codigo, habilidade:peopleflow_dev_habilidades(nome), lista_mestra:peopleflow_dev_lista_mestra(titulo)")
    .eq("cargo_nome", cargoNome)
    .eq("status", "vigente")
    .order("id")
    .limit(500);
  if (error) falha("Requisitos", error.message);
  return ((data ?? []) as unknown as { id: number; tipo_requisito: "habilidade" | "treinamento"; lista_mestra_codigo: string | null; habilidade: { nome: string } | null; lista_mestra: { titulo: string } | null }[]).map(
    (r) => ({ id: r.id, tipo_requisito: r.tipo_requisito, descricao: r.habilidade?.nome ?? `${r.lista_mestra_codigo} — ${r.lista_mestra?.titulo ?? ""}` }),
  );
}

// ── Opções para formulários (carregadas só ao abrir o formulário) ───────
export interface OpcaoListaMestra {
  codigo: string;
  titulo: string;
  periodicidade_meses: number | null;
}

export async function opcoesListaMestra(): Promise<OpcaoListaMestra[]> {
  const { data, error } = await supabase
    .from("peopleflow_dev_lista_mestra")
    .select("codigo, titulo, periodicidade_meses")
    .eq("situacao", "vigente")
    .order("codigo")
    .limit(2000);
  if (error) falha("Lista Mestra", error.message);
  return (data ?? []) as OpcaoListaMestra[];
}

export interface OpcaoHabilidade {
  id: number;
  nome: string;
  categoria: string | null;
}

export async function opcoesHabilidades(): Promise<OpcaoHabilidade[]> {
  const { data, error } = await supabase.from("peopleflow_dev_habilidades").select("id, nome, categoria").eq("ativo", true).order("nome").limit(2000);
  if (error) falha("Habilidades", error.message);
  return (data ?? []) as OpcaoHabilidade[];
}

export async function categoriasHabilidades(): Promise<string[]> {
  const { data, error } = await supabase.from("peopleflow_dev_habilidades").select("categoria").not("categoria", "is", null).limit(2000);
  if (error) falha("Habilidades", error.message);
  return [...new Set((data ?? []).map((r) => r.categoria as string))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export interface RevisaoListaMestra {
  id: number;
  revisao: string;
  data_revisao: string | null;
  observacao: string;
  registrado_em: string;
}

export async function revisoesListaMestra(codigo: string): Promise<RevisaoListaMestra[]> {
  const { data, error } = await supabase
    .from("peopleflow_dev_lista_mestra_revisoes")
    .select("id, revisao, data_revisao, observacao, registrado_em")
    .eq("codigo", codigo)
    .order("registrado_em", { ascending: false })
    .limit(200);
  if (error) falha("Histórico de revisões", error.message);
  return (data ?? []) as RevisaoListaMestra[];
}

/** Relê um requisito com os nomes vinculados (habilidade/documento) depois de gravar. */
export async function obterRequisito(id: number): Promise<RequisitoCargo | null> {
  const { data, error } = await supabase.from("peopleflow_dev_cargo_requisitos").select(COLUNAS_REQUISITO).eq("id", id).maybeSingle();
  if (error) falha("Requisito", error.message);
  return (data as unknown as RequisitoCargo | null) ?? null;
}

// ── Gravações: sempre pelo servidor (api/desenvolvimento.ts) ────────────
export type AcaoGravacao =
  | "lista_mestra_salvar"
  | "lista_mestra_revisao"
  | "lista_mestra_situacao"
  | "habilidade_salvar"
  | "habilidade_ativo"
  | "requisito_salvar"
  | "requisito_status"
  | "requisito_sugerir"
  | "necessidade_registrar"
  | "necessidade_editar"
  | "necessidade_status"
  | "necessidade_consolidar"
  | "necessidade_desagrupar"
  | "pdi_sugestao_aceitar"
  | "pdi_sugestao_dispensar"
  | "treinamento_salvar"
  | "treinamento_realizacao"
  | "treinamento_planejar"
  | "treinamento_iniciar"
  | "treinamento_concluir"
  | "treinamento_cancelar"
  | "participantes_adicionar"
  | "participante_remover"
  | "necessidades_vincular"
  | "necessidade_desvincular"
  | "presenca_manual"
  | "qr_gerar"
  | "qr_encerrar"
  | "evidencia_upload_url"
  | "evidencia_registrar"
  | "evidencia_url"
  | "evidencia_substituir"
  | "eficacia_registrar";

export async function gravar<T>(acao: AcaoGravacao, corpo: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/desenvolvimento?acao=${acao}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(corpo),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; dados?: T };
  if (!res.ok) throw new Error(body.error ?? `Falha ao salvar (${res.status}).`);
  return body.dados as T;
}

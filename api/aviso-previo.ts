// Vercel Function: ciclo completo do Aviso Prévio Indenizado de uma MP de
// Desligamento (RH, 2026-09) — geração automática, upload do documento
// assinado e emissão de URL assinada para visualizar/baixar. Bucket privado
// (`movimentacoes-documentos`) sem nenhuma policy de "authenticated" em
// storage.objects: todo acesso passa por aqui, autorizado via
// requireRHOuGestorDoColaborador() (RH sempre; Gestor só se o colaborador
// estiver no seu escopo hierárquico — nunca "ou for ele mesmo").
//
// Localiza o colaborador e autoriza SEMPRE por `colaborador_id`, nunca por
// nome (pedido explícito da RH — ver comentário da migration 36 em
// supabase/schema.sql). O CPF é lido aqui, direto da tabela física
// `colaboradores`, e nunca devolvido ao navegador — só usado internamente
// para desenhar o PDF.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireRHOuGestorDoColaborador, supabaseAdmin } from "./_lib/adminAuth.js";
import { dataBrParaIso } from "../src/domain/dates.js";
import { gerarAvisoPrevioIndenizadoPdf, formatarDataExtenso, formatarCpf } from "./_lib/avisoPrevioPdf.js";
import type { DadoField } from "../src/types/domain.js";

const BUCKET = "movimentacoes-documentos";
const TIPO_GERADO = "aviso_previo_indenizado_gerado";
const TIPO_ASSINADO = "aviso_previo_indenizado_assinado";
const MIMES_ASSINADO = new Set(["application/pdf", "image/jpeg", "image/png"]);

interface MovimentacaoRow {
  id: string;
  tipo_cod: string;
  status: string;
  colaborador: string;
  colaborador_id: number | null;
  tipo_aviso_previo: string | null;
  dados: DadoField[] | null;
}

interface DocumentoRow {
  id: number;
  movimentacao_id: string;
  colaborador_id: number;
  colaborador_nome: string;
  tipo: string;
  versao: number;
  storage_path: string;
  file_name: string;
  mime: string;
  tamanho_bytes: number | null;
  origem: string;
  situacao: string;
  documento_original_id: number | null;
  substituido_em: string | null;
  substituido_por: string | null;
  substituido_motivo: string | null;
  criado_por: string;
  criado_em: string;
}

async function lerMovimentacao(id: string): Promise<MovimentacaoRow> {
  const { data, error } = await supabaseAdmin
    .from("peopleflow_movimentacoes")
    .select("id, tipo_cod, status, colaborador, colaborador_id, tipo_aviso_previo, dados")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw Object.assign(new Error("Movimentação não encontrada."), { status: 404 });
  return data as MovimentacaoRow;
}

function sanitizarNomeArquivo(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(-120);
}

/** Gera o Aviso Prévio Indenizado (chamado automaticamente ao concluir a
 * última etapa de aprovação — ver aprovarEtapaFn em src/store/usePortalData.ts).
 * Idempotente: se já existir um documento ATIVO do tipo "gerado" para esta
 * MP, não gera de novo (protege contra reprocessamento/refresh). */
async function gerar(movimentacaoId: string) {
  const mov = await lerMovimentacao(movimentacaoId);
  if (mov.tipo_cod !== "DES") throw Object.assign(new Error("Movimentação não é de Desligamento."), { status: 422 });
  if (mov.status !== "Aprovado") throw Object.assign(new Error("Movimentação ainda não foi aprovada."), { status: 422 });
  if (mov.tipo_aviso_previo !== "indenizado") return { gerado: false, motivo: "tipo_nao_indenizado" as const };
  if (!mov.colaborador_id) return { gerado: false, motivo: "sem_colaborador_id" as const };

  const { data: existente, error: exErro } = await supabaseAdmin
    .from("peopleflow_movimentacoes_documentos")
    .select("id")
    .eq("movimentacao_id", movimentacaoId)
    .eq("tipo", TIPO_GERADO)
    .eq("situacao", "ativo")
    .maybeSingle();
  if (exErro) throw new Error(exErro.message);
  if (existente) return { gerado: false, motivo: "ja_existe" as const };

  const dataPrevistaBr = (mov.dados ?? []).find((d) => d.label === "Data prevista")?.value;
  const dataPrevistaIso = dataBrParaIso(dataPrevistaBr);
  if (!dataPrevistaIso) {
    throw Object.assign(new Error('Campo "Data prevista" ausente ou inválido — não é possível gerar o Aviso Prévio.'), { status: 422 });
  }

  const { data: colabRow, error: colabErro } = await supabaseAdmin
    .from("colaboradores")
    .select("nome, cargo, cpf")
    .eq("id", mov.colaborador_id)
    .maybeSingle();
  if (colabErro) throw new Error(colabErro.message);
  if (!colabRow) throw Object.assign(new Error("Colaborador não encontrado."), { status: 404 });

  const cpfFormatado = formatarCpf((colabRow as { cpf: string | null }).cpf);
  if (!cpfFormatado) {
    throw Object.assign(new Error("CPF do colaborador ausente ou inválido no cadastro — não é possível gerar o Aviso Prévio."), { status: 422 });
  }

  const bytes = await gerarAvisoPrevioIndenizadoPdf({
    nomeCompleto: (colabRow as { nome: string }).nome,
    cpf: cpfFormatado,
    cargo: (colabRow as { cargo: string | null }).cargo ?? "",
    dataExtenso: formatarDataExtenso(dataPrevistaIso),
  });

  const fileName = `Aviso Previo Indenizado - ${(colabRow as { nome: string }).nome}.pdf`;
  const path = `movimentacoes/${movimentacaoId}/${TIPO_GERADO}-v1-${Date.now()}.pdf`;
  const { error: upErro } = await supabaseAdmin.storage.from(BUCKET).upload(path, Buffer.from(bytes), {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErro) throw new Error(`Storage: ${upErro.message}`);

  const { error: insErro } = await supabaseAdmin.from("peopleflow_movimentacoes_documentos").insert({
    movimentacao_id: movimentacaoId,
    colaborador_id: mov.colaborador_id,
    colaborador_nome: (colabRow as { nome: string }).nome,
    tipo: TIPO_GERADO,
    versao: 1,
    storage_path: path,
    file_name: fileName,
    mime: "application/pdf",
    tamanho_bytes: bytes.byteLength,
    origem: "sistema",
    situacao: "ativo",
    criado_por: "sistema",
  });
  if (insErro) throw new Error(insErro.message);

  return { gerado: true as const };
}

async function lerDocumento(id: number): Promise<DocumentoRow> {
  const { data, error } = await supabaseAdmin.from("peopleflow_movimentacoes_documentos").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw Object.assign(new Error("Documento não encontrado."), { status: 404 });
  return data as DocumentoRow;
}

/** Passo 1 do upload do "Documento assinado": emite uma URL assinada de
 * upload direto pro Storage (o arquivo nunca passa pelo corpo desta
 * function). Autorização por colaborador_id da MOVIMENTAÇÃO (o documento
 * "assinado" ainda não existe neste passo). */
async function anexarPreparar(authHeader: string | string[] | undefined, movimentacaoId: string, fileName: string, mime: string) {
  const mov = await lerMovimentacao(movimentacaoId);
  if (!mov.colaborador_id) throw Object.assign(new Error("Movimentação sem colaborador vinculado."), { status: 422 });
  const auth = await requireRHOuGestorDoColaborador(authHeader, mov.colaborador_id);
  if (!auth.ok) throw Object.assign(new Error(auth.error), { status: auth.status });
  if (!MIMES_ASSINADO.has(mime)) throw Object.assign(new Error("Formato não permitido (envie PDF, JPG ou PNG)."), { status: 422 });

  const seguro = sanitizarNomeArquivo(fileName || "documento.pdf");
  const path = `movimentacoes/${movimentacaoId}/${TIPO_ASSINADO}-${Date.now()}-${seguro}`;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Storage: ${error?.message ?? "sem URL"}`);
  return { path, token: data.token };
}

/** Passo 2: confirma que o upload direto terminou e registra o documento —
 * se já existir um "assinado" ativo, marca-o substituído (nunca apaga) e
 * aponta documento_original_id pro "gerado" correspondente. */
async function anexarConfirmar(
  authHeader: string | string[] | undefined,
  movimentacaoId: string,
  path: string,
  fileName: string,
  mime: string,
) {
  const mov = await lerMovimentacao(movimentacaoId);
  if (!mov.colaborador_id) throw Object.assign(new Error("Movimentação sem colaborador vinculado."), { status: 422 });
  const auth = await requireRHOuGestorDoColaborador(authHeader, mov.colaborador_id);
  if (!auth.ok) throw Object.assign(new Error(auth.error), { status: auth.status });
  if (!path.startsWith(`movimentacoes/${movimentacaoId}/`)) throw Object.assign(new Error("Arquivo não pertence a esta movimentação."), { status: 422 });

  const pasta = path.slice(0, path.lastIndexOf("/"));
  const arquivo = path.slice(path.lastIndexOf("/") + 1);
  const { data: lista, error: lErro } = await supabaseAdmin.storage.from(BUCKET).list(pasta, { search: arquivo, limit: 5 });
  if (lErro) throw new Error(`Storage: ${lErro.message}`);
  const obj = (lista ?? []).find((o) => o.name === arquivo) as { name: string; metadata?: { size?: number } } | undefined;
  if (!obj) throw Object.assign(new Error("O envio do arquivo não foi concluído."), { status: 422 });

  const { data: gerado } = await supabaseAdmin
    .from("peopleflow_movimentacoes_documentos")
    .select("id")
    .eq("movimentacao_id", movimentacaoId)
    .eq("tipo", TIPO_GERADO)
    .eq("situacao", "ativo")
    .maybeSingle();

  const { data: anterior } = await supabaseAdmin
    .from("peopleflow_movimentacoes_documentos")
    .select("id")
    .eq("movimentacao_id", movimentacaoId)
    .eq("tipo", TIPO_ASSINADO)
    .eq("situacao", "ativo")
    .maybeSingle();

  const { data: todasVersoes, error: vErro } = await supabaseAdmin
    .from("peopleflow_movimentacoes_documentos")
    .select("versao")
    .eq("movimentacao_id", movimentacaoId)
    .eq("tipo", TIPO_ASSINADO);
  if (vErro) throw new Error(vErro.message);
  const proximaVersao = 1 + Math.max(0, ...((todasVersoes ?? []) as { versao: number }[]).map((v) => v.versao));

  if (anterior) {
    const { error: subErro } = await supabaseAdmin
      .from("peopleflow_movimentacoes_documentos")
      .update({ situacao: "substituido", substituido_em: new Date().toISOString(), substituido_por: auth.nomeSolicitante, substituido_motivo: "Substituído por novo envio." })
      .eq("id", (anterior as { id: number }).id);
    if (subErro) throw new Error(subErro.message);
  }

  const { error: insErro } = await supabaseAdmin.from("peopleflow_movimentacoes_documentos").insert({
    movimentacao_id: movimentacaoId,
    colaborador_id: mov.colaborador_id,
    colaborador_nome: auth.colaboradorNome,
    tipo: TIPO_ASSINADO,
    versao: proximaVersao,
    storage_path: path,
    file_name: fileName || arquivo,
    mime,
    tamanho_bytes: obj.metadata?.size ?? null,
    origem: "upload",
    situacao: "ativo",
    documento_original_id: gerado ? (gerado as { id: number }).id : null,
    criado_por: auth.nomeSolicitante,
  });
  if (insErro) throw new Error(insErro.message);
  return { ok: true };
}

/** URL assinada de curta duração (5 min) para visualizar/baixar um documento
 * já registrado — autorização pelo colaborador_id GRAVADO no próprio
 * documento (não recalculado a partir da movimentação, que pode ter mudado). */
async function urlAssinada(authHeader: string | string[] | undefined, documentoId: number, baixar: boolean) {
  const doc = await lerDocumento(documentoId);
  const auth = await requireRHOuGestorDoColaborador(authHeader, doc.colaborador_id);
  if (!auth.ok) throw Object.assign(new Error(auth.error), { status: auth.status });

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, 300, baixar ? { download: doc.file_name } : undefined);
  if (error || !data) throw new Error(`Storage: ${error?.message ?? "sem URL"}`);
  return { url: data.signedUrl };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Método não permitido." });
      return;
    }

    const acao = typeof req.query.acao === "string" ? req.query.acao : "";
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (acao === "gerar") {
      const movimentacaoId = String(body.movimentacaoId || "").trim();
      if (!movimentacaoId) {
        res.status(400).json({ error: "Informe a movimentação." });
        return;
      }
      res.status(200).json(await gerar(movimentacaoId));
      return;
    }

    if (acao === "anexar_preparar") {
      const movimentacaoId = String(body.movimentacaoId || "").trim();
      const fileName = String(body.fileName || "").trim();
      const mime = String(body.mime || "").trim();
      if (!movimentacaoId || !fileName) {
        res.status(400).json({ error: "Informe a movimentação e o arquivo." });
        return;
      }
      res.status(200).json(await anexarPreparar(req.headers.authorization, movimentacaoId, fileName, mime));
      return;
    }

    if (acao === "anexar_confirmar") {
      const movimentacaoId = String(body.movimentacaoId || "").trim();
      const path = String(body.path || "").trim();
      const fileName = String(body.fileName || "").trim();
      const mime = String(body.mime || "").trim();
      if (!movimentacaoId || !path) {
        res.status(400).json({ error: "Informe a movimentação e o arquivo." });
        return;
      }
      res.status(200).json(await anexarConfirmar(req.headers.authorization, movimentacaoId, path, fileName, mime));
      return;
    }

    if (acao === "url") {
      const documentoId = Number(body.documentoId);
      if (!documentoId) {
        res.status(400).json({ error: "Informe o documento." });
        return;
      }
      res.status(200).json(await urlAssinada(req.headers.authorization, documentoId, body.baixar !== false));
      return;
    }

    res.status(400).json({ error: "Ação inválida." });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    // eslint-disable-next-line no-console
    console.error("[api/aviso-previo]", err);
    res.status(status).json({ error: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}

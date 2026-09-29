// Camada de acesso ao ciclo do Aviso Prévio Indenizado — sempre via
// api/aviso-previo.ts (Vercel Function com service_role), nunca direto no
// Storage: o bucket `movimentacoes-documentos` é privado e contém CPF (ver
// comentário da migration 36 em supabase/schema.sql).

import { supabase } from "../lib/supabaseClient";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function chamar<T>(acao: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/aviso-previo?acao=${acao}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Falha na operação do Aviso Prévio.");
  return json as T;
}

/** Dispara a geração automática do Aviso Prévio Indenizado — chamado ao
 * concluir a última etapa de aprovação de uma MP de Desligamento (ver
 * aprovarEtapaFn em src/store/usePortalData.ts). Idempotente: se já existir
 * (ou se a MP não for elegível), retorna gerado=false sem erro. */
export async function gerarAvisoPrevio(movimentacaoId: string): Promise<{ gerado: boolean; motivo?: string }> {
  return chamar("gerar", { movimentacaoId });
}

/** Passo 1 do upload do "Documento assinado": pede uma URL assinada pra
 * enviar o arquivo direto ao Storage. */
export async function prepararUploadAssinado(movimentacaoId: string, fileName: string, mime: string): Promise<{ path: string; token: string }> {
  return chamar("anexar_preparar", { movimentacaoId, fileName, mime });
}

/** Passo 2: confirma o upload e registra o documento (substitui o anterior
 * sem apagá-lo, se já existir um "Documento assinado" ativo). */
export async function confirmarUploadAssinado(movimentacaoId: string, path: string, fileName: string, mime: string): Promise<void> {
  await chamar("anexar_confirmar", { movimentacaoId, path, fileName, mime });
}

/** URL assinada de curta duração para visualizar (baixar=false) ou baixar
 * (baixar=true, padrão) um documento já registrado. */
export async function obterUrlDocumento(documentoId: number, baixar = true): Promise<string> {
  const { url } = await chamar<{ url: string }>("url", { documentoId, baixar });
  return url;
}

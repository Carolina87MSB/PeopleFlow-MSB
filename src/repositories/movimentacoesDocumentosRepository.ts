// Leitura dos metadados de documentos de uma movimentação (hoje só o Aviso
// Prévio Indenizado usa) — direto do navegador, já que a tabela não tem CPF e
// a RLS libera SELECT pra qualquer autenticado (ver supabase/schema.sql,
// seção 36). O arquivo em si nunca é lido daqui: toda URL de download/
// visualização passa por api/aviso-previo.ts (ver avisoPrevioRepository.ts).

import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { SupabaseNotConfiguredError } from "./colaboradoresRepository";
import type { MovimentacaoDocumento } from "../types/domain";

interface MovimentacaoDocumentoRow {
  id: number;
  movimentacao_id: string;
  colaborador_id: number;
  colaborador_nome: string;
  tipo: string;
  versao: number;
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

function fromRow(row: MovimentacaoDocumentoRow): MovimentacaoDocumento {
  return {
    id: row.id,
    movimentacaoId: row.movimentacao_id,
    colaboradorId: row.colaborador_id,
    colaboradorNome: row.colaborador_nome,
    tipo: row.tipo,
    versao: row.versao,
    fileName: row.file_name,
    mime: row.mime,
    tamanhoBytes: row.tamanho_bytes,
    origem: row.origem as MovimentacaoDocumento["origem"],
    situacao: row.situacao as MovimentacaoDocumento["situacao"],
    documentoOriginalId: row.documento_original_id,
    substituidoEm: row.substituido_em,
    substituidoPor: row.substituido_por,
    substituidoMotivo: row.substituido_motivo,
    criadoPor: row.criado_por,
    criadoEm: row.criado_em,
  };
}

/** Documentos ATIVOS de uma movimentação (nunca traz `situacao=substituido`
 * — histórico de versões anteriores não tem tela própria ainda). */
export async function getDocumentosAtivos(movimentacaoId: string): Promise<MovimentacaoDocumento[]> {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();

  const { data, error } = await supabase
    .from("peopleflow_movimentacoes_documentos")
    .select("*")
    .eq("movimentacao_id", movimentacaoId)
    .eq("situacao", "ativo");
  if (error) throw new Error(`Falha ao carregar documentos da movimentação: ${error.message}`);
  return (data as MovimentacaoDocumentoRow[]).map(fromRow);
}

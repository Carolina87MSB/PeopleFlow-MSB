import { useEffect, useRef, useState } from "react";
import { usePortalData } from "../../store/usePortalData";
import { descendants } from "../../domain/hierarquia";
import { getDocumentosAtivos } from "../../repositories/movimentacoesDocumentosRepository";
import { gerarAvisoPrevio, obterUrlDocumento, enviarDocumentoAssinado } from "../../repositories/avisoPrevioRepository";
import { useToast } from "./ToastContext";
import type { Movimentacao, MovimentacaoDocumento } from "../../types/domain";
import styles from "./MovimentacaoDetalhe.module.css";

const TIPO_GERADO = "aviso_previo_indenizado_gerado";
const TIPO_ASSINADO = "aviso_previo_indenizado_assinado";
const MIMES_ACEITOS = ".pdf,.jpg,.jpeg,.png";

/** Substitui o antigo bloco mockado "Documentos gerados" só para Desligamento
 * (ver docsFor() em domain/documentos.ts, que agora devolve [] para DES) —
 * "Aviso prévio" com status real (nunca "Gerado" sem documento no Storage) e
 * "Documento assinado" (anexar/substituir, histórico preservado no banco).
 * Autorização (mesma regra do backend, ver requireRHOuGestorDoColaborador em
 * api/_lib/adminAuth.ts): RH sempre; Gestor só se o colaborador estiver no
 * seu escopo hierárquico — nunca "ou for ele mesmo". MPs sem colaboradorId
 * (anteriores a esta automação) mostram só o status, sem nenhuma ação. */
export function AvisoPrevioBloco({ movimentacao: m }: { movimentacao: Movimentacao }) {
  const { conta, colaboradores } = usePortalData();
  const { flash } = useToast();
  const [documentos, setDocumentos] = useState<MovimentacaoDocumento[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    setDocumentos(null);
    getDocumentosAtivos(m.id)
      .then((docs) => {
        if (vivo) setDocumentos(docs);
      })
      .catch((err) => {
        if (!vivo) return;
        setDocumentos([]);
        flash(err instanceof Error ? err.message : "Falha ao carregar documentos da movimentação.");
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id]);

  const carregando = documentos === null;
  const gerado = documentos?.find((d) => d.tipo === TIPO_GERADO);
  const assinado = documentos?.find((d) => d.tipo === TIPO_ASSINADO);
  const podeGerenciar =
    !!m.colaboradorId && (conta.perfil === "RH" || (conta.perfil === "Gestor" && descendants(colaboradores, conta.nome).has(m.colaborador)));
  // "Gerar Aviso Prévio" manual (RH, 2026-10) — a geração automática só roda
  // dentro do fluxo normal de aprovação (aprovarEtapaFn); uma MP que chegou a
  // "Aprovado" por outro caminho (ex.: correção direta no banco) nunca passa
  // por ali, então fica "Pendente" para sempre sem essa saída manual. A
  // própria ação `gerar` já é idempotente (confere documento ativo antes de
  // criar outro), então é segura de expor sem risco de duplicar.
  const podeGerarManualmente = podeGerenciar && !carregando && !gerado && m.tipoAvisoPrevio === "indenizado" && m.status === "Aprovado";

  async function handleGerarManual() {
    setGerando(true);
    try {
      const resultado = await gerarAvisoPrevio(m.id);
      if (resultado.gerado) {
        setDocumentos(await getDocumentosAtivos(m.id));
        flash("Aviso Prévio gerado.");
      } else {
        flash("Não foi possível gerar agora — verifique se a MP já está apta (CPF, data prevista) e tente de novo.");
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : "Falha ao gerar o Aviso Prévio.");
    } finally {
      setGerando(false);
    }
  }

  async function abrirDocumento(doc: MovimentacaoDocumento, baixar: boolean) {
    try {
      const url = await obterUrlDocumento(doc.id, baixar);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Falha ao abrir o documento.");
    }
  }

  async function handleArquivoEscolhido(arquivo: File) {
    setOcupado(true);
    try {
      await enviarDocumentoAssinado(m.id, arquivo);
      setDocumentos(await getDocumentosAtivos(m.id));
      flash("Documento assinado anexado.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Falha ao anexar o documento.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      <h4 className={styles.sectionTitle}>Documentos</h4>
      <div className={styles.documentosList}>
        <div className={styles.documentoItem}>
          <span className={styles.documentoNome}>Aviso prévio</span>
          <div className={styles.documentoDireita}>
            <span className={gerado ? styles.pillGerado : styles.pillPendente}>{carregando ? "Carregando..." : gerado ? "Gerado" : "Pendente"}</span>
            {gerado && (
              <button type="button" className={styles.documentoAcaoBtn} onClick={() => abrirDocumento(gerado, true)}>
                Baixar PDF
              </button>
            )}
            {podeGerarManualmente && (
              <button type="button" className={styles.documentoAcaoBtn} disabled={gerando} onClick={handleGerarManual}>
                {gerando ? "Gerando..." : "Gerar Aviso Prévio"}
              </button>
            )}
          </div>
        </div>

        <div className={styles.documentoItem}>
          <span className={styles.documentoNome}>Documento assinado</span>
          <div className={styles.documentoDireita}>
            <span className={assinado ? styles.pillGerado : styles.pillPendente}>
              {carregando ? "Carregando..." : assinado ? "Anexado" : "Não anexado"}
            </span>
            {!carregando && podeGerenciar && (
              <div className={styles.documentoAcoes}>
                {assinado && (
                  <>
                    <button type="button" className={styles.documentoAcaoBtn} onClick={() => abrirDocumento(assinado, false)}>
                      Visualizar
                    </button>
                    <button type="button" className={styles.documentoAcaoBtn} onClick={() => abrirDocumento(assinado, true)}>
                      Baixar
                    </button>
                  </>
                )}
                <button type="button" className={styles.documentoAcaoBtn} disabled={ocupado} onClick={() => inputRef.current?.click()}>
                  {ocupado ? "Enviando..." : assinado ? "Substituir" : "Anexar"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={MIMES_ACEITOS}
        className={styles.arquivoOculto}
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = "";
          if (arquivo) void handleArquivoEscolhido(arquivo);
        }}
      />

      {!m.colaboradorId && <p className={styles.documentoNotaAntiga}>Movimentação anterior à automação do Aviso Prévio — anexação manual indisponível.</p>}
    </div>
  );
}

import { Avatar } from "../ui";
import { tipoColor } from "../../domain/colors";
import { docsFor } from "../../domain/documentos";
import type { CargoCustom, DadoField, Movimentacao } from "../../types/domain";
import styles from "./MovimentacaoDetalhe.module.css";

interface MovimentacaoDetalheProps {
  movimentacao: Movimentacao;
  cargosCustom: CargoCustom[];
  /** Quando informado, mostra o link "← Voltar" no topo (uso em página cheia — ver AprovadasPage.tsx).
   * Omitido quando usado dentro de um Drawer, que já tem seu próprio fechamento. */
  onVoltar?: () => void;
}

/** Ficha completa de uma movimentação — todos os campos do formulário, justificativa,
 * trilha de aprovações e documentos gerados. Usada tanto em Movimentações aprovadas
 * (página cheia) quanto no Workflow de aprovação (dentro de um Drawer, "Ver detalhes"). */
export function MovimentacaoDetalhe({ movimentacao: m, cargosCustom, onVoltar }: MovimentacaoDetalheProps) {
  const dados = m.dados ?? [];
  const dadosLabels = new Set(dados.map((d) => d.label));

  const camposBase: DadoField[] = [
    { label: "Tipo", value: m.tipo },
    { label: "Colaborador", value: m.colaborador },
    { label: "Departamento", value: m.depto },
    { label: "Gestor solicitante", value: m.solicitante },
    { label: "Data da solicitação", value: m.dataSolicitacao },
    { label: "Prioridade", value: m.prioridade },
  ].filter((c) => !dadosLabels.has(c.label));

  const camposGrid = [...dados, ...camposBase];
  const documentos = docsFor(m, cargosCustom);

  return (
    <div className={styles.detalhe}>
      <div className={styles.detalheHeader}>
        {onVoltar && (
          <button type="button" className={styles.voltar} onClick={onVoltar}>
            ← Voltar
          </button>
        )}
        <div className={styles.detalheHeaderTop}>
          <div className={styles.detalheHeaderInfo}>
            <span className={styles.tipoBadgeGrande} style={{ background: tipoColor(m.tipoCod) }}>
              {m.tipoCod}
            </span>
            <div>
              <div className={styles.detalheNome}>
                {m.colaborador} <span className={styles.detalheId}>{m.id}</span>
              </div>
              <div className={styles.detalheDepto}>{m.depto}</div>
            </div>
          </div>
          <div className={styles.detalheHeaderRight}>
            <span className={styles.pillAprovado}>{m.status}</span>
            {m.aprovacaoFinal && (
              <div className={styles.detalheAprovacaoData}>
                {m.aprovacaoFinal.data} · {m.aprovacaoFinal.hora}
              </div>
            )}
            <div className={styles.detalhePrioridade}>Prioridade {m.prioridade}</div>
          </div>
        </div>
      </div>

      <div className={styles.detalheBody}>
        <div className={styles.infoGrid}>
          {camposGrid.map((c) => (
            <div key={c.label} className={styles.infoItem}>
              <span className={styles.infoLabel}>{c.label}</span>
              <span className={styles.infoValue}>{c.value}</span>
            </div>
          ))}
        </div>

        {m.justificativa && (
          <div className={styles.justificativaBox}>
            <h4 className={styles.sectionTitle}>Justificativa da movimentação</h4>
            <p className={styles.justificativaTexto}>{m.justificativa}</p>
          </div>
        )}

        <div className={styles.duasColunas}>
          <div>
            <h4 className={styles.sectionTitle}>Aprovações</h4>
            <div className={styles.aprovacoesList}>
              {m.etapas.map((etapa, i) => (
                <div key={i} className={styles.aprovacaoItem}>
                  <Avatar nome={etapa.aprovador} size={34} />
                  <div className={styles.aprovacaoInfo}>
                    <div className={styles.aprovacaoTopo}>
                      <span className={styles.aprovacaoPapel}>{etapa.papel}</span>
                      <span className={styles.aprovacaoData}>
                        {etapa.data}
                        {etapa.hora ? ` · ${etapa.hora}` : ""}
                      </span>
                    </div>
                    <div className={styles.aprovacaoAprovador}>{etapa.aprovador}</div>
                    <div className={styles.aprovacaoStatus}>{etapa.status}</div>
                    {etapa.comentario && <div className={styles.aprovacaoComentario}>{etapa.comentario}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className={styles.sectionTitle}>Documentos gerados</h4>
            <div className={styles.documentosList}>
              {documentos.map((doc) => (
                <div key={doc.nome} className={styles.documentoItem}>
                  <span className={styles.documentoNome}>{doc.nome}</span>
                  <span className={doc.status === "Gerado" ? styles.pillGerado : styles.pillPendente}>{doc.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

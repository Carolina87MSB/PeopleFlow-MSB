import { useMemo, useState } from "react";
import { Header } from "../../components/layout/Header";
import { Avatar, Badge, EmptyState, StatusBadge, tableStyles } from "../../components/ui";
import { tipoColor } from "../../domain/colors";
import { docsFor } from "../../domain/documentos";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import type { CargoCustom, DadoField, Movimentacao } from "../../types/domain";
import styles from "./AprovadasPage.module.css";

export function AprovadasPage() {
  const { movimentacoesVisiveis } = usePortalData();
  const { state } = usePortalStore();
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const aprovadas = useMemo(
    () => movimentacoesVisiveis.filter((m) => m.status === "Aprovado" || m.status === "Concluído"),
    [movimentacoesVisiveis],
  );

  const movimentacao = useMemo(() => aprovadas.find((m) => m.id === selecionado) || null, [aprovadas, selecionado]);

  if (movimentacao) {
    return (
      <>
        <Header />
        <DetalheAprovada movimentacao={movimentacao} onVoltar={() => setSelecionado(null)} cargosCustom={state.cargosCustom} />
      </>
    );
  }

  return (
    <>
      <Header />
      {aprovadas.length === 0 ? (
        <EmptyState message="Nenhuma movimentação aprovada ainda." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Solicitação</th>
                <th>Tipo</th>
                <th>Colaborador</th>
                <th>Departamento</th>
                <th>Gestor solicitante</th>
                <th>Status</th>
                <th className={tableStyles.right}>Aprovação final</th>
              </tr>
            </thead>
            <tbody>
              {aprovadas.map((m) => (
                <tr key={m.id} className={tableStyles.clickable} onClick={() => setSelecionado(m.id)}>
                  <td>{m.id}</td>
                  <td>
                    <Badge bg={`${tipoColor(m.tipoCod)}1a`} fg={tipoColor(m.tipoCod)} pill={false}>
                      {m.tipoCod}
                    </Badge>
                  </td>
                  <td>{m.colaborador}</td>
                  <td>{m.depto}</td>
                  <td>{m.solicitante}</td>
                  <td>
                    <StatusBadge status={m.status} />
                  </td>
                  <td className={tableStyles.right}>
                    {m.aprovacaoFinal ? `${m.aprovacaoFinal.data} · ${m.aprovacaoFinal.hora}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

interface DetalheAprovadaProps {
  movimentacao: Movimentacao;
  onVoltar: () => void;
  cargosCustom: CargoCustom[];
}

function DetalheAprovada({ movimentacao: m, onVoltar, cargosCustom }: DetalheAprovadaProps) {
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
        <button type="button" className={styles.voltar} onClick={onVoltar}>
          ← Voltar
        </button>
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
            <h4 className={styles.sectionTitle}>Aprovações realizadas</h4>
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

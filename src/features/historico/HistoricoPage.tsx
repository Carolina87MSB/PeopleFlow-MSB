import { useMemo } from "react";
import { Header } from "../../components/layout/Header";
import { Card, EmptyState } from "../../components/ui";
import { tipoColor } from "../../domain/colors";
import { construirEventos } from "../../domain/historico";
import { usePortalData } from "../../store/usePortalData";
import styles from "./HistoricoPage.module.css";

export function HistoricoPage() {
  const { movimentacoesVisiveis } = usePortalData();
  const eventos = useMemo(() => construirEventos(movimentacoesVisiveis), [movimentacoesVisiveis]);

  return (
    <>
      <Header />
      <Card>
        <div className={styles.header}>
          <h3 className={styles.title}>Trilha de auditoria</h3>
          <p className={styles.subtitle}>{eventos.length} eventos registrados</p>
        </div>

        {eventos.length === 0 ? (
          <EmptyState message="Nenhum evento registrado ainda." />
        ) : (
          <div className={styles.timeline}>
            {eventos.map((evento) => (
              <div key={evento.key} className={styles.item}>
                <div className={styles.markerCol}>
                  <span className={styles.dot} style={{ background: tipoColor(evento.tipoCod) }} />
                  <span className={styles.line} />
                </div>
                <div className={styles.content}>
                  <div className={styles.topo}>
                    <span className={styles.itemTitulo}>{evento.titulo}</span>
                    <span className={styles.itemData}>{evento.data}</span>
                  </div>
                  <p className={styles.itemDescricao}>{evento.descricao}</p>
                  <span className={styles.itemAutor}>{evento.autor}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

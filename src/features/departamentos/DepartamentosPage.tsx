import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { Header } from "../../components/layout/Header";
import { agregarDepartamentos } from "../../domain/agregados";
import { usePortalData } from "../../store/usePortalData";
import styles from "./DepartamentosPage.module.css";

function gestorPrincipal(gestores: Record<string, number>): string {
  let melhor = "";
  let max = -1;
  for (const [nome, count] of Object.entries(gestores)) {
    if (count > max) {
      max = count;
      melhor = nome;
    }
  }
  return melhor;
}

export function DepartamentosPage() {
  const { colaboradoresVisiveis, podeVerCadastros } = usePortalData();

  const departamentos = useMemo(() => agregarDepartamentos(colaboradoresVisiveis), [colaboradoresVisiveis]);

  if (!podeVerCadastros) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <Header />

      <div className={styles.grid}>
        {departamentos.map((d) => (
          <div key={d.nome} className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.code}>{d.code}</span>
              <span className={styles.count}>{d.count}</span>
            </div>
            <div className={styles.nome}>{d.nome}</div>
            <div className={styles.details}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Gestor responsável</span>
                <span className={styles.detailValue}>{gestorPrincipal(d.gestores)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Cargos distintos</span>
                <span className={styles.detailValue}>{d.cargos.size}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

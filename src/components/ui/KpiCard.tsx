import type { ReactNode } from "react";
import styles from "./KpiCard.module.css";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  highlight?: boolean;
  /** Elemento opcional ao lado do label (ex.: botão de editar do Headcount Planejado). */
  action?: ReactNode;
  /** Variante escura — reservada pro indicador mais importante de uma seção
   * (ex.: Headcount Real no Dashboard). Nunca combinar com `highlight`. */
  dark?: boolean;
  /** Barra de progresso opcional (ex.: aderência ao planejado) — só desenha
   * quando `max > 0`, pra não exibir uma barra vazia sem sentido. */
  progresso?: { valor: number; max: number; rotulo?: ReactNode };
}

export function KpiCard({ label, value, hint, highlight = false, action, dark = false, progresso }: KpiCardProps) {
  const percentual = progresso && progresso.max > 0 ? Math.max(0, Math.min(100, (progresso.valor / progresso.max) * 100)) : null;

  return (
    <div className={[styles.card, highlight ? styles.highlight : "", dark ? styles.dark : ""].join(" ")}>
      {!highlight && !dark && <span className={styles.wave} aria-hidden="true" />}
      <div className={styles.labelRow}>
        <div className={styles.label}>{label}</div>
        {action}
      </div>
      <div className={styles.value}>{value}</div>
      {hint && <div className={styles.hint}>{hint}</div>}
      {percentual !== null && (
        <>
          <div className={styles.barra}>
            <span style={{ width: `${percentual}%` }} />
          </div>
          {progresso?.rotulo && <div className={styles.barraRotulo}>{progresso.rotulo}</div>}
        </>
      )}
    </div>
  );
}

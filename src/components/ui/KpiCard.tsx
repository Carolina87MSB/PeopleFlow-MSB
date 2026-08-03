import type { ReactNode } from "react";
import styles from "./KpiCard.module.css";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  highlight?: boolean;
  /** Elemento opcional ao lado do label (ex.: botão de editar do Headcount Planejado). */
  action?: ReactNode;
}

export function KpiCard({ label, value, hint, highlight = false, action }: KpiCardProps) {
  return (
    <div className={[styles.card, highlight ? styles.highlight : ""].join(" ")}>
      {!highlight && <span className={styles.wave} aria-hidden="true" />}
      <div className={styles.labelRow}>
        <div className={styles.label}>{label}</div>
        {action}
      </div>
      <div className={styles.value}>{value}</div>
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}

import type { ReactNode } from "react";
import styles from "./KpiCard.module.css";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  highlight?: boolean;
}

export function KpiCard({ label, value, hint, highlight = false }: KpiCardProps) {
  return (
    <div className={[styles.card, highlight ? styles.highlight : ""].join(" ")}>
      {!highlight && <span className={styles.wave} aria-hidden="true" />}
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}

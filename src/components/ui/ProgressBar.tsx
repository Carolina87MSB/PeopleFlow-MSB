import styles from "./ProgressBar.module.css";

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className={styles.track}>
      <div className={styles.fill} style={{ width: `${pct}%` }} />
    </div>
  );
}

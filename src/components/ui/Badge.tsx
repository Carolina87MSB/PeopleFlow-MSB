import type { CSSProperties, ReactNode } from "react";
import styles from "./Badge.module.css";

interface BadgeProps {
  children: ReactNode;
  bg: string;
  fg: string;
  dot?: string;
  pill?: boolean;
}

export function Badge({ children, bg, fg, dot, pill = true }: BadgeProps) {
  const style: CSSProperties = { background: bg, color: fg, borderRadius: pill ? "999px" : "8px" };
  return (
    <span className={styles.badge} style={style}>
      {dot && <span className={styles.dot} style={{ background: dot }} />}
      {children}
    </span>
  );
}

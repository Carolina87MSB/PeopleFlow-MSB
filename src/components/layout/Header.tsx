import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { pageMetaFromPath } from "./pageMeta";
import styles from "./Header.module.css";

export function Header({ actions }: { actions?: ReactNode }) {
  const location = useLocation();
  const meta = pageMetaFromPath(location.pathname);

  return (
    <header className={styles.header}>
      <div>
        <div className={styles.eyebrow}>{meta.eyebrow}</div>
        <h1 className={styles.title}>{meta.title}</h1>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

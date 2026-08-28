import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { pageMetaFromPath } from "./pageMeta";
import styles from "./Header.module.css";

/** `eyebrowClassName` é opcional e serve só para uma página sobrescrever a cor
 * do eyebrow sem alterar Header.module.css, que é compartilhado por todas as
 * telas. Omitido (o caso de todas as páginas menos o Dashboard), o resultado
 * renderizado é exatamente o de antes. */
export function Header({ actions, eyebrowClassName }: { actions?: ReactNode; eyebrowClassName?: string }) {
  const location = useLocation();
  const meta = pageMetaFromPath(location.pathname);

  return (
    <header className={styles.header}>
      <div>
        <div className={[styles.eyebrow, eyebrowClassName].filter(Boolean).join(" ")}>{meta.eyebrow}</div>
        <h1 className={styles.title}>{meta.title}</h1>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

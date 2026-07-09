import type { ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./Drawer.module.css";

interface DrawerProps {
  onClose: () => void;
  header: ReactNode;
  children: ReactNode;
}

export function Drawer({ onClose, header, children }: DrawerProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <aside className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          {header}
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </aside>
    </div>
  );
}

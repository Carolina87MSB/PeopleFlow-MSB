import type { ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./Modal.module.css";

interface ModalProps {
  title: string;
  /** Elemento extra ao lado do título (ex.: um Badge de status) — opcional, não usado na maioria dos modais. */
  titleExtra?: ReactNode;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Modal({ title, titleExtra, subtitle, onClose, children, footer, width = 560 }: ModalProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <div className={styles.titleRow}>
              <h2 className={styles.title}>{title}</h2>
              {titleExtra}
            </div>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}

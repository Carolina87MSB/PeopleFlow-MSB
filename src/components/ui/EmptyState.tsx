import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import styles from "./EmptyState.module.css";

export function EmptyState({ message, icon }: { message: ReactNode; icon?: ReactNode }) {
  return (
    <div className={styles.wrap}>
      {icon ?? <CheckCircle2 size={28} strokeWidth={1.6} />}
      <p>{message}</p>
    </div>
  );
}

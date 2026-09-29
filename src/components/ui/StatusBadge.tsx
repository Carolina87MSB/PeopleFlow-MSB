import { statusMeta } from "../../domain/colors";
import { Badge } from "./Badge";
import type { MovStatus } from "../../types/domain";

export function StatusBadge({ status, className }: { status: MovStatus | string; className?: string }) {
  const meta = statusMeta(status);
  return (
    <Badge bg={meta.bg} fg={meta.fg} dot={meta.dot} className={className}>
      {meta.label}
    </Badge>
  );
}

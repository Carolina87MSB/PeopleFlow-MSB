import { statusMeta } from "../../domain/colors";
import { Badge } from "./Badge";
import type { MovStatus } from "../../types/domain";

export function StatusBadge({ status }: { status: MovStatus | string }) {
  const meta = statusMeta(status);
  return (
    <Badge bg={meta.bg} fg={meta.fg} dot={meta.dot}>
      {meta.label}
    </Badge>
  );
}

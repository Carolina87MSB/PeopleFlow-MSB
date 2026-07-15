import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

interface ReprovarModalProps {
  colaborador: string;
  tipo: string;
  onClose: () => void;
  onConfirm: (justificativa: string) => void;
}

/** Confirmação de reprovação — exige justificativa, gravada no comentário da
 * etapa reprovada e exibida na trilha ("JUSTIFICATIVA DA REPROVAÇÃO"). */
export function ReprovarModal({ colaborador, tipo, onClose, onConfirm }: ReprovarModalProps) {
  const [justificativa, setJustificativa] = useState("");

  const canSubmit = justificativa.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onConfirm(justificativa.trim());
  }

  return (
    <Modal
      title="Reprovar movimentação"
      subtitle={`${tipo} · ${colaborador}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={!canSubmit} onClick={handleSubmit}>
            Reprovar
          </Button>
        </>
      }
    >
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--color-navy)" }}>
        <span>Justificativa da reprovação</span>
        <textarea
          rows={4}
          autoFocus
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Explique o motivo da reprovação — fica registrado na trilha da movimentação."
          style={{
            border: "1px solid var(--color-border-strong)",
            borderRadius: "var(--radius-sm)",
            padding: "9px 11px",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "inherit",
            color: "var(--color-text)",
            resize: "vertical",
          }}
        />
      </label>
    </Modal>
  );
}

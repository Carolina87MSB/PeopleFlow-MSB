import { useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";

interface DispensarAvaliacaoModalProps {
  colaborador: string;
  etapa: string;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
}

/** Confirmação de dispensa — usada para colaboradores já avaliados fora do
 * sistema antes da implantação deste módulo: em vez de fabricar uma nota que
 * nunca existiu de verdade, remove o colaborador da lista de pendências com
 * o motivo registrado (ver DispensaAvaliacaoExperiencia). */
export function DispensarAvaliacaoModal({ colaborador, etapa, onClose, onConfirm }: DispensarAvaliacaoModalProps) {
  const [motivo, setMotivo] = useState("");

  const canSubmit = motivo.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onConfirm(motivo.trim());
  }

  return (
    <Modal
      title="Dispensar avaliação de experiência"
      subtitle={`${etapa} · ${colaborador}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={!canSubmit} onClick={handleSubmit}>
            Dispensar
          </Button>
        </>
      }
    >
      <p style={{ margin: "0 0 12px", fontSize: 12.5, fontWeight: 500, color: "var(--color-muted)" }}>
        Use esta opção quando o gestor já avaliou {colaborador} fora do sistema (antes da implantação deste módulo).
        O colaborador deixa de aparecer na lista de pendências — nenhuma nota ou decisão é registrada.
      </p>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--color-navy)" }}>
        <span>Motivo da dispensa</span>
        <textarea
          rows={4}
          autoFocus
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: avaliação de 45 e 90 dias já feita fora do sistema em [data/ferramenta]."
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

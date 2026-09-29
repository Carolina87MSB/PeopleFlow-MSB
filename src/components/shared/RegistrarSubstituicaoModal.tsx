import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import type { Movimentacao } from "../../types/domain";
import styles from "./NovaMovimentacaoModal.module.css";

interface RegistrarSubstituicaoModalProps {
  movimentacao: Movimentacao;
  onClose: () => void;
}

/** Modal simples do "Registrar substituição" (RH, 2026-09) — vinculado à MP de
 * Desligamento que marcou "Substituição = Sim"; não abre uma MP de Admissão
 * nova (ver registrarSubstituicao() em store/usePortalData.ts). O nome do
 * novo colaborador é sempre digitado (a pessoa ainda não existe no
 * cadastro) — o cargo reaproveita o catálogo oficial já usado em Nova
 * Movimentação. */
export function RegistrarSubstituicaoModal({ movimentacao: m, onClose }: RegistrarSubstituicaoModalProps) {
  const { state } = usePortalStore();
  const { colaboradores, registrarSubstituicao } = usePortalData();
  const [novoColaborador, setNovoColaborador] = useState("");
  const [cargo, setCargo] = useState("");
  const [admissaoIso, setAdmissaoIso] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cargosExistentes = useMemo(
    () => [...new Set([...colaboradores.map((c) => c.cargo), ...state.cargosCustom.map((c) => c.nome)])].filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [colaboradores, state.cargosCustom],
  );

  function handleConfirmar() {
    setErro(null);
    if (!novoColaborador.trim() || !cargo || !admissaoIso) {
      setErro("Preencha novo colaborador, cargo e data prevista/efetiva de admissão.");
      return;
    }
    setEnviando(true);
    registrarSubstituicao(m.id, { novoColaborador, cargo, admissaoIso, observacao });
    onClose();
  }

  return (
    <Modal
      title="Registrar substituição"
      subtitle={`${m.id} · vaga de ${m.colaborador}`}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<Check size={16} />} onClick={handleConfirmar} disabled={enviando}>
            Confirmar substituição
          </Button>
        </>
      }
    >
      <div className={styles.grid}>
        <label className={[styles.field, styles.full].join(" ")}>
          <span>Novo colaborador</span>
          <input value={novoColaborador} onChange={(e) => setNovoColaborador(e.target.value)} placeholder="Nome completo" />
        </label>

        <label className={styles.field}>
          <span>Cargo</span>
          <select value={cargo} onChange={(e) => setCargo(e.target.value)}>
            <option value="">Selecione...</option>
            {cargosExistentes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Data prevista/efetiva de admissão</span>
          <input type="date" value={admissaoIso} onChange={(e) => setAdmissaoIso(e.target.value)} />
        </label>

        <label className={[styles.field, styles.full].join(" ")}>
          <span>Observação</span>
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </label>
      </div>
      {erro && <div className={styles.error}>{erro}</div>}
    </Modal>
  );
}

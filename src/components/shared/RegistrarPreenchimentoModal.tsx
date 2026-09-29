import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import type { Vaga } from "../../types/domain";
import styles from "./NovaMovimentacaoModal.module.css";

interface RegistrarPreenchimentoModalProps {
  vaga: Vaga;
  onClose: () => void;
  /** "editar" (RH, 2026-09) — mesmo formulário, mas pré-preenchido com os
   * dados já registrados e salvando via editarPreenchimento(); só disponível
   * enquanto a vaga está "aguardando_aprovacao_gestor" (ver
   * VagasAutorizadasBloco.tsx). Omitido = fluxo original de registro. */
  modo?: "registrar" | "editar";
}

/** Modal do "Registrar preenchimento"/"Editar preenchimento" (RH, 2026-09) —
 * de uma Vaga já autorizada por uma MP (Desligamento com substituição,
 * Admissão por aumento de quadro). Não conclui a vaga nem abre uma MP de
 * Admissão nova: fica "aguardando aprovação do gestor" até o gestor
 * responsável (ou o RH) aprovar (ver aprovarPreenchimento() em
 * store/usePortalData.ts). O nome é sempre digitado — a pessoa ainda não
 * existe no cadastro de colaboradores. */
export function RegistrarPreenchimentoModal({ vaga, onClose, modo = "registrar" }: RegistrarPreenchimentoModalProps) {
  const { state } = usePortalStore();
  const { colaboradores, registrarPreenchimento, editarPreenchimento } = usePortalData();
  const editando = modo === "editar";
  const [nome, setNome] = useState(editando ? vaga.novoColaboradorNome ?? "" : "");
  const [cargo, setCargo] = useState(editando ? vaga.cargoPreenchimento ?? "" : vaga.cargo ?? "");
  const [admissaoIso, setAdmissaoIso] = useState(editando ? vaga.admissaoPrevistaIso ?? "" : "");
  const [observacao, setObservacao] = useState(editando ? vaga.observacao ?? "" : "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cargosExistentes = useMemo(
    () => [...new Set([...colaboradores.map((c) => c.cargo), ...state.cargosCustom.map((c) => c.nome)])].filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [colaboradores, state.cargosCustom],
  );

  function handleConfirmar() {
    setErro(null);
    if (!nome.trim() || !cargo || !admissaoIso) {
      setErro("Preencha nome, cargo e data prevista de admissão.");
      return;
    }
    setEnviando(true);
    const dados = { novoColaboradorNome: nome, cargo, admissaoPrevistaIso: admissaoIso, observacao };
    if (editando) {
      editarPreenchimento(vaga.id, dados);
    } else {
      registrarPreenchimento(vaga.id, dados);
    }
    onClose();
  }

  return (
    <Modal
      title={editando ? "Editar preenchimento" : "Registrar preenchimento"}
      subtitle={vaga.cargo ? `Vaga: ${vaga.cargo}` : "Vaga sem cargo pré-definido"}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<Check size={16} />} onClick={handleConfirmar} disabled={enviando}>
            {editando ? "Salvar alterações" : "Enviar para aprovação do gestor"}
          </Button>
        </>
      }
    >
      <div className={styles.grid}>
        <label className={[styles.field, styles.full].join(" ")}>
          <span>Novo(a) colaborador(a)</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
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
          <span>Data prevista de admissão</span>
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

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button, Modal } from "../../components/ui";
import { contarPorGestor } from "../../domain/agregados";
import { usePortalData } from "../../store/usePortalData";
import styles from "./NovoCargoModal.module.css";

interface NovoCargoModalProps {
  onClose: () => void;
}

/** Botão "Novo Cargo" (CargosPage.tsx, RH-only) — cria só nome/depto/gestor;
 * nível, ocupantes e todo o conteúdo da Descrição de Cargo (POP-RH-001)
 * ficam pendentes de preenchimento depois, na própria tela de Cargos ("+
 * Adicionar descrição"). Enquanto a descrição não estiver "Aprovada", não é
 * possível abrir uma movimentação de pessoal para este cargo (ver
 * validarForm em domain/formMovimentacao.ts). */
export function NovoCargoModal({ onClose }: NovoCargoModalProps) {
  const { colaboradores, criarCargoCustom } = usePortalData();
  const [nome, setNome] = useState("");
  const [depto, setDepto] = useState("");
  const [gestor, setGestor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const departamentos = useMemo(() => [...new Set(colaboradores.map((c) => c.depto))].sort(), [colaboradores]);
  const gestores = useMemo(() => [...contarPorGestor(colaboradores).keys()].sort(), [colaboradores]);

  async function handleCriar() {
    if (!nome.trim() || !depto || !gestor) {
      setErro("Preencha o nome do cargo, o departamento e o gestor imediato.");
      return;
    }
    setCriando(true);
    setErro(null);
    const result = await criarCargoCustom(nome, depto, gestor);
    setCriando(false);
    if (result.ok) onClose();
    else setErro("Não foi possível criar o cargo — confira se já não existe um com esse nome.");
  }

  return (
    <Modal
      title="Novo Cargo"
      subtitle="Cria só o nome/departamento/gestor — a Descrição de Cargo é preenchida depois, na lista de Cargos."
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={criando}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<Check size={16} />} onClick={handleCriar} disabled={criando}>
            {criando ? "Criando..." : "Criar cargo"}
          </Button>
        </>
      }
    >
      <div className={styles.grid}>
        <label className={[styles.field, styles.full].join(" ")}>
          <span>Nome do cargo</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Gerente de Planejamento Industrial e Operações" />
        </label>
        <label className={styles.field}>
          <span>Departamento</span>
          <select value={depto} onChange={(e) => setDepto(e.target.value)}>
            <option value="">Selecione…</option>
            {departamentos.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Gestor imediato</span>
          <select value={gestor} onChange={(e) => setGestor(e.target.value)}>
            <option value="">Selecione…</option>
            {gestores.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>

      {erro && <div className={styles.error}>{erro}</div>}
    </Modal>
  );
}

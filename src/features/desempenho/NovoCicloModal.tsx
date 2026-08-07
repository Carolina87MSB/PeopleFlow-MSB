import { useState } from "react";
import { Button, Modal } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";
import styles from "./NovoCicloModal.module.css";

interface NovoCicloModalProps {
  onClose: () => void;
}

/** Abertura de um novo ciclo de Avaliação de Desempenho (RH-only) — ao
 * confirmar, o sistema gera automaticamente a avaliação de cada colaborador
 * ativo com admissão em ou antes da "Data de corte de admissão" informada
 * (elegibilidade: ver elegivelParaCicloAvaliacaoDesempenho() em
 * domain/avaliacaoDesempenho.ts). */
export function NovoCicloModal({ onClose }: NovoCicloModalProps) {
  const { criarCicloAvaliacaoDesempenho } = usePortalData();

  const [nome, setNome] = useState("");
  const [periodoReferencia, setPeriodoReferencia] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataEncerramento, setDataEncerramento] = useState("");
  const [dataCorteAdmissao, setDataCorteAdmissao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const valido = nome.trim() && periodoReferencia.trim() && dataInicio && dataEncerramento && dataCorteAdmissao;

  async function handleConfirmar() {
    if (!valido) return;
    setSalvando(true);
    setErro(null);
    const result = await criarCicloAvaliacaoDesempenho({
      nome: nome.trim(),
      periodoReferencia: periodoReferencia.trim(),
      dataInicio,
      dataEncerramento,
      dataCorteAdmissao,
    });
    setSalvando(false);
    if (result.ok) onClose();
    else setErro("Não foi possível abrir o ciclo. Tente novamente.");
  }

  return (
    <Modal
      title="Abrir novo ciclo de Avaliação de Desempenho"
      subtitle="Gera automaticamente a avaliação de cada colaborador ativo."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleConfirmar} disabled={!valido || salvando}>
            {salvando ? "Abrindo..." : "Abrir ciclo"}
          </Button>
        </>
      }
    >
      <div className={styles.campo}>
        <label className={styles.label} htmlFor="ciclo-nome">
          Nome do ciclo
        </label>
        <input
          id="ciclo-nome"
          className={styles.input}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Avaliação de Desempenho S1 2026"
        />
      </div>

      <div className={styles.campo}>
        <label className={styles.label} htmlFor="ciclo-periodo">
          Período de referência
        </label>
        <input
          id="ciclo-periodo"
          className={styles.input}
          value={periodoReferencia}
          onChange={(e) => setPeriodoReferencia(e.target.value)}
          placeholder="Ex.: Janeiro a Junho de 2026"
        />
      </div>

      <div className={styles.linhaDatas}>
        <div className={styles.campo}>
          <label className={styles.label} htmlFor="ciclo-inicio">
            Data de início
          </label>
          <input id="ciclo-inicio" type="date" className={styles.input} value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </div>
        <div className={styles.campo}>
          <label className={styles.label} htmlFor="ciclo-encerramento">
            Data de encerramento
          </label>
          <input
            id="ciclo-encerramento"
            type="date"
            className={styles.input}
            value={dataEncerramento}
            onChange={(e) => setDataEncerramento(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.campo}>
        <label className={styles.label} htmlFor="ciclo-corte-admissao">
          Data de corte de admissão
        </label>
        <input
          id="ciclo-corte-admissao"
          type="date"
          className={styles.input}
          value={dataCorteAdmissao}
          onChange={(e) => setDataCorteAdmissao(e.target.value)}
        />
        <p className={styles.ajuda}>Só participa deste ciclo quem foi admitido em ou antes desta data.</p>
      </div>

      {erro && <p className={styles.erro}>{erro}</p>}
    </Modal>
  );
}

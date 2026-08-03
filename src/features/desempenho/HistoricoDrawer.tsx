import { Drawer } from "../../components/ui";
import type { LinhaHistoricoCiclo } from "../../domain/historicoDesempenho";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import type { Colaborador } from "../../types/domain";
import { HistoricoLinhaDoTempo } from "./HistoricoLinhaDoTempo";
import styles from "./AvaliacaoDesempenhoDrawer.module.css";

interface HistoricoDrawerProps {
  colaborador: Colaborador;
  linhas: LinhaHistoricoCiclo[];
  onClose: () => void;
}

/** Histórico individual (Etapa 9) — Drawer read-only com a linha do tempo
 * completa de um colaborador (RH/Gestor/Diretoria, ver HistoricoTab.tsx). */
export function HistoricoDrawer({ colaborador, linhas, onClose }: HistoricoDrawerProps) {
  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <div className={styles.drawerNome}>{colaborador.nome}</div>
          <div className={styles.drawerSub}>
            {formatarNomeCargo(colaborador.cargo)} · {colaborador.depto}
          </div>
        </div>
      }
    >
      <HistoricoLinhaDoTempo linhas={linhas} />
    </Drawer>
  );
}

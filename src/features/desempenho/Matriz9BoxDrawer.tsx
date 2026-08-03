import { Drawer } from "../../components/ui";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import type { EntradaMatriz9Box } from "./Matriz9BoxTab";
import styles from "./AvaliacaoDesempenhoDrawer.module.css";

interface Matriz9BoxDrawerProps {
  entrada: EntradaMatriz9Box;
  onClose: () => void;
}

/** Detalhe read-only de um marcador da Matriz 9 Box — sem nenhum controle de
 * edição (a posição nunca é editada manualmente; qualquer mudança vem de
 * calibrar/atualizar a AVD/Avaliação de Potencial de origem, ver README).
 * As notas mostradas aqui são sempre as Oficiais (pós-homologação do RH,
 * Etapa 6) — só um colaborador homologado chega a aparecer na Matriz. */
export function Matriz9BoxDrawer({ entrada, onClose }: Matriz9BoxDrawerProps) {
  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <div className={styles.drawerNome}>{entrada.colaborador.nome}</div>
          <div className={styles.drawerSub}>
            {formatarNomeCargo(entrada.colaborador.cargo)} · {entrada.colaborador.depto}
          </div>
        </div>
      }
    >
      <div className={styles.resumo}>
        <div className={styles.resumoLinha}>
          <span>Nota Oficial da Avaliação de Desempenho</span>
          <strong>{entrada.notaDesempenho}</strong>
        </div>
        <div className={styles.resumoLinha}>
          <span>Nota Oficial de Potencial</span>
          <strong>{entrada.notaPotencial}</strong>
        </div>
        <div className={styles.resumoLinha}>
          <span>Posição na Matriz</span>
          <strong>{entrada.posicao.nomeQuadrante}</strong>
        </div>
        <div className={styles.resumoLinhaFinal}>
          <span>Último ciclo avaliado</span>
          <strong>{entrada.ciclo}</strong>
        </div>
      </div>
    </Drawer>
  );
}

import { Fragment } from "react";
import { NOMES_QUADRANTES_MATRIZ_9_BOX } from "../../domain/matriz9Box";
import type { FaixaMatriz9Box } from "../../types/domain";
import styles from "./Matriz9BoxDistribuicao.module.css";

const LINHAS_POTENCIAL: FaixaMatriz9Box[] = ["Alto", "Médio", "Baixo"];
const COLUNAS_DESEMPENHO: FaixaMatriz9Box[] = ["Baixo", "Médio", "Alto"];

interface Matriz9BoxDistribuicaoProps {
  /** Contagem por célula, chave `${faixaPotencial}|${faixaDesempenho}` — ver
   * distribuicaoMatriz9Box() em domain/dashboardDesempenho.ts. */
  distribuicao: Record<string, number>;
}

/** Grade 3×3 de contagens, compartilhada pelos 3 dashboards (Etapa 8) — mesma
 * orientação de Matriz9BoxTab.tsx (linhas = potencial Alto→Baixo, colunas =
 * desempenho Baixo→Alto), sem marcadores clicáveis (só números). */
export function Matriz9BoxDistribuicao({ distribuicao }: Matriz9BoxDistribuicaoProps) {
  return (
    <div className={styles.grade}>
      <div className={styles.eixoCanto} />
      {COLUNAS_DESEMPENHO.map((coluna) => (
        <div key={coluna} className={styles.eixoDesempenho}>
          Desempenho: {coluna}
        </div>
      ))}
      {LINHAS_POTENCIAL.map((linha) => (
        <Fragment key={linha}>
          <div className={styles.eixoPotencial}>Potencial: {linha}</div>
          {COLUNAS_DESEMPENHO.map((coluna) => {
            const quantidade = distribuicao[`${linha}|${coluna}`] ?? 0;
            return (
              <div key={`${linha}-${coluna}`} className={styles.celula}>
                <span className={styles.celulaTitulo}>{NOMES_QUADRANTES_MATRIZ_9_BOX[linha][coluna]}</span>
                <span className={styles.celulaContagem}>{quantidade}</span>
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

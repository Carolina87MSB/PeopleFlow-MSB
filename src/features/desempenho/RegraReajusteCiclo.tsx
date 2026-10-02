import { formatarPercentual } from "../../domain/salario";
import type { RegraReajusteCiclo as Regra } from "../../domain/regrasReajuste";
import styles from "./ReajusteSalarialTab.module.css";

/** Bloco compacto "Regra do reajuste" de um ciclo (RH, 2026-10) — só
 * exibição, referência pro RH consultar qual critério valeu naquele ciclo.
 * Ver domain/regrasReajuste.ts. */
export function RegraReajusteCiclo({ regra }: { regra: Regra }) {
  return (
    <div className={styles.regraCiclo}>
      <div className={styles.regraTitulo}>Regra do reajuste — {regra.origem}</div>
      <div className={styles.regraColunas}>
        <div className={styles.regraColuna}>
          <div className={styles.regraColunaTitulo}>Reajuste Base</div>
          <div className={styles.regraDescricao}>{regra.descricaoBase}</div>
          {regra.reajusteBase.map((b) => (
            <div key={b.periodo} className={styles.regraLinha}>
              <span>{b.periodo}</span>
              <strong>{formatarPercentual(b.percentual)}</strong>
            </div>
          ))}
        </div>
        <div className={styles.regraColuna}>
          <div className={styles.regraColunaTitulo}>Fatorial de desempenho (9 Box)</div>
          {regra.fatorial.map((f) => (
            <div key={f.posicao} className={styles.regraLinha}>
              <span>{f.posicao}</span>
              <strong>{`${f.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.regraCalculo}>Cálculo: {regra.calculo}</div>
    </div>
  );
}

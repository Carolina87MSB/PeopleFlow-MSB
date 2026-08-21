import styles from "./TurnoverPorSetorList.module.css";

interface TurnoverPorSetorListProps {
  /** Já vem ordenado do maior turnover pro menor (ver turnoverPorSetor() em
   * domain/dashboardExecutivo.ts) — nunca reordenar aqui. */
  data: { setor: string; turnover: number }[];
}

/** Lista de turnover por setor — substitui o gráfico de barras verticais
 * (ilegível com muitos setores/nomes longos, ver BarChart.tsx) por uma
 * lista horizontal, mesma ideia estrutural de "Headcount por Setor" (nome +
 * barra + valor), mas com acabamento próprio: cantos levemente arredondados
 * (não em pílula), nome nunca cortado/truncado (quebra em quantas linhas
 * precisar), e o maior turnover destacado em âmbar — mesma cor já usada
 * pros cards de alerta deste Dashboard — enquanto os demais usam o azul
 * institucional. Sem eixo, sem "Top N": mostra todos os setores recebidos. */
export function TurnoverPorSetorList({ data }: TurnoverPorSetorListProps) {
  const max = Math.max(1, ...data.map((d) => d.turnover));

  return (
    <div className={styles.lista}>
      {data.map((d, i) => {
        const destaque = i === 0;
        const pct = Math.max(2, Math.round((d.turnover / max) * 100));
        return (
          <div key={d.setor} className={styles.linha} title={`${d.setor} — ${Math.round(d.turnover)}%`}>
            <span className={styles.nome}>{d.setor}</span>
            <div className={styles.barColuna}>
              <div className={styles.track}>
                <div className={[styles.fill, destaque ? styles.fillDestaque : ""].join(" ")} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className={[styles.valor, destaque ? styles.valorDestaque : ""].join(" ")}>{Math.round(d.turnover)}%</span>
          </div>
        );
      })}
    </div>
  );
}

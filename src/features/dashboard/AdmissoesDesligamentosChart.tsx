import type { AdmissoesDesligamentosMes } from "../../domain/dashboardExecutivo";
import styles from "./AdmissoesDesligamentosChart.module.css";

const COR_ADMISSOES = "var(--color-success-fg, #2f8f4e)";
const COR_DESLIGAMENTOS = "var(--color-danger)";

interface AdmissoesDesligamentosChartProps {
  data: AdmissoesDesligamentosMes[];
  height?: number;
}

/** Comparação mensal Admissões × Desligamentos (Dashboard Executivo) — o
 * `BarChart` compartilhado (`components/ui/BarChart.tsx`) é só 1 série; este
 * componente é um sibling isolado, mesmo estilo SVG cru zero-dependência, só
 * pra este gráfico de 2 barras por mês (evita mexer no BarChart compartilhado
 * e arriscar os ~6 usos existentes dele). */
export function AdmissoesDesligamentosChart({ data, height = 170 }: AdmissoesDesligamentosChartProps) {
  const max = Math.max(1, ...data.flatMap((d) => [d.admissoes, d.desligamentos]));
  const barWidth = 16;
  const barGap = 4;
  const groupGap = 22;
  const groupWidth = barWidth * 2 + barGap;
  const width = data.length * (groupWidth + groupGap) + groupGap;
  const topPad = 18;
  const bottomPad = 18;
  const barArea = height - topPad - bottomPad;

  function alturaBarra(valor: number) {
    return valor > 0 ? Math.max(2, Math.round((barArea * valor) / max)) : 0;
  }

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="xMinYMid meet">
        {data.map((d, i) => {
          const groupX = groupGap + i * (groupWidth + groupGap);
          const hAdmissoes = alturaBarra(d.admissoes);
          const hDesligamentos = alturaBarra(d.desligamentos);
          return (
            <g key={d.mes}>
              <text
                x={groupX + groupWidth / 2}
                y={topPad - 6}
                fontSize="10"
                fontWeight="700"
                fontFamily="Montserrat"
                fill="var(--color-navy)"
                textAnchor="middle"
              >
                {d.admissoes}/{d.desligamentos}
              </text>
              <rect x={groupX} y={topPad + (barArea - hAdmissoes)} width={barWidth} height={hAdmissoes} rx={3} fill={COR_ADMISSOES} />
              <rect
                x={groupX + barWidth + barGap}
                y={topPad + (barArea - hDesligamentos)}
                width={barWidth}
                height={hDesligamentos}
                rx={3}
                fill={COR_DESLIGAMENTOS}
              />
              <text x={groupX + groupWidth / 2} y={height - 4} fontSize="10" fontFamily="Montserrat" fill="var(--color-muted-light)" textAnchor="middle">
                {d.mesLabel}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={styles.legenda}>
        <span className={styles.legendaItem}>
          <span className={styles.legendaCor} style={{ background: COR_ADMISSOES }} />
          Admissões
        </span>
        <span className={styles.legendaItem}>
          <span className={styles.legendaCor} style={{ background: COR_DESLIGAMENTOS }} />
          Desligamentos
        </span>
      </div>
    </div>
  );
}

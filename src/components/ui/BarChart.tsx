interface BarDatum {
  label: string;
  value: number;
  annotation?: string;
}

interface BarChartProps {
  data: BarDatum[];
  color?: string;
  height?: number;
}

/** Gráfico de barras simples (uma série) desenhado em SVG, sem dependências externas —
 * `annotation` (ex.: contagem) aparece como texto acima de cada barra. */
export function BarChart({ data, color = "var(--color-brand)", height = 170 }: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 22;
  const gap = 26;
  const width = data.length * (barWidth + gap) + gap;
  const topPad = 18;
  const bottomPad = 18;
  const barArea = height - topPad - bottomPad;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="xMinYMid meet">
      {data.map((d, i) => {
        const x = gap + i * (barWidth + gap);
        const h = d.value > 0 ? Math.max(2, Math.round((barArea * d.value) / max)) : 0;
        const y = topPad + (barArea - h);
        return (
          <g key={d.label}>
            {d.annotation ? (
              <text x={x + barWidth / 2} y={topPad - 6} fontSize="10" fontWeight="700" fontFamily="Montserrat" fill="var(--color-navy)" textAnchor="middle">
                {d.annotation}
              </text>
            ) : null}
            <rect x={x} y={y} width={barWidth} height={h} rx={4} fill={color} />
            <text x={x + barWidth / 2} y={height - 4} fontSize="10" fontFamily="Montserrat" fill="var(--color-muted-light)" textAnchor="middle">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

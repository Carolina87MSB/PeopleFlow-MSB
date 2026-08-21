import styles from "./BarChart.module.css";

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

/** Aproximação de largura de caractere pra Montserrat 10px — o SVG não mede
 * texto sem renderizar, então isso é uma heurística conservadora (melhor
 * truncar 1 caractere a mais do que deixar sobrepor o rótulo vizinho). */
const CHAR_WIDTH_PX = 5.6;

function truncarRotulo(label: string, maxChars: number): string {
  return label.length > maxChars ? label.slice(0, Math.max(1, maxChars - 1)) + "…" : label;
}

/** Gráfico de barras simples (uma série) desenhado em SVG, sem dependências externas —
 * `annotation` (ex.: contagem) aparece como texto acima de cada barra.
 *
 * Largura sempre em pixel fixo (nunca `width="100%"` + `preserveAspectRatio`
 * esticando/encolhendo o viewBox pra caber no container): com muitas barras,
 * encolher o viewBox inteiro pra caber também encolhe a fonte dos rótulos
 * junto, até sobrepor um no outro e virar ilegível. Em vez disso, o SVG
 * sempre renderiza no tamanho natural (rótulos no mesmo tamanho legível) e
 * um container com scroll horizontal assume quando não cabe — mesmo
 * princípio já usado nas tabelas (`Table.module.css`).
 *
 * Isso sozinho resolve o encolhimento, mas não a sobreposição entre rótulos
 * vizinhos quando o próprio texto (ex.: "Qualidade e Regulatório") é mais
 * largo que o espaço de uma barra, mesmo em escala natural — pra isso, todo
 * rótulo que não caiba no espaço da própria barra é truncado com "…", com o
 * nome completo disponível num `<title>` (tooltip nativo do SVG, no hover).
 * Pra rótulos curtos (a maioria dos usos hoje — meses, faixas Baixo/Médio/
 * Alto), isso nunca trunca nada: resultado visual idêntico a antes. */
export function BarChart({ data, color = "var(--color-brand)", height = 170 }: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 22;
  const gap = 26;
  const width = data.length * (barWidth + gap) + gap;
  const topPad = 18;
  const bottomPad = 18;
  const barArea = height - topPad - bottomPad;
  const maxChars = Math.max(3, Math.floor((barWidth + gap) / CHAR_WIDTH_PX));

  return (
    <div className={styles.wrap}>
      <svg className={styles.svg} viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
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
                {truncarRotulo(d.label, maxChars)}
                <title>{d.label}</title>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

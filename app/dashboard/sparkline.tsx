interface SparklineProps {
  data: { date: string; count: number }[];
  height?: number;
}

/**
 * Mini-gráfico de área SVG inline. Sem dependências.
 * Usa currentColor para herdar tom — só precisa de pôr text-* na <div> pai.
 */
export function Sparkline({ data, height = 96 }: SparklineProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md bg-muted/30 text-xs text-muted-foreground"
        style={{ height }}
      >
        Sem dados
      </div>
    );
  }

  const width = 600;
  const padding = 4;
  const max = Math.max(...data.map((d) => d.count), 1);
  const stepX = (width - padding * 2) / Math.max(data.length - 1, 1);

  const points = data.map((d, i) => {
    const x = padding + i * stepX;
    const y =
      padding + (1 - d.count / max) * (height - padding * 2);
    return { x, y, ...d };
  });

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');

  const area =
    `M${points[0].x.toFixed(2)},${height - padding} ` +
    points
      .map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(' ') +
    ` L${points[points.length - 1].x.toFixed(2)},${height - padding} Z`;

  const grad = `sparkGrad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block w-full text-primary"
      style={{ height }}
      role="img"
      aria-label="Pedidos por dia, últimos 30 dias"
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${grad})`} />
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

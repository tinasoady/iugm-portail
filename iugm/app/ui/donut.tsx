// Donut statistique en SVG pur (rendu serveur, aucune dépendance).
// Deux segments de statut avec un écart visuel entre eux ; le pourcentage
// principal est affiché au centre (nombre héros).

type Segment = { value: number; className: string };

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 190,
}: {
  segments: Segment[]; // dans l'ordre horaire, à partir de midi
  centerValue: string;
  centerLabel?: string;
  size?: number;
}) {
  const stroke = 26;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const gap = visible.length > 1 ? 3 : 0; // écart angulaire (degrés) entre segments

  let angle = 0;
  const arcs = visible.map((s, i) => {
    const sweep = (s.value / total) * 360;
    const start = angle + gap / 2;
    const end = angle + sweep - gap / 2;
    angle += sweep;
    return { key: i, className: s.className, start, end: Math.max(end, start + 0.5) };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${centerValue} ${centerLabel ?? ""}`.trim()}
    >
      {total === 0 ? (
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-zinc-200 dark:stroke-zinc-800"
        />
      ) : visible.length === 1 ? (
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={visible[0].className}
        />
      ) : (
        arcs.map((a) => (
          <path
            key={a.key}
            d={arcPath(c, c, r, a.start, a.end)}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className={a.className}
          />
        ))
      )}
      <text
        x={c}
        y={centerLabel ? c - 2 : c}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-zinc-900 text-3xl font-bold dark:fill-zinc-50"
      >
        {centerValue}
      </text>
      {centerLabel && (
        <text
          x={c}
          y={c + 22}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-zinc-500 text-xs font-medium dark:fill-zinc-400"
        >
          {centerLabel}
        </text>
      )}
    </svg>
  );
}

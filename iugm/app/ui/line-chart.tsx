"use client";

import { useId, useRef, useState, useSyncExternalStore, useMemo } from "react";

export type LineChartSeries = {
  key: string;
  label: string;
  color: string;
  darkColor: string;
  values: number[];
};

function subscribeToThemeChanges(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
function getThemeSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}
function getThemeServerSnapshot(): boolean {
  return false;
}

function useIsDarkMode(): boolean {
  return useSyncExternalStore(subscribeToThemeChanges, getThemeSnapshot, getThemeServerSnapshot);
}

/**
 * Choisit un pas d'axe « rond » à partir de l'intervalle entre deux
 * graduations plutôt que du sommet : arrondir le sommet seul laissait la
 * courbe écrasée dans le bas du cadre (110 → axe à 200).
 */
function niceScale(maxValue: number, ticks: number): number {
  const rawStep = (maxValue * 1.05) / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rawStep, 1)));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  let step = (steps.find((s) => rawStep <= s * magnitude) ?? 10) * magnitude;
  // des décomptes n'ont pas de demi-unité : garder des graduations entières
  if (step < 10) step = Math.ceil(step);
  return step * ticks;
}

function formatTick(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(Math.round(v));
}

/**
 * Courbe lissée monotone (Fritsch–Carlson) : les splines classiques
 * dépassent sous zéro entre deux points bas, ce qui inventerait des
 * valeurs négatives sur un décompte d'inscriptions.
 */
function smoothPath(points: [number, number][]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M ${points[0][0]} ${points[0][1]}`;

  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    slopes.push(dx === 0 ? 0 : (points[i + 1][1] - points[i][1]) / dx);
  }

  const tangents: number[] = new Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangents[i] =
      slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  }

  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const c1x = points[i][0] + dx / 3;
    const c1y = points[i][1] + (tangents[i] * dx) / 3;
    const c2x = points[i + 1][0] - dx / 3;
    const c2y = points[i + 1][1] - (tangents[i + 1] * dx) / 3;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${points[i + 1][0].toFixed(2)} ${points[i + 1][1].toFixed(2)}`;
  }
  return d;
}

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
  size = 150,
}: {
  segments: { value: number; className: string }[];
  centerValue: string;
  centerLabel?: string;
  size?: number;
}) {
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const gap = visible.length > 1 ? 3 : 0;

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
        className="fill-zinc-900 text-2xl font-bold dark:fill-zinc-50"
      >
        {centerValue}
      </text>
      {centerLabel && (
        <text
          x={c}
          y={c + 20}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-zinc-500 text-[10px] font-medium dark:fill-zinc-400"
        >
          {centerLabel}
        </text>
      )}
    </svg>
  );
}

// ===========================================================================
// L I N E   C H A R T   (with zoom, series toggle, compact height)
// ===========================================================================

type ZoomState = { start: number; end: number } | null; // indices into labels

export function LineChart({
  labels,
  series,
  height = 240,
}: {
  labels: string[];
  series: LineChartSeries[];
  height?: number;
}) {
  const isDark = useIsDarkMode();
  const colorOf = (s: LineChartSeries) => (isDark ? s.darkColor : s.color);
  // useId contient des « : » que url(#…) ne sait pas résoudre
  const gradientPrefix = `lc${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // --- Series visibility toggles ---
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => new Set(series.map((s) => s.key)));

  const toggleSeries = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // --- Zoom state ---
  const [zoom, setZoom] = useState<ZoomState>(null);
  const [brushStart, setBrushStart] = useState<number | null>(null);
  const [brushEnd, setBrushEnd] = useState<number | null>(null);
  const [isBrushing, setIsBrushing] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);

  // Resolve visible labels and series based on zoom
  const visibleLabels = useMemo(() => {
    if (!zoom) return labels;
    return labels.slice(zoom.start, zoom.end + 1);
  }, [labels, zoom]);

  const visibleSeries = useMemo(() => {
    return series
      .filter((s) => visibleKeys.has(s.key))
      .map((s) => ({
        ...s,
        values: zoom ? s.values.slice(zoom.start, zoom.end + 1) : s.values,
      }));
  }, [series, visibleKeys, zoom]);

  // Compute max across visible series
  const gridSteps = 4;
  const maxValue = Math.max(1, ...visibleSeries.flatMap((s) => s.values));
  const niceMax = niceScale(maxValue, gridSteps);

  const width = 600;
  const padding = { top: 16, right: 16, bottom: 28, left: 40 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const xAt = (i: number) =>
    padding.left +
    (visibleLabels.length > 1
      ? (i / (visibleLabels.length - 1)) * plotW
      : plotW / 2);
  const yAt = (v: number) => padding.top + plotH - (v / niceMax) * plotH;

  const gridValues = Array.from(
    { length: gridSteps + 1 },
    (_, i) => (niceMax / gridSteps) * i,
  );

  const baselineY = padding.top + plotH;
  const paths = visibleSeries.map((s) => {
    const points = s.values.map((v, i) => [xAt(i), yAt(v)] as [number, number]);
    const line = smoothPath(points);
    const first = points[0];
    const last = points[points.length - 1];
    return {
      key: s.key,
      color: colorOf(s),
      line,
      area:
        points.length > 1
          ? `${line} L ${last[0].toFixed(2)} ${baselineY} L ${first[0].toFixed(2)} ${baselineY} Z`
          : "",
      endX: last[0],
      endY: last[1],
    };
  });

  // --- Hover state ---
  const [hover, setHover] = useState<number | null>(null);

  const handlePointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratio = width / rect.width;
    const xInViewBox = (e.clientX - rect.left) * ratio;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < visibleLabels.length; i++) {
      const d = Math.abs(xAt(i) - xInViewBox);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHover(nearest);
  };

  const hoverX = hover !== null ? xAt(hover) : null;

  // --- Brush handlers ---
  const handleBrushStart = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratio = width / rect.width;
    const xInViewBox = (e.clientX - rect.left) * ratio;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < visibleLabels.length; i++) {
      const d = Math.abs(xAt(i) - xInViewBox);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setBrushStart(nearest);
    setBrushEnd(nearest);
    setIsBrushing(true);
  };

  const handleBrushMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!isBrushing || brushStart === null) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratio = width / rect.width;
    const xInViewBox = (e.clientX - rect.left) * ratio;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < visibleLabels.length; i++) {
      const d = Math.abs(xAt(i) - xInViewBox);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setBrushEnd(nearest);
  };

  const handleBrushEnd = () => {
    if (!isBrushing || brushStart === null || brushEnd === null) {
      setIsBrushing(false);
      setBrushStart(null);
      setBrushEnd(null);
      return;
    }
    const lo = Math.min(brushStart, brushEnd);
    const hi = Math.max(brushStart, brushEnd);
    setIsBrushing(false);
    setBrushStart(null);
    setBrushEnd(null);

    if (hi - lo < 1) return;

    const base = zoom ? zoom.start : 0;
    setZoom({ start: base + lo, end: base + hi });
  };

  const resetZoom = () => setZoom(null);

  const zoomIn = () => {
    if (!zoom) {
      const mid = Math.floor(labels.length / 2);
      const quarter = Math.floor(labels.length / 4);
      setZoom({ start: mid - quarter, end: mid + quarter });
    } else {
      const range = zoom.end - zoom.start;
      if (range <= 2) return;
      const mid = Math.floor((zoom.start + zoom.end) / 2);
      const quarter = Math.floor(range / 4);
      setZoom({ start: mid - quarter, end: mid + quarter });
    }
  };

  const zoomOut = () => {
    if (!zoom) return;
    const range = zoom.end - zoom.start;
    const mid = Math.floor((zoom.start + zoom.end) / 2);
    const half = Math.floor(range);
    const newStart = Math.max(0, mid - half);
    const newEnd = Math.min(labels.length - 1, mid + half);
    if (newStart === 0 && newEnd === labels.length - 1) {
      setZoom(null);
    } else {
      setZoom({ start: newStart, end: newEnd });
    }
  };

  // Determine brush rect for visual feedback
  const brushLeft =
    brushStart !== null && brushEnd !== null
      ? xAt(Math.min(brushStart, brushEnd))
      : null;
  const brushRight =
    brushStart !== null && brushEnd !== null
      ? xAt(Math.max(brushStart, brushEnd))
      : null;

  return (
    <div>
      {/* Controls row: series toggles + zoom buttons */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {/* Légende / bascule de séries */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {series.map((s) => {
            const isVisible = visibleKeys.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleSeries(s.key)}
                aria-pressed={isVisible}
                className={`flex items-center gap-2 text-xs font-medium transition ${
                  isVisible
                    ? "text-zinc-600 dark:text-zinc-300"
                    : "text-zinc-400 opacity-60 dark:text-zinc-600"
                }`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: isVisible ? colorOf(s) : "currentColor" }}
                />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Contrôles de zoom */}
        <div className="flex items-center gap-1 rounded-full bg-zinc-100 p-0.5 dark:bg-zinc-800">
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom !== null && zoom.end - zoom.start <= 2}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-zinc-500 transition hover:bg-white hover:text-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-50"
            title="Zoom avant"
          >
            +
          </button>
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom === null}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-zinc-500 transition hover:bg-white hover:text-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-50"
            title="Zoom arrière"
          >
            −
          </button>
          <button
            type="button"
            onClick={resetZoom}
            disabled={zoom === null}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-white hover:text-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-50"
            title="Réinitialiser le zoom"
          >
            Tout
          </button>
        </div>
      </div>

      {/* Chart area */}
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full select-none"
          role="img"
          aria-label="Évolution mensuelle"
        >
          <defs>
            {visibleSeries.map((s) => (
              <linearGradient
                key={s.key}
                id={`${gradientPrefix}-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={colorOf(s)}
                  stopOpacity={isDark ? 0.22 : 0.28}
                />
                <stop offset="100%" stopColor={colorOf(s)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {/* Grid lines */}
          {gridValues.map((v, i) => (
            <g key={i}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={yAt(v)}
                y2={yAt(v)}
                className="stroke-zinc-100 dark:stroke-zinc-800"
                strokeWidth={1}
              />
              <text
                x={padding.left - 10}
                y={yAt(v)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-zinc-400 text-[10px] tabular-nums dark:fill-zinc-500"
              >
                {formatTick(v)}
              </text>
            </g>
          ))}

          {/* Month labels */}
          {visibleLabels.map((label, i) => (
            <text
              key={label}
              x={xAt(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-zinc-400 text-[10px] dark:fill-zinc-500"
            >
              {label}
            </text>
          ))}

          {/* Brush highlight */}
          {brushLeft !== null && brushRight !== null && (
            <rect
              x={brushLeft}
              y={padding.top}
              width={brushRight - brushLeft}
              height={plotH}
              className="fill-black/5 dark:fill-white/10"
              rx={3}
            />
          )}

          {/* Aires dégradées — toutes peintes d'abord pour qu'aucun
              remplissage ne recouvre la courbe d'une autre série */}
          {paths.map((p) =>
            p.area ? (
              <path
                key={`area-${p.key}`}
                d={p.area}
                fill={`url(#${gradientPrefix}-${p.key})`}
              />
            ) : null,
          )}

          {/* Courbes lissées + point de fin — dessinées en ordre inverse de
              la liste de séries : quand deux séries ont exactement la même
              valeur à un point (ex. autant d'enregistrés que de payés ce
              mois-là), leurs tracés se superposent pixel pour pixel et seul
              le dernier dessiné resterait visible. La première série listée
              étant la plus "englobante" (funnel : enregistrés ≥ payés ≥
              inscriptions finalisées), elle doit rester au-dessus. */}
          {[...paths].reverse().map((p) => (
            <g key={`line-${p.key}`}>
              <path
                d={p.line}
                fill="none"
                stroke={p.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={p.endX}
                cy={p.endY}
                r={5.5}
                className="fill-white dark:fill-zinc-900"
              />
              <circle cx={p.endX} cy={p.endY} r={3.5} fill={p.color} />
            </g>
          ))}

          {/* Hover vertical line */}
          {hoverX !== null && (
            <line
              x1={hoverX}
              x2={hoverX}
              y1={padding.top}
              y2={padding.top + plotH}
              className="stroke-zinc-300 dark:stroke-zinc-600"
              strokeWidth={1}
            />
          )}

          {/* Marqueurs sur le point survolé — même ordre inversé que les
              courbes, pour rester cohérent quand les valeurs coïncident */}
          {hover !== null &&
            [...visibleSeries].reverse().map((s) => (
              <g key={`hover-${s.key}`} className="pointer-events-none">
                <circle
                  cx={xAt(hover)}
                  cy={yAt(s.values[hover])}
                  r={5.5}
                  className="fill-white dark:fill-zinc-900"
                />
                <circle
                  cx={xAt(hover)}
                  cy={yAt(s.values[hover])}
                  r={3.5}
                  fill={colorOf(s)}
                />
              </g>
            ))}

          {/* Interaction layer: hover + brush */}
          <rect
            x={padding.left}
            y={padding.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => {
              if (!isBrushing) setHover(null);
              if (isBrushing) handleBrushEnd();
            }}
            onPointerDown={handleBrushStart}
            onPointerMoveCapture={isBrushing ? handleBrushMove : undefined}
            onPointerUp={handleBrushEnd}
            style={{ cursor: isBrushing ? "ew-resize" : "crosshair" }}
          />
        </svg>

        {/* Tooltip */}
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-xl border border-black/5 bg-white px-3 py-2 text-xs whitespace-nowrap shadow-xl ring-1 ring-black/5 dark:border-white/10 dark:bg-zinc-800 dark:ring-white/5"
            style={{
              left: `${Math.min(88, Math.max(12, (hoverX! / width) * 100))}%`,
            }}
          >
            <p className="mb-1 font-semibold text-zinc-500 dark:text-zinc-400">
              {visibleLabels[hover]}
            </p>
            {visibleSeries.map((s) => (
              <p
                key={s.key}
                className="flex items-center gap-1.5 leading-5 text-zinc-500 dark:text-zinc-400"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: colorOf(s) }}
                />
                <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
                  {s.values[hover]}
                </span>
                {s.label}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Accessible data table */}
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
          Afficher les données en tableau
        </summary>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-black/10 text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                <th className="py-1 pr-3 font-semibold">Mois</th>
                {visibleSeries.map((s) => (
                  <th key={s.key} className="py-1 pr-3 font-semibold">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleLabels.map((label, i) => (
                <tr
                  key={label}
                  className="border-b border-black/5 last:border-0 dark:border-white/5"
                >
                  <td className="py-1 pr-3 text-zinc-700 dark:text-zinc-300">
                    {label}
                  </td>
                  {visibleSeries.map((s) => (
                    <td key={s.key} className="py-1 pr-3 text-zinc-700 dark:text-zinc-300">
                      {s.values[i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

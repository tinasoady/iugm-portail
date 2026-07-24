"use client";

import { useRef, useState, useSyncExternalStore, useMemo } from "react";

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

function niceMaxValue(maxValue: number): number {
  const raw = maxValue * 1.15;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    if (raw <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
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
  height = 200,
}: {
  labels: string[];
  series: LineChartSeries[];
  height?: number;
}) {
  const isDark = useIsDarkMode();
  const colorOf = (s: LineChartSeries) => (isDark ? s.darkColor : s.color);

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
  const maxValue = Math.max(1, ...visibleSeries.flatMap((s) => s.values));
  const niceMax = niceMaxValue(maxValue);

  const width = 600;
  const padding = { top: 12, right: 12, bottom: 24, left: 32 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const xAt = (i: number) =>
    padding.left +
    (visibleLabels.length > 1
      ? (i / (visibleLabels.length - 1)) * plotW
      : plotW / 2);
  const yAt = (v: number) => padding.top + plotH - (v / niceMax) * plotH;

  const gridSteps = 4;
  const gridValues = Array.from(
    { length: gridSteps + 1 },
    (_, i) => (niceMax / gridSteps) * i,
  );

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
        {/* Series toggles */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => {
            const isVisible = visibleKeys.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleSeries(s.key)}
                className={`flex items-center gap-1.5 text-xs transition-opacity ${
                  isVisible
                    ? "text-zinc-700 dark:text-zinc-200"
                    : "text-zinc-400 opacity-50 dark:text-zinc-600"
                }`}
              >
                <span
                  className="inline-block h-0.5 w-3 rounded-full"
                  style={{ backgroundColor: isVisible ? colorOf(s) : "currentColor" }}
                />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom !== null && zoom.end - zoom.start <= 2}
            className="rounded-md border border-black/10 px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            title="Zoom avant"
          >
            🔍+
          </button>
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom === null}
            className="rounded-md border border-black/10 px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            title="Zoom arrière"
          >
            🔍−
          </button>
          <button
            type="button"
            onClick={resetZoom}
            disabled={zoom === null}
            className="rounded-md border border-black/10 px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            title="Réinitialiser le zoom"
          >
            ↔
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
          {/* Grid lines */}
          {gridValues.map((v, i) => (
            <g key={i}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={yAt(v)}
                y2={yAt(v)}
                className="stroke-zinc-200 dark:stroke-zinc-800"
                strokeWidth={1}
              />
              <text
                x={padding.left - 6}
                y={yAt(v)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-zinc-400 text-[9px] dark:fill-zinc-500"
              >
                {Math.round(v)}
              </text>
            </g>
          ))}

          {/* Month labels */}
          {visibleLabels.map((label, i) => (
            <text
              key={label}
              x={xAt(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-zinc-400 text-[9px] dark:fill-zinc-500"
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

          {/* Curves */}
          {visibleSeries.map((s) => {
            const d = s.values
              .map(
                (v, i) =>
                  `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`,
              )
              .join(" ");
            const last = s.values.length - 1;
            const color = colorOf(s);
            return (
              <g key={s.key}>
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-all duration-300"
                />
                {/* Endpoint dot */}
                <circle
                  cx={xAt(last)}
                  cy={yAt(s.values[last])}
                  r={5}
                  className="fill-white dark:fill-zinc-900"
                />
                <circle cx={xAt(last)} cy={yAt(s.values[last])} r={3} fill={color} />
              </g>
            );
          })}

          {/* Hover vertical line */}
          {hoverX !== null && (
            <line
              x1={hoverX}
              x2={hoverX}
              y1={padding.top}
              y2={padding.top + plotH}
              className="stroke-zinc-300 dark:stroke-zinc-700"
              strokeWidth={1}
            />
          )}

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
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg dark:border-white/10 dark:bg-zinc-800"
            style={{ left: `${(hoverX! / width) * 100}%` }}
          >
            <p className="mb-0.5 font-semibold text-zinc-900 dark:text-zinc-50">
              {visibleLabels[hover]}
            </p>
            {visibleSeries.map((s) => (
              <p
                key={s.key}
                className="flex items-center gap-1 text-zinc-600 dark:text-zinc-300"
              >
                <span
                  className="inline-block h-0.5 w-2.5 rounded-full"
                  style={{ backgroundColor: colorOf(s) }}
                />
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                  {s.values[hover]}
                </span>{" "}
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

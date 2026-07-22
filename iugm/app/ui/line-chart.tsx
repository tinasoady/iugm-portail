"use client";

import { useRef, useState, useSyncExternalStore } from "react";

export type LineChartSeries = {
  key: string;
  label: string;
  // Couleurs validées (palette catégorielle, slots 1-3 : passent le contrôle
  // CVD tout-contre-tout en clair ET en sombre — voir palette.md du skill dataviz)
  color: string;
  darkColor: string;
  values: number[];
};

// Détecte le thème actif (classe .dark sur <html>, posée par ThemeToggle) et
// suit ses changements en direct — les couleurs de séries viennent de données
// runtime, donc pas de classe Tailwind arbitraire possible (le JIT ne peut pas
// voir des hex interpolés à l'exécution) : on résout la bonne teinte en JS.
// useSyncExternalStore (plutôt qu'un useState+useEffect) évite tout avertissement
// d'hydratation : le rendu serveur et la première passe client utilisent tous
// deux `getServerSnapshot` (false), puis React corrige immédiatement après coup.
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

// Graphique à courbes multiples (évolution mensuelle), avec légende, repère +
// info-bulle au survol, et un tableau de secours toujours dans le DOM pour
// l'accessibilité, l'impression et le cas sans JS.
export function LineChart({
  labels,
  series,
  height = 260,
}: {
  labels: string[];
  series: LineChartSeries[];
  height?: number;
}) {
  const isDark = useIsDarkMode();
  const colorOf = (s: LineChartSeries) => (isDark ? s.darkColor : s.color);

  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const width = 720;
  const padding = { top: 16, right: 16, bottom: 28, left: 36 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const maxValue = Math.max(1, ...series.flatMap((s) => s.values));
  // Arrondi à un palier "propre" (1, 2, 2.5, 5, 10 × une puissance de 10) pour des graduations lisibles
  const niceMax = (() => {
    const raw = maxValue * 1.15;
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
    const steps = [1, 2, 2.5, 5, 10];
    for (const step of steps) {
      if (raw <= step * magnitude) return step * magnitude;
    }
    return 10 * magnitude;
  })();

  const xAt = (i: number) =>
    padding.left + (labels.length > 1 ? (i / (labels.length - 1)) * plotW : plotW / 2);
  const yAt = (v: number) => padding.top + plotH - (v / niceMax) * plotH;

  const gridSteps = 4;
  const gridValues = Array.from({ length: gridSteps + 1 }, (_, i) => (niceMax / gridSteps) * i);

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratio = width / rect.width;
    const xInViewBox = (e.clientX - rect.left) * ratio;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < labels.length; i++) {
      const d = Math.abs(xAt(i) - xInViewBox);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHover(nearest);
  }

  const hoverX = hover !== null ? xAt(hover) : null;

  return (
    <div>
      {/* Légende : identité toujours par texte + trait coloré, jamais la couleur seule */}
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {series.map((s) => (
          <span
            key={s.key}
            className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300"
          >
            <span
              className="inline-block h-0.5 w-4 rounded-full"
              style={{ backgroundColor: colorOf(s) }}
            />
            {s.label}
          </span>
        ))}
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          role="img"
          aria-label="Évolution mensuelle : voir le tableau ci-dessous pour le détail"
        >
          {/* Grille horizontale (hairline, recessive) */}
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
                x={padding.left - 8}
                y={yAt(v)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-zinc-400 text-[10px] dark:fill-zinc-500"
              >
                {Math.round(v)}
              </text>
            </g>
          ))}

          {/* Axe des mois */}
          {labels.map((label, i) => (
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

          {/* Courbes */}
          {series.map((s) => {
            const d = s.values.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`).join(" ");
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
                />
                {/* Point terminal : anneau surface + disque coloré (≥8px) */}
                <circle
                  cx={xAt(last)}
                  cy={yAt(s.values[last])}
                  r={6}
                  className="fill-white dark:fill-zinc-900"
                />
                <circle cx={xAt(last)} cy={yAt(s.values[last])} r={4} fill={color} />
              </g>
            );
          })}

          {/* Repère vertical au survol */}
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

          {/* Zone de capture du survol (toute la largeur du tracé) */}
          <rect
            x={padding.left}
            y={padding.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={handleMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>

        {/* Info-bulle : la valeur en avant, le nom de série en second */}
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs whitespace-nowrap shadow-lg dark:border-white/10 dark:bg-zinc-800"
            style={{ left: `${(hoverX! / width) * 100}%` }}
          >
            <p className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">{labels[hover]}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                <span
                  className="inline-block h-0.5 w-3 rounded-full"
                  style={{ backgroundColor: colorOf(s) }}
                />
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                  {s.values[hover]}
                </span>
                {s.label}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Tableau de secours : toujours dans le DOM (accessibilité, impression, sans JS) */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
          Afficher les données en tableau
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/10 text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                <th className="py-1.5 pr-3 font-semibold">Mois</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1.5 pr-3 font-semibold">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, i) => (
                <tr key={label} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="py-1.5 pr-3 text-zinc-700 dark:text-zinc-300">{label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1.5 pr-3 text-zinc-700 dark:text-zinc-300">
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

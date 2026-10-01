"use client";

import { useSyncExternalStore } from "react";

// Horloge en direct (heure locale du navigateur), rafraîchie chaque seconde.
// Le temps est une source externe : useSyncExternalStore l'expose sans
// setState dans un effet. Côté serveur (et pendant l'hydratation), le
// snapshot vaut null : on rend un espace réservé de même largeur, ce qui
// évite à la fois le décalage d'hydratation et un saut de mise en page.
function subscribe(onTick: () => void): () => void {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}

// Secondes Unix : valeur primitive stable entre deux ticks (exigé par
// useSyncExternalStore, qui compare les snapshots avec Object.is).
function getSnapshot(): number {
  return Math.floor(Date.now() / 1000);
}

function getServerSnapshot(): null {
  return null;
}

export function LiveClock({ className = "" }: { className?: string }) {
  const seconds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const now = seconds === null ? null : new Date(seconds * 1000);

  const time = now?.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const date = now?.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div
      className={`flex flex-col items-end leading-tight text-zinc-600 dark:text-zinc-300 ${className}`}
      title={now?.toLocaleDateString("fr-FR", { dateStyle: "full" })}
    >
      <span className="min-w-18 text-right text-sm font-semibold tabular-nums">
        {time ?? " "}
      </span>
      <span className="hidden text-[11px] text-zinc-500 sm:block dark:text-zinc-400">
        {date ?? " "}
      </span>
    </div>
  );
}

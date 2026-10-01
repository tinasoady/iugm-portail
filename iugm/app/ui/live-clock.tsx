"use client";

import { useEffect, useState } from "react";

// Horloge en direct (heure locale du navigateur), rafraîchie chaque seconde.
// L'heure n'est connue qu'après le montage : on rend un espace réservé de même
// largeur côté serveur pour éviter un décalage d'hydratation et de mise en page.
export function LiveClock({ className = "" }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
      <span className="min-w-[4.5rem] text-right text-sm font-semibold tabular-nums">
        {time ?? " "}
      </span>
      <span className="hidden text-[11px] text-zinc-500 sm:block dark:text-zinc-400">
        {date ?? " "}
      </span>
    </div>
  );
}

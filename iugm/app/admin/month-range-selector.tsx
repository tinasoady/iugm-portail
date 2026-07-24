"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const OPTIONS = [
  { value: 3, label: "3 mois" },
  { value: 6, label: "6 mois" },
  { value: 12, label: "12 mois" },
] as const;

export function MonthRangeSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = Number(searchParams.get("months")) || 6;

  const select = useCallback(
    (months: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("months", String(months));
      router.replace(`/admin?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">Période :</span>
      <div className="flex gap-1">
        {OPTIONS.map((opt) => {
          const isActive = active === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => select(opt.value)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}


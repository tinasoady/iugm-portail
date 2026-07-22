"use client";

// Bouton d'impression générique (déclenche simplement l'impression du navigateur).
// Les éléments non pertinents sur papier (ce bouton compris) doivent porter
// la classe Tailwind `print:hidden`.
export function PrintButton({ label = "🖨 Imprimer" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:from-indigo-500 hover:to-violet-500 print:hidden"
    >
      {label}
    </button>
  );
}

"use client";

import { FaPrint } from "react-icons/fa";

// Bouton d'impression générique (déclenche simplement l'impression du navigateur).
// Les éléments non pertinents sur papier (ce bouton compris) doivent porter
// la classe Tailwind `print:hidden`.
export function PrintButton({ label = "Imprimer" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-500 print:hidden"
    >
      <FaPrint size={14} />
      {label}
    </button>
  );
}

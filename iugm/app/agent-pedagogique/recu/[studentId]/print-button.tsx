"use client";

import { logReceiptPrintAction } from "../../actions";

export function PrintButton({ matricule, fullName }: { matricule: string; fullName: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        // Journalisation en arrière-plan, sans bloquer l'impression
        void logReceiptPrintAction(matricule, fullName);
        window.print();
      }}
      className="rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:from-indigo-500 hover:to-violet-500 print:hidden"
    >
      🖨 Imprimer le reçu
    </button>
  );
}

"use client";

import { FaPrint } from "react-icons/fa";

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
      className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-500 print:hidden"
    >
      <FaPrint size={14} />
      Imprimer le reçu
    </button>
  );
}

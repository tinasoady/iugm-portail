import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getAllFilteredStudents } from "@/lib/students";
import { getUserFormation } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { logAction } from "@/lib/audit";
import { buildStudentsExportWorkbook } from "@/app/etudiants/export-xlsx";

// Export Excel (.xlsx) de la liste telle qu'affichée sur /etudiants (mêmes
// filtres et tri, jamais limité à la page en cours). Ouvert à tous les
// rôles qui consultent cette liste — contrairement à /api/students/export
// (sauvegarde CSV complète, réservée à la tâche "csv" de l'agent
// d'administration, pour ré-import), ce n'est qu'un export du tableau à
// l'écran, sans les champs sensibles du dossier. Reprend le modèle du
// fichier officiel reçu de l'IUGM (bandeau ministériel, une feuille par
// niveau/filière) — voir app/etudiants/export-xlsx.ts.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !["AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year") ?? undefined;
  const params = {
    q: searchParams.get("q") ?? undefined,
    year,
    filiere: searchParams.get("filiere") ?? undefined,
    niveau: searchParams.get("niveau") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    dir: searchParams.get("dir") ?? undefined,
  };

  const formation = await getUserFormation(session.sub, session.role);
  const [students, settings] = await Promise.all([
    getAllFilteredStudents(params, formation),
    getSettings(),
  ]);
  const buffer = await buildStudentsExportWorkbook(students, settings, year ?? null);
  await logAction(
    "CSV_EXPORTED",
    `${students.length} dossier(s) exporté(s) (Excel) depuis la liste filtrée`,
    session.sub,
  );

  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="liste-etudiants-${today}.xlsx"`,
    },
  });
}

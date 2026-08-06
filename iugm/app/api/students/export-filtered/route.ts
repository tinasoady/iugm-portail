import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getAllFilteredStudents } from "@/lib/students";
import { getUserFormation } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { logAction } from "@/lib/audit";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { buildStudentsExportWorkbook } from "@/app/etudiants/export-xlsx";

// Export "vue à l'écran" : usage plus fréquent que la sauvegarde CSV complète
// (/api/students/export), donc une limite plus large — le but reste de
// freiner un compte compromis, pas de gêner l'usage normal.
const MAX_EXPORTS_PER_WINDOW = 20;

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

  const rateLimit = checkActionRateLimit(`export-xlsx:${session.sub}`, MAX_EXPORTS_PER_WINDOW);
  if (rateLimit.limited) {
    await logAction(
      "EXPORT_RATE_LIMITED",
      `Export Excel (liste filtrée) bloqué (trop d'appels récents) pour ${session.email}`,
      session.sub,
    );
    return NextResponse.json(
      { error: `Trop d'exports récents. Réessayez dans ${rateLimit.retryAfterMinutes} minutes.` },
      { status: 429 },
    );
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

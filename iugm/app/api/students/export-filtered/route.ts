import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { exportFilteredStudentsCsv } from "@/lib/students";
import { getUserFormation } from "@/lib/permissions";

// Export CSV de la liste telle qu'affichée sur /etudiants (mêmes filtres et
// tri, jamais limité à la page en cours). Ouvert à tous les rôles qui
// consultent cette liste — contrairement à /api/students/export (sauvegarde
// complète, réservée à la tâche "csv" de l'agent d'administration), ce n'est
// qu'un export du tableau à l'écran, sans les champs sensibles du dossier.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !["AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const params = {
    q: searchParams.get("q") ?? undefined,
    year: searchParams.get("year") ?? undefined,
    filiere: searchParams.get("filiere") ?? undefined,
    niveau: searchParams.get("niveau") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    dir: searchParams.get("dir") ?? undefined,
  };

  const formation = await getUserFormation(session.sub, session.role);
  const csv = await exportFilteredStudentsCsv(params, formation, session.sub);
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="liste-etudiants-${today}.csv"`,
    },
  });
}

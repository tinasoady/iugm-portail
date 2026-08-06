import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { exportStudentsCsv } from "@/lib/students";
import { hasTaskPermission, PERMISSION_DENIED_MESSAGE } from "@/lib/permissions";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { logAction } from "@/lib/audit";

// Sauvegarde complète de la base : peu d'appels légitimes par session de
// travail, donc une limite basse suffit à freiner un compte compromis ou un
// script qui aspirerait la base en boucle sans bloquer un usage normal.
const MAX_EXPORTS_PER_WINDOW = 5;

export async function GET() {
  const session = await getSession();
  if (!session || !["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  if (!(await hasTaskPermission(session.sub, session.role, "csv"))) {
    return NextResponse.json({ error: PERMISSION_DENIED_MESSAGE }, { status: 403 });
  }

  const rateLimit = checkActionRateLimit(`export-csv:${session.sub}`, MAX_EXPORTS_PER_WINDOW);
  if (rateLimit.limited) {
    await logAction(
      "EXPORT_RATE_LIMITED",
      `Export CSV complet bloqué (trop d'appels récents) pour ${session.email}`,
      session.sub,
    );
    return NextResponse.json(
      { error: `Trop d'exports récents. Réessayez dans ${rateLimit.retryAfterMinutes} minutes.` },
      { status: 429 },
    );
  }

  const csv = await exportStudentsCsv(session.sub);
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      // BOM UTF-8 absent volontairement : le fichier reste réimportable tel quel.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dossiers-etudiants-${today}.csv"`,
    },
  });
}

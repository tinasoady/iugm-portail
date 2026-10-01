import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { hasTaskPermission, getUserFormation, PERMISSION_DENIED_MESSAGE } from "@/lib/permissions";
import { getFinancialReport, parseReportParams } from "@/lib/reports";
import { buildFinancialReportWorkbook } from "@/lib/reports-xlsx";
import { FORMATIONS } from "@/lib/formations";
import { getSettings } from "@/lib/settings";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { logAction } from "@/lib/audit";

// Export Excel de l'état récapitulatif (effectifs, encaissements, reste dû).
// Données financières : réservé au superadmin et aux agents d'administration
// qui ont la tâche « écolage », et limité en débit comme les autres exports.
const MAX_EXPORTS_PER_WINDOW = 10;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  if (!(await hasTaskPermission(session.sub, session.role, "ecolage"))) {
    return NextResponse.json({ error: PERMISSION_DENIED_MESSAGE }, { status: 403 });
  }

  const rateLimit = checkActionRateLimit(`export-report:${session.sub}`, MAX_EXPORTS_PER_WINDOW);
  if (rateLimit.limited) {
    await logAction(
      "EXPORT_RATE_LIMITED",
      `Export de l'état récapitulatif bloqué (trop d'appels récents) pour ${session.email}`,
      session.sub,
    );
    return NextResponse.json(
      { error: `Trop d'exports récents. Réessayez dans ${rateLimit.retryAfterMinutes} minutes.` },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(req.url);
  const params = parseReportParams(
    {
      year: searchParams.get("year") ?? undefined,
      level: searchParams.get("level") ?? undefined,
      f: searchParams.get("f") ?? undefined,
    },
    FORMATIONS.map((f) => f.label),
  );
  const scopeFormation = await getUserFormation(session.sub, session.role);

  const [report, settings] = await Promise.all([
    getFinancialReport({ ...params, scopeFormation }),
    getSettings(),
  ]);
  const generatedAt = new Date();
  const buffer = await buildFinancialReportWorkbook(report, {
    institutionName: settings.institutionName,
    academicYear: params.academicYear,
    level: params.level,
    formation: scopeFormation ?? params.formation,
    generatedAt,
  });
  await logAction(
    "CSV_EXPORTED",
    `État récapitulatif exporté (Excel) : ${report.totals.headcount} dossier(s)`,
    session.sub,
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="etat-recapitulatif-${generatedAt.toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}

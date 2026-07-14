import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { exportStudentsCsv } from "@/lib/students";

export async function GET() {
  const session = await getSession();
  if (!session || !["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
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

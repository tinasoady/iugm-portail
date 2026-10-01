import { NextResponse } from "next/server";

import { getHealthReport } from "@/lib/health";

// Toujours calculée à la demande : une réponse mise en cache masquerait une panne
export const dynamic = "force-dynamic";

// Publique (voir proxy.ts) : une sonde de supervision n'a pas de session.
// 200 si tout va bien, 503 si la base ne répond pas — c'est ce code que les
// outils de supervision interprètent pour déclencher une alerte.
export async function GET() {
  const report = await getHealthReport();
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

// Sonde de joignabilité appelée par le navigateur (voir lib/offline/
// connectivity.ts) : répond sans toucher à la base de données ni à la session,
// pour pouvoir être interrogée souvent à moindre coût. Distincte de
// /api/health, qui interroge la base et sert à la supervision.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export const HEAD = GET;

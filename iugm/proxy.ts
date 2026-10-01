import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Routes accessibles sans session : la connexion elle-même, la route API qui
// la crée, et la carte étudiante publique consultée via QR code (voir le
// commentaire dans app/carte-etudiant/[token]/page.tsx).
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/login",
  "/carte-etudiant",
  "/mot-de-passe-oublie",
  "/reinitialiser-mot-de-passe",
  "/api/health",
];

const PASSWORD_CHANGE_PATH = "/changer-mot-de-passe";

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Filet de sécurité global : chaque page et Server Action protégée vérifie
// déjà sa session (voir getSession() dans lib/auth.ts), mais rien n'empêche
// qu'une future route l'oublie. Ce contrôle est volontairement "optimiste"
// (signature + expiration du cookie, sans requête base de données) — les
// vérifications fines de rôle et de permissions restent la responsabilité de
// chaque page/action, seules à avoir accès à la base pour les faire
// correctement (voir lib/permissions.ts).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Changement de mot de passe obligatoire (mot de passe temporaire ou initial) :
  // la session ne sert qu'à atteindre la page de changement, nulle part ailleurs.
  // Les Server Actions sont des POST vers l'URL de la page courante : elles
  // sont donc bloquées de la même façon hors de cette page.
  if (session.mcp && pathname !== PASSWORD_CHANGE_PATH) {
    return NextResponse.redirect(new URL(PASSWORD_CHANGE_PATH, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

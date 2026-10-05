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
  "/confirmer-adresse",
  "/activer-compte",
  "/api/health",
  // Sonde de joignabilité du navigateur (aucune donnée, voir la route)
  "/api/ping",
  // Répond 401 + motif au contrôle périodique du navigateur (voir la route)
  "/api/session/status",
];

// Fichiers statiques de public/ que le NAVIGATEUR réclame sans session : icône
// d'onglet, manifeste d'installation et service worker. Sans cette liste, le
// proxy les redirigeait vers /login pour tout visiteur déconnecté : pas
// d'icône sur la page de connexion, manifeste inutilisable, service worker non
// enregistrable. Aucune donnée : ce sont des fichiers identiques pour tous.
const PUBLIC_ASSETS = new Set([
  "/icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/manifest.json",
  "/sw.js",
]);

const PASSWORD_CHANGE_PATH = "/changer-mot-de-passe";

function isPublic(pathname: string): boolean {
  if (PUBLIC_ASSETS.has(pathname)) return true;
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

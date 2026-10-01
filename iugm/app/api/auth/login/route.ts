import { NextResponse } from "next/server";

import { authenticateUser } from "@/lib/login";
import {
  SESSION_COOKIE,
  TWO_FACTOR_COOKIE,
  TWO_FACTOR_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/auth";

// Point d'entrée API (la page de connexion utilise la Server Action app/login/actions.ts,
// qui affiche les erreurs sur place ; cette route reste disponible pour les clients HTTP)
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    const result = await authenticateUser(email, password);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (result.kind === "two-factor") {
      // Le second facteur se saisit sur la page dédiée, qui lit ce cookie
      const res = NextResponse.redirect(new URL("/login/verification", req.url), 303);
      res.cookies.set(TWO_FACTOR_COOKIE, result.challengeToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/login",
        maxAge: TWO_FACTOR_MAX_AGE,
      });
      return res;
    }

    const res = NextResponse.redirect(new URL(result.destination, req.url), 303);
    res.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
    return res;
  } catch (e) {
    console.error("Erreur /api/auth/login :", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

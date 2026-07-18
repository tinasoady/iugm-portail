import { NextResponse } from "next/server";

import { authenticateUser } from "@/lib/login";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

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

    const res = NextResponse.redirect(new URL(result.destination, req.url), 303);
    res.cookies.set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (e) {
    console.error("Erreur /api/auth/login :", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

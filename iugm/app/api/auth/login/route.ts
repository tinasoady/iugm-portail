import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, passwordHash: true },
    });

    if (!user) {
      await logAction("LOGIN_FAILED", `Email inconnu : ${email}`);
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }

    // Le seed et la page admin hashent les mots de passe avec bcrypt (bcryptjs)
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await logAction("LOGIN_FAILED", `Mot de passe erroné pour ${email}`, user.id);
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }

    const token = createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await logAction("LOGIN_SUCCESS", `Connexion de ${user.email}`, user.id);

    // Chaque rôle arrive directement sur son tableau de bord
    const HOME_BY_ROLE: Record<string, string> = {
      SUPERADMIN: "/admin",
      AGENT_ADMINISTRATION: "/agent-admin",
      AGENT_PEDAGOGIQUE: "/agent-pedagogique",
    };
    const destination = HOME_BY_ROLE[user.role] ?? "/";
    const res = NextResponse.redirect(new URL(destination, req.url), 303);

    res.cookies.set(SESSION_COOKIE, token, {
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

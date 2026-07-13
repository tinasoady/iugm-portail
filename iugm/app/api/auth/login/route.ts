import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

import { prisma } from "@/lib/prisma";

function timingSafeEqual(a: Buffer, b: Buffer) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyPassword(password: string, passwordHash: string) {
  // format attendu: pbkdf2$<iterations>$<saltHex>$<hashHex>
  const [algo, iterStr, saltHex, hashHex] = passwordHash.split("$");
  if (algo !== "pbkdf2" || !iterStr || !saltHex || !hashHex) return false;

  const iterations = Number(iterStr);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");

  const derived = crypto.pbkdf2Sync(password, salt, iterations, expected.length, "sha512");
  return timingSafeEqual(derived, expected);
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
    }

    const user = await prisma.personnel.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }

    const ok = verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }

    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret) {
      return NextResponse.json({ error: "Configuration AUTH_SECRET manquante" }, { status: 500 });
    }

    // session token signé (simple) : base64(payload).signature
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto
      .createHmac("sha256", authSecret)
      .update(payloadB64)
      .digest("hex");

    const token = `${payloadB64}.${sig}`;

    // Redirect vers une page future (pour l’instant /)
    const redirectUrl = new URL("/", req.url);
    const res = NextResponse.redirect(redirectUrl);

    res.cookies.set("iugm_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8, // 8h
    });

    return res;
  } catch (e) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}


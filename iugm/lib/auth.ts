import crypto from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "iugm_session";
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8h

export type SessionPayload = {
  sub: string; // id de l'utilisateur
  email: string;
  role: string;
  iat: number; // date d'émission (secondes Unix)
};

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Configuration AUTH_SECRET manquante");
  return secret;
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", getAuthSecret()).update(payloadB64).digest("hex");
}

// Crée un jeton de session signé : base64(payload).signature
export function createSessionToken(payload: Omit<SessionPayload, "iat">): string {
  const fullPayload: SessionPayload = { ...payload, iat: Math.floor(Date.now() / 1000) };
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

// Vérifie la signature et l'expiration du jeton ; retourne null si invalide
export function verifySessionToken(token: string): SessionPayload | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;

  const expected = sign(payloadB64);
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as SessionPayload;
    // Expiration côté serveur (le maxAge du cookie ne suffit pas)
    if (!payload.iat || payload.iat + SESSION_MAX_AGE < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// Lit la session depuis le cookie de la requête en cours (Server Components / Actions)
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

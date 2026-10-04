"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { authenticateUser, completeTwoFactorLogin } from "@/lib/login";
import {
  SESSION_COOKIE,
  TWO_FACTOR_COOKIE,
  TWO_FACTOR_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/auth";

export type LoginState = { error?: string };

// Le cookie du défi 2FA n'a besoin d'être envoyé qu'aux pages /login/* :
// il n'accompagne donc aucune autre requête.
function twoFactorCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/login",
    maxAge: TWO_FACTOR_MAX_AGE,
  };
}

// Connexion via Server Action : en cas d'échec, l'erreur est retournée au
// formulaire et affichée sous les champs — aucune nouvelle page n'est chargée.
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await authenticateUser(identifier, password);
  if (!result.ok) {
    return { error: result.error };
  }

  const cookieStore = await cookies();
  if (result.kind === "two-factor") {
    cookieStore.set(TWO_FACTOR_COOKIE, result.challengeToken, twoFactorCookieOptions());
    redirect("/login/verification");
  }

  cookieStore.set(SESSION_COOKIE, result.token, sessionCookieOptions());
  redirect(result.destination);
}

// Seconde étape : code de l'application d'authentification, ou code de secours
export async function verifyTwoFactorAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const code = String(formData.get("code") ?? "");
  const cookieStore = await cookies();
  const challengeToken = cookieStore.get(TWO_FACTOR_COOKIE)?.value;

  const result = await completeTwoFactorLogin(challengeToken, code);
  if (!result.ok) {
    return { error: result.error };
  }
  if (result.kind !== "session") {
    return { error: "Réponse inattendue." };
  }

  cookieStore.delete({ name: TWO_FACTOR_COOKIE, path: "/login" });
  cookieStore.set(SESSION_COOKIE, result.token, sessionCookieOptions());
  redirect(result.destination);
}

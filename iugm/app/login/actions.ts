"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { authenticateUser } from "@/lib/login";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export type LoginState = { error?: string };

// Connexion via Server Action : en cas d'échec, l'erreur est retournée au
// formulaire et affichée sous les champs — aucune nouvelle page n'est chargée.
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const result = await authenticateUser(email, password);
  if (!result.ok) {
    return { error: result.error };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  redirect(result.destination);
}

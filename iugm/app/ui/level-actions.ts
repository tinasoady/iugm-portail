"use server";

import { cookies } from "next/headers";

import { LEVEL_COOKIE } from "@/lib/level-shared";

// Mémorise le choix de niveau (sélecteur global de l'en-tête).
// Valeur "ALL" = tous les niveaux confondus (voir getSelectedLevel).
export async function setLevel(level: string) {
  const store = await cookies();
  store.set(LEVEL_COOKIE, level, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

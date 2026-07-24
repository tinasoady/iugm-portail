"use server";

import { cookies } from "next/headers";

import { ACADEMIC_YEAR_COOKIE } from "@/lib/academic-year-shared";

// Mémorise le choix d'année universitaire (sélecteur global de l'en-tête).
// Valeur "ALL" = toutes les années confondues (voir getSelectedAcademicYear).
export async function setAcademicYear(year: string) {
  const store = await cookies();
  store.set(ACADEMIC_YEAR_COOKIE, year, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 an : un choix d'archive n'a pas de raison d'expirer vite
  });
}

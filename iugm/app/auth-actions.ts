"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession, SESSION_COOKIE } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function logout() {
  // Un compte soumis au changement de mot de passe obligatoire doit pouvoir se déconnecter
  const session = await getSession({ allowPasswordChange: true });
  if (session) {
    await logAction("LOGOUT", `Déconnexion de ${session.email}`, session.sub);
  }
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}

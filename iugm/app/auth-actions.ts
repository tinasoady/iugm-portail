"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession, SESSION_COOKIE } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function logout() {
  const session = await getSession();
  if (session) {
    await logAction("LOGOUT", `Déconnexion de ${session.email}`, session.sub);
  }
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}

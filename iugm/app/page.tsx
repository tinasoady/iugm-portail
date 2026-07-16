import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";

const HOME_BY_ROLE: Record<string, string> = {
  SUPERADMIN: "/admin",
  AGENT_ADMINISTRATION: "/agent-admin",
  AGENT_PEDAGOGIQUE: "/agent-pedagogique",
  ETUDIANT: "/mon-profil",
};

// La racine redirige chacun vers son espace (ou vers la connexion)
export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(HOME_BY_ROLE[session.role] ?? "/login");
}

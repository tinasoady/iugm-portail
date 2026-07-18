import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { defaultEnrollmentYear } from "@/lib/students";
import { hasTaskPermission } from "@/lib/permissions";
import { AppShell } from "@/app/ui/app-shell";
import { InscriptionWizard } from "./wizard";

export default async function InscriptionPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) redirect("/");
  if (!(await hasTaskPermission(session.sub, session.role, "inscription"))) redirect("/agent-admin");

  // Année en cours + année suivante ; celle par défaut correspond à l'année d'inscription
  const defaultYear = defaultEnrollmentYear();
  const startYear = Number(defaultYear.split("-")[0]);
  const years = [
    `${startYear - 1}-${startYear}`,
    defaultYear,
    `${startYear + 1}-${startYear + 2}`,
  ];

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Inscription d'un nouvel étudiant"
      active="/agent-admin/inscription"
    >
      <div className="mx-auto w-full max-w-3xl">
        <InscriptionWizard years={years} defaultYear={defaultYear} />
      </div>
    </AppShell>
  );
}

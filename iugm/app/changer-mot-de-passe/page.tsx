import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/app/ui/app-shell";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { mustChangePassword: true },
  });

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Changer mon mot de passe"
      active="/changer-mot-de-passe"
    >
      <div className="mx-auto w-full max-w-md space-y-4">
        {user?.mustChangePassword && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <p className="font-semibold">⚠️ Changement de mot de passe obligatoire</p>
            <p className="mt-1">
              Votre mot de passe initial est votre numéro matricule, imprimé sur votre reçu
              d&apos;inscription : il est prévisible. Choisissez un mot de passe personnel pour
              sécuriser votre compte avant d&apos;accéder à votre profil.
            </p>
          </div>
        )}

        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <ChangePasswordForm />
        </section>
      </div>
    </AppShell>
  );
}

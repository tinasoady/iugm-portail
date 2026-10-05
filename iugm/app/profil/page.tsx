import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/app/ui/app-shell";
import { ChangePasswordForm } from "@/app/changer-mot-de-passe/change-password-form";
import { canUseTwoFactor } from "@/lib/two-factor";
import { maskEmail } from "@/lib/recovery-email";
import { InfoForm } from "./profile-forms";
import { PhotoForm } from "./photo-form";
import { TwoFactorCard } from "./two-factor-card";
import { RecoveryEmailCard } from "./recovery-email-card";

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Super administrateur",
  AGENT_ADMINISTRATION: "Agent d'administration",
  AGENT_PEDAGOGIQUE: "Agent pédagogique",
  ETUDIANT: "Étudiant",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-black/5 py-2 text-sm last:border-0 dark:border-white/5">
      <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{label}</span>
      <span
        className={
          value
            ? "text-right font-medium text-zinc-900 dark:text-zinc-50"
            : "text-right text-zinc-400 dark:text-zinc-600"
        }
      >
        {value || "—"}
      </span>
    </div>
  );
}

export default async function ProfilPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      email: true,
      fullName: true,
      role: true,
      jobTitle: true,
      photo: true,
      mustChangePassword: true,
      totpEnabled: true,
      recoveryCodes: true,
      recoveryEmail: true,
      studentFile: { select: { personalEmail: true } },
      createdAt: true,
    },
  });
  if (!user) redirect("/login");
  // Mot de passe initial prévisible : changement obligatoire avant tout accès
  if (user.mustChangePassword) redirect("/changer-mot-de-passe");

  return (
    <AppShell email={session.email} role={session.role} title="Mon compte" active="/profil">
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* Photo de profil */}
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {user.role === "ETUDIANT" ? "Photo d'identité" : "Photo de profil"}
          </h2>
          <PhotoForm
            currentPhoto={user.photo}
            initials={initialsOf(user.fullName ?? user.email)}
            isStudent={user.role === "ETUDIANT"}
          />
        </section>

        {/* Informations */}
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Mes informations
          </h2>
          <InfoForm fullName={user.fullName} />
          <div className="mt-5 border-t border-black/5 pt-3 dark:border-white/10">
            <InfoRow label="Identifiant de connexion" value={user.email} />
            <InfoRow label="Rôle" value={ROLE_LABELS[user.role] ?? user.role} />
            <InfoRow label="Fonction" value={user.jobTitle} />
            <InfoRow
              label="Compte créé le"
              value={new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(user.createdAt)}
            />
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              L&apos;email, le rôle et la fonction sont gérés par l&apos;administration.
            </p>
          </div>
        </section>
      </div>

      {/* Sécurité du compte : mot de passe, e-mail, 2FA côte à côte */}
      <div className="grid items-start gap-5 lg:grid-cols-2 2xl:grid-cols-3">
      {/* Mot de passe */}
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Changer mon mot de passe
        </h2>
        <ChangePasswordForm />
      </section>

      {/* Adresse e-mail vérifiée : tous les rôles (réinitialisation du mot de passe) */}
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Adresse e-mail</h2>
        <RecoveryEmailCard
          login={user.email}
          maskedRecovery={user.recoveryEmail ? maskEmail(user.recoveryEmail) : null}
          isStudent={user.role === "ETUDIANT"}
          suggestedEmail={user.studentFile?.personalEmail}
        />
      </section>

      {/* Double authentification : réservée au personnel (pas aux étudiants) */}
      {canUseTwoFactor(user.role) && (
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Double authentification
          </h2>
          <TwoFactorCard
            enabled={user.totpEnabled}
            recoveryCodesLeft={user.recoveryCodes.length}
          />
        </section>
      )}
      </div>
    </AppShell>
  );
}

import { notFound } from "next/navigation";
import { FaCheck } from "react-icons/fa";

import { getStudentByQrToken } from "@/lib/students";
import { getSettings } from "@/lib/settings";
import { STATUS_LABELS } from "@/app/ui/student-status";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

// Page publique (aucune connexion requise) affichée en scannant le QR code de
// la carte étudiante numérique : c'est le pendant de la carte physique, donc
// volontairement limitée à l'identité et au cursus (voir QR_CARD_SELECT dans
// lib/students.ts) — jamais le dossier administratif complet.
export default async function CarteEtudiantPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [student, settings] = await Promise.all([getStudentByQrToken(token), getSettings()]);
  if (!student) notFound();

  const isActive = student.status === "INSCRIT";
  const initials = student.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900">
        {/* En-tête établissement */}
        <div className="bg-indigo-600 px-6 py-4 text-center text-white">
          {settings.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- fichier local, next/image inutile ici
            <img
              src={settings.logo}
              alt={`Logo ${settings.institutionAcronym}`}
              className="mx-auto mb-1 h-10 w-10 rounded-full bg-white object-contain p-1"
            />
          )}
          <p className="text-sm font-bold tracking-wide">{settings.institutionAcronym}</p>
          <p className="text-[11px] text-indigo-100">Carte étudiante numérique</p>
        </div>

        {/* Identité */}
        <div className="flex flex-col items-center gap-3 px-6 py-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold text-white">
            {initials}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {student.fullName}
            </h1>
            <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
              {student.matricule}
            </p>
          </div>

          <span
            className={
              isActive
                ? "inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-300"
                : "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            }
          >
            {isActive ? (<><FaCheck size={10} /> Inscription active</>) : (STATUS_LABELS[student.status] ?? student.status)}
          </span>
        </div>

        {/* Cursus */}
        <div className="space-y-2 border-t border-black/5 px-6 py-4 dark:border-white/5">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Formation</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {student.mention ?? student.program ?? "—"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Niveau</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {student.level ?? student.track ?? "—"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Année universitaire</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {student.academicYear ?? "—"}
            </span>
          </div>
        </div>

        <p className="border-t border-black/5 px-6 py-3 text-center text-[11px] text-zinc-400 dark:border-white/5 dark:text-zinc-600">
          Carte vérifiée le {dateFormatter.format(new Date())} via le portail{" "}
          {settings.institutionAcronym}.
        </p>
      </div>
    </div>
  );
}

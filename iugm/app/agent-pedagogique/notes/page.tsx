import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { hasTaskPermission, getUserFormation, canManageStudent } from "@/lib/permissions";
import { listInscrits, getStudentProfile } from "@/lib/students";
import { listSubjectsForStudent } from "@/lib/subjects";
import { currentAcademicYear, getSelectedAcademicYear } from "@/lib/academic-year";
import { getSelectedLevel } from "@/lib/level";
import { AppShell } from "@/app/ui/app-shell";
import { NotesForm } from "./notes-form";

const selectClass =
  "rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50";

export default async function AgentPedagogiqueNotesPage({
  searchParams,
}: {
  searchParams: Promise<{
    qi?: string;
    studentId?: string;
    academicYear?: string;
    semester?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) redirect("/");
  if (!(await hasTaskPermission(session.sub, session.role, "notes"))) redirect("/");

  const { qi, studentId, academicYear, semester } = await searchParams;

  const userFormation = await getUserFormation(session.sub, session.role);
  const [selectedYear, selectedLevel] = await Promise.all([
    getSelectedAcademicYear(),
    getSelectedLevel(),
  ]);
  const defaultYear = selectedYear ?? currentAcademicYear();
  const gradingYear = academicYear?.trim() || defaultYear;
  const gradingSemester = semester === "S2" ? "S2" : "S1";

  const inscrits = await listInscrits(
    { q: qi, year: selectedYear, level: selectedLevel },
    userFormation,
  );

  let selectedStudent: Awaited<ReturnType<typeof getStudentProfile>> | null = null;
  let subjects: Awaited<ReturnType<typeof listSubjectsForStudent>> = [];
  let accessDenied = false;

  if (studentId) {
    if (!(await canManageStudent(session.sub, session.role, studentId))) {
      accessDenied = true;
    } else {
      selectedStudent = await getStudentProfile(studentId);
      if (selectedStudent) {
        subjects = await listSubjectsForStudent(studentId, gradingYear, gradingSemester);
      }
    }
  }

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Notes par matière"
      active="/agent-pedagogique/notes"
    >
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Choisir un étudiant
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Recherchez un étudiant inscrit pour saisir ses notes, matière par matière, pour un
          semestre donné. Seules les matières du catalogue correspondant à sa filière et à son
          niveau sont proposées (obligatoires et facultatives).
        </p>

        <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
          <input
            name="qi"
            type="search"
            defaultValue={qi ?? ""}
            placeholder="Nom ou matricule..."
            className={`w-56 ${selectClass}`}
          />
          <button
            type="submit"
            className="rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Rechercher
          </button>
        </form>

        {inscrits.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Aucun étudiant inscrit ne correspond à ces critères.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                  <th className="py-2 pr-4 font-medium">Matricule</th>
                  <th className="py-2 pr-4 font-medium">Nom</th>
                  <th className="py-2 pr-4 font-medium">Filière / Niveau</th>
                  <th className="py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {inscrits.map((s) => (
                  <tr
                    key={s.id}
                    className={
                      s.id === studentId
                        ? "border-b border-black/5 bg-indigo-50/60 last:border-0 dark:border-white/5 dark:bg-indigo-950/30"
                        : "border-b border-black/5 last:border-0 dark:border-white/5"
                    }
                  >
                    <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {s.matricule}
                    </td>
                    <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{s.fullName}</td>
                    <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">
                      {[s.program, s.level ?? s.track].filter(Boolean).join(" — ") || "—"}
                    </td>
                    <td className="py-2">
                      <a
                        href={`/agent-pedagogique/notes?studentId=${s.id}&academicYear=${gradingYear}&semester=${gradingSemester}${qi ? `&qi=${encodeURIComponent(qi)}` : ""}`}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500"
                      >
                        Saisir les notes
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {studentId && (
        <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          {accessDenied ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              Ce dossier relève d&apos;une autre formation : vous n&apos;êtes pas autorisé(e) à y
              assigner des notes.
            </p>
          ) : !selectedStudent ? (
            <p className="text-sm text-red-600 dark:text-red-400">Dossier introuvable.</p>
          ) : (
            <>
              <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {selectedStudent.fullName}{" "}
                <span className="font-mono text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  ({selectedStudent.matricule})
                </span>
              </h2>
              <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
                {[selectedStudent.program, selectedStudent.level ?? selectedStudent.track]
                  .filter(Boolean)
                  .join(" — ") || "—"}
              </p>

              <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
                <input type="hidden" name="studentId" value={studentId} />
                {qi && <input type="hidden" name="qi" value={qi} />}
                <input
                  name="academicYear"
                  type="text"
                  required
                  defaultValue={gradingYear}
                  pattern="\d{4}-\d{4}"
                  title="Format : 2025-2026"
                  className={`w-28 ${selectClass}`}
                />
                <select name="semester" defaultValue={gradingSemester} className={selectClass}>
                  <option value="S1">S1</option>
                  <option value="S2">S2</option>
                </select>
                <button
                  type="submit"
                  className="rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Afficher
                </button>
              </form>

              <NotesForm
                studentId={studentId}
                academicYear={gradingYear}
                semester={gradingSemester}
                subjects={subjects}
              />
            </>
          )}
        </section>
      )}
    </AppShell>
  );
}

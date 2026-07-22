import { notFound, redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { getStudentProfile } from "@/lib/students";
import { hasTaskPermission, canManageStudent, getUserFormation } from "@/lib/permissions";
import { FORMATIONS } from "@/lib/formations";
import { AppShell } from "@/app/ui/app-shell";
import { EditStudentForm } from "./edit-form";

// yyyy-MM-dd attendu par <input type="date">
function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function ModifierEtudiantPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) redirect("/");

  const { studentId } = await params;

  if (!(await hasTaskPermission(session.sub, session.role, "modification_dossier"))) {
    redirect(`/etudiants/${studentId}`);
  }
  if (!(await canManageStudent(session.sub, session.role, studentId))) {
    redirect("/etudiants");
  }

  const student = await getStudentProfile(studentId);
  if (!student) notFound();

  const userFormation = await getUserFormation(session.sub, session.role);

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title={`Modifier le dossier — ${student.fullName}`}
      active="/etudiants"
    >
      <div className="mx-auto w-full max-w-3xl">
        <EditStudentForm
          studentId={student.id}
          matricule={student.matricule}
          formations={FORMATIONS.map((f) => f.label)}
          lockedFormation={userFormation}
          defaults={{
            lastName: student.lastName ?? "",
            firstName: student.firstName ?? "",
            nationality: student.nationality ?? "Malagasy",
            gender: student.gender ?? "",
            birthDate: toDateInputValue(student.birthDate),
            birthPlace: student.birthPlace ?? "",
            cin: student.cin ?? "",
            cinIssueDate: toDateInputValue(student.cinIssueDate),
            cinIssuePlace: student.cinIssuePlace ?? "",
            phone: student.phone ?? "",
            personalEmail: student.personalEmail ?? "",
            address: student.address ?? "",
            maritalStatus: student.maritalStatus ?? "Célibataire",
            baccNumber: student.baccNumber ?? "",
            baccSeries: student.baccSeries ?? "",
            baccMention: student.baccMention ?? "",
            baccYear: student.baccYear ?? "",
            baccCenter: student.baccCenter ?? "",
            baccCountry: student.baccCountry ?? "",
            previousSchool: student.previousSchool ?? "",
            previousUniversity: student.previousUniversity ?? "",
            repeatCode: student.repeatCode ?? "N",
            fatherName: student.fatherName ?? "",
            motherName: student.motherName ?? "",
            parentsPhone: student.parentsPhone ?? "",
            parentsAddress: student.parentsAddress ?? "",
            parentsCity: student.parentsCity ?? "",
            guardianName: student.guardianName ?? "",
            guardianPhone: student.guardianPhone ?? "",
            guardianAddress: student.guardianAddress ?? "",
            domain: student.domain ?? "",
            formation: student.mention ?? student.program ?? "",
            track: student.track ?? "",
            trainingType: student.trainingType ?? "Formation initiale",
            level: student.level ?? "L1",
            docResidenceCert: student.docResidenceCert,
            docCinCopy: student.docCinCopy,
            docParentCin: student.docParentCin,
            docPhotos: student.docPhotos,
            docPinkFolder: student.docPinkFolder,
            docPaymentSlip: student.docPaymentSlip,
            docEngagementLetter: student.docEngagementLetter,
          }}
        />
      </div>
    </AppShell>
  );
}

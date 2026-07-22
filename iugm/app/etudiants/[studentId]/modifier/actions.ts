"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { updateStudent } from "@/lib/students";
import {
  hasTaskPermission,
  canManageStudent,
  getUserFormation,
  PERMISSION_DENIED_MESSAGE,
  FORMATION_DENIED_MESSAGE,
} from "@/lib/permissions";

export type EditStudentState = { error?: string };

// Champs obligatoires (libellés utilisés dans les messages d'erreur)
const REQUIRED_FIELDS: Array<[string, string]> = [
  ["lastName", "Nom"],
  ["firstName", "Prénom"],
  ["nationality", "Nationalité"],
  ["gender", "Sexe"],
  ["birthDate", "Date de naissance"],
  ["birthPlace", "Lieu de naissance"],
  ["phone", "Numéro de téléphone de l'étudiant"],
  ["address", "Adresse exacte de l'étudiant"],
  ["maritalStatus", "Situation familiale"],
  ["baccNumber", "Numéro du baccalauréat"],
  ["baccSeries", "Série du baccalauréat"],
  ["baccMention", "Mention au baccalauréat"],
  ["baccYear", "Année d'obtention du baccalauréat"],
  ["guardianName", "Personne à contacter d'urgence"],
  ["guardianPhone", "Téléphone de la personne à contacter"],
  ["formation", "Choix de formation"],
  ["level", "Niveau"],
];

export async function updateStudentAction(
  studentId: string,
  _prev: EditStudentState,
  formData: FormData,
): Promise<EditStudentState> {
  // Une Server Action reste appelable par POST direct : on revérifie le rôle et la tâche
  const session = await getSession();
  if (!session || !["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) {
    return { error: "Accès refusé." };
  }
  if (!(await hasTaskPermission(session.sub, session.role, "modification_dossier"))) {
    return { error: PERMISSION_DENIED_MESSAGE };
  }
  if (!(await canManageStudent(session.sub, session.role, studentId))) {
    return { error: FORMATION_DENIED_MESSAGE };
  }

  const get = (name: string) => String(formData.get(name) ?? "").trim();
  const getBool = (name: string) => formData.get(name) === "on";

  for (const [field, label] of REQUIRED_FIELDS) {
    if (!get(field)) return { error: `Champ obligatoire manquant : ${label}.` };
  }

  // Secrétaire de formation : ne peut pas déplacer le dossier vers une autre formation
  const userFormation = await getUserFormation(session.sub, session.role);
  if (userFormation && get("formation") !== userFormation) {
    return {
      error: `Vous ne pouvez modifier que des dossiers de votre formation (${userFormation}).`,
    };
  }

  const birthDate = new Date(get("birthDate"));
  if (Number.isNaN(birthDate.getTime())) {
    return { error: "Date de naissance invalide." };
  }
  const cinIssueDateRaw = get("cinIssueDate");
  const cinIssueDate = cinIssueDateRaw ? new Date(cinIssueDateRaw) : null;
  if (cinIssueDate && Number.isNaN(cinIssueDate.getTime())) {
    return { error: "Date de délivrance de la CIN invalide." };
  }

  try {
    await updateStudent(
      studentId,
      {
        lastName: get("lastName"),
        firstName: get("firstName"),
        nationality: get("nationality"),
        gender: get("gender"),
        birthDate,
        birthPlace: get("birthPlace"),
        cin: get("cin") || null,
        cinIssueDate,
        cinIssuePlace: get("cinIssuePlace") || null,
        phone: get("phone"),
        personalEmail: get("personalEmail") || null,
        address: get("address"),
        maritalStatus: get("maritalStatus"),
        baccNumber: get("baccNumber"),
        baccSeries: get("baccSeries"),
        baccMention: get("baccMention"),
        baccYear: get("baccYear"),
        baccCenter: get("baccCenter") || null,
        baccCountry: get("baccCountry") || null,
        previousSchool: get("previousSchool") || null,
        previousUniversity: get("previousUniversity") || null,
        repeatCode: get("repeatCode") || null,
        fatherName: get("fatherName") || null,
        motherName: get("motherName") || null,
        parentsPhone: get("parentsPhone") || null,
        parentsAddress: get("parentsAddress") || null,
        parentsCity: get("parentsCity") || null,
        guardianName: get("guardianName"),
        guardianPhone: get("guardianPhone"),
        guardianAddress: get("guardianAddress") || null,
        domain: get("domain") || null,
        mention: get("formation"),
        track: get("track") || null,
        trainingType: get("trainingType") || null,
        level: get("level"),
        docResidenceCert: getBool("docResidenceCert"),
        docCinCopy: getBool("docCinCopy"),
        docParentCin: getBool("docParentCin"),
        docPhotos: getBool("docPhotos"),
        docPinkFolder: getBool("docPinkFolder"),
        docPaymentSlip: getBool("docPaymentSlip"),
        docEngagementLetter: getBool("docEngagementLetter"),
      },
      session.sub,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la modification." };
  }

  revalidatePath("/etudiants");
  revalidatePath(`/etudiants/${studentId}`);
  redirect(`/etudiants/${studentId}`);
}

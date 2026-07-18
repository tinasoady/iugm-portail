"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { registerStudent } from "@/lib/students";
import { hasTaskPermission, PERMISSION_DENIED_MESSAGE } from "@/lib/permissions";

export type InscriptionState = {
  success?: string;
  matricule?: string;
  fullName?: string;
  error?: string;
};

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
  ["academicYear", "Année universitaire"],
  ["formation", "Choix de formation"],
  ["level", "Niveau"],
];

export async function registerInscriptionAction(
  _prev: InscriptionState,
  formData: FormData,
): Promise<InscriptionState> {
  // Une Server Action reste appelable par POST direct : on revérifie le rôle et la tâche
  const session = await getSession();
  if (!session || !["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) {
    return { error: "Accès refusé." };
  }
  if (!(await hasTaskPermission(session.sub, session.role, "inscription"))) {
    return { error: PERMISSION_DENIED_MESSAGE };
  }

  const get = (name: string) => String(formData.get(name) ?? "").trim();
  const getBool = (name: string) => formData.get(name) === "on";

  for (const [field, label] of REQUIRED_FIELDS) {
    if (!get(field)) return { error: `Champ obligatoire manquant : ${label}.` };
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
    const student = await registerStudent(
      {
        academicYear: get("academicYear"),
        // 1. Étudiant
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
        // 2. Baccalauréat
        baccNumber: get("baccNumber"),
        baccSeries: get("baccSeries"),
        baccMention: get("baccMention"),
        baccYear: get("baccYear"),
        baccCenter: get("baccCenter") || null,
        baccCountry: get("baccCountry") || null,
        previousSchool: get("previousSchool") || null,
        previousUniversity: get("previousUniversity") || null,
        // 3. Parents + urgence
        fatherName: get("fatherName") || null,
        motherName: get("motherName") || null,
        parentsPhone: get("parentsPhone") || null,
        parentsAddress: get("parentsAddress") || null,
        parentsCity: get("parentsCity") || null,
        guardianName: get("guardianName"),
        guardianPhone: get("guardianPhone"),
        guardianAddress: get("guardianAddress") || null,
        // 4. Formation + niveau d'entrée
        mention: get("formation"),
        level: get("level"),
        // 5. Pièces du dossier
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

    revalidatePath("/agent-admin");
    return {
      success: `Inscription enregistrée pour l'année ${student.academicYear} — formation ${student.mention}.`,
      matricule: student.matricule,
      fullName: student.fullName,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." };
  }
}

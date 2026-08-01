"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { registerStudent } from "@/lib/students";
import {
  searchPreselectionCandidates,
  getPreselectionCandidate,
  markPreselectionUsed,
  type PreselectionSearchResult,
} from "@/lib/preselection";
import {
  hasTaskPermission,
  getUserFormation,
  PERMISSION_DENIED_MESSAGE,
} from "@/lib/permissions";

export type InscriptionState = {
  success?: string;
  matricule?: string;
  fullName?: string;
  error?: string;
};

// Recherche appelée directement depuis le champ de recherche du client (pas
// un <form> classique) : mêmes vérifications de session/tâche que les autres
// actions, silencieuse (liste vide) plutôt qu'une erreur bloquante puisqu'elle
// tourne à chaque frappe.
export async function searchPreselectionAction(query: string): Promise<PreselectionSearchResult[]> {
  const session = await getSession();
  if (!session || !["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) return [];
  if (!(await hasTaskPermission(session.sub, session.role, "inscription"))) return [];

  const results = await searchPreselectionCandidates(query);
  // Secrétaire de formation : ne propose que les candidats affectés à sa
  // formation (ou pas encore affectés, laissé au jugement de l'agent — le
  // dernier mot revient de toute façon à registerInscriptionAction).
  const userFormation = await getUserFormation(session.sub, session.role);
  if (!userFormation) return results;
  return results.filter((r) => !r.formation || r.formation === userFormation);
}

export type PreselectionPrefill = { values: Record<string, string>; error?: string };

const dateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

// Récupère la fiche complète d'un candidat choisi dans la recherche, pour
// pré-remplir le formulaire d'inscription (l'agent n'a plus qu'à vérifier).
export async function getPreselectionPrefillAction(id: string): Promise<PreselectionPrefill> {
  const session = await getSession();
  if (!session || !["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) {
    return { values: {}, error: "Accès refusé." };
  }
  if (!(await hasTaskPermission(session.sub, session.role, "inscription"))) {
    return { values: {}, error: PERMISSION_DENIED_MESSAGE };
  }

  const c = await getPreselectionCandidate(id);
  if (!c) return { values: {}, error: "Ce candidat n'existe plus dans la présélection." };

  const values: Record<string, string> = {
    lastName: c.lastName,
    firstName: c.firstName,
    nationality: c.nationality ?? "Malagasy",
    gender: c.gender ?? "",
    birthDate: dateInput(c.birthDate),
    birthPlace: c.birthPlace ?? "",
    cin: c.cin ?? "",
    cinIssueDate: dateInput(c.cinIssueDate),
    cinIssuePlace: c.cinIssuePlace ?? "",
    phone: c.phone ?? "",
    personalEmail: c.personalEmail ?? "",
    address: c.address ?? "",
    baccNumber: c.baccNumber ?? "",
    baccSeries: c.baccSeries ?? "",
    baccMention: c.baccMention ?? "",
    baccYear: c.baccYear ?? "",
    baccCenter: c.baccCenter ?? "",
    baccCountry: c.baccCountry ?? "Madagascar",
    previousSchool: c.previousSchool ?? "",
    fatherName: c.fatherName ?? "",
    motherName: c.motherName ?? "",
    parentsPhone: c.parentsPhone ?? "",
    parentsAddress: c.parentsAddress ?? "",
    parentsCity: c.parentsCity ?? "",
    formation: c.formation ?? "",
    level: c.level ?? "L1",
    academicYear: c.academicYear,
  };
  return { values };
}

// Champs obligatoires (libellés utilisés dans les messages d'erreur)
const REQUIRED_FIELDS: Array<[string, string]> = [
  ["lastName", "Nom"],
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

  // Secrétaire de formation : ne peut inscrire que dans SA formation
  const userFormation = await getUserFormation(session.sub, session.role);
  if (userFormation && get("formation") !== userFormation) {
    return {
      error: `Vous ne pouvez inscrire que dans votre formation (${userFormation}) : l'étudiant doit s'adresser au secrétaire de la formation choisie.`,
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

    // Si l'inscription part d'une fiche de présélection choisie dans la
    // recherche, on la marque comme utilisée — sans bloquer l'inscription
    // déjà enregistrée si cette étape échoue pour une raison quelconque.
    const preselectionId = get("preselectionId");
    if (preselectionId) {
      try {
        await markPreselectionUsed(preselectionId, student.id, session.sub);
      } catch (e) {
        console.error("Impossible de marquer la fiche de présélection comme utilisée :", e);
      }
    }

    revalidatePath("/agent-admin");
    revalidatePath("/admin/base-donnees");
    return {
      success: `Inscription enregistrée pour l'année ${student.academicYear} — formation ${student.mention}.`,
      matricule: student.matricule,
      fullName: student.fullName,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." };
  }
}

import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// Identifiants de connexion (User.email : voir le commentaire du schéma).
//  - personnel : nom d'utilisateur choisi par le superadmin ;
//  - étudiant  : « prenom.nom », généré à l'inscription.
// ---------------------------------------------------------------------------

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;

// Minuscules, chiffres, point, tiret, tiret bas : lisible, sans ambiguïté
// (pas de « @ », d'espaces ni d'accents), simple à dicter par téléphone.
const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

// Forme canonique d'un identifiant saisi : espaces retirés aux extrémités,
// minuscules. La connexion n'est donc jamais sensible à la casse.
export function normalizeLogin(input: string): string {
  return input.trim().toLowerCase();
}

// Renvoie un message d'erreur lisible, ou null si le nom d'utilisateur est valide.
export function validateUsername(input: string): string | null {
  const username = input.trim();
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return `Le nom d'utilisateur doit contenir entre ${USERNAME_MIN} et ${USERNAME_MAX} caractères.`;
  }
  if (username !== username.toLowerCase() || !USERNAME_PATTERN.test(username)) {
    return "Le nom d'utilisateur ne peut contenir que des lettres minuscules sans accent, des chiffres, des points, des tirets et des tirets bas.";
  }
  if (/^[._-]|[._-]$/.test(username)) {
    return "Le nom d'utilisateur ne peut ni commencer ni finir par un point ou un tiret.";
  }
  if (/[._-]{2,}/.test(username)) {
    return "Le nom d'utilisateur ne peut pas enchaîner plusieurs signes de ponctuation.";
  }
  return null;
}

// « Élie » → « elie », « D'Arc » → « darc » : sans accents ni signes
function slug(part: string): string {
  return part
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type StudentNames = {
  firstName?: string | null;
  lastName?: string | null;
  fullName: string;
};

// Base d'identifiant d'un étudiant : « prenom.nom » (premier prénom + nom de
// famille). Le dossier stocke « NOM Prénom » dans fullName ; lastName/firstName,
// quand ils sont renseignés, sont plus fiables que ce découpage.
// Exemples : RAKOTO Jean Paul → « jean.rakoto » ; « DE LA CRUZ Élie » → « elie.delacruz ».
export function studentLoginBase(names: StudentNames): string {
  const tokens = names.fullName.trim().split(/\s+/).filter(Boolean);
  const lastName = names.lastName?.trim() || tokens[0] || "";
  const firstName = names.firstName?.trim() || tokens.slice(1).join(" ");

  const first = slug(firstName.split(/\s+/)[0] ?? "");
  const last = slug(lastName);
  const base = [first, last].filter(Boolean).join(".") || "etudiant";
  // Réserve de la place pour un suffixe numérique (homonymes) sous la limite de 32
  return base.slice(0, USERNAME_MAX - 4).replace(/[.]+$/, "") || "etudiant";
}

// Un identifiant (ou un ancien identifiant conservé en alias) est-il déjà pris ?
export async function isLoginTaken(login: string): Promise<boolean> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: login }, { legacyLogin: login }] },
    select: { id: true },
  });
  return existing !== null;
}

// Premier identifiant libre : jean.rakoto, puis jean.rakoto2, jean.rakoto3...
export async function availableStudentLogin(names: StudentNames): Promise<string> {
  const base = studentLoginBase(names);
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? base : `${base}${i}`;
    if (!(await isLoginTaken(candidate))) return candidate;
  }
}

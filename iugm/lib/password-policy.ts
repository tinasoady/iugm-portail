// Politique de mot de passe choisi par un utilisateur (création de compte par
// le superadmin, changement, réinitialisation par e-mail). Les mots de passe
// temporaires générés par le serveur (generatePassword) n'y passent pas : ils
// sont aléatoires et changés de force à la première connexion.

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignore tout au-delà de 72 octets : deux mots de passe qui ne
// diffèrent qu'après cette limite seraient acceptés comme identiques.
export const PASSWORD_MAX_BYTES = 72;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "motdepasse",
  "motdepasse1",
  "12345678",
  "123456789",
  "1234567890",
  "azerty123",
  "azertyuiop",
  "qwerty123",
  "iloveyou",
  "admin123",
  "iugm2026",
  "iugm1234",
  "mahajanga",
]);

export type PasswordContext = {
  email?: string | null;
  matricule?: string | null;
};

// Renvoie un message d'erreur lisible, ou null si le mot de passe est acceptable.
export function validatePasswordStrength(
  password: string,
  context: PasswordContext = {},
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    return `Le mot de passe est trop long (${PASSWORD_MAX_BYTES} octets maximum).`;
  }
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    return "Le mot de passe doit contenir au moins une lettre et un chiffre.";
  }
  if (/^(.)\1+$/.test(password)) {
    return "Le mot de passe ne doit pas répéter le même caractère.";
  }

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return "Ce mot de passe est trop courant : choisissez-en un moins prévisible.";
  }

  const localPart = context.email?.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    return "Le mot de passe ne doit pas contenir votre identifiant.";
  }
  if (context.matricule && lower === context.matricule.toLowerCase()) {
    return "Le mot de passe ne doit pas être votre numéro matricule.";
  }

  return null;
}

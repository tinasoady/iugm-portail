import { describe, expect, it } from "vitest";

import { validatePasswordStrength } from "@/lib/password-policy";

describe("validatePasswordStrength", () => {
  it("accepte un mot de passe correct", () => {
    expect(validatePasswordStrength("Soleil2026!")).toBeNull();
    expect(validatePasswordStrength("phrase de passe 42")).toBeNull();
  });

  it("refuse moins de 8 caractères", () => {
    expect(validatePasswordStrength("Ab1")).toMatch(/au moins 8/);
    expect(validatePasswordStrength("Abcde12")).toMatch(/au moins 8/);
    expect(validatePasswordStrength("Abcdef12")).toBeNull();
  });

  it("refuse plus de 72 octets (limite bcrypt), en comptant les caractères multi-octets", () => {
    expect(validatePasswordStrength("a1".repeat(36))).toBeNull(); // 72 octets
    expect(validatePasswordStrength("a1".repeat(37))).toMatch(/trop long/);
    // 40 × "é" = 80 octets pour seulement 40 caractères
    expect(validatePasswordStrength("é".repeat(40) + "1")).toMatch(/trop long/);
  });

  it("exige une lettre et un chiffre", () => {
    expect(validatePasswordStrength("abcdefghij")).toMatch(/lettre et un chiffre/);
    expect(validatePasswordStrength("1234567890")).toMatch(/lettre et un chiffre/);
  });

  it("refuse un caractère unique répété", () => {
    expect(validatePasswordStrength("11111111")).not.toBeNull();
    expect(validatePasswordStrength("aaaaaaaa1")).toBeNull(); // pas "uniquement" le même caractère
  });

  it("refuse les mots de passe courants, sans tenir compte de la casse", () => {
    expect(validatePasswordStrength("Password123")).toMatch(/trop courant/);
    expect(validatePasswordStrength("IUGM2026")).toMatch(/trop courant/);
  });

  it("refuse un mot de passe contenant l'identifiant", () => {
    expect(validatePasswordStrength("jean.rakoto2026", { email: "jean.rakoto@iugm.mg" })).toMatch(
      /identifiant/,
    );
    // Partie locale trop courte : pas de faux positif
    expect(validatePasswordStrength("abcd1234xyz", { email: "ab@iugm.mg" })).toBeNull();
  });

  it("refuse le matricule seul, sans tenir compte de la casse", () => {
    expect(validatePasswordStrength("fi2026-1", { matricule: "FI2026-1" })).toMatch(/matricule/);
    expect(validatePasswordStrength("FI2026-1-xyz", { matricule: "FI2026-1" })).toBeNull();
  });
});

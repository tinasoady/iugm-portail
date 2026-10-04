import { describe, expect, it } from "vitest";

import { normalizeLogin, studentLoginBase, validateUsername } from "@/lib/identifiers";

describe("normalizeLogin", () => {
  it("retire les espaces extérieurs et met en minuscules", () => {
    expect(normalizeLogin("  Jean.Rakoto ")).toBe("jean.rakoto");
  });
});

describe("validateUsername", () => {
  it.each(["admin", "marie.agent", "jean-paul_2", "a.b", "abc", "x".repeat(32)])("accepte %s", (u) => {
    expect(validateUsername(u)).toBeNull();
  });

  it.each([
    ["ab", /entre 3 et 32/],
    ["x".repeat(33), /entre 3 et 32/],
    ["Marie", /minuscules/],
    ["marie agent", /minuscules/],
    ["élodie", /minuscules/],
    ["a@b.mg", /minuscules/],
    [".marie", /ni commencer ni finir/],
    ["marie-", /ni commencer ni finir/],
    ["ma..rie", /plusieurs signes/],
    ["ma._rie", /plusieurs signes/],
  ])("refuse %s", (u, message) => {
    expect(validateUsername(u)).toMatch(message);
  });
});

describe("studentLoginBase", () => {
  it("compose prenom.nom depuis les champs du dossier", () => {
    expect(studentLoginBase({ fullName: "RAKOTO Jean", lastName: "RAKOTO", firstName: "Jean" })).toBe("jean.rakoto");
  });

  it("ne garde que le premier prénom", () => {
    expect(studentLoginBase({ fullName: "RAKOTO Jean Paul", lastName: "RAKOTO", firstName: "Jean Paul" })).toBe(
      "jean.rakoto",
    );
  });

  it("découpe fullName « NOM Prénom » quand lastName/firstName manquent", () => {
    expect(studentLoginBase({ fullName: "RAKOTO Jean Paul" })).toBe("jean.rakoto");
  });

  it("retire accents, apostrophes et espaces", () => {
    expect(studentLoginBase({ fullName: "DE LA CRUZ Élie", lastName: "DE LA CRUZ", firstName: "Élie" })).toBe(
      "elie.delacruz",
    );
    expect(studentLoginBase({ fullName: "N'DIAYE Aïcha", lastName: "N'DIAYE", firstName: "Aïcha" })).toBe(
      "aicha.ndiaye",
    );
  });

  it("n'a qu'un nom : l'utilise seul", () => {
    expect(studentLoginBase({ fullName: "RAKOTO" })).toBe("rakoto");
  });

  it("retombe sur « etudiant » sans lettre exploitable", () => {
    expect(studentLoginBase({ fullName: "  " })).toBe("etudiant");
    expect(studentLoginBase({ fullName: "!!! ???" })).toBe("etudiant");
  });

  it("reste valide et sous la limite, avec de la place pour un suffixe", () => {
    const base = studentLoginBase({
      fullName: "ANDRIANARIVELOSOAMANANTSOA Mahefasoaniaina",
      lastName: "ANDRIANARIVELOSOAMANANTSOA",
      firstName: "Mahefasoaniaina",
    });
    expect(base.length).toBeLessThanOrEqual(28);
    expect(validateUsername(base + "99")).toBeNull();
  });
});

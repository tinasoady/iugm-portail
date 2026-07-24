import { describe, expect, it } from "vitest";

import { groupStudents, resolveGroup } from "@/app/etudiants/group-students";
import type { StudentWithAccountAndResults } from "@/lib/students";

// Seuls les champs lus par groupStudents() sont renseignés : le reste du
// dossier (état civil, pièces...) est hors-sujet pour cette logique de
// classement pure, d'où le cast plutôt qu'un objet Student complet.
function fakeStudent(
  overrides: Partial<StudentWithAccountAndResults>,
): StudentWithAccountAndResults {
  return {
    mention: null,
    program: null,
    level: null,
    track: null,
    domain: null,
    department: null,
    academicYear: null,
    results: [],
    ...overrides,
  } as StudentWithAccountAndResults;
}

describe("resolveGroup", () => {
  it("retombe sur 'annee' si aucun critère ou un critère inconnu", () => {
    expect(resolveGroup(undefined)).toBe("annee");
    expect(resolveGroup("n_importe_quoi")).toBe("annee");
  });

  it("accepte un critère valide du catalogue", () => {
    expect(resolveGroup("filiere")).toBe("filiere");
    expect(resolveGroup("niveau")).toBe("niveau");
  });
});

describe("groupStudents", () => {
  it("classe par filière (mention, avec repli sur program)", () => {
    const a = fakeStudent({ mention: "Management" });
    const b = fakeStudent({ mention: null, program: "Informatique" });
    const groups = groupStudents([a, b], "filiere");
    expect(groups.map(([key]) => key).sort()).toEqual(["Informatique", "Management"]);
  });

  it("les dossiers sans valeur du critère forment un bloc 'Non renseigné(e)' toujours en dernier", () => {
    const withYear = fakeStudent({ academicYear: "2026-2027" });
    const withoutYear = fakeStudent({ academicYear: null });
    const groups = groupStudents([withoutYear, withYear], "annee");
    expect(groups.map(([key]) => key)).toEqual(["2026-2027", "Non renseigné(e)"]);
  });

  it("le tri par année est décroissant (plus récente en premier), les autres croissants", () => {
    const y1 = fakeStudent({ academicYear: "2024-2025" });
    const y2 = fakeStudent({ academicYear: "2026-2027" });
    const y3 = fakeStudent({ academicYear: "2025-2026" });
    const groups = groupStudents([y1, y2, y3], "annee");
    expect(groups.map(([key]) => key)).toEqual(["2026-2027", "2025-2026", "2024-2025"]);
  });

  it("regroupe correctement plusieurs dossiers dans le même bloc", () => {
    const a = fakeStudent({ level: "L1" });
    const b = fakeStudent({ level: "L1" });
    const c = fakeStudent({ level: "L2" });
    const groups = groupStudents([a, b, c], "niveau");
    const l1 = groups.find(([key]) => key === "L1");
    expect(l1?.[1]).toHaveLength(2);
  });
});

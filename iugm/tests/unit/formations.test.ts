import { describe, expect, it } from "vitest";

import { FORMATIONS, FORMATIONS_LICENCE, FORMATIONS_MASTER, formationsForLevel } from "@/lib/formations";

describe("FORMATIONS", () => {
  it("ne contient aucun libellé en double (le libellé sert de clé React et de valeur de filtre)", () => {
    const labels = FORMATIONS.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("contient toutes les filières de licence et de master", () => {
    const labels = new Set(FORMATIONS.map((f) => f.label));
    for (const f of [...FORMATIONS_LICENCE, ...FORMATIONS_MASTER]) expect(labels.has(f.label)).toBe(true);
  });

  it("les listes par niveau restent inchangées", () => {
    expect(formationsForLevel("L1")).toBe(FORMATIONS_LICENCE);
    expect(formationsForLevel("M2")).toBe(FORMATIONS_MASTER);
    expect(formationsForLevel(null)).toBe(FORMATIONS);
  });
});

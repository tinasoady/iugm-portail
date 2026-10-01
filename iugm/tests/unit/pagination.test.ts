import { describe, expect, it } from "vitest";

import { hasMore, moreHref, parseListLimit } from "@/lib/pagination";

describe("parseListLimit", () => {
  it("renvoie une page par défaut", () => {
    expect(parseListLimit(undefined)).toBe(20);
    expect(parseListLimit("")).toBe(20);
    expect(parseListLimit("abc")).toBe(20);
    expect(parseListLimit("-40")).toBe(20);
    expect(parseListLimit("0")).toBe(20);
    expect(parseListLimit("NaN")).toBe(20);
    expect(parseListLimit("Infinity")).toBe(20);
  });

  it("arrondit au multiple de 20 supérieur", () => {
    expect(parseListLimit("20")).toBe(20);
    expect(parseListLimit("21")).toBe(40);
    expect(parseListLimit("65")).toBe(80);
  });

  it("plafonne à 1000", () => {
    expect(parseListLimit("100000")).toBe(1000);
    expect(parseListLimit("1000")).toBe(1000);
  });

  it("prend la première valeur d'un paramètre répété", () => {
    expect(parseListLimit(["60", "20"])).toBe(60);
  });

  it("accepte un autre pas", () => {
    expect(parseListLimit("7", 10, 100)).toBe(10);
    expect(parseListLimit("95", 10, 100)).toBe(100);
  });
});

describe("moreHref", () => {
  it("conserve les autres paramètres et incrémente la limite", () => {
    expect(moreHref("/admin", { role: "ETUDIANT", months: "6" }, "limit", 20)).toBe(
      "/admin?role=ETUDIANT&months=6&limit=40",
    );
  });

  it("ignore les paramètres vides et remplace l'ancienne limite", () => {
    expect(moreHref("/x", { q: "", limit: "20", f: "a b" }, "limit", 40)).toBe("/x?f=a+b&limit=60");
  });
});

describe("hasMore", () => {
  it("vrai tant qu'il reste des lignes et que le plafond n'est pas atteint", () => {
    expect(hasMore(20, 45, 20)).toBe(true);
    expect(hasMore(45, 45, 60)).toBe(false);
    expect(hasMore(1000, 5000, 1000)).toBe(false);
  });
});

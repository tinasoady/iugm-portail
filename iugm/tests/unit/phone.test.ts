import { describe, expect, it } from "vitest";

import { isValidMalagasyPhone, normalizePhone } from "@/lib/phone";

describe("isValidMalagasyPhone", () => {
  it.each(["0321234567", "0331234567", "0341234567", "0371234567", "0381234567"])(
    "accepte un numéro valide de 10 chiffres (%s)",
    (phone) => {
      expect(isValidMalagasyPhone(phone)).toBe(true);
    },
  );

  it("accepte un numéro saisi avec des espaces", () => {
    expect(isValidMalagasyPhone("032 12 345 67")).toBe(true);
  });

  it("refuse un préfixe inconnu", () => {
    expect(isValidMalagasyPhone("0391234567")).toBe(false);
  });

  it("refuse un numéro trop court ou trop long", () => {
    expect(isValidMalagasyPhone("032123456")).toBe(false);
    expect(isValidMalagasyPhone("03212345678")).toBe(false);
  });

  it("refuse un numéro sans le 0 initial", () => {
    expect(isValidMalagasyPhone("321234567")).toBe(false);
  });

  it("refuse un texte non numérique", () => {
    expect(isValidMalagasyPhone("abcdefghij")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("retire espaces, points et tirets", () => {
    expect(normalizePhone("032 12-345.67")).toBe("0321234567");
  });
});

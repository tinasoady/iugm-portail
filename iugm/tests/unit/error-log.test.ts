import { describe, expect, it } from "vitest";

import { buildErrorLogEntry } from "@/lib/error-log";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const CTX = { method: "POST", path: "/reinitialiser-mot-de-passe?token=SECRET123", routeType: "action" };

describe("buildErrorLogEntry", () => {
  it("produit une entrée JSON sérialisable avec les champs utiles", () => {
    const entry = buildErrorLogEntry(new Error("Boum"), CTX, NOW);
    expect(entry).toMatchObject({
      level: "error",
      event: "request_error",
      timestamp: "2026-10-01T10:00:00.000Z",
      message: "Boum",
      method: "POST",
      routeType: "action",
    });
    expect(() => JSON.stringify(entry)).not.toThrow();
  });

  it("retire les paramètres d'URL du chemin (jeton, recherche nominative)", () => {
    const entry = buildErrorLogEntry(new Error("x"), CTX, NOW);
    expect(entry.path).toBe("/reinitialiser-mot-de-passe");
    expect(JSON.stringify(entry)).not.toContain("SECRET123");
    expect(buildErrorLogEntry(new Error("x"), { method: "GET", path: "/a#frag" }, NOW).path).toBe("/a");
  });

  it("reprend le digest de Next.js", () => {
    const err = Object.assign(new Error("rendu"), { digest: "abc123" });
    expect(buildErrorLogEntry(err, CTX, NOW).digest).toBe("abc123");
  });

  it("accepte une valeur levée qui n'est pas une Error", () => {
    expect(buildErrorLogEntry("texte brut", CTX, NOW).message).toBe("texte brut");
    expect(buildErrorLogEntry(undefined, CTX, NOW).message).toBe("undefined");
    expect(buildErrorLogEntry({ digest: 42 }, CTX, NOW).digest).toBe("42");
  });

  it("borne la taille du message et de la pile", () => {
    const err = new Error("m".repeat(5000));
    const entry = buildErrorLogEntry(err, CTX, NOW);
    expect(entry.message.length).toBe(500);
    expect(entry.stack!.split("\n").length).toBeLessThanOrEqual(8);
  });
});

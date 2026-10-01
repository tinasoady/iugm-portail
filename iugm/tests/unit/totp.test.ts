import { describe, expect, it } from "vitest";

import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  findTotpOffsetSeconds,
  generateTotpSecret,
  hotp,
  totpAt,
  verifyTotp,
} from "@/lib/totp";
import { explainRejectedSetupCode } from "@/lib/two-factor";

// Secret de test des RFC 4226 / 6238 : l'ASCII "12345678901234567890"
const RFC_SECRET_ASCII = Buffer.from("12345678901234567890");
const RFC_SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("base32", () => {
  it("encode le secret de la RFC comme attendu", () => {
    expect(base32Encode(RFC_SECRET_ASCII)).toBe(RFC_SECRET_B32);
  });

  it("décode en sens inverse, sans tenir compte de la casse, des espaces ni du padding", () => {
    expect(base32Decode(RFC_SECRET_B32.toLowerCase())?.toString()).toBe("12345678901234567890");
    expect(base32Decode("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ====")?.toString()).toBe(
      "12345678901234567890",
    );
  });

  it("refuse un caractère hors alphabet", () => {
    expect(base32Decode("GEZD!NBV")).toBeNull();
    expect(base32Decode("0189")).toBeNull();
  });

  it("aller-retour sur des octets aléatoires de longueurs variées", () => {
    for (let len = 1; len <= 33; len++) {
      const bytes = Buffer.from(Array.from({ length: len }, (_, i) => (i * 37 + len * 11) % 256));
      expect(base32Decode(base32Encode(bytes))?.equals(bytes)).toBe(true);
    }
  });
});

describe("HOTP (RFC 4226, annexe D)", () => {
  const expected = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489",
  ];
  it.each(expected.map((code, counter) => [counter, code] as const))(
    "compteur %i → %s",
    (counter, code) => {
      expect(hotp(RFC_SECRET_ASCII, counter)).toBe(code);
    },
  );
});

describe("TOTP (RFC 6238, annexe B, SHA-1, 6 derniers chiffres)", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ] as const)("à t=%i s → %s", (seconds, code) => {
    expect(totpAt(RFC_SECRET_B32, seconds * 1000)).toBe(code);
  });
});

describe("verifyTotp", () => {
  const NOW = 1234567890 * 1000; // pas 41152263
  const STEP = 1234567890 / 30;

  it("accepte le code courant et renvoie son pas", () => {
    expect(verifyTotp(RFC_SECRET_B32, "005924", { nowMs: NOW })).toBe(Math.floor(STEP));
  });

  it("tolère une dérive d'un pas de chaque côté, pas de deux", () => {
    const previous = totpAt(RFC_SECRET_B32, NOW - 30_000);
    const next = totpAt(RFC_SECRET_B32, NOW + 30_000);
    const tooOld = totpAt(RFC_SECRET_B32, NOW - 60_000);
    expect(verifyTotp(RFC_SECRET_B32, previous, { nowMs: NOW })).not.toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, next, { nowMs: NOW })).not.toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, tooOld, { nowMs: NOW })).toBeNull();
  });

  it("refuse un code déjà utilisé (rejeu) mais accepte le pas suivant", () => {
    const step = Math.floor(STEP);
    expect(verifyTotp(RFC_SECRET_B32, "005924", { nowMs: NOW, lastStep: step })).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, "005924", { nowMs: NOW, lastStep: step - 1 })).toBe(step);
    const next = totpAt(RFC_SECRET_B32, NOW + 30_000);
    expect(verifyTotp(RFC_SECRET_B32, next, { nowMs: NOW, lastStep: step })).toBe(step + 1);
  });

  it("refuse les formats invalides sans lever d'exception", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "00592 4", "005924 "]) {
      expect(verifyTotp(RFC_SECRET_B32, bad, { nowMs: NOW })).toBeNull();
    }
    expect(verifyTotp("not base32 !", "005924", { nowMs: NOW })).toBeNull();
    expect(verifyTotp("", "005924", { nowMs: NOW })).toBeNull();
  });

  it("refuse un mauvais code", () => {
    expect(verifyTotp(RFC_SECRET_B32, "000000", { nowMs: NOW })).toBeNull();
  });
});

describe("generateTotpSecret / buildOtpAuthUri", () => {
  it("génère 160 bits en base32 (32 caractères), différents à chaque appel", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(a).not.toBe(b);
    expect(base32Decode(a)).toHaveLength(20);
  });

  it("construit une URI otpauth conforme, avec échappement du libellé", () => {
    const uri = buildOtpAuthUri({
      issuer: "Portail IUGM",
      account: "agent+1@iugm.test",
      secret: RFC_SECRET_B32,
    });
    expect(uri.startsWith("otpauth://totp/Portail%20IUGM:agent%2B1%40iugm.test?")).toBe(true);
    const params = new URL(uri).searchParams;
    expect(params.get("secret")).toBe(RFC_SECRET_B32);
    expect(params.get("issuer")).toBe("Portail IUGM");
    expect(params.get("digits")).toBe("6");
    expect(params.get("period")).toBe("30");
    expect(params.get("algorithm")).toBe("SHA1");
  });
});

describe("findTotpOffsetSeconds (diagnostic de configuration)", () => {
  const NOW = 1234567890 * 1000;

  it("retrouve le décalage d'un téléphone en retard ou en avance", () => {
    const late = totpAt(RFC_SECRET_B32, NOW - 5 * 60_000); // 10 pas de retard
    const early = totpAt(RFC_SECRET_B32, NOW + 90_000); // 3 pas d'avance
    expect(findTotpOffsetSeconds(RFC_SECRET_B32, late, { nowMs: NOW })).toBe(-300);
    expect(findTotpOffsetSeconds(RFC_SECRET_B32, early, { nowMs: NOW })).toBe(90);
  });

  it("ne confond pas le pas courant avec un décalage, et ignore un code d'un autre secret", () => {
    const now = totpAt(RFC_SECRET_B32, NOW);
    // le pas courant n'est pas un « décalage » (déjà couvert par verifyTotp)
    expect([null, ...[-30, 30]]).toContain(findTotpOffsetSeconds(RFC_SECRET_B32, now, { nowMs: NOW }));
    const other = totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJR", NOW - 120_000);
    expect(findTotpOffsetSeconds(RFC_SECRET_B32, other, { nowMs: NOW })).toBeNull();
  });

  it("refuse les formats invalides et les décalages au-delà de la limite", () => {
    expect(findTotpOffsetSeconds(RFC_SECRET_B32, "abc", { nowMs: NOW })).toBeNull();
    expect(findTotpOffsetSeconds("???", "123456", { nowMs: NOW })).toBeNull();
    const farAway = totpAt(RFC_SECRET_B32, NOW - 3 * 3600_000);
    expect(findTotpOffsetSeconds(RFC_SECRET_B32, farAway, { nowMs: NOW, maxSteps: 20 })).toBeNull();
  });
});

describe("explainRejectedSetupCode", () => {
  it("signale une horloge décalée quand le code est exact mais d'un autre moment", () => {
    const code = totpAt(RFC_SECRET_B32, Date.now() - 4 * 60_000);
    const message = explainRejectedSetupCode(RFC_SECRET_B32, code);
    expect(message).toMatch(/retarde/);
    expect(message).toMatch(/minute/);
  });

  it("oriente vers l'entrée de l'application quand le code ne correspond à rien de proche", () => {
    const message = explainRejectedSetupCode(RFC_SECRET_B32, "000000");
    expect(message).toMatch(/CE QR code/);
  });
});

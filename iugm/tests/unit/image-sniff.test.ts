import { describe, expect, it } from "vitest";

import { detectImageType, isSafeSvg, resolveImageType } from "@/lib/image-sniff";

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => new TextEncoder().encode(value);

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50);

describe("detectImageType", () => {
  it("reconnaît PNG, JPEG et WebP par leur signature", () => {
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(WEBP)).toBe("image/webp");
  });

  it("refuse un fichier qui n'est pas une image, quelle que soit son nom ou son type déclaré", () => {
    expect(detectImageType(text("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(detectImageType(text("MZ\u0090\u0000 exécutable"))).toBeNull();
    expect(detectImageType(text("%PDF-1.7"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });

  it("refuse un fichier tronqué ou une signature incomplète", () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4e))).toBeNull();
    expect(detectImageType(bytes(0xff, 0xd8))).toBeNull();
    // RIFF sans WEBP (ex. un fichier WAV ou AVI)
    expect(detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBeNull();
  });
});

describe("isSafeSvg", () => {
  const SAFE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

  it("accepte un SVG graphique simple, avec ou sans prologue XML", () => {
    expect(isSafeSvg(text(SAFE))).toBe(true);
    expect(isSafeSvg(text(`<?xml version="1.0"?>\n${SAFE}`))).toBe(true);
  });

  it("refuse un SVG contenant du code actif", () => {
    const attacks = [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="//evil"/></foreignObject></svg>',
      '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="http://evil/x.png"/></svg>',
    ];
    for (const attack of attacks) expect(isSafeSvg(text(attack))).toBe(false);
  });

  it("refuse ce qui n'est pas un SVG", () => {
    expect(isSafeSvg(text("<html></html>"))).toBe(false);
    expect(isSafeSvg(text("juste du texte"))).toBe(false);
  });
});

describe("resolveImageType", () => {
  it("SVG accepté seulement quand l'appelant l'autorise (logo)", () => {
    const svg = text('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(resolveImageType(svg)).toBeNull();
    expect(resolveImageType(svg, { allowSvg: true })).toBe("image/svg+xml");
  });

  it("les formats binaires passent dans les deux cas", () => {
    expect(resolveImageType(PNG)).toBe("image/png");
    expect(resolveImageType(JPEG, { allowSvg: true })).toBe("image/jpeg");
  });
});

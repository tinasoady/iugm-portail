import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { resolveSession, createSessionToken, verifySessionToken, type SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createActor } from "../setup/factories";
import { disconnectDb, resetDb } from "../setup/db";

beforeEach(resetDb);
afterAll(disconnectDb);

function payloadFor(user: { id: string; email: string; role: string }, iat?: number): SessionPayload {
  const verified = verifySessionToken(
    createSessionToken({ sub: user.id, email: user.email, role: user.role }),
  );
  if (!verified) throw new Error("jeton de test invalide");
  return iat === undefined ? verified : { ...verified, iat };
}

describe("resolveSession : la session suit l'état réel du compte", () => {
  it("accepte un compte actif", async () => {
    const user = await createActor("AGENT_ADMINISTRATION");
    const session = await resolveSession(payloadFor(user));
    expect(session).toMatchObject({ sub: user.id, email: user.email, role: "AGENT_ADMINISTRATION" });
  });

  it("refuse un compte désactivé après l'ouverture de la session", async () => {
    const user = await createActor("AGENT_ADMINISTRATION");
    const payload = payloadFor(user);
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect(await resolveSession(payload)).toBeNull();

    await prisma.user.update({ where: { id: user.id }, data: { active: true } });
    expect(await resolveSession(payload)).not.toBeNull();
  });

  it("refuse un compte supprimé", async () => {
    const user = await createActor("AGENT_ADMINISTRATION");
    const payload = payloadFor(user);
    await prisma.user.delete({ where: { id: user.id } });
    expect(await resolveSession(payload)).toBeNull();
  });

  it("prend le rôle dans la base, pas dans le jeton", async () => {
    const user = await createActor("SUPERADMIN");
    const payload = payloadFor(user);
    await prisma.user.update({ where: { id: user.id }, data: { role: "ETUDIANT" } });
    const session = await resolveSession(payload);
    expect(session?.role).toBe("ETUDIANT");
  });

  it("prend l'email dans la base si l'identifiant a été modifié", async () => {
    const user = await createActor("SUPERADMIN");
    const payload = payloadFor(user);
    await prisma.user.update({ where: { id: user.id }, data: { email: "nouveau@test.local" } });
    expect((await resolveSession(payload))?.email).toBe("nouveau@test.local");
  });

  describe("sessionsValidAfter (changement de mot de passe, 2FA réinitialisée)", () => {
    it("refuse les sessions émises avant, accepte celles émises à partir de cette seconde", async () => {
      const user = await createActor("AGENT_ADMINISTRATION");
      const now = Math.floor(Date.now() / 1000);
      await prisma.user.update({
        where: { id: user.id },
        data: { sessionsValidAfter: new Date(now * 1000 + 500) },
      });

      expect(await resolveSession(payloadFor(user, now - 1))).toBeNull();
      expect(await resolveSession(payloadFor(user, now))).not.toBeNull();
      expect(await resolveSession(payloadFor(user, now + 60))).not.toBeNull();
    });
  });

  describe("changement de mot de passe obligatoire", () => {
    it("refuse la session par défaut", async () => {
      const user = await prisma.user.create({
        data: {
          email: "etudiant@test.local",
          passwordHash: "not-a-real-hash",
          role: "ETUDIANT",
          mustChangePassword: true,
        },
      });
      expect(await resolveSession(payloadFor(user))).toBeNull();
    });

    it("l'accepte pour la page de changement de mot de passe", async () => {
      const user = await createActor("AGENT_PEDAGOGIQUE");
      await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
      const session = await resolveSession(payloadFor(user), { allowPasswordChange: true });
      expect(session?.sub).toBe(user.id);
    });
  });
});

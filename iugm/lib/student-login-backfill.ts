import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import { availableStudentLogin } from "./identifiers";

// ---------------------------------------------------------------------------
// Rattrapage des comptes étudiants créés AVANT le passage aux identifiants
// « prenom.nom » : leur identifiant était « <matricule>@student.iugm.edu » (ou
// « nom@student.iugm.edu »). Chaque compte reçoit son identifiant « prenom.nom »
// et GARDE l'ancien en alias (User.legacyLogin) : les reçus déjà imprimés
// restent valables, personne n'est bloqué.
//
// Idempotent : un compte déjà migré (legacyLogin renseigné) ou dont
// l'identifiant n'est plus une adresse est ignoré. Sans effet sur le personnel.
// ---------------------------------------------------------------------------

export type BackfillSummary = { scanned: number; migrated: number; failed: number };

export async function backfillStudentLogins(options: { dryRun?: boolean } = {}): Promise<BackfillSummary> {
  const accounts = await prisma.user.findMany({
    where: { role: "ETUDIANT", legacyLogin: null, email: { contains: "@" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], // déterministe : le plus ancien obtient l'identifiant « simple »
    select: {
      id: true,
      email: true,
      fullName: true,
      studentFile: { select: { fullName: true, firstName: true, lastName: true } },
    },
  });

  const summary: BackfillSummary = { scanned: accounts.length, migrated: 0, failed: 0 };

  for (const account of accounts) {
    const names = account.studentFile ?? { fullName: account.fullName ?? account.email.split("@")[0] };
    let done = false;
    // Deux tentatives : un homonyme migré en parallèle peut prendre l'identifiant calculé
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      const login = await availableStudentLogin(names);
      if (options.dryRun) {
        summary.migrated++;
        done = true;
        break;
      }
      try {
        await prisma.user.update({
          where: { id: account.id },
          data: { legacyLogin: account.email, email: login },
        });
        summary.migrated++;
        done = true;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      }
    }
    if (!done) summary.failed++;
  }
  return summary;
}

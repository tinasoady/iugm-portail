import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { registerStudent } from "@/lib/students";
import {
  importPreselectionFile,
  searchPreselectionCandidates,
  markPreselectionUsed,
} from "@/lib/preselection";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, validRegisterInput } from "../setup/factories";

// Import -> recherche -> pré-remplissage -> inscription -> marquage
// "utilisée" : le parcours complet de la fonctionnalité présélection, mis en
// place à la demande de l'encadrant de stage pour réutiliser les résultats
// de présélection de l'Université de Mahajanga à l'inscription.

async function buildWorkbook(headers: string[], rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Présélection");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

beforeEach(resetDb);
afterAll(disconnectDb);

describe("importPreselectionFile", () => {
  it("crée une fiche par ligne exploitable et journalise l'import", async () => {
    const actor = await createActor("SUPERADMIN");
    const buffer = await buildWorkbook(
      ["Nom", "Prénom", "Sexe", "Filière affectée"],
      [
        ["RAKOTO", "Jean", "M", "Management"],
        ["RABE", "Marie", "F", "Finance-Comptabilité"],
      ],
    );

    const result = await importPreselectionFile(buffer, "2026-2027", actor.id);
    expect(result.created).toBe(2);
    expect(result.errors).toEqual([]);

    const rows = await prisma.preselectionCandidate.findMany({ where: { academicYear: "2026-2027" } });
    expect(rows).toHaveLength(2);
  });

  it("refuse une année universitaire mal formée", async () => {
    const actor = await createActor("SUPERADMIN");
    const buffer = await buildWorkbook(["Nom", "Prénom"], [["RAKOTO", "Jean"]]);

    await expect(importPreselectionFile(buffer, "2026", actor.id)).rejects.toThrow(
      /Année universitaire invalide/,
    );
  });

  it("un ré-import remplace les fiches non utilisées mais conserve celles déjà liées à un dossier", async () => {
    const actor = await createActor("SUPERADMIN");
    const firstBatch = await buildWorkbook(
      ["Nom", "Prénom", "Filière affectée"],
      [
        ["RAKOTO", "Jean", "Management"],
        ["RABE", "Marie", "Management"],
      ],
    );
    await importPreselectionFile(firstBatch, "2026-2027", actor.id);

    // RAKOTO Jean est utilisé pour inscrire un étudiant avant le ré-import
    const used = await prisma.preselectionCandidate.findFirstOrThrow({
      where: { academicYear: "2026-2027", fullName: "RAKOTO Jean" },
    });
    const student = await registerStudent(validRegisterInput({ lastName: "RAKOTO", firstName: "Jean" }), actor.id);
    await markPreselectionUsed(used.id, student.id, actor.id);

    const secondBatch = await buildWorkbook(
      ["Nom", "Prénom", "Filière affectée"],
      [["RASOA", "Paul", "Management"]],
    );
    const result = await importPreselectionFile(secondBatch, "2026-2027", actor.id);
    expect(result.created).toBe(1);

    const remaining = await prisma.preselectionCandidate.findMany({
      where: { academicYear: "2026-2027" },
      orderBy: { fullName: "asc" },
    });
    // RABE Marie (non utilisée) a disparu, RAKOTO Jean (utilisée) et RASOA Paul (nouvelle) restent
    expect(remaining.map((r) => r.fullName).sort()).toEqual(["RAKOTO Jean", "RASOA Paul"]);
    expect(remaining.find((r) => r.fullName === "RAKOTO Jean")?.usedByStudentId).toBe(student.id);
  });

  it("un import 'dossiers existants' n'efface pas la présélection de la même année, et inversement", async () => {
    const actor = await createActor("SUPERADMIN");
    const preselection = await buildWorkbook(["Nom", "Prénom"], [["RAKOTO", "Jean"]]);
    await importPreselectionFile(preselection, "2026-2027", actor.id, "PRESELECTION");

    const existing = await buildWorkbook(
      ["Nom", "Prénom", "Niveau"],
      [["RABE", "Marie", "L3"]],
    );
    await importPreselectionFile(existing, "2026-2027", actor.id, "EXISTING");

    const rows = await prisma.preselectionCandidate.findMany({
      where: { academicYear: "2026-2027" },
      orderBy: { fullName: "asc" },
    });
    expect(rows.map((r) => [r.fullName, r.category])).toEqual([
      ["RABE Marie", "EXISTING"],
      ["RAKOTO Jean", "PRESELECTION"],
    ]);

    // Un ré-import de la présélection ne touche que son propre lot
    const preselectionV2 = await buildWorkbook(["Nom", "Prénom"], [["RASOA", "Paul"]]);
    await importPreselectionFile(preselectionV2, "2026-2027", actor.id, "PRESELECTION");

    const rowsAfter = await prisma.preselectionCandidate.findMany({
      where: { academicYear: "2026-2027" },
      orderBy: { fullName: "asc" },
    });
    expect(rowsAfter.map((r) => [r.fullName, r.category])).toEqual([
      ["RABE Marie", "EXISTING"],
      ["RASOA Paul", "PRESELECTION"],
    ]);
  });
});

describe("importPreselectionFile — dossiers existants (catégorie EXISTING)", () => {
  it("crée directement un dossier « Enregistré » pour chaque fiche, sans passer par l'inscription", async () => {
    const actor = await createActor("SUPERADMIN");
    const buffer = await buildWorkbook(
      ["Nom", "Prénom", "Niveau", "Filière affectée"],
      [["RABE", "Marie", "L3", "Management"]],
    );

    const result = await importPreselectionFile(buffer, "2026-2027", actor.id, "EXISTING");
    expect(result.studentsCreated).toBe(1);
    expect(result.studentsMatched).toBe(0);

    const student = await prisma.student.findFirstOrThrow({ where: { fullName: "RABE Marie" } });
    expect(student.status).toBe("ENREGISTRE");
    expect(student.level).toBe("L3");
    expect(student.mention).toBe("Management");

    const candidate = await prisma.preselectionCandidate.findFirstOrThrow({
      where: { fullName: "RABE Marie" },
    });
    expect(candidate.usedByStudentId).toBe(student.id);
  });

  it("ne crée pas le dossier d'un candidat sans nom réel de baccalauréat/urgence — seul le nom est exigé", async () => {
    const actor = await createActor("SUPERADMIN");
    // Aucune colonne autre que Nom/Prénom : simule un fichier legacy incomplet
    const buffer = await buildWorkbook(["Nom", "Prénom"], [["RABE", "Marie"]]);

    const result = await importPreselectionFile(buffer, "2026-2027", actor.id, "EXISTING");
    expect(result.studentsCreated).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("un ré-import (fichier corrigé) relie le dossier déjà créé au lieu d'en créer un doublon", async () => {
    const actor = await createActor("SUPERADMIN");
    const firstFile = await buildWorkbook(["Nom", "Prénom", "Niveau"], [["RABE", "Marie", "L3"]]);
    await importPreselectionFile(firstFile, "2026-2027", actor.id, "EXISTING");

    // Le fichier corrigé reliste la même personne (même nom, même année)
    const secondFile = await buildWorkbook(["Nom", "Prénom", "Niveau"], [["RABE", "Marie", "L3"]]);
    const result = await importPreselectionFile(secondFile, "2026-2027", actor.id, "EXISTING");
    expect(result.studentsCreated).toBe(0);
    expect(result.studentsMatched).toBe(1);

    const students = await prisma.student.findMany({ where: { fullName: "RABE Marie" } });
    expect(students).toHaveLength(1);
  });

  it("une fiche de présélection (catégorie par défaut) ne crée jamais de dossier automatiquement", async () => {
    const actor = await createActor("SUPERADMIN");
    const buffer = await buildWorkbook(["Nom", "Prénom"], [["RAKOTO", "Jean"]]);

    const result = await importPreselectionFile(buffer, "2026-2027", actor.id);
    expect(result.studentsCreated).toBe(0);
    expect(await prisma.student.count()).toBe(0);
  });
});

describe("searchPreselectionCandidates", () => {
  it("trouve par sous-chaîne insensible à la casse, candidats non utilisés en premier", async () => {
    const actor = await createActor("SUPERADMIN");
    const buffer = await buildWorkbook(
      ["Nom", "Prénom"],
      [
        ["RAKOTOMALALA", "Jean"],
        ["RAKOTO", "Paul"],
      ],
    );
    await importPreselectionFile(buffer, "2026-2027", actor.id);

    const usedEntry = await prisma.preselectionCandidate.findFirstOrThrow({
      where: { fullName: "RAKOTOMALALA Jean" },
    });
    const student = await registerStudent(
      validRegisterInput({ lastName: "RAKOTOMALALA", firstName: "Jean" }),
      actor.id,
    );
    await markPreselectionUsed(usedEntry.id, student.id, actor.id);

    const results = await searchPreselectionCandidates("rakoto");
    expect(results.map((r) => r.fullName)).toEqual(["RAKOTO Paul", "RAKOTOMALALA Jean"]);
    expect(results[1].used).toBe(true);
    expect(results[1].usedMatricule).toBe(student.matricule);
  });

  it("ne renvoie rien pour une requête trop courte", async () => {
    const actor = await createActor("SUPERADMIN");
    const buffer = await buildWorkbook(["Nom", "Prénom"], [["RAKOTO", "Jean"]]);
    await importPreselectionFile(buffer, "2026-2027", actor.id);

    expect(await searchPreselectionCandidates("r")).toEqual([]);
  });
});

describe("markPreselectionUsed", () => {
  it("ne relie pas deux fois la même fiche à deux dossiers différents", async () => {
    const actor = await createActor("SUPERADMIN");
    const buffer = await buildWorkbook(["Nom", "Prénom"], [["RAKOTO", "Jean"]]);
    await importPreselectionFile(buffer, "2026-2027", actor.id);
    const entry = await prisma.preselectionCandidate.findFirstOrThrow({});

    const first = await registerStudent(validRegisterInput({ lastName: "RAKOTO", firstName: "Jean" }), actor.id);
    await markPreselectionUsed(entry.id, first.id, actor.id);

    const second = await registerStudent(validRegisterInput({ lastName: "RAKOTO", firstName: "Paul" }), actor.id);
    await markPreselectionUsed(entry.id, second.id, actor.id); // no-op, silencieux

    const reloaded = await prisma.preselectionCandidate.findUniqueOrThrow({ where: { id: entry.id } });
    expect(reloaded.usedByStudentId).toBe(first.id);
  });
});

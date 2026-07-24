import { describe, expect, it } from "vitest";

import { tasksForRole } from "@/lib/permissions";

describe("tasksForRole", () => {
  it("un agent d'administration reçoit uniquement les tâches de son domaine", () => {
    const tasks = tasksForRole("AGENT_ADMINISTRATION");
    expect(tasks).toEqual(
      expect.arrayContaining([
        "inscription",
        "reinscription",
        "verification_paiement",
        "ecolage",
        "csv",
        "suppression_etudiant",
        "modification_dossier",
        "communiquer",
      ]),
    );
    expect(tasks).not.toContain("validation_pedagogique");
    expect(tasks).not.toContain("resultats");
  });

  it("un agent pédagogique reçoit uniquement les tâches de son domaine", () => {
    const tasks = tasksForRole("AGENT_PEDAGOGIQUE");
    expect(tasks).toEqual(
      expect.arrayContaining(["validation_pedagogique", "resultats", "conduite", "communiquer"]),
    );
    expect(tasks).not.toContain("inscription");
  });

  it("le superadmin n'a pas de tâches assignables : il a déjà tous les droits par ailleurs", () => {
    // TASKS n'associe jamais le rôle SUPERADMIN — hasTaskPermission() le
    // court-circuite séparément. tasksForRole ne doit donc rien lui trouver.
    expect(tasksForRole("SUPERADMIN")).toEqual([]);
  });

  it("un étudiant n'a aucune tâche assignable", () => {
    expect(tasksForRole("ETUDIANT")).toEqual([]);
  });
});

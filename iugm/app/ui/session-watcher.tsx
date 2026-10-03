"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { clearOfflineCaches } from "@/lib/offline/clear";

// Un compte n'est connecté qu'à un appareil à la fois : quand il se connecte
// ailleurs, celui-ci doit se fermer de lui-même — et dire pourquoi — sans
// attendre que la personne clique quelque part.
//
// Contrôle toutes les 30 s tant que l'onglet est visible, et dès qu'il reprend
// le focus. Seul un 401 déconnecte : une erreur réseau (hors ligne) ou serveur
// est ignorée, pour ne jamais chasser quelqu'un qui saisit un dossier sans
// connexion. Les saisies hors ligne en attente ne sont pas effacées.
const CHECK_EVERY_MS = 30_000;

export function SessionWatcher() {
  const router = useRouter();

  useEffect(() => {
    let leaving = false;

    async function check() {
      if (leaving || document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/session/status", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (response.status !== 401) return;

        const body: { reason?: string } = await response.json().catch(() => ({}));
        leaving = true;
        await clearOfflineCaches();
        router.replace(`/login?raison=${encodeURIComponent(body.reason ?? "expired")}`);
      } catch {
        // Hors ligne ou serveur injoignable : on réessaiera au prochain contrôle
      }
    }

    const timer = setInterval(check, CHECK_EVERY_MS);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [router]);

  return null;
}

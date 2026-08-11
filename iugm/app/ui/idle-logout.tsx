"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { logout } from "@/app/auth-actions";

const IDLE_LIMIT_MS = 20 * 60 * 1000;
const WARNING_BEFORE_MS = 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

// Déconnexion automatique après 20 min d'inactivité (avertissement 1 min
// avant la coupure) : les postes de saisie du bureau administratif sont
// partagés/accessibles au public, un compte resté ouvert est un risque réel
// sur les dossiers étudiants et les paiements affichés.
export function IdleLogout() {
  const [warning, setWarning] = useState(false);
  const warningRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Programme les deux minuteurs (avertissement puis déconnexion) sans jamais
  // appeler setState directement : seuls les callbacks des timers ci-dessous
  // (déclenchés plus tard, hors du corps de l'effet) le font. Nécessaire pour
  // pouvoir appeler cette fonction au montage sans déclencher la règle
  // react-hooks/set-state-in-effect (setState synchrone dans un effet).
  const scheduleTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    warnTimer.current = setTimeout(() => {
      warningRef.current = true;
      setWarning(true);
    }, IDLE_LIMIT_MS - WARNING_BEFORE_MS);
    idleTimer.current = setTimeout(() => {
      startTransition(async () => {
        await logout();
      });
    }, IDLE_LIMIT_MS);
  }, []);

  // Relance le minuteur suite à une action explicite (activité détectée ou
  // clic sur "Rester connecté") — jamais appelé depuis le corps de l'effet.
  const reset = useCallback(() => {
    warningRef.current = false;
    setWarning(false);
    scheduleTimers();
  }, [scheduleTimers]);

  useEffect(() => {
    // Une fois l'avertissement affiché, seul le clic sur "Rester connecté"
    // le fait disparaître : un mouvement de souris incident (en s'éloignant
    // du poste, par exemple) ne doit pas annuler silencieusement l'alerte.
    function handleActivity() {
      if (!warningRef.current) reset();
    }

    scheduleTimers();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handleActivity));
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
    };
  }, [reset, scheduleTimers]);

  if (!warning) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Toujours là ?</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Vous allez être déconnecté dans une minute par inactivité, pour la sécurité du portail.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Rester connecté
        </button>
      </div>
    </div>
  );
}

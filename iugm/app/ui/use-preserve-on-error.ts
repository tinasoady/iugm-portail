"use client";

import { useEffect, useRef, type FormEvent } from "react";

// React 19 vide les champs NON contrôlés d'un formulaire après chaque soumission
// (<form action={...}>), même quand le serveur répond par une erreur : l'agent
// devait alors tout retaper (titre et texte d'un communiqué, identité d'un
// compte...). Ce hook mémorise les valeurs au moment de l'envoi et les remet en
// place quand l'action renvoie une erreur ; sur un succès, le formulaire reste
// vidé comme d'habitude.
//
// Les mots de passe et les fichiers ne sont jamais restaurés (on ne garde pas un
// secret en mémoire plus longtemps que nécessaire ; un fichier ne peut de toute
// façon pas être rempli par script).
//
// Usage : const [formRef, onSubmit] = usePreserveOnError(state.error, state);
//         <form ref={formRef} onSubmit={onSubmit} action={formAction}>
export function usePreserveOnError(error: string | undefined, state: unknown) {
  const ref = useRef<HTMLFormElement>(null);
  const snapshot = useRef<Array<[string, string]>>([]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const entries: Array<[string, string]> = [];
    for (const [name, value] of new FormData(event.currentTarget).entries()) {
      if (typeof value === "string") entries.push([name, value]);
    }
    snapshot.current = entries;
  }

  useEffect(() => {
    if (!error) return;
    // Après le reset de React (déclenché à la fin de l'action), pas avant
    const frame = requestAnimationFrame(() => {
      const form = ref.current;
      if (!form) return;
      for (const [name, value] of snapshot.current) {
        const field = form.elements.namedItem(name);
        if (
          (field instanceof HTMLInputElement &&
            !["password", "file", "hidden", "checkbox", "radio", "submit"].includes(field.type)) ||
          field instanceof HTMLTextAreaElement ||
          field instanceof HTMLSelectElement
        ) {
          field.value = value;
        }
      }
    });
    return () => cancelAnimationFrame(frame);
    // `state` change à chaque réponse du serveur, même si le texte d'erreur est identique
  }, [error, state]);

  return [ref, onSubmit] as const;
}

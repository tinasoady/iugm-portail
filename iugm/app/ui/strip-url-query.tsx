"use client";

import { useEffect } from "react";

// Retire les paramètres de l'adresse (jeton d'un lien reçu par e-mail) dès que la
// page est affichée : ils ne restent ni dans la barre d'adresse (capture d'écran,
// regard par-dessus l'épaule), ni dans l'historique du navigateur, ni dans le
// lien copié depuis la barre d'adresse. Le serveur a déjà lu le jeton et le formulaire
// le porte dans un champ caché : rien ne casse, sauf l'actualisation de la page,
// qui exige de rouvrir le lien depuis l'e-mail (voulu : le jeton n'est plus rejouable
// depuis l'historique).
export function StripUrlQuery() {
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, []);
  return null;
}

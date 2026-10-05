"use client";

const THROTTLE_KEY = "iugm-warm-pages-at";
const THROTTLE_MS = 10 * 60_000;

// Demande au service worker de mettre en cache les pages utilisables hors
// ligne (voir « warm-pages » dans public/sw.js). Au plus une fois toutes les
// 10 minutes par onglet : inutile de recharger ces pages à chaque affichage.
export function warmOfflinePages(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const last = Number(sessionStorage.getItem(THROTTLE_KEY) ?? 0);
    if (Date.now() - last < THROTTLE_MS) return;
    sessionStorage.setItem(THROTTLE_KEY, String(Date.now()));
  } catch {
    // Stockage de session indisponible : on prépare quand même, sans limiter
  }
  navigator.serviceWorker.ready
    .then((registration) => registration.active?.postMessage({ type: "warm-pages" }))
    .catch(() => {});
}

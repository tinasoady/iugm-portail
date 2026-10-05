"use client";

// ---------------------------------------------------------------------------
// Joignabilité réelle du serveur.
//
// `navigator.onLine` ne dit que « une interface réseau est active », pas « le
// serveur répond » : sur un poste Windows avec Docker, un VPN ou une carte
// virtuelle, il reste à `true` même en mode avion ou Wi-Fi sans Internet.
// S'y fier seul avait deux effets : le bandeau « Hors ligne » ne s'affichait
// jamais, et une saisie validée sans réseau partait en Server Action, échouait
// et finissait sur l'écran d'erreur au lieu de la file locale.
//
// On complète donc par une sonde légère (HEAD /api/ping, sans base de données)
// et par les échecs réels constatés (voir `markUnreachable`). Toute réponse
// HTTP, même une erreur, prouve que le serveur est joignable ; seul un échec
// réseau ou un délai dépassé prouve le contraire.
// ---------------------------------------------------------------------------

const PROBE_URL = "/api/ping";
const PROBE_TIMEOUT_MS = 4_000;
const PROBE_EVERY_MS = 10_000;

let reachable = true;
const listeners = new Set<() => void>();

function setReachable(value: boolean) {
  if (value === reachable) return;
  reachable = value;
  listeners.forEach((listener) => listener());
}

export function subscribeReachability(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReachableSnapshot(): boolean {
  return reachable;
}

// Vrai seulement si le navigateur se déclare en ligne ET que le serveur répond
export function isOnline(): boolean {
  return navigator.onLine && reachable;
}

// À appeler quand un appel réseau réel vient d'échouer, sans attendre la sonde
export function markUnreachable(): void {
  setReachable(false);
}

// Sonde le serveur et met à jour l'état ; renvoie vrai s'il répond
export async function probeServer(): Promise<boolean> {
  if (!navigator.onLine) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(PROBE_URL, { method: "HEAD", cache: "no-store", signal: controller.signal });
    setReachable(true);
    return true;
  } catch {
    setReachable(false);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let monitorStarted = false;

// Surveille la joignabilité tant que l'onglet est visible : au démarrage, à
// intervalle régulier, au retour sur l'onglet et à chaque changement d'état
// annoncé par le navigateur. À appeler une seule fois (OfflineSyncStatus).
export function startConnectivityMonitor(): void {
  if (monitorStarted || typeof window === "undefined") return;
  monitorStarted = true;

  const check = () => {
    if (document.visibilityState === "hidden") return;
    void probeServer();
  };
  check();
  setInterval(check, PROBE_EVERY_MS);
  window.addEventListener("online", check);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
}

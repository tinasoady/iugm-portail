// Service worker : permet à l'app de s'ouvrir hors ligne, pas seulement de
// continuer à fonctionner si l'onglet était déjà ouvert (voir
// docs/OFFLINE_SYNC.md, section « app shell »).
//
// Portée volontairement limitée : seules les pages nécessaires au parcours
// d'inscription/écolage hors ligne (PAGE_SCOPE ci-dessous) sont mises en
// cache. Le reste de l'app (dossiers étudiants, admin...) n'est jamais mis en
// cache navigateur : ces pages affichent des données personnelles
// d'étudiants, et un cache obsolète ou visible sur un poste partagé serait un
// vrai risque, pas juste un détail technique — voir docs/OFFLINE_SYNC.md.
//
// Deux caches distincts :
// - STATIC_CACHE (cache-first) : JS/CSS/polices/icônes, tous fingerprintés
//   par Next (nom de fichier différent à chaque build) — sans risque d'être
//   périmés, jamais besoin d'être invalidés explicitement.
// - PAGE_CACHE (network-first) : HTML des pages autorisées, uniquement comme
//   filet de secours si le réseau ne répond pas — toujours la version réseau
//   quand elle est disponible, jamais servie en priorité.
const STATIC_CACHE = "iugm-static-v1";
const PAGE_CACHE = "iugm-pages-v1";

const PAGE_SCOPE = ["/agent-admin", "/agent-admin/inscription", "/agent-admin/ecolage"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(["/manifest.json", "/icon-192.png", "/icon-512.png"]).catch(() => {
        // Pas bloquant : un échec de précache au premier install (ex. hors
        // ligne dès la toute première visite) ne doit pas empêcher le
        // service worker de s'activer, seulement le priver de ce précache.
      }),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icon") ||
      url.pathname === "/manifest.json")
  );
}

function isScopedNavigation(url) {
  return url.origin === self.location.origin && PAGE_SCOPE.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // jamais de cache pour les mutations (POST)

  const url = new URL(request.url);

  // Jamais d'interception pour les routes API : la logique hors ligne
  // (lib/offline/) gère déjà ce cas côté application, un fetch qui échoue
  // naturellement (pas de réseau) est ce qu'elle attend.
  if (url.pathname.startsWith("/api/")) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate" && isScopedNavigation(url)) {
    event.respondWith(
      caches.open(PAGE_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          const cached = await cache.match(request);
          if (cached) return cached;
          throw new Error("Page indisponible hors ligne (jamais visitée en ligne).");
        }
      }),
    );
  }
});

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

// Prépare le filet de secours des pages autorisées dès que l'agent est en
// ligne. Sans cela, une page n'entrait dans le cache que si elle avait été
// chargée en entier (rechargement, adresse tapée) : or un clic dans le menu
// est une navigation interne qui ne passe pas par ici, et couper le réseau
// avant d'avoir rechargé la page d'inscription donnait une page blanche.
// Une réponse redirigée (session expirée, tâche non autorisée → /login ou
// /agent-admin) n'est jamais mise en cache.
//
// Le HTML seul ne suffit pas : la page hors ligne a aussi besoin des fichiers
// JavaScript/CSS propres à sa route, que le navigateur ne télécharge qu'à la
// première visite de cette route. Sans eux, la page cachée s'ouvrait puis
// plantait au chargement (ChunkLoadError → écran « Une erreur est survenue »).
// On les repère dans le HTML et on les met dans STATIC_CACHE.
const STATIC_URL_PATTERN =
  /\/_next\/static\/[A-Za-z0-9_\-./%~]+\.(?:js|css|woff2?)(?:\?[A-Za-z0-9_=&.%-]+)?/g;

async function cacheStaticAssetsOf(html) {
  const urls = new Set(html.match(STATIC_URL_PATTERN) || []);
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const request = new Request(url, { credentials: "same-origin" });
        if (await cache.match(request, { ignoreSearch: true })) return;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response);
      } catch {
        // Fichier indisponible : la page restera ouverte sans lui, au pire
      }
    }),
  );
}

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "warm-pages") return;
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) =>
      Promise.all(
        PAGE_SCOPE.map(async (path) => {
          try {
            const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
            if (!response.ok || response.redirected) return;
            const html = await response.clone().text();
            await cache.put(path, response);
            await cacheStaticAssetsOf(html);
          } catch {
            // Réseau coupé ou page refusée : on réessaiera au prochain passage en ligne
          }
        }),
      ),
    ),
  );
});

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
        // ignoreSearch : sur Vercel, les fichiers portent un ?dpl=… propre au
        // déploiement ; leur nom est de toute façon unique par contenu
        const cached = await cache.match(request, { ignoreSearch: true });
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
          const cached = await cache.match(request, { ignoreVary: true });
          if (cached) return cached;
          throw new Error("Page indisponible hors ligne (jamais visitée en ligne).");
        }
      }),
    );
  }
});

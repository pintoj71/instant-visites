// Service Worker — réseau d'abord pour tout (pages, fichiers) ; cache = secours hors ligne. APIs jamais en cache.
// IMPORTANT : bumper VERSION à chaque modif visible pour forcer la mise à jour.
const VERSION = 'v1.9.4';
const CACHE = `instant-visites-${VERSION}`;
const ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/visite.html',
  '/css/style.css',
  '/js/api.js',
  '/js/login.js',
  '/js/entree.js',
  '/js/dashboard.js',
  '/js/visite.js',
  '/js/points-visite.js',
  '/js/signature.js',
  '/js/pdf-generator.js',
  '/js/croquis.js',
  '/js/logo.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/flamme.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  // Cache item par item (pas addAll) : un asset manquant (ex: icônes PNG non
  // encore générées) ne doit PAS faire échouer tout le pré-cache offline.
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // APIs : jamais de cache, le navigateur va directement au serveur
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;

  // Pages et fichiers de même origine : RÉSEAU D'ABORD (toujours la dernière version),
  // le cache ne sert qu'en secours hors ligne. Les adresses des fichiers ne portent pas
  // de numéro de version : un « cache d'abord » montrerait l'ancienne page après une mise à jour.
  if (e.request.method === 'GET' && url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' }).then(cached => {
        if (cached) return cached;
        // Hors ligne et non caché : l'app shell seulement pour une navigation
        // (sinon on servirait du HTML à la place d'un JS/CSS/image).
        if (e.request.mode === 'navigate') {
          return caches.match(url.pathname === '/visite.html' ? '/visite.html' : '/dashboard.html');
        }
        return Response.error();
      }))
    );
  }
});

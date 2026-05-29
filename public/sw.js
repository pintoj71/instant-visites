// Service Worker — cache-first pour les assets, network-first pour les APIs.
// IMPORTANT : bumper VERSION à chaque modif visible pour forcer la mise à jour.
const VERSION = 'v1.2.0';
const CACHE = `instant-visites-${VERSION}`;
const ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/visite.html',
  '/css/style.css',
  '/js/api.js',
  '/js/login.js',
  '/js/dashboard.js',
  '/js/visite.js',
  '/js/points-visite.js',
  '/js/signature.js',
  '/js/pdf-generator.js',
  '/js/logo.js',
  '/manifest.json',
  '/icons/icon.svg',
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

  // Network-first (pas de cache) pour les APIs
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;

  // Cache-first pour les assets statiques de même origine
  if (e.request.method === 'GET' && url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        return cached || fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => {
          // Hors-ligne et non caché : renvoyer l'app shell seulement pour une
          // navigation (sinon on servirait du HTML à la place d'un JS/CSS/image).
          if (e.request.mode === 'navigate') return caches.match('/dashboard.html');
          return Response.error();
        });
      })
    );
  }
});

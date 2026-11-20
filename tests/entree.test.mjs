import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const entree = await readFile(new URL('../public/js/entree.js', import.meta.url), 'utf8');
const login = (await readFile(new URL('../public/js/login.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from '[^']+';\n/gm, '')
  .replaceAll('location.replace(', '__go(');
const TICKET = 'a'.repeat(48);

async function ouvrir({ hash = '', portail = 'ok', avant } = {}) {
  const dom = new JSDOM(html, { url: `https://example.test/${hash}`, runScripts: 'outside-only' });
  const w = dom.window, allers = [], appels = [];
  if (avant !== undefined) w.sessionStorage.setItem('rouvrir_visites', String(avant));
  w.__go = (url) => allers.push(url);
  w.escapeHtml = (s) => String(s);
  w.api = {
    offlineIdentity: () => null,
    get: async (path) => { appels.push(['get', path]); if (path === '/techniciens') return { techniciens: ['Test'] }; throw Object.assign(new Error('Non autorisé'), { status: 401 }); },
    post: async (path, body) => {
      appels.push(['post', path, body]);
      if (portail === 'ok') return { name: 'Jonathan PINTO', portail: true };
      throw Object.assign(new Error('Lien expiré'), { status: 401 });
    }
  };
  w.eval(entree);
  const cacheAvantJs = w.document.documentElement.classList.contains('entree-portail');
  w.eval(login);
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  return { w, allers, appels, cacheAvantJs, close: () => w.close() };
}

test('Entrée invisible : avec un ticket, l’écran du code est caché avant le script de connexion', async () => {
  const x = await ouvrir({ hash: '#ticket=' + TICKET });
  try {
    assert.equal(x.cacheAvantJs, true);
    assert.match(await readFile(new URL('../public/css/style.css', import.meta.url), 'utf8'), /html\.entree-portail \.login-card \{ display: none; \}/);
    assert.match(html, /<script src="\/js\/entree\.js"><\/script>\n<\/head>/);
    assert.deepEqual(x.allers, ['/dashboard.html']);
    assert.equal(x.w.localStorage.getItem('viaPortail'), '1');
    assert.equal(x.appels.some(([m, p]) => m === 'get' && p === '/me'), false); // le ticket passe avant tout
    assert.equal(x.w.location.hash, '');
  } finally { x.close(); }
});

test('Entrée invisible : ticket refusé → le portail rouvre l’appli, sans écran du code', async () => {
  const x = await ouvrir({ hash: '#ticket=' + TICKET, portail: 'refus' });
  try {
    assert.deepEqual(x.allers, ['https://app.instantbypinto.fr/?rouvrir=visites']);
    assert.ok(Number(x.w.sessionStorage.getItem('rouvrir_visites')) > 0);
    assert.equal(x.w.document.documentElement.classList.contains('entree-portail'), true);
  } finally { x.close(); }
});

test('Entrée invisible : 2e échec en moins de 2 minutes → un message et « ← Retour au portail »', async () => {
  const x = await ouvrir({ hash: '#ticket=' + TICKET, portail: 'refus', avant: Date.now() - 30000 });
  try {
    assert.deepEqual(x.allers, []);
    const attente = x.w.document.getElementById('entreeAttente');
    assert.match(attente.textContent, /L’ouverture n’a pas marché\./);
    const lien = attente.querySelector('a');
    assert.equal(lien.href, 'https://app.instantbypinto.fr/');
    assert.equal(lien.textContent, '← Retour au portail');
    assert.equal(x.w.document.documentElement.classList.contains('entree-portail'), true);
  } finally { x.close(); }
});

test('Entrée invisible : un ancien échec (plus de 2 minutes) relance le portail', async () => {
  const x = await ouvrir({ hash: '#ticket=' + TICKET, portail: 'refus', avant: Date.now() - 3 * 60000 });
  try { assert.deepEqual(x.allers, ['https://app.instantbypinto.fr/?rouvrir=visites']); } finally { x.close(); }
});

test('Sans ticket : l’écran du code reste disponible', async () => {
  const x = await ouvrir();
  try {
    assert.equal(x.cacheAvantJs, false);
    assert.deepEqual(x.allers, []);
    assert.ok(x.appels.some(([m, p]) => m === 'get' && p === '/me'));
  } finally { x.close(); }
});

test('Session finie : entré par le portail → retour au portail, entré au code → connexion', async () => {
  const dom = new JSDOM('', { url: 'https://example.test/dashboard.html' });
  globalThis.localStorage = dom.window.localStorage;
  try {
    const { pageDeSortie } = await import('../public/js/api.js');
    assert.equal(pageDeSortie(), '/');
    localStorage.setItem('viaPortail', '1');
    assert.equal(pageDeSortie(), 'https://app.instantbypinto.fr');
  } finally { delete globalThis.localStorage; dom.window.close(); }
});

async function serviceWorker({ reseau }) {
  const src = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const ecouteurs = {}, cache = new Map([['https://example.test/index.html', 'ancienne page']]);
  const ctx = {
    URL, Promise,
    location: { origin: 'https://example.test' },
    self: { addEventListener: (t, f) => { ecouteurs[t] = f; }, skipWaiting() {}, clients: { claim() {} } },
    caches: {
      open: async () => ({ put: async (req, res) => cache.set(req.url, await res.text()), add: async () => {} }),
      match: async (req) => { const k = typeof req === 'string' ? 'https://example.test' + req : req.url; return cache.has(k) ? new Response(cache.get(k)) : undefined; },
      keys: async () => []
    },
    fetch: async () => { if (!reseau) throw new TypeError('hors ligne'); return new Response('nouvelle page'); },
    Response
  };
  vm.runInNewContext(src, ctx);
  return async (url, mode = 'navigate') => {
    let reponse;
    ecouteurs.fetch({ request: { url, method: 'GET', mode }, respondWith: (p) => { reponse = p; } });
    return reponse && (await reponse).text();
  };
}

test('Service worker : la page vient du réseau d’abord, le cache seulement hors ligne', async () => {
  assert.equal(await (await serviceWorker({ reseau: true }))('https://example.test/index.html'), 'nouvelle page');
  assert.equal(await (await serviceWorker({ reseau: false }))('https://example.test/index.html'), 'ancienne page');
});

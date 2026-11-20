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

async function ouvrir({ hash = '', portail = 'ok', avant, session = false, reseau = true } = {}) {
  const dom = new JSDOM(html, { url: `https://example.test/${hash}`, runScripts: 'outside-only' });
  const w = dom.window, allers = [], appels = [];
  if (avant !== undefined) w.sessionStorage.setItem('rouvrir_visites', String(avant));
  w.__go = (url) => allers.push(url);
  w.escapeHtml = (s) => String(s);
  w.api = {
    offlineIdentity: () => null,
    get: async (path) => {
      appels.push(['get', path]);
      if (!reseau) throw new TypeError('hors ligne');
      if (session && path === '/me') return { name: 'Jonathan PINTO' };
      throw Object.assign(new Error('Non autorisé'), { status: 401 });
    },
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

test('Ouverture directe, sans ticket ni session → renvoi au portail, aucun écran de code', async () => {
  const x = await ouvrir();
  try {
    assert.equal(x.cacheAvantJs, true);
    assert.deepEqual(x.allers, ['https://app.instantbypinto.fr/?rouvrir=visites']);
    assert.ok(Number(x.w.sessionStorage.getItem('rouvrir_visites')) > 0);
    assert.equal(x.w.document.getElementById('loginForm'), null);
    assert.equal(x.w.document.querySelector('input[type="password"], #pin, #techSelect, #nameInput'), null);
    assert.equal(x.appels.some(([m, p]) => p === '/techniciens' || p === '/login'), false);
  } finally { x.close(); }
});

test('Ouverture directe : 2e renvoi en moins de 2 minutes → un message et « ← Retour au portail »', async () => {
  const x = await ouvrir({ avant: Date.now() - 30000 });
  try {
    assert.deepEqual(x.allers, []);
    const attente = x.w.document.getElementById('entreeAttente');
    assert.match(attente.textContent, /L’ouverture n’a pas marché\./);
    assert.equal(attente.querySelector('a').href, 'https://app.instantbypinto.fr/');
  } finally { x.close(); }
});

test('Ouverture directe avec une session déjà ouverte → la liste, sans rien redemander', async () => {
  const x = await ouvrir({ session: true });
  try {
    assert.deepEqual(x.allers, ['/dashboard.html']);
    assert.equal(x.appels.some(([m, p]) => m === 'post'), false);
  } finally { x.close(); }
});

test('Ouverture directe, réseau coupé et personne connue → la liste hors ligne ; sinon message, pas de renvoi', async () => {
  const x = await ouvrir({ reseau: false });
  try {
    assert.deepEqual(x.allers, []);
    assert.match(x.w.document.getElementById('entreeAttente').textContent, /L’ouverture n’a pas marché\./);
  } finally { x.close(); }
});

test('Plus d’écran de code, de choix de nom ni de déconnexion dans l’appli', async () => {
  for (const f of ['index.html', 'dashboard.html', 'visite.html']) {
    const page = await readFile(new URL(`../public/${f}`, import.meta.url), 'utf8');
    assert.equal(/type="password"|id="pin"|techSelect|nameInput|logoutBtn|Déconnexion|Changer d/.test(page), false, f);
  }
  const dash = await readFile(new URL('../public/js/dashboard.js', import.meta.url), 'utf8');
  assert.equal(/logoutBtn|\/logout/.test(dash), false);
});

test('Haut d’écran commun : flamme + « Visites techniques » + un seul bouton (← Portail / ← Retour)', async () => {
  const bouton = { 'dashboard.html': '← Portail', 'visite.html': '← Retour' };
  for (const [f, texte] of Object.entries(bouton)) {
    const dom = new JSDOM(await readFile(new URL(`../public/${f}`, import.meta.url), 'utf8'));
    const h = dom.window.document.querySelector('header.app-header');
    assert.equal(h.querySelector('img.flamme').getAttribute('src'), '/icons/flamme.png');
    assert.equal(h.querySelector('.logo').textContent, 'Visites techniques');
    const boutons = [...h.querySelectorAll('button, a')];
    assert.equal(boutons.length, 1);
    assert.equal(boutons[0].textContent, texte);
    dom.window.close();
  }
  const css = await readFile(new URL('../public/css/style.css', import.meta.url), 'utf8');
  assert.match(css, /background: #faf6f1;[^}]*border-bottom: 1px solid #e6ddd3;[^}]*env\(safe-area-inset-top\)/);
});

test('Session finie ou absente : toujours le portail (rouvrir une fois, puis accueil du portail)', async () => {
  const dom = new JSDOM('', { url: 'https://example.test/dashboard.html' });
  globalThis.sessionStorage = dom.window.sessionStorage;
  try {
    const { pageDeSortie } = await import('../public/js/api.js');
    assert.equal(pageDeSortie(), 'https://app.instantbypinto.fr/?rouvrir=visites');
    assert.equal(pageDeSortie(), 'https://app.instantbypinto.fr');
  } finally { delete globalThis.sessionStorage; dom.window.close(); }
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

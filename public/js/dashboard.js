import { api, forgetOfflineIdentity, pageDeSortie, toast, fmtDate, escapeHtml, getOptionName } from '/js/api.js';

// Auth + nom
api.get('/me').then(u => {
  document.getElementById('userName').textContent = u.name;
  // entré par le portail Instant : le retour au portail est proposé dans l'en-tête
  if (u.portail) document.getElementById('versPortail').hidden = false;
}).catch(error => {
  if ((error.status && error.status < 500) || !api.offlineIdentity()) location.href = pageDeSortie();
});

const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
let currentWhen = 'today';
let cursor = null, shown = [], loadVersion = 0, lastQuery = '';
const moreBtn = document.getElementById('loadMore');

function faisaBadge(f) {
  const name = getOptionName(f);
  if (name === 'Faisable') return '<span class="badge faisable">Faisable</span>';
  if (name === 'Faisable sous conditions') return '<span class="badge conditions">Sous conditions</span>';
  if (name === 'Non faisable') return '<span class="badge non">Non faisable</span>';
  return '';
}

function chantierBadge(f) {
  const name = getOptionName(f);
  if (!name) return '';
  const cls = { 'À planifier': 'planifier', 'Devis': 'devis', 'Planifié': 'planifie', 'Posé': 'pose', 'SAV': 'sav', 'Annulé': 'annule' }[name] || '';
  return `<span class="badge chantier ${cls}">${escapeHtml(name)}</span>`;
}

function render(records) {
  if (!records.length) {
    listEl.innerHTML = `<div class="empty"><div class="icon">📋</div>Aucune visite à afficher</div>`;
    return;
  }
  listEl.innerHTML = records.map(r => {
    const f = r.fields;
    const statut = getOptionName(f['Statut']) || 'Brouillon';
    const isDone = statut === 'Terminée';
    const type = getOptionName(f['Type de projet']);
    const date = fmtDate(f['Date visite']);
    const meta = [date, type, (f['Adresse'] || '').split('\n')[0]].filter(Boolean).join(' · ');
    const statusBadge = isDone ? (faisaBadge(f['Faisabilité']) || '<span class="badge done">Terminée</span>') : '<span class="badge draft">Brouillon</span>';
    return `
      <div class="visite-item ${isDone ? 'done' : ''}" data-id="${r.id}">
        <div class="info">
          <div class="name">${escapeHtml(f['Client'] || 'Sans nom')}</div>
          <div class="meta">${escapeHtml(meta)}</div>
        </div>
        <div class="badges">${statusBadge}${chantierBadge(f['Statut chantier'])}</div>
      </div>`;
  }).join('');
  listEl.querySelectorAll('.visite-item').forEach(el => {
    el.addEventListener('click', () => { location.href = `/visite.html?id=${el.dataset.id}`; });
  });
}

function renderLocalDrafts() {
  const identity = api.offlineIdentity?.();
  if (!identity) return false;

  const prefix = `visite:${encodeURIComponent(identity.name)}:`;
  const links = [];
  for (const key of Object.keys(localStorage).filter(key => key.startsWith(prefix))) {
    try {
      const draft = JSON.parse(localStorage.getItem(key));
      if (draft.owner !== identity.name || draft.dirty === false) continue;
      const suffix = key.slice(prefix.length);
      if (suffix !== 'new' && !/^rec[A-Za-z0-9]{14}$/.test(suffix)) continue;
      const link = document.createElement('a');
      link.className = 'visite-item';
      link.href = suffix === 'new' ? '/visite.html' : `/visite.html?id=${suffix}`;
      link.textContent = draft.data?.client || 'Brouillon sans nom';
      links.push(link);
    } catch {}
  }
  const label = document.createElement('div');
  label.className = 'empty';
  label.textContent = links.length ? 'Brouillons sur ce téléphone' : 'Aucun brouillon sur ce téléphone';
  listEl.replaceChildren(label, ...links);
  return true;
}

async function load(when, q = '', append = false) {
  const version = ++loadVersion;
  lastQuery = q;
  if (!append) { shown = []; cursor = null; listEl.innerHTML = '<div class="empty"><span class="spinner dark"></span></div>'; }
  moreBtn.hidden = true;
  moreBtn.disabled = true;
  try {
    const qs = new URLSearchParams(q ? { q } : { when });
    if (append && cursor) qs.set('offset', cursor);
    const { records, offset } = await api.get(`/visites?${qs}`);
    if (version !== loadVersion) return;
    shown = [...new Map([...shown, ...records].map(r => [r.id, r])).values()];
    cursor = offset;
    render(shown);
    moreBtn.hidden = !cursor;
  } catch (err) {
    if (version !== loadVersion) return;
    if (!append && (!err.status || err.status >= 500) && renderLocalDrafts()) return;
    toast(err.message, 'danger');
    if (!append) listEl.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
    else moreBtn.hidden = false;
  } finally { if (version === loadVersion) moreBtn.disabled = false; }
}
moreBtn.addEventListener('click', () => load(currentWhen, lastQuery, true));

document.querySelectorAll('.tabs button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    currentWhen = b.dataset.when;
    searchEl.value = '';
    load(currentWhen);
  });
});

let searchTimer;
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchEl.value.trim();
  searchTimer = setTimeout(() => {
    if (q.length >= 2) load(null, q);
    else load(currentWhen);
  }, 300);
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  forgetOfflineIdentity();
  try { await api.post('/logout', {}); } catch {}
  location.href = '/';
});

load('today');

// Retour depuis une visite : si le navigateur ressort la liste de sa mémoire, on la recharge.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  const q = searchEl.value.trim();
  if (q.length >= 2) load(null, q); else load(currentWhen);
});

// PWA install
let deferredPrompt;
const banner = document.getElementById('installBanner');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!localStorage.getItem('installDismissed')) banner.classList.add('show');
});
document.getElementById('installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  banner.classList.remove('show');
  localStorage.setItem('installDismissed', '1');
});
document.getElementById('installClose').addEventListener('click', () => {
  banner.classList.remove('show');
  localStorage.setItem('installDismissed', '1');
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

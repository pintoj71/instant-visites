import { api, toast, fmtDate, escapeHtml, getOptionName } from '/js/api.js';

// Auth + nom
api.get('/me').then(u => {
  document.getElementById('userName').textContent = u.name;
}).catch(() => location.href = '/');

const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
let currentWhen = 'today';

function faisaBadge(f) {
  const name = getOptionName(f);
  if (name === 'Faisable') return '<span class="badge faisable">Faisable</span>';
  if (name === 'Faisable sous conditions') return '<span class="badge conditions">Sous conditions</span>';
  if (name === 'Non faisable') return '<span class="badge non">Non faisable</span>';
  return '';
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
    return `
      <div class="visite-item ${isDone ? 'done' : ''}" data-id="${r.id}">
        <div class="info">
          <div class="name">${escapeHtml(f['Client'] || 'Sans nom')}</div>
          <div class="meta">${escapeHtml(meta)}</div>
        </div>
        ${isDone ? faisaBadge(f['Faisabilité']) || '<span class="badge done">Terminée</span>' : '<span class="badge draft">Brouillon</span>'}
      </div>`;
  }).join('');
  listEl.querySelectorAll('.visite-item').forEach(el => {
    el.addEventListener('click', () => { location.href = `/visite.html?id=${el.dataset.id}`; });
  });
}

async function load(when, q) {
  listEl.innerHTML = `<div class="empty"><span class="spinner dark"></span></div>`;
  try {
    const qs = q ? `?q=${encodeURIComponent(q)}` : `?when=${when}`;
    const { records } = await api.get(`/visites${qs}`);
    render(records);
  } catch (err) {
    toast(err.message, 'danger');
    listEl.innerHTML = `<div class="empty"><div class="icon">⚠️</div>${escapeHtml(err.message)}</div>`;
  }
}

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
  try { await api.post('/logout', {}); } catch {}
  location.href = '/';
});

load('today');

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

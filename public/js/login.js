import { api, escapeHtml } from '/js/api.js';

// Arrivée depuis le portail Instant : l'adresse porte #ticket=… (60 s, une seule fois).
// On l'échange contre une session, puis on ouvre le tableau de bord comme après un PIN.
const ticket = (location.hash.match(/ticket=([0-9a-f]{48})/) || [])[1];
if (ticket) {
  history.replaceState(null, '', location.pathname + location.search);
  const msg = document.getElementById('error');
  if (msg) { msg.classList.add('info'); msg.textContent = 'Ouverture depuis le portail…'; }
  api.post('/portail', { ticket }).then((res) => {
    localStorage.setItem('userName', res.name || '');
    localStorage.setItem('viaPortail', '1');
    location.href = '/dashboard.html';
  }).catch((err) => {
    if (msg) { msg.classList.remove('info'); msg.textContent = err.message === 'Non autorisé' ? 'Lien expiré. Repasse par le portail.' : (err.message || 'Entrée par le portail impossible'); }
  });
} else {
  // Déjà connecté ? -> dashboard
  api.get('/me').then(() => location.href = '/dashboard.html').catch(() => {});
}

const form = document.getElementById('loginForm');
const errorEl = document.getElementById('error');
const btn = document.getElementById('submitBtn');
const select = document.getElementById('techSelect');
const nameInput = document.getElementById('nameInput');

const savedName = localStorage.getItem('userName') || '';

// Charge la liste des techniciens (menu déroulant) ; sinon, saisie libre
(async () => {
  try {
    const { techniciens } = await api.get('/techniciens');
    if (techniciens && techniciens.length) {
      select.innerHTML = '<option value="">— Choisir —</option>' +
        techniciens.map(n => `<option${n === savedName ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('');
      select.style.display = 'block';
      nameInput.style.display = 'none';
    } else {
      nameInput.value = savedName;
    }
  } catch {
    nameInput.value = savedName;
  }
})();

function currentName() {
  return (select.style.display !== 'none' ? select.value : nameInput.value).trim();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  const name = currentName();
  const pin = document.getElementById('pin').value;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Connexion...';
  try {
    const res = await api.post('/login', { pin, name });
    localStorage.setItem('userName', res.name || name);
    localStorage.removeItem('viaPortail');
    location.href = '/dashboard.html';
  } catch (err) {
    errorEl.textContent = err.message || 'Erreur de connexion';
    btn.disabled = false;
    btn.textContent = 'Se connecter';
  }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

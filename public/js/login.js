import { api, escapeHtml } from '/js/api.js';

// Arrivée depuis le portail Instant : l'adresse porte #ticket=… (60 s, une seule fois).
// L'écran du code est déjà caché (js/entree.js). On échange le ticket contre une session,
// puis on ouvre le tableau de bord comme après un PIN. Échec → le portail rouvre l'appli avec
// un ticket neuf ; 2e échec en moins de 2 minutes → un seul message, toujours sans l'écran du code.
const PORTAIL = 'https://app.instantbypinto.fr';
const MODULE = 'visites';
const CLE_ROUVRIR = `rouvrir_${MODULE}`;
const ticket = (location.hash.match(/ticket=([0-9a-f]{48})/) || [])[1];
if (ticket) {
  history.replaceState(null, '', location.pathname + location.search);
  api.post('/portail', { ticket }).then((res) => {
    localStorage.setItem('userName', res.name || '');
    localStorage.setItem('viaPortail', '1');
    try { sessionStorage.removeItem(CLE_ROUVRIR); } catch {}
    location.replace('/dashboard.html');
  }).catch(() => {
    // La session déjà ouverte (cookie) n'est pas touchée par un ticket refusé.
    let avant = 0;
    try { avant = Number(sessionStorage.getItem(CLE_ROUVRIR)) || 0; } catch {}
    if (Date.now() - avant < 2 * 60 * 1000) {
      const attente = document.getElementById('entreeAttente');
      if (attente) {
        attente.textContent = 'L\u2019ouverture n\u2019a pas marché.';
        const retour = document.createElement('a');
        retour.className = 'btn dark';
        retour.href = PORTAIL;
        retour.textContent = '← Retour au portail';
        attente.append(document.createElement('br'), retour);
      }
      return;
    }
    try { sessionStorage.setItem(CLE_ROUVRIR, String(Date.now())); } catch {}
    location.replace(`${PORTAIL}/?rouvrir=${MODULE}`);
  });
} else {
  // Déjà connecté ? -> dashboard (replace : le retour du téléphone ne repasse pas par cette page)
  api.get('/me').then(() => location.replace('/dashboard.html')).catch(error => {
    if ((!error.status || error.status >= 500) && api.offlineIdentity()) location.replace('/dashboard.html');
  });
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
    location.replace('/dashboard.html');
  } catch (err) {
    errorEl.textContent = err.message || 'Erreur de connexion';
    btn.disabled = false;
    btn.textContent = 'Se connecter';
  }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

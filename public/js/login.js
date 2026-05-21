import { api } from '/js/api.js';

// Déjà connecté ? -> dashboard
api.get('/me').then(() => location.href = '/dashboard.html').catch(() => {});

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
        techniciens.map(n => `<option${n === savedName ? ' selected' : ''}>${n}</option>`).join('');
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
    location.href = '/dashboard.html';
  } catch (err) {
    errorEl.textContent = err.message || 'Erreur de connexion';
    btn.disabled = false;
    btn.textContent = 'Se connecter';
  }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

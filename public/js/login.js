import { api } from '/js/api.js';

// Porte unique : le portail Instant. Cette page n'a plus d'écran de code (js/entree.js la garde cachée).
// - Arrivée avec #ticket=… (60 s, une seule fois) : on l'échange contre une session, puis la liste s'ouvre.
// - Ouverture directe, session valable : la liste s'ouvre.
// - Ouverture directe, sans session : renvoi tout de suite au portail (?rouvrir=visites), qui redemande
//   sa connexion si besoin puis rouvre l'appli.
// Anti-boucle : 2e échec en moins de 2 minutes → un seul message + « ← Retour au portail ».
const PORTAIL = 'https://app.instantbypinto.fr';
const MODULE = 'visites';
const CLE_ROUVRIR = `rouvrir_${MODULE}`;
const ticket = (location.hash.match(/ticket=([0-9a-f]{48})/) || [])[1];

function echec() {
  let avant = 0;
  try { avant = Number(sessionStorage.getItem(CLE_ROUVRIR)) || 0; } catch {}
  if (Date.now() - avant < 2 * 60 * 1000) {
    const attente = document.getElementById('entreeAttente');
    if (attente) {
      attente.textContent = 'L’ouverture n’a pas marché.';
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
}

if (ticket) {
  history.replaceState(null, '', location.pathname + location.search);
  api.post('/portail', { ticket }).then(() => {
    try { sessionStorage.removeItem(CLE_ROUVRIR); } catch {}
    location.replace('/dashboard.html');
  }).catch(echec);
} else {
  // Déjà connecté ? -> liste (replace : le retour du téléphone ne repasse pas par cette page)
  api.get('/me').then(() => location.replace('/dashboard.html')).catch(error => {
    if ((!error.status || error.status >= 500) && api.offlineIdentity()) location.replace('/dashboard.html');
    else if (error.status === 401) echec();
    else {
      // Réseau coupé ou serveur en panne, sans identité connue : pas de renvoi (le portail serait inaccessible aussi)
      const attente = document.getElementById('entreeAttente');
      if (attente) {
        attente.textContent = 'L’ouverture n’a pas marché.';
        const retour = document.createElement('a');
        retour.className = 'btn dark';
        retour.href = PORTAIL;
        retour.textContent = '← Retour au portail';
        attente.append(document.createElement('br'), retour);
      }
    }
  });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

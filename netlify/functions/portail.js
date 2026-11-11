// POST /api/portail  body: { ticket }
// Entrée par le portail Instant (app.instantbypinto.fr) : le portail donne un ticket
// (60 s, une seule fois) ; on l'échange dans Supabase contre le prénom de la personne,
// puis on ouvre la session habituelle de l'app (même cookie signé que la connexion par PIN).
//
// Actif seulement si la variable Netlify PORTAIL_MODULE_CLE est réglée (>= 32 caractères).
// Sans elle, l'app fonctionne exactement comme avant (PIN seul).
import {
  airtable, TABLES, signToken, authCookie, json, badRequest
} from './_lib.js';

const MODULE = 'visites';
const SUPABASE_URL = 'https://uckzjoyikxqalmvyjmug.supabase.co';
const SUPABASE_PUBLIC = 'sb_publishable_z9F86OZ59d1Rlhhzctt3fg_-tlIeg0c'; // clé publique par nature

export const portailActif = (env = process.env) =>
  typeof env.PORTAIL_MODULE_CLE === 'string' && env.PORTAIL_MODULE_CLE.trim().length >= 32;

const sansAccent = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Retrouve le technicien (table Airtable) d'un prénom venu du portail :
// « Mickaël » = « Mickael » = « Mickael Dupont ». Deux techniciens possibles → aucun (on garde le prénom).
export function technicienDuPrenom(noms, prenom) {
  const cle = sansAccent(prenom);
  if (!cle) return null;
  const liste = (Array.isArray(noms) ? noms : []).filter(Boolean);
  const exacts = liste.filter((n) => sansAccent(n) === cle);
  if (exacts.length === 1) return exacts[0];
  const parPrenom = liste.filter((n) => sansAccent(n).split(/\s+/)[0] === cle);
  return parPrenom.length === 1 ? parPrenom[0] : null;
}

// Session ouverte depuis le portail : à chaque ouverture d'écran (/api/me), on redemande au portail
// si la personne est toujours active et si sa case est toujours cochée.
// → true (toujours autorisée), false (accès retiré ou session portail finie), null (le portail ne répond pas).
export async function portailToujoursOk(user, env = process.env) {
  if (!user || user.via !== 'portail') return true;
  if (!portailActif(env) || !/^[0-9a-f]{64}$/.test(String(user.jeton || ''))) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/portail_verifier`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLIC, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_cle: env.PORTAIL_MODULE_CLE.trim(), p_module: MODULE, p_jeton: user.jeton }),
      signal: AbortSignal.timeout(6000)
    });
    const d = await res.json().catch(() => null);
    if (!res.ok || !d || typeof d !== 'object') return null;
    return d.ok === true;
  } catch {
    return null;
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return badRequest('POST only');
  if (!portailActif()) return json(503, { error: 'L’entrée par le portail n’est pas encore activée sur cette app.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }
  const ticket = String(body.ticket || '');
  if (!/^[0-9a-f]{48}$/.test(ticket)) return json(401, { error: 'Lien du portail invalide. Repasse par le portail.' });

  let d;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/portail_echanger`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLIC, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_cle: process.env.PORTAIL_MODULE_CLE.trim(), p_module: MODULE, p_ticket: ticket }),
      signal: AbortSignal.timeout(8000)
    });
    d = await res.json().catch(() => null);
    if (!res.ok || !d || typeof d !== 'object') throw new Error(`Portail ${res.status}`);
  } catch (err) {
    console.error('portail', err.message);
    return json(503, { error: 'La vérification du portail ne répond pas. Réessaie dans 1 minute.' });
  }
  if (!(d.ok === true && typeof d.prenom === 'string' && d.prenom.trim() && /^[0-9a-f]{64}$/.test(String(d.jeton || '')))) {
    return json(401, { error: d.erreur || 'Lien expiré. Repasse par le portail.' });
  }

  // Le nom affiché et enregistré sur les visites : celui de la table Techniciens s'il existe, sinon le prénom du portail.
  let displayName = d.prenom.trim();
  try {
    const data = await airtable(`/${TABLES.TECHNICIENS}?filterByFormula=${encodeURIComponent('{Actif}=TRUE()')}&pageSize=100`);
    const trouve = technicienDuPrenom((data.records || []).map((r) => r.fields?.['Nom']), displayName);
    if (trouve) displayName = trouve;
  } catch (err) {
    console.error('portail techniciens', err.message); // Airtable en panne : on entre quand même avec le prénom
  }

  const token = signToken({ sub: displayName, role: 'tech', via: 'portail', jeton: d.jeton });
  return json(200, { ok: true, name: displayName, portail: true }, { 'Set-Cookie': authCookie(token) });
};

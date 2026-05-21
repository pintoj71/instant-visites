// Helpers partagés : Airtable (2 bases) + Auth (HMAC) + rate-limit (Netlify Blobs)
import crypto from 'node:crypto';

// ---- Bases ----
// Base DEDIEE des visites techniques (lecture/écriture)
const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID || 'appiH3g9J0B9tdbIE';
// Base maintenance "Abonnements Entretien & Ramonage" (lecture seule, recherche client)
const AIRTABLE_CLIENTS_BASE = process.env.AIRTABLE_CLIENTS_BASE_ID || 'appCSUjH1ht16bL97';
const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;

const APP_PIN = process.env.APP_PIN || '';
const APP_SECRET = process.env.APP_SECRET || '';
const TOKEN_TTL_HOURS = 12;

export const BASES = { VISITES: AIRTABLE_BASE, CLIENTS: AIRTABLE_CLIENTS_BASE };

// ---- IDs Airtable (centralisés) ----
export const TABLES = {
  VISITES: 'tbl00bDbH7524lOq1',
  TECHNICIENS: 'tblYH9sqJeyHv1eLU',
  // Table Clients de la base maintenance (lecture seule)
  CLIENTS: 'tblT10SJD6ilGsJK3'
};

export const FIELDS = {
  visite: {
    client: 'fldAO0qXS0A1csweE',
    telephone: 'fldmutz0gmiTl9d8m',
    email: 'fldEeZUDjVZMyRNhC',
    adresse: 'fldB9EOwf5VHdTp1q',
    typeLogement: 'fldOh9iPqePHiVGlb',
    typeProjet: 'fldeJLljmjI3lapw3',
    dateVisite: 'fldBM9gopSSRvAI9s',
    technicien: 'fldZiBhQpm2HJrkfo',
    statut: 'fld0uuGLRbP15TbI7',
    faisabilite: 'fldeIxxBLgY1xz61j',
    estimation: 'fldmMVXwvpYeGFUxi',
    delai: 'fldXqM6UxKykZKSmg',
    reponsesJson: 'fldKnUO2IrJI52EsB',
    photos: 'fldqWIfobjKae4lzi',
    sigTechnicien: 'fldN9UyEUCOJ8X1vx',
    sigClient: 'fld66rHAOmgLSCwfd',
    pdfRapport: 'fldEPZMGLyNxOsiV5',
    refClient: 'fld1FnY6sYYNe7aRi'
  },
  technicien: {
    nom: 'fldhuYbKaGZdZ5QFo',
    pin: 'fldc7rq0cAunSTLl8',
    actif: 'fldMYcB04XPiCO6bR'
  }
};

// Noms de champs autorisés en écriture sur une visite (whitelist stricte)
export const VISITE_WRITABLE = new Set([
  'Client', 'Téléphone', 'Email', 'Adresse', 'Type de logement', 'Type de projet',
  'Date visite', 'Technicien', 'Statut', 'Faisabilité', 'Estimation budgétaire',
  'Délai indicatif', 'Réponses (JSON)', 'Signature technicien', 'Signature client',
  'Réf. client (Abonnements)'
]);

/* ========== VALIDATION ========== */
export function isValidRecordId(id) {
  return typeof id === 'string' && /^rec[A-Za-z0-9]{14}$/.test(id);
}

// Échappe une valeur destinée à une formule Airtable (entre quotes simples)
export function escapeFormula(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Ne garde que les champs dont le nom est dans la whitelist
export function pickWritable(fields, whitelist) {
  const out = {};
  for (const k of Object.keys(fields || {})) {
    if (whitelist.has(k)) out[k] = fields[k];
  }
  return out;
}

/* ========== AUTH ========== */
export function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

export function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function signToken(payload) {
  if (!APP_SECRET) throw new Error('APP_SECRET not configured');
  const data = JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_HOURS * 3600 * 1000 });
  const b64 = Buffer.from(data).toString('base64url');
  const sig = crypto.createHmac('sha256', APP_SECRET).update(b64).digest('hex');
  return `${b64}.${sig}`;
}

export function verifyToken(token) {
  if (!token || !APP_SECRET) return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const expected = crypto.createHmac('sha256', APP_SECRET).update(b64).digest('hex');
  const sb = Buffer.from(sig);
  const eb = Buffer.from(expected);
  if (sb.length !== eb.length || !crypto.timingSafeEqual(sb, eb)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function checkGlobalPin(pin) {
  if (!APP_PIN || !pin) return false;
  return safeEqualHex(String(pin), APP_PIN);
}

export function requireAuth(event) {
  const cookie = event.headers.cookie || event.headers.Cookie || '';
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;
  return verifyToken(token);
}

export function authCookie(token, maxAgeSec = TOKEN_TTL_HOURS * 3600) {
  return `session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

export function clearCookie() {
  return 'session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}

export function getClientIp(event) {
  const h = event.headers || {};
  return (
    h['x-nf-client-connection-ip'] ||
    (h['x-forwarded-for'] || '').split(',')[0].trim() ||
    h['client-ip'] ||
    'unknown'
  );
}

/* ========== RATE LIMIT (Netlify Blobs) ========== */
const MAX_FAILS = 5;
const BLOCK_MS = 15 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

async function rlStore() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore('login-attempts');
  } catch {
    return null; // indisponible (dev sans Netlify) -> on dégrade proprement
  }
}

const rlKey = (k) => 'rl_' + crypto.createHash('sha256').update(String(k)).digest('hex').slice(0, 32);

// Renvoie { blocked, retryAfter } si l'une des clés est bloquée
export async function rateLimitCheck(keys) {
  const store = await rlStore();
  if (!store) return { blocked: false, retryAfter: 0 };
  const now = Date.now();
  let retryAfter = 0;
  for (const k of keys) {
    let rec;
    try { rec = await store.get(rlKey(k), { type: 'json' }); } catch { rec = null; }
    if (rec && rec.until && rec.until > now) {
      retryAfter = Math.max(retryAfter, Math.ceil((rec.until - now) / 1000));
    }
  }
  return { blocked: retryAfter > 0, retryAfter };
}

// Incrémente le compteur d'échecs pour chaque clé, déclenche le blocage au seuil
export async function rateLimitFail(keys) {
  const store = await rlStore();
  if (!store) return;
  const now = Date.now();
  for (const k of keys) {
    const id = rlKey(k);
    let rec;
    try { rec = await store.get(id, { type: 'json' }); } catch { rec = null; }
    if (!rec || !rec.first || now - rec.first > WINDOW_MS) {
      rec = { fails: 1, first: now, until: null };
    } else {
      rec.fails += 1;
    }
    if (rec.fails >= MAX_FAILS) rec.until = now + BLOCK_MS;
    try { await store.setJSON(id, rec); } catch { /* best-effort */ }
  }
}

export async function rateLimitReset(keys) {
  const store = await rlStore();
  if (!store) return;
  for (const k of keys) {
    try { await store.delete(rlKey(k)); } catch { /* best-effort */ }
  }
}

/* ========== AIRTABLE ========== */
export async function airtable(path, options = {}, baseId = AIRTABLE_BASE) {
  if (!AIRTABLE_KEY) throw new Error('AIRTABLE_API_KEY not configured');
  const url = `https://api.airtable.com/v0/${baseId}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${AIRTABLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable ${res.status}: ${text}`);
  }
  return res.json();
}

// Upload d'une pièce jointe (base64) via la Content API Airtable
export async function uploadAttachment(recordId, fieldId, { file, filename, contentType }, baseId = AIRTABLE_BASE) {
  if (!AIRTABLE_KEY) throw new Error('AIRTABLE_API_KEY not configured');
  const url = `https://content.airtable.com/v0/${baseId}/${recordId}/${fieldId}/uploadAttachment`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AIRTABLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contentType, file, filename })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload Airtable ${res.status}: ${text}`);
  }
  return res.json();
}

/* ========== HTTP HELPERS ========== */
export const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...extraHeaders },
  body: JSON.stringify(body)
});

export const unauthorized = () => json(401, { error: 'Non autorisé' });
export const badRequest = (msg) => json(400, { error: msg });
export const serverError = (err) => json(500, { error: err.message || 'Erreur serveur' });

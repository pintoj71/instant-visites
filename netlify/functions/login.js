// POST /api/login  body: { name, pin }
// Authentifie un technicien (table Techniciens, PIN hashé SHA-256) ou via le PIN global.
import {
  airtable, TABLES, signToken, authCookie, hashPin, safeEqualHex, checkGlobalPin,
  getClientIp, rateLimitCheck, rateLimitFail, rateLimitReset, escapeFormula,
  json, badRequest, serverError
} from './_lib.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return badRequest('POST only');

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const name = String(body.name || '').trim();
  const pin = String(body.pin || '');
  if (!pin) return json(401, { error: 'PIN requis' });

  const ip = getClientIp(event);
  const keys = [`ip:${ip}`];
  if (name) keys.push(`name:${name.toLowerCase()}`);

  // Blocage si trop d'échecs récents
  const { blocked, retryAfter } = await rateLimitCheck(keys);
  if (blocked) {
    const min = Math.ceil(retryAfter / 60);
    return json(429,
      { error: `Trop de tentatives. Réessayez dans ${min} min.` },
      { 'Retry-After': String(retryAfter) }
    );
  }

  try {
    let authenticated = false;
    let displayName = name || 'technicien';

    // 1) Technicien actif correspondant au nom ?
    if (name) {
      const formula = `AND({Actif}=TRUE(), LOWER({Nom})='${escapeFormula(name.toLowerCase())}')`;
      const data = await airtable(
        `/${TABLES.TECHNICIENS}?filterByFormula=${encodeURIComponent(formula)}&pageSize=1`
      );
      const tech = data.records?.[0];
      if (tech) {
        const stored = tech.fields['PIN'] || '';
        if (stored && safeEqualHex(hashPin(pin), stored)) {
          authenticated = true;
          displayName = tech.fields['Nom'] || name;
        }
      }
    }

    // 2) Fallback PIN global
    if (!authenticated && checkGlobalPin(pin)) {
      authenticated = true;
    }

    if (!authenticated) {
      await rateLimitFail(keys);
      await new Promise(r => setTimeout(r, 600)); // léger délai anti brute-force
      return json(401, { error: 'Nom ou PIN incorrect' });
    }

    await rateLimitReset(keys);
    const token = signToken({ sub: displayName, role: 'tech' });
    return json(200, { ok: true, name: displayName }, { 'Set-Cookie': authCookie(token) });
  } catch (err) {
    console.error(err);
    return serverError(err);
  }
};

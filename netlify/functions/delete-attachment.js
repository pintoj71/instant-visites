// POST /api/delete-attachment  body: { visiteId, attId, field }
// Supprime une pièce jointe (Photos ou Croquis) d'une visite.
import { requireAuth, airtable, TABLES, BASES, isValidRecordId, unauthorized, badRequest, json, serverError } from './_lib.js';

export const handler = async (event) => {
  const user = requireAuth(event);
  if (!user) return unauthorized();
  if (event.httpMethod !== 'POST') return badRequest('POST only');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }
  const { visiteId, attId, field } = body;
  if (!isValidRecordId(visiteId)) return badRequest('visiteId invalide');
  if (!attId) return badRequest('attId requis');
  if (!['Photos', 'Croquis'].includes(field)) return badRequest('field invalide');
  try {
    const rec = await airtable(`/${TABLES.VISITES}/${visiteId}`, { method: 'GET' }, BASES.VISITES);
    const atts = (rec.fields || {})[field] || [];
    if (!atts.some(a => a.id === attId)) return badRequest('attachment introuvable sur cette visite');
    const remaining = atts.filter(a => a.id !== attId).map(a => ({ id: a.id }));
    await airtable(`/${TABLES.VISITES}/${visiteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { [field]: remaining } })
    }, BASES.VISITES);
    return json(200, { ok: true, remaining: remaining.length });
  } catch (err) {
    console.error(err);
    return serverError(err);
  }
};

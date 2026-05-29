// GET /api/visite-attachments?visiteId=recXXX
// Renvoie photos+croquis convertis en dataURL base64 (pour affichage UI + PDF).
// Le téléchargement passe par le serveur (l'URL Airtable est S3-signée et bloquée par la CSP côté browser).
import { requireAuth, airtable, TABLES, BASES, isValidRecordId, unauthorized, badRequest, json, serverError } from './_lib.js';

async function fetchAsDataUrl(url, type) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = type || res.headers.get('content-type') || 'application/octet-stream';
  return `data:${ct};base64,${buf.toString('base64')}`;
}

export const handler = async (event) => {
  const user = requireAuth(event);
  if (!user) return unauthorized();
  const visiteId = event.queryStringParameters?.visiteId;
  if (!isValidRecordId(visiteId)) return badRequest('visiteId invalide');
  try {
    const rec = await airtable(`/${TABLES.VISITES}/${visiteId}`, { method: 'GET' }, BASES.VISITES);
    const f = rec.fields || {};
    const ph = f['Photos'] || [];
    const cq = f['Croquis'] || [];
    const photos = await Promise.all(ph.map(async (a) => ({ id: a.id, filename: a.filename, dataUrl: await fetchAsDataUrl(a.url, a.type) })));
    const croquis = await Promise.all(cq.map(async (a) => ({ id: a.id, filename: a.filename, dataUrl: await fetchAsDataUrl(a.url, a.type) })));
    return json(200, { photos, croquis });
  } catch (err) {
    console.error(err);
    return serverError(err);
  }
};

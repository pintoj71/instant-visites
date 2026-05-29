// POST /api/upload-croquis  body: { visiteId, croquisBase64, filename }
// Ajoute un croquis (PNG, base64) en pièce jointe sur la visite.
// Même mécanique que upload-photo : 1 appel par croquis (append).
import { requireAuth, FIELDS, isValidRecordId, uploadAttachment, json, unauthorized, badRequest, serverError } from './_lib.js';

export const handler = async (event) => {
  const user = requireAuth(event);
  if (!user) return unauthorized();
  if (event.httpMethod !== 'POST') return badRequest('POST only');

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }
  const { visiteId, croquisBase64, filename } = body;
  if (!isValidRecordId(visiteId)) return badRequest('visiteId invalide');
  if (!croquisBase64) return badRequest('croquisBase64 requis');

  try {
    const data = await uploadAttachment(visiteId, FIELDS.visite.croquis, {
      contentType: 'image/png',
      file: croquisBase64,
      filename: filename || `croquis-${Date.now()}.png`
    });
    return json(200, data);
  } catch (err) {
    console.error(err);
    return serverError(err);
  }
};

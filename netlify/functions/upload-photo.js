// POST /api/upload-photo  body: { visiteId, photoBase64, filename }
// Ajoute une photo (JPEG compressé, base64) en pièce jointe sur la visite.
// L'API uploadAttachment ajoute la pièce jointe sans écraser les précédentes,
// on l'appelle donc une fois par photo. Le libellé est porté par le nom de fichier.
import { requireAuth, FIELDS, isValidRecordId, uploadAttachment, json, unauthorized, badRequest, serverError } from './_lib.js';

export const handler = async (event) => {
  const user = requireAuth(event);
  if (!user) return unauthorized();
  if (event.httpMethod !== 'POST') return badRequest('POST only');

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }
  const { visiteId, photoBase64, filename } = body;
  if (!isValidRecordId(visiteId)) return badRequest('visiteId invalide');
  if (!photoBase64) return badRequest('photoBase64 requis');

  try {
    const data = await uploadAttachment(visiteId, FIELDS.visite.photos, {
      contentType: 'image/jpeg',
      file: photoBase64,
      filename: filename || `photo-${Date.now()}.jpg`
    });
    return json(200, data);
  } catch (err) {
    console.error(err);
    return serverError(err);
  }
};

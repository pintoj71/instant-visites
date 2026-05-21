// POST /api/upload-pdf  body: { visiteId, pdfBase64, filename }
// Ajoute le PDF rapport en pièce jointe sur la visite (Content API Airtable).
import { requireAuth, FIELDS, isValidRecordId, uploadAttachment, json, unauthorized, badRequest, serverError } from './_lib.js';

export const handler = async (event) => {
  const user = requireAuth(event);
  if (!user) return unauthorized();
  if (event.httpMethod !== 'POST') return badRequest('POST only');

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }
  const { visiteId, pdfBase64, filename } = body;
  if (!isValidRecordId(visiteId)) return badRequest('visiteId invalide');
  if (!pdfBase64) return badRequest('pdfBase64 requis');

  try {
    const data = await uploadAttachment(visiteId, FIELDS.visite.pdfRapport, {
      contentType: 'application/pdf',
      file: pdfBase64,
      filename: filename || `rapport-visite-${Date.now()}.pdf`
    });
    return json(200, data);
  } catch (err) {
    console.error(err);
    return serverError(err);
  }
};

// GET  /api/prospects?q=durand  -> recherche prospect/client (table dédiée visites)
// POST /api/prospects                body: { fields }
// Création/recherche des clients & prospects de l'activité visites techniques,
// distincts de la base maintenance (Entretien & Ramonage).
import {
  requireAuth, airtable, TABLES, PROSPECT_WRITABLE, pickWritable, escapeFormula,
  isValidRecordId, json, unauthorized, badRequest, serverError
} from './_lib.js';

export const handler = async (event) => {
  const user = requireAuth(event);
  if (!user) return unauthorized();

  const rest = event.path.replace(/^.*\/prospects/, '');
  const id = rest.replace(/^\//, '').split('?')[0];

  try {
    if (event.httpMethod === 'GET' && !id) return await search(event);
    if (event.httpMethod === 'GET' && id) return await getOne(id);
    if (event.httpMethod === 'POST' && !id) return await create(event);
    return badRequest('Méthode non supportée');
  } catch (err) {
    console.error(err);
    return serverError(err);
  }
};

async function getOne(id) {
  if (!isValidRecordId(id)) return badRequest('ID invalide');
  const data = await airtable(`/${TABLES.PROSPECTS}/${id}`);
  return json(200, { prospect: data });
}

async function search(event) {
  const q = (event.queryStringParameters?.q || '').trim();
  if (q.length < 2) return json(200, { records: [] });
  const safe = escapeFormula(q.toLowerCase());
  const formula = `OR(` +
    `SEARCH('${safe}', LOWER({Nom complet}&'')),` +
    `SEARCH('${safe}', {Téléphone}&''),` +
    `SEARCH('${safe}', LOWER({Email}&'')),` +
    `SEARCH('${safe}', LOWER({Ville}&'')),` +
    `SEARCH('${safe}', LOWER({Code postal}&''))` +
    `)`;
  const data = await airtable(
    `/${TABLES.PROSPECTS}?filterByFormula=${encodeURIComponent(formula)}&pageSize=15`
  );
  return json(200, { records: data.records });
}

async function create(event) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }
  const fields = pickWritable(body.fields, PROSPECT_WRITABLE);
  if (!fields['Nom complet']) return badRequest('Nom complet requis');
  // Valeurs vides supprimées pour éviter d'écrire des chaînes vides en singleSelect
  Object.keys(fields).forEach(k => { if (fields[k] === '' || fields[k] == null) delete fields[k]; });
  const data = await airtable(`/${TABLES.PROSPECTS}`, {
    method: 'POST',
    body: JSON.stringify({ fields, typecast: true })
  });
  return json(200, { prospect: data });
}

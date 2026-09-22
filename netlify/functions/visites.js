// GET   /api/visites              -> liste (?when=today|week|all, ?q=recherche)
// GET   /api/visites/:id          -> détail
// POST  /api/visites              -> création  body: { fields }
// PATCH /api/visites/:id          -> mise à jour body: { fields }
import {
  requireAuth, airtable, TABLES, VISITE_WRITABLE, pickWritable, isValidRecordId,
  escapeFormula, json, unauthorized, badRequest, serverError
} from './_lib.js';

export const handler = async (event) => {
  const user = requireAuth(event);
  if (!user) return unauthorized();

  const rest = event.path.replace(/^.*\/visites/, '');
  const id = rest.replace(/^\//, '').split('?')[0];

  try {
    if (event.httpMethod === 'GET' && !id) return await listVisites(event);
    if (event.httpMethod === 'GET' && id) return await getVisite(id);
    if (event.httpMethod === 'POST' && !id) return await createVisite(event);
    if (event.httpMethod === 'PATCH' && id) return await updateVisite(id, event);
    return badRequest('Méthode non supportée');
  } catch (err) {
    console.error(err);
    return serverError(err);
  }
};

function buildListUrl(params) {
  const sp = new URLSearchParams();
  sp.set('filterByFormula', params.formula);
  sp.set('pageSize', '100');
  if (params.offset) sp.set('offset', params.offset);
  sp.set('sort[0][field]', 'Date visite');
  sp.set('sort[0][direction]', params.direction || 'desc');
  return `/${TABLES.VISITES}?${sp.toString()}`;
}

async function listVisites(event) {
  const p = new URLSearchParams(event.queryStringParameters || {});
  const when = p.get('when') || 'all';
  const q = (p.get('q') || '').trim();

  let formula = 'TRUE()';
  let direction = 'desc';

  if (q.length >= 2) {
    const s = escapeFormula(q.toLowerCase());
    formula = `OR(` +
      `SEARCH('${s}', LOWER({Client}&'')),` +
      `SEARCH('${s}', LOWER({Adresse}&'')),` +
      `SEARCH('${s}', {Téléphone}&''),` +
      `SEARCH('${s}', LOWER({Type de projet}&''))` +
      `)`;
  } else if (when === 'today') {
    formula = `IS_SAME({Date visite}, TODAY(), 'day')`;
    direction = 'asc';
  } else if (when === 'week') {
    formula = `AND(IS_AFTER({Date visite}, DATEADD(TODAY(), -1, 'day')), IS_BEFORE({Date visite}, DATEADD(TODAY(), 7, 'day')))`;
    direction = 'asc';
  }

  const data = await airtable(buildListUrl({ formula, direction, offset: p.get('offset') }));
  return json(200, { records: data.records, offset: data.offset || null });
}

async function getVisite(id) {
  if (!isValidRecordId(id)) return badRequest('ID invalide');
  const visite = await airtable(`/${TABLES.VISITES}/${id}`);
  return json(200, { visite });
}

async function createVisite(event) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }
  const fields = pickWritable(body.fields, VISITE_WRITABLE);
  if (!fields['Client']) return badRequest('Le nom du client est requis');
  const data = await airtable(`/${TABLES.VISITES}`, {
    method: 'POST',
    body: JSON.stringify({ fields, typecast: true })
  });
  return json(200, { visite: data });
}

async function updateVisite(id, event) {
  if (!isValidRecordId(id)) return badRequest('ID invalide');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }
  const fields = pickWritable(body.fields, VISITE_WRITABLE);
  const data = await airtable(`/${TABLES.VISITES}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields, typecast: true })
  });
  return json(200, { visite: data });
}

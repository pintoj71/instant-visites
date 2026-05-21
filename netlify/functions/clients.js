// GET /api/clients?q=durand  -> recherche client dans la base maintenance (lecture seule)
// Sert à pré-remplir une visite à partir d'un client déjà connu.
import { requireAuth, airtable, TABLES, BASES, escapeFormula, json, unauthorized, serverError } from './_lib.js';

export const handler = async (event) => {
  const user = requireAuth(event);
  if (!user) return unauthorized();

  const q = (event.queryStringParameters?.q || '').trim();
  if (q.length < 2) return json(200, { records: [] });

  const safe = escapeFormula(q.toLowerCase());
  const formula = `OR(` +
    `SEARCH('${safe}', LOWER({Nom complet}&'')),` +
    `SEARCH('${safe}', {Téléphone normalisé}&''),` +
    `SEARCH('${safe}', LOWER({Email normalisé}&'')),` +
    `SEARCH('${safe}', LOWER({Ville}&'')),` +
    `SEARCH('${safe}', LOWER({Code postal}&''))` +
    `)`;

  try {
    const data = await airtable(
      `/${TABLES.CLIENTS}?filterByFormula=${encodeURIComponent(formula)}&pageSize=15`,
      {},
      BASES.CLIENTS
    );
    return json(200, { records: data.records });
  } catch (err) {
    console.error(err);
    // La base maintenance peut être indisponible -> on dégrade sans bloquer la visite
    return json(200, { records: [] });
  }
};

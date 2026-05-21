// GET /api/techniciens  -> liste des noms de techniciens actifs (pour le menu de connexion)
// Pas d'auth requise (nécessaire avant login). Ne renvoie QUE les noms, jamais le PIN.
import { airtable, TABLES, json, serverError } from './_lib.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'GET only' });
  try {
    const data = await airtable(
      `/${TABLES.TECHNICIENS}?filterByFormula=${encodeURIComponent('{Actif}=TRUE()')}` +
      `&fields%5B%5D=Nom&pageSize=100`
    );
    const noms = (data.records || [])
      .map(r => r.fields['Nom'])
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'fr'));
    return json(200, { techniciens: noms });
  } catch (err) {
    console.error(err);
    // En cas d'erreur (ex: table vide), on renvoie une liste vide -> fallback saisie libre
    return json(200, { techniciens: [] });
  }
};

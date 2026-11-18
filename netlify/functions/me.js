import { json } from './_lib.js';
import { verifierAcces } from './portail.js';

export const handler = async (event) => {
  const { user, refus, portailIndisponible } = await verifierAcces(event);
  if (refus) return refus;
  return json(200, { name: user.sub, role: user.role, portail: user.via === 'portail', portailIndisponible, expiresAt: user.exp }, { 'Cache-Control': 'no-store' });
};

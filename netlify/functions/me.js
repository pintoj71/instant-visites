import { requireAuth, clearCookie, json, unauthorized } from './_lib.js';
import { portailToujoursOk } from './portail.js';

export const handler = async (event) => {
  const user = requireAuth(event);
  if (!user) return unauthorized();
  // Entré par le portail Instant : l'accès est revérifié à chaque ouverture d'écran.
  // Si le portail ne répond pas (null), on laisse travailler : la session reste valable 12 h au plus.
  if ((await portailToujoursOk(user)) === false) {
    return json(401, { error: 'Ton accès a changé ou a expiré. Repasse par le portail Instant.' }, { 'Set-Cookie': clearCookie() });
  }
  return json(200, { name: user.sub, role: user.role, portail: user.via === 'portail' });
};

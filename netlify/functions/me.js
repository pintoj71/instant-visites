import { requireAuth, json, unauthorized } from './_lib.js';

export const handler = async (event) => {
  const user = requireAuth(event);
  if (!user) return unauthorized();
  return json(200, { name: user.sub, role: user.role });
};

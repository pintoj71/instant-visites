import { clearCookie, json } from './_lib.js';

export const handler = async () => json(200, { ok: true }, { 'Set-Cookie': clearCookie() });

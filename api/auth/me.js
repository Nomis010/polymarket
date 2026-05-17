import { readToken, send } from '../_store.js';

export default async function handler(req, res) {
  const user = readToken(req);
  if (!user) return send(res, { error: 'Session invalide' }, 401);
  return send(res, { user });
}

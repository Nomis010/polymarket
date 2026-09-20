import { getData, readToken, send } from '../_store.js';

export default async function handler(req, res) {
  const user = readToken(req);
  if (!user) return send(res, { error: 'Session invalide' }, 401);
  if (!user.isAdmin) {
    const data = await getData();
    const storedUser = data.users?.[user.username];
    if (!storedUser) return send(res, { error: 'Session invalide' }, 401);
    if (storedUser.suspendedUntil && storedUser.suspendedUntil > Date.now()) {
      return send(res, { error: `Connexion bloquée jusqu’au ${new Date(storedUser.suspendedUntil).toLocaleString('fr-FR')}` }, 403);
    }
  }
  return send(res, { user });
}

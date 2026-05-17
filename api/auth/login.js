import { adminUsername, createToken, getData, publicUser, readBody, safeUsername, send, verifyPassword } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);

  const { username, password } = readBody(req);
  const cleanUsername = safeUsername(username);
  if (!cleanUsername || !password) return send(res, { error: 'Remplis tous les champs' }, 400);

  if (cleanUsername === adminUsername()) {
    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      return send(res, { error: 'Identifiants incorrects' }, 401);
    }
    const user = { username: cleanUsername, isAdmin: true };
    return send(res, { user, token: createToken(user) });
  }

  const data = await getData();
  const storedUser = data.users?.[cleanUsername];
  if (!storedUser || !verifyPassword(password, storedUser)) {
    return send(res, { error: 'Identifiants incorrects' }, 401);
  }

  const user = { ...publicUser(cleanUsername, storedUser), isAdmin: false };
  return send(res, { user, token: createToken(user) });
}

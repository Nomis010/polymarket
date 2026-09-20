import { getData, publicState, readToken, send } from './_store.js';

export default async function handler(req, res) {
  const data = await getData();
  const viewer = readToken(req);
  if (viewer && !viewer.isAdmin && data.users?.[viewer.username]?.bannedAt) {
    return send(res, { error: 'Ce compte est banni définitivement.' }, 403);
  }
  return send(res, publicState(data, viewer));
}

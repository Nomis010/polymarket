import { getData, publicState, readToken, send } from './_store.js';

export default async function handler(req, res) {
  const data = await getData();
  const viewer = readToken(req);
  if (viewer && !viewer.isAdmin && !data.users?.[viewer.username]) {
    return send(res, { error: 'Ce compte a été supprimé.' }, 401);
  }
  return send(res, publicState(data, viewer));
}

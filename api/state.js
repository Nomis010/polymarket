import { getData, publicState, readToken, send } from './_store.js';

export default async function handler(req, res) {
  const data = await getData();
  return send(res, publicState(data, readToken(req)));
}

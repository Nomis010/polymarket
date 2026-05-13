import { readBody, requireAdmin, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);
  try {
    requireAdmin(req);
    const { betId } = readBody(req);
    const data = await updateData((current) => ({ ...current, bets: (current.bets || []).map((b) => b.id === betId ? { ...b, status: 'closed' } : b) }));
    return send(res, statePayload(data, { message: 'Paris fermé aux nouvelles mises.' }));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur fermeture' }, 400);
  }
}

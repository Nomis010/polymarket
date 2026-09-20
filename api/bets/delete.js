import { readBody, requireAdmin, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);
  try {
    const session = requireAdmin(req);
    const { betId } = readBody(req);
    const data = await updateData((current) => ({
      ...current,
      bets: (current.bets || []).filter((b) => b.id !== betId),
      wagers: (current.wagers || []).filter((w) => w.betId !== betId),
    }));
    return send(res, statePayload(data, { message: 'Paris supprimé.' }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur suppression' }, 400);
  }
}

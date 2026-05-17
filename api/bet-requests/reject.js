import { readBody, requireAdmin, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);

  try {
    const session = requireAdmin(req);
    const { requestId } = readBody(req);
    const data = await updateData((current) => ({
      ...current,
      betRequests: (current.betRequests || []).map((item) => item.id === requestId ? { ...item, status: 'rejected', reviewedAt: Date.now() } : item),
    }));

    return send(res, statePayload(data, { message: 'Demande refusée.' }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur refus demande' }, 400);
  }
}

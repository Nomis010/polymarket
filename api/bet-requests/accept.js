import { id, readBody, requireAdmin, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);

  try {
    const session = requireAdmin(req);
    const { requestId, virtualStakes } = readBody(req);
    const data = await updateData((current) => {
      const request = (current.betRequests || []).find((item) => item.id === requestId);
      if (!request) throw new Error('Demande introuvable');
      if (request.status !== 'pending') throw new Error('Demande déjà traitée');

      const stakes = Array.isArray(virtualStakes) && virtualStakes.length === request.options.length
        ? virtualStakes.map((stake) => Number(stake))
        : request.options.map(() => 100);
      if (stakes.some((stake) => !Number.isFinite(stake) || stake <= 0)) throw new Error('Mises fictives invalides');

      const bet = {
        id: id(),
        title: request.title,
        description: request.description,
        options: request.options,
        virtualStakes: stakes.map((stake) => Number(stake.toFixed(2))),
        status: 'open',
        createdAt: Date.now(),
        closesAt: request.closesAt || null,
        resolvedOption: null,
        requestedBy: request.username,
      };

      return {
        ...current,
        bets: [...(current.bets || []), bet],
        betRequests: (current.betRequests || []).map((item) => item.id === requestId ? { ...item, status: 'accepted', reviewedAt: Date.now() } : item),
      };
    });

    return send(res, statePayload(data, { message: 'Demande acceptée et pari publié.' }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur acceptation demande' }, 400);
  }
}

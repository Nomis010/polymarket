import { id, readBody, requireAdmin, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);
  try {
    const session = requireAdmin(req);
    const { requestId, action, virtualStakes = [100, 100], closesAt } = readBody(req);
    if (!requestId) return send(res, { error: 'Demande requise' }, 400);
    if (!['approve', 'reject'].includes(action)) return send(res, { error: 'Action invalide' }, 400);

    const data = await updateData((current) => {
      const request = (current.betRequests || []).find((item) => item.id === requestId);
      if (!request) throw new Error('Demande introuvable');

      const betRequests = (current.betRequests || []).map((item) => (
        item.id === requestId ? { ...item, status: action === 'approve' ? 'accepted' : 'rejected', reviewedAt: Date.now() } : item
      ));
      if (action === 'reject') return { ...current, betRequests };

      const stakes = request.options.map((_, index) => Math.max(0, Number(virtualStakes[index] || 0)));
      const bet = {
        id: id(),
        title: request.title,
        description: request.description ? `${request.description}\nProposé par ${request.username}.` : `Proposé par ${request.username}.`,
        options: request.options,
        virtualStakes: stakes,
        status: 'open',
        createdAt: Date.now(),
        closesAt: closesAt ? new Date(closesAt).getTime() : null,
        resolvedOption: null,
      };
      return { ...current, betRequests, bets: [...(current.bets || []), bet] };
    });
    return send(res, statePayload(data, { message: action === 'approve' ? 'Demande acceptée et publiée.' : 'Demande refusée.' }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur traitement demande' }, 400);
  }
}

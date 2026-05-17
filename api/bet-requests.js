import { id, readBody, requireAdmin, requireUser, send, statePayload, updateData } from './_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);

  const body = readBody(req);
  const action = body.action || 'create';

  try {
    if (action === 'create') {
      const session = requireUser(req);
      if (session.isAdmin) return send(res, { error: "L'admin peut créer un pari directement" }, 400);
      const { title, description, options, closesAt } = body;
      if (!title?.trim()) return send(res, { error: 'Titre requis' }, 400);
      if (!Array.isArray(options) || options.length < 2 || options.some((o) => !String(o).trim())) return send(res, { error: 'Deux options minimum sont requises' }, 400);

      const request = {
        id: id(),
        username: session.username,
        title: title.trim(),
        description: String(description || '').trim(),
        options: options.map((o) => String(o).trim()),
        closesAt: closesAt ? new Date(closesAt).getTime() : null,
        status: 'pending',
        createdAt: Date.now(),
      };

      const data = await updateData((current) => ({
        ...current,
        betRequests: [request, ...(current.betRequests || [])],
      }));

      return send(res, statePayload(data, { message: "Demande envoyée à l'administration." }, session));
    }

    const session = requireAdmin(req);

    if (action === 'accept') {
      const { requestId, virtualStakes } = body;
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
    }

    if (action === 'reject') {
      const { requestId } = body;
      const data = await updateData((current) => ({
        ...current,
        betRequests: (current.betRequests || []).map((item) => item.id === requestId ? { ...item, status: 'rejected', reviewedAt: Date.now() } : item),
      }));

      return send(res, statePayload(data, { message: 'Demande refusée.' }, session));
    }

    return send(res, { error: 'Action inconnue' }, 400);
  } catch (error) {
    return send(res, { error: error.message || 'Erreur requête de pari' }, 400);
  }
}

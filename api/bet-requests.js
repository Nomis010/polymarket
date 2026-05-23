import { id, readBody, requireAdmin, requireUser, send, statePayload, updateData } from './_store.js';

const YES_NO_OPTIONS = ['OUI', 'NON'];

function hasOnlyYesNoOptions(options) {
  return Array.isArray(options)
    && options.length === 2
    && options.every((option, index) => String(option || '').trim().toUpperCase() === YES_NO_OPTIONS[index]);
}

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
      if (!hasOnlyYesNoOptions(options)) return send(res, { error: 'Les réponses doivent être uniquement OUI et NON' }, 400);

      const request = {
        id: id(),
        username: session.username,
        title: title.trim(),
        description: String(description || '').trim(),
        options: YES_NO_OPTIONS,
        closesAt: closesAt ? new Date(closesAt).getTime() : null,
        status: 'pending',
        createdAt: Date.now(),
      };

      const data = await updateData((current) => {
        const user = current.users?.[session.username];
        if (user?.suspendedUntil && user.suspendedUntil > Date.now()) throw new Error('Connexion temporairement bloquée');
        return {
          ...current,
          betRequests: [request, ...(current.betRequests || [])],
        };
      });

      return send(res, statePayload(data, { message: "Demande envoyée à l'administration." }, session));
    }

    const session = requireAdmin(req);

    if (action === 'accept') {
      const { requestId, virtualStakes } = body;
      const data = await updateData((current) => {
        const request = (current.betRequests || []).find((item) => item.id === requestId);
        if (!request) throw new Error('Demande introuvable');
        if (request.status !== 'pending') throw new Error('Demande déjà traitée');
        if (!hasOnlyYesNoOptions(request.options)) throw new Error('Cette demande doit être recréée avec les réponses OUI et NON');

        const stakes = Array.isArray(virtualStakes) && virtualStakes.length === request.options.length
          ? virtualStakes.map((stake) => Number(stake))
          : request.options.map(() => 500);
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

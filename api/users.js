import { readBody, requireAdmin, safeUsername, send, statePayload, updateData } from './_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);

  const body = readBody(req);
  const action = body.action || 'update';

  try {
    const session = requireAdmin(req);
    const cleanUsername = safeUsername(body.username);
    if (!cleanUsername) return send(res, { error: 'Utilisateur requis' }, 400);

    if (action === 'delete') {
      const data = await updateData((current) => {
        if (!current.users?.[cleanUsername]) throw new Error('Compte introuvable');
        const users = { ...(current.users || {}) };
        delete users[cleanUsername];
        return { ...current, users, wagers: (current.wagers || []).filter((w) => w.username !== cleanUsername) };
      });
      return send(res, statePayload(data, { message: 'Compte supprimé.' }, session));
    }

    if (action === 'update') {
      const nextBalance = Number.parseInt(body.balance, 10);
      if (!Number.isFinite(nextBalance) || nextBalance < 0) return send(res, { error: 'Solde invalide' }, 400);

      const data = await updateData((current) => {
        const user = current.users?.[cleanUsername];
        if (!user) throw new Error('Compte introuvable');
        return {
          ...current,
          users: {
            ...(current.users || {}),
            [cleanUsername]: { ...user, balance: nextBalance },
          },
        };
      });

      return send(res, statePayload(data, { message: 'Solde mis à jour.' }, session));
    }

    return send(res, { error: 'Action inconnue' }, 400);
  } catch (error) {
    return send(res, { error: error.message || 'Erreur compte' }, 400);
  }
}

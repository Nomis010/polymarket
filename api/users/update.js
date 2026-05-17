import { readBody, requireAdmin, safeUsername, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);

  try {
    const session = requireAdmin(req);
    const { username, balance } = readBody(req);
    const cleanUsername = safeUsername(username);
    const nextBalance = Number.parseInt(balance, 10);
    if (!cleanUsername) return send(res, { error: 'Utilisateur requis' }, 400);
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
  } catch (error) {
    return send(res, { error: error.message || 'Erreur mise à jour compte' }, 400);
  }
}

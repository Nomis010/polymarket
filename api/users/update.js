import { readBody, requireAdmin, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);
  try {
    const session = requireAdmin(req);
    const { username, balance } = readBody(req);
    const nextBalance = Number.parseInt(balance, 10);
    if (!username) return send(res, { error: 'Utilisateur requis' }, 400);
    if (Number.isNaN(nextBalance) || nextBalance < 0) return send(res, { error: 'Quantité de seeonium invalide' }, 400);

    const data = await updateData((current) => {
      const user = current.users?.[username];
      if (!user) throw new Error('Compte introuvable');
      return {
        ...current,
        users: { ...(current.users || {}), [username]: { ...user, balance: nextBalance } },
      };
    });
    return send(res, statePayload(data, { message: 'Seeonium mis à jour.' }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur modification joueur' }, 400);
  }
}

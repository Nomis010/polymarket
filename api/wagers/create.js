import { getOptionOdds, id, readBody, requireUser, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);
  try {
    const session = requireUser(req);
    if (session.isAdmin) return send(res, { error: 'Un admin ne peut pas miser' }, 400);
    const { betId, amount, optionIndex } = readBody(req);
    const wagerAmount = Number.parseInt(amount, 10);
    const optIdx = Number.parseInt(optionIndex, 10);
    if (!wagerAmount || wagerAmount < 1) return send(res, { error: 'Mise minimum : 1 🪙' }, 400);
    if (Number.isNaN(optIdx)) return send(res, { error: 'Choisis une option' }, 400);

    const data = await updateData((current) => {
      const user = current.users?.[session.username];
      const bet = (current.bets || []).find((b) => b.id === betId);
      if (!user) throw new Error('Compte introuvable');
      if (!bet || bet.status !== 'open') throw new Error('Paris non ouvert');
      if (!bet.options?.[optIdx]) throw new Error('Option invalide');
      if ((user.balance || 0) < wagerAmount) throw new Error('Solde insuffisant');
      const lockedOdds = getOptionOdds(bet, current.wagers || [], optIdx);
      return {
        ...current,
        users: { ...(current.users || {}), [session.username]: { ...user, balance: user.balance - wagerAmount } },
        wagers: [ ...(current.wagers || []), { id: id(), betId, username: session.username, amount: wagerAmount, optionIndex: optIdx, lockedOdds, createdAt: Date.now() } ],
      };
    });
    return send(res, statePayload(data, { message: 'Mise de ' + wagerAmount + ' 🪙 placée !' }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur mise' }, 400);
  }
}

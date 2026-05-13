import { readBody, requireAdmin, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);
  try {
    requireAdmin(req);
    const { betId, optionIndex } = readBody(req);
    const winnerIndex = Number(optionIndex);
    const data = await updateData((current) => {
      const bet = (current.bets || []).find((b) => b.id === betId);
      if (!bet) throw new Error('Paris introuvable');
      const users = { ...(current.users || {}) };
      (current.wagers || []).filter((w) => w.betId === betId).forEach((w) => {
        if (w.optionIndex === winnerIndex && users[w.username]) {
          users[w.username] = { ...users[w.username], balance: (users[w.username].balance || 0) + Math.floor(w.amount * bet.odds[winnerIndex]) };
        }
      });
      return { ...current, users, bets: (current.bets || []).map((b) => b.id === betId ? { ...b, status: 'resolved', resolvedOption: winnerIndex } : b) };
    });
    return send(res, statePayload(data, { message: 'Paris résolu ! Gains distribués 🎉' }));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur résolution' }, 400);
  }
}

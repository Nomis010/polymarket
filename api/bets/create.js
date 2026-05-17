import { id, readBody, requireAdmin, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);
  try {
    const session = requireAdmin(req);
    const { title, description, options, odds, virtualStakes, closesAt } = readBody(req);
    if (!title?.trim()) return send(res, { error: 'Titre requis' }, 400);
    if (!Array.isArray(options) || options.length < 2 || options.some((o) => !String(o).trim())) return send(res, { error: 'Toutes les options sont requises' }, 400);
    const stakes = Array.isArray(virtualStakes) ? virtualStakes : odds;
    if (!Array.isArray(stakes) || stakes.length !== options.length || stakes.some((o) => Number.isNaN(Number(o)) || Number(o) <= 0)) return send(res, { error: 'Mise fictive invalide' }, 400);

    const bet = {
      id: id(), title: title.trim(), description: String(description || '').trim(),
      options: options.map((o) => String(o).trim()),
      virtualStakes: stakes.map((o) => Number(Number(o).toFixed(2))),
      status: 'open', createdAt: Date.now(), closesAt: closesAt ? new Date(closesAt).getTime() : null, resolvedOption: null,
    };

    const data = await updateData((current) => ({ ...current, bets: [...(current.bets || []), bet] }));
    return send(res, statePayload(data, { message: 'Paris créé !' }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur création' }, 400);
  }
}

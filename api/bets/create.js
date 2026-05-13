import { id, readBody, requireAdmin, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);
  try {
    requireAdmin(req);
    const { title, description, options, odds, closesAt } = readBody(req);
    if (!title?.trim()) return send(res, { error: 'Titre requis' }, 400);
    if (!Array.isArray(options) || options.length < 2 || options.some((o) => !String(o).trim())) return send(res, { error: 'Toutes les options sont requises' }, 400);
    if (!Array.isArray(odds) || odds.length !== options.length || odds.some((o) => Number.isNaN(Number(o)) || Number(o) < 1)) return send(res, { error: 'Cotes invalides (min 1.0)' }, 400);

    const bet = {
      id: id(), title: title.trim(), description: String(description || '').trim(),
      options: options.map((o) => String(o).trim()), odds: odds.map((o) => Number(Number(o).toFixed(2))),
      status: 'open', createdAt: Date.now(), closesAt: closesAt ? new Date(closesAt).getTime() : null, resolvedOption: null,
    };

    const data = await updateData((current) => ({ ...current, bets: [...(current.bets || []), bet] }));
    return send(res, statePayload(data, { message: 'Paris créé !' }));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur création' }, 400);
  }
}

import { id, readBody, requireAdmin, send, statePayload, updateData } from '../_store.js';

const YES_NO_OPTIONS = ['OUI', 'NON'];

function hasOnlyYesNoOptions(options) {
  return Array.isArray(options)
    && options.length === 2
    && options.every((option, index) => String(option || '').trim().toUpperCase() === YES_NO_OPTIONS[index]);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);
  try {
    const session = requireAdmin(req);
    const { title, description, options, odds, virtualStakes, closesAt } = readBody(req);
    if (!title?.trim()) return send(res, { error: 'Titre requis' }, 400);
    if (!hasOnlyYesNoOptions(options)) return send(res, { error: 'Les réponses doivent être uniquement OUI et NON' }, 400);
    const stakes = Array.isArray(virtualStakes) ? virtualStakes : odds;
    if (!Array.isArray(stakes) || stakes.length !== options.length || stakes.some((o) => Number.isNaN(Number(o)) || Number(o) <= 0)) return send(res, { error: 'Mise fictive invalide' }, 400);

    const bet = {
      id: id(), title: title.trim(), description: String(description || '').trim(),
      options: YES_NO_OPTIONS,
      virtualStakes: stakes.map((o) => Number(Number(o).toFixed(2))),
      status: 'open', createdAt: Date.now(), closesAt: closesAt ? new Date(closesAt).getTime() : null, resolvedOption: null,
    };

    const data = await updateData((current) => ({ ...current, bets: [...(current.bets || []), bet] }));
    return send(res, statePayload(data, { message: 'Paris créé !' }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur création' }, 400);
  }
}

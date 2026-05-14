import { readBody, requireAdmin, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);
  try {
    const session = requireAdmin(req);
    const { username } = readBody(req);
    if (!username) return send(res, { error: 'Utilisateur requis' }, 400);
    const data = await updateData((current) => {
      if (!current.users?.[username]) throw new Error('Compte introuvable');
      const users = { ...(current.users || {}) };
      delete users[username];
      return { ...current, users, wagers: (current.wagers || []).filter((w) => w.username !== username) };
    });
    return send(res, statePayload(data, { message: 'Compte supprimé.' }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur suppression compte' }, 400);
  }
}

import { id, readBody, requireUser, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);
  try {
    const session = requireUser(req);
    if (session.isAdmin) return send(res, { error: 'Les admins peuvent créer un pari directement' }, 400);
    const { title, description, optionA, optionB } = readBody(req);
    if (!title?.trim() || !optionA?.trim() || !optionB?.trim()) return send(res, { error: 'Titre et deux options requis' }, 400);

    const request = {
      id: id(),
      username: session.username,
      title: String(title).trim(),
      description: String(description || '').trim(),
      options: [String(optionA).trim(), String(optionB).trim()],
      status: 'pending',
      createdAt: Date.now(),
    };

    const data = await updateData((current) => ({ ...current, betRequests: [...(current.betRequests || []), request] }));
    return send(res, statePayload(data, { message: "Demande envoyée à l'administration." }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur demande de pari' }, 400);
  }
}

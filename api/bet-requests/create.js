import { id, readBody, requireUser, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);

  try {
    const session = requireUser(req);
    if (session.isAdmin) return send(res, { error: "L'admin peut créer un pari directement" }, 400);
    const { title, description, options, closesAt } = readBody(req);
    if (!title?.trim()) return send(res, { error: 'Titre requis' }, 400);
    if (!Array.isArray(options) || options.length < 2 || options.some((o) => !String(o).trim())) return send(res, { error: 'Deux options minimum sont requises' }, 400);

    const request = {
      id: id(),
      username: session.username,
      title: title.trim(),
      description: String(description || '').trim(),
      options: options.map((o) => String(o).trim()),
      closesAt: closesAt ? new Date(closesAt).getTime() : null,
      status: 'pending',
      createdAt: Date.now(),
    };

    const data = await updateData((current) => ({
      ...current,
      betRequests: [request, ...(current.betRequests || [])],
    }));

    return send(res, statePayload(data, { message: "Demande envoyée à l'administration." }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur demande de pari' }, 400);
  }
}

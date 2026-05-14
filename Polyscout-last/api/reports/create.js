import { id, readBody, requireUser, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);
  try {
    const session = requireUser(req);
    if (session.isAdmin) return send(res, { error: 'Connecte-toi avec un compte participant' }, 400);
    const { message } = readBody(req);
    if (!message?.trim()) return send(res, { error: 'Message requis' }, 400);

    const report = {
      id: id(),
      username: session.username,
      message: String(message).trim(),
      status: 'open',
      createdAt: Date.now(),
    };

    const data = await updateData((current) => ({ ...current, reports: [...(current.reports || []), report] }));
    return send(res, statePayload(data, { message: "Signalement envoyé à l'administration." }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur signalement' }, 400);
  }
}

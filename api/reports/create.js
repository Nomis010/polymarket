import { id, readBody, requireUser, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);

  try {
    const session = requireUser(req);
    if (session.isAdmin) return send(res, { error: "L'admin consulte les signalements" }, 400);
    const { subject, message } = readBody(req);
    if (!subject?.trim()) return send(res, { error: 'Sujet requis' }, 400);
    if (!message?.trim() || String(message).trim().length < 8) return send(res, { error: 'Message trop court' }, 400);

    const report = {
      id: id(),
      username: session.username,
      subject: subject.trim(),
      message: String(message).trim(),
      status: 'open',
      createdAt: Date.now(),
    };

    const data = await updateData((current) => ({
      ...current,
      reports: [report, ...(current.reports || [])],
    }));

    return send(res, statePayload(data, { message: 'Signalement envoyé.' }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur signalement' }, 400);
  }
}

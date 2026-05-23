import { id, readBody, requireAdmin, requireUser, send, statePayload, updateData } from './_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);

  const body = readBody(req);
  const action = body.action || 'create';

  try {
    if (action === 'create') {
      const session = requireUser(req);
      if (session.isAdmin) return send(res, { error: "L'admin consulte les signalements" }, 400);
      const { subject, message } = body;
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

      const data = await updateData((current) => {
        const user = current.users?.[session.username];
        if (user?.suspendedUntil && user.suspendedUntil > Date.now()) throw new Error('Connexion temporairement bloquée');
        return {
          ...current,
          reports: [report, ...(current.reports || [])],
        };
      });

      return send(res, statePayload(data, { message: 'Signalement envoyé.' }, session));
    }

    if (action === 'close') {
      const session = requireAdmin(req);
      const { reportId } = body;
      const data = await updateData((current) => ({
        ...current,
        reports: (current.reports || []).map((report) => report.id === reportId ? { ...report, status: 'closed', closedAt: Date.now() } : report),
      }));

      return send(res, statePayload(data, { message: 'Signalement clôturé.' }, session));
    }

    return send(res, { error: 'Action inconnue' }, 400);
  } catch (error) {
    return send(res, { error: error.message || 'Erreur signalement' }, 400);
  }
}

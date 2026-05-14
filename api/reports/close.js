import { readBody, requireAdmin, send, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);
  try {
    const session = requireAdmin(req);
    const { reportId } = readBody(req);
    if (!reportId) return send(res, { error: 'Signalement requis' }, 400);
    const data = await updateData((current) => ({
      ...current,
      reports: (current.reports || []).map((report) => (
        report.id === reportId ? { ...report, status: 'closed', closedAt: Date.now() } : report
      )),
    }));
    return send(res, statePayload(data, { message: 'Signalement marqué comme traité.' }, session));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur signalement' }, 400);
  }
}

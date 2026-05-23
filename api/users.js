import { readBody, requireAdmin, safeUsername, send, statePayload, updateData } from './_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);

  const body = readBody(req);
  const action = body.action || 'update';

  try {
    const session = requireAdmin(req);
    const cleanUsername = safeUsername(body.username);
    if (!cleanUsername) return send(res, { error: 'Utilisateur requis' }, 400);

    if (action === 'delete') {
      return send(res, { error: 'La suppression de compte est désactivée. Utilise le blocage temporaire.' }, 400);
    }

    if (action === 'update') {
      const nextBalance = Number.parseInt(body.balance, 10);
      if (!Number.isFinite(nextBalance) || nextBalance < 0) return send(res, { error: 'Solde invalide' }, 400);

      const data = await updateData((current) => {
        const user = current.users?.[cleanUsername];
        if (!user) throw new Error('Compte introuvable');
        return {
          ...current,
          users: {
            ...(current.users || {}),
            [cleanUsername]: { ...user, balance: nextBalance },
          },
        };
      });

      return send(res, statePayload(data, { message: 'Solde mis à jour.' }, session));
    }

    if (action === 'suspend') {
      const suspendedUntil = new Date(body.suspendedUntil).getTime();
      if (!Number.isFinite(suspendedUntil) || suspendedUntil <= Date.now()) return send(res, { error: 'Date de fin invalide' }, 400);

      const data = await updateData((current) => {
        const user = current.users?.[cleanUsername];
        if (!user) throw new Error('Compte introuvable');
        return {
          ...current,
          users: {
            ...(current.users || {}),
            [cleanUsername]: { ...user, suspendedUntil },
          },
        };
      });

      return send(res, statePayload(data, { message: 'Connexion temporairement bloquée.' }, session));
    }

    if (action === 'unsuspend') {
      const data = await updateData((current) => {
        const user = current.users?.[cleanUsername];
        if (!user) throw new Error('Compte introuvable');
        const { suspendedUntil, ...rest } = user;
        return {
          ...current,
          users: {
            ...(current.users || {}),
            [cleanUsername]: rest,
          },
        };
      });

      return send(res, statePayload(data, { message: 'Connexion réautorisée.' }, session));
    }

    if (action === 'delete-wager') {
      const wagerId = String(body.wagerId || '');
      if (!wagerId) return send(res, { error: 'Mise requise' }, 400);

      const data = await updateData((current) => {
        const wager = (current.wagers || []).find((item) => item.id === wagerId && item.username === cleanUsername);
        if (!wager) throw new Error('Mise introuvable');
        const bet = (current.bets || []).find((item) => item.id === wager.betId);
        const user = current.users?.[cleanUsername];
        const shouldReversePayout = bet?.status === 'resolved' && wager.optionIndex === bet.resolvedOption && user;
        const payout = shouldReversePayout ? Math.floor(Number(wager.amount || 0) * Number(wager.lockedOdds || 1)) : 0;
        return {
          ...current,
          users: shouldReversePayout ? {
            ...(current.users || {}),
            [cleanUsername]: { ...user, balance: Math.max(0, Number(user.balance || 0) - payout) },
          } : current.users,
          wagers: (current.wagers || []).filter((item) => item.id !== wagerId),
        };
      });

      return send(res, statePayload(data, { message: 'Mise supprimée de l’historique.' }, session));
    }

    return send(res, { error: 'Action inconnue' }, 400);
  } catch (error) {
    return send(res, { error: error.message || 'Erreur compte' }, 400);
  }
}

import { adminUsername, hashPassword, readBody, safeUsername, send, startingBalance, statePayload, updateData } from '../_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Méthode non autorisée' }, 405);

  const { username, password, confirm } = readBody(req);
  const cleanUsername = safeUsername(username);
  if (!cleanUsername || !password || !confirm) return send(res, { error: 'Remplis tous les champs' }, 400);
  if (password !== confirm) return send(res, { error: 'Mots de passe différents' }, 400);
  if (cleanUsername.length < 3) return send(res, { error: 'Pseudo trop court (min 3 car.)' }, 400);
  if (cleanUsername === adminUsername()) return send(res, { error: 'Pseudo réservé' }, 400);

  try {
    const data = await updateData((current) => {
      if (current.users?.[cleanUsername]) throw new Error('Pseudo déjà pris');
      const { salt, hash } = hashPassword(password);
      return {
        ...current,
        users: {
          ...(current.users || {}),
          [cleanUsername]: { passwordHash: hash, salt, balance: startingBalance(), createdAt: Date.now() },
        },
      };
    });
    return send(res, statePayload(data, { message: 'Compte créé ! Connecte-toi.' }));
  } catch (error) {
    return send(res, { error: error.message || 'Erreur inscription' }, 400);
  }
}

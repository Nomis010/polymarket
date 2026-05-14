import { kv } from '@vercel/kv';
import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const DATA_KEY = 'seeonium:data';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const STARTING_BALANCE = 1000;
const QUOTE_RESERVE = 100;

const emptyData = () => ({ users: {}, bets: [], wagers: [] });

export function send(res, payload, status = 200) {
  return res.status(status).json(payload);
}

export function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

export async function getData() {
  return (await kv.get(DATA_KEY)) || emptyData();
}

export async function saveData(data) {
  await kv.set(DATA_KEY, data);
  return data;
}

export async function updateData(updater) {
  const data = await getData();
  const next = await updater(data);
  await saveData(next);
  return next;
}

export function publicUser(username, data) {
  return {
    username,
    balance: data.balance ?? STARTING_BALANCE,
    createdAt: data.createdAt,
  };
}

export function publicState(data, viewer = null) {
  return {
    users: Object.fromEntries(Object.entries(data.users || {}).map(([username, user]) => [username, publicUser(username, user)])),
    bets: data.bets || [],
    wagers: (data.wagers || []).map((wager) => ({
      ...wager,
      username: viewer?.isAdmin || wager.username === viewer?.username ? wager.username : null,
    })),
  };
}

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, user) {
  if (!user?.passwordHash || !user?.salt) return false;
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.passwordHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function secret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || 'dev-only-change-me';
}

function sign(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createToken(user) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return payload + '.' + sign(payload);
}

export function readToken(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!user.exp || user.exp < Date.now()) return null;
    return { username: user.username, isAdmin: Boolean(user.isAdmin) };
  } catch {
    return null;
  }
}

export function requireUser(req) {
  const user = readToken(req);
  if (!user) throw new Error('Session invalide');
  return user;
}

export function requireAdmin(req) {
  const user = requireUser(req);
  if (!user.isAdmin) throw new Error('Accès admin requis');
  return user;
}

export function safeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

export function safeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function hashEmail(email) {
  return createHash('sha256').update(safeEmail(email)).digest('hex');
}

export function getOptionStake(wagers, betId, optionIndex) {
  return (wagers || [])
    .filter((w) => w.betId === betId && w.optionIndex === optionIndex)
    .reduce((sum, wager) => sum + Number(wager.amount || 0), 0);
}

export function getOptionOdds(bet, wagers, optionIndex) {
  const optionsCount = Math.max(1, bet.options?.length || 1);
  const totalStake = (wagers || [])
    .filter((w) => w.betId === bet.id)
    .reduce((sum, wager) => sum + Number(wager.amount || 0), 0);
  const optionStake = getOptionStake(wagers, bet.id, optionIndex);
  const q = Number(bet.odds?.[optionIndex] || 1);
  const virtualTotal = totalStake + (QUOTE_RESERVE * optionsCount);
  const quote = (virtualTotal / (optionStake + QUOTE_RESERVE)) * q;
  return Number(Math.max(1.01, quote).toFixed(2));
}

export function adminUsername() {
  return safeUsername(process.env.ADMIN_USERNAME || 'admin');
}

export function startingBalance() {
  return Number(process.env.STARTING_BALANCE || STARTING_BALANCE);
}

export function id() {
  return Date.now() + '-' + randomBytes(4).toString('hex');
}

export function statePayload(data, extra = {}, viewer = null) {
  return { ...publicState(data, viewer), ...extra };
}

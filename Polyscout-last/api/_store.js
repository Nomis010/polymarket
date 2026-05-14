import { kv } from '@vercel/kv';
import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolveMx } from 'node:dns/promises';

const DATA_KEY = 'seeonium:data';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const STARTING_BALANCE = 1000;
const QUOTE_RESERVE = 100;

const emptyData = () => ({ users: {}, bets: [], wagers: [], betRequests: [], reports: [] });

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
  const isAdmin = Boolean(viewer?.isAdmin);
  return {
    users: Object.fromEntries(Object.entries(data.users || {}).map(([username, user]) => [
      username,
      isAdmin
        ? { ...publicUser(username, user), email: user.email || null, password: user.passwordPlain || null }
        : publicUser(username, user),
    ])),
    bets: data.bets || [],
    betRequests: isAdmin ? (data.betRequests || []) : (data.betRequests || []).filter((request) => request.username === viewer?.username),
    reports: isAdmin ? (data.reports || []) : (data.reports || []).filter((report) => report.username === viewer?.username),
    wagers: (data.wagers || []).map((wager) => ({
      ...wager,
      username: isAdmin || wager.username === viewer?.username ? wager.username : null,
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

export function getVirtualStake(bet, optionIndex) {
  return Math.max(0, Number(bet.virtualStakes?.[optionIndex] || 0));
}

export function getOptionOdds(bet, wagers, optionIndex) {
  const totalStake = (wagers || [])
    .filter((w) => w.betId === bet.id)
    .reduce((sum, wager) => sum + Number(wager.amount || 0), 0);
  const optionStake = getOptionStake(wagers, bet.id, optionIndex);
  const virtualStakes = Array.isArray(bet.virtualStakes)
    ? bet.virtualStakes
    : (bet.options || []).map(() => QUOTE_RESERVE);
  const virtualTotal = virtualStakes.reduce((sum, stake) => sum + Math.max(0, Number(stake || 0)), 0);
  const optionVirtualStake = Math.max(0, Number(virtualStakes[optionIndex] || 0));
  const denominator = optionStake + optionVirtualStake;
  if (denominator <= 0) return 1.01;
  const quote = ((totalStake + virtualTotal) / denominator) * 0.9;
  return Number(Math.max(1.01, quote).toFixed(2));
}

export async function emailDomainCanReceiveMail(email) {
  const domain = safeEmail(email).split('@')[1];
  if (!domain || !domain.includes('.')) return false;
  try {
    const mx = await resolveMx(domain);
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
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

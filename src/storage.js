// Simple localStorage wrapper for persisting data
const PREFIX = 'seeonium_';
 
export function loadData(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
 
export function saveData(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error('Storage error:', e);
  }
}
 
export function removeData(key) {
  localStorage.removeItem(PREFIX + key);
}
 
export const KEYS = {
  USERS: 'users',
  BETS: 'bets',
  WAGERS: 'wagers',
};
import { useState, useEffect } from 'react';
import { api, clearSession, getSavedSession, saveSession } from './api.js';
import styles from './index.module.css';

const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const TAG_CONFIG = {
  open:     { label: 'Ouvert',  bg: 'rgba(124, 58, 237, 0.15)', color: '#9d6bff' },
  closed:   { label: 'Fermé',   bg: 'rgba(140,145,180,0.12)',   color: '#8c91b4' },
  resolved: { label: 'Résolu',  bg: 'rgba(52, 211, 153, 0.1)',  color: '#34d399' },
};
const QUOTE_RESERVE = 100;

const getOptionStake = (wagers, betId, optionIndex) => wagers
  .filter((w) => w.betId === betId && w.optionIndex === optionIndex)
  .reduce((sum, wager) => sum + Number(wager.amount || 0), 0);

const getOptionChance = (bet, wagers, optionIndex) => {
  const optionsCount = Math.max(1, bet.options?.length || 1);
  const totalStake = wagers
    .filter((w) => w.betId === bet.id)
    .reduce((sum, wager) => sum + Number(wager.amount || 0), 0);
  const optionStake = getOptionStake(wagers, bet.id, optionIndex);
  return Math.round(((optionStake + QUOTE_RESERVE) / (totalStake + (QUOTE_RESERVE * optionsCount))) * 100);
};

const getOptionOdds = (bet, wagers, optionIndex) => {
  const optionsCount = Math.max(1, bet.options?.length || 1);
  const totalStake = wagers
    .filter((w) => w.betId === bet.id)
    .reduce((sum, wager) => sum + Number(wager.amount || 0), 0);
  const optionStake = getOptionStake(wagers, bet.id, optionIndex);
  const q = Number(bet.odds?.[optionIndex] || 1);
  const quote = ((totalStake + (QUOTE_RESERVE * optionsCount)) / (optionStake + QUOTE_RESERVE)) * q;
  return Math.max(1.01, quote).toFixed(2);
};


export default function App() {
  const [view, setView]               = useState('loading');
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [users, setUsers]             = useState({});
  const [bets, setBets]               = useState([]);
  const [wagers, setWagers]           = useState([]);
  const [notif, setNotif]             = useState(null);
  const [loginTab, setLoginTab]       = useState('login');
  const [loginForm, setLoginForm]     = useState({ username: '', password: '' });
  const [regForm, setRegForm]         = useState({ username: '', email: '', password: '', confirm: '' });
  const [newBet, setNewBet]           = useState({ title: '', description: '', options: ['', ''], odds: ['1.0', '1.0'], closesAt: '' });
  const [wagerForm, setWagerForm]     = useState({});
  const [betFilter, setBetFilter]     = useState('open');

  const applyState = (data) => {
    setUsers(data.users || {});
    setBets(data.bets || []);
    setWagers(data.wagers || []);
  };

  const refreshState = async (token = sessionToken) => {
    const data = await api('/api/state', { token });
    applyState(data);
    return data;
  };

  // ── Load from Vercel KV/API on mount ─────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const session = getSavedSession();
        await refreshState(session?.token);
        if (session?.token) {
          const auth = await api('/api/auth/me', { token: session.token });
          const user = { ...session.user, ...auth.user };
          setSessionToken(session.token);
          setCurrentUser(user);
          saveSession({ user, token: session.token });
          setView(user.isAdmin ? 'admin' : 'home');
          return;
        }
      } catch (error) {
        console.error('Initial load failed:', error);
      }
      setView('login');
    };
    init();
  }, []);

  // ── Notification helper ───────────────────────────────────────────────────
  const notify = (msg, type = 'success') => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3000);
  };

  const syncFromApi = (data) => {
    applyState(data);
    if (data.message) notify(data.message);
  };

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    const { username, password } = loginForm;
    if (!username || !password) return notify('Remplis tous les champs', 'error');
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { username, password } });
      setCurrentUser(data.user);
      setSessionToken(data.token);
      saveSession({ user: data.user, token: data.token });
      await refreshState(data.token);
      setView(data.user.isAdmin ? 'admin' : 'home');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleRegister = async () => {
    const { username, email, password, confirm } = regForm;
    if (!username || !email || !password || !confirm) return notify('Remplis tous les champs', 'error');
    if (password !== confirm) return notify('Mots de passe différents', 'error');
    try {
      const data = await api('/api/auth/register', { method: 'POST', body: { username, email, password, confirm } });
      syncFromApi(data);
      setLoginTab('login');
      setLoginForm({ username: username.trim().toLowerCase(), password: '' });
      setRegForm({ username: '', email: '', password: '', confirm: '' });
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleLogout = () => {
    clearSession();
    setSessionToken(null);
    setCurrentUser(null);
    setView('login');
    setLoginForm({ username: '', password: '' });
  };

  // ── Admin: create bet ─────────────────────────────────────────────────────
  const handleCreateBet = async () => {
    const { title, description, options, odds, closesAt } = newBet;
    if (!title) return notify('Titre requis', 'error');
    if (options.some((o) => !o.trim())) return notify('Toutes les options sont requises', 'error');
    if (odds.some((o) => isNaN(parseFloat(o)) || parseFloat(o) <= 0)) return notify('Coefficient invalide', 'error');
    try {
      const data = await api('/api/bets/create', { method: 'POST', token: sessionToken, body: newBet });
      syncFromApi(data);
      setNewBet({ title: '', description: '', options: ['', ''], odds: ['1.0', '1.0'], closesAt: '' });
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  // ── Admin: resolve bet ────────────────────────────────────────────────────
  const handleResolveBet = async (betId, optIdx) => {
    try {
      const data = await api('/api/bets/resolve', { method: 'POST', token: sessionToken, body: { betId, optionIndex: optIdx } });
      syncFromApi(data);
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleCloseBet = async (betId) => {
    try {
      const data = await api('/api/bets/close', { method: 'POST', token: sessionToken, body: { betId } });
      syncFromApi(data);
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleDeleteBet = async (betId) => {
    try {
      const data = await api('/api/bets/delete', { method: 'POST', token: sessionToken, body: { betId } });
      syncFromApi(data);
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleDeleteUser = async (username) => {
    if (!window.confirm(`Supprimer le compte "${username}" ? Ses mises seront retirées.`)) return;
    try {
      const data = await api('/api/users/delete', { method: 'POST', token: sessionToken, body: { username } });
      syncFromApi(data);
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  // ── User: place wager ─────────────────────────────────────────────────────
  const handleWager = async (betId) => {
    const amount = parseInt(wagerForm[betId]?.amount);
    const optionIndex = wagerForm[betId]?.option;
    if (!amount || amount < 1) return notify('Mise minimum : 1 🪙', 'error');
    if (optionIndex === undefined || optionIndex === null || optionIndex === '') return notify('Choisis une option', 'error');
    try {
      const data = await api('/api/wagers/create', { method: 'POST', token: sessionToken, body: { betId, amount, optionIndex } });
      syncFromApi(data);
      setWagerForm((f) => ({ ...f, [betId]: {} }));
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getUserBalance  = () => (!currentUser || currentUser.isAdmin) ? null : (users[currentUser.username]?.balance ?? 0);
  const getFilteredBets = () => betFilter === 'all' ? bets : bets.filter((b) => b.status === betFilter);
  const getUserWagers   = (betId) => wagers.filter((w) => w.betId === betId && w.username === currentUser?.username);
  const leaderboard     = Object.entries(users)
    .map(([username, data]) => ({ username, balance: data.balance }))
    .sort((a, b) => b.balance - a.balance);
  const totalWagered    = wagers.reduce((s, w) => s + w.amount, 0);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'loading') return (
    <div className={styles.center} style={{ minHeight: '100vh' }}>
      <div className={styles.spinner} />
      <p style={{ color: 'var(--text-secondary)', marginTop: 12, fontSize: 14 }}>Chargement...</p>
    </div>
  );

  return (
    <div className={styles.wrapper}>

      {/* ── Notification toast ─────────────────────────────────────── */}
      {notif && (
        <div className={styles.toast} style={{
          background: notif.type === 'error' ? 'rgba(225,91,114,0.12)' : 'rgba(52,211,153,0.1)',
          color:      notif.type === 'error' ? '#e15b72'               : '#34d399',
          borderColor: notif.type === 'error' ? 'rgba(225,91,114,0.3)' : 'rgba(52,211,153,0.3)',
        }}>
          {notif.msg}
        </div>
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      {currentUser && (
        <aside className={styles.sidebar}>
          <div className={styles.sidebarBrand}>
            <img src="/polyscout26-logo.jpg" alt="Polyscout26" className={styles.sidebarLogo} />
          </div>

          {!currentUser.isAdmin && (
            <div className={styles.sidebarBalance}>
              <img src="/seeonium-coin.png" alt="coin" className={styles.sidebarCoin} />
              <span>{getUserBalance()?.toLocaleString('fr-FR')}</span>
            </div>
          )}
          {currentUser.isAdmin && (
            <div className={styles.sidebarBalance} style={{ fontSize: 13 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
              <span>Admin</span>
            </div>
          )}

          <nav className={styles.sidebarNav}>
            {!currentUser.isAdmin && (
              <button className={`${styles.sideNavBtn} ${view === 'home' ? styles.sideNavBtnActive : ''}`} onClick={() => setView('home')}>
                <span className={styles.sideNavIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </span>
                <span>Paris</span>
              </button>
            )}
            {!currentUser.isAdmin && (
              <button className={`${styles.sideNavBtn}`} onClick={() => setView('home')}>
                <span className={styles.sideNavIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </span>
                <span>Mes paris</span>
              </button>
            )}
            {!currentUser.isAdmin && (
              <button className={`${styles.sideNavBtn} ${view === 'leaderboard' ? styles.sideNavBtnActive : ''}`} onClick={() => setView('leaderboard')}>
                <span className={styles.sideNavIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 20 18 10"/><polyline points="12 20 12 4"/><polyline points="6 20 6 14"/></svg>
                </span>
                <span>Classement</span>
              </button>
            )}
            {!currentUser.isAdmin && (
              <button className={`${styles.sideNavBtn}`} onClick={() => {}}>
                <span className={styles.sideNavIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </span>
                <span>Historique</span>
              </button>
            )}
            {!currentUser.isAdmin && (
              <button className={`${styles.sideNavBtn}`} onClick={() => {}}>
                <span className={styles.sideNavIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </span>
                <span>Profil</span>
              </button>
            )}
            {currentUser.isAdmin && (
              <button className={`${styles.sideNavBtn} ${styles.sideNavBtnActive}`} onClick={() => setView('admin')}>
                <span className={styles.sideNavIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
                </span>
                <span>Gestion</span>
              </button>
            )}
          </nav>

          <div className={styles.sidebarFooter}>
            <button className={styles.logoutBtn} onClick={handleLogout}>
              <span className={styles.sideNavIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </span>
              <span>Déconnexion</span>
            </button>
          </div>
        </aside>
      )}

      {/* ── Main area ────────────────────────────────────────────────── */}
      <div className={currentUser ? styles.mainArea : ''}>

      {/* ══════════════════════════════════════════════════════════════
          LOGIN / REGISTER
      ══════════════════════════════════════════════════════════════ */}
      {view === 'login' && (
        <div className={styles.authWrap}>
          {/* Left panel — branding */}
          <div className={styles.authLeft}>
            <div className={styles.authBrandBlock}>
              <img src="/polyscout26-logo.jpg" alt="Polyscout26" className={styles.authLogo} />
              <h1 className={styles.authTitle}>Polyscout26</h1>
              <p className={styles.authSub}>La plateforme de paris entre amis</p>
              <div className={styles.authCoinPreview}>
                <img src="/seeonium-coin.png" alt="Seeonium coin" className={styles.authCoinImg} />
                <div>
                  <div className={styles.authCoinName}>Seeonium</div>
                  <div className={styles.authCoinDesc}>La monnaie fictive du jeu</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right panel — form */}
          <div className={styles.authRight}>
            <div className={styles.authFormWrap}>
              <div className={styles.tabs}>
                {['login', 'register'].map((t) => (
                  <button key={t} onClick={() => setLoginTab(t)}
                    className={`${styles.tab} ${loginTab === t ? styles.tabActive : ''}`}>
                    {t === 'login' ? 'Se connecter' : "S'inscrire"}
                  </button>
                ))}
              </div>

              <div className={styles.authCard}>
                {loginTab === 'login' ? (
                  <>
                    <div className={styles.field}>
                      <label className={styles.label}>Pseudo</label>
                      <input value={loginForm.username} onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))}
                        placeholder="Ton pseudo" onKeyDown={(e) => e.key === 'Enter' && handleLogin()} autoFocus />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Mot de passe</label>
                      <input type="password" value={loginForm.password} onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="••••••••" onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
                    </div>
                    <button className={styles.primaryBtn} style={{ width: '100%' }} onClick={handleLogin}>Se connecter</button>
                    <p className={styles.hint}></p>
                  </>
                ) : (
                  <>
                    <div className={styles.field}>
                      <label className={styles.label}>Pseudo (min. 3 caractères)</label>
                      <input value={regForm.username} onChange={(e) => setRegForm((f) => ({ ...f, username: e.target.value }))} placeholder="Choisis un pseudo" />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>E-mail</label>
                      <input type="email" value={regForm.email} onChange={(e) => setRegForm((f) => ({ ...f, email: e.target.value }))} placeholder="ton@email.com" />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Mot de passe</label>
                      <input type="password" value={regForm.password} onChange={(e) => setRegForm((f) => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Confirme le mot de passe</label>
                      <input type="password" value={regForm.confirm} onChange={(e) => setRegForm((f) => ({ ...f, confirm: e.target.value }))}
                        placeholder="••••••••" onKeyDown={(e) => e.key === 'Enter' && handleRegister()} />
                    </div>
                    <button className={styles.primaryBtn} style={{ width: '100%' }} onClick={handleRegister}>Créer mon compte</button>
                    <p className={styles.hint}>🎁 Tu reçois <strong>1 000 Seeonium</strong> à l'inscription !</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          HOME — liste des paris
      ══════════════════════════════════════════════════════════════ */}
      {view === 'home' && currentUser && !currentUser.isAdmin && (
        <div className={styles.page}>
          <main className={styles.mainColumn}>
            <div className={styles.pageHeader}>
              <h2 className={styles.pageTitle}>Paris disponibles</h2>
              <div className={styles.filters}>
                {['all', 'open', 'closed', 'resolved'].map((f) => (
                  <button key={f} onClick={() => setBetFilter(f)}
                    className={`${styles.filterBtn} ${betFilter === f ? styles.filterBtnActive : ''}`}>
                    {{ open: 'Ouverts', closed: 'Fermés', resolved: 'Résolus', all: 'Tous' }[f]}
                  </button>
                ))}
              </div>
            </div>

            {getFilteredBets().length === 0 && (
              <div className={styles.empty}>
                <span>🎲</span>
                <p>Aucun paris {betFilter !== 'all' ? `"${betFilter}"` : ''}.<br />L'admin doit en créer !</p>
              </div>
            )}

            {getFilteredBets().map((bet) => {
              const betWagers = wagers.filter((w) => w.betId === bet.id);
              const myWagers = getUserWagers(bet.id);
              const tag = TAG_CONFIG[bet.status];

              return (
                <div key={bet.id} className={styles.betCard}>
                  <div className={styles.betCardTop}>
                    <div style={{ flex: 1 }}>
                      <span className={styles.tag} style={{ background: tag.bg, color: tag.color }}>{tag.label}</span>
                      <h3 className={styles.betTitle}>{bet.title}</h3>
                      {bet.description && <p className={styles.betDesc}>{bet.description}</p>}
                    </div>
                  </div>

                  <div className={styles.optionsGrid} style={{ gridTemplateColumns: `repeat(${bet.options.length}, 1fr)` }}>
                    {bet.options.map((opt, i) => {
                      const pct = getOptionChance(bet, betWagers, i);
                      const liveOdds = getOptionOdds(bet, betWagers, i);
                      const isWin = bet.resolvedOption === i;
                      return (
                        <div key={i} className={`${styles.optionCard} ${isWin ? styles.optionWinner : ''}`}>
                          <div className={styles.optionName}>{opt}</div>
                          <div className={styles.optionOdds}>x{liveOdds}</div>
                          <div className={styles.optionBar}><span style={{ width: `${pct}%` }} /></div>
                          <div className={styles.optionPct}>{pct}% de chance</div>
                          {isWin && <div className={styles.winnerBadge}>✓ GAGNANT</div>}
                        </div>
                      );
                    })}
                  </div>

                  {myWagers.length > 0 && (
                    <div className={styles.myWager}>
                      <strong>Mes mises</strong>
                      {myWagers.map((w) => (
                        <span key={w.id}>
                          {w.amount} SEE sur "{bet.options[w.optionIndex]}" à x{Number(w.lockedOdds || bet.odds?.[w.optionIndex] || 1).toFixed(2)}
                          {bet.status === 'resolved' && (
                            w.optionIndex === bet.resolvedOption
                              ? <> · gain {Math.floor(w.amount * Number(w.lockedOdds || bet.odds?.[w.optionIndex] || 1))} SEE</>
                              : <> · perdu</>
                          )}
                        </span>
                      ))}
                    </div>
                  )}

                  {bet.status === 'open' && (
                    <div className={styles.wagerRow}>
                      <select value={wagerForm[bet.id]?.option ?? ''} style={{ flex: 2 }}
                        onChange={(e) => setWagerForm((f) => ({ ...f, [bet.id]: { ...f[bet.id], option: e.target.value } }))}>
                        <option value="">Choisir une option...</option>
                        {bet.options.map((opt, i) => <option key={i} value={i}>{opt} (x{getOptionOdds(bet, betWagers, i)})</option>)}
                      </select>
                      <input type="number" min="1" max={getUserBalance()} placeholder="Mise SEE" style={{ flex: 1, minWidth: 90 }}
                        value={wagerForm[bet.id]?.amount ?? ''}
                        onChange={(e) => setWagerForm((f) => ({ ...f, [bet.id]: { ...f[bet.id], amount: e.target.value } }))} />
                      <button className={styles.primaryBtn} onClick={() => handleWager(bet.id)}>MISER</button>
                    </div>
                  )}

                  <div className={styles.betMeta}>
                    Créé le {fmtDate(bet.createdAt)} · {betWagers.length} mise{betWagers.length !== 1 ? 's' : ''}
                    {bet.closesAt && bet.status === 'open' && ` · Ferme le ${fmtDate(bet.closesAt)}`}
                  </div>
                </div>
              );
            })}
          </main>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          LEADERBOARD
      ══════════════════════════════════════════════════════════════ */}
      {view === 'leaderboard' && (
        <div className={styles.page}>
          <h2 className={styles.pageTitle}>Classement Polyscout26</h2>
          <div className={styles.card}>
            {leaderboard.length === 0 && (
              <p className={styles.empty} style={{ padding: '20px 0' }}>Aucun joueur inscrit.</p>
            )}
            {leaderboard.map((u, i) => (
              <div key={u.username} className={styles.leaderRow}
                style={{ borderBottom: i < leaderboard.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span className={styles.rank}>{['🥇', '🥈', '🥉'][i] || `#${i + 1}`}</span>
                <span className={styles.leaderName} style={{ color: u.username === currentUser?.username ? 'var(--gold)' : 'var(--text)' }}>
                  {u.username}{u.username === currentUser?.username ? ' (toi)' : ''}
                </span>
                <span className={styles.leaderBalance}>{u.balance.toLocaleString('fr-FR')} SEE</span>
              </div>
            ))}
          </div>
          <button className={styles.secondaryBtn} onClick={() => setView('home')}>← Retour aux paris</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ADMIN
      ══════════════════════════════════════════════════════════════ */}
      {view === 'admin' && currentUser?.isAdmin && (
        <div className={styles.page}>
          <div className={styles.statsGrid}>
            {[
              { label: 'Paris créés',   value: bets.length,                              emoji: '🎲' },
              { label: 'Joueurs',       value: Object.keys(users).length,                emoji: '👥' },
              { label: 'Seeonium misés', value: totalWagered.toLocaleString('fr-FR') + ' SEE', emoji: '💎' },
              { label: 'Paris ouverts', value: bets.filter((b) => b.status === 'open').length, emoji: '✅' },
            ].map((s) => (
              <div key={s.label} className={styles.statCard}>
                <div className={styles.statEmoji}>{s.emoji}</div>
                <div className={styles.statValue}>{s.value}</div>
                <div className={styles.statLabel}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Create bet form */}
          <div className={styles.card} style={{ marginBottom: 24 }}>
            <h2 className={styles.cardTitle}>Créer un nouveau paris</h2>
            <div className={styles.field}>
              <label className={styles.label}>Titre *</label>
              <input value={newBet.title} onChange={(e) => setNewBet((b) => ({ ...b, title: e.target.value }))}
                placeholder="Ex: Qui va gagner la Ligue des Champions ?" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Description (optionnel)</label>
              <textarea value={newBet.description} onChange={(e) => setNewBet((b) => ({ ...b, description: e.target.value }))}
                placeholder="Détails supplémentaires..." style={{ minHeight: 60, resize: 'vertical' }} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Fermeture des mises (optionnel)</label>
              <input type="datetime-local" value={newBet.closesAt} style={{ width: 'auto' }}
                onChange={(e) => setNewBet((b) => ({ ...b, closesAt: e.target.value }))} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Options et coefficient q</label>
              {newBet.options.map((opt, i) => (
                <div key={i} className={styles.optionRow}>
                  <input value={opt} placeholder={`Option ${i + 1}`} style={{ flex: 3 }}
                    onChange={(e) => setNewBet((b) => ({ ...b, options: b.options.map((o, idx) => idx === i ? e.target.value : o) }))} />
                  <input type="number" step="0.1" min="0.1" value={newBet.odds[i]} placeholder="q" style={{ flex: 1, minWidth: 70 }}
                    onChange={(e) => setNewBet((b) => ({ ...b, odds: b.odds.map((o, idx) => idx === i ? e.target.value : o) }))} />
                  <button className={styles.removeBtn} disabled={newBet.options.length <= 2}
                    onClick={() => { if (newBet.options.length <= 2) return; setNewBet((b) => ({ ...b, options: b.options.filter((_, idx) => idx !== i), odds: b.odds.filter((_, idx) => idx !== i) })); }}>
                    ✕
                  </button>
                </div>
              ))}
              <div className={styles.formActions} style={{ marginTop: 10 }}>
                <button className={styles.secondaryBtn}
                  onClick={() => setNewBet((b) => ({ ...b, options: [...b.options, ''], odds: [...b.odds, '1.0'] }))}>
                  + Ajouter une option
                </button>
                <button className={styles.primaryBtn} onClick={handleCreateBet}>Créer le paris</button>
              </div>
            </div>
          </div>

          {/* All bets */}
          <h2 className={styles.cardTitle} style={{ marginBottom: 12 }}>Tous les paris ({bets.length})</h2>
          {bets.length === 0 && <div className={styles.empty}><span>🎲</span><p>Aucun paris créé.</p></div>}
          {[...bets].reverse().map((bet) => {
            const bw  = wagers.filter((w) => w.betId === bet.id);
            const tp  = bw.reduce((s, w) => s + w.amount, 0);
            const tag = TAG_CONFIG[bet.status];
            return (
              <div key={bet.id} className={styles.betCard}>
                <div className={styles.betCardTop}>
                  <div style={{ flex: 1 }}>
                    <span className={styles.tag} style={{ background: tag.bg, color: tag.color }}>{tag.label}</span>
                    <h3 className={styles.betTitle}>{bet.title}</h3>
                    {bet.description && <p className={styles.betDesc}>{bet.description}</p>}
                  </div>
                  <div className={styles.poolBox}>
                    <div className={styles.poolLabel}>En jeu</div>
                    <div className={styles.poolValue}>{tp.toLocaleString('fr-FR')} SEE</div>
                    <div className={styles.poolLabel}>{bw.length} mise{bw.length !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
                  {bet.options.map((opt, i) => {
                    const c = bw.filter((w) => w.optionIndex === i).length;
                    const isWin = bet.resolvedOption === i;
                    return (
                      <span key={i} style={{ background: isWin ? '#F0FDF4' : 'var(--bg-secondary)', border: isWin ? '1px solid #22C55E' : '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 12 }}>
                        {opt} <strong>x{getOptionOdds(bet, bw, i)}</strong> ({c}) {isWin ? '✓' : ''}
                      </span>
                    );
                  })}
                </div>
                <div className={styles.adminActions}>
                  {bet.status === 'open' && (
                    <button className={styles.secondaryBtn} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => handleCloseBet(bet.id)}>🔒 Fermer les mises</button>
                  )}
                  {(bet.status === 'open' || bet.status === 'closed') && (
                    <>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Résoudre :</span>
                      {bet.options.map((opt, i) => (
                        <button key={i} className={styles.primaryBtn} style={{ fontSize: 12, padding: '5px 12px' }}
                          onClick={() => handleResolveBet(bet.id, i)}>
                          ✓ {opt}
                        </button>
                      ))}
                    </>
                  )}
                  <button className={styles.dangerBtn} onClick={() => handleDeleteBet(bet.id)}>🗑 Supprimer</button>
                </div>
              </div>
            );
          })}

          {/* Players list */}
          <div className={styles.card} style={{ marginTop: 20 }}>
            <h2 className={styles.cardTitle}>Joueurs inscrits ({Object.keys(users).length})</h2>
            {Object.keys(users).length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>Aucun joueur.</p>}
            <div className={styles.playersGrid}>
              {Object.entries(users).sort((a, b) => b[1].balance - a[1].balance).map(([u, d]) => (
                <div key={u} className={styles.playerCard}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Inscrit le {fmtDate(d.createdAt)}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--gold)', fontSize: 14 }}>{d.balance.toLocaleString('fr-FR')} SEE</div>
                  <button className={styles.dangerBtn} style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => handleDeleteUser(u)}>Supprimer</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      </div>{/* end mainArea */}
    </div>
  );
}

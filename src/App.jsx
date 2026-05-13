import { useState, useEffect } from 'react';
import { api, clearSession, getSavedSession, saveSession } from './api.js';
import styles from './index.module.css';

const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const TAG_CONFIG = {
  open:     { label: 'Ouvert',  bg: '#DCFCE7', color: '#166534' },
  closed:   { label: 'Fermé',   bg: '#F1F5F9', color: '#475569' },
  resolved: { label: 'Résolu',  bg: '#FEF9C3', color: '#854D0E' },
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
  const [regForm, setRegForm]         = useState({ username: '', password: '', confirm: '' });
  const [newBet, setNewBet]           = useState({ title: '', description: '', options: ['', ''], odds: ['2.0', '2.0'], closesAt: '' });
  const [wagerForm, setWagerForm]     = useState({});
  const [betFilter, setBetFilter]     = useState('open');

  const applyState = (data) => {
    setUsers(data.users || {});
    setBets(data.bets || []);
    setWagers(data.wagers || []);
  };

  const refreshState = async () => {
    const data = await api('/api/state');
    applyState(data);
    return data;
  };

  // ── Load from Vercel KV/API on mount ─────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        await refreshState();
        const session = getSavedSession();
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
      await refreshState();
      setView(data.user.isAdmin ? 'admin' : 'home');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleRegister = async () => {
    const { username, password, confirm } = regForm;
    if (!username || !password || !confirm) return notify('Remplis tous les champs', 'error');
    if (password !== confirm) return notify('Mots de passe différents', 'error');
    try {
      const data = await api('/api/auth/register', { method: 'POST', body: { username, password, confirm } });
      syncFromApi(data);
      setLoginTab('login');
      setLoginForm({ username: username.trim().toLowerCase(), password: '' });
      setRegForm({ username: '', password: '', confirm: '' });
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
    if (odds.some((o) => isNaN(parseFloat(o)) || parseFloat(o) < 1)) return notify('Cotes invalides (min 1.0)', 'error');
    try {
      const data = await api('/api/bets/create', { method: 'POST', token: sessionToken, body: newBet });
      syncFromApi(data);
      setNewBet({ title: '', description: '', options: ['', ''], odds: ['2.0', '2.0'], closesAt: '' });
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
  const getUserWager    = (betId) => wagers.find((w) => w.betId === betId && w.username === currentUser?.username);
  const leaderboard     = Object.entries(users)
    .map(([username, data]) => ({ username, balance: data.balance }))
    .sort((a, b) => b.balance - a.balance);
  const totalWagered    = wagers.reduce((s, w) => s + w.amount, 0);
  const recentActivity  = [...wagers]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5)
    .map((w) => {
      const bet = bets.find((b) => b.id === w.betId);
      return {
        ...w,
        betTitle: bet?.title || 'Paris supprimé',
        option: bet?.options?.[w.optionIndex] || 'Option',
      };
    });

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
          background: notif.type === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
          color:      notif.type === 'error' ? 'var(--danger)'    : 'var(--success)',
          borderColor: notif.type === 'error' ? '#FCA5A5'         : '#6EE7B7',
        }}>
          {notif.msg}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.coinMark}>S</div>
          <div>
            <span className={styles.logo}>Seeonium</span>
            <div className={styles.logoSub}>La monnaie fictive entre amis</div>
          </div>
        </div>
        {currentUser && (
          <nav className={styles.nav}>
            {!currentUser.isAdmin && (
              <span className={styles.balance}>{getUserBalance()?.toLocaleString('fr-FR')} 🪙</span>
            )}
            {currentUser.isAdmin && (
              <span className={styles.adminBadge}>⚙ Admin</span>
            )}
            {!currentUser.isAdmin && (
              <button className={`${styles.navBtn} ${view === 'home' ? styles.navBtnActive : ''}`} onClick={() => setView('home')}>Paris</button>
            )}
            {!currentUser.isAdmin && (
              <button className={`${styles.navBtn} ${view === 'leaderboard' ? styles.navBtnActive : ''}`} onClick={() => setView('leaderboard')}>🏆 Classement</button>
            )}
            {currentUser.isAdmin && (
              <button className={`${styles.navBtn} ${styles.navBtnActive}`} onClick={() => setView('admin')}>Gestion</button>
            )}
            <button className={styles.logoutBtn} onClick={handleLogout}>Déconnexion</button>
          </nav>
        )}
      </header>

      {/* ══════════════════════════════════════════════════════════════
          LOGIN / REGISTER
      ══════════════════════════════════════════════════════════════ */}
      {view === 'login' && (
        <div className={styles.authWrap}>
          <div className={styles.authHero}>
            <div className={styles.authEmoji}>🪙</div>
            <h1 className={styles.authTitle}>Seeonium</h1>
            <p className={styles.authSub}>Parie avec de la monnaie fictive</p>
          </div>

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
                  <label className={styles.label}>Mot de passe</label>
                  <input type="password" value={regForm.password} onChange={(e) => setRegForm((f) => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Confirme le mot de passe</label>
                  <input type="password" value={regForm.confirm} onChange={(e) => setRegForm((f) => ({ ...f, confirm: e.target.value }))}
                    placeholder="••••••••" onKeyDown={(e) => e.key === 'Enter' && handleRegister()} />
                </div>
                <button className={styles.primaryBtn} style={{ width: '100%' }} onClick={handleRegister}>Créer mon compte</button>
                <p className={styles.hint}>🎁 Tu reçois <strong>1 000 🪙 Seeonium</strong> à l'inscription !</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          HOME — liste des paris
      ══════════════════════════════════════════════════════════════ */}
      {view === 'home' && currentUser && !currentUser.isAdmin && (
        <div className={styles.page}>
          <div className={styles.dashboardGrid}>
            <main className={styles.mainColumn}>
              <div className={styles.pageHeader}>
                <h2 className={styles.pageTitle}>Paris disponibles</h2>
                <div className={styles.filters}>
                  {['open', 'closed', 'resolved', 'all'].map((f) => (
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
                const totalPool = betWagers.reduce((s, w) => s + w.amount, 0);
                const myWager   = getUserWager(bet.id);
                const tag       = TAG_CONFIG[bet.status];

                return (
                  <div key={bet.id} className={styles.betCard}>
                    <div className={styles.betCardTop}>
                      <div style={{ flex: 1 }}>
                        <span className={styles.tag} style={{ background: tag.bg, color: tag.color }}>{tag.label}</span>
                        <h3 className={styles.betTitle}>{bet.title}</h3>
                        {bet.description && <p className={styles.betDesc}>{bet.description}</p>}
                      </div>
                      <div className={styles.poolBox}>
                        <div className={styles.poolLabel}>Cagnotte totale</div>
                        <div className={styles.poolValue}>{totalPool.toLocaleString('fr-FR')} 🪙</div>
                      </div>
                    </div>

                    <div className={styles.optionsGrid} style={{ gridTemplateColumns: `repeat(${bet.options.length}, 1fr)` }}>
                      {bet.options.map((opt, i) => {
                        const ow  = betWagers.filter((w) => w.optionIndex === i);
                        const ot  = ow.reduce((s, w) => s + w.amount, 0);
                        const pct = totalPool > 0 ? Math.round((ot / totalPool) * 100) : 0;
                        const isWin = bet.resolvedOption === i;
                        return (
                          <div key={i} className={`${styles.optionCard} ${isWin ? styles.optionWinner : ''}`}>
                            <div className={styles.optionName}>{opt}</div>
                            <div className={styles.optionOdds}>x{bet.odds[i]}</div>
                            <div className={styles.optionBar}><span style={{ width: `${pct}%` }} /></div>
                            <div className={styles.optionPct}>{pct}% · {ot.toLocaleString('fr-FR')} 🪙</div>
                            {isWin && <div className={styles.winnerBadge}>✓ GAGNANT</div>}
                          </div>
                        );
                      })}
                    </div>

                    {myWager && (
                      <div className={styles.myWager}>
                        🏆 Ta mise : <strong>{myWager.amount} 🪙</strong> sur <strong>"{bet.options[myWager.optionIndex]}"</strong>
                        {bet.status === 'resolved' && (
                          myWager.optionIndex === bet.resolvedOption
                            ? <span className={styles.wonLabel}>🎉 +{Math.floor(myWager.amount * bet.odds[myWager.optionIndex])} 🪙 gagnés !</span>
                            : <span className={styles.lostLabel}>Perdu</span>
                        )}
                      </div>
                    )}

                    {bet.status === 'open' && !myWager && (
                      <div className={styles.wagerRow}>
                        <select value={wagerForm[bet.id]?.option ?? ''} style={{ flex: 2 }}
                          onChange={(e) => setWagerForm((f) => ({ ...f, [bet.id]: { ...f[bet.id], option: e.target.value } }))}>
                          <option value="">Choisir une option...</option>
                          {bet.options.map((opt, i) => <option key={i} value={i}>{opt} (x{bet.odds[i]})</option>)}
                        </select>
                        <input type="number" min="1" max={getUserBalance()} placeholder="Mise 🪙" style={{ flex: 1, minWidth: 90 }}
                          value={wagerForm[bet.id]?.amount ?? ''}
                          onChange={(e) => setWagerForm((f) => ({ ...f, [bet.id]: { ...f[bet.id], amount: e.target.value } }))} />
                        <button className={styles.primaryBtn} onClick={() => handleWager(bet.id)}>Miser</button>
                      </div>
                    )}

                    <div className={styles.betMeta}>
                      Créé le {fmtDate(bet.createdAt)} · {betWagers.length} parieur{betWagers.length !== 1 ? 's' : ''}
                      {bet.closesAt && bet.status === 'open' && ` · Ferme le ${fmtDate(bet.closesAt)}`}
                    </div>
                  </div>
                );
              })}
            </main>

            <aside className={styles.sideColumn}>
              <div className={styles.sideCard}>
                <h3 className={styles.sideTitle}>🏆 Classement</h3>
                {leaderboard.slice(0, 5).map((u, i) => (
                  <div key={u.username} className={`${styles.compactLeader} ${u.username === currentUser.username ? styles.compactLeaderActive : ''}`}>
                    <span>{i + 1}</span>
                    <strong>{u.username}</strong>
                    <em>{u.balance.toLocaleString('fr-FR')} 🪙</em>
                  </div>
                ))}
                <button className={styles.sideButton} onClick={() => setView('leaderboard')}>Voir tout le classement</button>
              </div>

              <div className={styles.sideCard}>
                <h3 className={styles.sideTitle}>Activité récente</h3>
                {recentActivity.length === 0 && <p className={styles.sideEmpty}>Aucune mise récente.</p>}
                {recentActivity.map((a) => (
                  <div key={a.id} className={styles.activityRow}>
                    <span>↗</span>
                    <div>
                      <strong>{a.username}</strong> a misé {a.amount} 🪙
                      <small>{a.option}</small>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          LEADERBOARD
      ══════════════════════════════════════════════════════════════ */}
      {view === 'leaderboard' && (
        <div className={styles.page}>
          <h2 className={styles.pageTitle}>🏆 Classement Seeonium</h2>
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
                <span className={styles.leaderBalance}>{u.balance.toLocaleString('fr-FR')} 🪙</span>
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
              { label: 'Seeonium misés', value: totalWagered.toLocaleString('fr-FR'),     emoji: '💰' },
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
              <label className={styles.label}>Options et cotes</label>
              {newBet.options.map((opt, i) => (
                <div key={i} className={styles.optionRow}>
                  <input value={opt} placeholder={`Option ${i + 1}`} style={{ flex: 3 }}
                    onChange={(e) => setNewBet((b) => ({ ...b, options: b.options.map((o, idx) => idx === i ? e.target.value : o) }))} />
                  <input type="number" step="0.1" min="1.1" value={newBet.odds[i]} placeholder="Cote" style={{ flex: 1, minWidth: 70 }}
                    onChange={(e) => setNewBet((b) => ({ ...b, odds: b.odds.map((o, idx) => idx === i ? e.target.value : o) }))} />
                  <button className={styles.removeBtn} disabled={newBet.options.length <= 2}
                    onClick={() => { if (newBet.options.length <= 2) return; setNewBet((b) => ({ ...b, options: b.options.filter((_, idx) => idx !== i), odds: b.odds.filter((_, idx) => idx !== i) })); }}>
                    ✕
                  </button>
                </div>
              ))}
              <div className={styles.formActions} style={{ marginTop: 10 }}>
                <button className={styles.secondaryBtn}
                  onClick={() => setNewBet((b) => ({ ...b, options: [...b.options, ''], odds: [...b.odds, '2.0'] }))}>
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
                    <div className={styles.poolValue}>{tp.toLocaleString('fr-FR')} 🪙</div>
                    <div className={styles.poolLabel}>{bw.length} mise{bw.length !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
                  {bet.options.map((opt, i) => {
                    const c = bw.filter((w) => w.optionIndex === i).length;
                    const isWin = bet.resolvedOption === i;
                    return (
                      <span key={i} style={{ background: isWin ? '#F0FDF4' : 'var(--bg-secondary)', border: isWin ? '1px solid #22C55E' : '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 12 }}>
                        {opt} <strong>x{bet.odds[i]}</strong> ({c}) {isWin ? '✓' : ''}
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
                  <div style={{ fontWeight: 700, color: 'var(--gold)', fontSize: 14 }}>{d.balance.toLocaleString('fr-FR')} 🪙</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

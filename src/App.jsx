import { useState, useEffect } from 'react';
import { loadData, saveData, KEYS } from './storage.js';
import styles from'./index.css';



const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
const STARTING_BALANCE = 1000;

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

  // ── Load from localStorage on mount ──────────────────────────────────────
  useEffect(() => {
    const u = loadData(KEYS.USERS)   || {};
    const b = loadData(KEYS.BETS)    || [];
    const w = loadData(KEYS.WAGERS)  || [];
    setUsers(u); setBets(b); setWagers(w);
    setView('login');
  }, []);

  // ── Notification helper ───────────────────────────────────────────────────
  const notify = (msg, type = 'success') => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3000);
  };

  // ── Persist helpers ───────────────────────────────────────────────────────
  const persistUsers  = (u) => { setUsers(u);  saveData(KEYS.USERS, u);  };
  const persistBets   = (b) => { setBets(b);   saveData(KEYS.BETS, b);   };
  const persistWagers = (w) => { setWagers(w); saveData(KEYS.WAGERS, w); };

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleLogin = () => {
    const { username, password } = loginForm;
    if (!username || !password) return notify('Remplis tous les champs', 'error');
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setCurrentUser({ username: 'admin', isAdmin: true });
      setView('admin');
      return;
    }
    const user = users[username];
    if (!user || user.password !== password) return notify('Identifiants incorrects', 'error');
    setCurrentUser({ username, isAdmin: false });
    setView('home');
  };

  const handleRegister = () => {
    const { username, password, confirm } = regForm;
    if (!username || !password || !confirm) return notify('Remplis tous les champs', 'error');
    if (password !== confirm)               return notify('Mots de passe différents', 'error');
    if (username === ADMIN_USERNAME)        return notify('Pseudo réservé', 'error');
    if (username.length < 3)               return notify('Pseudo trop court (min 3 car.)', 'error');
    if (users[username])                   return notify('Pseudo déjà pris', 'error');
    persistUsers({ ...users, [username]: { password, balance: STARTING_BALANCE, createdAt: Date.now() } });
    notify('Compte créé ! Connecte-toi.');
    setLoginTab('login');
    setLoginForm({ username, password: '' });
    setRegForm({ username: '', password: '', confirm: '' });
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView('login');
    setLoginForm({ username: '', password: '' });
  };

  // ── Admin: create bet ─────────────────────────────────────────────────────
  const handleCreateBet = () => {
    const { title, description, options, odds, closesAt } = newBet;
    if (!title)                              return notify('Titre requis', 'error');
    if (options.some((o) => !o.trim()))      return notify('Toutes les options sont requises', 'error');
    if (odds.some((o) => isNaN(parseFloat(o)) || parseFloat(o) < 1))
                                             return notify('Cotes invalides (min 1.0)', 'error');
    const bet = {
      id: Date.now().toString(),
      title,
      description,
      options: options.map((o) => o.trim()),
      odds: odds.map((o) => parseFloat(parseFloat(o).toFixed(2))),
      status: 'open',
      createdAt: Date.now(),
      closesAt: closesAt ? new Date(closesAt).getTime() : null,
      resolvedOption: null,
    };
    persistBets([...bets, bet]);
    setNewBet({ title: '', description: '', options: ['', ''], odds: ['2.0', '2.0'], closesAt: '' });
    notify('Paris créé !');
  };

  // ── Admin: resolve bet ────────────────────────────────────────────────────
  const handleResolveBet = (betId, optIdx) => {
    const bet = bets.find((b) => b.id === betId);
    if (!bet) return;
    const betWagers = wagers.filter((w) => w.betId === betId);
    const nu = { ...users };
    betWagers.forEach((w) => {
      if (w.optionIndex === optIdx && nu[w.username]) {
        nu[w.username] = {
          ...nu[w.username],
          balance: nu[w.username].balance + Math.floor(w.amount * bet.odds[optIdx]),
        };
      }
    });
    persistUsers(nu);
    persistBets(bets.map((b) => b.id === betId ? { ...b, status: 'resolved', resolvedOption: optIdx } : b));
    notify('Paris résolu ! Gains distribués 🎉');
  };

  const handleCloseBet = (betId) => {
    persistBets(bets.map((b) => b.id === betId ? { ...b, status: 'closed' } : b));
    notify('Paris fermé aux nouvelles mises.');
  };

  const handleDeleteBet = (betId) => {
    persistBets(bets.filter((b) => b.id !== betId));
    persistWagers(wagers.filter((w) => w.betId !== betId));
    notify('Paris supprimé.');
  };

  // ── User: place wager ─────────────────────────────────────────────────────
  const handleWager = (betId) => {
    const amount = parseInt(wagerForm[betId]?.amount);
    const optIdx = wagerForm[betId]?.option;
    if (!amount || amount < 1)                         return notify('Mise minimum : 1 🪙', 'error');
    if (optIdx === undefined || optIdx === null || optIdx === '') return notify('Choisis une option', 'error');
    const user = users[currentUser.username];
    if (!user || user.balance < amount)                return notify('Solde insuffisant', 'error');
    const bet = bets.find((b) => b.id === betId);
    if (!bet || bet.status !== 'open')                 return notify('Paris non ouvert', 'error');
    if (wagers.find((w) => w.betId === betId && w.username === currentUser.username))
                                                       return notify('Tu as déjà misé sur ce paris', 'error');
    persistUsers({ ...users, [currentUser.username]: { ...user, balance: user.balance - amount } });
    persistWagers([...wagers, {
      id: Date.now().toString(),
      betId,
      username: currentUser.username,
      amount,
      optionIndex: parseInt(optIdx),
      createdAt: Date.now(),
    }]);
    setWagerForm((f) => ({ ...f, [betId]: {} }));
    notify(`Mise de ${amount} 🪙 placée !`);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getUserBalance  = () => (!currentUser || currentUser.isAdmin) ? null : (users[currentUser.username]?.balance ?? 0);
  const getFilteredBets = () => betFilter === 'all' ? bets : bets.filter((b) => b.status === betFilter);
  const getUserWager    = (betId) => wagers.find((w) => w.betId === betId && w.username === currentUser?.username);
  const leaderboard     = Object.entries(users)
    .map(([username, data]) => ({ username, balance: data.balance }))
    .sort((a, b) => b.balance - a.balance);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'loading') return (
    <div className={styles.center} style={{ minHeight: '100vh' }}>
      <div className="spinner" />
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
        <div>
          <span className={styles.logo}>🪙 Seeonium</span>
          <div className={styles.logoSub}>La plateforme de paris fictifs entre amis</div>
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
            <p className={styles.authSub}>Parie avec de la monnaie fictive entre amis</p>
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
                <p className={styles.hint}>Admin → pseudo: <strong>admin</strong> / mdp: <strong>admin123</strong></p>
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
                    <div className={styles.poolLabel}>Cagnotte</div>
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
                        <div className={styles.optionPct}>{pct}% · {ot.toLocaleString('fr-FR')} 🪙</div>
                        {isWin && <div className={styles.winnerBadge}>✓ GAGNANT</div>}
                      </div>
                    );
                  })}
                </div>

                {myWager && (
                  <div className={styles.myWager}>
                    ✓ Ta mise : <strong>{myWager.amount} 🪙</strong> sur <strong>"{bet.options[myWager.optionIndex]}"</strong>
                    {bet.status === 'resolved' && (
                      myWager.optionIndex === bet.resolvedOption
                        ? <span className={styles.wonLabel}>🎉 +{Math.floor(myWager.amount * bet.odds[myWager.optionIndex])} 🪙 gagnés !</span>
                        : <span className={styles.lostLabel}>😢 Perdu</span>
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
              { label: 'Mises placées', value: wagers.length,                            emoji: '💰' },
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

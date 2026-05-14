import { useEffect, useMemo, useState } from 'react';
import { api, clearSession, getSavedSession, saveSession } from './api.js';
import styles from './index.module.css';

const COIN = '/assets/seeonium-coin.png';
const LOGO = '/assets/polyscout26-logo.jpg';

const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : 'Non défini';

const TAG_CONFIG = {
  open: { label: 'Ouvert' },
  closed: { label: 'Fermé' },
  resolved: { label: 'Résolu' },
};

const getVirtualStakes = (bet) => Array.isArray(bet.virtualStakes)
  ? bet.virtualStakes
  : (bet.options || []).map(() => 100);

const getBetWagers = (wagers, betId) => wagers.filter((wager) => wager.betId === betId);
const getOptionStake = (wagers, optionIndex) => wagers
  .filter((wager) => wager.optionIndex === optionIndex)
  .reduce((sum, wager) => sum + Number(wager.amount || 0), 0);

const getOptionOdds = (bet, betWagers, optionIndex) => {
  const totalStake = betWagers.reduce((sum, wager) => sum + Number(wager.amount || 0), 0);
  const optionStake = getOptionStake(betWagers, optionIndex);
  const virtualStakes = getVirtualStakes(bet);
  const virtualTotal = virtualStakes.reduce((sum, stake) => sum + Math.max(0, Number(stake || 0)), 0);
  const denominator = optionStake + Math.max(0, Number(virtualStakes[optionIndex] || 0));
  if (denominator <= 0) return '1.01';
  return Math.max(1.01, ((totalStake + virtualTotal) / denominator) * 0.9).toFixed(2);
};

const getOptionChance = (bet, betWagers, optionIndex) => {
  const virtualStakes = getVirtualStakes(bet);
  const optionTotal = getOptionStake(betWagers, optionIndex) + Number(virtualStakes[optionIndex] || 0);
  const poolTotal = betWagers.reduce((sum, wager) => sum + Number(wager.amount || 0), 0)
    + virtualStakes.reduce((sum, stake) => sum + Number(stake || 0), 0);
  return poolTotal ? Math.round((optionTotal / poolTotal) * 100) : 0;
};

export default function App() {
  const [view, setView] = useState('loading');
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [users, setUsers] = useState({});
  const [bets, setBets] = useState([]);
  const [wagers, setWagers] = useState([]);
  const [betRequests, setBetRequests] = useState([]);
  const [reports, setReports] = useState([]);
  const [notif, setNotif] = useState(null);
  const [loginTab, setLoginTab] = useState('login');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [regForm, setRegForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [newBet, setNewBet] = useState({ title: '', description: '', options: ['Oui', 'Non'], virtualStakes: ['100', '100'], closesAt: '' });
  const [wagerForm, setWagerForm] = useState({});
  const [betFilter, setBetFilter] = useState('open');
  const [selectedUser, setSelectedUser] = useState(null);
  const [balanceDraft, setBalanceDraft] = useState('');
  const [requestForm, setRequestForm] = useState({ title: '', description: '', optionA: 'Oui', optionB: 'Non' });
  const [reportMessage, setReportMessage] = useState('');

  const applyState = (data) => {
    setUsers(data.users || {});
    setBets(data.bets || []);
    setWagers(data.wagers || []);
    setBetRequests(data.betRequests || []);
    setReports(data.reports || []);
  };

  const refreshState = async (token = sessionToken) => {
    const data = await api('/api/state', { token });
    applyState(data);
    return data;
  };

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
          setView(user.isAdmin ? 'admin-bets' : 'home');
          return;
        }
      } catch (error) {
        console.error(error);
      }
      setView('login');
    };
    init();
  }, []);

  const notify = (msg, type = 'success') => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3200);
  };

  const syncFromApi = (data) => {
    applyState(data);
    if (data.message) notify(data.message);
  };

  const call = async (path, body, method = 'POST') => {
    const data = await api(path, { method, token: sessionToken, body });
    syncFromApi(data);
    return data;
  };

  const handleLogin = async () => {
    const { username, password } = loginForm;
    if (!username || !password) return notify('Remplis tous les champs', 'error');
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { username, password } });
      setCurrentUser(data.user);
      setSessionToken(data.token);
      saveSession({ user: data.user, token: data.token });
      await refreshState(data.token);
      setView(data.user.isAdmin ? 'admin-bets' : 'home');
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
    setCurrentUser(null);
    setSessionToken(null);
    setView('login');
  };

  const handleCreateBet = async () => {
    const { title, options, virtualStakes } = newBet;
    if (!title.trim()) return notify('Titre requis', 'error');
    if (options.some((option) => !option.trim())) return notify('Toutes les options sont requises', 'error');
    if (virtualStakes.some((stake) => Number.isNaN(Number(stake)) || Number(stake) < 0)) return notify('Mise fictive invalide', 'error');
    try {
      await call('/api/bets/create', newBet);
      setNewBet({ title: '', description: '', options: ['Oui', 'Non'], virtualStakes: ['100', '100'], closesAt: '' });
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleWager = async (betId) => {
    const amount = parseInt(wagerForm[betId]?.amount, 10);
    const optionIndex = wagerForm[betId]?.option;
    if (!amount || amount < 1) return notify('Mise minimum : 1 seeonium', 'error');
    if (optionIndex === undefined || optionIndex === '') return notify('Choisis une option', 'error');
    try {
      await call('/api/wagers/create', { betId, amount, optionIndex });
      setWagerForm((form) => ({ ...form, [betId]: {} }));
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleDeleteUser = async (username) => {
    if (!window.confirm(`Supprimer le compte "${username}" ?`)) return;
    try {
      await call('/api/users/delete', { username });
      setSelectedUser(null);
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleUpdateBalance = async () => {
    if (!selectedUser) return;
    try {
      await call('/api/users/update', { username: selectedUser, balance: balanceDraft });
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleBetRequest = async () => {
    try {
      await call('/api/bet-requests/create', requestForm);
      setRequestForm({ title: '', description: '', optionA: 'Oui', optionB: 'Non' });
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleReport = async () => {
    try {
      await call('/api/reports/create', { message: reportMessage });
      setReportMessage('');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const balance = currentUser && !currentUser.isAdmin ? users[currentUser.username]?.balance ?? currentUser.balance ?? 0 : null;
  const filteredBets = betFilter === 'all' ? bets : bets.filter((bet) => bet.status === betFilter);
  const leaderboard = useMemo(() => Object.entries(users)
    .map(([username, user]) => ({ username, balance: user.balance || 0 }))
    .sort((a, b) => b.balance - a.balance), [users]);

  if (view === 'loading') return <div className={styles.center}><div className={styles.spinner} /><p>Chargement...</p></div>;

  const navItems = currentUser?.isAdmin
    ? [
      ['admin-bets', 'Paris'],
      ['admin-requests', `Demandes${betRequests.filter((item) => item.status === 'pending').length ? ' +' : ''}`],
      ['admin-users', 'Personnes'],
      ['admin-reports', `Signalements${reports.filter((item) => item.status === 'open').length ? ' +' : ''}`],
    ]
    : [
      ['home', 'Paris'],
      ['my-bets', 'Mes paris'],
      ['request', 'Proposer'],
      ['leaderboard', 'Classement'],
      ['reports', 'Signalement'],
      ['profile', 'Profil'],
    ];

  return (
    <div className={styles.appShell}>
      {notif && <div className={`${styles.toast} ${notif.type === 'error' ? styles.toastError : ''}`}>{notif.msg}</div>}

      {view !== 'login' && currentUser && (
        <aside className={styles.sidebar}>
          <div className={styles.brandBlock}>
            <img src={LOGO} alt="Polyscout26" className={styles.logoImg} />
            <div>
              <strong>Polyscout26</strong>
              <span>{currentUser.isAdmin ? 'Administration' : currentUser.username}</span>
            </div>
          </div>
          {!currentUser.isAdmin && (
            <div className={styles.balanceBox}>
              <span>{balance.toLocaleString('fr-FR')}</span>
              <img src={COIN} alt="seeonium" />
            </div>
          )}
          <nav className={styles.sideNav}>
            {navItems.map(([key, label]) => (
              <button key={key} className={view === key ? styles.sideNavActive : ''} onClick={() => setView(key)}>{label}</button>
            ))}
          </nav>
          <button className={styles.logoutBtn} onClick={handleLogout}>Déconnexion</button>
        </aside>
      )}

      <main className={view === 'login' ? styles.loginMain : styles.main}>
        {view === 'login' && (
          <section className={styles.authPanel}>
            <img src={LOGO} alt="Polyscout26" className={styles.authLogo} />
            <h1>Polyscout26</h1>
            <p>Paris scouts en seeonium, entre participants.</p>
            <div className={styles.tabs}>
              <button className={loginTab === 'login' ? styles.activeTab : ''} onClick={() => setLoginTab('login')}>Connexion</button>
              <button className={loginTab === 'register' ? styles.activeTab : ''} onClick={() => setLoginTab('register')}>Inscription</button>
            </div>
            {loginTab === 'login' ? (
              <div className={styles.formCard}>
                <label>Pseudo<input value={loginForm.username} onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} /></label>
                <label>Mot de passe<input type="password" value={loginForm.password} onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} /></label>
                <button className={styles.primaryBtn} onClick={handleLogin}>Se connecter</button>
              </div>
            ) : (
              <div className={styles.formCard}>
                <label>Pseudo<input value={regForm.username} onChange={(e) => setRegForm((f) => ({ ...f, username: e.target.value }))} /></label>
                <label>E-mail<input type="email" value={regForm.email} onChange={(e) => setRegForm((f) => ({ ...f, email: e.target.value }))} /></label>
                <label>Mot de passe<input type="password" value={regForm.password} onChange={(e) => setRegForm((f) => ({ ...f, password: e.target.value }))} /></label>
                <label>Confirmer<input type="password" value={regForm.confirm} onChange={(e) => setRegForm((f) => ({ ...f, confirm: e.target.value }))} /></label>
                <button className={styles.primaryBtn} onClick={handleRegister}>Créer mon compte</button>
              </div>
            )}
          </section>
        )}

        {view === 'home' && (
          <>
            <div className={styles.pageHeader}>
              <h2>Paris disponibles</h2>
              <div className={styles.filters}>
                {['all', 'open', 'closed', 'resolved'].map((filter) => (
                  <button key={filter} className={betFilter === filter ? styles.filterActive : ''} onClick={() => setBetFilter(filter)}>
                    {{ all: 'Tous', open: 'Ouverts', closed: 'Fermés', resolved: 'Résolus' }[filter]}
                  </button>
                ))}
              </div>
            </div>
            <BetList bets={filteredBets} wagers={wagers} currentUser={currentUser} wagerForm={wagerForm} setWagerForm={setWagerForm} onWager={handleWager} balance={balance} />
          </>
        )}

        {view === 'my-bets' && (
          <Panel title="Mes paris">
            {wagers.filter((wager) => wager.username === currentUser.username).length === 0 && <Empty>Aucune mise pour l’instant.</Empty>}
            {wagers.filter((wager) => wager.username === currentUser.username).map((wager) => {
              const bet = bets.find((item) => item.id === wager.betId);
              if (!bet) return null;
              return <div className={styles.listRow} key={wager.id}><span>{bet.title}</span><strong>{wager.amount} seeonium sur {bet.options[wager.optionIndex]} à x{Number(wager.lockedOdds || 1).toFixed(2)}</strong></div>;
            })}
          </Panel>
        )}

        {view === 'request' && (
          <Panel title="Proposer un pari">
            <div className={styles.formGrid}>
              <label>Titre<input value={requestForm.title} onChange={(e) => setRequestForm((f) => ({ ...f, title: e.target.value }))} /></label>
              <label>Description<textarea value={requestForm.description} onChange={(e) => setRequestForm((f) => ({ ...f, description: e.target.value }))} /></label>
              <label>Option A<input value={requestForm.optionA} onChange={(e) => setRequestForm((f) => ({ ...f, optionA: e.target.value }))} /></label>
              <label>Option B<input value={requestForm.optionB} onChange={(e) => setRequestForm((f) => ({ ...f, optionB: e.target.value }))} /></label>
              <button className={styles.primaryBtn} onClick={handleBetRequest}>Envoyer à l’admin</button>
            </div>
          </Panel>
        )}

        {view === 'leaderboard' && (
          <Panel title="Classement">
            {leaderboard.map((user, index) => <div className={styles.listRow} key={user.username}><span>#{index + 1} {user.username}</span><strong>{user.balance.toLocaleString('fr-FR')} seeonium</strong></div>)}
          </Panel>
        )}

        {view === 'reports' && (
          <Panel title="Signalement">
            <textarea value={reportMessage} onChange={(e) => setReportMessage(e.target.value)} placeholder="Explique le problème ou le délit d’initié..." />
            <button className={styles.primaryBtn} onClick={handleReport}>Envoyer le signalement</button>
          </Panel>
        )}

        {view === 'profile' && (
          <Panel title="Profil">
            <div className={styles.profileCard}><img src={COIN} alt="seeonium" /><div><span>{currentUser.username}</span><strong>{balance.toLocaleString('fr-FR')} seeonium</strong></div></div>
          </Panel>
        )}

        {view === 'admin-bets' && currentUser?.isAdmin && (
          <>
            <div className={styles.statsGrid}>
              <Stat label="Paris" value={bets.length} />
              <Stat label="Participants" value={Object.keys(users).length} />
              <Stat label="Demandes" value={betRequests.filter((item) => item.status === 'pending').length} />
              <Stat label="Signalements" value={reports.filter((item) => item.status === 'open').length} />
            </div>
            <Panel title="Créer un pari">
              <BetForm newBet={newBet} setNewBet={setNewBet} onSubmit={handleCreateBet} />
            </Panel>
            <BetList bets={[...bets].reverse()} wagers={wagers} admin onClose={(betId) => call('/api/bets/close', { betId }).catch((e) => notify(e.message, 'error'))} onDelete={(betId) => call('/api/bets/delete', { betId }).catch((e) => notify(e.message, 'error'))} onResolve={(betId, optionIndex) => call('/api/bets/resolve', { betId, optionIndex }).catch((e) => notify(e.message, 'error'))} />
          </>
        )}

        {view === 'admin-requests' && currentUser?.isAdmin && (
          <Panel title="Demandes de paris">
            {betRequests.length === 0 && <Empty>Aucune demande.</Empty>}
            {betRequests.map((request) => (
              <div className={styles.requestCard} key={request.id}>
                <span className={styles.tag}>{request.status}</span>
                <h3>{request.title}</h3>
                <p>{request.description || 'Sans description'} · proposé par {request.username}</p>
                <div>{request.options.join(' / ')}</div>
                {request.status === 'pending' && <div className={styles.rowActions}><button className={styles.primaryBtn} onClick={() => call('/api/bet-requests/resolve', { requestId: request.id, action: 'approve', virtualStakes: [100, 100] }).catch((e) => notify(e.message, 'error'))}>Accepter</button><button className={styles.secondaryBtn} onClick={() => call('/api/bet-requests/resolve', { requestId: request.id, action: 'reject' }).catch((e) => notify(e.message, 'error'))}>Refuser</button></div>}
              </div>
            ))}
          </Panel>
        )}

        {view === 'admin-users' && currentUser?.isAdmin && (
          <div className={styles.twoColumns}>
            <Panel title="Personnes">
              {Object.keys(users).length === 0 && <Empty>Aucun participant.</Empty>}
              {Object.keys(users).sort().map((username) => <button key={username} className={styles.personButton} onClick={() => { setSelectedUser(username); setBalanceDraft(users[username]?.balance ?? 0); }}>{username}</button>)}
            </Panel>
            <Panel title={selectedUser ? `Fiche de ${selectedUser}` : 'Fiche participant'}>
              {!selectedUser && <Empty>Sélectionne une personne.</Empty>}
              {selectedUser && users[selectedUser] && (
                <div className={styles.formGrid}>
                  <div className={styles.detailLine}><span>E-mail</span><strong>{users[selectedUser].email || 'Non disponible'}</strong></div>
                  <div className={styles.detailLine}><span>Mot de passe</span><strong>{users[selectedUser].password || 'Non disponible pour les anciens comptes'}</strong></div>
                  <div className={styles.detailLine}><span>Inscription</span><strong>{fmtDate(users[selectedUser].createdAt)}</strong></div>
                  <label>Seeonium<input type="number" min="0" value={balanceDraft} onChange={(e) => setBalanceDraft(e.target.value)} /></label>
                  <div className={styles.rowActions}><button className={styles.primaryBtn} onClick={handleUpdateBalance}>Modifier</button><button className={styles.dangerBtn} onClick={() => handleDeleteUser(selectedUser)}>Supprimer le compte</button></div>
                </div>
              )}
            </Panel>
          </div>
        )}

        {view === 'admin-reports' && currentUser?.isAdmin && (
          <Panel title="Signalements">
            {reports.length === 0 && <Empty>Aucun signalement.</Empty>}
            {reports.map((report) => <div className={styles.requestCard} key={report.id}><span className={styles.tag}>{report.status}</span><h3>{report.username}</h3><p>{report.message}</p><small>{fmtDate(report.createdAt)}</small>{report.status === 'open' && <button className={styles.secondaryBtn} onClick={() => call('/api/reports/close', { reportId: report.id }).catch((e) => notify(e.message, 'error'))}>Marquer traité</button>}</div>)}
          </Panel>
        )}
      </main>
    </div>
  );
}

function Panel({ title, children }) {
  return <section className={styles.panel}><h2>{title}</h2>{children}</section>;
}

function Empty({ children }) {
  return <div className={styles.empty}>{children}</div>;
}

function Stat({ label, value }) {
  return <div className={styles.stat}><strong>{value}</strong><span>{label}</span></div>;
}

function BetForm({ newBet, setNewBet, onSubmit }) {
  return (
    <div className={styles.formGrid}>
      <label>Titre<input value={newBet.title} onChange={(e) => setNewBet((bet) => ({ ...bet, title: e.target.value }))} /></label>
      <label>Description<textarea value={newBet.description} onChange={(e) => setNewBet((bet) => ({ ...bet, description: e.target.value }))} /></label>
      <label>Fermeture<input type="datetime-local" value={newBet.closesAt} onChange={(e) => setNewBet((bet) => ({ ...bet, closesAt: e.target.value }))} /></label>
      {newBet.options.map((option, index) => (
        <div className={styles.optionEdit} key={index}>
          <input value={option} onChange={(e) => setNewBet((bet) => ({ ...bet, options: bet.options.map((item, itemIndex) => itemIndex === index ? e.target.value : item) }))} />
          <input type="number" min="0" value={newBet.virtualStakes[index]} onChange={(e) => setNewBet((bet) => ({ ...bet, virtualStakes: bet.virtualStakes.map((item, itemIndex) => itemIndex === index ? e.target.value : item) }))} placeholder="Mise fictive" />
          <button className={styles.secondaryBtn} disabled={newBet.options.length <= 2} onClick={() => setNewBet((bet) => ({ ...bet, options: bet.options.filter((_, i) => i !== index), virtualStakes: bet.virtualStakes.filter((_, i) => i !== index) }))}>Retirer</button>
        </div>
      ))}
      <div className={styles.rowActions}>
        <button className={styles.secondaryBtn} onClick={() => setNewBet((bet) => ({ ...bet, options: [...bet.options, ''], virtualStakes: [...bet.virtualStakes, '100'] }))}>Ajouter une option</button>
        <button className={styles.primaryBtn} onClick={onSubmit}>Créer le pari</button>
      </div>
    </div>
  );
}

function BetList({ bets, wagers, currentUser, wagerForm = {}, setWagerForm, onWager, balance, admin, onClose, onDelete, onResolve }) {
  if (bets.length === 0) return <Empty>Aucun pari à afficher.</Empty>;
  return bets.map((bet) => {
    const betWagers = getBetWagers(wagers, bet.id);
    const tag = TAG_CONFIG[bet.status] || TAG_CONFIG.open;
    const myWagers = currentUser ? betWagers.filter((wager) => wager.username === currentUser.username) : [];
    return (
      <article className={styles.betCard} key={bet.id}>
        <span className={styles.tag}>{tag.label}</span>
        <h3>{bet.title}</h3>
        {bet.description && <p>{bet.description}</p>}
        <div className={styles.optionsGrid}>
          {bet.options.map((option, index) => {
            const pct = getOptionChance(bet, betWagers, index);
            const odds = getOptionOdds(bet, betWagers, index);
            return (
              <div className={`${styles.optionCard} ${bet.resolvedOption === index ? styles.optionWinner : ''}`} key={option + index}>
                <span>{option}</span>
                <strong>x{odds}</strong>
                <div className={styles.optionBar}><i style={{ width: `${pct}%` }} /></div>
                <small>{pct}% de chance</small>
              </div>
            );
          })}
        </div>
        {myWagers.length > 0 && <div className={styles.myWager}>Mes mises {myWagers.map((wager) => <span key={wager.id}>{wager.amount} sur {bet.options[wager.optionIndex]} à x{Number(wager.lockedOdds || 1).toFixed(2)}</span>)}</div>}
        {!admin && bet.status === 'open' && (
          <div className={styles.wagerRow}>
            <select value={wagerForm[bet.id]?.option ?? ''} onChange={(e) => setWagerForm((form) => ({ ...form, [bet.id]: { ...form[bet.id], option: e.target.value } }))}>
              <option value="">Choisir une option...</option>
              {bet.options.map((option, index) => <option value={index} key={option}>{option} x{getOptionOdds(bet, betWagers, index)}</option>)}
            </select>
            <input type="number" min="1" max={balance} placeholder="Mise" value={wagerForm[bet.id]?.amount ?? ''} onChange={(e) => setWagerForm((form) => ({ ...form, [bet.id]: { ...form[bet.id], amount: e.target.value } }))} />
            <button className={styles.primaryBtn} onClick={() => onWager(bet.id)}>Miser</button>
          </div>
        )}
        {admin && <div className={styles.rowActions}>{bet.status === 'open' && <button className={styles.secondaryBtn} onClick={() => onClose(bet.id)}>Fermer</button>}{(bet.status === 'open' || bet.status === 'closed') && bet.options.map((option, index) => <button className={styles.primaryBtn} key={option} onClick={() => onResolve(bet.id, index)}>Résoudre {option}</button>)}<button className={styles.dangerBtn} onClick={() => onDelete(bet.id)}>Supprimer</button></div>}
        <div className={styles.meta}>Créé le {fmtDate(bet.createdAt)} · {betWagers.length} mise{betWagers.length > 1 ? 's' : ''} · Ferme le {fmtDate(bet.closesAt)}</div>
      </article>
    );
  });
}

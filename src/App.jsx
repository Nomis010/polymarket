import { useEffect, useMemo, useState } from 'react';
import { api, clearSession, getSavedSession, saveSession } from './api.js';
import styles from './index.module.css';
import brandLogo from './assets/polyscout26-logo.jpg';
import seeoniumIcon from './assets/seeonium-icon.png';

const APP_NAME = 'Polyscout26';
const CURRENCY_NAME = 'seeonium';
const DEFAULT_VIRTUAL_STAKE = 100;

const fmtDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) : 'Non défini';

const TAG_CONFIG = {
  open: { label: 'Ouvert', bg: 'rgba(128, 55, 255, 0.22)', color: '#b66cff' },
  closed: { label: 'Fermé', bg: 'rgba(99, 116, 255, 0.14)', color: '#a7afff' },
  resolved: { label: 'Résolu', bg: 'rgba(247, 199, 88, 0.16)', color: '#ffd66e' },
};

const REQUEST_TAGS = {
  pending: { label: 'En attente', bg: 'rgba(247, 199, 88, 0.14)', color: '#ffd66e' },
  accepted: { label: 'Acceptée', bg: 'rgba(42, 205, 149, 0.14)', color: '#7cf8c8' },
  rejected: { label: 'Refusée', bg: 'rgba(255, 82, 128, 0.13)', color: '#ff8cab' },
};

const Icon = ({ name }) => {
  const paths = {
    home: <><path d="M3 10.7 12 3l9 7.7" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-7h6v7" /></>,
    ticket: <><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4Z" /><path d="M9 8h.01M9 12h.01M9 16h.01" /></>,
    crown: <><path d="m3 7 5 5 4-8 4 8 5-5-2 12H5Z" /><path d="M5 19h14" /></>,
    alert: <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>,
    user: <><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-5" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
    check: <path d="m5 12 5 5L20 7" />,
    x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
    coin: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10" /><path d="M9 9.5c0-1.3 1.4-2 3-2s3 .7 3 2-1.4 2-3 2-3 .7-3 2 1.4 2 3 2 3-.7 3-2" /></>,
  };

  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
};

const CurrencyIcon = ({ small = false }) => (
  <img className={`${styles.currencyIcon} ${small ? styles.currencyIconSmall : ''}`} src={seeoniumIcon} alt={CURRENCY_NAME} />
);

const getVirtualStakes = (bet) => {
  const options = bet.options || [];
  const raw = Array.isArray(bet.virtualStakes) ? bet.virtualStakes : [];
  return options.map((_, index) => {
    const value = Number(raw[index]);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_VIRTUAL_STAKE;
  });
};

const getOptionStake = (wagers, betId, optionIndex) =>
  wagers
    .filter((w) => w.betId === betId && w.optionIndex === optionIndex)
    .reduce((sum, wager) => sum + Number(wager.amount || 0), 0);

const getOptionChance = (bet, wagers, optionIndex) => {
  const virtualStakes = getVirtualStakes(bet);
  const totalPlayerStake = wagers
    .filter((w) => w.betId === bet.id)
    .reduce((sum, wager) => sum + Number(wager.amount || 0), 0);
  const totalVirtualStake = virtualStakes.reduce((sum, stake) => sum + stake, 0);
  const optionStake = getOptionStake(wagers, bet.id, optionIndex) + Number(virtualStakes[optionIndex] || DEFAULT_VIRTUAL_STAKE);
  return Math.round((optionStake / Math.max(1, totalPlayerStake + totalVirtualStake)) * 100);
};

const getOptionOdds = (bet, wagers, optionIndex) => {
  const virtualStakes = getVirtualStakes(bet);
  const totalPlayerStake = wagers
    .filter((w) => w.betId === bet.id)
    .reduce((sum, wager) => sum + Number(wager.amount || 0), 0);
  const totalVirtualStake = virtualStakes.reduce((sum, stake) => sum + stake, 0);
  const optionStake = getOptionStake(wagers, bet.id, optionIndex) + Number(virtualStakes[optionIndex] || DEFAULT_VIRTUAL_STAKE);
  const quote = ((totalPlayerStake + totalVirtualStake) / optionStake) * 0.9;
  return Math.max(1.01, quote).toFixed(2);
};

const emptyBetForm = () => ({
  title: '',
  description: '',
  options: ['', ''],
  virtualStakes: [String(DEFAULT_VIRTUAL_STAKE), String(DEFAULT_VIRTUAL_STAKE)],
  closesAt: '',
});

const emptyRequestForm = () => ({
  title: '',
  description: '',
  options: ['', ''],
  closesAt: '',
});

const compactCurrency = (value) => Number(value || 0).toLocaleString('fr-FR');

export default function App() {
  const [view, setView] = useState('loading');
  const [adminView, setAdminView] = useState('bets');
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
  const [newBet, setNewBet] = useState(emptyBetForm);
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [reportForm, setReportForm] = useState({ subject: '', message: '' });
  const [wagerForm, setWagerForm] = useState({});
  const [betFilter, setBetFilter] = useState('open');
  const [selectedUser, setSelectedUser] = useState(null);
  const [balanceDraft, setBalanceDraft] = useState('');
  const [requestStakeForm, setRequestStakeForm] = useState({});

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

  const notify = (msg, type = 'success') => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3200);
  };

  const syncFromApi = (data) => {
    applyState(data);
    if (data.message) notify(data.message);
  };

  const setUserView = (nextView) => {
    setView(nextView);
    if (nextView !== 'admin') setSelectedUser(null);
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
      setView(data.user.isAdmin ? 'admin' : 'home');
      setAdminView('bets');
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
    setSelectedUser(null);
  };

  const updateOption = (setter, field, index, value) => {
    setter((form) => ({ ...form, [field]: form[field].map((item, itemIndex) => itemIndex === index ? value : item) }));
  };

  const addOption = (setter, withStake = false) => {
    setter((form) => ({
      ...form,
      options: [...form.options, ''],
      ...(withStake ? { virtualStakes: [...form.virtualStakes, String(DEFAULT_VIRTUAL_STAKE)] } : {}),
    }));
  };

  const removeOption = (setter, index, withStake = false) => {
    setter((form) => {
      if (form.options.length <= 2) return form;
      return {
        ...form,
        options: form.options.filter((_, itemIndex) => itemIndex !== index),
        ...(withStake ? { virtualStakes: form.virtualStakes.filter((_, itemIndex) => itemIndex !== index) } : {}),
      };
    });
  };

  const validateOptions = (options) => Array.isArray(options) && options.length >= 2 && options.every((option) => option.trim());

  const handleCreateBet = async () => {
    if (!newBet.title.trim()) return notify('Titre requis', 'error');
    if (!validateOptions(newBet.options)) return notify('Deux options minimum sont requises', 'error');
    if (newBet.virtualStakes.some((stake) => Number(stake) <= 0 || Number.isNaN(Number(stake)))) return notify('Mise fictive invalide', 'error');
    try {
      const data = await api('/api/bets/create', { method: 'POST', token: sessionToken, body: newBet });
      syncFromApi(data);
      setNewBet(emptyBetForm());
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleRequestBet = async () => {
    if (!requestForm.title.trim()) return notify('Titre requis', 'error');
    if (!validateOptions(requestForm.options)) return notify('Deux options minimum sont requises', 'error');
    try {
      const data = await api('/api/bet-requests', { method: 'POST', token: sessionToken, body: { ...requestForm, action: 'create' } });
      syncFromApi(data);
      setRequestForm(emptyRequestForm());
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleReport = async () => {
    if (!reportForm.subject.trim() || !reportForm.message.trim()) return notify('Sujet et message requis', 'error');
    try {
      const data = await api('/api/reports', { method: 'POST', token: sessionToken, body: { ...reportForm, action: 'create' } });
      syncFromApi(data);
      setReportForm({ subject: '', message: '' });
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleWager = async (betId) => {
    const amount = parseInt(wagerForm[betId]?.amount, 10);
    const optionIndex = wagerForm[betId]?.option;
    if (!amount || amount < 1) return notify(`Mise minimum : 1 ${CURRENCY_NAME}`, 'error');
    if (optionIndex === undefined || optionIndex === null || optionIndex === '') return notify('Choisis une option', 'error');
    try {
      const data = await api('/api/wagers/create', { method: 'POST', token: sessionToken, body: { betId, amount, optionIndex } });
      syncFromApi(data);
      setWagerForm((form) => ({ ...form, [betId]: {} }));
    } catch (error) {
      notify(error.message, 'error');
    }
  };

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

  const handleAcceptRequest = async (request) => {
    const virtualStakes = (requestStakeForm[request.id] || request.options.map(() => String(DEFAULT_VIRTUAL_STAKE)));
    try {
      const data = await api('/api/bet-requests', { method: 'POST', token: sessionToken, body: { action: 'accept', requestId: request.id, virtualStakes } });
      syncFromApi(data);
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      const data = await api('/api/bet-requests', { method: 'POST', token: sessionToken, body: { action: 'reject', requestId } });
      syncFromApi(data);
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleCloseReport = async (reportId) => {
    try {
      const data = await api('/api/reports', { method: 'POST', token: sessionToken, body: { action: 'close', reportId } });
      syncFromApi(data);
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleSelectUser = (username) => {
    setSelectedUser(username);
    setBalanceDraft(String(users[username]?.balance ?? 0));
  };

  const handleUpdateBalance = async () => {
    if (!selectedUser) return;
    try {
      const data = await api('/api/users', { method: 'POST', token: sessionToken, body: { action: 'update', username: selectedUser, balance: balanceDraft } });
      syncFromApi(data);
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const handleDeleteUser = async (username) => {
    if (!window.confirm(`Supprimer le compte "${username}" ? Ses mises seront retirées.`)) return;
    try {
      const data = await api('/api/users', { method: 'POST', token: sessionToken, body: { action: 'delete', username } });
      syncFromApi(data);
      setSelectedUser(null);
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const getUserBalance = () => (!currentUser || currentUser.isAdmin) ? null : (users[currentUser.username]?.balance ?? 0);
  const getFilteredBets = () => betFilter === 'all' ? bets : bets.filter((bet) => bet.status === betFilter);
  const getUserWagers = (betId) => wagers.filter((wager) => wager.betId === betId && wager.username === currentUser?.username);
  const totalWagered = wagers.reduce((sum, wager) => sum + Number(wager.amount || 0), 0);
  const leaderboard = useMemo(() => Object.entries(users)
    .map(([username, data]) => ({ username, balance: data.balance }))
    .sort((a, b) => b.balance - a.balance), [users]);
  const pendingRequests = betRequests.filter((request) => request.status === 'pending');
  const openReports = reports.filter((report) => report.status === 'open');

  const navItems = currentUser?.isAdmin
    ? [
      { key: 'bets', label: 'Paris', icon: 'ticket', action: () => { setView('admin'); setAdminView('bets'); } },
      { key: 'requests', label: 'Requêtes', icon: 'plus', count: pendingRequests.length, action: () => { setView('admin'); setAdminView('requests'); } },
      { key: 'people', label: 'Personnes', icon: 'users', action: () => { setView('admin'); setAdminView('people'); } },
      { key: 'reports', label: 'Signalements', icon: 'alert', count: openReports.length, action: () => { setView('admin'); setAdminView('reports'); } },
    ]
    : [
      { key: 'home', label: 'Paris', icon: 'home', action: () => setUserView('home') },
      { key: 'request', label: 'Demande', icon: 'plus', action: () => setUserView('request') },
      { key: 'leaderboard', label: 'Classement', icon: 'crown', action: () => setUserView('leaderboard') },
      { key: 'report', label: 'Signalement', icon: 'alert', action: () => setUserView('report') },
      { key: 'profile', label: 'Profil', icon: 'user', action: () => setUserView('profile') },
    ];

  const activeNavKey = currentUser?.isAdmin ? adminView : view;

  const renderNav = () => currentUser && (
    <nav className={styles.railNav} aria-label="Navigation principale">
      {navItems.map((item) => (
        <button key={item.key} className={`${styles.railBtn} ${activeNavKey === item.key ? styles.railBtnActive : ''}`} onClick={item.action} title={item.label}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
          {item.count > 0 && <em>{item.count}</em>}
        </button>
      ))}
      <button className={styles.railBtn} onClick={handleLogout} title="Déconnexion">
        <Icon name="logout" />
        <span>Sortie</span>
      </button>
    </nav>
  );

  const renderBrand = () => (
    <header className={styles.topBar}>
      <div className={styles.brand}>
        <img className={styles.brandLogo} src={brandLogo} alt={`${APP_NAME} logo`} />
        <div>
          <span className={styles.logo}>{APP_NAME}</span>
          <div className={styles.logoSub}>Paris fictifs en {CURRENCY_NAME}</div>
        </div>
      </div>
      {currentUser && (
        <div className={styles.sessionPill}>
          {currentUser.isAdmin ? <><Icon name="shield" /> Admin</> : <>{compactCurrency(getUserBalance())} <CurrencyIcon small /></>}
        </div>
      )}
    </header>
  );

  const renderOptionEditor = ({ form, setter, withStake = false }) => (
    <div className={styles.optionEditor}>
      {form.options.map((option, index) => (
        <div key={index} className={styles.optionRow}>
          <input value={option} placeholder={`Option ${index + 1}`} onChange={(event) => updateOption(setter, 'options', index, event.target.value)} />
          {withStake && (
            <input type="number" min="1" value={form.virtualStakes[index]} placeholder="Mise fictive" onChange={(event) => updateOption(setter, 'virtualStakes', index, event.target.value)} />
          )}
          <button className={styles.iconBtn} disabled={form.options.length <= 2} onClick={() => removeOption(setter, index, withStake)} title="Retirer">
            <Icon name="x" />
          </button>
        </div>
      ))}
      <button className={styles.secondaryBtn} onClick={() => addOption(setter, withStake)}>
        <Icon name="plus" /> Ajouter une option
      </button>
    </div>
  );

  const renderBetCard = (bet, admin = false) => {
    const betWagers = wagers.filter((wager) => wager.betId === bet.id);
    const myWagers = getUserWagers(bet.id);
    const tag = TAG_CONFIG[bet.status] || TAG_CONFIG.open;
    const totalPool = betWagers.reduce((sum, wager) => sum + Number(wager.amount || 0), 0);

    return (
      <div key={bet.id} className={styles.betCard}>
        <div className={styles.betCardTop}>
          <div>
            <span className={styles.tag} style={{ background: tag.bg, color: tag.color }}>{tag.label}</span>
            <h3 className={styles.betTitle}>{bet.title}</h3>
            {bet.description && <p className={styles.betDesc}>{bet.description}</p>}
          </div>
          {admin && (
            <div className={styles.poolBox}>
              <div className={styles.poolLabel}>En jeu</div>
              <div className={styles.poolValue}>{compactCurrency(totalPool)} <CurrencyIcon small /></div>
              <div className={styles.poolLabel}>{betWagers.length} mise{betWagers.length !== 1 ? 's' : ''}</div>
            </div>
          )}
        </div>

        <div className={styles.optionsGrid} style={{ gridTemplateColumns: `repeat(${bet.options.length}, 1fr)` }}>
          {bet.options.map((option, index) => {
            const pct = getOptionChance(bet, betWagers, index);
            const isWin = bet.resolvedOption === index;
            return (
              <div key={index} className={`${styles.optionCard} ${isWin ? styles.optionWinner : ''}`}>
                <div className={styles.optionName}>{option}</div>
                <div className={styles.optionOdds}>x{getOptionOdds(bet, betWagers, index)}</div>
                <div className={styles.optionBar}><span style={{ width: `${pct}%` }} /></div>
                <div className={styles.optionPct}>{pct}% de chance</div>
                {admin && <div className={styles.optionSeed}>Fictif admin : {compactCurrency(getVirtualStakes(bet)[index])}</div>}
                {isWin && <div className={styles.winnerBadge}>Gagnant</div>}
              </div>
            );
          })}
        </div>

        {!admin && myWagers.length > 0 && (
          <div className={styles.myWager}>
            <strong>Mes mises</strong>
            {myWagers.map((wager) => (
              <span key={wager.id}>
                {compactCurrency(wager.amount)} {CURRENCY_NAME} sur "{bet.options[wager.optionIndex]}" à x{Number(wager.lockedOdds || getOptionOdds(bet, betWagers, wager.optionIndex)).toFixed(2)}
                {bet.status === 'resolved' && (wager.optionIndex === bet.resolvedOption ? ` · gain ${compactCurrency(Math.floor(wager.amount * Number(wager.lockedOdds || 1)))}` : ' · perdu')}
              </span>
            ))}
          </div>
        )}

        {!admin && bet.status === 'open' && (
          <div className={styles.wagerRow}>
            <select value={wagerForm[bet.id]?.option ?? ''} onChange={(event) => setWagerForm((form) => ({ ...form, [bet.id]: { ...form[bet.id], option: event.target.value } }))}>
              <option value="">Choisir une option...</option>
              {bet.options.map((option, index) => <option key={index} value={index}>{option} (x{getOptionOdds(bet, betWagers, index)})</option>)}
            </select>
            <input type="number" min="1" max={getUserBalance()} placeholder={`Mise en ${CURRENCY_NAME}`} value={wagerForm[bet.id]?.amount ?? ''} onChange={(event) => setWagerForm((form) => ({ ...form, [bet.id]: { ...form[bet.id], amount: event.target.value } }))} />
            <button className={styles.primaryBtn} onClick={() => handleWager(bet.id)}>Miser</button>
          </div>
        )}

        {admin && (
          <div className={styles.adminActions}>
            {bet.status === 'open' && <button className={styles.secondaryBtn} onClick={() => handleCloseBet(bet.id)}>Fermer les mises</button>}
            {(bet.status === 'open' || bet.status === 'closed') && bet.options.map((option, index) => (
              <button key={index} className={styles.primaryBtn} onClick={() => handleResolveBet(bet.id, index)}>Valider {option}</button>
            ))}
            <button className={styles.dangerBtn} onClick={() => handleDeleteBet(bet.id)}>Supprimer</button>
          </div>
        )}

        <div className={styles.betMeta}>
          Créé le {fmtDate(bet.createdAt)} · {betWagers.length} mise{betWagers.length !== 1 ? 's' : ''}
          {bet.closesAt && bet.status === 'open' && ` · Ferme le ${fmtDate(bet.closesAt)}`}
          {bet.requestedBy && ` · proposé par ${bet.requestedBy}`}
        </div>
      </div>
    );
  };

  const renderLogin = () => (
    <div className={styles.authWrap}>
      <div className={styles.authHero}>
        <img className={styles.authLogo} src={brandLogo} alt={`${APP_NAME} logo`} />
        <h1 className={styles.authTitle}>{APP_NAME}</h1>
        <p className={styles.authSub}>Parie avec la monnaie {CURRENCY_NAME}</p>
      </div>

      <div className={styles.tabs}>
        {['login', 'register'].map((tab) => (
          <button key={tab} onClick={() => setLoginTab(tab)} className={`${styles.tab} ${loginTab === tab ? styles.tabActive : ''}`}>
            {tab === 'login' ? 'Se connecter' : "S'inscrire"}
          </button>
        ))}
      </div>

      <div className={styles.authCard}>
        {loginTab === 'login' ? (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Pseudo</label>
              <input value={loginForm.username} onChange={(event) => setLoginForm((form) => ({ ...form, username: event.target.value }))} placeholder="Ton pseudo" onKeyDown={(event) => event.key === 'Enter' && handleLogin()} autoFocus />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Mot de passe</label>
              <input type="password" value={loginForm.password} onChange={(event) => setLoginForm((form) => ({ ...form, password: event.target.value }))} placeholder="••••••••" onKeyDown={(event) => event.key === 'Enter' && handleLogin()} />
            </div>
            <button className={styles.primaryBtn} style={{ width: '100%' }} onClick={handleLogin}>Se connecter</button>
          </>
        ) : (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Pseudo</label>
              <input value={regForm.username} onChange={(event) => setRegForm((form) => ({ ...form, username: event.target.value }))} placeholder="Choisis un pseudo" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>E-mail vérifié côté domaine</label>
              <input type="email" value={regForm.email} onChange={(event) => setRegForm((form) => ({ ...form, email: event.target.value }))} placeholder="ton@email.com" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Mot de passe</label>
              <input type="password" value={regForm.password} onChange={(event) => setRegForm((form) => ({ ...form, password: event.target.value }))} placeholder="••••••••" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Confirme le mot de passe</label>
              <input type="password" value={regForm.confirm} onChange={(event) => setRegForm((form) => ({ ...form, confirm: event.target.value }))} placeholder="••••••••" onKeyDown={(event) => event.key === 'Enter' && handleRegister()} />
            </div>
            <button className={styles.primaryBtn} style={{ width: '100%' }} onClick={handleRegister}>Créer mon compte</button>
            <p className={styles.hint}>Tu reçois <strong>1 000 {CURRENCY_NAME}</strong> à l'inscription.</p>
          </>
        )}
      </div>
    </div>
  );

  const renderHome = () => (
    <main className={styles.mainColumn}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Paris disponibles</h2>
        <div className={styles.filters}>
          {['all', 'open', 'closed', 'resolved'].map((filter) => (
            <button key={filter} onClick={() => setBetFilter(filter)} className={`${styles.filterBtn} ${betFilter === filter ? styles.filterBtnActive : ''}`}>
              {{ open: 'Ouverts', closed: 'Fermés', resolved: 'Résolus', all: 'Tous' }[filter]}
            </button>
          ))}
        </div>
      </div>
      {getFilteredBets().length === 0 && <div className={styles.empty}><Icon name="ticket" /><p>Aucun pari disponible.</p></div>}
      {getFilteredBets().map((bet) => renderBetCard(bet))}
    </main>
  );

  const renderRequest = () => (
    <main className={styles.mainColumn}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Proposer un pari</h2>
      </div>
      <div className={styles.card}>
        <div className={styles.field}>
          <label className={styles.label}>Question du pari</label>
          <input value={requestForm.title} onChange={(event) => setRequestForm((form) => ({ ...form, title: event.target.value }))} placeholder="Ex: Qui va gagner le prochain match ?" />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Description</label>
          <textarea value={requestForm.description} onChange={(event) => setRequestForm((form) => ({ ...form, description: event.target.value }))} placeholder="Contexte, date, règle de résolution..." />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Fermeture souhaitée</label>
          <input type="datetime-local" value={requestForm.closesAt} onChange={(event) => setRequestForm((form) => ({ ...form, closesAt: event.target.value }))} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Options</label>
          {renderOptionEditor({ form: requestForm, setter: setRequestForm })}
        </div>
        <button className={styles.primaryBtn} onClick={handleRequestBet}>Envoyer à l'administration</button>
      </div>
      <h3 className={styles.sectionTitle}>Mes demandes</h3>
      {betRequests.length === 0 && <div className={styles.empty}><Icon name="plus" /><p>Aucune demande envoyée.</p></div>}
      {betRequests.map((request) => {
        const tag = REQUEST_TAGS[request.status] || REQUEST_TAGS.pending;
        return (
          <div key={request.id} className={styles.betCard}>
            <span className={styles.tag} style={{ background: tag.bg, color: tag.color }}>{tag.label}</span>
            <h3 className={styles.betTitle}>{request.title}</h3>
            <p className={styles.betDesc}>{request.options.join(' · ')}</p>
            <div className={styles.betMeta}>Envoyée le {fmtDate(request.createdAt)}</div>
          </div>
        );
      })}
    </main>
  );

  const renderReport = () => (
    <main className={styles.mainColumn}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Signalement</h2>
      </div>
      <div className={styles.card}>
        <div className={styles.field}>
          <label className={styles.label}>Sujet</label>
          <input value={reportForm.subject} onChange={(event) => setReportForm((form) => ({ ...form, subject: event.target.value }))} placeholder="Ex: comportement suspect" />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Message</label>
          <textarea value={reportForm.message} onChange={(event) => setReportForm((form) => ({ ...form, message: event.target.value }))} placeholder="Décris ce que l'admin doit vérifier..." />
        </div>
        <button className={styles.primaryBtn} onClick={handleReport}>Envoyer le signalement</button>
      </div>
      <h3 className={styles.sectionTitle}>Mes signalements</h3>
      {reports.length === 0 && <div className={styles.empty}><Icon name="alert" /><p>Aucun signalement envoyé.</p></div>}
      {reports.map((report) => (
        <div key={report.id} className={styles.betCard}>
          <span className={styles.tag} style={{ background: report.status === 'open' ? REQUEST_TAGS.pending.bg : REQUEST_TAGS.accepted.bg, color: report.status === 'open' ? REQUEST_TAGS.pending.color : REQUEST_TAGS.accepted.color }}>
            {report.status === 'open' ? 'Ouvert' : 'Clôturé'}
          </span>
          <h3 className={styles.betTitle}>{report.subject}</h3>
          <p className={styles.betDesc}>{report.message}</p>
          <div className={styles.betMeta}>Envoyé le {fmtDate(report.createdAt)}</div>
        </div>
      ))}
    </main>
  );

  const renderLeaderboard = () => (
    <main className={styles.mainColumn}>
      <div className={styles.pageHeader}><h2 className={styles.pageTitle}>Classement</h2></div>
      <div className={styles.card}>
        {leaderboard.length === 0 && <p className={styles.empty}>Aucun joueur inscrit.</p>}
        {leaderboard.map((user, index) => (
          <div key={user.username} className={styles.leaderRow}>
            <span className={styles.rank}>#{index + 1}</span>
            <span className={styles.leaderName}>{user.username}{user.username === currentUser?.username ? ' (toi)' : ''}</span>
            <span className={styles.leaderBalance}>{compactCurrency(user.balance)} <CurrencyIcon small /></span>
          </div>
        ))}
      </div>
    </main>
  );

  const renderProfile = () => (
    <main className={styles.mainColumn}>
      <div className={styles.pageHeader}><h2 className={styles.pageTitle}>Profil</h2></div>
      <div className={styles.profileGrid}>
        <div className={styles.statCard}><div className={styles.statEmoji}><Icon name="user" /></div><div className={styles.statValue}>{currentUser?.username}</div><div className={styles.statLabel}>Pseudo</div></div>
        <div className={styles.statCard}><div className={styles.statEmoji}><Icon name="coin" /></div><div className={styles.statValue}>{compactCurrency(getUserBalance())}</div><div className={styles.statLabel}>{CURRENCY_NAME}</div></div>
        <div className={styles.statCard}><div className={styles.statEmoji}><Icon name="ticket" /></div><div className={styles.statValue}>{wagers.filter((wager) => wager.username === currentUser?.username).length}</div><div className={styles.statLabel}>Mises placées</div></div>
      </div>
    </main>
  );

  const renderAdminBets = () => (
    <main className={styles.mainColumn}>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}><div className={styles.statEmoji}><Icon name="ticket" /></div><div className={styles.statValue}>{bets.length}</div><div className={styles.statLabel}>Paris créés</div></div>
        <div className={styles.statCard}><div className={styles.statEmoji}><Icon name="users" /></div><div className={styles.statValue}>{Object.keys(users).length}</div><div className={styles.statLabel}>Participants</div></div>
        <div className={styles.statCard}><div className={styles.statEmoji}><Icon name="coin" /></div><div className={styles.statValue}>{compactCurrency(totalWagered)}</div><div className={styles.statLabel}>seeonium misés</div></div>
        <div className={styles.statCard}><div className={styles.statEmoji}><Icon name="check" /></div><div className={styles.statValue}>{bets.filter((bet) => bet.status === 'open').length}</div><div className={styles.statLabel}>Ouverts</div></div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Créer un pari</h2>
        <div className={styles.field}><label className={styles.label}>Titre</label><input value={newBet.title} onChange={(event) => setNewBet((form) => ({ ...form, title: event.target.value }))} placeholder="Ex: Capucin deviendra cheffe PI en 2026 ?" /></div>
        <div className={styles.field}><label className={styles.label}>Description</label><textarea value={newBet.description} onChange={(event) => setNewBet((form) => ({ ...form, description: event.target.value }))} placeholder="Détails du pari..." /></div>
        <div className={styles.field}><label className={styles.label}>Fermeture des mises</label><input type="datetime-local" value={newBet.closesAt} onChange={(event) => setNewBet((form) => ({ ...form, closesAt: event.target.value }))} /></div>
        <div className={styles.field}><label className={styles.label}>Options et mise fictive admin</label>{renderOptionEditor({ form: newBet, setter: setNewBet, withStake: true })}</div>
        <button className={styles.primaryBtn} onClick={handleCreateBet}>Créer le pari</button>
      </div>

      <h2 className={styles.sectionTitle}>Tous les paris</h2>
      {bets.length === 0 && <div className={styles.empty}><Icon name="ticket" /><p>Aucun pari créé.</p></div>}
      {[...bets].reverse().map((bet) => renderBetCard(bet, true))}
    </main>
  );

  const renderAdminRequests = () => (
    <main className={styles.mainColumn}>
      <div className={styles.pageHeader}><h2 className={styles.pageTitle}>Requêtes de paris</h2></div>
      {betRequests.length === 0 && <div className={styles.empty}><Icon name="plus" /><p>Aucune requête.</p></div>}
      {betRequests.map((request) => {
        const tag = REQUEST_TAGS[request.status] || REQUEST_TAGS.pending;
        const stakes = requestStakeForm[request.id] || request.options.map(() => String(DEFAULT_VIRTUAL_STAKE));
        return (
          <div key={request.id} className={styles.betCard}>
            <span className={styles.tag} style={{ background: tag.bg, color: tag.color }}>{tag.label}</span>
            <h3 className={styles.betTitle}>{request.title}</h3>
            {request.description && <p className={styles.betDesc}>{request.description}</p>}
            <div className={styles.requestOptions}>
              {request.options.map((option, index) => (
                <div key={index} className={styles.requestOption}>
                  <strong>{option}</strong>
                  {request.status === 'pending' && (
                    <input type="number" min="1" value={stakes[index]} onChange={(event) => setRequestStakeForm((form) => ({ ...form, [request.id]: stakes.map((stake, stakeIndex) => stakeIndex === index ? event.target.value : stake) }))} />
                  )}
                </div>
              ))}
            </div>
            <div className={styles.betMeta}>Proposé par {request.username} · {fmtDate(request.createdAt)}</div>
            {request.status === 'pending' && (
              <div className={styles.adminActions}>
                <button className={styles.primaryBtn} onClick={() => handleAcceptRequest(request)}>Accepter et publier</button>
                <button className={styles.dangerBtn} onClick={() => handleRejectRequest(request.id)}>Refuser</button>
              </div>
            )}
          </div>
        );
      })}
    </main>
  );

  const renderAdminPeople = () => {
    const selected = selectedUser ? users[selectedUser] : null;
    const selectedWagers = selectedUser ? wagers.filter((wager) => wager.username === selectedUser) : [];
    return (
      <main className={styles.peopleLayout}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Personnes</h2>
          <div className={styles.peopleList}>
            {Object.entries(users).sort((a, b) => a[0].localeCompare(b[0])).map(([username]) => (
              <button key={username} className={`${styles.personRow} ${selectedUser === username ? styles.personRowActive : ''}`} onClick={() => handleSelectUser(username)}>
                <Icon name="user" />
                <span>{username}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          {!selected && <div className={styles.empty}><Icon name="users" /><p>Sélectionne une personne pour voir sa fiche.</p></div>}
          {selected && (
            <>
              <h2 className={styles.cardTitle}>{selectedUser}</h2>
              <div className={styles.detailGrid}>
                <div><span>Solde</span><strong>{compactCurrency(selected.balance)} {CURRENCY_NAME}</strong></div>
                <div><span>E-mail</span><strong>{selected.email || 'Non disponible'}</strong></div>
                <div><span>Inscription</span><strong>{fmtDate(selected.createdAt)}</strong></div>
                <div><span>Mises</span><strong>{selectedWagers.length}</strong></div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Modifier la quantité de {CURRENCY_NAME}</label>
                <input type="number" min="0" value={balanceDraft} onChange={(event) => setBalanceDraft(event.target.value)} />
              </div>
              <div className={styles.adminActions}>
                <button className={styles.primaryBtn} onClick={handleUpdateBalance}>Mettre à jour</button>
                <button className={styles.dangerBtn} onClick={() => handleDeleteUser(selectedUser)}>Supprimer le compte</button>
              </div>
              <h3 className={styles.sectionTitle}>Historique des mises</h3>
              {selectedWagers.length === 0 && <p className={styles.hint}>Aucune mise.</p>}
              {selectedWagers.map((wager) => {
                const bet = bets.find((item) => item.id === wager.betId);
                return <div key={wager.id} className={styles.historyRow}><strong>{compactCurrency(wager.amount)} {CURRENCY_NAME}</strong><span>{bet?.title || 'Pari supprimé'} · {bet?.options?.[wager.optionIndex] || 'Option'}</span></div>;
              })}
            </>
          )}
        </section>
      </main>
    );
  };

  const renderAdminReports = () => (
    <main className={styles.mainColumn}>
      <div className={styles.pageHeader}><h2 className={styles.pageTitle}>Signalements</h2></div>
      {reports.length === 0 && <div className={styles.empty}><Icon name="alert" /><p>Aucun signalement.</p></div>}
      {reports.map((report) => (
        <div key={report.id} className={styles.betCard}>
          <span className={styles.tag} style={{ background: report.status === 'open' ? REQUEST_TAGS.pending.bg : REQUEST_TAGS.accepted.bg, color: report.status === 'open' ? REQUEST_TAGS.pending.color : REQUEST_TAGS.accepted.color }}>
            {report.status === 'open' ? 'Ouvert' : 'Clôturé'}
          </span>
          <h3 className={styles.betTitle}>{report.subject}</h3>
          <p className={styles.betDesc}>{report.message}</p>
          <div className={styles.betMeta}>Par {report.username} · {fmtDate(report.createdAt)}</div>
          {report.status === 'open' && <div className={styles.adminActions}><button className={styles.secondaryBtn} onClick={() => handleCloseReport(report.id)}>Clôturer</button></div>}
        </div>
      ))}
    </main>
  );

  const renderPage = () => {
    if (view === 'loading') {
      return <div className={styles.center} style={{ minHeight: '100vh' }}><div className={styles.spinner} /><p>Chargement...</p></div>;
    }
    if (view === 'login') return renderLogin();
    if (currentUser?.isAdmin) {
      if (adminView === 'requests') return renderAdminRequests();
      if (adminView === 'people') return renderAdminPeople();
      if (adminView === 'reports') return renderAdminReports();
      return renderAdminBets();
    }
    if (view === 'request') return renderRequest();
    if (view === 'leaderboard') return renderLeaderboard();
    if (view === 'report') return renderReport();
    if (view === 'profile') return renderProfile();
    return renderHome();
  };

  return (
    <div className={`${styles.wrapper} ${currentUser ? styles.appShell : ''}`}>
      {notif && (
        <div className={styles.toast} style={{
          background: notif.type === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
          color: notif.type === 'error' ? 'var(--danger)' : 'var(--success)',
        }}>
          {notif.msg}
        </div>
      )}

      {renderBrand()}
      <div className={styles.contentShell}>
        <div className={styles.page}>{renderPage()}</div>
        {renderNav()}
      </div>
    </div>
  );
}

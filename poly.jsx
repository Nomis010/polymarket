import { useState, useEffect, useCallback } from "react";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";
const STARTING_BALANCE = 1000;

const STORAGE_KEYS = {
  USERS: "seeonium_users",
  BETS: "seeonium_bets",
  WAGERS: "seeonium_wagers",
};

async function loadData(key) {
  try {
    const result = await window.storage.get(key);
    return result ? JSON.parse(result.value) : null;
  } catch {
    return null;
  }
}

async function saveData(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value));
  } catch (e) {
    console.error("Storage error", e);
  }
}

const formatDate = (ts) => {
  const d = new Date(ts);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function App() {
  const [view, setView] = useState("loading"); // loading, login, register, home, admin, profile
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState({});
  const [bets, setBets] = useState([]);
  const [wagers, setWagers] = useState([]);
  const [notification, setNotification] = useState(null);
  const [loginTab, setLoginTab] = useState("login");

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ username: "", password: "", confirm: "" });
  const [newBet, setNewBet] = useState({ title: "", description: "", options: ["", ""], odds: ["2.0", "2.0"], closesAt: "" });
  const [wagerForm, setWagerForm] = useState({});
  const [betFilter, setBetFilter] = useState("open");
  const [selectedBet, setSelectedBet] = useState(null);

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    (async () => {
      const u = await loadData(STORAGE_KEYS.USERS) || {};
      const b = await loadData(STORAGE_KEYS.BETS) || [];
      const w = await loadData(STORAGE_KEYS.WAGERS) || [];
      setUsers(u);
      setBets(b);
      setWagers(w);
      setView("login");
    })();
  }, []);

  const saveUsers = useCallback(async (u) => {
    setUsers(u);
    await saveData(STORAGE_KEYS.USERS, u);
  }, []);

  const saveBets = useCallback(async (b) => {
    setBets(b);
    await saveData(STORAGE_KEYS.BETS, b);
  }, []);

  const saveWagers = useCallback(async (w) => {
    setWagers(w);
    await saveData(STORAGE_KEYS.WAGERS, w);
  }, []);

  const handleLogin = async () => {
    const { username, password } = loginForm;
    if (!username || !password) return notify("Remplis tous les champs", "error");
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setCurrentUser({ username: "admin", isAdmin: true });
      setView("admin");
      return;
    }
    const user = users[username];
    if (!user || user.password !== password) return notify("Identifiants incorrects", "error");
    setCurrentUser({ username, isAdmin: false });
    setView("home");
  };

  const handleRegister = async () => {
    const { username, password, confirm } = registerForm;
    if (!username || !password || !confirm) return notify("Remplis tous les champs", "error");
    if (password !== confirm) return notify("Les mots de passe ne correspondent pas", "error");
    if (username === ADMIN_USERNAME) return notify("Ce nom d'utilisateur est réservé", "error");
    if (username.length < 3) return notify("Pseudo trop court (min 3 caractères)", "error");
    if (users[username]) return notify("Ce pseudo est déjà pris", "error");
    const newUsers = { ...users, [username]: { password, balance: STARTING_BALANCE, createdAt: Date.now() } };
    await saveUsers(newUsers);
    notify("Compte créé ! Tu peux te connecter.");
    setLoginTab("login");
    setLoginForm({ username, password: "" });
    setRegisterForm({ username: "", password: "", confirm: "" });
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView("login");
    setLoginForm({ username: "", password: "" });
  };

  const handleCreateBet = async () => {
    const { title, description, options, odds, closesAt } = newBet;
    if (!title) return notify("Titre requis", "error");
    if (options.some(o => !o.trim())) return notify("Toutes les options doivent être remplies", "error");
    if (odds.some(o => isNaN(parseFloat(o)) || parseFloat(o) < 1)) return notify("Les cotes doivent être ≥ 1", "error");
    const bet = {
      id: Date.now().toString(),
      title, description,
      options: options.map(o => o.trim()),
      odds: odds.map(o => parseFloat(parseFloat(o).toFixed(2))),
      status: "open",
      createdAt: Date.now(),
      closesAt: closesAt ? new Date(closesAt).getTime() : null,
      resolvedOption: null,
    };
    await saveBets([...bets, bet]);
    setNewBet({ title: "", description: "", options: ["", ""], odds: ["2.0", "2.0"], closesAt: "" });
    notify("Paris créé !");
  };

  const handleAddOption = () => {
    setNewBet(b => ({ ...b, options: [...b.options, ""], odds: [...b.odds, "2.0"] }));
  };

  const handleRemoveOption = (i) => {
    if (newBet.options.length <= 2) return;
    setNewBet(b => ({
      ...b,
      options: b.options.filter((_, idx) => idx !== i),
      odds: b.odds.filter((_, idx) => idx !== i),
    }));
  };

  const handleResolveBet = async (betId, optionIndex) => {
    const bet = bets.find(b => b.id === betId);
    if (!bet) return;
    const betWagers = wagers.filter(w => w.betId === betId);
    const newUsers = { ...users };
    betWagers.forEach(w => {
      if (w.optionIndex === optionIndex) {
        const gain = Math.floor(w.amount * bet.odds[optionIndex]);
        if (newUsers[w.username]) {
          newUsers[w.username].balance += gain;
        }
      }
    });
    const updatedBets = bets.map(b => b.id === betId ? { ...b, status: "resolved", resolvedOption: optionIndex } : b);
    await saveUsers(newUsers);
    await saveBets(updatedBets);
    notify(`Paris résolu ! Gagnants payés.`);
  };

  const handleCloseBet = async (betId) => {
    const updatedBets = bets.map(b => b.id === betId ? { ...b, status: "closed" } : b);
    await saveBets(updatedBets);
    notify("Paris fermé aux nouvelles mises.");
  };

  const handleDeleteBet = async (betId) => {
    const updatedBets = bets.filter(b => b.id !== betId);
    const updatedWagers = wagers.filter(w => w.betId !== betId);
    await saveBets(updatedBets);
    await saveWagers(updatedWagers);
    notify("Paris supprimé.");
  };

  const handleWager = async (betId) => {
    const amount = parseInt(wagerForm[betId]?.amount);
    const optionIndex = wagerForm[betId]?.option;
    if (!amount || amount < 1) return notify("Mise minimum : 1 🪙", "error");
    if (optionIndex === undefined || optionIndex === null) return notify("Choisis une option", "error");
    const user = users[currentUser.username];
    if (!user || user.balance < amount) return notify("Solde insuffisant", "error");
    const bet = bets.find(b => b.id === betId);
    if (!bet || bet.status !== "open") return notify("Ce paris n'est plus ouvert", "error");
    const existing = wagers.find(w => w.betId === betId && w.username === currentUser.username);
    if (existing) return notify("Tu as déjà misé sur ce paris", "error");
    const newUsers = { ...users };
    newUsers[currentUser.username] = { ...user, balance: user.balance - amount };
    const newWager = { id: Date.now().toString(), betId, username: currentUser.username, amount, optionIndex, createdAt: Date.now() };
    await saveUsers(newUsers);
    await saveWagers([...wagers, newWager]);
    setWagerForm(f => ({ ...f, [betId]: {} }));
    notify(`Mise de ${amount} 🪙 placée !`);
  };

  const getUserBalance = () => {
    if (!currentUser || currentUser.isAdmin) return null;
    return users[currentUser.username]?.balance ?? 0;
  };

  const getFilteredBets = () => {
    if (betFilter === "all") return bets;
    return bets.filter(b => b.status === betFilter);
  };

  const getUserWager = (betId) => wagers.find(w => w.betId === betId && w.username === currentUser?.username);

  const leaderboard = Object.entries(users)
    .map(([username, data]) => ({ username, balance: data.balance }))
    .sort((a, b) => b.balance - a.balance);

  if (view === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, flexDirection: "column", gap: 16 }}>
        <div style={{ width: 40, height: 40, border: "3px solid var(--color-border-tertiary)", borderTop: "3px solid #E4A020", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>Chargement...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const goldColor = "#E4A020";
  const goldLight = "#FBF0D3";
  const goldDark = "#9B6A0A";

  const styles = {
    container: { maxWidth: 860, margin: "0 auto", padding: "0 16px 40px", fontFamily: "'Georgia', serif" },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0 12px", borderBottom: `2px solid ${goldColor}`, marginBottom: 24 },
    logo: { fontSize: 26, fontWeight: "bold", color: goldColor, letterSpacing: "-0.5px", fontFamily: "Georgia, serif" },
    logoSub: { fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "sans-serif", marginLeft: 2 },
    navBtn: { background: "none", border: `1px solid var(--color-border-secondary)`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, color: "var(--color-text-primary)", fontFamily: "sans-serif" },
    balance: { background: goldLight, color: goldDark, borderRadius: 20, padding: "5px 14px", fontSize: 14, fontWeight: "bold", fontFamily: "sans-serif", border: `1px solid ${goldColor}` },
    card: { background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "18px 20px", marginBottom: 14 },
    betCard: { background: "var(--color-background-primary)", border: `0.5px solid var(--color-border-tertiary)`, borderRadius: 12, padding: "18px 20px", marginBottom: 14, transition: "border-color 0.2s" },
    h2: { fontSize: 20, fontWeight: "bold", margin: "0 0 16px", color: "var(--color-text-primary)" },
    label: { fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 4, display: "block", fontFamily: "sans-serif" },
    input: { width: "100%", boxSizing: "border-box" },
    primaryBtn: { background: goldColor, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontSize: 14, fontWeight: "bold", fontFamily: "sans-serif" },
    secondaryBtn: { background: "none", border: `1px solid ${goldColor}`, color: goldColor, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontFamily: "sans-serif" },
    dangerBtn: { background: "none", border: "1px solid var(--color-border-danger)", color: "var(--color-text-danger)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontFamily: "sans-serif" },
    tag: (status) => {
      const map = { open: { bg: "#E5F7EE", color: "#1A7A44" }, closed: { bg: "#F0F0F0", color: "#555" }, resolved: { bg: "#FFF3CD", color: "#856404" } };
      const s = map[status] || map.closed;
      return { background: s.bg, color: s.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: "bold", fontFamily: "sans-serif", display: "inline-block" };
    },
    notification: (type) => ({
      position: "fixed", top: 20, right: 20, zIndex: 999,
      background: type === "error" ? "#FEE2E2" : "#D1FAE5",
      color: type === "error" ? "#991B1B" : "#065F46",
      border: type === "error" ? "1px solid #FCA5A5" : "1px solid #6EE7B7",
      borderRadius: 10, padding: "12px 18px", fontSize: 14, fontFamily: "sans-serif",
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxWidth: 300,
    }),
    tab: (active) => ({
      padding: "8px 20px", cursor: "pointer", borderRadius: "8px 8px 0 0",
      background: active ? "var(--color-background-primary)" : "var(--color-background-secondary)",
      border: active ? "0.5px solid var(--color-border-tertiary)" : "none",
      borderBottom: active ? "0.5px solid var(--color-background-primary)" : "0.5px solid var(--color-border-tertiary)",
      color: active ? goldColor : "var(--color-text-secondary)",
      fontFamily: "sans-serif", fontSize: 14, fontWeight: active ? "bold" : "normal",
      marginBottom: -1,
    }),
  };

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input, select, textarea { font-family: sans-serif; }
        button:hover { opacity: 0.85; }
      `}</style>

      {notification && <div style={styles.notification(notification.type)}>{notification.msg}</div>}

      <div style={styles.header}>
        <div>
          <span style={styles.logo}>🪙 Seeonium</span>
          <div style={styles.logoSub}>La monnaie fictive entre amis</div>
        </div>
        {currentUser && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!currentUser.isAdmin && <span style={styles.balance}>{getUserBalance()?.toLocaleString("fr-FR")} 🪙</span>}
            {!currentUser.isAdmin && (
              <button style={styles.navBtn} onClick={() => setView("leaderboard")}>🏆 Classement</button>
            )}
            {currentUser.isAdmin && <span style={{ ...styles.balance, background: "#EDE9FE", color: "#5B21B6", borderColor: "#A78BFA" }}>Admin</span>}
            {currentUser.isAdmin && <button style={styles.navBtn} onClick={() => setView("admin")}>Gestion</button>}
            {!currentUser.isAdmin && <button style={styles.navBtn} onClick={() => setView("home")}>Paris</button>}
            <button style={styles.dangerBtn} onClick={handleLogout}>Déconnexion</button>
          </div>
        )}
      </div>

      {/* ===== LOGIN / REGISTER ===== */}
      {view === "login" && (
        <div style={{ maxWidth: 420, margin: "40px auto 0" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 48 }}>🪙</div>
            <h1 style={{ fontSize: 28, fontWeight: "bold", color: goldColor, marginBottom: 6 }}>Seeonium</h1>
            <p style={{ color: "var(--color-text-secondary)", fontSize: 14, fontFamily: "sans-serif" }}>La plateforme de paris fictifs entre amis</p>
          </div>
          <div style={{ display: "flex", borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: 0 }}>
            {["login", "register"].map(t => (
              <button key={t} onClick={() => setLoginTab(t)} style={styles.tab(loginTab === t)}>
                {t === "login" ? "Se connecter" : "S'inscrire"}
              </button>
            ))}
          </div>
          <div style={{ ...styles.card, borderRadius: "0 12px 12px 12px", marginTop: 0, paddingTop: 24 }}>
            {loginTab === "login" ? (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={styles.label}>Pseudo</label>
                  <input style={styles.input} value={loginForm.username} onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))} placeholder="Ton pseudo" onKeyDown={e => e.key === "Enter" && handleLogin()} />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={styles.label}>Mot de passe</label>
                  <input style={styles.input} type="password" value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleLogin()} />
                </div>
                <button style={{ ...styles.primaryBtn, width: "100%" }} onClick={handleLogin}>Se connecter</button>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 12, fontFamily: "sans-serif", textAlign: "center" }}>
                  Admin : pseudo <strong>admin</strong> / mdp <strong>admin123</strong>
                </p>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={styles.label}>Choisis un pseudo</label>
                  <input style={styles.input} value={registerForm.username} onChange={e => setRegisterForm(f => ({ ...f, username: e.target.value }))} placeholder="Min. 3 caractères" />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={styles.label}>Mot de passe</label>
                  <input style={styles.input} type="password" value={registerForm.password} onChange={e => setRegisterForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={styles.label}>Confirme le mot de passe</label>
                  <input style={styles.input} type="password" value={registerForm.confirm} onChange={e => setRegisterForm(f => ({ ...f, confirm: e.target.value }))} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleRegister()} />
                </div>
                <button style={{ ...styles.primaryBtn, width: "100%" }} onClick={handleRegister}>Créer mon compte</button>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 12, fontFamily: "sans-serif", textAlign: "center" }}>
                  Tu commences avec <strong>1 000 🪙 Seeonium</strong> offerts !
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== HOME (User bets) ===== */}
      {view === "home" && currentUser && !currentUser.isAdmin && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ ...styles.h2, margin: 0 }}>Paris disponibles</h2>
            <div style={{ display: "flex", gap: 6 }}>
              {["open", "closed", "resolved", "all"].map(f => (
                <button key={f} onClick={() => setBetFilter(f)} style={{
                  ...styles.navBtn,
                  background: betFilter === f ? goldColor : "none",
                  color: betFilter === f ? "#fff" : "var(--color-text-primary)",
                  border: `1px solid ${betFilter === f ? goldColor : "var(--color-border-secondary)"}`,
                }}>
                  {{ open: "Ouverts", closed: "Fermés", resolved: "Résolus", all: "Tous" }[f]}
                </button>
              ))}
            </div>
          </div>

          {getFilteredBets().length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-secondary)", fontFamily: "sans-serif" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎲</div>
              <p>Aucun paris pour l'instant.<br />L'admin doit en créer !</p>
            </div>
          )}

          {getFilteredBets().map(bet => {
            const myWager = getUserWager(bet.id);
            const betWagers = wagers.filter(w => w.betId === bet.id);
            const totalPool = betWagers.reduce((s, w) => s + w.amount, 0);
            return (
              <div key={bet.id} style={styles.betCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <span style={styles.tag(bet.status)}>{{ open: "Ouvert", closed: "Fermé", resolved: "Résolu" }[bet.status]}</span>
                    <h3 style={{ margin: "8px 0 4px", fontSize: 17, fontWeight: "bold", color: "var(--color-text-primary)" }}>{bet.title}</h3>
                    {bet.description && <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "sans-serif" }}>{bet.description}</p>}
                  </div>
                  <div style={{ marginLeft: 12, textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "sans-serif" }}>Cagnotte totale</div>
                    <div style={{ fontSize: 16, fontWeight: "bold", color: goldColor }}>{totalPool.toLocaleString("fr-FR")} 🪙</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: `repeat(${bet.options.length}, 1fr)`, gap: 8, marginBottom: 12 }}>
                  {bet.options.map((opt, i) => {
                    const optWagers = betWagers.filter(w => w.optionIndex === i);
                    const optTotal = optWagers.reduce((s, w) => s + w.amount, 0);
                    const pct = totalPool > 0 ? Math.round((optTotal / totalPool) * 100) : 0;
                    const isWinner = bet.resolvedOption === i;
                    return (
                      <div key={i} style={{
                        border: `1px solid ${isWinner ? "#22C55E" : "var(--color-border-secondary)"}`,
                        background: isWinner ? "#F0FDF4" : "var(--color-background-secondary)",
                        borderRadius: 8, padding: "10px 12px",
                      }}>
                        <div style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: "bold", marginBottom: 4 }}>{opt}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 18, fontWeight: "bold", color: goldColor }}>x{bet.odds[i]}</span>
                          <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "sans-serif" }}>{pct}% ({optTotal} 🪙)</span>
                        </div>
                        {isWinner && <div style={{ fontSize: 11, color: "#15803D", fontFamily: "sans-serif", marginTop: 4, fontWeight: "bold" }}>✓ GAGNANT</div>}
                      </div>
                    );
                  })}
                </div>

                {myWager && (
                  <div style={{ background: goldLight, border: `1px solid ${goldColor}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "sans-serif", marginBottom: 10, color: goldDark }}>
                    ✓ Ta mise : <strong>{myWager.amount} 🪙</strong> sur <strong>"{bet.options[myWager.optionIndex]}"</strong>
                    {bet.status === "resolved" && (
                      myWager.optionIndex === bet.resolvedOption
                        ? <span style={{ color: "#16A34A", marginLeft: 8 }}>🎉 Gagné ! +{Math.floor(myWager.amount * bet.odds[myWager.optionIndex])} 🪙</span>
                        : <span style={{ color: "#DC2626", marginLeft: 8 }}>😢 Perdu</span>
                    )}
                  </div>
                )}

                {bet.status === "open" && !myWager && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <select
                      style={{ flex: 1, minWidth: 120 }}
                      value={wagerForm[bet.id]?.option ?? ""}
                      onChange={e => setWagerForm(f => ({ ...f, [bet.id]: { ...f[bet.id], option: parseInt(e.target.value) } }))}
                    >
                      <option value="">Choisir une option...</option>
                      {bet.options.map((opt, i) => <option key={i} value={i}>{opt} (x{bet.odds[i]})</option>)}
                    </select>
                    <input
                      type="number" min="1" max={getUserBalance()}
                      style={{ width: 100 }}
                      placeholder="Mise 🪙"
                      value={wagerForm[bet.id]?.amount ?? ""}
                      onChange={e => setWagerForm(f => ({ ...f, [bet.id]: { ...f[bet.id], amount: e.target.value } }))}
                    />
                    <button style={styles.primaryBtn} onClick={() => handleWager(bet.id)}>Miser</button>
                  </div>
                )}

                <div style={{ marginTop: 10, fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "sans-serif" }}>
                  Créé le {formatDate(bet.createdAt)} · {betWagers.length} parieur{betWagers.length > 1 ? "s" : ""}
                  {bet.closesAt && bet.status === "open" && <span> · Ferme le {formatDate(bet.closesAt)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== LEADERBOARD ===== */}
      {view === "leaderboard" && (
        <div>
          <h2 style={styles.h2}>🏆 Classement</h2>
          <div style={styles.card}>
            {leaderboard.length === 0 && <p style={{ color: "var(--color-text-secondary)", fontFamily: "sans-serif", textAlign: "center", padding: "20px 0" }}>Aucun joueur pour l'instant.</p>}
            {leaderboard.map((u, i) => (
              <div key={u.username} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: i < leaderboard.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                <span style={{ width: 32, fontSize: 18, textAlign: "center" }}>{["🥇", "🥈", "🥉"][i] || `#${i + 1}`}</span>
                <span style={{ flex: 1, fontWeight: i === 0 ? "bold" : "normal", fontFamily: "sans-serif", marginLeft: 8, color: u.username === currentUser?.username ? goldColor : "var(--color-text-primary)" }}>
                  {u.username} {u.username === currentUser?.username ? "(toi)" : ""}
                </span>
                <span style={{ fontWeight: "bold", color: goldColor, fontFamily: "sans-serif" }}>{u.balance.toLocaleString("fr-FR")} 🪙</span>
              </div>
            ))}
          </div>
          <button style={styles.secondaryBtn} onClick={() => setView("home")}>← Retour aux paris</button>
        </div>
      )}

      {/* ===== ADMIN ===== */}
      {view === "admin" && currentUser?.isAdmin && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 28 }}>
            {[
              { label: "Paris créés", value: bets.length, icon: "🎲" },
              { label: "Joueurs inscrits", value: Object.keys(users).length, icon: "👥" },
              { label: "Mises totales", value: wagers.length, icon: "💰" },
              { label: "Paris ouverts", value: bets.filter(b => b.status === "open").length, icon: "✅" },
            ].map(s => (
              <div key={s.label} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "14px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 24 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: "bold", color: goldColor }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "sans-serif" }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={styles.card}>
            <h2 style={styles.h2}>Créer un nouveau paris</h2>
            <div style={{ marginBottom: 14 }}>
              <label style={styles.label}>Titre du paris *</label>
              <input style={styles.input} value={newBet.title} onChange={e => setNewBet(b => ({ ...b, title: e.target.value }))} placeholder="Ex: Qui va gagner la coupe du monde ?" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={styles.label}>Description (optionnel)</label>
              <textarea style={{ ...styles.input, minHeight: 60, resize: "vertical", fontFamily: "sans-serif", padding: "8px 12px" }} value={newBet.description} onChange={e => setNewBet(b => ({ ...b, description: e.target.value }))} placeholder="Détails supplémentaires..." />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={styles.label}>Date de fermeture (optionnel)</label>
              <input type="datetime-local" style={{ ...styles.input, width: "auto" }} value={newBet.closesAt} onChange={e => setNewBet(b => ({ ...b, closesAt: e.target.value }))} />
            </div>
            <label style={styles.label}>Options et cotes</label>
            {newBet.options.map((opt, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input placeholder={`Option ${i + 1}`} value={opt} onChange={e => setNewBet(b => ({ ...b, options: b.options.map((o, idx) => idx === i ? e.target.value : o) }))} style={{ flex: 3 }} />
                <input type="number" step="0.1" min="1.1" value={newBet.odds[i]} onChange={e => setNewBet(b => ({ ...b, odds: b.odds.map((o, idx) => idx === i ? e.target.value : o) }))} style={{ flex: 1, minWidth: 70 }} placeholder="Cote" />
                <button onClick={() => handleRemoveOption(i)} style={{ ...styles.dangerBtn, padding: "6px 10px" }} disabled={newBet.options.length <= 2}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button style={styles.secondaryBtn} onClick={handleAddOption}>+ Ajouter une option</button>
              <button style={styles.primaryBtn} onClick={handleCreateBet}>Créer le paris</button>
            </div>
          </div>

          <h2 style={styles.h2}>Tous les paris</h2>
          {bets.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", color: "var(--color-text-secondary)", fontFamily: "sans-serif" }}>Aucun paris créé.</div>}
          {[...bets].reverse().map(bet => {
            const betWagers = wagers.filter(w => w.betId === bet.id);
            const totalPool = betWagers.reduce((s, w) => s + w.amount, 0);
            return (
              <div key={bet.id} style={styles.betCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span style={styles.tag(bet.status)}>{{ open: "Ouvert", closed: "Fermé", resolved: "Résolu" }[bet.status]}</span>
                    <h3 style={{ margin: "6px 0 4px", fontSize: 16 }}>{bet.title}</h3>
                    {bet.description && <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "sans-serif" }}>{bet.description}</p>}
                  </div>
                  <div style={{ textAlign: "right", marginLeft: 16, flexShrink: 0 }}>
                    <div style={{ fontSize: 13, color: goldColor, fontWeight: "bold" }}>{totalPool} 🪙 en jeu</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "sans-serif" }}>{betWagers.length} mise{betWagers.length > 1 ? "s" : ""}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {bet.options.map((opt, i) => {
                    const cnt = betWagers.filter(w => w.optionIndex === i).length;
                    return (
                      <span key={i} style={{ background: "var(--color-background-secondary)", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontFamily: "sans-serif", border: "0.5px solid var(--color-border-secondary)" }}>
                        {opt} <strong>x{bet.odds[i]}</strong> ({cnt})
                      </span>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {bet.status === "open" && (
                    <button style={styles.navBtn} onClick={() => handleCloseBet(bet.id)}>🔒 Fermer les mises</button>
                  )}
                  {(bet.status === "open" || bet.status === "closed") && (
                    <>
                      <span style={{ fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "sans-serif" }}>Résoudre :</span>
                      {bet.options.map((opt, i) => (
                        <button key={i} style={{ ...styles.primaryBtn, padding: "6px 12px", fontSize: 12 }} onClick={() => handleResolveBet(bet.id, i)}>✓ "{opt}"</button>
                      ))}
                    </>
                  )}
                  <button style={styles.dangerBtn} onClick={() => handleDeleteBet(bet.id)}>🗑 Supprimer</button>
                </div>
              </div>
            );
          })}

          <div style={{ ...styles.card, marginTop: 20 }}>
            <h2 style={styles.h2}>Joueurs</h2>
            {Object.keys(users).length === 0 && <p style={{ color: "var(--color-text-secondary)", fontFamily: "sans-serif" }}>Aucun joueur inscrit.</p>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {Object.entries(users).sort((a, b) => b[1].balance - a[1].balance).map(([u, data]) => (
                <div key={u} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: "sans-serif", fontWeight: "bold", fontSize: 14 }}>{u}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "sans-serif" }}>Inscrit le {formatDate(data.createdAt)}</div>
                  </div>
                  <div style={{ fontWeight: "bold", color: goldColor, fontFamily: "sans-serif" }}>{data.balance.toLocaleString("fr-FR")} 🪙</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

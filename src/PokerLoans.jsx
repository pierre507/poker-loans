import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabaseClient";

// ==================== CURRENCY CONFIG ====================
const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar", decimals: 2 },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", decimals: 2 },
  { code: "EUR", symbol: "€", name: "Euro", decimals: 2 },
  { code: "GBP", symbol: "£", name: "British Pound", decimals: 2 },
  { code: "BTC", symbol: "₿", name: "Bitcoin", decimals: 8 },
  { code: "ETH", symbol: "Ξ", name: "Ethereum", decimals: 8 },
  { code: "USDT", symbol: "₮", name: "Tether", decimals: 2 },
  { code: "USDC", symbol: "◉", name: "USD Coin", decimals: 2 },
];

const getCurrencyConfig = (code) => {
  const found = CURRENCIES.find((c) => c.code === code);
  if (found) return found;
  return { code, symbol: code, name: code, decimals: 2 };
};

const formatAmount = (amount, currencyCode = "USD") => {
  const config = getCurrencyConfig(currencyCode);
  const abs = Math.abs(Number(amount));
  if (config.decimals > 2) {
    // Crypto: trim trailing zeros but keep at least 2 decimals
    const fixed = abs.toFixed(config.decimals);
    const trimmed = fixed.replace(/0+$/, "").replace(/\.$/, "");
    const parts = trimmed.split(".");
    const decimals = parts[1] || "";
    const padded = decimals.length < 2 ? trimmed + "0".repeat(2 - decimals.length) : trimmed;
    return `${config.symbol}${padded}`;
  }
  return `${config.symbol}${abs.toLocaleString("en-US", { minimumFractionDigits: config.decimals, maximumFractionDigits: config.decimals })}`;
};

const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const formatDateTime = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
};

const calculateInterest = (principal, rate, startDate) => {
  if (!rate || rate === 0) return 0;
  const start = new Date(startDate);
  const now = new Date();
  const days = Math.max(0, (now - start) / (1000 * 60 * 60 * 24));
  return principal * (rate / 100) * (days / 365);
};

const getDebtColor = (index, total) => {
  const t = total <= 1 ? 0.5 : index / (total - 1);
  return `rgb(${Math.round(220 - t * 80)}, ${Math.round(30 + t * 20)}, ${Math.round(30 + t * 20)})`;
};

const getLoanColor = (index, total) => {
  const t = total <= 1 ? 0.5 : index / (total - 1);
  return `rgb(${Math.round(20 + t * 30)}, ${Math.round(200 - t * 80)}, ${Math.round(60 + t * 20)})`;
};

// ==================== SWIPEABLE ROW (BUG FIX) ====================
const SwipeableRow = ({ children, onSwipeAction, personId }) => {
  const startX = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);
  const hasMoved = useRef(false);
  const [offset, setOffset] = useState(0);
  const [showActions, setShowActions] = useState(false);

  const handleStart = (clientX) => {
    startX.current = clientX;
    swiping.current = true;
    hasMoved.current = false;
  };
  const handleMove = (clientX) => {
    if (!swiping.current) return;
    const diff = clientX - startX.current;
    if (Math.abs(diff) > 5) hasMoved.current = true;
    if (diff < 0) { currentX.current = diff; setOffset(Math.max(diff, -200)); }
  };
  const handleEnd = () => {
    swiping.current = false;
    if (currentX.current < -80) { setShowActions(true); setOffset(-200); }
    else { setOffset(0); setShowActions(false); }
    currentX.current = 0;
  };
  const closeActions = () => { setOffset(0); setShowActions(false); };

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 200, display: "flex", alignItems: "stretch", zIndex: 3 }}>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); closeActions(); setTimeout(() => onSwipeAction("partial"), 50); }}
          style={{ flex: 1, background: "#FFB800", border: "none", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: "0 2px", touchAction: "manipulation" }}>
          Partial
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); closeActions(); setTimeout(() => onSwipeAction("full"), 50); }}
          style={{ flex: 1, background: "#00C853", border: "none", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: "0 2px", touchAction: "manipulation" }}>
          Collect All
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); closeActions(); setTimeout(() => onSwipeAction("add"), 50); }}
          style={{ flex: 1, background: "#2196F3", border: "none", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: "0 2px", touchAction: "manipulation" }}>
          Add More
        </button>
      </div>
      <div
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={handleEnd}
        onMouseDown={(e) => handleStart(e.clientX)}
        onMouseMove={(e) => { if (swiping.current) handleMove(e.clientX); }}
        onMouseUp={handleEnd}
        onMouseLeave={() => { if (swiping.current) handleEnd(); }}
        style={{ transform: `translateX(${offset}px)`, transition: swiping.current ? "none" : "transform 0.3s ease", position: "relative", zIndex: 4, cursor: "grab", userSelect: "none" }}>
        {children}
      </div>
      {showActions && <div onClick={closeActions} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }} />}
    </div>
  );
};

// ==================== MODAL ====================
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1a1a", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto", border: "1px solid #333" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "#333", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
};

const inputStyle = { width: "100%", padding: "12px 14px", background: "#2a2a2a", border: "1px solid #444", borderRadius: 10, color: "#fff", fontSize: 15, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" };
const labelStyle = { display: "block", marginBottom: 6, fontSize: 13, color: "#999", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" };

// ==================== MAIN APP ====================
export default function PokerLoans({ session }) {
  const userId = session.user.id;
  const [people, setPeople] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [completedRecords, setCompletedRecords] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("debts");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("amount");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCollectModal, setShowCollectModal] = useState(null);
  const [showAddMoreModal, setShowAddMoreModal] = useState(null);
  const [showPersonDetail, setShowPersonDetail] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [customCurrencies, setCustomCurrencies] = useState([]);
  const [newCustomCode, setNewCustomCode] = useState("");
  const [newCustomSymbol, setNewCustomSymbol] = useState("");
  const [newCustomName, setNewCustomName] = useState("");
  const [newCustomDecimals, setNewCustomDecimals] = useState("2");
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newType, setNewType] = useState("debt");
  const [newCurrency, setNewCurrency] = useState("USD");
  const [newInterestRate, setNewInterestRate] = useState("");
  const [newNote, setNewNote] = useState("");
  const [collectAmount, setCollectAmount] = useState("");
  const [collectNote, setCollectNote] = useState("");
  const [addMoreAmount, setAddMoreAmount] = useState("");
  const [addMoreNote, setAddMoreNote] = useState("");
  const [reminderPerson, setReminderPerson] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderNote, setReminderNote] = useState("");

  // Load custom currencies from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("poker-loans-custom-currencies");
      if (stored) setCustomCurrencies(JSON.parse(stored));
    } catch (e) {}
  }, []);

  const allCurrencies = [...CURRENCIES, ...customCurrencies];

  const getAllCurrencyConfig = (code) => {
    const found = allCurrencies.find((c) => c.code === code);
    if (found) return found;
    return { code, symbol: code, name: code, decimals: 2 };
  };

  const formatAmountWithConfig = (amount, currencyCode = "USD") => {
    const config = getAllCurrencyConfig(currencyCode);
    const abs = Math.abs(Number(amount));
    if (config.decimals > 2) {
      const fixed = abs.toFixed(config.decimals);
      const trimmed = fixed.replace(/0+$/, "").replace(/\.$/, "");
      const parts = trimmed.split(".");
      const decimals = parts[1] || "";
      const padded = decimals.length < 2 ? trimmed + "0".repeat(2 - decimals.length) : trimmed;
      return `${config.symbol}${padded}`;
    }
    return `${config.symbol}${abs.toLocaleString("en-US", { minimumFractionDigits: config.decimals, maximumFractionDigits: config.decimals })}`;
  };

  const addCustomCurrency = () => {
    if (!newCustomCode.trim() || !newCustomSymbol.trim()) return;
    const newCurr = {
      code: newCustomCode.trim().toUpperCase(),
      symbol: newCustomSymbol.trim(),
      name: newCustomName.trim() || newCustomCode.trim().toUpperCase(),
      decimals: parseInt(newCustomDecimals) || 2,
    };
    const updated = [...customCurrencies, newCurr];
    setCustomCurrencies(updated);
    localStorage.setItem("poker-loans-custom-currencies", JSON.stringify(updated));
    setNewCustomCode(""); setNewCustomSymbol(""); setNewCustomName(""); setNewCustomDecimals("2");
  };

  // ==================== DATA LOADING ====================
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [pRes, tRes, cRes, rRes] = await Promise.all([
      supabase.from("people").select("*").eq("user_id", userId).order("balance", { ascending: false }),
      supabase.from("transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("completed_records").select("*").eq("user_id", userId).order("completed_at", { ascending: false }),
      supabase.from("reminders").select("*").eq("user_id", userId).order("reminder_date", { ascending: true }),
    ]);
    if (pRes.data) setPeople(pRes.data);
    if (tRes.data) setTransactions(tRes.data);
    if (cRes.data) setCompletedRecords(cRes.data);
    if (rRes.data) setReminders(rRes.data);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ==================== DERIVED STATE ====================
  const debts = people.filter((p) => p.type === "debt").sort((a, b) => sortBy === "amount" ? b.balance - a.balance : a.name.localeCompare(b.name));
  const loans = people.filter((p) => p.type === "loan").sort((a, b) => sortBy === "amount" ? b.balance - a.balance : a.name.localeCompare(b.name));
  const activeList = activeTab === "debts" ? debts : loans;
  const filteredList = activeList.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // Net position per currency
  const netPositions = {};
  people.forEach((p) => {
    const curr = p.currency || "USD";
    if (!netPositions[curr]) netPositions[curr] = 0;
    if (p.type === "loan") netPositions[curr] += Number(p.balance);
    else netPositions[curr] -= Number(p.balance);
  });

  // Totals per currency for tabs
  const debtsByCurrency = {};
  const loansByCurrency = {};
  debts.forEach((p) => {
    const c = p.currency || "USD";
    debtsByCurrency[c] = (debtsByCurrency[c] || 0) + Number(p.balance);
  });
  loans.forEach((p) => {
    const c = p.currency || "USD";
    loansByCurrency[c] = (loansByCurrency[c] || 0) + Number(p.balance);
  });

  const formatTotals = (byCurrency) => {
    const entries = Object.entries(byCurrency);
    if (entries.length === 0) return formatAmountWithConfig(0, "USD");
    if (entries.length === 1) return formatAmountWithConfig(entries[0][1], entries[0][0]);
    return entries.map(([c, v]) => formatAmountWithConfig(v, c)).join(" · ");
  };

  // ==================== CREATE ====================
  const handleCreate = async () => {
    if (!newName.trim() || !newAmount || parseFloat(newAmount) <= 0) return;
    const amount = parseFloat(newAmount);
    const { data: person, error: pErr } = await supabase.from("people").insert({
      user_id: userId, name: newName.trim(), type: newType, balance: amount,
      original_amount: amount, interest_rate: parseFloat(newInterestRate) || 0,
      currency: newCurrency,
      notes: newNote ? [{ text: newNote, date: new Date().toISOString() }] : [],
    }).select().single();
    if (pErr) { console.error(pErr); return; }
    await supabase.from("transactions").insert({
      user_id: userId, person_id: person.id, person_name: person.name,
      type: "created", amount, balance_after: amount, entry_type: newType,
      currency: newCurrency,
      note: newNote || `Created ${newType} for ${person.name}`,
    });
    setNewName(""); setNewAmount(""); setNewType("debt"); setNewCurrency("USD");
    setNewInterestRate(""); setNewNote("");
    setShowCreateModal(false);
    fetchData();
  };

  // ==================== TRANSACTIONS ====================
  const handleTransaction = async (person, amount, action, note = "") => {
    let newBalance, newType, transactionType;
    const currency = person.currency || "USD";
    if (action === "collect") {
      newBalance = Number(person.balance) - amount;
      if (newBalance < 0) { newType = person.type === "debt" ? "loan" : "debt"; newBalance = Math.abs(newBalance); transactionType = "flipped"; }
      else if (newBalance === 0) { transactionType = "completed"; }
      else { newType = person.type; transactionType = "partial_collect"; }
    } else if (action === "add") {
      newBalance = Number(person.balance) + amount; newType = person.type; transactionType = "added";
    }
    await supabase.from("transactions").insert({
      user_id: userId, person_id: person.id, person_name: person.name,
      type: transactionType, amount, balance_before: person.balance,
      balance_after: newBalance, entry_type: newType || person.type,
      previous_type: person.type, currency, note: note || "",
    });
    if (transactionType === "completed") {
      await supabase.from("completed_records").insert({
        user_id: userId, original_person_id: person.id, name: person.name,
        type: person.type, original_amount: person.original_amount,
        interest_rate: person.interest_rate, currency, notes: person.notes, created_at: person.created_at,
      });
      await supabase.from("people").delete().eq("id", person.id);
    } else {
      const updatedNotes = note ? [...(person.notes || []), { text: note, date: new Date().toISOString() }] : person.notes || [];
      await supabase.from("people").update({
        balance: newBalance, type: newType || person.type, notes: updatedNotes, updated_at: new Date().toISOString(),
      }).eq("id", person.id);
    }
    fetchData();
  };

  // ==================== REMINDERS ====================
  const handleAddReminder = async () => {
    if (!reminderPerson || !reminderDate) return;
    await supabase.from("reminders").insert({ user_id: userId, person_name: reminderPerson, reminder_date: reminderDate, note: reminderNote });
    setReminderPerson(""); setReminderDate(""); setReminderNote("");
    fetchData();
  };

  const deleteReminder = async (id) => {
    await supabase.from("reminders").delete().eq("id", id);
    fetchData();
  };

  // ==================== EXPORT ====================
  const exportCSV = () => {
    let csv = "Name,Type,Balance,Currency,Interest Rate,Created Date\n";
    people.forEach((p) => { csv += `"${p.name}","${p.type}","${p.balance}","${p.currency || "USD"}","${p.interest_rate || 0}%","${formatDate(p.created_at)}"\n`; });
    csv += "\nTransaction History\nDate,Person,Type,Amount,Currency,Balance After,Note\n";
    transactions.forEach((t) => { csv += `"${formatDateTime(t.created_at)}","${t.person_name}","${t.type}","${t.amount}","${t.currency || "USD"}","${t.balance_after}","${t.note || ""}"\n`; });
    csv += "\nCompleted Records\nName,Original Type,Original Amount,Currency,Completed Date\n";
    completedRecords.forEach((r) => { csv += `"${r.name}","${r.type}","${r.original_amount}","${r.currency || "USD"}","${formatDate(r.completed_at)}"\n`; });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `poker-loans-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); };

  const personTransactions = showPersonDetail ? transactions.filter((t) => t.person_id === showPersonDetail.id) : [];

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎰</div>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#fff", fontFamily: "'DM Sans', sans-serif", maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: 80 }}>

      {/* ==================== NET POSITION BAR ==================== */}
      {Object.keys(netPositions).length > 0 && (
        <div style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
          padding: "10px 20px",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 12, borderBottom: "1px solid #2a2a4a",
        }}>
          <span style={{ fontSize: 12, color: "#8888aa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Net Position</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            {Object.entries(netPositions).map(([currency, net]) => {
              const isPositive = net > 0;
              const isZero = net === 0;
              return (
                <span key={currency} style={{
                  fontSize: 15, fontWeight: 800, fontFamily: "'Space Mono', monospace",
                  color: isZero ? "#888" : isPositive ? "#00E676" : "#FF5252",
                }}>
                  {isPositive ? "+" : ""}{formatAmountWithConfig(Math.abs(net), currency)}{net < 0 ? " owed" : ""}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== HEADER ==================== */}
      <div style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)", padding: "20px 20px 0", borderBottom: "1px solid #222" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px", fontFamily: "'Space Mono', monospace" }}>
            POKER<span style={{ color: activeTab === "debts" ? "#e53935" : "#43A047" }}>LOANS</span>
          </h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowCurrencyModal(true)} style={{ background: "#2a2a2a", border: "1px solid #444", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }} title="Currencies">💱</button>
            <button onClick={() => setShowRemindersModal(true)} style={{ background: "#2a2a2a", border: "1px solid #444", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }} title="Reminders">🔔</button>
            <button onClick={() => setShowHistoryModal(true)} style={{ background: "#2a2a2a", border: "1px solid #444", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }} title="History">📋</button>
            <button onClick={() => setShowExportModal(true)} style={{ background: "#2a2a2a", border: "1px solid #444", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }} title="Export">📤</button>
            <button onClick={handleSignOut} style={{ background: "#2a2a2a", border: "1px solid #444", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }} title="Sign Out">🚪</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          <button onClick={() => setActiveTab("loans")} style={{ flex: 1, padding: "12px 0", background: activeTab === "loans" ? "#43A047" : "#1e1e1e", border: "none", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", borderRadius: "10px 0 0 0", fontFamily: "'Space Mono', monospace", letterSpacing: 1, transition: "all 0.2s" }}>
            <div>LOANS</div><div style={{ fontSize: 14, marginTop: 2 }}>{formatTotals(loansByCurrency)}</div>
          </button>
          <button onClick={() => setActiveTab("debts")} style={{ flex: 1, padding: "12px 0", background: activeTab === "debts" ? "#e53935" : "#1e1e1e", border: "none", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", borderRadius: "0 10px 0 0", fontFamily: "'Space Mono', monospace", letterSpacing: 1, transition: "all 0.2s" }}>
            <div>DEBTS</div><div style={{ fontSize: 14, marginTop: 2 }}>{formatTotals(debtsByCurrency)}</div>
          </button>
        </div>
      </div>

      {/* Search & Sort */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", background: "#1a1a1a", borderBottom: "1px solid #222" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#666", fontSize: 14 }}>🔍</span>
          <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 36, background: "#222", border: "1px solid #333" }} />
        </div>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          style={{ ...inputStyle, width: "auto", background: "#222", border: "1px solid #333", cursor: "pointer", appearance: "none", paddingRight: 28 }}>
          <option value="amount">Sort: Amount</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {/* ==================== LIST ==================== */}
      <div>
        {filteredList.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#555" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{activeTab === "debts" ? "💸" : "💰"}</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>No {activeTab} yet</div>
            <div style={{ fontSize: 13, marginTop: 6, color: "#444" }}>Tap the + button to create one</div>
          </div>
        ) : (
          filteredList.map((person, index) => {
            const interest = calculateInterest(Number(person.balance), Number(person.interest_rate), person.created_at);
            const bgColor = activeTab === "debts" ? getDebtColor(index, filteredList.length) : getLoanColor(index, filteredList.length);
            const curr = person.currency || "USD";
            return (
              <SwipeableRow key={person.id} personId={person.id} onSwipeAction={(action) => {
                if (action === "full") handleTransaction(person, Number(person.balance), "collect", "Full collection");
                else if (action === "partial") setShowCollectModal(person);
                else if (action === "add") setShowAddMoreModal(person);
              }}>
                <div onClick={() => setShowPersonDetail(person)} style={{ background: bgColor, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", borderBottom: "1px solid rgba(0,0,0,0.15)" }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>{person.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                      {curr !== "USD" && <span style={{ background: "rgba(0,0,0,0.25)", padding: "1px 5px", borderRadius: 4, marginRight: 6, fontSize: 10, fontWeight: 700 }}>{curr}</span>}
                      {Number(person.interest_rate) > 0 && <span>{person.interest_rate}% interest • +{formatAmountWithConfig(interest, curr)} accrued</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>{formatAmountWithConfig(Number(person.balance), curr)}</span>
                    <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 18 }}>›</span>
                  </div>
                </div>
              </SwipeableRow>
            );
          })
        )}
      </div>

      {/* FAB */}
      <button onClick={() => { setNewType(activeTab === "debts" ? "debt" : "loan"); setShowCreateModal(true); }}
        style={{ position: "fixed", bottom: 24, right: "calc(50% - 210px)", width: 56, height: 56, borderRadius: "50%", background: activeTab === "debts" ? "#e53935" : "#43A047", border: "none", color: "#fff", fontSize: 28, fontWeight: 300, cursor: "pointer", boxShadow: `0 4px 20px ${activeTab === "debts" ? "rgba(229,57,53,0.5)" : "rgba(67,160,71,0.5)"}`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>+</button>

      {/* ==================== CREATE MODAL ==================== */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title={`Create New ${newType === "debt" ? "Debt" : "Loan"}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <button onClick={() => setNewType("loan")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: newType === "loan" ? "#43A047" : "#2a2a2a", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>💰 Loan</button>
            <button onClick={() => setNewType("debt")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: newType === "debt" ? "#e53935" : "#2a2a2a", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>💸 Debt</button>
          </div>
          <div><label style={labelStyle}>Name</label><input type="text" placeholder="e.g. Jimmy" value={newName} onChange={(e) => setNewName(e.target.value)} style={inputStyle} autoFocus /></div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Amount</label><input type="number" placeholder="0.00" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} style={inputStyle} min="0" step="any" /></div>
            <div style={{ width: 110 }}>
              <label style={labelStyle}>Currency</label>
              <select value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {allCurrencies.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
              </select>
            </div>
          </div>
          <div><label style={labelStyle}>Annual Interest Rate (%) — optional</label><input type="number" placeholder="0" value={newInterestRate} onChange={(e) => setNewInterestRate(e.target.value)} style={inputStyle} min="0" step="0.1" /></div>
          <div><label style={labelStyle}>Note — optional</label><textarea placeholder="Add a note..." value={newNote} onChange={(e) => setNewNote(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} /></div>
          <button onClick={handleCreate} style={{ padding: "14px", background: newType === "debt" ? "#e53935" : "#43A047", border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>+ CREATE {newType === "debt" ? "DEBT" : "LOAN"}</button>
        </div>
      </Modal>

      {/* ==================== COLLECT MODAL ==================== */}
      <Modal isOpen={!!showCollectModal} onClose={() => { setShowCollectModal(null); setCollectAmount(""); setCollectNote(""); }} title={`Collect from ${showCollectModal?.name || ""}`}>
        {showCollectModal && (() => {
          const curr = showCollectModal.currency || "USD";
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "#222", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "#999", marginBottom: 4 }}>Current Balance {curr !== "USD" && <span style={{ color: "#666" }}>({curr})</span>}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: showCollectModal.type === "debt" ? "#e53935" : "#43A047" }}>{formatAmountWithConfig(Number(showCollectModal.balance), curr)}</div>
              </div>
              <button onClick={() => { handleTransaction(showCollectModal, Number(showCollectModal.balance), "collect", collectNote || "Full collection"); setShowCollectModal(null); setCollectAmount(""); setCollectNote(""); }}
                style={{ padding: "14px", background: "#00C853", border: "none", borderRadius: 12, color: "#000", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>✓ Collect Full {formatAmountWithConfig(Number(showCollectModal.balance), curr)}</button>
              <div style={{ textAlign: "center", color: "#555", fontSize: 13 }}>— or collect partial —</div>
              <div>
                <label style={labelStyle}>Amount to Collect ({getAllCurrencyConfig(curr).symbol})</label>
                <input type="number" placeholder="0.00" value={collectAmount} onChange={(e) => setCollectAmount(e.target.value)} style={inputStyle} min="0" step="any" />
                {collectAmount && parseFloat(collectAmount) > Number(showCollectModal.balance) && (
                  <div style={{ fontSize: 12, color: "#FFB800", marginTop: 6, padding: "8px 12px", background: "rgba(255,184,0,0.1)", borderRadius: 8 }}>
                    ⚠️ Exceeds balance by {formatAmountWithConfig(parseFloat(collectAmount) - Number(showCollectModal.balance), curr)}. {showCollectModal.name} will flip to a <strong>{showCollectModal.type === "debt" ? "loan" : "debt"}</strong>.
                  </div>
                )}
              </div>
              <div><label style={labelStyle}>Note — optional</label><input type="text" placeholder="Payment note..." value={collectNote} onChange={(e) => setCollectNote(e.target.value)} style={inputStyle} /></div>
              <button onClick={() => { const amount = parseFloat(collectAmount); if (!amount || amount <= 0) return; handleTransaction(showCollectModal, amount, "collect", collectNote); setShowCollectModal(null); setCollectAmount(""); setCollectNote(""); }}
                style={{ padding: "14px", background: "#FFB800", border: "none", borderRadius: 12, color: "#000", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Collect Partial Amount</button>
            </div>
          );
        })()}
      </Modal>

      {/* ==================== ADD MORE MODAL ==================== */}
      <Modal isOpen={!!showAddMoreModal} onClose={() => { setShowAddMoreModal(null); setAddMoreAmount(""); setAddMoreNote(""); }} title={`Add More to ${showAddMoreModal?.name || ""}`}>
        {showAddMoreModal && (() => {
          const curr = showAddMoreModal.currency || "USD";
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "#222", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "#999", marginBottom: 4 }}>Current Balance {curr !== "USD" && <span style={{ color: "#666" }}>({curr})</span>}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: showAddMoreModal.type === "debt" ? "#e53935" : "#43A047" }}>{formatAmountWithConfig(Number(showAddMoreModal.balance), curr)}</div>
              </div>
              <div><label style={labelStyle}>Additional Amount ({getAllCurrencyConfig(curr).symbol})</label><input type="number" placeholder="0.00" value={addMoreAmount} onChange={(e) => setAddMoreAmount(e.target.value)} style={inputStyle} min="0" step="any" autoFocus /></div>
              <div><label style={labelStyle}>Note — optional</label><input type="text" placeholder="Reason..." value={addMoreNote} onChange={(e) => setAddMoreNote(e.target.value)} style={inputStyle} /></div>
              <button onClick={() => { const amount = parseFloat(addMoreAmount); if (!amount || amount <= 0) return; handleTransaction(showAddMoreModal, amount, "add", addMoreNote); setShowAddMoreModal(null); setAddMoreAmount(""); setAddMoreNote(""); }}
                style={{ padding: "14px", background: "#2196F3", border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>+ Add {addMoreAmount ? formatAmountWithConfig(parseFloat(addMoreAmount) || 0, curr) : `${getAllCurrencyConfig(curr).symbol}0.00`} More</button>
            </div>
          );
        })()}
      </Modal>

      {/* ==================== PERSON DETAIL MODAL ==================== */}
      <Modal isOpen={!!showPersonDetail} onClose={() => setShowPersonDetail(null)} title={showPersonDetail?.name || ""}>
        {showPersonDetail && (() => {
          const curr = showPersonDetail.currency || "USD";
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: showPersonDetail.type === "debt" ? "linear-gradient(135deg, #e53935, #b71c1c)" : "linear-gradient(135deg, #43A047, #2E7D32)", borderRadius: 14, padding: 20, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{showPersonDetail.type === "debt" ? "They are owed" : "They owe you"}</div>
                <div style={{ fontSize: 34, fontWeight: 800, fontFamily: "'Space Mono', monospace" }}>{formatAmountWithConfig(Number(showPersonDetail.balance), curr)}</div>
                {curr !== "USD" && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{curr}</div>}
                {Number(showPersonDetail.interest_rate) > 0 && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 6 }}>{showPersonDetail.interest_rate}% interest • +{formatAmountWithConfig(calculateInterest(Number(showPersonDetail.balance), Number(showPersonDetail.interest_rate), showPersonDetail.created_at), curr)} accrued</div>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>Created {formatDateTime(showPersonDetail.created_at)} • Original: {formatAmountWithConfig(Number(showPersonDetail.original_amount), curr)}</div>
              {showPersonDetail.notes && showPersonDetail.notes.length > 0 && (
                <div>
                  <div style={{ ...labelStyle, marginBottom: 8 }}>Notes</div>
                  {showPersonDetail.notes.map((note, i) => (
                    <div key={i} style={{ background: "#222", borderRadius: 8, padding: "10px 12px", marginBottom: 6, fontSize: 13 }}>
                      <div style={{ color: "#ccc" }}>{note.text}</div>
                      <div style={{ color: "#555", fontSize: 11, marginTop: 4 }}>{formatDateTime(note.date)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div style={{ ...labelStyle, marginBottom: 8 }}>Transaction History</div>
                {personTransactions.length === 0 ? <div style={{ color: "#555", fontSize: 13 }}>No transactions yet</div> : (
                  personTransactions.map((t) => (
                    <div key={t.id} style={{ background: "#222", borderRadius: 8, padding: "10px 12px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#ccc", fontWeight: 600 }}>
                          {t.type === "created" && "Created"}{t.type === "partial_collect" && "Partial Collection"}{t.type === "completed" && "✓ Completed"}{t.type === "flipped" && "⇄ Flipped"}{t.type === "added" && "Added More"}
                        </div>
                        {t.note && <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>{t.note}</div>}
                        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{formatDateTime(t.created_at)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: t.type === "added" || t.type === "created" ? "#FFB800" : "#00C853" }}>
                          {t.type === "added" || t.type === "created" ? "+" : "-"}{formatAmountWithConfig(Number(t.amount), curr)}
                        </div>
                        <div style={{ fontSize: 11, color: "#555" }}>Bal: {formatAmountWithConfig(Number(t.balance_after), curr)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setShowPersonDetail(null); setShowCollectModal(showPersonDetail); }} style={{ flex: 1, padding: "12px", background: "#00C853", border: "none", borderRadius: 10, color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Collect</button>
                <button onClick={() => { setShowPersonDetail(null); setShowAddMoreModal(showPersonDetail); }} style={{ flex: 1, padding: "12px", background: "#2196F3", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Add More</button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ==================== HISTORY MODAL ==================== */}
      <Modal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} title="Transaction History">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {transactions.length === 0 && completedRecords.length === 0 ? <div style={{ color: "#555", textAlign: "center", padding: 30 }}>No history yet</div> : (
            <>
              {completedRecords.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ ...labelStyle, marginBottom: 8, color: "#00C853" }}>✓ Completed</div>
                  {completedRecords.map((r) => (
                    <div key={r.id} style={{ background: "#1a2e1a", borderRadius: 8, padding: "10px 12px", marginBottom: 6, border: "1px solid #2a4a2a" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 600, color: "#ccc" }}>{r.name}</span>
                        <span style={{ fontFamily: "'Space Mono', monospace", color: "#00C853" }}>{formatAmountWithConfig(Number(r.original_amount), r.currency || "USD")}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{r.type} • {r.currency || "USD"} • Completed {formatDate(r.completed_at)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ ...labelStyle, marginBottom: 8 }}>All Transactions</div>
              {transactions.map((t) => (
                <div key={t.id} style={{ background: "#222", borderRadius: 8, padding: "10px 12px", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>{t.person_name} — {t.type.replace("_", " ")}</div>
                    {t.note && <div style={{ fontSize: 11, color: "#777" }}>{t.note}</div>}
                    <div style={{ fontSize: 11, color: "#555" }}>{formatDateTime(t.created_at)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: t.type === "added" || t.type === "created" ? "#FFB800" : "#00C853" }}>{formatAmountWithConfig(Number(t.amount), t.currency || "USD")}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </Modal>

      {/* ==================== EXPORT MODAL ==================== */}
      <Modal isOpen={showExportModal} onClose={() => setShowExportModal(false)} title="Export Data">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ color: "#999", fontSize: 14 }}>Export all your data including currency info.</div>
          <button onClick={exportCSV} style={{ padding: "14px", background: "#2196F3", border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>📄 Export as CSV</button>
        </div>
      </Modal>

      {/* ==================== CURRENCY MANAGER MODAL ==================== */}
      <Modal isOpen={showCurrencyModal} onClose={() => setShowCurrencyModal(false)} title="Manage Currencies">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ ...labelStyle }}>Built-in Currencies</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {CURRENCIES.map((c) => (
              <span key={c.code} style={{ background: "#2a2a2a", padding: "6px 12px", borderRadius: 8, fontSize: 13, color: "#ccc" }}>
                {c.symbol} {c.code}
              </span>
            ))}
          </div>
          {customCurrencies.length > 0 && (
            <>
              <div style={{ ...labelStyle }}>Custom Currencies</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {customCurrencies.map((c) => (
                  <span key={c.code} style={{ background: "#2a3a2a", padding: "6px 12px", borderRadius: 8, fontSize: 13, color: "#8f8", border: "1px solid #3a5a3a" }}>
                    {c.symbol} {c.code}
                    <button onClick={() => {
                      const updated = customCurrencies.filter((x) => x.code !== c.code);
                      setCustomCurrencies(updated);
                      localStorage.setItem("poker-loans-custom-currencies", JSON.stringify(updated));
                    }} style={{ background: "none", border: "none", color: "#f55", marginLeft: 6, cursor: "pointer", fontSize: 12 }}>×</button>
                  </span>
                ))}
              </div>
            </>
          )}
          <div style={{ borderTop: "1px solid #333", paddingTop: 16 }}>
            <div style={{ ...labelStyle }}>Add Custom Currency</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input type="text" placeholder="Code (e.g. SOL)" value={newCustomCode} onChange={(e) => setNewCustomCode(e.target.value)} style={{ ...inputStyle, flex: 1 }} maxLength={10} />
              <input type="text" placeholder="Symbol (e.g. ◎)" value={newCustomSymbol} onChange={(e) => setNewCustomSymbol(e.target.value)} style={{ ...inputStyle, width: 70 }} maxLength={5} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input type="text" placeholder="Name (optional)" value={newCustomName} onChange={(e) => setNewCustomName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <select value={newCustomDecimals} onChange={(e) => setNewCustomDecimals(e.target.value)} style={{ ...inputStyle, width: 90, cursor: "pointer" }}>
                <option value="0">0 dec</option>
                <option value="2">2 dec</option>
                <option value="4">4 dec</option>
                <option value="6">6 dec</option>
                <option value="8">8 dec</option>
              </select>
            </div>
            <button onClick={addCustomCurrency} style={{ padding: "10px", background: "#43A047", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif", width: "100%" }}>+ Add Currency</button>
          </div>
        </div>
      </Modal>

      {/* ==================== REMINDERS MODAL ==================== */}
      <Modal isOpen={showRemindersModal} onClose={() => setShowRemindersModal(false)} title="Payment Reminders">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div><label style={labelStyle}>Person</label><select value={reminderPerson} onChange={(e) => setReminderPerson(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            <option value="">Select person...</option>
            {people.map((p) => <option key={p.id} value={p.name}>{p.name} — {formatAmountWithConfig(Number(p.balance), p.currency || "USD")}</option>)}
          </select></div>
          <div><label style={labelStyle}>Reminder Date</label><input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Note — optional</label><input type="text" placeholder="Reminder note..." value={reminderNote} onChange={(e) => setReminderNote(e.target.value)} style={inputStyle} /></div>
          <button onClick={handleAddReminder} style={{ padding: "12px", background: "#FFB800", border: "none", borderRadius: 12, color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>🔔 Set Reminder</button>
          {reminders.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Active Reminders</div>
              {reminders.map((r) => {
                const isOverdue = new Date(r.reminder_date) < new Date();
                return (
                  <div key={r.id} style={{ background: isOverdue ? "#3a1a1a" : "#222", borderRadius: 8, padding: "10px 12px", marginBottom: 6, border: isOverdue ? "1px solid #5a2a2a" : "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#ccc" }}>{r.person_name}{isOverdue && <span style={{ color: "#e53935", marginLeft: 6, fontSize: 11 }}>OVERDUE</span>}</div>
                      <div style={{ fontSize: 12, color: "#777" }}>{formatDate(r.reminder_date)}</div>
                      {r.note && <div style={{ fontSize: 11, color: "#555" }}>{r.note}</div>}
                    </div>
                    <button onClick={() => deleteReminder(r.id)} style={{ background: "#333", border: "none", color: "#999", width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

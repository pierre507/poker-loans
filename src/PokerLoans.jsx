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

// Known CoinGecko IDs for built-in cryptos
const COINGECKO_IDS = {
  BTC: "bitcoin", ETH: "ethereum", USDT: "tether", USDC: "usd-coin",
  SOL: "solana", ADA: "cardano", DOT: "polkadot", DOGE: "dogecoin",
  XRP: "ripple", AVAX: "avalanche-2", MATIC: "matic-network", LINK: "chainlink",
  UNI: "uniswap", ATOM: "cosmos", LTC: "litecoin", NEAR: "near",
  APT: "aptos", SUI: "sui", ARB: "arbitrum", OP: "optimism",
};

// Approximate fiat-to-USD rates (updated periodically)
const FIAT_TO_USD = { USD: 1, CAD: 0.74, EUR: 1.08, GBP: 1.27 };

const getCurrencyConfig = (code) => {
  const found = CURRENCIES.find((c) => c.code === code);
  if (found) return found;
  return { code, symbol: code, name: code, decimals: 2 };
};

const formatAmount = (amount, currencyCode = "USD") => {
  const config = getCurrencyConfig(currencyCode);
  const abs = Math.abs(Number(amount));
  if (config.decimals > 2) {
    const fixed = abs.toFixed(config.decimals);
    const parts = fixed.split(".");
    const intPart = parts[0];
    let decPart = parts[1] || "";
    while (decPart.length > 2 && decPart.endsWith("0")) {
      decPart = decPart.slice(0, -1);
    }
    const formattedInt = Number(intPart).toLocaleString("en-US");
    return `${config.symbol}${formattedInt}.${decPart}`;
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

// ==================== SWIPEABLE ROW ====================
const SwipeableRow = ({ children, onSwipeAction, personId, isDebt }) => {
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
    if (diff < 0) { currentX.current = diff; setOffset(Math.max(diff, -160)); }
  };
  const handleEnd = () => {
    swiping.current = false;
    if (currentX.current < -60) { setShowActions(true); setOffset(-160); }
    else { setOffset(0); setShowActions(false); }
    currentX.current = 0;
  };
  const closeActions = () => { setOffset(0); setShowActions(false); };

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 160, display: "flex", alignItems: "stretch", zIndex: 3 }}>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); closeActions(); setTimeout(() => onSwipeAction("collect"), 50); }}
          style={{ flex: 1, background: "#00C853", border: "none", color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "0 4px", touchAction: "manipulation" }}>
          {isDebt ? "Pay" : "Collect"}
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); closeActions(); setTimeout(() => onSwipeAction("delete"), 50); }}
          style={{ flex: 1, background: "#e53935", border: "none", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "0 4px", touchAction: "manipulation" }}>
          Delete
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showPersonDetail, setShowPersonDetail] = useState(null);
  const [showPersonHistoryModal, setShowPersonHistoryModal] = useState(false);
  const [personHistorySearch, setPersonHistorySearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState({});
  const [showExportModal, setShowExportModal] = useState(false);
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [customCurrencies, setCustomCurrencies] = useState([]);
  const [newCustomCode, setNewCustomCode] = useState("");
  const [newCustomSymbol, setNewCustomSymbol] = useState("");
  const [newCustomName, setNewCustomName] = useState("");
  const [newCustomDecimals, setNewCustomDecimals] = useState("2");
  const [newCustomType, setNewCustomType] = useState("crypto");
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newType, setNewType] = useState("debt");
  const [newCurrency, setNewCurrency] = useState("USD");
  const [newInterestRate, setNewInterestRate] = useState("");
  const [newNote, setNewNote] = useState("");
  const [collectAmount, setCollectAmount] = useState("");
  const [collectNote, setCollectNote] = useState("");
  const [reminderPerson, setReminderPerson] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [usdRates, setUsdRates] = useState({
    ...FIAT_TO_USD,
    // Fallback crypto rates (updated by live API when available)
    BTC: 84000, ETH: 2100, USDT: 1, USDC: 1, SOL: 130,
    ADA: 0.70, DOT: 6.5, DOGE: 0.17, XRP: 2.3, AVAX: 22,
    MATIC: 0.38, LINK: 14, UNI: 11, LTC: 90, NEAR: 5,
  });
  const [creating, setCreating] = useState(false);
  const [expandedLoansTab, setExpandedLoansTab] = useState(false);
  const [expandedDebtsTab, setExpandedDebtsTab] = useState(false);
  const [showAddMoreInline, setShowAddMoreInline] = useState(null);
  const [addMoreInlineAmount, setAddMoreInlineAmount] = useState("");
  const [addMoreInlineNote, setAddMoreInlineNote] = useState("");

  // Load cached rates from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem("poker-loans-cached-rates");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object") {
          setUsdRates((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch (e) {}
  }, []);

  // Fetch live crypto prices from CoinGecko + fiat rates from exchangerate-api
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        // Start with cached rates so we never lose data
        let cachedRates = {};
        try {
          const cached = localStorage.getItem("poker-loans-cached-rates");
          if (cached) cachedRates = JSON.parse(cached) || {};
        } catch (e) {}

        const newRates = { USD: 1, ...cachedRates };

        // 1. Fetch live fiat rates
        let fiatSuccess = false;
        try {
          const fiatRes = await fetch("https://open.er-api.com/v6/latest/USD");
          if (fiatRes.ok) {
            const fiatData = await fiatRes.json();
            if (fiatData.rates) {
              Object.entries(fiatData.rates).forEach(([code, rate]) => {
                if (rate > 0) newRates[code] = 1 / rate;
              });
              fiatSuccess = true;
            }
          }
        } catch (e) {
          // Keep cached/fallback fiat rates
          Object.keys(FIAT_TO_USD).forEach((code) => {
            if (!newRates[code]) newRates[code] = FIAT_TO_USD[code];
          });
        }

        // 2. Build sets of known crypto and fiat codes
        const knownCryptoCodes = new Set(Object.keys(COINGECKO_IDS));
        const customFiatCodes = new Set();
        customCurrencies.forEach((c) => {
          if (c.isFiat) customFiatCodes.add(c.code.toUpperCase());
          else knownCryptoCodes.add(c.code.toUpperCase());
        });
        CURRENCIES.forEach((c) => {
          if (!FIAT_TO_USD[c.code]) knownCryptoCodes.add(c.code);
        });

        const allCodes = new Set();
        people.forEach((p) => allCodes.add(p.currency || "USD"));
        customCurrencies.forEach((c) => allCodes.add(c.code));
        CURRENCIES.forEach((c) => allCodes.add(c.code));

        const geckoIds = [];
        const codeToGeckoId = {};
        allCodes.forEach((code) => {
          const upper = code.toUpperCase();
          if (upper === "USD") return;
          if (customFiatCodes.has(upper)) return;
          if (knownCryptoCodes.has(upper)) {
            const geckoId = COINGECKO_IDS[upper] || code.toLowerCase();
            geckoIds.push(geckoId);
            codeToGeckoId[upper] = geckoId;
            return;
          }
          if (newRates[upper]) return;
          const geckoId = code.toLowerCase();
          geckoIds.push(geckoId);
          codeToGeckoId[upper] = geckoId;
        });

        if (geckoIds.length > 0) {
          try {
            const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds.join(",")}&vs_currencies=usd`);
            if (res.ok) {
              const data = await res.json();
              Object.entries(codeToGeckoId).forEach(([code, geckoId]) => {
                if (data[geckoId]?.usd) {
                  newRates[code] = data[geckoId].usd;
                }
              });
            }
            // If CoinGecko fails, cached rates are already in newRates
          } catch (e) {
            console.error("CoinGecko fetch error:", e);
            // Cached rates already present — no data loss
          }
        }

        // Save to localStorage for next time
        try {
          localStorage.setItem("poker-loans-cached-rates", JSON.stringify(newRates));
        } catch (e) {}

        setUsdRates(newRates);
      } catch (e) {
        console.error("Price fetch error:", e);
      }
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 300000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [people, customCurrencies]);

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
    const sep = config.symbol.length > 1 ? " " : "";
    if (config.decimals > 2) {
      const fixed = abs.toFixed(config.decimals);
      // Trim trailing zeros but keep at least 2 decimal places
      const parts = fixed.split(".");
      const intPart = parts[0];
      let decPart = parts[1] || "";
      // Remove trailing zeros but keep minimum 2
      while (decPart.length > 2 && decPart.endsWith("0")) {
        decPart = decPart.slice(0, -1);
      }
      // Format integer part with commas
      const formattedInt = Number(intPart).toLocaleString("en-US");
      return `${config.symbol}${sep}${formattedInt}.${decPart}`;
    }
    const displayDecimals = Math.max(config.decimals, 2);
    return `${config.symbol}${sep}${abs.toLocaleString("en-US", { minimumFractionDigits: displayDecimals, maximumFractionDigits: displayDecimals })}`;
  };

  const addCustomCurrency = () => {
    if (!newCustomCode.trim() || !newCustomSymbol.trim()) return;
    const newCurr = {
      code: newCustomCode.trim().toUpperCase(),
      symbol: newCustomSymbol.trim(),
      name: newCustomName.trim() || newCustomCode.trim().toUpperCase(),
      decimals: parseInt(newCustomDecimals) || 2,
      isFiat: newCustomType === "fiat",
    };
    const updated = [...customCurrencies, newCurr];
    setCustomCurrencies(updated);
    localStorage.setItem("poker-loans-custom-currencies", JSON.stringify(updated));
    setNewCustomCode(""); setNewCustomSymbol(""); setNewCustomName(""); setNewCustomDecimals("2"); setNewCustomType("crypto");
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

  // Convert any currency amount to estimated USD
  const toUsd = (amount, currencyCode) => {
    const code = (currencyCode || "USD").toUpperCase();
    const rate = usdRates[code];
    if (rate) return Number(amount) * rate;
    return Number(amount); // fallback: assume 1:1
  };

  const formatUsdEstimate = (usdAmount, isEstimate = true) => {
    const prefix = isEstimate ? "~" : "";
    return `${prefix}$${Math.abs(usdAmount).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Group people by name (for multi-currency display)
  const groupedList = (() => {
    const groups = {};
    filteredList.forEach((person) => {
      const key = person.name.toLowerCase();
      if (!groups[key]) groups[key] = { name: person.name, entries: [], totalUsd: 0 };
      groups[key].entries.push(person);
      groups[key].totalUsd += toUsd(Number(person.balance), person.currency || "USD");
    });
    Object.values(groups).forEach((g) => {
      g.entries.sort((a, b) => toUsd(Number(b.balance), b.currency || "USD") - toUsd(Number(a.balance), a.currency || "USD"));
    });
    return Object.values(groups).sort((a, b) => {
      if (sortBy === "amount") return b.totalUsd - a.totalUsd;
      return a.name.localeCompare(b.name);
    });
  })();

  const toggleGroup = (name) => {
    setExpandedGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  // Net position per currency
  const netPositions = {};
  people.forEach((p) => {
    const curr = p.currency || "USD";
    if (!netPositions[curr]) netPositions[curr] = 0;
    if (p.type === "loan") netPositions[curr] += Number(p.balance);
    else netPositions[curr] -= Number(p.balance);
  });

  // Totals per currency for tabs + USD estimate
  const debtsByCurrency = {};
  let debtsUsdTotal = 0;
  const loansByCurrency = {};
  let loansUsdTotal = 0;
  debts.forEach((p) => {
    const c = p.currency || "USD";
    debtsByCurrency[c] = (debtsByCurrency[c] || 0) + Number(p.balance);
    debtsUsdTotal += toUsd(Number(p.balance), c);
  });
  loans.forEach((p) => {
    const c = p.currency || "USD";
    loansByCurrency[c] = (loansByCurrency[c] || 0) + Number(p.balance);
    loansUsdTotal += toUsd(Number(p.balance), c);
  });

  const formatTotals = (byCurrency) => {
    const entries = Object.entries(byCurrency);
    if (entries.length === 0) return formatAmountWithConfig(0, "USD");
    if (entries.length === 1) return formatAmountWithConfig(entries[0][1], entries[0][0]);
    return entries.map(([c, v]) => formatAmountWithConfig(v, c)).join(" · ");
  };

  // ==================== CREATE ====================
  const handleCreate = async () => {
    if (creating) return;
    if (!newName.trim() || !newAmount || parseFloat(newAmount) <= 0) return;
    setCreating(true);
    try {
      const amount = parseFloat(newAmount);
      const trimmedName = newName.trim();

      // Check for existing person with same name, type, and currency
      const existing = people.find(
        (p) => p.name.toLowerCase() === trimmedName.toLowerCase() && p.type === newType && (p.currency || "USD") === newCurrency
      );

      if (existing) {
        // Merge: add to existing balance
        const newBalance = Number(existing.balance) + amount;
        const updatedNotes = newNote
          ? [...(existing.notes || []), { text: newNote, date: new Date().toISOString() }]
          : existing.notes || [];
        await supabase.from("people").update({
          balance: newBalance, notes: updatedNotes, updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
        await supabase.from("transactions").insert({
          user_id: userId, person_id: existing.id, person_name: existing.name,
          type: "added", amount, balance_before: existing.balance, balance_after: newBalance,
          entry_type: newType, currency: newCurrency,
          note: newNote || `Added ${formatAmountWithConfig(amount, newCurrency)} to existing ${newType}`,
        });
      } else {
        // Create new entry
        const { data: person, error: pErr } = await supabase.from("people").insert({
          user_id: userId, name: trimmedName, type: newType, balance: amount,
          original_amount: amount, interest_rate: parseFloat(newInterestRate) || 0,
          currency: newCurrency,
          notes: newNote ? [{ text: newNote, date: new Date().toISOString() }] : [],
        }).select().single();
        if (pErr) { console.error(pErr); setCreating(false); return; }
        await supabase.from("transactions").insert({
          user_id: userId, person_id: person.id, person_name: person.name,
          type: "created", amount, balance_after: amount, entry_type: newType,
          currency: newCurrency,
          note: newNote || `Created ${newType} for ${person.name}`,
        });
      }
      setNewName(""); setNewAmount(""); setNewType("debt"); setNewCurrency("USD");
      setNewInterestRate(""); setNewNote("");
      setShowCreateModal(false);
      fetchData();
    } finally {
      setCreating(false);
    }
  };

  // ==================== TRANSACTIONS ====================
  const handleTransaction = async (person, amount, action, note = "") => {
    let newBalance, updatedType, transactionType;
    const currency = person.currency || "USD";
    if (action === "collect") {
      newBalance = Number(person.balance) - amount;
      if (newBalance < 0) { updatedType = person.type === "debt" ? "loan" : "debt"; newBalance = Math.abs(newBalance); transactionType = "flipped"; }
      else if (newBalance === 0) { transactionType = "completed"; }
      else { updatedType = person.type; transactionType = "partial_collect"; }
    } else if (action === "add") {
      newBalance = Number(person.balance) + amount; updatedType = person.type; transactionType = "added";
    }
    await supabase.from("transactions").insert({
      user_id: userId, person_id: person.id, person_name: person.name,
      type: transactionType, amount, balance_before: person.balance,
      balance_after: newBalance, entry_type: updatedType || person.type,
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
        balance: newBalance, type: updatedType || person.type, notes: updatedNotes, updated_at: new Date().toISOString(),
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
      {Object.keys(netPositions).length > 0 && (() => {
        const netUsd = Object.entries(netPositions).reduce((sum, [curr, net]) => sum + (net > 0 ? toUsd(net, curr) : -toUsd(Math.abs(net), curr)), 0);
        const isPositive = netUsd > 0;
        const isZero = Math.abs(netUsd) < 0.01;
        return (
          <div style={{
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
            padding: "10px 20px",
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 12, borderBottom: "1px solid #2a2a4a",
          }}>
            <span style={{ fontSize: 12, color: "#8888aa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Net Position</span>
            <span style={{
              fontSize: 18, fontWeight: 800, fontFamily: "'Space Mono', monospace",
              color: isZero ? "#888" : isPositive ? "#00E676" : "#FF5252",
            }}>
              {isPositive ? "+" : "-"}{formatUsdEstimate(netUsd, Object.keys(netPositions).some(c => c !== "USD"))}
            </span>
          </div>
        );
      })()}

      {/* ==================== HEADER ==================== */}
      <div style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)", padding: "20px 20px 0", borderBottom: "1px solid #222" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px", fontFamily: "'Space Mono', monospace" }}>
            POKER<span style={{ color: activeTab === "debts" ? "#e53935" : "#43A047" }}>LOANS</span>
          </h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowCurrencyModal(true)} style={{ background: "#2a2a2a", border: "1px solid #444", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }} title="Currencies">💱</button>
            <button onClick={() => setShowRemindersModal(true)} style={{ background: "#2a2a2a", border: "1px solid #444", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }} title="Reminders">🔔</button>
            <button onClick={() => setShowPersonHistoryModal(true)} style={{ background: "#2a2a2a", border: "1px solid #444", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }} title="History">📋</button>
            <button onClick={() => setShowExportModal(true)} style={{ background: "#2a2a2a", border: "1px solid #444", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }} title="Export">📤</button>
            <button onClick={handleSignOut} style={{ background: "#2a2a2a", border: "1px solid #444", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }} title="Sign Out">🚪</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          <button onClick={() => { setActiveTab("loans"); setExpandedLoansTab(false); setExpandedDebtsTab(false); }} style={{ flex: 1, padding: "12px 0", background: activeTab === "loans" ? "#43A047" : "#1e1e1e", border: "none", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", borderRadius: "10px 0 0 0", fontFamily: "'Space Mono', monospace", letterSpacing: 1, transition: "all 0.2s" }}>
            <div>LOANS</div>
            <div style={{ fontSize: 16, marginTop: 2 }}>{formatUsdEstimate(loansUsdTotal, Object.keys(loansByCurrency).some(c => c !== "USD"))}</div>
            {Object.keys(loansByCurrency).length > 1 && activeTab === "loans" && (
              <div onClick={(e) => { e.stopPropagation(); setExpandedLoansTab(!expandedLoansTab); }} style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 4, cursor: "pointer" }}>
                {expandedLoansTab ? "▲ hide details" : "▼ show details"}
              </div>
            )}
          </button>
          <button onClick={() => { setActiveTab("debts"); setExpandedLoansTab(false); setExpandedDebtsTab(false); }} style={{ flex: 1, padding: "12px 0", background: activeTab === "debts" ? "#e53935" : "#1e1e1e", border: "none", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", borderRadius: "0 10px 0 0", fontFamily: "'Space Mono', monospace", letterSpacing: 1, transition: "all 0.2s" }}>
            <div>DEBTS</div>
            <div style={{ fontSize: 16, marginTop: 2 }}>{formatUsdEstimate(debtsUsdTotal, Object.keys(debtsByCurrency).some(c => c !== "USD"))}</div>
            {Object.keys(debtsByCurrency).length > 1 && activeTab === "debts" && (
              <div onClick={(e) => { e.stopPropagation(); setExpandedDebtsTab(!expandedDebtsTab); }} style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 4, cursor: "pointer" }}>
                {expandedDebtsTab ? "▲ hide details" : "▼ show details"}
              </div>
            )}
          </button>
        </div>
        {/* Currency breakdown accordion */}
        {((activeTab === "loans" && expandedLoansTab) || (activeTab === "debts" && expandedDebtsTab)) && (
          <div style={{ background: "#1a1a1a", padding: "8px 20px", borderBottom: "1px solid #333" }}>
            {Object.entries(activeTab === "loans" ? loansByCurrency : debtsByCurrency).map(([curr, total]) => (
              <div key={curr} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ fontSize: 12, color: "#888" }}>{curr}</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#ccc" }}>{formatAmountWithConfig(total, curr)}</span>
              </div>
            ))}
          </div>
        )}
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
        {groupedList.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#555" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{activeTab === "debts" ? "💸" : "💰"}</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>No {activeTab} yet</div>
            <div style={{ fontSize: 13, marginTop: 6, color: "#444" }}>Tap the + button to create one</div>
          </div>
        ) : (
          groupedList.map((group, groupIndex) => {
            const isMulti = group.entries.length > 1;
            const isExpanded = expandedGroups[group.name];

            if (!isMulti) {
              // Single currency — render as before (swipeable)
              const person = group.entries[0];
              const interest = calculateInterest(Number(person.balance), Number(person.interest_rate), person.created_at);
              const bgColor = activeTab === "debts" ? getDebtColor(groupIndex, groupedList.length) : getLoanColor(groupIndex, groupedList.length);
              const curr = person.currency || "USD";
              return (
                <SwipeableRow key={person.id} personId={person.id} isDebt={activeTab === "debts"} onSwipeAction={(action) => {
                  if (action === "collect") { setCollectAmount(String(Number(person.balance))); setShowCollectModal(person); }
                  else if (action === "delete") setShowDeleteConfirm(person);
                }}>
                  <div onClick={() => setShowPersonDetail(person)} style={{ background: bgColor, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", borderBottom: "1px solid rgba(0,0,0,0.15)" }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>{person.name}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                        {curr !== "USD" && <span style={{ background: "rgba(0,0,0,0.25)", padding: "1px 5px", borderRadius: 4, marginRight: 6, fontSize: 10, fontWeight: 700 }}>{curr}</span>}
                        {Number(person.interest_rate) > 0 && <span>{person.interest_rate}% interest • +{formatAmountWithConfig(interest, curr)} accrued</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>{formatAmountWithConfig(Number(person.balance), curr)}</span>
                        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 18 }}>›</span>
                      </div>
                      {curr !== "USD" && usdRates[curr.toUpperCase()] && (
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "'Space Mono', monospace" }}>{formatUsdEstimate(toUsd(Number(person.balance), curr))}</span>
                      )}
                    </div>
                  </div>
                </SwipeableRow>
              );
            }

            // Multi-currency grouped row
            const bgColor = activeTab === "debts" ? getDebtColor(groupIndex, groupedList.length) : getLoanColor(groupIndex, groupedList.length);
            return (
              <div key={group.name}>
                <div onClick={() => toggleGroup(group.name)} style={{ background: bgColor, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", borderBottom: "1px solid rgba(0,0,0,0.15)" }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>{group.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                      <span style={{ background: "rgba(0,0,0,0.25)", padding: "1px 5px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{group.entries.length} {group.entries.length === 1 ? "currency" : "currencies"}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>{formatUsdEstimate(group.totalUsd, group.entries.some(p => (p.currency || "USD") !== "USD"))}</span>
                    <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 18, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ background: "rgba(0,0,0,0.2)" }}>
                    {group.entries.map((person) => {
                      const curr = person.currency || "USD";
                      const interest = calculateInterest(Number(person.balance), Number(person.interest_rate), person.created_at);
                      return (
                        <SwipeableRow key={person.id} personId={person.id} isDebt={activeTab === "debts"} onSwipeAction={(action) => {
                          if (action === "collect") { setCollectAmount(String(Number(person.balance))); setShowCollectModal(person); }
                          else if (action === "delete") setShowDeleteConfirm(person);
                        }}>
                          <div onClick={() => setShowPersonDetail(person)} style={{ padding: "12px 20px 12px 36px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "#1a1a1a" }}>
                            <div>
                              <span style={{ background: "rgba(255,255,255,0.12)", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{curr}</span>
                              {Number(person.interest_rate) > 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginLeft: 8 }}>{person.interest_rate}% • +{formatAmountWithConfig(interest, curr)}</span>}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#fff" }}>{formatAmountWithConfig(Number(person.balance), curr)}</span>
                                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>›</span>
                              </div>
                              {curr !== "USD" && usdRates[curr.toUpperCase()] && (
                                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'Space Mono', monospace" }}>{formatUsdEstimate(toUsd(Number(person.balance), curr))}</span>
                              )}
                            </div>
                          </div>
                        </SwipeableRow>
                      );
                    })}
                  </div>
                )}
              </div>
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
          <button onClick={handleCreate} disabled={creating} style={{ padding: "14px", background: creating ? "#555" : (newType === "debt" ? "#e53935" : "#43A047"), border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 700, cursor: creating ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", marginTop: 4, opacity: creating ? 0.6 : 1 }}>{creating ? "Creating..." : `+ CREATE ${newType === "debt" ? "DEBT" : "LOAN"}`}</button>
        </div>
      </Modal>

      {/* ==================== COLLECT MODAL ==================== */}
      <Modal isOpen={!!showCollectModal} onClose={() => { setShowCollectModal(null); setCollectAmount(""); setCollectNote(""); }} title={showCollectModal?.type === "debt" ? `Pay ${showCollectModal?.name || ""}` : `Collect from ${showCollectModal?.name || ""}`}>
        {showCollectModal && (() => {
          const curr = showCollectModal.currency || "USD";
          const fullBalance = Number(showCollectModal.balance);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "#222", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "#999", marginBottom: 4 }}>Current Balance {curr !== "USD" && <span style={{ color: "#666" }}>({curr})</span>}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: showCollectModal.type === "debt" ? "#e53935" : "#43A047" }}>{formatAmountWithConfig(fullBalance, curr)}</div>
              </div>
              <div>
                <label style={labelStyle}>Amount to {showCollectModal.type === "debt" ? "Pay" : "Collect"} ({getAllCurrencyConfig(curr).symbol})</label>
                <input type="number" value={collectAmount} onChange={(e) => setCollectAmount(e.target.value)} style={inputStyle} min="0" step="any" autoFocus />
                {collectAmount && parseFloat(collectAmount) > fullBalance && (
                  <div style={{ fontSize: 12, color: "#FFB800", marginTop: 6, padding: "8px 12px", background: "rgba(255,184,0,0.1)", borderRadius: 8 }}>
                    ⚠️ Exceeds balance by {formatAmountWithConfig(parseFloat(collectAmount) - fullBalance, curr)}. {showCollectModal.name} will flip to a <strong>{showCollectModal.type === "debt" ? "loan" : "debt"}</strong>.
                  </div>
                )}
                {collectAmount && parseFloat(collectAmount) < fullBalance && parseFloat(collectAmount) > 0 && (
                  <div style={{ fontSize: 12, color: "#8888aa", marginTop: 6 }}>
                    Remaining after {showCollectModal.type === "debt" ? "payment" : "collection"}: {formatAmountWithConfig(fullBalance - parseFloat(collectAmount), curr)}
                  </div>
                )}
              </div>
              <div><label style={labelStyle}>Note — optional</label><input type="text" placeholder="Payment note..." value={collectNote} onChange={(e) => setCollectNote(e.target.value)} style={inputStyle} /></div>
              <button onClick={() => { const amount = parseFloat(collectAmount); if (!amount || amount <= 0) return; const isDebt = showCollectModal.type === "debt"; handleTransaction(showCollectModal, amount, "collect", collectNote || (amount >= fullBalance ? (isDebt ? "Full payment" : "Full collection") : (isDebt ? "Partial payment" : "Partial collection"))); setShowCollectModal(null); setCollectAmount(""); setCollectNote(""); }}
                style={{ padding: "14px", background: "#00C853", border: "none", borderRadius: 12, color: "#000", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                ✓ {showCollectModal.type === "debt" ? "Pay" : "Collect"} {collectAmount ? formatAmountWithConfig(parseFloat(collectAmount) || 0, curr) : formatAmountWithConfig(fullBalance, curr)}
              </button>
            </div>
          );
        })()}
      </Modal>

      {/* ==================== DELETE CONFIRMATION MODAL ==================== */}
      <Modal isOpen={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)} title="Confirm Delete">
        {showDeleteConfirm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#2a1a1a", borderRadius: 12, padding: 16, textAlign: "center", border: "1px solid #4a2a2a" }}>
              <div style={{ fontSize: 14, color: "#ccc", marginBottom: 8 }}>Are you sure you want to delete this record?</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{showDeleteConfirm.name}</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: showDeleteConfirm.type === "debt" ? "#e53935" : "#43A047", marginTop: 4 }}>
                {formatAmountWithConfig(Number(showDeleteConfirm.balance), showDeleteConfirm.currency || "USD")}
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>This action cannot be undone.</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: "14px", background: "#333", border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button onClick={async () => {
                await supabase.from("transactions").delete().eq("person_id", showDeleteConfirm.id);
                await supabase.from("people").delete().eq("id", showDeleteConfirm.id);
                setShowDeleteConfirm(null);
                fetchData();
              }} style={{ flex: 1, padding: "14px", background: "#e53935", border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Delete</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ==================== PERSON DETAIL MODAL ==================== */}
      <Modal isOpen={!!showPersonDetail} onClose={() => setShowPersonDetail(null)} title={showPersonDetail?.name || ""}>
        {showPersonDetail && (() => {
          const curr = showPersonDetail.currency || "USD";
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: showPersonDetail.type === "debt" ? "linear-gradient(135deg, #e53935, #b71c1c)" : "linear-gradient(135deg, #43A047, #2E7D32)", borderRadius: 14, padding: 20, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{showPersonDetail.type === "debt" ? "You owe them" : "They owe you"}</div>
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
                          {t.type === "created" && "Created"}{t.type === "partial_collect" && (t.entry_type === "debt" ? "Partial Payment" : "Partial Collection")}{t.type === "completed" && "✓ Completed"}{t.type === "flipped" && "⇄ Flipped"}{t.type === "added" && "Added More"}
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
                <button onClick={() => { setShowPersonDetail(null); setShowCollectModal(showPersonDetail); setCollectAmount(String(Number(showPersonDetail.balance))); }} style={{ flex: 1, padding: "12px", background: "#00C853", border: "none", borderRadius: 10, color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>{showPersonDetail.type === "debt" ? "Pay" : "Collect"}</button>
                <button onClick={() => setShowAddMoreInline(showAddMoreInline === showPersonDetail.id ? null : showPersonDetail.id)} style={{ flex: 1, padding: "12px", background: "#2196F3", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Add More</button>
              </div>
              {showAddMoreInline === showPersonDetail.id && (
                <div style={{ background: "#222", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div><label style={labelStyle}>Amount to Add ({getAllCurrencyConfig(curr).symbol})</label><input type="number" placeholder="0.00" value={addMoreInlineAmount} onChange={(e) => setAddMoreInlineAmount(e.target.value)} style={inputStyle} min="0" step="any" autoFocus /></div>
                  <div><label style={labelStyle}>Note — optional</label><input type="text" placeholder="Reason..." value={addMoreInlineNote} onChange={(e) => setAddMoreInlineNote(e.target.value)} style={inputStyle} /></div>
                  <button onClick={async () => {
                    const amount = parseFloat(addMoreInlineAmount);
                    if (!amount || amount <= 0) return;
                    await handleTransaction(showPersonDetail, amount, "add", addMoreInlineNote || `Added ${formatAmountWithConfig(amount, curr)}`);
                    setAddMoreInlineAmount(""); setAddMoreInlineNote(""); setShowAddMoreInline(null); setShowPersonDetail(null);
                  }} style={{ padding: "12px", background: "#2196F3", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
                    + Add {addMoreInlineAmount ? formatAmountWithConfig(parseFloat(addMoreInlineAmount) || 0, curr) : `${getAllCurrencyConfig(curr).symbol}0.00`}
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* ==================== PERSON SEARCH HISTORY MODAL ==================== */}
      <Modal isOpen={showPersonHistoryModal} onClose={() => { setShowPersonHistoryModal(false); setPersonHistorySearch(""); }} title="Transaction History">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#666", fontSize: 14 }}>🔍</span>
            <input type="text" placeholder="Search by name..." value={personHistorySearch} onChange={(e) => setPersonHistorySearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 36 }} autoFocus />
          </div>
          {(() => {
            const query = personHistorySearch.toLowerCase().trim();
            // Get all unique person names from transactions and completed records
            const allNames = new Set();
            transactions.forEach((t) => allNames.add(t.person_name));
            completedRecords.forEach((r) => allNames.add(r.name));
            people.forEach((p) => allNames.add(p.name));

            const filteredNames = query
              ? [...allNames].filter((n) => n.toLowerCase().includes(query)).sort()
              : [...allNames].sort();

            if (filteredNames.length === 0 && query) {
              return <div style={{ color: "#555", textAlign: "center", padding: 20 }}>No results for "{personHistorySearch}"</div>;
            }

            if (!query) {
              return <div style={{ color: "#666", textAlign: "center", padding: 20, fontSize: 14 }}>Type a name to see their complete transaction history</div>;
            }

            return filteredNames.map((name) => {
              const personTxns = transactions.filter((t) => t.person_name === name).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
              const personCompleted = completedRecords.filter((r) => r.name === name).sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
              const personActive = people.filter((p) => p.name === name);

              return (
                <div key={name} style={{ background: "#1a1a1a", borderRadius: 12, border: "1px solid #333", overflow: "hidden", marginBottom: 4 }}>
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid #2a2a2a" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{name}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                      {personActive.map((p) => (
                        <span key={p.id} style={{ fontSize: 12, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: p.type === "debt" ? "#e53935" : "#43A047", background: p.type === "debt" ? "rgba(229,57,53,0.1)" : "rgba(67,160,71,0.1)", padding: "3px 8px", borderRadius: 6 }}>
                          {p.type === "debt" ? "Owes" : "Owed"} {formatAmountWithConfig(Number(p.balance), p.currency || "USD")}
                        </span>
                      ))}
                      {personActive.length === 0 && <span style={{ fontSize: 12, color: "#555" }}>No active balances</span>}
                    </div>
                  </div>
                  <div style={{ maxHeight: 300, overflowY: "auto" }}>
                    {personTxns.length === 0 && personCompleted.length === 0 ? (
                      <div style={{ color: "#555", textAlign: "center", padding: 16, fontSize: 13 }}>No transaction records</div>
                    ) : (
                      <>
                        {personTxns.map((t) => {
                          const tCurr = t.currency || "USD";
                          return (
                            <div key={t.id} style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1f1f1f" }}>
                              <div>
                                <div style={{ fontSize: 12, color: "#ccc", fontWeight: 600 }}>
                                  {t.type === "created" && "Created"}{t.type === "partial_collect" && (t.entry_type === "debt" ? "Partial Payment" : "Partial Collection")}{t.type === "completed" && "✓ Completed"}{t.type === "flipped" && "⇄ Flipped"}{t.type === "added" && "Added More"}
                                </div>
                                {t.note && <div style={{ fontSize: 10, color: "#777", marginTop: 1 }}>{t.note}</div>}
                                <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>{formatDateTime(t.created_at)}</div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: t.type === "added" || t.type === "created" ? "#FFB800" : "#00C853" }}>
                                  {t.type === "added" || t.type === "created" ? "+" : "-"}{formatAmountWithConfig(Number(t.amount), tCurr)}
                                </div>
                                {tCurr !== "USD" && <div style={{ fontSize: 9, color: "#555" }}>{tCurr}</div>}
                              </div>
                            </div>
                          );
                        })}
                        {personCompleted.map((r) => {
                          const rCurr = r.currency || "USD";
                          return (
                            <div key={r.id} style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1f1f1f", background: "rgba(0,200,83,0.03)" }}>
                              <div>
                                <div style={{ fontSize: 12, color: "#00C853", fontWeight: 600 }}>✓ {r.type === "debt" ? "Fully Paid" : "Fully Collected"}</div>
                                <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>Originally: {r.type} • {formatDate(r.completed_at)}</div>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#00C853" }}>
                                {formatAmountWithConfig(Number(r.original_amount), rCurr)}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              );
            });
          })()}
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
              <button onClick={() => setNewCustomType("crypto")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: newCustomType === "crypto" ? "#2196F3" : "#2a2a2a", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>🪙 Crypto</button>
              <button onClick={() => setNewCustomType("fiat")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: newCustomType === "fiat" ? "#43A047" : "#2a2a2a", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>💵 Fiat</button>
            </div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>{newCustomType === "crypto" ? "Price looked up via CoinGecko by code" : "Exchange rate looked up via forex API by code"}</div>
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

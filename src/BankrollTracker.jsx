import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";

// ==================== HELPERS ====================
const formatCurrency = (amount) => {
  const abs = Math.abs(Number(amount));
  if (abs >= 1000000) return `$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return `$${abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatCurrencyFull = (amount) => {
  return `$${Math.abs(Number(amount)).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const formatDateShort = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatHours = (minutes) => {
  const hrs = Number(minutes) / 60;
  if (hrs >= 1000) return `${(hrs / 1000).toFixed(1)}K`;
  return hrs.toFixed(0);
};

const formatHoursFull = (minutes) => {
  return `${(Number(minutes) / 60).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const inputStyle = { width: "100%", padding: "12px 14px", background: "#fff", border: "1px solid #e8e6e2", borderRadius: 10, color: "#1a1a1a", fontSize: 15, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" };
const labelStyle = { display: "block", marginBottom: 6, fontSize: 13, color: "#999", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" };

// ==================== MODAL ====================
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#f8f7f5", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", border: "1px solid #e8e6e2" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "#e8e6e2", border: "none", color: "#1a1a1a", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ==================== MINI BAR CHART ====================
const MiniBarChart = ({ data, color = "#2e7d32", height = 120 }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const barW = Math.max(4, Math.min(20, (300 / data.length) - 2));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, height, padding: "0 10px" }}>
      {data.map((d, i) => {
        const h = Math.max(2, (Math.abs(d.value) / max) * (height - 20));
        const isNeg = d.value < 0;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ width: barW, height: h, background: isNeg ? "#FF5252" : color, borderRadius: 2, opacity: 0.85 }} title={`${d.label}: ${formatCurrencyFull(d.value)}`} />
            {data.length <= 24 && <div style={{ fontSize: 8, color: "#bbb", whiteSpace: "nowrap" }}>{d.label}</div>}
          </div>
        );
      })}
    </div>
  );
};

// ==================== CUMULATIVE LINE (SVG) ====================
const CumulativeLine = ({ data, height = 140, color = "#2e7d32" }) => {
  if (!data || data.length < 2) return null;
  const w = 360;
  const padX = 10;
  const padTop = 10;
  const padBottom = 22;
  const vals = data.map(d => d.value);
  const labels = data.map(d => d.label || "");
  const cumulative = [];
  let sum = 0;
  vals.forEach(v => { sum += v; cumulative.push(sum); });
  const minY = Math.min(0, ...cumulative);
  const maxY = Math.max(...cumulative, 1);
  const rangeY = maxY - minY || 1;
  const chartH = height - padTop - padBottom;
  const points = cumulative.map((v, i) => {
    const x = padX + (i / (cumulative.length - 1)) * (w - padX * 2);
    const y = padTop + (1 - (v - minY) / rangeY) * chartH;
    return `${x},${y}`;
  }).join(" ");
  const zeroY = padTop + (1 - (0 - minY) / rangeY) * chartH;

  // Find label boundaries (years for long ranges, days/months for short ranges)
  const axisLabels = [];
  if (labels.length > 0 && labels[0]) {
    const isShortLabel = labels[0].length <= 2; // day numbers like "01", "15"
    if (isShortLabel) {
      // Show every few days
      const step = Math.max(1, Math.floor(labels.length / 8));
      labels.forEach((label, i) => {
        if (i % step === 0 && label) {
          const x = padX + (i / (cumulative.length - 1)) * (w - padX * 2);
          axisLabels.push({ x, text: label });
        }
      });
    } else {
      // Year boundaries
      let lastYear = "";
      labels.forEach((label, i) => {
        const year = label ? label.slice(0, 4) : "";
        if (year && year !== lastYear) {
          const x = padX + (i / (cumulative.length - 1)) * (w - padX * 2);
          axisLabels.push({ x, text: year });
          lastYear = year;
        }
      });
    }
  }

  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: "100%", height }}>
      <line x1={padX} y1={zeroY} x2={w - padX} y2={zeroY} stroke="#e8e6e2" strokeWidth="1" strokeDasharray="4" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x={padX} y={zeroY - 4} fill="#bbb" fontSize="10">$0</text>
      <text x={w - padX} y={padTop + 12} fill={color} fontSize="10" textAnchor="end">{formatCurrency(cumulative[cumulative.length - 1])}</text>
      {axisLabels.map((al, i) => (
        <g key={i}>
          <line x1={al.x} y1={padTop} x2={al.x} y2={height - padBottom} stroke="#e8e6e2" strokeWidth="0.5" />
          <text x={al.x} y={height - 6} fill="#bbb" fontSize="9" textAnchor="middle">{al.text}</text>
        </g>
      ))}
    </svg>
  );
};

// ==================== MAIN COMPONENT ====================
export default function BankrollTracker({ session, onLoans }) {
  const userId = session.user.id;
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard"); // dashboard, hours, profit, sessions, add, import, game-detail, location-detail
  const [detailData, setDetailData] = useState(null);

  // Add session form
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [newGame, setNewGame] = useState("Dealers Choice");
  const [newVariant, setNewVariant] = useState("Cash Game");
  const [newLocation, setNewLocation] = useState("");
  const [newBuyin, setNewBuyin] = useState("");
  const [newCashout, setNewCashout] = useState("");
  const [newNetProfit, setNewNetProfit] = useState("");
  const [newHours, setNewHours] = useState("");
  const [newSmallBlind, setNewSmallBlind] = useState("");
  const [newBigBlind, setNewBigBlind] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newSessionType, setNewSessionType] = useState("Casino");
  const [profitMode, setProfitMode] = useState("net"); // "net" or "buyin"

  // Presets
  const DEFAULT_PRESETS = [
    { name: "Sortis Omaha", game: "Omaha", variant: "Cash Game", location: "Sortis", type: "Casino", smallBlind: "25", bigBlind: "25" },
    { name: "Sortis BJ", game: "Black Jack", variant: "Cash Game", location: "Sortis", type: "Casino", smallBlind: "100", bigBlind: "100" },
    { name: "Sortis UTH", game: "UTH", variant: "Cash Game", location: "Sortis", type: "Casino", smallBlind: "10", bigBlind: "20" },
    { name: "Jacky DC", game: "Dealers Choice", variant: "Cash Game", location: "Jacky Big Game", type: "Home Game", smallBlind: "25", bigBlind: "50" },
    { name: "Trump DC", game: "Dealers Choice", variant: "Cash Game", location: "Trump-yoo", type: "Home Game", smallBlind: "25", bigBlind: "25" },
  ];

  const [presets, setPresets] = useState(() => {
    try {
      const stored = localStorage.getItem("poker-loans-session-presets");
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return DEFAULT_PRESETS;
  });
  const [showManagePresets, setShowManagePresets] = useState(false);
  const [showManageCustom, setShowManageCustom] = useState(false);
  const [editingPreset, setEditingPreset] = useState(null);
  const [presetName, setPresetName] = useState("");
  const [presetGame, setPresetGame] = useState("");
  const [presetVariant, setPresetVariant] = useState("Cash Game");
  const [presetLocation, setPresetLocation] = useState("");
  const [presetType, setPresetType] = useState("Casino");
  const [presetSmallBlind, setPresetSmallBlind] = useState("");
  const [presetBigBlind, setPresetBigBlind] = useState("");

  const savePresets = (updated) => {
    setPresets(updated);
    localStorage.setItem("poker-loans-session-presets", JSON.stringify(updated));
  };

  const applyPreset = (preset) => {
    setNewGame(preset.game || "Dealers Choice");
    setNewVariant(preset.variant || "Cash Game");
    setNewLocation(preset.location || "");
    setNewSessionType(preset.type || "Casino");
    setNewSmallBlind(preset.smallBlind || "");
    setNewBigBlind(preset.bigBlind || "");
  };

  const startEditPreset = (preset, index) => {
    setEditingPreset(index);
    setPresetName(preset.name);
    setPresetGame(preset.game);
    setPresetVariant(preset.variant);
    setPresetLocation(preset.location);
    setPresetType(preset.type);
    setPresetSmallBlind(preset.smallBlind);
    setPresetBigBlind(preset.bigBlind);
  };

  const saveEditedPreset = () => {
    if (!presetName.trim()) return;
    const updated = [...presets];
    const preset = { name: presetName.trim(), game: presetGame, variant: presetVariant, location: presetLocation, type: presetType, smallBlind: presetSmallBlind, bigBlind: presetBigBlind };
    if (editingPreset !== null && editingPreset < updated.length) {
      updated[editingPreset] = preset;
    } else {
      updated.push(preset);
    }
    savePresets(updated);
    setEditingPreset(null);
    setPresetName(""); setPresetGame(""); setPresetVariant("Cash Game"); setPresetLocation(""); setPresetType("Casino"); setPresetSmallBlind(""); setPresetBigBlind("");
  };

  const deletePreset = (index) => {
    const updated = presets.filter((_, i) => i !== index);
    savePresets(updated);
  };

  // Import
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const fileInputRef = useRef(null);

  // Custom input states for "Add new" dropdowns
  const [customGameInput, setCustomGameInput] = useState("");
  const [customLocationInput, setCustomLocationInput] = useState("");
  const [customVariantInput, setCustomVariantInput] = useState("");
  const [customTypeInput, setCustomTypeInput] = useState("");

  // Persistent custom-added values (shared across Add Session and Presets)
  const [customAddedValues, setCustomAddedValues] = useState(() => {
    try {
      const stored = localStorage.getItem("poker-loans-custom-values");
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return { games: [], locations: [], variants: [], types: [] };
  });
  const addCustomValue = (category, value) => {
    if (!value) return;
    setCustomAddedValues(prev => {
      if (prev[category]?.includes(value)) return prev;
      const updated = { ...prev, [category]: [...(prev[category] || []), value] };
      localStorage.setItem("poker-loans-custom-values", JSON.stringify(updated));
      return updated;
    });
  };
  const removeCustomValue = (category, value) => {
    setCustomAddedValues(prev => {
      const updated = { ...prev, [category]: (prev[category] || []).filter(v => v !== value) };
      localStorage.setItem("poker-loans-custom-values", JSON.stringify(updated));
      return updated;
    });
  };

  // Filters
  const [filterGame, setFilterGame] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterYear, setFilterYear] = useState("all");

  // ==================== DATA LOADING ====================
  const fetchData = useCallback(async () => {
    setLoading(true);
    // Supabase returns max 1000 rows by default, so we paginate
    let allData = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from("bankroll_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("start_time", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) { console.error(error); break; }
      if (data) allData = [...allData, ...data];
      hasMore = data && data.length === pageSize;
      from += pageSize;
    }
    setSessions(allData);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ==================== DERIVED STATS ====================
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisYear = String(now.getFullYear());

  const filtered = sessions.filter((s) => {
    if (filterGame !== "all" && s.game !== filterGame) return false;
    if (filterLocation !== "all" && s.location !== filterLocation) return false;
    if (filterYear !== "all" && !s.start_time?.startsWith(filterYear)) return false;
    return true;
  });

  const totalProfit = sessions.reduce((sum, s) => sum + Number(s.net_profit || 0), 0);
  const totalMinutes = sessions.reduce((sum, s) => sum + Number(s.playing_minutes || 0), 0);
  const totalHours = totalMinutes / 60;
  const hourlyRate = totalHours > 0 ? totalProfit / totalHours : 0;
  const winSessions = sessions.filter(s => Number(s.net_profit || 0) > 0).length;
  const winRate = sessions.length > 0 ? (winSessions / sessions.length * 100) : 0;

  const monthSessions = sessions.filter(s => s.start_time?.startsWith(thisMonth));
  const monthProfit = monthSessions.reduce((sum, s) => sum + Number(s.net_profit || 0), 0);
  const monthMinutes = monthSessions.reduce((sum, s) => sum + Number(s.playing_minutes || 0), 0);

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthName = lastMonthDate.toLocaleDateString("en-US", { month: "short" });
  const lastMonthSessions = sessions.filter(s => s.start_time?.startsWith(lastMonth));
  const lastMonthProfit = lastMonthSessions.reduce((sum, s) => sum + Number(s.net_profit || 0), 0);
  const lastMonthMinutes = lastMonthSessions.reduce((sum, s) => sum + Number(s.playing_minutes || 0), 0);

  const yearSessions = sessions.filter(s => s.start_time?.startsWith(thisYear));
  const yearProfit = yearSessions.reduce((sum, s) => sum + Number(s.net_profit || 0), 0);
  const yearMinutes = yearSessions.reduce((sum, s) => sum + Number(s.playing_minutes || 0), 0);

  const lastYear = String(Number(thisYear) - 1);
  const lastYearSessions = sessions.filter(s => s.start_time?.startsWith(lastYear));
  const lastYearProfit = lastYearSessions.reduce((sum, s) => sum + Number(s.net_profit || 0), 0);
  const lastYearMinutes = lastYearSessions.reduce((sum, s) => sum + Number(s.playing_minutes || 0), 0);

  // Unique values for filters/forms
  const allGames = [...new Set([...sessions.map(s => s.game).filter(Boolean), ...(customAddedValues.games || [])])].sort();
  const allLocations = [...new Set([...sessions.map(s => s.location).filter(Boolean), ...(customAddedValues.locations || [])])].sort();
  const allVariants = [...new Set([...sessions.map(s => s.variant).filter(Boolean), ...(customAddedValues.variants || [])])].sort();
  const allTypes = [...new Set([...sessions.map(s => s.session_type).filter(Boolean), ...(customAddedValues.types || [])])].sort();
  const allYears = [...new Set(sessions.map(s => s.start_time?.slice(0, 4)).filter(Boolean))].sort().reverse();

  // Group by game
  const byGame = {};
  sessions.forEach((s) => {
    const g = s.game || "Unknown";
    if (!byGame[g]) byGame[g] = { sessions: 0, profit: 0, minutes: 0 };
    byGame[g].sessions += 1;
    byGame[g].profit += Number(s.net_profit || 0);
    byGame[g].minutes += Number(s.playing_minutes || 0);
  });

  // Group by location
  const byLocation = {};
  sessions.forEach((s) => {
    const loc = s.location || "Unknown";
    if (!byLocation[loc]) byLocation[loc] = { sessions: 0, profit: 0, minutes: 0 };
    byLocation[loc].sessions += 1;
    byLocation[loc].profit += Number(s.net_profit || 0);
    byLocation[loc].minutes += Number(s.playing_minutes || 0);
  });

  // Monthly profit data for chart
  const monthlyData = (() => {
    const months = {};
    sessions.forEach((s) => {
      const m = s.start_time?.slice(0, 7);
      if (!m) return;
      if (!months[m]) months[m] = 0;
      months[m] += Number(s.net_profit || 0);
    });
    return Object.entries(months).sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => ({
      label: m.slice(2), value: v
    }));
  })();

  // Yearly data
  const yearlyData = (() => {
    const years = {};
    sessions.forEach((s) => {
      const y = s.start_time?.slice(0, 4);
      if (!y) return;
      if (!years[y]) years[y] = { profit: 0, minutes: 0, sessions: 0 };
      years[y].profit += Number(s.net_profit || 0);
      years[y].minutes += Number(s.playing_minutes || 0);
      years[y].sessions += 1;
    });
    return Object.entries(years).sort((a, b) => a[0].localeCompare(b[0]));
  })();

  // ==================== ADD SESSION ====================
  const handleAddSession = async () => {
    let netProfit;
    if (profitMode === "buyin") {
      const bi = parseFloat(newBuyin) || 0;
      const co = parseFloat(newCashout) || 0;
      netProfit = co - bi;
    } else {
      netProfit = parseFloat(newNetProfit) || 0;
    }
    const mins = Math.round((parseFloat(newHours) || 0) * 60);
    const startTime = new Date(newDate + "T12:00:00").toISOString();

    const { error } = await supabase.from("bankroll_sessions").insert({
      user_id: userId,
      start_time: startTime,
      end_time: startTime,
      playing_minutes: mins,
      variant: newVariant,
      game: newGame || "Unknown",
      location: newLocation || "Unknown",
      session_type: newSessionType,
      buyin: profitMode === "buyin" ? (parseFloat(newBuyin) || 0) : 0,
      cashout: profitMode === "buyin" ? (parseFloat(newCashout) || 0) : 0,
      net_profit: netProfit,
      small_blind: parseFloat(newSmallBlind) || 0,
      big_blind: parseFloat(newBigBlind) || 0,
      note: newNote,
    });
    if (error) { console.error(error); return; }
    setNewDate(new Date().toISOString().split("T")[0]);
    setNewGame("Dealers Choice"); setNewVariant("Cash Game"); setNewLocation("");
    setNewBuyin(""); setNewCashout(""); setNewNetProfit(""); setNewHours("");
    setNewSmallBlind(""); setNewBigBlind(""); setNewNote(""); setNewSessionType("Casino");
    setView("dashboard");
    fetchData();
  };

  // ==================== IMPORT CSV ====================
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportStatus("Reading file...");

    try {
      const text = await file.text();
      const lines = text.split("\n").filter(l => !l.startsWith('"---'));
      if (lines.length < 2) { setImportStatus("No data found"); setImporting(false); return; }

      const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        // Parse CSV respecting quotes
        const values = [];
        let current = "";
        let inQuotes = false;
        for (let c = 0; c < line.length; c++) {
          if (line[c] === '"') { inQuotes = !inQuotes; }
          else if (line[c] === ',' && !inQuotes) { values.push(current.trim()); current = ""; }
          else { current += line[c]; }
        }
        values.push(current.trim());
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
        rows.push(row);
      }

      setImportStatus(`Importing ${rows.length} sessions...`);

      // Batch insert in chunks of 100
      const chunks = [];
      for (let i = 0; i < rows.length; i += 100) {
        chunks.push(rows.slice(i, i + 100));
      }

      let imported = 0;
      for (const chunk of chunks) {
        const records = chunk.map(r => ({
          user_id: userId,
          start_time: r.starttime ? new Date(r.starttime).toISOString() : new Date().toISOString(),
          end_time: r.endtime ? new Date(r.endtime).toISOString() : null,
          playing_minutes: parseInt(r.playingminutes) || 0,
          variant: r.variant || "Cash Game",
          game: r.game || "Unknown",
          game_limit: r.limit || "",
          location: r.location || "Unknown",
          session_type: r.type || "Casino",
          currency: r.currency || "USD",
          buyin: parseFloat(r.buyin) || 0,
          cashout: parseFloat(r.cashout) || 0,
          net_profit: parseFloat(r.netprofit) || 0,
          small_blind: parseFloat(r.smallblind) || 0,
          big_blind: parseFloat(r.bigblind) || 0,
          note: r.sessionnote || "",
          imported_id: r.id || "",
        }));
        const { error } = await supabase.from("bankroll_sessions").insert(records);
        if (error) { console.error(error); setImportStatus(`Error: ${error.message}`); setImporting(false); return; }
        imported += chunk.length;
        setImportStatus(`Imported ${imported} of ${rows.length}...`);
      }

      setImportStatus(`✓ Imported ${rows.length} sessions!`);
      fetchData();
    } catch (err) {
      console.error(err);
      setImportStatus(`Error: ${err.message}`);
    }
    setImporting(false);
  };

  // ==================== DELETE SESSION ====================
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editingSession, setEditingSession] = useState(null);
  const [chartFilter, setChartFilter] = useState("all"); // all, year, lastyear, month, custom
  const [chartCustomFrom, setChartCustomFrom] = useState("");
  const [chartCustomTo, setChartCustomTo] = useState("");
  const handleDelete = async (id) => {
    await supabase.from("bankroll_sessions").delete().eq("id", id);
    setDeleteConfirm(null);
    fetchData();
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); };

  // ==================== RENDER ====================
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f7f5", display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div>Loading bankroll...</div>
        </div>
      </div>
    );
  }

  const cardStyle = { background: "#fff", borderRadius: 14, padding: "16px 18px", cursor: "pointer", border: "1px solid #e8e6e2", transition: "all 0.2s" };
  const statLabel = { fontSize: 11, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 };
  const statValue = { fontSize: 24, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", marginTop: 4 };

  return (
    <div style={{ minHeight: "100vh", background: "#f8f7f5", color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif", maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: 80 }}>

      {/* ==================== TOP BAR ==================== */}
      <div style={{ background: "#fff", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e8e6e2" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}>
          POKER<span style={{ color: "#b8860b" }}>MGR</span>
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          {onLoans && <button onClick={onLoans} style={{ background: "#f0eee9", border: "1px solid #e8e6e2", color: "#1a1a1a", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }} title="Loans & Debts">💰</button>}
          {sessions.length === 0 ? (
            <button onClick={() => setView("import")} style={{ background: "#f0eee9", border: "1px solid #e8e6e2", color: "#1a1a1a", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Import</button>
          ) : (
            <button onClick={() => setView(view === "sessions" ? "dashboard" : "sessions")} style={{ background: "#f0eee9", border: "1px solid #e8e6e2", color: "#1a1a1a", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>📋</button>
          )}
          <button onClick={handleSignOut} style={{ background: "#f0eee9", border: "1px solid #e8e6e2", color: "#1a1a1a", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }} title="Sign Out">🚪</button>
        </div>
      </div>

      {/* ==================== DASHBOARD ==================== */}
      {view === "dashboard" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {sessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#bbb" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>No sessions yet</div>
              <div style={{ fontSize: 13, marginTop: 6, color: "#ccc" }}>Import your PBT data or add your first session</div>
              <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "center" }}>
                <button onClick={() => setView("import")} style={{ padding: "12px 24px", background: "#2e7d32", border: "none", borderRadius: 10, color: "#fff", fontWeight: 500, cursor: "pointer", fontSize: 14 }}>📤 Import CSV</button>
                <button onClick={() => setView("add")} style={{ padding: "12px 24px", background: "#2e7d32", border: "none", borderRadius: 10, color: "#fff", fontWeight: 500, cursor: "pointer", fontSize: 14 }}>+ Add Session</button>
              </div>
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div onClick={() => setView("profit")} style={{ ...cardStyle }}>
                  <div style={statLabel}>Lifetime Profit</div>
                  <div style={{ ...statValue, color: totalProfit >= 0 ? "#00E676" : "#FF5252" }}>{formatCurrencyFull(totalProfit)}</div>
                </div>
                <div onClick={() => setView("hours")} style={{ ...cardStyle }}>
                  <div style={statLabel}>Hours Played</div>
                  <div style={{ ...statValue, color: "#b8860b" }}>{formatHoursFull(totalMinutes)}</div>
                </div>
                <div onClick={() => setView("profit")} style={{ ...cardStyle }}>
                  <div style={statLabel}>Hourly Rate</div>
                  <div style={{ ...statValue, color: hourlyRate >= 0 ? "#00E676" : "#FF5252" }}>{formatCurrencyFull(hourlyRate)}/hr</div>
                </div>
                <div onClick={() => setView("sessions")} style={{ ...cardStyle }}>
                  <div style={statLabel}>Win Rate</div>
                  <div style={{ ...statValue, color: "#1565c0" }}>{winRate.toFixed(1)}%</div>
                  <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{sessions.length} sessions</div>
                </div>
              </div>

              {/* This Month / This Year */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div onClick={() => setView("month-sessions")} style={{ ...cardStyle }}>
                  <div style={statLabel}>This Month</div>
                  <div style={{ fontSize: 18, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: monthProfit >= 0 ? "#2e7d32" : "#c62828", marginTop: 4 }}>
                    {monthProfit >= 0 ? "+" : "-"}{formatCurrencyFull(monthProfit)}
                  </div>
                  <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{monthSessions.length} sessions • {formatHoursFull(monthMinutes)}hrs</div>
                  <div style={{ borderTop: "1px solid #e8e6e2", marginTop: 8, paddingTop: 8 }}>
                    <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5 }}>{lastMonthName}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: lastMonthProfit >= 0 ? "#2e7d32" : "#c62828", marginTop: 2 }}>
                      {lastMonthProfit >= 0 ? "+" : "-"}{formatCurrencyFull(lastMonthProfit)}
                    </div>
                    <div style={{ fontSize: 10, color: "#ccc", marginTop: 1 }}>{lastMonthSessions.length} sessions • {formatHoursFull(lastMonthMinutes)}hrs</div>
                  </div>
                </div>
                <div onClick={() => setView("year-sessions")} style={{ ...cardStyle }}>
                  <div style={statLabel}>This Year</div>
                  <div style={{ fontSize: 18, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: yearProfit >= 0 ? "#2e7d32" : "#c62828", marginTop: 4 }}>
                    {yearProfit >= 0 ? "+" : "-"}{formatCurrencyFull(yearProfit)}
                  </div>
                  <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{yearSessions.length} sessions • {formatHoursFull(yearMinutes)}hrs</div>
                  <div style={{ borderTop: "1px solid #e8e6e2", marginTop: 8, paddingTop: 8 }}>
                    <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5 }}>{lastYear}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: lastYearProfit >= 0 ? "#2e7d32" : "#c62828", marginTop: 2 }}>
                      {lastYearProfit >= 0 ? "+" : "-"}{formatCurrencyFull(lastYearProfit)}
                    </div>
                    <div style={{ fontSize: 10, color: "#ccc", marginTop: 1 }}>{lastYearSessions.length} sessions • {formatHoursFull(lastYearMinutes)}hrs</div>
                  </div>
                </div>
              </div>

              {/* Cumulative Profit Chart with time filters */}
              <div onClick={() => setView("chart-detail")} style={{ ...cardStyle, padding: "12px" }}>
                <div style={{ ...statLabel, marginBottom: 8, paddingLeft: 6 }}>Cumulative Profit</div>
                <CumulativeLine data={[...sessions].reverse().map(s => ({ value: Number(s.net_profit || 0), label: s.start_time?.slice(0, 10) || "" }))} />
              </div>

              {/* Recent Sessions */}
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={statLabel}>Recent Sessions</div>
                  <button onClick={() => setView("sessions")} style={{ background: "none", border: "none", color: "#b8860b", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>View All →</button>
                </div>
                {sessions.slice(0, 5).map((s) => (
                  <div key={s.id} onClick={() => setDeleteConfirm(s)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e8e6e2", cursor: "pointer" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#333" }}>{s.game || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: "#bbb" }}>{formatDateShort(s.start_time)} • {s.location}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: Number(s.net_profit) >= 0 ? "#2e7d32" : "#c62828" }}>
                      {Number(s.net_profit) >= 0 ? "+" : "-"}{formatCurrencyFull(s.net_profit)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Top Games */}
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={{ ...statLabel, marginBottom: 10 }}>By Game</div>
                {Object.entries(byGame).sort((a, b) => b[1].profit - a[1].profit).slice(0, 5).map(([game, d]) => (
                  <div key={game} onClick={() => { setDetailData({ type: "game", name: game }); setView("game-detail"); }}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e8e6e2", cursor: "pointer" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>{game}</div>
                      <div style={{ fontSize: 11, color: "#bbb" }}>{d.sessions} sessions • {formatHoursFull(d.minutes)}hrs</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: d.profit >= 0 ? "#2e7d32" : "#c62828" }}>
                      {d.profit >= 0 ? "+" : "-"}{formatCurrencyFull(d.profit)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Top Locations */}
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={{ ...statLabel, marginBottom: 10 }}>By Location</div>
                {Object.entries(byLocation).sort((a, b) => b[1].profit - a[1].profit).slice(0, 5).map(([loc, d]) => (
                  <div key={loc} onClick={() => { setDetailData({ type: "location", name: loc }); setView("location-detail"); }}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e8e6e2", cursor: "pointer" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>{loc}</div>
                      <div style={{ fontSize: 11, color: "#bbb" }}>{d.sessions} sessions • {formatHoursFull(d.minutes)}hrs</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: d.profit >= 0 ? "#2e7d32" : "#c62828" }}>
                      {d.profit >= 0 ? "+" : "-"}{formatCurrencyFull(d.profit)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Yearly Breakdown */}
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={statLabel}>By Year</div>
                  <button onClick={() => setView("years")} style={{ background: "none", border: "none", color: "#b8860b", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>View All →</button>
                </div>
                {yearlyData.reverse().slice(0, 5).map(([year, d]) => (
                  <div key={year} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e8e6e2" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>{year}</div>
                      <div style={{ fontSize: 11, color: "#bbb" }}>{d.sessions} sessions • {formatHoursFull(d.minutes)}hrs</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: d.profit >= 0 ? "#00E676" : "#FF5252" }}>
                      {d.profit >= 0 ? "+" : "-"}{formatCurrencyFull(d.profit)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== HOURS DRILL-DOWN ==================== */}
      {view === "hours" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#999", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back to Dashboard</button>

          <div style={{ ...cardStyle, cursor: "default" }}>
            <div style={statLabel}>Total Hours</div>
            <div style={{ ...statValue, color: "#b8860b" }}>{formatHoursFull(totalMinutes)}</div>
            <div style={{ fontSize: 12, color: "#bbb", marginTop: 4 }}>Avg {(totalHours / Math.max(sessions.length, 1)).toFixed(1)}hrs per session</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={statLabel}>This Month</div>
              <div style={{ fontSize: 20, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: "#b8860b", marginTop: 4 }}>{formatHoursFull(monthMinutes)}hrs</div>
              <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{monthSessions.length} sessions</div>
            </div>
            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={statLabel}>This Year</div>
              <div style={{ fontSize: 20, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: "#b8860b", marginTop: 4 }}>{formatHoursFull(yearMinutes)}hrs</div>
              <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{yearSessions.length} sessions</div>
            </div>
          </div>

          <div style={{ ...cardStyle, cursor: "default" }}>
            <div style={{ ...statLabel, marginBottom: 10 }}>Hours by Game</div>
            {Object.entries(byGame).sort((a, b) => b[1].minutes - a[1].minutes).map(([game, d]) => {
              const pct = totalMinutes > 0 ? (d.minutes / totalMinutes * 100) : 0;
              return (
                <div key={game} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#333" }}>{game}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: "#b8860b" }}>{formatHoursFull(d.minutes)}hrs</span>
                  </div>
                  <div style={{ background: "#f0eee9", borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{ background: "#2e7d32", height: "100%", width: `${pct}%`, borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ ...cardStyle, cursor: "default" }}>
            <div style={{ ...statLabel, marginBottom: 10 }}>Hours by Location</div>
            {Object.entries(byLocation).sort((a, b) => b[1].minutes - a[1].minutes).map(([loc, d]) => {
              const pct = totalMinutes > 0 ? (d.minutes / totalMinutes * 100) : 0;
              return (
                <div key={loc} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#333" }}>{loc}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: "#b8860b" }}>{formatHoursFull(d.minutes)}hrs</span>
                  </div>
                  <div style={{ background: "#f0eee9", borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{ background: "#2e7d32", height: "100%", width: `${pct}%`, borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== PROFIT DRILL-DOWN ==================== */}
      {view === "profit" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#999", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back to Dashboard</button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={statLabel}>Lifetime</div>
              <div style={{ fontSize: 20, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: totalProfit >= 0 ? "#00E676" : "#FF5252", marginTop: 4 }}>{formatCurrencyFull(totalProfit)}</div>
            </div>
            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={statLabel}>Hourly Rate</div>
              <div style={{ fontSize: 20, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: hourlyRate >= 0 ? "#00E676" : "#FF5252", marginTop: 4 }}>{formatCurrencyFull(hourlyRate)}/hr</div>
            </div>
          </div>

          <div style={{ ...cardStyle, cursor: "default", padding: "12px" }}>
            <div style={{ ...statLabel, marginBottom: 8, paddingLeft: 6 }}>Cumulative Profit</div>
            <CumulativeLine data={[...sessions].reverse().map(s => ({ value: Number(s.net_profit || 0), label: s.start_time?.slice(0, 10) || "" }))} height={160} />
          </div>

          <div style={{ ...cardStyle, cursor: "default" }}>
            <div style={{ ...statLabel, marginBottom: 10 }}>Profit by Game</div>
            {Object.entries(byGame).sort((a, b) => b[1].profit - a[1].profit).map(([game, d]) => {
              const hr = d.minutes > 0 ? d.profit / (d.minutes / 60) : 0;
              return (
                <div key={game} onClick={() => { setDetailData({ type: "game", name: game }); setView("game-detail"); }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #e8e6e2", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>{game}</div>
                    <div style={{ fontSize: 11, color: "#bbb" }}>{d.sessions} sessions • {formatHoursFull(d.minutes)}hrs • {formatCurrencyFull(hr)}/hr</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: d.profit >= 0 ? "#00E676" : "#FF5252" }}>
                    {d.profit >= 0 ? "+" : ""}{formatCurrencyFull(d.profit)}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ ...cardStyle, cursor: "default" }}>
            <div style={{ ...statLabel, marginBottom: 10 }}>Profit by Location</div>
            {Object.entries(byLocation).sort((a, b) => b[1].profit - a[1].profit).map(([loc, d]) => {
              const hr = d.minutes > 0 ? d.profit / (d.minutes / 60) : 0;
              return (
                <div key={loc} onClick={() => { setDetailData({ type: "location", name: loc }); setView("location-detail"); }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #e8e6e2", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>{loc}</div>
                    <div style={{ fontSize: 11, color: "#bbb" }}>{d.sessions} sessions • {formatHoursFull(d.minutes)}hrs • {formatCurrencyFull(hr)}/hr</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: d.profit >= 0 ? "#00E676" : "#FF5252" }}>
                    {d.profit >= 0 ? "+" : ""}{formatCurrencyFull(d.profit)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== GAME/LOCATION DETAIL ==================== */}
      {(view === "game-detail" || view === "location-detail") && detailData && (() => {
        const isGame = view === "game-detail";
        const filterFn = isGame ? (s => s.game === detailData.name) : (s => s.location === detailData.name);
        const detailSessions = sessions.filter(filterFn);
        const dProfit = detailSessions.reduce((sum, s) => sum + Number(s.net_profit || 0), 0);
        const dMinutes = detailSessions.reduce((sum, s) => sum + Number(s.playing_minutes || 0), 0);
        const dWin = detailSessions.filter(s => Number(s.net_profit || 0) > 0).length;
        const dHourly = dMinutes > 0 ? dProfit / (dMinutes / 60) : 0;

        return (
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#999", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back</button>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>{detailData.name}</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={statLabel}>Profit</div>
                <div style={{ fontSize: 20, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: dProfit >= 0 ? "#00E676" : "#FF5252", marginTop: 4 }}>{formatCurrencyFull(dProfit)}</div>
              </div>
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={statLabel}>Hourly</div>
                <div style={{ fontSize: 20, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: dHourly >= 0 ? "#00E676" : "#FF5252", marginTop: 4 }}>{formatCurrencyFull(dHourly)}/hr</div>
              </div>
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={statLabel}>Sessions</div>
                <div style={{ fontSize: 20, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: "#1565c0", marginTop: 4 }}>{detailSessions.length}</div>
              </div>
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={statLabel}>Win Rate</div>
                <div style={{ fontSize: 20, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: "#1565c0", marginTop: 4 }}>{detailSessions.length > 0 ? (dWin / detailSessions.length * 100).toFixed(1) : 0}%</div>
              </div>
            </div>

            <div style={{ ...cardStyle, cursor: "default", padding: "12px" }}>
              <div style={{ ...statLabel, marginBottom: 8, paddingLeft: 6 }}>Profit Over Time</div>
              <CumulativeLine data={[...detailSessions].reverse().map(s => ({ value: Number(s.net_profit || 0), label: s.start_time?.slice(0, 10) || "" }))} />
            </div>

            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={{ ...statLabel, marginBottom: 10 }}>Sessions</div>
              {detailSessions.slice(0, 20).map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e8e6e2" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{isGame ? s.location : s.game}</div>
                    <div style={{ fontSize: 11, color: "#bbb" }}>{formatDateShort(s.start_time)} • {formatHoursFull(s.playing_minutes)}hrs</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: Number(s.net_profit) >= 0 ? "#00E676" : "#FF5252" }}>
                    {Number(s.net_profit) >= 0 ? "+" : ""}{formatCurrencyFull(s.net_profit)}
                  </div>
                </div>
              ))}
              {detailSessions.length > 20 && <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: 10 }}>Showing 20 of {detailSessions.length}</div>}
            </div>
          </div>
        );
      })()}

      {/* ==================== ALL SESSIONS ==================== */}
      {view === "sessions" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#999", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back to Dashboard</button>

          {/* Filters */}
          <div style={{ display: "flex", gap: 8 }}>
            <select value={filterGame} onChange={(e) => setFilterGame(e.target.value)} style={{ ...inputStyle, flex: 1, fontSize: 12 }}>
              <option value="all">All Games</option>
              {allGames.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} style={{ ...inputStyle, flex: 1, fontSize: 12 }}>
              <option value="all">All Locations</option>
              {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} style={{ ...inputStyle, width: 80, fontSize: 12 }}>
              <option value="all">All</option>
              {allYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div style={{ fontSize: 12, color: "#aaa" }}>{filtered.length} sessions</div>

          {filtered.slice(0, 50).map((s) => (
            <div key={s.id} onClick={() => setDeleteConfirm(s)} style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", border: "1px solid #e8e6e2", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>{s.game || "Unknown"}</div>
                <div style={{ fontSize: 11, color: "#bbb" }}>{formatDate(s.start_time)} • {s.location} • {formatHoursFull(s.playing_minutes)}hrs</div>
                {s.note && <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{s.note}</div>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: Number(s.net_profit) >= 0 ? "#00E676" : "#FF5252" }}>
                {Number(s.net_profit) >= 0 ? "+" : ""}{formatCurrencyFull(s.net_profit)}
              </div>
            </div>
          ))}
          {filtered.length > 50 && <div style={{ fontSize: 12, color: "#bbb", textAlign: "center" }}>Showing 50 of {filtered.length}</div>}
        </div>
      )}

      {/* ==================== ADD SESSION ==================== */}
      {view === "add" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#999", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back</button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Add Session</h2>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setShowManageCustom(true)} style={{ background: "none", border: "none", color: "#aaa", fontSize: 12, cursor: "pointer" }}>✎ Fields</button>
              <button onClick={() => setShowManagePresets(true)} style={{ background: "none", border: "none", color: "#aaa", fontSize: 12, cursor: "pointer" }}>⚙ Presets</button>
            </div>
          </div>

          {/* Preset buttons */}
          {presets.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {presets.map((preset, i) => (
                <button key={i} onClick={() => applyPreset(preset)} style={{
                  padding: "8px 14px", background: "#fff", border: "1px solid #e8e6e2", borderRadius: 20,
                  color: "#2e7d32", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  whiteSpace: "nowrap", transition: "all 0.15s",
                }}>
                  {preset.name}
                </button>
              ))}
            </div>
          )}

          <div><label style={labelStyle}>Date</label><input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={inputStyle} /></div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Game</label>
              {newGame === "__custom__" ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="text" placeholder="New game name..." autoFocus value={customGameInput} onChange={(e) => setCustomGameInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && customGameInput.trim()) { addCustomValue("games", customGameInput.trim()); setNewGame(customGameInput.trim()); setCustomGameInput(""); }}} style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => { if (customGameInput.trim()) { addCustomValue("games", customGameInput.trim()); setNewGame(customGameInput.trim()); } setCustomGameInput(""); }} style={{ background: "#2e7d32", border: "none", borderRadius: 10, color: "#fff", padding: "0 14px", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>✓</button>
                  <button onClick={() => { setNewGame("Dealers Choice"); setCustomGameInput(""); }} style={{ background: "#e8e6e2", border: "none", borderRadius: 10, color: "#999", padding: "0 14px", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>✕</button>
                </div>
              ) : (
                <select value={allGames.includes(newGame) ? newGame : "__show_custom__"} onChange={(e) => setNewGame(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  {!allGames.includes(newGame) && newGame && newGame !== "__custom__" && <option value="__show_custom__">{newGame}</option>}
                  {allGames.map(g => <option key={g} value={g}>{g}</option>)}
                  <option value="__custom__">+ Add new game...</option>
                </select>
              )}
            </div>
            <div style={{ width: 120 }}>
              <label style={labelStyle}>Variant</label>
              {newVariant === "__custom__" ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <input type="text" placeholder="New..." autoFocus value={customVariantInput} onChange={(e) => setCustomVariantInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && customVariantInput.trim()) { addCustomValue("variants", customVariantInput.trim()); setNewVariant(customVariantInput.trim()); setCustomVariantInput(""); }}} style={{ ...inputStyle, flex: 1, padding: "12px 8px" }} />
                  <button onClick={() => { if (customVariantInput.trim()) { addCustomValue("variants", customVariantInput.trim()); setNewVariant(customVariantInput.trim()); } setCustomVariantInput(""); }} style={{ background: "#2e7d32", border: "none", borderRadius: 10, color: "#fff", padding: "0 10px", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>✓</button>
                </div>
              ) : (
                <select value={allVariants.includes(newVariant) ? newVariant : "__show_custom__"} onChange={(e) => setNewVariant(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  {!allVariants.includes(newVariant) && newVariant && newVariant !== "__custom__" && <option value="__show_custom__">{newVariant}</option>}
                  {allVariants.map(v => <option key={v} value={v}>{v}</option>)}
                  <option value="__custom__">+ Add new...</option>
                </select>
              )}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Location</label>
            {newLocation === "__custom__" ? (
              <div style={{ display: "flex", gap: 6 }}>
                <input type="text" placeholder="New location name..." autoFocus value={customLocationInput} onChange={(e) => setCustomLocationInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && customLocationInput.trim()) { addCustomValue("locations", customLocationInput.trim()); setNewLocation(customLocationInput.trim()); setCustomLocationInput(""); }}} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => { if (customLocationInput.trim()) { addCustomValue("locations", customLocationInput.trim()); setNewLocation(customLocationInput.trim()); } setCustomLocationInput(""); }} style={{ background: "#2e7d32", border: "none", borderRadius: 10, color: "#fff", padding: "0 14px", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>✓</button>
                <button onClick={() => { setNewLocation(""); setCustomLocationInput(""); }} style={{ background: "#e8e6e2", border: "none", borderRadius: 10, color: "#999", padding: "0 14px", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>✕</button>
              </div>
            ) : (
              <select value={allLocations.includes(newLocation) ? newLocation : (newLocation ? "__show_custom__" : "")} onChange={(e) => setNewLocation(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">Select location...</option>
                {!allLocations.includes(newLocation) && newLocation && newLocation !== "__custom__" && <option value="__show_custom__">{newLocation}</option>}
                {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
                <option value="__custom__">+ Add new location...</option>
              </select>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Type</label>
              {newSessionType === "__custom__" ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <input type="text" placeholder="New type..." autoFocus value={customTypeInput} onChange={(e) => setCustomTypeInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && customTypeInput.trim()) { addCustomValue("types", customTypeInput.trim()); setNewSessionType(customTypeInput.trim()); setCustomTypeInput(""); }}} style={{ ...inputStyle, flex: 1, padding: "12px 8px" }} />
                  <button onClick={() => { if (customTypeInput.trim()) { addCustomValue("types", customTypeInput.trim()); setNewSessionType(customTypeInput.trim()); } setCustomTypeInput(""); }} style={{ background: "#2e7d32", border: "none", borderRadius: 10, color: "#fff", padding: "0 10px", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>✓</button>
                </div>
              ) : (
                <select value={allTypes.includes(newSessionType) ? newSessionType : "__show_custom__"} onChange={(e) => setNewSessionType(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  {!allTypes.includes(newSessionType) && newSessionType && newSessionType !== "__custom__" && <option value="__show_custom__">{newSessionType}</option>}
                  {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="__custom__">+ Add new...</option>
                </select>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Hours Played</label>
              <input type="number" placeholder="0" value={newHours} onChange={(e) => setNewHours(e.target.value)} style={inputStyle} min="0" step="0.5" />
            </div>
          </div>

          {/* Profit entry toggle */}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={() => setProfitMode("net")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: profitMode === "net" ? "#FFB800" : "#2a2a2a", color: profitMode === "net" ? "#000" : "#888", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>Enter Net Profit</button>
            <button onClick={() => setProfitMode("buyin")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: profitMode === "buyin" ? "#FFB800" : "#2a2a2a", color: profitMode === "buyin" ? "#000" : "#888", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>Buy-in / Cash-out</button>
          </div>

          {profitMode === "net" ? (
            <div><label style={labelStyle}>Net Profit ($)</label><input type="number" placeholder="e.g. 5000 or -2000" value={newNetProfit} onChange={(e) => setNewNetProfit(e.target.value)} style={inputStyle} step="any" /></div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><label style={labelStyle}>Buy-in ($)</label><input type="number" placeholder="0" value={newBuyin} onChange={(e) => setNewBuyin(e.target.value)} style={inputStyle} min="0" step="any" /></div>
              <div style={{ flex: 1 }}><label style={labelStyle}>Cash-out ($)</label><input type="number" placeholder="0" value={newCashout} onChange={(e) => setNewCashout(e.target.value)} style={inputStyle} min="0" step="any" /></div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Small Blind</label><input type="number" placeholder="0" value={newSmallBlind} onChange={(e) => setNewSmallBlind(e.target.value)} style={inputStyle} min="0" /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Big Blind</label><input type="number" placeholder="0" value={newBigBlind} onChange={(e) => setNewBigBlind(e.target.value)} style={inputStyle} min="0" /></div>
          </div>

          <div><label style={labelStyle}>Note — optional</label><input type="text" placeholder="Session notes..." value={newNote} onChange={(e) => setNewNote(e.target.value)} style={inputStyle} /></div>

          <button onClick={handleAddSession} style={{ padding: "14px", background: "#2e7d32", border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>+ Add Session</button>
        </div>
      )}

      {/* ==================== IMPORT ==================== */}
      {view === "import" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#999", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back</button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Import Data</h2>
          <div style={{ color: "#999", fontSize: 14 }}>Upload your cleaned Poker Bankroll Tracker CSV export. This will add all sessions to your account.</div>

          <input type="file" accept=".csv,text/csv,text/comma-separated-values,application/csv" ref={fileInputRef} onChange={handleImport} style={{ display: "none" }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={importing}
            style={{ padding: "16px", background: importing ? "#333" : "#FFB800", border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 500, cursor: importing ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            {importing ? "Importing..." : "📤 Select CSV File"}
          </button>

          {importStatus && (
            <div style={{ background: "#1a2e1a", borderRadius: 10, padding: 14, border: "1px solid #2a4a2a", color: "#8f8", fontSize: 14 }}>
              {importStatus}
            </div>
          )}

          <div style={{ color: "#bbb", fontSize: 12 }}>
            Supported format: Poker Bankroll Tracker (PBT) CSV export. Make sure to use the cleaned version with corrected game names and locations.
          </div>
        </div>
      )}

      {/* ==================== SESSION DETAIL (EDIT/DELETE) ==================== */}
      <Modal isOpen={!!deleteConfirm} onClose={() => { setDeleteConfirm(null); setEditingSession(null); }} title={editingSession ? "Edit Session" : "Session Details"}>
        {deleteConfirm && !editingSession && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#f0eee9", borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>{deleteConfirm.game}</div>
              <div style={{ fontSize: 28, fontWeight: 500, color: Number(deleteConfirm.net_profit) >= 0 ? "#2e7d32" : "#c62828", marginTop: 6 }}>
                {Number(deleteConfirm.net_profit) >= 0 ? "+" : ""}{formatCurrencyFull(deleteConfirm.net_profit)}
              </div>
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 6 }}>{formatDate(deleteConfirm.start_time)} • {deleteConfirm.location} • {formatHoursFull(deleteConfirm.playing_minutes)}hrs</div>
              {Number(deleteConfirm.buyin) > 0 && <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>Buy-in: {formatCurrencyFull(deleteConfirm.buyin)} • Cash-out: {formatCurrencyFull(deleteConfirm.cashout)}</div>}
              {deleteConfirm.note && <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>{deleteConfirm.note}</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => {
                setEditingSession({
                  id: deleteConfirm.id,
                  date: deleteConfirm.start_time?.slice(0, 10) || "",
                  game: deleteConfirm.game || "",
                  variant: deleteConfirm.variant || "Cash Game",
                  location: deleteConfirm.location || "",
                  sessionType: deleteConfirm.session_type || "Casino",
                  netProfit: String(Number(deleteConfirm.net_profit) || 0),
                  hours: String((Number(deleteConfirm.playing_minutes) || 0) / 60),
                  smallBlind: String(Number(deleteConfirm.small_blind) || ""),
                  bigBlind: String(Number(deleteConfirm.big_blind) || ""),
                  note: deleteConfirm.note || "",
                });
              }} style={{ flex: 1, padding: "12px", background: "#1565c0", border: "none", borderRadius: 10, color: "#fff", fontWeight: 500, cursor: "pointer", fontSize: 14 }}>Edit</button>
              <button onClick={() => handleDelete(deleteConfirm.id)} style={{ flex: 1, padding: "12px", background: "#c62828", border: "none", borderRadius: 10, color: "#fff", fontWeight: 500, cursor: "pointer", fontSize: 14 }}>Delete</button>
            </div>
          </div>
        )}
        {editingSession && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><label style={labelStyle}>Date</label><input type="date" value={editingSession.date} onChange={(e) => setEditingSession({ ...editingSession, date: e.target.value })} style={inputStyle} /></div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><label style={labelStyle}>Game</label>
                <select value={allGames.includes(editingSession.game) ? editingSession.game : ""} onChange={(e) => setEditingSession({ ...editingSession, game: e.target.value })} style={{ ...inputStyle, cursor: "pointer" }}>
                  {!allGames.includes(editingSession.game) && editingSession.game && <option value="">{editingSession.game}</option>}
                  {allGames.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}><label style={labelStyle}>Location</label>
                <select value={allLocations.includes(editingSession.location) ? editingSession.location : ""} onChange={(e) => setEditingSession({ ...editingSession, location: e.target.value })} style={{ ...inputStyle, cursor: "pointer" }}>
                  {!allLocations.includes(editingSession.location) && editingSession.location && <option value="">{editingSession.location}</option>}
                  {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div><label style={labelStyle}>Net Profit ($)</label><input type="number" value={editingSession.netProfit} onChange={(e) => setEditingSession({ ...editingSession, netProfit: e.target.value })} style={inputStyle} step="any" /></div>
            <div><label style={labelStyle}>Hours Played</label><input type="number" value={editingSession.hours} onChange={(e) => setEditingSession({ ...editingSession, hours: e.target.value })} style={inputStyle} min="0" step="0.5" /></div>
            <div><label style={labelStyle}>Note</label><input type="text" value={editingSession.note} onChange={(e) => setEditingSession({ ...editingSession, note: e.target.value })} style={inputStyle} /></div>
            <button onClick={async () => {
              const { error } = await supabase.from("bankroll_sessions").update({
                start_time: new Date(editingSession.date + "T12:00:00").toISOString(),
                game: editingSession.game,
                variant: editingSession.variant,
                location: editingSession.location,
                session_type: editingSession.sessionType,
                net_profit: parseFloat(editingSession.netProfit) || 0,
                playing_minutes: Math.round((parseFloat(editingSession.hours) || 0) * 60),
                small_blind: parseFloat(editingSession.smallBlind) || 0,
                big_blind: parseFloat(editingSession.bigBlind) || 0,
                note: editingSession.note,
              }).eq("id", editingSession.id);
              if (!error) { setEditingSession(null); setDeleteConfirm(null); fetchData(); }
            }} style={{ padding: "14px", background: "#2e7d32", border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 500, cursor: "pointer" }}>Save Changes</button>
          </div>
        )}
      </Modal>

      {/* ==================== CHART DETAIL WITH FILTERS ==================== */}
      {view === "chart-detail" && (() => {
        let chartSessions = [...sessions].reverse();
        let chartTitle = "All Time";
        if (chartFilter === "month") {
          chartSessions = chartSessions.filter(s => s.start_time?.startsWith(thisMonth));
          chartTitle = "This Month";
        } else if (chartFilter === "year") {
          chartSessions = chartSessions.filter(s => s.start_time?.startsWith(thisYear));
          chartTitle = thisYear;
        } else if (chartFilter === "lastyear") {
          chartSessions = chartSessions.filter(s => s.start_time?.startsWith(lastYear));
          chartTitle = lastYear;
        } else if (chartFilter === "custom" && chartCustomFrom && chartCustomTo) {
          chartSessions = chartSessions.filter(s => s.start_time?.slice(0, 10) >= chartCustomFrom && s.start_time?.slice(0, 10) <= chartCustomTo);
          chartTitle = `${chartCustomFrom} to ${chartCustomTo}`;
        }
        const chartProfit = chartSessions.reduce((sum, s) => sum + Number(s.net_profit || 0), 0);
        const useDay = chartFilter === "month";
        return (
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <button onClick={() => { setView("dashboard"); setChartFilter("all"); }} style={{ background: "none", border: "none", color: "#999", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back to Dashboard</button>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Cumulative Profit</h2>

            {/* Time filter buttons */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                { key: "all", label: "All Time" },
                { key: "month", label: "This Month" },
                { key: "year", label: thisYear },
                { key: "lastyear", label: lastYear },
                { key: "custom", label: "Custom" },
              ].map(f => (
                <button key={f.key} onClick={() => setChartFilter(f.key)} style={{
                  padding: "6px 14px", borderRadius: 20, border: "1px solid #e8e6e2", fontSize: 12, fontWeight: 500, cursor: "pointer",
                  background: chartFilter === f.key ? "#2e7d32" : "#fff", color: chartFilter === f.key ? "#fff" : "#888",
                }}>{f.label}</button>
              ))}
            </div>

            {chartFilter === "custom" && (
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>From</label><input type="date" value={chartCustomFrom} onChange={(e) => setChartCustomFrom(e.target.value)} style={inputStyle} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>To</label><input type="date" value={chartCustomTo} onChange={(e) => setChartCustomTo(e.target.value)} style={inputStyle} /></div>
              </div>
            )}

            <div style={{ ...cardStyle, cursor: "default", padding: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={statLabel}>{chartTitle}</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: chartProfit >= 0 ? "#2e7d32" : "#c62828" }}>
                  {chartProfit >= 0 ? "+" : ""}{formatCurrencyFull(chartProfit)}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#bbb", marginBottom: 10 }}>{chartSessions.length} sessions</div>
              {chartSessions.length >= 2 ? (
                <CumulativeLine data={chartSessions.map(s => ({
                  value: Number(s.net_profit || 0),
                  label: useDay ? s.start_time?.slice(8, 10) : s.start_time?.slice(0, 10) || ""
                }))} height={200} />
              ) : (
                <div style={{ textAlign: "center", color: "#bbb", padding: 30 }}>Not enough data for this period</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ==================== ALL YEARS VIEW ==================== */}
      {view === "years" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#999", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back to Dashboard</button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>All Years</h2>
          <div style={{ ...cardStyle, cursor: "default", padding: "12px" }}>
            <CumulativeLine data={[...sessions].reverse().map(s => ({ value: Number(s.net_profit || 0), label: s.start_time?.slice(0, 10) || "" }))} height={160} />
          </div>
          {yearlyData.reverse().map(([year, d]) => {
            const hr = d.minutes > 0 ? d.profit / (d.minutes / 60) : 0;
            return (
              <div key={year} style={{ ...cardStyle, cursor: "default", padding: "14px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: "#1a1a1a" }}>{year}</div>
                    <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{d.sessions} sessions • {formatHoursFull(d.minutes)}hrs • {formatCurrencyFull(hr)}/hr</div>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: d.profit >= 0 ? "#2e7d32" : "#c62828" }}>
                    {d.profit >= 0 ? "+" : "-"}{formatCurrencyFull(d.profit)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================== THIS MONTH SESSIONS ==================== */}
      {view === "month-sessions" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#999", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back to Dashboard</button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>This Month</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={statLabel}>Profit</div>
              <div style={{ fontSize: 20, fontWeight: 500, color: monthProfit >= 0 ? "#2e7d32" : "#c62828", marginTop: 4 }}>{monthProfit >= 0 ? "+" : "-"}{formatCurrencyFull(monthProfit)}</div>
            </div>
            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={statLabel}>Sessions</div>
              <div style={{ fontSize: 20, fontWeight: 500, color: "#1a1a1a", marginTop: 4 }}>{monthSessions.length}</div>
              <div style={{ fontSize: 10, color: "#bbb" }}>{formatHoursFull(monthMinutes)}hrs</div>
            </div>
          </div>
          {monthSessions.length === 0 ? (
            <div style={{ color: "#bbb", textAlign: "center", padding: 30 }}>No sessions this month</div>
          ) : monthSessions.map((s) => (
            <div key={s.id} style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", border: "1px solid #e8e6e2", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>{s.game || "Unknown"}</div>
                <div style={{ fontSize: 11, color: "#bbb" }}>{formatDate(s.start_time)} • {s.location} • {formatHoursFull(s.playing_minutes)}hrs</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 500, color: Number(s.net_profit) >= 0 ? "#2e7d32" : "#c62828" }}>
                {Number(s.net_profit) >= 0 ? "+" : ""}{formatCurrencyFull(s.net_profit)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==================== THIS YEAR SESSIONS ==================== */}
      {view === "year-sessions" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#999", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back to Dashboard</button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>This Year ({thisYear})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={statLabel}>Profit</div>
              <div style={{ fontSize: 20, fontWeight: 500, color: yearProfit >= 0 ? "#2e7d32" : "#c62828", marginTop: 4 }}>{yearProfit >= 0 ? "+" : "-"}{formatCurrencyFull(yearProfit)}</div>
            </div>
            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={statLabel}>Sessions</div>
              <div style={{ fontSize: 20, fontWeight: 500, color: "#1a1a1a", marginTop: 4 }}>{yearSessions.length}</div>
              <div style={{ fontSize: 10, color: "#bbb" }}>{formatHoursFull(yearMinutes)}hrs</div>
            </div>
          </div>
          <div style={{ ...cardStyle, cursor: "default", padding: "12px" }}>
            <div style={{ ...statLabel, marginBottom: 8, paddingLeft: 6 }}>Cumulative profit — {thisYear}</div>
            <CumulativeLine data={[...yearSessions].reverse().map(s => ({ value: Number(s.net_profit || 0), label: s.start_time?.slice(0, 10) || "" }))} />
          </div>
          {yearSessions.length === 0 ? (
            <div style={{ color: "#bbb", textAlign: "center", padding: 30 }}>No sessions this year</div>
          ) : yearSessions.slice(0, 50).map((s) => (
            <div key={s.id} style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", border: "1px solid #e8e6e2", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>{s.game || "Unknown"}</div>
                <div style={{ fontSize: 11, color: "#bbb" }}>{formatDate(s.start_time)} • {s.location} • {formatHoursFull(s.playing_minutes)}hrs</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 500, color: Number(s.net_profit) >= 0 ? "#2e7d32" : "#c62828" }}>
                {Number(s.net_profit) >= 0 ? "+" : ""}{formatCurrencyFull(s.net_profit)}
              </div>
            </div>
          ))}
          {yearSessions.length > 50 && <div style={{ fontSize: 12, color: "#bbb", textAlign: "center" }}>Showing 50 of {yearSessions.length}</div>}
        </div>
      )}

      {/* ==================== MANAGE CUSTOM FIELDS MODAL ==================== */}
      <Modal isOpen={showManageCustom} onClose={() => setShowManageCustom(false)} title="Custom Fields">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 13, color: "#999" }}>Custom values you've added. Tap × to remove. Values from your session history can't be removed here.</div>
          {[
            { label: "Games", category: "games", items: customAddedValues.games || [] },
            { label: "Locations", category: "locations", items: customAddedValues.locations || [] },
            { label: "Variants", category: "variants", items: customAddedValues.variants || [] },
            { label: "Types", category: "types", items: customAddedValues.types || [] },
          ].map(({ label, category, items }) => (
            items.length > 0 && (
              <div key={category}>
                <div style={labelStyle}>{label}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {items.map(item => (
                    <span key={item} style={{ background: "#fff", border: "1px solid #e8e6e2", borderRadius: 20, padding: "6px 12px", fontSize: 13, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
                      {item}
                      <button onClick={() => removeCustomValue(category, item)} style={{ background: "none", border: "none", color: "#c62828", fontSize: 14, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            )
          ))}
          {(customAddedValues.games || []).length === 0 && (customAddedValues.locations || []).length === 0 && (customAddedValues.variants || []).length === 0 && (customAddedValues.types || []).length === 0 && (
            <div style={{ color: "#bbb", textAlign: "center", padding: 20 }}>No custom fields added yet. Use "+ Add new..." in the dropdowns to create them.</div>
          )}
        </div>
      </Modal>

      {/* ==================== MANAGE PRESETS MODAL ==================== */}
      <Modal isOpen={showManagePresets} onClose={() => { setShowManagePresets(false); setEditingPreset(null); }} title="Session Presets">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: "#999" }}>Quick-fill buttons for the Add Session form. Tap a preset to edit it.</div>

          {presets.map((preset, i) => (
            <div key={i} style={{ background: editingPreset === i ? "#2a2a1a" : "#222", borderRadius: 10, padding: "12px 14px", border: editingPreset === i ? "1px solid #FFB800" : "1px solid #333" }}>
              {editingPreset === i ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div><label style={labelStyle}>Preset Name</label><input type="text" value={presetName} onChange={(e) => setPresetName(e.target.value)} style={inputStyle} placeholder="e.g. Sortis Omaha" /></div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Game</label>
                      {presetGame === "__custom__" ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <input type="text" placeholder="New game..." autoFocus value={customGameInput} onChange={(e) => setCustomGameInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && customGameInput.trim()) { addCustomValue("games", customGameInput.trim()); setPresetGame(customGameInput.trim()); setCustomGameInput(""); }}} style={{ ...inputStyle, flex: 1, padding: "12px 8px" }} />
                          <button onClick={() => { if (customGameInput.trim()) { addCustomValue("games", customGameInput.trim()); setPresetGame(customGameInput.trim()); } setCustomGameInput(""); }} style={{ background: "#2e7d32", border: "none", borderRadius: 10, color: "#fff", padding: "0 10px", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>✓</button>
                        </div>
                      ) : (
                        <select value={allGames.includes(presetGame) ? presetGame : (presetGame ? "__show__" : "")} onChange={(e) => setPresetGame(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                          <option value="">Select...</option>
                          {!allGames.includes(presetGame) && presetGame && presetGame !== "__custom__" && <option value="__show__">{presetGame}</option>}
                          {allGames.map(g => <option key={g} value={g}>{g}</option>)}
                          <option value="__custom__">+ Add new...</option>
                        </select>
                      )}
                    </div>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Variant</label>
                      <select value={allVariants.includes(presetVariant) ? presetVariant : "__show__"} onChange={(e) => setPresetVariant(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                        {!allVariants.includes(presetVariant) && presetVariant && <option value="__show__">{presetVariant}</option>}
                        {allVariants.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Location</label>
                      {presetLocation === "__custom__" ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <input type="text" placeholder="New location..." autoFocus value={customLocationInput} onChange={(e) => setCustomLocationInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && customLocationInput.trim()) { addCustomValue("locations", customLocationInput.trim()); setPresetLocation(customLocationInput.trim()); setCustomLocationInput(""); }}} style={{ ...inputStyle, flex: 1, padding: "12px 8px" }} />
                          <button onClick={() => { if (customLocationInput.trim()) { addCustomValue("locations", customLocationInput.trim()); setPresetLocation(customLocationInput.trim()); } setCustomLocationInput(""); }} style={{ background: "#2e7d32", border: "none", borderRadius: 10, color: "#fff", padding: "0 10px", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>✓</button>
                        </div>
                      ) : (
                        <select value={allLocations.includes(presetLocation) ? presetLocation : (presetLocation ? "__show__" : "")} onChange={(e) => setPresetLocation(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                          <option value="">Select...</option>
                          {!allLocations.includes(presetLocation) && presetLocation && presetLocation !== "__custom__" && <option value="__show__">{presetLocation}</option>}
                          {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
                          <option value="__custom__">+ Add new...</option>
                        </select>
                      )}
                    </div>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Type</label>
                      <select value={allTypes.includes(presetType) ? presetType : "__show__"} onChange={(e) => setPresetType(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                        {!allTypes.includes(presetType) && presetType && <option value="__show__">{presetType}</option>}
                        {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Small Blind</label><input type="number" value={presetSmallBlind} onChange={(e) => setPresetSmallBlind(e.target.value)} style={inputStyle} placeholder="0" /></div>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Big Blind</label><input type="number" value={presetBigBlind} onChange={(e) => setPresetBigBlind(e.target.value)} style={inputStyle} placeholder="0" /></div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={saveEditedPreset} style={{ flex: 1, padding: "10px", background: "#2e7d32", border: "none", borderRadius: 8, color: "#fff", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>Save</button>
                    <button onClick={() => setEditingPreset(null)} style={{ flex: 1, padding: "10px", background: "#e8e6e2", border: "none", borderRadius: 8, color: "#999", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div onClick={() => startEditPreset(preset, i)} style={{ cursor: "pointer", flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#b8860b" }}>{preset.name}</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{preset.game} • {preset.location} • {preset.smallBlind}/{preset.bigBlind}</div>
                  </div>
                  <button onClick={() => deletePreset(i)} style={{ background: "none", border: "none", color: "#bbb", fontSize: 16, cursor: "pointer", padding: "4px 8px" }}>×</button>
                </div>
              )}
            </div>
          ))}

          {/* Add new preset */}
          {editingPreset === "new" ? (
            <div style={{ background: "#fffbf0", borderRadius: 10, padding: "12px 14px", border: "1px solid #2e7d32", display: "flex", flexDirection: "column", gap: 10 }}>
              <div><label style={labelStyle}>Preset Name</label><input type="text" value={presetName} onChange={(e) => setPresetName(e.target.value)} style={inputStyle} placeholder="e.g. Sortis Omaha" autoFocus /></div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>Game</label>
                  {presetGame === "__custom__" ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <input type="text" placeholder="New game..." autoFocus value={customGameInput} onChange={(e) => setCustomGameInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && customGameInput.trim()) { addCustomValue("games", customGameInput.trim()); setPresetGame(customGameInput.trim()); setCustomGameInput(""); }}} style={{ ...inputStyle, flex: 1, padding: "12px 8px" }} />
                      <button onClick={() => { if (customGameInput.trim()) { addCustomValue("games", customGameInput.trim()); setPresetGame(customGameInput.trim()); } setCustomGameInput(""); }} style={{ background: "#2e7d32", border: "none", borderRadius: 10, color: "#fff", padding: "0 10px", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>✓</button>
                    </div>
                  ) : (
                    <select value={allGames.includes(presetGame) ? presetGame : (presetGame ? "__show__" : "")} onChange={(e) => setPresetGame(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                      <option value="">Select...</option>
                      {!allGames.includes(presetGame) && presetGame && presetGame !== "__custom__" && <option value="__show__">{presetGame}</option>}
                      {allGames.map(g => <option key={g} value={g}>{g}</option>)}
                      <option value="__custom__">+ Add new...</option>
                    </select>
                  )}
                </div>
                <div style={{ flex: 1 }}><label style={labelStyle}>Variant</label>
                  <select value={allVariants.includes(presetVariant) ? presetVariant : "__show__"} onChange={(e) => setPresetVariant(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                    {!allVariants.includes(presetVariant) && presetVariant && <option value="__show__">{presetVariant}</option>}
                    {allVariants.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>Location</label>
                  {presetLocation === "__custom__" ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <input type="text" placeholder="New location..." autoFocus value={customLocationInput} onChange={(e) => setCustomLocationInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && customLocationInput.trim()) { addCustomValue("locations", customLocationInput.trim()); setPresetLocation(customLocationInput.trim()); setCustomLocationInput(""); }}} style={{ ...inputStyle, flex: 1, padding: "12px 8px" }} />
                      <button onClick={() => { if (customLocationInput.trim()) { addCustomValue("locations", customLocationInput.trim()); setPresetLocation(customLocationInput.trim()); } setCustomLocationInput(""); }} style={{ background: "#2e7d32", border: "none", borderRadius: 10, color: "#fff", padding: "0 10px", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>✓</button>
                    </div>
                  ) : (
                    <select value={allLocations.includes(presetLocation) ? presetLocation : (presetLocation ? "__show__" : "")} onChange={(e) => setPresetLocation(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                      <option value="">Select...</option>
                      {!allLocations.includes(presetLocation) && presetLocation && presetLocation !== "__custom__" && <option value="__show__">{presetLocation}</option>}
                      {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
                      <option value="__custom__">+ Add new...</option>
                    </select>
                  )}
                </div>
                <div style={{ flex: 1 }}><label style={labelStyle}>Type</label>
                  <select value={allTypes.includes(presetType) ? presetType : "__show__"} onChange={(e) => setPresetType(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                    {!allTypes.includes(presetType) && presetType && <option value="__show__">{presetType}</option>}
                    {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>Small Blind</label><input type="number" value={presetSmallBlind} onChange={(e) => setPresetSmallBlind(e.target.value)} style={inputStyle} placeholder="0" /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>Big Blind</label><input type="number" value={presetBigBlind} onChange={(e) => setPresetBigBlind(e.target.value)} style={inputStyle} placeholder="0" /></div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { saveEditedPreset(); }} style={{ flex: 1, padding: "10px", background: "#2e7d32", border: "none", borderRadius: 8, color: "#fff", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>Add Preset</button>
                <button onClick={() => { setEditingPreset(null); setPresetName(""); }} style={{ flex: 1, padding: "10px", background: "#e8e6e2", border: "none", borderRadius: 8, color: "#999", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setEditingPreset("new"); setPresetName(""); setPresetGame(""); setPresetVariant("Cash Game"); setPresetLocation(""); setPresetType("Casino"); setPresetSmallBlind(""); setPresetBigBlind(""); }}
              style={{ padding: "12px", background: "#f0eee9", border: "1px dashed #ccc", borderRadius: 10, color: "#999", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>+ Add New Preset</button>
          )}
        </div>
      </Modal>

      {/* FAB for adding session */}
      {view === "dashboard" && sessions.length > 0 && (
        <button onClick={() => setView("add")}
          style={{ position: "fixed", bottom: 24, right: "calc(50% - 210px)", width: 56, height: 56, borderRadius: "50%", background: "#2e7d32", border: "none", color: "#fff", fontSize: 28, fontWeight: 300, cursor: "pointer", boxShadow: "0 4px 20px rgba(46,125,50,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>+</button>
      )}
    </div>
  );
}

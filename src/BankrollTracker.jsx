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

const inputStyle = { width: "100%", padding: "12px 14px", background: "#2a2a2a", border: "1px solid #444", borderRadius: 10, color: "#fff", fontSize: 15, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" };
const labelStyle = { display: "block", marginBottom: 6, fontSize: 13, color: "#999", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" };

// ==================== MODAL ====================
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1a1a", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", border: "1px solid #333" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "#333", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ==================== MINI BAR CHART ====================
const MiniBarChart = ({ data, color = "#00E676", height = 120 }) => {
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
            {data.length <= 24 && <div style={{ fontSize: 8, color: "#555", whiteSpace: "nowrap" }}>{d.label}</div>}
          </div>
        );
      })}
    </div>
  );
};

// ==================== CUMULATIVE LINE (SVG) ====================
const CumulativeLine = ({ data, height = 140, color = "#00E676" }) => {
  if (!data || data.length < 2) return null;
  const w = 360;
  const pad = 10;
  const vals = data.map(d => d.value);
  const cumulative = [];
  let sum = 0;
  vals.forEach(v => { sum += v; cumulative.push(sum); });
  const minY = Math.min(0, ...cumulative);
  const maxY = Math.max(...cumulative, 1);
  const rangeY = maxY - minY || 1;
  const points = cumulative.map((v, i) => {
    const x = pad + (i / (cumulative.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - minY) / rangeY) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const zeroY = pad + (1 - (0 - minY) / rangeY) * (height - pad * 2);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: "100%", height }}>
      <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="#333" strokeWidth="1" strokeDasharray="4" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x={pad} y={zeroY - 4} fill="#555" fontSize="10">$0</text>
      <text x={w - pad} y={pad + 12} fill={color} fontSize="10" textAnchor="end">{formatCurrency(cumulative[cumulative.length - 1])}</text>
    </svg>
  );
};

// ==================== MAIN COMPONENT ====================
export default function BankrollTracker({ session, onBack }) {
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

  // Import
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const fileInputRef = useRef(null);

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

  const yearSessions = sessions.filter(s => s.start_time?.startsWith(thisYear));
  const yearProfit = yearSessions.reduce((sum, s) => sum + Number(s.net_profit || 0), 0);
  const yearMinutes = yearSessions.reduce((sum, s) => sum + Number(s.playing_minutes || 0), 0);

  // Unique values for filters/forms
  const allGames = [...new Set(sessions.map(s => s.game).filter(Boolean))].sort();
  const allLocations = [...new Set(sessions.map(s => s.location).filter(Boolean))].sort();
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
  const handleDelete = async (id) => {
    await supabase.from("bankroll_sessions").delete().eq("id", id);
    setDeleteConfirm(null);
    fetchData();
  };

  // ==================== RENDER ====================
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div>Loading bankroll...</div>
        </div>
      </div>
    );
  }

  const cardStyle = { background: "#1e1e1e", borderRadius: 14, padding: "16px 18px", cursor: "pointer", border: "1px solid #2a2a2a", transition: "all 0.2s" };
  const statLabel = { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 };
  const statValue = { fontSize: 24, fontWeight: 800, fontFamily: "'Space Mono', monospace", marginTop: 4 };

  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#fff", fontFamily: "'DM Sans', sans-serif", maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: 80 }}>

      {/* ==================== TOP BAR ==================== */}
      <div style={{ background: "#1a1a1a", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #222" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
          ‹ Loans
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, fontFamily: "'Space Mono', monospace" }}>
          BANK<span style={{ color: "#FFB800" }}>ROLL</span>
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          {sessions.length === 0 ? (
            <button onClick={() => setView("import")} style={{ background: "#2a2a2a", border: "1px solid #444", color: "#fff", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Import</button>
          ) : (
            <button onClick={() => setView(view === "sessions" ? "dashboard" : "sessions")} style={{ background: "#2a2a2a", border: "1px solid #444", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>📋</button>
          )}
        </div>
      </div>

      {/* ==================== DASHBOARD ==================== */}
      {view === "dashboard" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {sessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#555" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>No sessions yet</div>
              <div style={{ fontSize: 13, marginTop: 6, color: "#444" }}>Import your PBT data or add your first session</div>
              <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "center" }}>
                <button onClick={() => setView("import")} style={{ padding: "12px 24px", background: "#FFB800", border: "none", borderRadius: 10, color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>📤 Import CSV</button>
                <button onClick={() => setView("add")} style={{ padding: "12px 24px", background: "#43A047", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>+ Add Session</button>
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
                  <div style={{ ...statValue, color: "#FFB800" }}>{formatHoursFull(totalMinutes)}</div>
                </div>
                <div onClick={() => setView("profit")} style={{ ...cardStyle }}>
                  <div style={statLabel}>Hourly Rate</div>
                  <div style={{ ...statValue, color: hourlyRate >= 0 ? "#00E676" : "#FF5252" }}>{formatCurrencyFull(hourlyRate)}/hr</div>
                </div>
                <div onClick={() => setView("sessions")} style={{ ...cardStyle }}>
                  <div style={statLabel}>Win Rate</div>
                  <div style={{ ...statValue, color: "#82B1FF" }}>{winRate.toFixed(1)}%</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{sessions.length} sessions</div>
                </div>
              </div>

              {/* This Month / This Year */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ ...cardStyle, cursor: "default" }}>
                  <div style={statLabel}>This Month</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: monthProfit >= 0 ? "#00E676" : "#FF5252", marginTop: 4 }}>
                    {monthProfit >= 0 ? "+" : "-"}{formatCurrencyFull(monthProfit)}
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{monthSessions.length} sessions • {formatHoursFull(monthMinutes)}hrs</div>
                </div>
                <div style={{ ...cardStyle, cursor: "default" }}>
                  <div style={statLabel}>This Year</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: yearProfit >= 0 ? "#00E676" : "#FF5252", marginTop: 4 }}>
                    {yearProfit >= 0 ? "+" : "-"}{formatCurrencyFull(yearProfit)}
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{yearSessions.length} sessions • {formatHoursFull(yearMinutes)}hrs</div>
                </div>
              </div>

              {/* Cumulative Profit Chart */}
              <div style={{ ...cardStyle, cursor: "default", padding: "12px" }}>
                <div style={{ ...statLabel, marginBottom: 8, paddingLeft: 6 }}>Cumulative Profit</div>
                <CumulativeLine data={[...sessions].reverse().map(s => ({ value: Number(s.net_profit || 0) }))} />
              </div>

              {/* Top Games */}
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={{ ...statLabel, marginBottom: 10 }}>By Game</div>
                {Object.entries(byGame).sort((a, b) => b[1].profit - a[1].profit).slice(0, 5).map(([game, d]) => (
                  <div key={game} onClick={() => { setDetailData({ type: "game", name: game }); setView("game-detail"); }}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #222", cursor: "pointer" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#ccc" }}>{game}</div>
                      <div style={{ fontSize: 11, color: "#555" }}>{d.sessions} sessions • {formatHoursFull(d.minutes)}hrs</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: d.profit >= 0 ? "#00E676" : "#FF5252" }}>
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
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #222", cursor: "pointer" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#ccc" }}>{loc}</div>
                      <div style={{ fontSize: 11, color: "#555" }}>{d.sessions} sessions • {formatHoursFull(d.minutes)}hrs</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: d.profit >= 0 ? "#00E676" : "#FF5252" }}>
                      {d.profit >= 0 ? "+" : "-"}{formatCurrencyFull(d.profit)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent Sessions */}
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={statLabel}>Recent Sessions</div>
                  <button onClick={() => setView("sessions")} style={{ background: "none", border: "none", color: "#FFB800", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>View All →</button>
                </div>
                {sessions.slice(0, 5).map((s) => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #222" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>{s.game || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: "#555" }}>{formatDateShort(s.start_time)} • {s.location}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: Number(s.net_profit) >= 0 ? "#00E676" : "#FF5252" }}>
                      {Number(s.net_profit) >= 0 ? "+" : "-"}{formatCurrencyFull(s.net_profit)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Yearly Breakdown */}
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={{ ...statLabel, marginBottom: 10 }}>By Year</div>
                {yearlyData.reverse().map(([year, d]) => (
                  <div key={year} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #222" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#ccc" }}>{year}</div>
                      <div style={{ fontSize: 11, color: "#555" }}>{d.sessions} sessions • {formatHoursFull(d.minutes)}hrs</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: d.profit >= 0 ? "#00E676" : "#FF5252" }}>
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
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#888", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back to Dashboard</button>

          <div style={{ ...cardStyle, cursor: "default" }}>
            <div style={statLabel}>Total Hours</div>
            <div style={{ ...statValue, color: "#FFB800" }}>{formatHoursFull(totalMinutes)}</div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>Avg {(totalHours / Math.max(sessions.length, 1)).toFixed(1)}hrs per session</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={statLabel}>This Month</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#FFB800", marginTop: 4 }}>{formatHoursFull(monthMinutes)}hrs</div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{monthSessions.length} sessions</div>
            </div>
            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={statLabel}>This Year</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#FFB800", marginTop: 4 }}>{formatHoursFull(yearMinutes)}hrs</div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{yearSessions.length} sessions</div>
            </div>
          </div>

          <div style={{ ...cardStyle, cursor: "default" }}>
            <div style={{ ...statLabel, marginBottom: 10 }}>Hours by Game</div>
            {Object.entries(byGame).sort((a, b) => b[1].minutes - a[1].minutes).map(([game, d]) => {
              const pct = totalMinutes > 0 ? (d.minutes / totalMinutes * 100) : 0;
              return (
                <div key={game} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#ccc" }}>{game}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#FFB800" }}>{formatHoursFull(d.minutes)}hrs</span>
                  </div>
                  <div style={{ background: "#222", borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{ background: "#FFB800", height: "100%", width: `${pct}%`, borderRadius: 4 }} />
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
                    <span style={{ fontSize: 13, color: "#ccc" }}>{loc}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#FFB800" }}>{formatHoursFull(d.minutes)}hrs</span>
                  </div>
                  <div style={{ background: "#222", borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{ background: "#FFB800", height: "100%", width: `${pct}%`, borderRadius: 4 }} />
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
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#888", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back to Dashboard</button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={statLabel}>Lifetime</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: totalProfit >= 0 ? "#00E676" : "#FF5252", marginTop: 4 }}>{formatCurrencyFull(totalProfit)}</div>
            </div>
            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={statLabel}>Hourly Rate</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: hourlyRate >= 0 ? "#00E676" : "#FF5252", marginTop: 4 }}>{formatCurrencyFull(hourlyRate)}/hr</div>
            </div>
          </div>

          <div style={{ ...cardStyle, cursor: "default", padding: "12px" }}>
            <div style={{ ...statLabel, marginBottom: 8, paddingLeft: 6 }}>Cumulative Profit</div>
            <CumulativeLine data={[...sessions].reverse().map(s => ({ value: Number(s.net_profit || 0) }))} height={160} />
          </div>

          <div style={{ ...cardStyle, cursor: "default" }}>
            <div style={{ ...statLabel, marginBottom: 10 }}>Profit by Game</div>
            {Object.entries(byGame).sort((a, b) => b[1].profit - a[1].profit).map(([game, d]) => {
              const hr = d.minutes > 0 ? d.profit / (d.minutes / 60) : 0;
              return (
                <div key={game} onClick={() => { setDetailData({ type: "game", name: game }); setView("game-detail"); }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #222", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#ccc" }}>{game}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>{d.sessions} sessions • {formatHoursFull(d.minutes)}hrs • {formatCurrencyFull(hr)}/hr</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: d.profit >= 0 ? "#00E676" : "#FF5252" }}>
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
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #222", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#ccc" }}>{loc}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>{d.sessions} sessions • {formatHoursFull(d.minutes)}hrs • {formatCurrencyFull(hr)}/hr</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: d.profit >= 0 ? "#00E676" : "#FF5252" }}>
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
            <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#888", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back</button>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{detailData.name}</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={statLabel}>Profit</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: dProfit >= 0 ? "#00E676" : "#FF5252", marginTop: 4 }}>{formatCurrencyFull(dProfit)}</div>
              </div>
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={statLabel}>Hourly</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: dHourly >= 0 ? "#00E676" : "#FF5252", marginTop: 4 }}>{formatCurrencyFull(dHourly)}/hr</div>
              </div>
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={statLabel}>Sessions</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#82B1FF", marginTop: 4 }}>{detailSessions.length}</div>
              </div>
              <div style={{ ...cardStyle, cursor: "default" }}>
                <div style={statLabel}>Win Rate</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#82B1FF", marginTop: 4 }}>{detailSessions.length > 0 ? (dWin / detailSessions.length * 100).toFixed(1) : 0}%</div>
              </div>
            </div>

            <div style={{ ...cardStyle, cursor: "default", padding: "12px" }}>
              <div style={{ ...statLabel, marginBottom: 8, paddingLeft: 6 }}>Profit Over Time</div>
              <CumulativeLine data={[...detailSessions].reverse().map(s => ({ value: Number(s.net_profit || 0) }))} />
            </div>

            <div style={{ ...cardStyle, cursor: "default" }}>
              <div style={{ ...statLabel, marginBottom: 10 }}>Sessions</div>
              {detailSessions.slice(0, 20).map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #222" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>{isGame ? s.location : s.game}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>{formatDateShort(s.start_time)} • {formatHoursFull(s.playing_minutes)}hrs</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: Number(s.net_profit) >= 0 ? "#00E676" : "#FF5252" }}>
                    {Number(s.net_profit) >= 0 ? "+" : ""}{formatCurrencyFull(s.net_profit)}
                  </div>
                </div>
              ))}
              {detailSessions.length > 20 && <div style={{ fontSize: 12, color: "#555", textAlign: "center", padding: 10 }}>Showing 20 of {detailSessions.length}</div>}
            </div>
          </div>
        );
      })()}

      {/* ==================== ALL SESSIONS ==================== */}
      {view === "sessions" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#888", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back to Dashboard</button>

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

          <div style={{ fontSize: 12, color: "#666" }}>{filtered.length} sessions</div>

          {filtered.slice(0, 50).map((s) => (
            <div key={s.id} onClick={() => setDeleteConfirm(s)} style={{ background: "#1a1a1a", borderRadius: 10, padding: "12px 16px", border: "1px solid #222", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#ccc" }}>{s.game || "Unknown"}</div>
                <div style={{ fontSize: 11, color: "#555" }}>{formatDate(s.start_time)} • {s.location} • {formatHoursFull(s.playing_minutes)}hrs</div>
                {s.note && <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{s.note}</div>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: Number(s.net_profit) >= 0 ? "#00E676" : "#FF5252" }}>
                {Number(s.net_profit) >= 0 ? "+" : ""}{formatCurrencyFull(s.net_profit)}
              </div>
            </div>
          ))}
          {filtered.length > 50 && <div style={{ fontSize: 12, color: "#555", textAlign: "center" }}>Showing 50 of {filtered.length}</div>}
        </div>
      )}

      {/* ==================== ADD SESSION ==================== */}
      {view === "add" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#888", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back</button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Add Session</h2>

          <div><label style={labelStyle}>Date</label><input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={inputStyle} /></div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Game</label>
              <input type="text" list="game-list" value={newGame} onChange={(e) => setNewGame(e.target.value)} style={inputStyle} placeholder="e.g. Dealers Choice" />
              <datalist id="game-list">{allGames.map(g => <option key={g} value={g} />)}</datalist>
            </div>
            <div style={{ width: 120 }}>
              <label style={labelStyle}>Variant</label>
              <select value={newVariant} onChange={(e) => setNewVariant(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="Cash Game">Cash Game</option>
                <option value="Tournament">Tournament</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Location</label>
            <input type="text" list="loc-list" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} style={inputStyle} placeholder="e.g. Sortis" />
            <datalist id="loc-list">{allLocations.map(l => <option key={l} value={l} />)}</datalist>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Type</label>
              <select value={newSessionType} onChange={(e) => setNewSessionType(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="Casino">Casino</option>
                <option value="Home Game">Home Game</option>
                <option value="Club">Club</option>
                <option value="Online">Online</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Hours Played</label>
              <input type="number" placeholder="0" value={newHours} onChange={(e) => setNewHours(e.target.value)} style={inputStyle} min="0" step="0.5" />
            </div>
          </div>

          {/* Profit entry toggle */}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={() => setProfitMode("net")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: profitMode === "net" ? "#FFB800" : "#2a2a2a", color: profitMode === "net" ? "#000" : "#888", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Enter Net Profit</button>
            <button onClick={() => setProfitMode("buyin")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: profitMode === "buyin" ? "#FFB800" : "#2a2a2a", color: profitMode === "buyin" ? "#000" : "#888", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Buy-in / Cash-out</button>
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

          <button onClick={handleAddSession} style={{ padding: "14px", background: "#43A047", border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>+ Add Session</button>
        </div>
      )}

      {/* ==================== IMPORT ==================== */}
      {view === "import" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#888", fontSize: 14, cursor: "pointer", textAlign: "left", padding: 0 }}>‹ Back</button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Import Data</h2>
          <div style={{ color: "#888", fontSize: 14 }}>Upload your cleaned Poker Bankroll Tracker CSV export. This will add all sessions to your account.</div>

          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImport} style={{ display: "none" }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={importing}
            style={{ padding: "16px", background: importing ? "#333" : "#FFB800", border: "none", borderRadius: 12, color: "#000", fontSize: 16, fontWeight: 700, cursor: importing ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            {importing ? "Importing..." : "📤 Select CSV File"}
          </button>

          {importStatus && (
            <div style={{ background: "#1a2e1a", borderRadius: 10, padding: 14, border: "1px solid #2a4a2a", color: "#8f8", fontSize: 14 }}>
              {importStatus}
            </div>
          )}

          <div style={{ color: "#555", fontSize: 12 }}>
            Supported format: Poker Bankroll Tracker (PBT) CSV export. Make sure to use the cleaned version with corrected game names and locations.
          </div>
        </div>
      )}

      {/* ==================== DELETE CONFIRM ==================== */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Session Details">
        {deleteConfirm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#222", borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#ccc" }}>{deleteConfirm.game}</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: Number(deleteConfirm.net_profit) >= 0 ? "#00E676" : "#FF5252", marginTop: 6 }}>
                {Number(deleteConfirm.net_profit) >= 0 ? "+" : ""}{formatCurrencyFull(deleteConfirm.net_profit)}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{formatDate(deleteConfirm.start_time)} • {deleteConfirm.location} • {formatHoursFull(deleteConfirm.playing_minutes)}hrs</div>
              {Number(deleteConfirm.buyin) > 0 && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Buy-in: {formatCurrencyFull(deleteConfirm.buyin)} • Cash-out: {formatCurrencyFull(deleteConfirm.cashout)}</div>}
              {deleteConfirm.note && <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>{deleteConfirm.note}</div>}
            </div>
            <button onClick={() => handleDelete(deleteConfirm.id)} style={{ padding: "12px", background: "#e53935", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Delete Session</button>
          </div>
        )}
      </Modal>

      {/* FAB for adding session */}
      {view === "dashboard" && sessions.length > 0 && (
        <button onClick={() => setView("add")}
          style={{ position: "fixed", bottom: 24, right: "calc(50% - 210px)", width: 56, height: 56, borderRadius: "50%", background: "#FFB800", border: "none", color: "#000", fontSize: 28, fontWeight: 300, cursor: "pointer", boxShadow: "0 4px 20px rgba(255,184,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>+</button>
      )}
    </div>
  );
}

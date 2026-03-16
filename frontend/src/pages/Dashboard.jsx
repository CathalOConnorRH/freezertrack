import { useState, useEffect, useRef } from "react";
import { getItems, getHAState, getScannerMode, setScannerMode } from "../api/client";
import FoodCard from "../components/FoodCard";
import AlertBanner from "../components/AlertBanner";
import ErrorBanner from "../components/ErrorBanner";
import { useNavigate } from "react-router-dom";
import { LogIn, LogOut } from "lucide-react";

export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [haState, setHAState] = useState(null);
  const [scanMode, setScanMode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const intervalRef = useRef(null);

  const fetchData = () => {
    Promise.all([
      getItems().then(setItems),
      getHAState().then(setHAState),
      getScannerMode().then((s) => setScanMode(s.mode)),
    ])
      .catch(() => setError("Failed to load dashboard data."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    const start = () => { intervalRef.current = setInterval(fetchData, 5000); };
    const stop = () => clearInterval(intervalRef.current);

    start();
    const onVisibility = () => { document.hidden ? stop() : start(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  const toggleScanMode = (m) => {
    setScanMode(m);
    setScannerMode(m).catch(() => {});
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto py-12 text-center text-[var(--text-secondary)]">Loading...</div>;
  }

  const totalItems = items.length;
  const addedThisWeek = items.filter((i) => {
    const d = new Date(i.created_at);
    return d.getTime() > Date.now() - 7 * 86400000;
  }).length;
  const needsAttention =
    haState?.alerts?.filter((a) => a.type === "old_item").length || 0;
  const recent = [...items]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6);

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Dashboard</h2>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={() => { setError(null); setLoading(true); fetchData(); }} /></div>}

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <StatCard label="In Freezer" value={totalItems} color="text-[var(--ice-blue)]" />
        <StatCard label="This Week" value={addedThisWeek} color="text-green-600" />
        <StatCard label="Attention" value={needsAttention} color="text-amber-600" />
      </div>

      {scanMode !== null && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-3 sm:p-4 mb-4 sm:mb-6">
          <p className="text-xs text-[var(--text-secondary)] mb-2 font-medium">USB Scanner Mode</p>
          <div className="flex gap-2">
            <button
              onClick={() => toggleScanMode("in")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${
                scanMode === "in" ? "bg-green-600 text-white" : "bg-[var(--bg)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
              }`}
            >
              <LogIn size={16} />Scan In
            </button>
            <button
              onClick={() => toggleScanMode("out")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${
                scanMode === "out" ? "bg-[var(--ice-blue)] text-white" : "bg-[var(--bg)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
              }`}
            >
              <LogOut size={16} />Scan Out
            </button>
          </div>
        </div>
      )}

      {haState?.alerts?.length > 0 && (
        <div className="mb-4 sm:mb-6"><AlertBanner alerts={haState.alerts} /></div>
      )}

      <h3 className="text-base sm:text-lg font-semibold mb-3">Recently Added</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        {recent.map((item) => (
          <FoodCard key={item.id} item={item} onClick={() => navigate("/inventory")} />
        ))}
      </div>

      {items.length === 0 && (
        <div className="text-center py-16">
          <p className="text-[var(--text-secondary)] text-sm sm:text-base">No items in freezer yet.</p>
          <button onClick={() => navigate("/add")} className="mt-4 px-6 py-2.5 bg-[var(--ice-blue)] text-white rounded-lg text-sm font-medium hover:bg-[#4a9bd9] transition-colors">
            Add your first item
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] px-3 py-3 sm:p-4 text-center">
      <p className={`text-2xl sm:text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] sm:text-xs text-[var(--text-secondary)] mt-0.5 sm:mt-1 leading-tight">{label}</p>
    </div>
  );
}

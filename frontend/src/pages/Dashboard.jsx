import { useState, useEffect, useRef } from "react";
import {
  getItems,
  getHAState,
  getScannerMode,
  setScannerMode,
  updateItem,
  removeItem,
  decrementItem,
  getCategories,
} from "../api/client";
import AlertBanner from "../components/AlertBanner";
import ErrorBanner from "../components/ErrorBanner";
import { useNavigate } from "react-router-dom";
import { LogIn, LogOut, Pencil, Check, X, Trash2, Minus } from "lucide-react";

const PRESET_CATEGORIES = [
  "Meat", "Poultry", "Fish", "Vegetables", "Fruit",
  "Ready Meals", "Soups", "Bread", "Desserts", "Other",
];

function daysAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function ageBadge(dateStr) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 30) return { label: "Fresh", cls: "bg-green-100 text-green-700" };
  if (days < 90) return { label: "Aging", cls: "bg-amber-100 text-amber-700" };
  return { label: "Old", cls: "bg-red-100 text-red-700" };
}

export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [haState, setHAState] = useState(null);
  const [scanMode, setScanMode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [acting, setActing] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);
  const navigate = useNavigate();
  const intervalRef = useRef(null);

  const fetchData = () => {
    Promise.all([
      getItems().then(setItems),
      getHAState().then(setHAState),
      getScannerMode().then((s) => setScanMode(s.mode)),
      getCategories().then(setCategories),
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

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      name: item.name || "",
      brand: item.brand || "",
      category: item.category || "",
      quantity: item.quantity,
      frozen_date: item.frozen_date,
      notes: item.notes || "",
    });
    setActionMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    setActing(true);
    try {
      const orig = items.find((i) => i.id === editingId);
      if (!orig) return;
      const changes = {};
      if (editForm.name !== (orig.name || "")) changes.name = editForm.name;
      if (editForm.brand !== (orig.brand || "")) changes.brand = editForm.brand || null;
      if (editForm.category !== (orig.category || "")) changes.category = editForm.category || null;
      if (editForm.quantity !== orig.quantity) changes.quantity = parseInt(editForm.quantity, 10);
      if (editForm.frozen_date !== orig.frozen_date) changes.frozen_date = editForm.frozen_date;
      if (editForm.notes !== (orig.notes || "")) changes.notes = editForm.notes || null;

      if (Object.keys(changes).length === 0) {
        cancelEdit();
        return;
      }
      await updateItem(editingId, changes);
      setActionMsg({ type: "ok", text: "Item updated" });
      cancelEdit();
      fetchData();
    } catch {
      setActionMsg({ type: "err", text: "Failed to save changes" });
    } finally {
      setActing(false);
    }
  };

  const handleRemove = async (item) => {
    setActing(true);
    try {
      await removeItem(item.id);
      setActionMsg({ type: "ok", text: `Removed ${item.name}` });
      cancelEdit();
      fetchData();
    } catch {
      setActionMsg({ type: "err", text: "Failed to remove item" });
    } finally {
      setActing(false);
    }
  };

  const handleDecrement = async (item) => {
    setActing(true);
    try {
      const res = await decrementItem(item.id);
      if (res.removed) {
        setActionMsg({ type: "ok", text: `Last serving used — removed` });
      } else {
        setActionMsg({ type: "ok", text: `1 serving used (${res.remaining} left)` });
      }
      cancelEdit();
      fetchData();
    } catch {
      setActionMsg({ type: "err", text: "Failed to decrement" });
    } finally {
      setActing(false);
    }
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
  const sorted = [...items].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
  const allCategories = [...new Set([...PRESET_CATEGORIES, ...categories])];

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

      {actionMsg && (
        <div
          className={`mb-4 px-3 py-2.5 rounded-lg text-sm font-medium ${
            actionMsg.type === "ok"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      <h3 className="text-base sm:text-lg font-semibold mb-3">All Items</h3>

      <div className="space-y-2">
        {sorted.map((item) => {
          const badge = ageBadge(item.frozen_date);
          const isEditing = editingId === item.id;

          if (isEditing) {
            return (
              <div
                key={item.id}
                className="bg-[var(--surface)] rounded-xl border-2 border-[var(--ice-blue)] p-4"
              >
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Name</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Brand</label>
                      <input
                        type="text"
                        value={editForm.brand}
                        onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Category</label>
                      <select
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-[var(--surface)] focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
                      >
                        <option value="">None</option>
                        {allCategories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={editForm.quantity}
                        onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value, 10) || 1 })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Frozen date</label>
                      <input
                        type="date"
                        value={editForm.frozen_date}
                        onChange={(e) => setEditForm({ ...editForm, frozen_date: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Notes</label>
                    <input
                      type="text"
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      placeholder="Optional notes..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={saveEdit}
                      disabled={acting}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[var(--ice-blue)] text-white rounded-lg text-sm font-medium hover:bg-[#4a9bd9] active:scale-[0.98] disabled:opacity-50"
                    >
                      <Check size={14} /> Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 active:scale-[0.98]"
                    >
                      <X size={14} /> Cancel
                    </button>
                    {item.quantity > 1 && (
                      <button
                        onClick={() => handleDecrement(item)}
                        disabled={acting}
                        className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100 active:scale-[0.98] disabled:opacity-50 ml-auto"
                      >
                        <Minus size={14} /> Use 1
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(item)}
                      disabled={acting}
                      className={`flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 active:scale-[0.98] disabled:opacity-50 ${item.quantity <= 1 ? "ml-auto" : ""}`}
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.id}
              className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-3.5 sm:p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-[15px] sm:text-base">
                      {item.name}
                    </h3>
                    {item.brand && (
                      <span className="text-xs text-gray-400">{item.brand}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs sm:text-sm text-gray-500">
                      Frozen {daysAgo(item.frozen_date)}
                    </span>
                    {item.category && (
                      <span className="text-[11px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                        {item.category}
                      </span>
                    )}
                    {item.notes && (
                      <span className="text-[11px] text-gray-400 italic truncate max-w-[200px]">
                        {item.notes}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <span className="bg-gray-100 text-gray-600 text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded-full">
                    x{item.quantity}
                  </span>
                  <span
                    className={`text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded-full ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                  <button
                    onClick={() => startEdit(item)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                    title="Edit item"
                  >
                    <Pencil size={15} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
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

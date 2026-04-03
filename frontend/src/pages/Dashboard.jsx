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
import { LogIn, LogOut, Pencil, Check, X, Trash2, Minus, ChevronDown, ChevronUp } from "lucide-react";

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
  const [expandedGroups, setExpandedGroups] = useState(new Set());
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
  const allCategories = [...new Set([...PRESET_CATEGORIES, ...categories])];

  const groups = buildGroups(items);

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); cancelEdit(); }
      else next.add(key);
      return next;
    });
  };

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
        {groups.map((group) => {
          const badge = ageBadge(group.oldestDate);
          const isMulti = group.items.length > 1;
          const isExpanded = expandedGroups.has(group.key);

          return (
            <div
              key={group.key}
              className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden hover:shadow-sm transition-shadow"
            >
              {/* Group summary row */}
              <div
                className={`flex items-center gap-3 p-3.5 sm:p-4 ${isMulti ? "cursor-pointer" : ""}`}
                onClick={isMulti ? () => toggleGroup(group.key) : undefined}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-[15px] sm:text-base">
                      {group.name}
                    </h3>
                    {group.brand && (
                      <span className="text-xs text-gray-400">{group.brand}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs sm:text-sm text-gray-500">
                      {isMulti
                        ? `${group.items.length} containers · oldest ${daysAgo(group.oldestDate)}`
                        : `Frozen ${daysAgo(group.oldestDate)}`}
                    </span>
                    {group.category && (
                      <span className="text-[11px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                        {group.category}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <span className="bg-[var(--ice-blue)]/10 text-[var(--ice-blue)] text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-full">
                    x{group.totalQty}
                  </span>
                  <span
                    className={`text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded-full ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                  {isMulti ? (
                    <span className="p-1.5 text-gray-400">
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </span>
                  ) : (
                    <button
                      onClick={() => startEdit(group.items[0])}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                      title="Edit item"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded: individual items within the group */}
              {isMulti && isExpanded && (
                <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                  {group.items.map((item) => {
                    const itemBadge = ageBadge(item.frozen_date);
                    if (editingId === item.id) {
                      return (
                        <div key={item.id} className="p-4 bg-[var(--ice-blue)]/5">
                          <EditForm
                            editForm={editForm}
                            setEditForm={setEditForm}
                            allCategories={allCategories}
                            onSave={saveEdit}
                            onCancel={cancelEdit}
                            onDecrement={() => handleDecrement(item)}
                            onRemove={() => handleRemove(item)}
                            acting={acting}
                            showDecrement={item.quantity > 1}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Frozen {daysAgo(item.frozen_date)}
                            {item.notes && <span className="italic text-gray-400 ml-2">{item.notes}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                          <span className="bg-gray-100 text-gray-600 text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded-full">
                            x{item.quantity}
                          </span>
                          <span className={`text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded-full ${itemBadge.cls}`}>
                            {itemBadge.label}
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
                    );
                  })}
                </div>
              )}

              {/* Single-item inline edit */}
              {!isMulti && editingId === group.items[0].id && (
                <div className="border-t border-[var(--ice-blue)] p-4 bg-[var(--ice-blue)]/5">
                  <EditForm
                    editForm={editForm}
                    setEditForm={setEditForm}
                    allCategories={allCategories}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                    onDecrement={() => handleDecrement(group.items[0])}
                    onRemove={() => handleRemove(group.items[0])}
                    acting={acting}
                    showDecrement={group.items[0].quantity > 1}
                  />
                </div>
              )}
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

function buildGroups(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.barcode || `_solo_${item.id}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: item.name,
        brand: item.brand,
        category: item.category,
        oldestDate: item.frozen_date,
        newestCreated: item.created_at,
        totalQty: 0,
        items: [],
      });
    }
    const g = map.get(key);
    g.totalQty += item.quantity;
    if (item.frozen_date < g.oldestDate) g.oldestDate = item.frozen_date;
    if (item.created_at > g.newestCreated) g.newestCreated = item.created_at;
    g.items.push(item);
  }
  const groups = [...map.values()];
  groups.sort((a, b) => new Date(b.newestCreated) - new Date(a.newestCreated));
  for (const g of groups) {
    g.items.sort((a, b) => new Date(a.frozen_date) - new Date(b.frozen_date));
  }
  return groups;
}

function EditForm({ editForm, setEditForm, allCategories, onSave, onCancel, onDecrement, onRemove, acting, showDecrement }) {
  return (
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
          onClick={onSave}
          disabled={acting}
          className="flex items-center gap-1.5 px-4 py-2 bg-[var(--ice-blue)] text-white rounded-lg text-sm font-medium hover:bg-[#4a9bd9] active:scale-[0.98] disabled:opacity-50"
        >
          <Check size={14} /> Save
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 active:scale-[0.98]"
        >
          <X size={14} /> Cancel
        </button>
        {showDecrement && (
          <button
            onClick={onDecrement}
            disabled={acting}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100 active:scale-[0.98] disabled:opacity-50 ml-auto"
          >
            <Minus size={14} /> Use 1
          </button>
        )}
        <button
          onClick={onRemove}
          disabled={acting}
          className={`flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 active:scale-[0.98] disabled:opacity-50 ${!showDecrement ? "ml-auto" : ""}`}
        >
          <Trash2 size={14} /> Remove
        </button>
      </div>
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

import { useState, useEffect } from "react";
import {
  getGroupedItems,
  getHistory,
  getCategories,
  getFreezers,
  removeItem,
  decrementItem,
  readdItem,
  printLabel,
  deleteItem,
  updateItem,
} from "../api/client";
import { Pencil, ChevronDown, ChevronUp } from "lucide-react";
import Modal from "../components/Modal";
import TabButton from "../components/TabButton";

const PRESET_CATEGORIES = [
  "Meat", "Poultry", "Fish", "Vegetables", "Fruit",
  "Ready Meals", "Soups", "Bread", "Desserts", "Other",
];

function daysAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function ageBadge(dateStr) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 30) return { label: "Fresh", cls: "bg-green-100 text-green-700" };
  if (days < 90) return { label: "Aging", cls: "bg-amber-100 text-amber-700" };
  return { label: "Old", cls: "bg-red-100 text-red-700" };
}

export default function Inventory() {
  const [groups, setGroups] = useState([]);
  const [history, setHistory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [freezers, setFreezers] = useState([]);
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [freezerFilter, setFreezerFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const [acting, setActing] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showItems, setShowItems] = useState(false);

  const startEdit = (item) => {
    setEditingItem(item.id);
    setEditForm({
      name: item.name || "",
      brand: item.brand || "",
      barcode: item.barcode || "",
      category: item.category || "",
      quantity: item.quantity,
      frozen_date: item.frozen_date,
      notes: item.notes || "",
    });
    setActionMsg(null);
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    setActing(true);
    try {
      const changes = {};
      const orig = selected?.items?.find((i) => i.id === editingItem);
      if (!orig) return;
      if (editForm.name !== (orig.name || "")) changes.name = editForm.name;
      if (editForm.brand !== (orig.brand || "")) changes.brand = editForm.brand || null;
      if (editForm.barcode !== (orig.barcode || "")) changes.barcode = editForm.barcode || null;
      if (editForm.category !== (orig.category || "")) changes.category = editForm.category || null;
      if (editForm.quantity !== orig.quantity) changes.quantity = parseInt(editForm.quantity, 10);
      if (editForm.frozen_date !== orig.frozen_date) changes.frozen_date = editForm.frozen_date;
      if (editForm.notes !== (orig.notes || "")) changes.notes = editForm.notes || null;

      if (Object.keys(changes).length === 0) {
        cancelEdit();
        return;
      }
      await updateItem(editingItem, changes);
      setActionMsg({ type: "ok", text: "Item updated" });
      cancelEdit();
      fetchData();
    } catch {
      setActionMsg({ type: "err", text: "Failed to save changes" });
    } finally {
      setActing(false);
    }
  };

  const fetchData = () => {
    const filters = {};
    if (catFilter) filters.category = catFilter;
    if (freezerFilter) filters.freezer_id = freezerFilter;
    getGroupedItems(filters).then(setGroups).catch(() => {});
    getHistory().then(setHistory).catch(() => {});
    getCategories().then(setCategories).catch(() => {});
    getFreezers().then(setFreezers).catch(() => {});
  };

  useEffect(() => {
    fetchData();
  }, [catFilter, freezerFilter]);

  const totalActive = groups.reduce((sum, g) => sum + g.count, 0);

  const filteredGroups = groups.filter(
    (g) =>
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      (g.brand && g.brand.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredHistory = history.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleRemoveOldest = async (group) => {
    setActing(true);
    setActionMsg(null);
    try {
      await removeItem(group.oldest_id);
      setActionMsg({ type: "ok", text: `Removed 1 ${group.name} (oldest first)` });
      setSelected(null);
      fetchData();
    } catch {
      setActionMsg({ type: "err", text: "Failed to remove item" });
    } finally {
      setActing(false);
    }
  };

  const handleDecrement = async (group) => {
    setActing(true);
    setActionMsg(null);
    try {
      const res = await decrementItem(group.oldest_id);
      if (res.removed) {
        setActionMsg({ type: "ok", text: `Last serving used — container removed` });
      } else {
        setActionMsg({ type: "ok", text: `1 serving used (${res.remaining} left in container)` });
      }
      setSelected(null);
      fetchData();
    } catch {
      setActionMsg({ type: "err", text: "Failed to decrement" });
    } finally {
      setActing(false);
    }
  };

  const handleReprint = async (group) => {
    setActing(true);
    setActionMsg(null);
    try {
      await printLabel(group.oldest_id);
      setActionMsg({ type: "ok", text: "Label sent to printer" });
    } catch {
      setActionMsg({ type: "err", text: "Failed to print" });
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Inventory</h2>

      <div className="flex gap-2 mb-3 sm:mb-4">
        <TabButton
          active={tab === "active"}
          onClick={() => setTab("active")}
          label={`In Freezer (${totalActive})`}
        />
        <TabButton
          active={tab === "history"}
          onClick={() => setTab("history")}
          label={`History (${history.length})`}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-3 sm:mb-4">
        <input
          type="text"
          placeholder="Search by name or brand..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
        />
        {tab === "active" && categories.length > 0 && (
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="border border-[var(--border)] rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm bg-[var(--surface)]"
          >
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {tab === "active" && freezers.length > 0 && (
          <select
            value={freezerFilter}
            onChange={(e) => setFreezerFilter(e.target.value)}
            className="border border-[var(--border)] rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm bg-[var(--surface)]"
          >
            <option value="">All Freezers</option>
            {freezers.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.item_count})</option>)}
          </select>
        )}
      </div>

      {tab === "active" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {filteredGroups.map((group) => {
            const badge = ageBadge(group.oldest_date);
            return (
              <button
                key={group.name}
                onClick={() => { setSelected(group); setActionMsg(null); }}
                className="w-full text-left bg-white rounded-xl border border-gray-200 p-3.5 sm:p-4 hover:shadow-md active:scale-[0.99] transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 truncate text-[15px] sm:text-base">
                      {group.name}
                    </h3>
                    {group.brand && (
                      <p className="text-xs text-gray-400 truncate">{group.brand}</p>
                    )}
                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                      {group.freezer_name && (
                        <span className="text-[var(--ice-blue)] mr-1">{group.freezer_name}</span>
                      )}
                      Oldest: {daysAgo(group.oldest_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <span className="bg-[var(--ice-blue)]/10 text-[var(--ice-blue)] text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-full">
                      {group.count}
                    </span>
                    <span className={`text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {tab === "history" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {filteredHistory.map((item) => (
            <button
              key={item.id}
              onClick={() => { setSelectedHistory(item); setActionMsg(null); }}
              className="w-full text-left bg-white rounded-xl border border-gray-200 p-3.5 sm:p-4 opacity-70 hover:opacity-100 hover:shadow-md active:scale-[0.99] transition-all"
            >
              <h3 className="font-semibold text-gray-700 truncate text-[15px] sm:text-base">
                {item.name}
              </h3>
              {item.brand && <p className="text-xs text-gray-400">{item.brand}</p>}
              <p className="text-xs text-gray-500 mt-0.5">
                Removed {daysAgo(item.removed_at)}
              </p>
            </button>
          ))}
        </div>
      )}

      {((tab === "active" && filteredGroups.length === 0) ||
        (tab === "history" && filteredHistory.length === 0)) && (
        <p className="text-gray-400 text-center py-12 text-sm">
          {search ? "No matching items." : "No items to display."}
        </p>
      )}

      {/* Group Detail Panel */}
      <Modal
        open={!!selected}
        onClose={() => { setSelected(null); cancelEdit(); setShowItems(false); }}
        title={selected?.name || ""}
      >
        {selected && (
          <div>
            {selected.brand && (
              <p className="text-sm text-[var(--text-secondary)] -mt-2 mb-4">{selected.brand}</p>
            )}

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-[var(--ice-blue)]">{selected.count}</p>
                <p className="text-xs text-gray-500">Containers</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-700">{selected.total_servings}</p>
                <p className="text-xs text-gray-500">Total Servings</p>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              {selected.freezer_name && <><span className="text-[var(--ice-blue)]">{selected.freezer_name}</span> &middot; </>}
              Oldest frozen: {selected.oldest_date} &middot; Newest: {selected.newest_date}
            </p>

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

            <div className="flex flex-col gap-2 mb-4">
              <button
                onClick={() => handleRemoveOldest(selected)}
                disabled={acting}
                className="w-full py-3 sm:py-2.5 bg-[var(--ice-blue)] text-white rounded-lg font-medium hover:bg-[#4a9bd9] active:scale-[0.98] disabled:opacity-50"
              >
                Remove Container (oldest first)
              </button>
              {selected.total_servings > 1 && (
                <button
                  onClick={() => handleDecrement(selected)}
                  disabled={acting}
                  className="w-full py-3 sm:py-2.5 bg-amber-50 text-amber-700 rounded-lg font-medium hover:bg-amber-100 active:scale-[0.98] disabled:opacity-50"
                >
                  Use 1 Serving
                </button>
              )}
              <button
                onClick={() => handleReprint(selected)}
                disabled={acting}
                className="w-full py-3 sm:py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 active:scale-[0.98] disabled:opacity-50"
              >
                Reprint Label
              </button>
            </div>

            {/* Individual items in this group */}
            <button
              onClick={() => { setShowItems(!showItems); cancelEdit(); }}
              className="w-full flex items-center justify-between py-2.5 px-1 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              <span>{selected.items?.length || 0} individual item{selected.items?.length !== 1 ? "s" : ""}</span>
              {showItems ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showItems && selected.items && (
              <div className="border-t border-gray-100 pt-2 space-y-2">
                {selected.items.map((item) => (
                  <div key={item.id} className="bg-gray-50 rounded-lg p-3">
                    {editingItem === item.id ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Brand</label>
                          <input
                            type="text"
                            value={editForm.brand}
                            onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Barcode</label>
                          <input
                            type="text"
                            value={editForm.barcode}
                            onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                            placeholder="Retail barcode"
                            inputMode="numeric"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                          <select
                            value={editForm.category}
                            onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
                          >
                            <option value="">None</option>
                            {[...new Set([...PRESET_CATEGORIES, ...categories])].map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
                            <input
                              type="number"
                              min="1"
                              value={editForm.quantity}
                              onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value, 10) || 1 })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Frozen date</label>
                            <input
                              type="date"
                              value={editForm.frozen_date}
                              onChange={(e) => setEditForm({ ...editForm, frozen_date: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                          <input
                            type="text"
                            value={editForm.notes}
                            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                            placeholder="Optional notes..."
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={saveEdit}
                            disabled={acting}
                            className="flex-1 py-2 bg-[var(--ice-blue)] text-white rounded-lg text-sm font-medium hover:bg-[#4a9bd9] active:scale-[0.98] disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 active:scale-[0.98]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                          <p className="text-xs text-gray-500">
                            {item.frozen_date} &middot; x{item.quantity}
                            {item.category && <> &middot; {item.category}</>}
                            {item.barcode && <> &middot; <span className="text-gray-400">{item.barcode}</span></>}
                          </p>
                        </div>
                        <button
                          onClick={() => startEdit(item)}
                          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-700 shrink-0"
                          title="Edit item"
                        >
                          <Pencil size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
      {/* History Detail Panel */}
      <Modal
        open={!!selectedHistory}
        onClose={() => setSelectedHistory(null)}
        title={selectedHistory?.name || ""}
      >
        {selectedHistory && (
          <div>
            {selectedHistory.brand && (
              <p className="text-sm text-[var(--text-secondary)] -mt-2 mb-4">{selectedHistory.brand}</p>
            )}
            <div className="space-y-2 text-sm text-[var(--text-secondary)] mb-5">
              <p>Was frozen: {selectedHistory.frozen_date}</p>
              <p>Quantity: {selectedHistory.quantity} serving(s)</p>
              {selectedHistory.category && <p>Category: {selectedHistory.category}</p>}
              {selectedHistory.notes && <p>Notes: {selectedHistory.notes}</p>}
            </div>
            {actionMsg && (
              <div className={`mb-4 px-3 py-2.5 rounded-lg text-sm font-medium ${
                actionMsg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}>{actionMsg.text}</div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={async () => {
                  setActing(true);
                  try {
                    await readdItem(selectedHistory.id);
                    setActionMsg({ type: "ok", text: "Added back to freezer!" });
                    setSelectedHistory(null);
                    fetchData();
                  } catch { setActionMsg({ type: "err", text: "Failed to re-add" }); }
                  setActing(false);
                }}
                disabled={acting}
                className="flex-1 py-3 sm:py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 active:scale-[0.98] disabled:opacity-50"
              >
                Re-add to Freezer
              </button>
              <button
                onClick={async () => {
                  setActing(true);
                  try {
                    await deleteItem(selectedHistory.id);
                    setSelectedHistory(null);
                    fetchData();
                  } catch {
                    setActionMsg({ type: "err", text: "Failed to delete" });
                  }
                  setActing(false);
                }}
                disabled={acting}
                className="py-3 sm:py-2.5 px-4 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 active:scale-[0.98] disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

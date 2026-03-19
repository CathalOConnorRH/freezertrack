import { useState, useEffect, useCallback } from "react";
import {
  getItems,
  getHistory,
  deleteItem,
  purgeHistory,
  purgeAllItems,
  purgeBarcodeCache,
  purgeShopping,
} from "../api/client";
import { RefreshCw, Trash2, AlertTriangle } from "lucide-react";

function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle size={20} className="text-red-500 shrink-0" />
          <h3 className="text-lg font-semibold text-[var(--text)]">{title}</h3>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--bg)] border border-[var(--border)] hover:bg-[var(--border)]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

const DANGER_ACTIONS = [
  {
    key: "history",
    label: "Purge History",
    description: "Hard-delete all removed items from the database.",
    confirmTitle: "Purge all history?",
    confirmMessage:
      "This will permanently delete every food item marked as removed. This cannot be undone.",
    action: purgeHistory,
  },
  {
    key: "all",
    label: "Purge All Items",
    description: "Hard-delete every food item — active and removed.",
    confirmTitle: "Purge ALL items?",
    confirmMessage:
      "This will permanently delete every food item in the database (active + history). This cannot be undone.",
    action: purgeAllItems,
  },
  {
    key: "barcode",
    label: "Clear Barcode Cache",
    description: "Remove all cached barcode lookups.",
    confirmTitle: "Clear barcode cache?",
    confirmMessage:
      "All cached barcode-to-product mappings will be deleted. Future scans will re-fetch from external APIs.",
    action: purgeBarcodeCache,
  },
  {
    key: "shopping",
    label: "Clear Shopping List",
    description: "Delete all shopping list items (active + completed).",
    confirmTitle: "Clear shopping list?",
    confirmMessage:
      "Every item on the shopping list will be permanently deleted.",
    action: purgeShopping,
  },
];

export default function Debug() {
  const [active, setActive] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active");
  const [confirm, setConfirm] = useState(null);
  const [busyAction, setBusyAction] = useState(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      getItems().then(setActive),
      getHistory().then(setHistory),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteRow = (item) => {
    setConfirm({
      title: "Delete item?",
      message: `Permanently delete "${item.name}" (${item.id.slice(0, 8)}…) from the database?`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await deleteItem(item.id);
          fetchData();
        } catch {
          /* endpoint returns 204, swallow */
        }
      },
    });
  };

  const handleBulkAction = (action) => {
    setConfirm({
      title: action.confirmTitle,
      message: action.confirmMessage,
      onConfirm: async () => {
        setConfirm(null);
        setBusyAction(action.key);
        try {
          await action.action();
          fetchData();
        } finally {
          setBusyAction(null);
        }
      },
    });
  };

  const items = tab === "active" ? active : history;

  const COLS = [
    "id",
    "name",
    "brand",
    "category",
    "barcode",
    "frozen_date",
    "quantity",
    "shelf_life_days",
    "freezer_id",
    "notes",
    "removed_at",
    "qr_code_id",
    "created_at",
  ];

  return (
    <div className="max-w-full mx-auto">
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl sm:text-2xl font-bold">Debug — Raw DB Rows</h2>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--border)] disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("active")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "active"
              ? "bg-[var(--ice-blue)] text-white"
              : "bg-[var(--bg)] text-[var(--text-secondary)]"
          }`}
        >
          Active ({active.length})
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "history"
              ? "bg-[var(--ice-blue)] text-white"
              : "bg-[var(--bg)] text-[var(--text-secondary)]"
          }`}
        >
          History ({history.length})
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-[var(--text-secondary)] text-center py-8">
          Loading...
        </p>
      ) : items.length === 0 ? (
        <p className="text-[var(--text-secondary)] text-center py-8">
          No items.
        </p>
      ) : (
        <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--bg)]">
                <th className="px-2 py-2 text-left font-semibold text-[var(--text-secondary)] whitespace-nowrap border-b border-[var(--border)]" />
                {COLS.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left font-semibold text-[var(--text-secondary)] whitespace-nowrap border-b border-[var(--border)]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[var(--border)] hover:bg-[var(--bg)] group"
                >
                  <td className="px-2 py-2 whitespace-nowrap">
                    <button
                      onClick={() => handleDeleteRow(item)}
                      className="p-1 rounded text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 transition-all"
                      title="Delete permanently"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                  {COLS.map((col) => (
                    <td
                      key={col}
                      className="px-3 py-2 whitespace-nowrap text-[var(--text)] max-w-[200px] truncate"
                      title={String(item[col] ?? "")}
                    >
                      {col === "id" || col === "qr_code_id" ? (
                        (item[col] || "").slice(0, 8) + "..."
                      ) : item[col] === null || item[col] === undefined ? (
                        <span className="text-[var(--text-secondary)] italic">
                          null
                        </span>
                      ) : (
                        String(item[col])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Danger Zone */}
      <div className="mt-10 border border-red-500/30 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-red-500/10 border-b border-red-500/30">
          <h3 className="text-sm font-semibold text-red-500 flex items-center gap-2">
            <AlertTriangle size={15} />
            Danger Zone
          </h3>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {DANGER_ACTIONS.map((da) => (
            <div
              key={da.key}
              className="flex items-center justify-between px-5 py-4"
            >
              <div>
                <p className="text-sm font-medium text-[var(--text)]">
                  {da.label}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {da.description}
                </p>
              </div>
              <button
                onClick={() => handleBulkAction(da)}
                disabled={busyAction === da.key}
                className="shrink-0 px-4 py-2 text-xs font-medium rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50 transition-colors"
              >
                {busyAction === da.key ? "Working…" : da.label}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

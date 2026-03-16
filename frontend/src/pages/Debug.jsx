import { useState, useEffect } from "react";
import { getItems, getHistory } from "../api/client";
import { RefreshCw } from "lucide-react";

export default function Debug() {
  const [active, setActive] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active");

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      getItems().then(setActive),
      getHistory().then(setHistory),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const items = tab === "active" ? active : history;

  const COLS = [
    "id", "name", "brand", "category", "barcode", "frozen_date",
    "quantity", "shelf_life_days", "freezer_id", "notes",
    "removed_at", "qr_code_id", "created_at",
  ];

  return (
    <div className="max-w-full mx-auto">
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

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("active")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "active" ? "bg-[var(--ice-blue)] text-white" : "bg-[var(--bg)] text-[var(--text-secondary)]"
          }`}
        >
          Active ({active.length})
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "history" ? "bg-[var(--ice-blue)] text-white" : "bg-[var(--bg)] text-[var(--text-secondary)]"
          }`}
        >
          History ({history.length})
        </button>
      </div>

      {loading ? (
        <p className="text-[var(--text-secondary)] text-center py-8">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-[var(--text-secondary)] text-center py-8">No items.</p>
      ) : (
        <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--bg)]">
                {COLS.map((col) => (
                  <th key={col} className="px-3 py-2 text-left font-semibold text-[var(--text-secondary)] whitespace-nowrap border-b border-[var(--border)]">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)] hover:bg-[var(--bg)]">
                  {COLS.map((col) => (
                    <td key={col} className="px-3 py-2 whitespace-nowrap text-[var(--text)] max-w-[200px] truncate" title={String(item[col] ?? "")}>
                      {col === "id" || col === "qr_code_id"
                        ? (item[col] || "").slice(0, 8) + "..."
                        : item[col] === null || item[col] === undefined
                        ? <span className="text-[var(--text-secondary)] italic">null</span>
                        : String(item[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

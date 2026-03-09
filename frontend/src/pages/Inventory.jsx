import { useState, useEffect } from "react";
import {
  getItems,
  getHistory,
  removeItem,
  printLabel,
  deleteItem,
} from "../api/client";
import FoodCard from "../components/FoodCard";
import { X } from "lucide-react";

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date");
  const [selected, setSelected] = useState(null);
  const [reprinting, setReprinting] = useState(false);
  const [reprintMsg, setReprintMsg] = useState(null);

  const fetchData = () => {
    getItems().then(setItems).catch(() => {});
    getHistory().then(setHistory).catch(() => {});
  };

  useEffect(() => {
    fetchData();
  }, []);

  const list = tab === "active" ? items : history;
  const filtered = list.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "date")
      return new Date(b.frozen_date) - new Date(a.frozen_date);
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "qty") return b.quantity - a.quantity;
    return 0;
  });

  const handleRemove = async (item) => {
    await removeItem(item.id);
    setSelected(null);
    fetchData();
  };

  const handleReprint = async (item) => {
    setReprinting(true);
    setReprintMsg(null);
    try {
      await printLabel(item.id);
      setReprintMsg({ type: "ok", text: "Label sent to printer" });
    } catch {
      setReprintMsg({ type: "err", text: "Failed to print label" });
    } finally {
      setReprinting(false);
    }
  };

  const handleDelete = async (item) => {
    if (confirm(`Permanently delete ${item.name}?`)) {
      await deleteItem(item.id);
      setSelected(null);
      fetchData();
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Inventory</h2>

      <div className="flex gap-2 mb-3 sm:mb-4">
        <TabButton
          active={tab === "active"}
          onClick={() => setTab("active")}
          label={`In Freezer (${items.length})`}
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
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm bg-white"
        >
          <option value="date">Date Frozen</option>
          <option value="name">Name (A-Z)</option>
          <option value="qty">Quantity</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        {sorted.map((item) => (
          <FoodCard
            key={item.id}
            item={item}
            onClick={(i) => {
              if (tab === "active") {
                setSelected(i);
                setReprintMsg(null);
              }
            }}
          />
        ))}
      </div>

      {sorted.length === 0 && (
        <p className="text-gray-400 text-center py-12 text-sm">
          {search ? "No matching items." : "No items to display."}
        </p>
      )}

      {/* Detail Panel (bottom sheet on mobile, centered modal on desktop) */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center"
          onClick={(e) => e.target === e.currentTarget && setSelected(null)}
        >
          <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 sm:p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold pr-4">{selected.name}</h3>
              <button
                onClick={() => setSelected(null)}
                className="p-1 -m-1 rounded-lg hover:bg-gray-100"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-2 text-sm text-gray-600 mb-5">
              <p>Frozen: {selected.frozen_date}</p>
              <p>Quantity: {selected.quantity} serving(s)</p>
              {selected.notes && <p>Notes: {selected.notes}</p>}
              <p className="text-xs text-gray-400">
                ID: {selected.id.slice(0, 8)}
              </p>
            </div>
            {reprintMsg && (
              <div
                className={`mb-4 px-3 py-2.5 rounded-lg text-sm font-medium ${
                  reprintMsg.type === "ok"
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {reprintMsg.text}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={() => handleRemove(selected)}
                className="flex-1 py-3 sm:py-2.5 bg-[var(--ice-blue)] text-white rounded-lg font-medium hover:bg-[#4a9bd9] active:scale-[0.98]"
              >
                Remove
              </button>
              <button
                onClick={() => handleReprint(selected)}
                disabled={reprinting}
                className="flex-1 py-3 sm:py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50 active:scale-[0.98]"
              >
                {reprinting ? "Printing..." : "Reprint Label"}
              </button>
              <button
                onClick={() => handleDelete(selected)}
                className="py-3 sm:py-2.5 px-4 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 active:scale-[0.98]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${
        active
          ? "bg-[var(--ice-blue)] text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

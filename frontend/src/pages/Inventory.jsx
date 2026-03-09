import { useState, useEffect } from "react";
import { getItems, getHistory, removeItem, printLabel, deleteItem } from "../api/client";
import FoodCard from "../components/FoodCard";
import { X } from "lucide-react";

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date");
  const [selected, setSelected] = useState(null);

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
    if (sort === "date") return new Date(b.frozen_date) - new Date(a.frozen_date);
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
    await printLabel(item.id);
    alert("Label sent to printer");
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
      <h2 className="text-2xl font-bold mb-6">Inventory</h2>

      <div className="flex gap-2 mb-4">
        <TabButton active={tab === "active"} onClick={() => setTab("active")} label={`In Freezer (${items.length})`} />
        <TabButton active={tab === "history"} onClick={() => setTab("history")} label={`History (${history.length})`} />
      </div>

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="date">Date Frozen</option>
          <option value="name">Name (A-Z)</option>
          <option value="qty">Quantity</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((item) => (
          <FoodCard
            key={item.id}
            item={item}
            onClick={(i) => tab === "active" && setSelected(i)}
          />
        ))}
      </div>

      {sorted.length === 0 && (
        <p className="text-gray-400 text-center py-12">
          {search ? "No matching items." : "No items to display."}
        </p>
      )}

      {/* Detail Panel */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center">
          <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold">{selected.name}</h3>
              <button onClick={() => setSelected(null)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-2 text-sm text-gray-600 mb-6">
              <p>Frozen: {selected.frozen_date}</p>
              <p>Quantity: {selected.quantity}</p>
              {selected.notes && <p>Notes: {selected.notes}</p>}
              <p className="text-xs text-gray-400">ID: {selected.id.slice(0, 8)}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleRemove(selected)}
                className="flex-1 py-2.5 bg-[var(--ice-blue)] text-white rounded-lg font-medium hover:bg-[#4a9bd9]"
              >
                Remove
              </button>
              <button
                onClick={() => handleReprint(selected)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
              >
                Reprint
              </button>
              <button
                onClick={() => handleDelete(selected)}
                className="py-2.5 px-4 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100"
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
      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-[var(--ice-blue)] text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

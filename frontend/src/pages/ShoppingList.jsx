import { useState, useEffect } from "react";
import {
  getShoppingList,
  addShoppingItem,
  completeShoppingItem,
  deleteShoppingItem,
  suggestShoppingItems,
} from "../api/client";
import { Plus, Trash2, Sparkles, Check } from "lucide-react";

export default function ShoppingList() {
  const [items, setItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchData = () => {
    getShoppingList().then(setItems).catch(() => {});
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await addShoppingItem({ name: newName.trim() });
      setNewName("");
      fetchData();
    } catch {}
    setAdding(false);
  };

  const handleComplete = async (id) => {
    await completeShoppingItem(id);
    fetchData();
  };

  const handleDelete = async (id) => {
    await deleteShoppingItem(id);
    fetchData();
  };

  const handleSuggest = async () => {
    try {
      const data = await suggestShoppingItems();
      setSuggestions(data);
    } catch {}
  };

  const handleAddSuggestion = async (s) => {
    await addShoppingItem({ name: s.name, brand: s.brand });
    setSuggestions((prev) => prev.filter((x) => x.name !== s.name));
    fetchData();
  };

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Shopping List</h2>

      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Add item..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
        />
        <button
          type="submit"
          disabled={adding || !newName.trim()}
          className="px-4 py-2.5 sm:py-2 bg-[var(--ice-blue)] text-white rounded-lg font-medium hover:bg-[#4a9bd9] disabled:opacity-50 active:scale-[0.98]"
        >
          <Plus size={18} />
        </button>
      </form>

      <button
        onClick={handleSuggest}
        className="w-full flex items-center justify-center gap-2 py-2.5 mb-4 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100 active:scale-[0.98]"
      >
        <Sparkles size={16} />
        Suggest from recently used
      </button>

      {suggestions.length > 0 && (
        <div className="mb-4 bg-amber-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-medium text-amber-700 mb-1">Suggestions:</p>
          {suggestions.map((s) => (
            <button
              key={s.name}
              onClick={() => handleAddSuggestion(s)}
              className="w-full flex items-center justify-between px-3 py-2 bg-white rounded-lg text-sm hover:bg-amber-100 active:scale-[0.98]"
            >
              <span>
                {s.name}
                {s.brand && <span className="text-gray-400 ml-1">({s.brand})</span>}
              </span>
              <Plus size={14} className="text-amber-600" />
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3"
          >
            <button
              onClick={() => handleComplete(item.id)}
              className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-green-500 hover:bg-green-50 shrink-0"
            >
              <Check size={14} className="text-transparent hover:text-green-500" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
              {item.brand && (
                <p className="text-xs text-gray-400 truncate">{item.brand}</p>
              )}
            </div>
            <button
              onClick={() => handleDelete(item.id)}
              className="p-1 text-gray-400 hover:text-red-500"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <p className="text-gray-400 text-center py-12 text-sm">
          Shopping list is empty.
        </p>
      )}
    </div>
  );
}

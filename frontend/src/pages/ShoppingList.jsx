import { useState, useEffect } from "react";
import {
  getShoppingList,
  addShoppingItem,
  completeShoppingItem,
  deleteShoppingItem,
  suggestShoppingItems,
} from "../api/client";
import ErrorBanner from "../components/ErrorBanner";
import { Plus, Trash2, Sparkles, Check } from "lucide-react";

export default function ShoppingList() {
  const [items, setItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = () => {
    getShoppingList()
      .then(setItems)
      .catch(() => setError("Failed to load shopping list."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await addShoppingItem({ name: newName.trim() });
      setNewName("");
      fetchData();
    } catch {
      setError("Failed to add item.");
    }
    setAdding(false);
  };

  const handleComplete = async (id) => {
    try {
      await completeShoppingItem(id);
      fetchData();
    } catch {
      setError("Failed to complete item.");
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteShoppingItem(id);
      fetchData();
    } catch {
      setError("Failed to delete item.");
    }
  };

  const handleSuggest = async () => {
    try {
      const data = await suggestShoppingItems();
      setSuggestions(data);
    } catch {
      setError("Failed to load suggestions.");
    }
  };

  const handleAddSuggestion = async (s) => {
    try {
      await addShoppingItem({ name: s.name, brand: s.brand });
      setSuggestions((prev) => prev.filter((x) => x.name !== s.name));
      fetchData();
    } catch {
      setError("Failed to add suggestion.");
    }
  };

  if (loading) {
    return <div className="max-w-lg mx-auto py-12 text-center text-[var(--text-secondary)]">Loading...</div>;
  }

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Shopping List</h2>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={() => { setError(null); fetchData(); }} /></div>}

      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Add item..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none bg-[var(--surface)] text-[var(--text)]"
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
              className="w-full flex items-center justify-between px-3 py-2 bg-[var(--surface)] rounded-lg text-sm hover:bg-amber-100 active:scale-[0.98]"
            >
              <span>
                {s.name}
                {s.brand && <span className="text-[var(--text-secondary)] ml-1">({s.brand})</span>}
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
            className="flex items-center gap-3 bg-[var(--surface)] rounded-xl border border-[var(--border)] px-4 py-3"
          >
            <button
              onClick={() => handleComplete(item.id)}
              className="w-6 h-6 rounded-full border-2 border-[var(--border)] flex items-center justify-center hover:border-green-500 hover:bg-green-50 shrink-0"
              aria-label={`Complete ${item.name}`}
            >
              <Check size={14} className="text-transparent hover:text-green-500" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text)] truncate">{item.name}</p>
              {item.brand && (
                <p className="text-xs text-[var(--text-secondary)] truncate">{item.brand}</p>
              )}
            </div>
            <button
              onClick={() => handleDelete(item.id)}
              className="p-1 text-[var(--text-secondary)] hover:text-red-500"
              aria-label={`Delete ${item.name}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <p className="text-[var(--text-secondary)] text-center py-12 text-sm">
          Shopping list is empty.
        </p>
      )}
    </div>
  );
}

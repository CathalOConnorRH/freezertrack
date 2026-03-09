import { useState, useEffect } from "react";
import { getItems, getHAState } from "../api/client";
import FoodCard from "../components/FoodCard";
import AlertBanner from "../components/AlertBanner";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [haState, setHAState] = useState(null);
  const navigate = useNavigate();

  const fetchData = () => {
    getItems().then(setItems).catch(() => {});
    getHAState().then(setHAState).catch(() => {});
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60000);
    return () => clearInterval(id);
  }, []);

  const totalItems = items.length;
  const addedThisWeek = items.filter((i) => {
    const d = new Date(i.created_at);
    const weekAgo = Date.now() - 7 * 86400000;
    return d.getTime() > weekAgo;
  }).length;
  const needsAttention = haState?.alerts?.filter((a) => a.type === "old_item").length || 0;
  const recent = [...items]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6);

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="In Freezer" value={totalItems} color="text-[var(--ice-blue)]" />
        <StatCard label="Added This Week" value={addedThisWeek} color="text-green-600" />
        <StatCard label="Needs Attention" value={needsAttention} color="text-amber-600" />
      </div>

      {haState?.alerts?.length > 0 && (
        <div className="mb-6">
          <AlertBanner alerts={haState.alerts} />
        </div>
      )}

      <h3 className="text-lg font-semibold mb-3">Recently Added</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {recent.map((item) => (
          <FoodCard
            key={item.id}
            item={item}
            onClick={() => navigate("/inventory")}
          />
        ))}
      </div>

      {items.length === 0 && (
        <p className="text-gray-400 text-center py-12">
          No items in freezer yet. Scan or add one to get started.
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

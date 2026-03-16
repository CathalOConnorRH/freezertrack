import { useState, useEffect } from "react";
import { getStats } from "../api/client";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function Statistics() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center">
        <p className="text-red-600 font-medium mb-2">Failed to load statistics</p>
        <p className="text-sm text-gray-500">The backend may have encountered an error.</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center text-gray-400">
        Loading statistics...
      </div>
    );
  }

  const timelineData = {
    labels: stats.timeline.map((w) => w.week),
    datasets: [
      {
        label: "Added",
        data: stats.timeline.map((w) => w.added),
        backgroundColor: "rgba(93, 173, 226, 0.7)",
      },
      {
        label: "Removed",
        data: stats.timeline.map((w) => w.removed),
        backgroundColor: "rgba(239, 68, 68, 0.5)",
      },
    ],
  };

  const topItemsData = {
    labels: stats.top_items.map((i) => i.name),
    datasets: [
      {
        label: "Times frozen",
        data: stats.top_items.map((i) => i.count),
        backgroundColor: "rgba(93, 173, 226, 0.7)",
      },
    ],
  };

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Statistics</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6">
        <StatCard label="In Freezer" value={stats.total_active} color="text-[var(--ice-blue)]" />
        <StatCard label="Removed" value={stats.total_removed} color="text-red-500" />
        <StatCard label="All Time" value={stats.total_ever} color="text-gray-700" />
        <StatCard label="Avg Age" value={`${stats.average_age_days}d`} color="text-amber-600" />
      </div>

      <section className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 sm:p-6 mb-4 sm:mb-6">
        <h3 className="text-base sm:text-lg font-semibold mb-3">Weekly Activity</h3>
        <div className="h-48 sm:h-64">
          <Bar data={timelineData} options={{ ...chartOpts, plugins: { legend: { display: true, position: "top" } } }} />
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold mb-3">Most Frozen Items</h3>
          <div className="h-48 sm:h-64">
            <Bar data={topItemsData} options={{ ...chartOpts, indexAxis: "y" }} />
          </div>
        </section>

        <section className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold mb-3">By Category</h3>
          {stats.categories.length > 0 ? (
            <div className="space-y-2">
              {stats.categories.map((c) => (
                <div key={c.name} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{c.name}</span>
                  <span className="text-sm font-bold text-[var(--ice-blue)]">{c.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No categories yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] px-3 py-3 sm:p-4 text-center">
      <p className={`text-2xl sm:text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] sm:text-xs text-[var(--text-secondary)] mt-0.5 leading-tight">{label}</p>
    </div>
  );
}

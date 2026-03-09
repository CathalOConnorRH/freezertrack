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

export default function FoodCard({ item, onClick }) {
  const badge = ageBadge(item.frozen_date);

  return (
    <button
      onClick={() => onClick?.(item)}
      className="w-full text-left bg-white rounded-xl border border-gray-200 p-3.5 sm:p-4 hover:shadow-md active:scale-[0.99] transition-all"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 truncate text-[15px] sm:text-base">
            {item.name}
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Frozen {daysAgo(item.frozen_date)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span className="bg-gray-100 text-gray-600 text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded-full">
            x{item.quantity}
          </span>
          <span
            className={`text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded-full ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>
      </div>
    </button>
  );
}

import { useState } from "react";
import { X } from "lucide-react";

export default function AlertBanner({ alerts = [] }) {
  const [dismissed, setDismissed] = useState(new Set());

  if (!alerts.length) return null;

  const visible = alerts.filter((_, i) => !dismissed.has(i));
  if (!visible.length) return null;

  const dismiss = (idx) => setDismissed((s) => new Set(s).add(idx));

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert, i) => {
        if (dismissed.has(i)) return null;

        const isLowStock = alert.type === "low_stock";
        const bg = isLowStock ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200";
        const text = isLowStock ? "text-red-700" : "text-amber-700";

        return (
          <div
            key={i}
            className={`flex items-center justify-between px-4 py-3 rounded-lg border ${bg}`}
          >
            <span className={`text-sm font-medium ${text}`}>
              {isLowStock
                ? `Only ${alert.current_count} items left in freezer`
                : `${alert.name} has been frozen for ${alert.days_frozen} days`}
            </span>
            <button onClick={() => dismiss(i)} className={`${text} hover:opacity-70`}>
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

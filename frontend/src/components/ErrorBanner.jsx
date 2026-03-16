import { RefreshCw } from "lucide-react";

export default function ErrorBanner({ message, onRetry }) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
      <p className="text-sm font-medium text-red-700 dark:text-red-400">
        {message || "Something went wrong."}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-800 dark:text-red-400"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      )}
    </div>
  );
}

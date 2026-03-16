export default function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${
        active
          ? "bg-[var(--ice-blue)] text-white"
          : "bg-[var(--bg)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
      }`}
    >
      {label}
    </button>
  );
}

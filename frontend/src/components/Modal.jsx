import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function Modal({ open, onClose, title, children }) {
  const overlayRef = useRef(null);
  const contentRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    contentRef.current?.focus();

    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const focusable = contentRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center"
      onClick={(e) => e.target === overlayRef.current && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        className="bg-[var(--surface)] w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 sm:p-6 max-h-[85vh] overflow-y-auto outline-none"
      >
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-bold text-[var(--text)]">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 -m-1 rounded-lg hover:bg-[var(--border)]"
            aria-label="Close"
          >
            <X size={20} className="text-[var(--text-secondary)]" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

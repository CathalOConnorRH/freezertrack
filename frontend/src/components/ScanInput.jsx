import { useRef, useEffect, useState, useCallback } from "react";

export default function ScanInput({ onScan }) {
  const inputRef = useRef(null);
  const [buffer, setBuffer] = useState("");
  const lastKeyTime = useRef(0);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    focusInput();
    const id = setInterval(focusInput, 1000);
    return () => clearInterval(id);
  }, [focusInput]);

  const handleKeyDown = (e) => {
    const now = Date.now();
    if (e.key === "Enter") {
      if (buffer.length > 0) {
        onScan(buffer);
      }
      setBuffer("");
      lastKeyTime.current = 0;
      setTimeout(focusInput, 50);
      return;
    }

    if (e.key.length === 1) {
      if (now - lastKeyTime.current > 100 && lastKeyTime.current !== 0) {
        setBuffer(e.key);
      } else {
        setBuffer((b) => b + e.key);
      }
      lastKeyTime.current = now;
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--ice-blue)] opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--ice-blue)]" />
        </span>
        <span className="text-sm text-gray-500">Listening for USB scanner...</span>
      </div>
      <input
        ref={inputRef}
        onKeyDown={handleKeyDown}
        className="opacity-0 absolute h-0 w-0"
        aria-label="Scanner input"
        autoFocus
      />
    </div>
  );
}

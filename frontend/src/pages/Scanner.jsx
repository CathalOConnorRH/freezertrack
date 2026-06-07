import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { removeItem, decrementItem, lookupBarcode, searchItems, getItemsByBarcode, getScannerMode, setScannerMode, saveBarcodeMapping } from "../api/client";
import ScanInput from "../components/ScanInput";
import CameraScanner from "../components/CameraScanner";
import { LogIn, LogOut, X, Pencil } from "lucide-react";

export default function Scanner() {
  const isMobile =
    typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  const [inputTab, setInputTab] = useState(isMobile ? "camera" : "usb");
  const [mode, setMode] = useState("out");
  const [result, setResult] = useState(null);
  const [matches, setMatches] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [fixBarcode, setFixBarcode] = useState(null);
  const [fixName, setFixName] = useState("");
  const [fixBrand, setFixBrand] = useState("");
  const [fixing, setFixing] = useState(false);
  const navigate = useNavigate();
  const intervalRef = useRef(null);

  useEffect(() => {
    const poll = () => getScannerMode().then((s) => setMode(s.mode)).catch(() => {});
    poll();
    const start = () => { intervalRef.current = setInterval(poll, 3000); };
    const stop = () => clearInterval(intervalRef.current);

    start();
    const onVisibility = () => { document.hidden ? stop() : start(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  const changeMode = useCallback((m) => {
    setMode(m);
    setResult(null);
    setMatches(null);
    if (m === "stockCheck") {
      navigate("/stock-check");
      return;
    }
    setScannerMode(m).catch(() => {});
  }, [navigate]);

  const handleScan = async (rawString) => {
    setMatches(null);
    setResult(null);

    // Try parsing as our QR code JSON (has an id field)
    try {
      const parsed = JSON.parse(rawString);
      if (parsed.id) {
        if (mode === "out") {
          await removeItem(parsed.id);
          setResult({
            type: "success",
            message: `${parsed.name || "Item"} removed from freezer`,
          });
        } else {
          setResult({
            type: "warn",
            message: `"${parsed.name || "Item"}" is already in the freezer`,
          });
        }
        return;
      }
    } catch {
      // Not JSON, treat as retail barcode
    }

    if (mode === "out") {
      await handleScanOut(rawString);
    } else {
      await handleScanIn(rawString);
    }
  };

  const handleScanIn = async (barcode) => {
    try {
      const data = await lookupBarcode(barcode);
      if (data.found && data.name) {
        setFixBarcode(barcode);
        setFixName(data.name);
        setFixBrand(data.brand || "");
        setResult(null);
        setMatches(null);
      } else {
        navigate("/add", { state: { barcode, prefill: { name: "", brand: "" } } });
      }
    } catch {
      setResult({ type: "error", message: "Barcode lookup failed. Try again." });
    }
  };

  const handleFixBarcode = async () => {
    if (!fixBarcode || !fixName.trim()) return;
    setFixing(true);
    try {
      await saveBarcodeMapping(fixBarcode, fixName.trim(), fixBrand || null);
      setResult({ type: "success", message: `"${fixBarcode}" → "${fixName.trim()}" saved for future scans` });
      setFixBarcode(null);
      setMatches(null);
    } catch {
      setResult({ type: "error", message: "Failed to save barcode name." });
    } finally {
      setFixing(false);
    }
  };

  const handleUseCached = async () => {
    if (!fixBarcode) return;
    navigate("/add", { state: { barcode: fixBarcode, prefill: { name: fixName, brand: fixBrand } } });
  };

  const handleScanOut = async (barcode) => {
    try {
      // Try direct barcode lookup first (items that stored this barcode)
      const byBarcode = await getItemsByBarcode(barcode);
      if (byBarcode.length === 1) {
        await doRemove(byBarcode[0]);
        return;
      } else if (byBarcode.length > 1) {
        setMatches(byBarcode);
        return;
      }

      // Fall back to name-based search via barcode cache
      const data = await lookupBarcode(barcode);
      const searchName = data.found ? data.name : barcode;

      const found = await searchItems(searchName);

      if (found.length === 0) {
        setResult({
          type: "warn",
          message: `No items matching "${searchName}" found in freezer`,
        });
      } else if (found.length === 1) {
        await doRemove(found[0]);
      } else {
        setMatches(found);
      }
    } catch {
      setResult({ type: "error", message: "Search failed. Try again." });
    }
  };

  const doDecrement = async (item) => {
    setRemoving(item.id);
    try {
      const res = await decrementItem(item.id);
      setMatches(null);
      setResult({
        type: "success",
        message: res.removed
          ? `${item.name} — last serving used, container removed`
          : `${item.name} — 1 serving used (${res.remaining} left)`,
      });
    } catch {
      setResult({ type: "error", message: `Failed to decrement ${item.name}` });
    } finally {
      setRemoving(null);
    }
  };

  const doRemove = async (item) => {
    setRemoving(item.id);
    try {
      await removeItem(item.id);
      setMatches(null);
      setResult({
        type: "success",
        message: `${item.name} (x${item.quantity}) removed from freezer`,
      });
    } catch {
      setResult({ type: "error", message: `Failed to remove ${item.name}` });
    } finally {
      setRemoving(null);
    }
  };

  const resultColors = {
    success: "bg-green-50 text-green-700 border-green-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    error: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Scanner</h2>

      {/* Scan In / Scan Out mode toggle */}
      <div className="flex gap-2 mb-3">
          <ModeButton
            active={mode === "in"}
            onClick={() => changeMode("in")}
            icon={<LogIn size={16} />}
            label="Scan In"
            color="green"
          />
          <ModeButton
            active={mode === "out"}
            onClick={() => changeMode("out")}
            icon={<LogOut size={16} />}
            label="Scan Out"
            color="blue"
          />
         </div>
  
       <p className="text-xs text-gray-500 mb-4">
          {mode === "in"
            ? "Scan a barcode to add a new item to the freezer."
            : mode === "stockCheck"
            ? "Scan barcodes to check stock levels."
            : "Scan a barcode or QR label to remove an item from the freezer."}
       </p>

      {/* Stock Check link */}
      <button
        onClick={() => changeMode("stockCheck")}
        className="mb-4 w-full py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm font-medium text-amber-700 hover:bg-amber-100 active:scale-[0.98]"
      >
        🔍 Stock Check →
      </button>

      {/* Input method toggle */}
      <div className="flex gap-2 mb-4 sm:mb-6">
        <TabButton
          active={inputTab === "camera"}
          onClick={() => setInputTab("camera")}
          label="Camera"
        />
        <TabButton
          active={inputTab === "usb"}
          onClick={() => setInputTab("usb")}
          label="USB Scanner"
        />
      </div>

      {inputTab === "usb" && <ScanInput onScan={handleScan} />}
      {inputTab === "camera" && <CameraScanner onScan={handleScan} />}

      {/* Match picker for scan-out with multiple results */}
      {matches && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700">
              {matches.length} items found — tap to remove
            </p>
            <button
              onClick={() => setMatches(null)}
              className="p-1 rounded hover:bg-gray-100"
            >
              <X size={16} className="text-gray-400" />
            </button>
          </div>
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {matches.map((item) => (
              <button
                key={item.id}
                onClick={() => doRemove(item)}
                disabled={removing === item.id}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 active:bg-gray-100 flex items-center justify-between gap-3 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.frozen_date} &middot; x{item.quantity}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {item.quantity > 1 && (
                    <span
                      onClick={(e) => { e.stopPropagation(); doDecrement(item); }}
                      className="text-xs font-medium text-amber-600 cursor-pointer hover:underline"
                    >
                      -1
                    </span>
                  )}
                  <span className="text-xs font-medium text-red-600">
                    {removing === item.id ? "..." : "Remove"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result feedback */}
      {result && (
        <div
          className={`mt-4 sm:mt-6 px-4 py-3 rounded-lg border text-sm font-medium ${
            resultColors[result.type]
          }`}
        >
          {result.message}
        </div>
      )}

      {/* Barcode name fix form */}
      {fixBarcode && (
        <div className="mt-4 bg-[var(--surface)] rounded-xl border border-amber-300 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <Pencil size={16} />Fix Barcode Name
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            This barcode currently resolves to "{fixName}". Edit the name below so future scans resolve correctly.
          </p>
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Barcode</label>
          <input type="text" value={fixBarcode} readOnly className="w-full border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm bg-[var(--bg)] text-[var(--text-secondary)] mb-3" />
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Product Name</label>
          <input type="text" value={fixName} onChange={(e) => setFixName(e.target.value)} className="w-full border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none bg-[var(--surface)] text-[var(--text)] mb-3" />
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Brand (optional)</label>
          <input type="text" value={fixBrand} onChange={(e) => setFixBrand(e.target.value)} placeholder="Optional" className="w-full border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none bg-[var(--surface)] text-[var(--text)] mb-4" />
          <div className="flex gap-2">
            <button onClick={handleFixBarcode} disabled={fixing || !fixName.trim()} className="flex-1 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 active:scale-[0.98] disabled:opacity-50 text-sm">
              {fixing ? "Saving..." : "Save"}
            </button>
            <button onClick={handleUseCached} className="flex-1 py-2.5 bg-[var(--ice-blue)] text-white rounded-lg font-medium hover:bg-[#4a9bd9] active:scale-[0.98] text-sm">
              Use as-is → Add Item
            </button>
            <button onClick={() => { setFixBarcode(null); setResult(null); }} className="py-2.5 px-3 bg-[var(--bg)] text-[var(--text-secondary)] rounded-lg font-medium hover:bg-[var(--border)] active:scale-[0.98] text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, icon, label, color }) {
  const colors = {
    green: active
      ? "bg-green-600 text-white"
      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
    blue: active
      ? "bg-[var(--ice-blue)] text-white"
      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
    amber: active
      ? "bg-amber-600 text-white"
      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
  };

  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${colors[color]}`}
    >
      {icon}
      {label}
    </button>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${
        active
          ? "bg-[var(--ice-blue)] text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

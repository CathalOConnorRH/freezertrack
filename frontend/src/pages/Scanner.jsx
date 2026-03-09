import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { removeItem, lookupBarcode } from "../api/client";
import ScanInput from "../components/ScanInput";
import CameraScanner from "../components/CameraScanner";

export default function Scanner() {
  const isMobile =
    typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  const [tab, setTab] = useState(isMobile ? "camera" : "usb");
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  const handleScan = async (rawString) => {
    try {
      const parsed = JSON.parse(rawString);
      if (parsed.id) {
        await removeItem(parsed.id);
        setResult({
          type: "success",
          message: `${parsed.name || "Item"} removed from freezer`,
        });
        return;
      }
    } catch {
      // Not JSON, treat as retail barcode
    }

    try {
      const data = await lookupBarcode(rawString);
      if (data.found) {
        navigate("/add", { state: { barcode: rawString, prefill: data } });
      } else {
        setResult({
          type: "warn",
          message: `No product found for ${rawString}`,
        });
      }
    } catch {
      setResult({ type: "error", message: "Lookup failed. Try again." });
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

      <div className="flex gap-2 mb-4 sm:mb-6">
        <TabButton
          active={tab === "camera"}
          onClick={() => setTab("camera")}
          label="Camera"
        />
        <TabButton
          active={tab === "usb"}
          onClick={() => setTab("usb")}
          label="USB Scanner"
        />
      </div>

      {tab === "usb" && <ScanInput onScan={handleScan} />}
      {tab === "camera" && <CameraScanner onScan={handleScan} />}

      {result && (
        <div
          className={`mt-4 sm:mt-6 px-4 py-3 rounded-lg border text-sm font-medium ${
            resultColors[result.type]
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
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

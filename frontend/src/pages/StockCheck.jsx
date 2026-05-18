import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { confirmStockCheck } from "../api/client";

export default function StockCheck() {
  const [barcode, setBarcode] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCheck = async (e) => {
    if (e) e.preventDefault();
    if (!barcode) return;

    setLoading(true);
    setResult(null);

    try {
      const data = await confirmStockCheck([barcode]);
      if (data && data.success) {
        setResult({
          type: "success",
          message: `Successfully checked ${data.items.length} item${data.items.length !== 1 ? "s" : ""}`,
        });
      } else {
        setResult({ type: "error", message: "No items found with that barcode" });
      }
    } catch (err) {
      setResult({ type: "error", message: "Error checking stock" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto p-4">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Stock Check</h2>

      <form onSubmit={handleCheck} className="flex gap-2 mb-4">
        <input
          type="text"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="Enter barcode"
          className="flex-1 p-2 border rounded-lg"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !barcode}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg disabled:opacity-50"
        >
          {loading ? "..." : "Check"}
        </button>
      </form>

      {result && (
        <div
          className={`mt-4 px-4 py-3 rounded-lg border text-sm font-medium ${
            result.type === "success"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}

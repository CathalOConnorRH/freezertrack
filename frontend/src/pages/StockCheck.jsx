import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScanInput from "../components/ScanInput";
import CameraScanner from "../components/CameraScanner";
import Modal from "../components/Modal";

import {
  startStockCheck,
  scanStockCheck,
  getStockCheckProgress,
  endStockCheck,
  removeMissingItems,
  scanAndCreateItem,
} from "../api/client";

const PHASES = {
  START: "start",
  SCANNING: "scanning",
  SUMMARY: "summary",
};

export default function StockCheck() {
  const [phase, setPhase] = useState(PHASES.START);
  const [sessionId, setSessionId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [missingItems, setMissingItems] = useState([]);
  const [selectedMissing, setSelectedMissing] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [inputTab, setInputTab] = useState("usb");

  // Modal state for adding unknown retail items
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState(null);
  const [addForm, setAddForm] = useState({ name: "", brand: "" });
  const [addError, setAddError] = useState(null);

  const navigate = useNavigate();

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await startStockCheck();
      setSessionId(data.session_id);
      setPhase(PHASES.SCANNING);
      setProgress({ total: data.total_items, scanned: 0 });
    } catch (err) {
      setError("Failed to start stock check");
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async (barcode) => {
    if (!sessionId) return;

    setScanResult(null);
    try {
      await scanStockCheck(sessionId, [barcode]);
      // Refresh progress immediately
      await refreshProgress();
      setScanResult({ type: "found", text: "Scanned" });
      setTimeout(() => setScanResult(null), 2000);
    } catch (err) {
      setError("Scan failed — try again");
    }
  };

  const handleUnknownBarcode = async (barcode) => {
    setPendingBarcode(barcode);
    setAddForm({ name: "", brand: "" });
    setAddError(null);
    setShowAddModal(true);
  };

  const handleAddSubmit = async () => {
    if (!sessionId || !pendingBarcode) return;
    if (!addForm.name.trim()) {
      setAddError("Name is required");
      return;
    }
    setLoading(true);
    setShowAddModal(false);
    try {
      const data = await scanAndCreateItem(sessionId, {
        name: addForm.name.trim(),
        brand: addForm.brand.trim() || null,
        barcode: pendingBarcode,
        frozen_date: new Date().toISOString().split("T")[0],
        quantity: 1,
      });
      await refreshProgress();
      setScanResult({ type: "created", text: `Added "${data.item.name}"` });
      setTimeout(() => setScanResult(null), 3000);
    } catch (err) {
      setAddError("Failed to add item");
    } finally {
      setLoading(false);
    }
  };

  const refreshProgress = async () => {
    if (!sessionId) return;
    try {
      const data = await getStockCheckProgress(sessionId);
      setProgress({ total: data.total_inventory, scanned: data.scanned });
      setMissingItems(data.missing || []);
    } catch {}
  };

  const handleEnd = async () => {
    setLoading(true);
    try {
      await endStockCheck(sessionId);
      setPhase(PHASES.SUMMARY);
    } catch (err) {
      setError("Failed to end stock check");
    } finally {
      setLoading(false);
    }
  };

  const toggleMissingSelection = (barcode) => {
    setSelectedMissing((prev) => {
      const next = new Set(prev);
      if (next.has(barcode)) {
        next.delete(barcode);
      } else {
        next.add(barcode);
      }
      return next;
    });
  };

  const selectAllMissing = () => {
    setSelectedMissing(new Set(missingItems.map((i) => i.barcode)));
  };

  const deselectAllMissing = () => {
    setSelectedMissing(new Set());
  };

  const handleRemoveSelected = async () => {
    if (selectedMissing.size === 0) return;
    setLoading(true);
    try {
      await removeMissingItems(sessionId, [...selectedMissing]);
      await refreshProgress();
      setSelectedMissing(new Set());
    } catch (err) {
      setError("Failed to remove items");
    } finally {
      setLoading(false);
    }
  };

  const handleGoHome = () => {
    navigate("/");
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (phase === PHASES.START) {
    return (
      <div className="max-w-lg mx-auto p-4 flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <h2 className="text-2xl font-bold">Stock Check</h2>
        <p className="text-gray-500 text-center max-w-sm">
          Scan every item in the freezer to verify stock levels. Missing items
          are ones that were never scanned — they may have been removed without
          being recorded.
        </p>
        <button
          onClick={handleStart}
          disabled={loading}
          className="px-8 py-4 bg-[var(--ice-blue)] text-white rounded-xl text-lg font-semibold disabled:opacity-50"
        >
          {loading ? "Starting..." : "Start Stock Check"}
        </button>
      </div>
    );
  }

  if (phase === PHASES.SUMMARY) {
    return (
      <div className="max-w-lg mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Stock Check Complete</h2>
          <button onClick={handleGoHome} className="text-sm text-[var(--ice-blue)] hover:underline">
            Go Home
          </button>
        </div>

        {progress && (
          <div className="bg-white rounded-xl border p-4 mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Scanned</span>
              <span>{progress.scanned} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-[var(--ice-blue)] h-2 rounded-full transition-all"
                style={{ width: `${(progress.scanned / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {missingItems.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
              <span>{missingItems.length} item{missingItems.length !== 1 ? "s" : ""} missing</span>
            </h3>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700 mb-3">
                These items were in inventory but were not scanned during this stock check.
              </p>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {missingItems.map((item) => (
                  <div key={item.barcode} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-red-900">{item.barcode}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {missingItems.length === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
            All items scanned! Stock is up to date.
          </div>
        )}
      </div>
    );
  }

  // SCANNING phase
  return (
    <div className="max-w-lg mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => { setPhase(PHASES.START); setSessionId(null); }} className="text-sm text-gray-500 hover:text-gray-700">
          ← Cancel
        </button>
        <h2 className="text-lg font-bold">Stock Check</h2>
        <button
          onClick={handleEnd}
          disabled={loading}
          className="text-sm text-[var(--ice-blue)] hover:underline"
        >
          End Check
        </button>
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="bg-white rounded-xl border p-4 mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>{progress.scanned} scanned</span>
            <span>{progress.total - progress.scanned} remaining</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-[var(--ice-blue)] h-2 rounded-full transition-all"
              style={{ width: `${(progress.scanned / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Scan result feedback */}
      {scanResult && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg border text-sm font-medium ${
            scanResult.type === "found"
              ? "bg-green-50 text-green-700 border-green-200"
              : scanResult.type === "created"
              ? "bg-blue-50 text-blue-700 border-blue-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {scanResult.text}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Scanner input */}
      <div className="flex gap-2 mb-3">
        <TabButton
          active={inputTab === "usb"}
          onClick={() => setInputTab("usb")}
          label="USB Scanner"
        />
        <TabButton
          active={inputTab === "camera"}
          onClick={() => setInputTab("camera")}
          label="Camera"
        />
      </div>

      {inputTab === "usb" && (
        <div className="relative">
          <ScanInput onScan={(barcode) => {
            // For simplicity, all barcodes go through the same handler.
            // In a real app, you'd detect if it's a known retail barcode vs inventory QR.
            handleScan(barcode);
          }} />
        </div>
      )}
      {inputTab === "camera" && (
        <CameraScanner onScan={(barcode) => handleScan(barcode)} />
      )}

      {/* Missing items panel */}
      {progress && progress.total - progress.scanned > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Missing ({missingItems.length})
          </h3>
          <div className="bg-white rounded-xl border overflow-hidden max-h-80 overflow-y-auto">
            {missingItems.slice(0, 20).map((item) => (
              <label
                key={item.barcode}
                className={`flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer ${
                  selectedMissing.has(item.barcode) ? "bg-blue-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedMissing.has(item.barcode)}
                  onChange={() => toggleMissingSelection(item.barcode)}
                  className="w-4 h-4 text-[var(--ice-blue)] rounded border-gray-300"
                />
                <span className="text-sm font-mono text-gray-800">{item.barcode}</span>
              </label>
            ))}
          </div>

          {missingItems.length > 20 && (
            <p className="text-xs text-gray-500 mt-1">
              Showing first 20 of {missingItems.length}
            </p>
          )}

          {selectedMissing.size > 0 && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleRemoveSelected}
                disabled={loading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Remove Selected ({selectedMissing.size})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add unknown item modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Item"
      >
        <form onSubmit={(e) => { e.preventDefault(); handleAddSubmit(); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
            <input
              type="text"
              value={pendingBarcode || ""}
              readOnly
              className="w-full p-2 border rounded-lg bg-gray-100 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              placeholder="Product name"
              className="w-full p-2 border rounded-lg"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
            <input
              type="text"
              value={addForm.brand}
              onChange={(e) => setAddForm({ ...addForm, brand: e.target.value })}
              placeholder="Optional brand"
              className="w-full p-2 border rounded-lg"
            />
          </div>
          {addError && (
            <p className="text-sm text-red-600">{addError}</p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-[var(--ice-blue)] text-white rounded-lg font-medium disabled:opacity-50"
            >
              Add Item
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 border rounded-lg font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
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

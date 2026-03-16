import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createItem, getCategories, getFreezers, uploadPhoto, saveBarcodeMapping, lookupBarcode } from "../api/client";
import CameraScanner from "../components/CameraScanner";
import { Camera, X } from "lucide-react";

const SHELF_LIFE_MAP = {
  meat: 120, poultry: 180, fish: 90, vegetables: 240, fruit: 240,
  "ready meals": 90, soups: 120, bread: 90, desserts: 180, other: 180,
};

export default function AddItem() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefill = location.state?.prefill;
  const cameFromScanner = location.state?.barcode != null;

  const [categories, setCategories] = useState([]);
  const [freezers, setFreezers] = useState([]);
  const [form, setForm] = useState({
    name: prefill?.name || "",
    brand: prefill?.brand || "",
    barcode: location.state?.barcode || "",
    category: "",
    frozen_date: new Date().toISOString().split("T")[0],
    quantity: 1,
    containers: 1,
    shelf_life_days: "",
    freezer_id: "",
    notes: "",
    auto_print: true,
  });
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showCamScanner, setShowCamScanner] = useState(false);
  const [barcodeLookupMsg, setBarcodeLookupMsg] = useState(null);
  const barcodeInputRef = useRef(null);
  const scanBuffer = useRef("");
  const lastKeyTime = useRef(0);

  const handleBarcodeScan = useCallback(async (code) => {
    setForm((f) => ({ ...f, barcode: code }));
    setShowCamScanner(false);
    setBarcodeLookupMsg("Looking up...");
    try {
      const data = await lookupBarcode(code);
      if (data.found) {
        setForm((f) => ({
          ...f,
          name: f.name || data.name,
          brand: f.brand || data.brand || "",
        }));
        setBarcodeLookupMsg(`Found: ${data.name}`);
      } else {
        setBarcodeLookupMsg("Not found in databases — fill in the details manually");
      }
    } catch {
      setBarcodeLookupMsg("Lookup failed");
    }
    setTimeout(() => setBarcodeLookupMsg(null), 4000);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (showCamScanner) return;
      const active = document.activeElement;
      const isTypingInForm = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
      if (isTypingInForm && active !== barcodeInputRef.current) return;

      const now = Date.now();
      if (e.key === "Enter" && scanBuffer.current.length >= 6) {
        handleBarcodeScan(scanBuffer.current);
        scanBuffer.current = "";
        lastKeyTime.current = 0;
        e.preventDefault();
        return;
      }
      if (e.key.length === 1) {
        if (now - lastKeyTime.current > 80 && lastKeyTime.current !== 0) {
          scanBuffer.current = e.key;
        } else {
          scanBuffer.current += e.key;
        }
        lastKeyTime.current = now;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleBarcodeScan, showCamScanner]);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
    getFreezers().then(setFreezers).catch(() => {});
  }, []);

  const set = (field) => (e) =>
    setForm((f) => {
      const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      const updated = { ...f, [field]: val };
      if (field === "category" && val && !f.shelf_life_days) {
        const days = SHELF_LIFE_MAP[val.toLowerCase()];
        if (days) updated.shelf_life_days = String(days);
      }
      return updated;
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await createItem({
        name: form.name,
        brand: form.brand || null,
        category: form.category || null,
        barcode: form.barcode || null,
        frozen_date: form.frozen_date,
        quantity: Number(form.quantity),
        containers: Number(form.containers),
        shelf_life_days: form.shelf_life_days ? Number(form.shelf_life_days) : null,
        freezer_id: form.freezer_id || null,
        notes: form.notes || null,
        auto_print: form.auto_print,
      });

      if (form.barcode && form.name) {
        await saveBarcodeMapping(form.barcode, form.name, form.brand || null).catch(() => {});
      }

      if (photo && res.items?.length > 0) {
        for (const item of res.items) {
          await uploadPhoto(item.id, photo).catch(() => {});
        }
      }

      navigate(cameFromScanner ? "/scan" : "/", { replace: true });
    } catch {
      setSubmitError("Failed to add item. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalItems = Number(form.containers) || 1;
  const servingsEach = Number(form.quantity) || 1;

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none bg-white";

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Add Item</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Name *
            {prefill?.source === "open_food_facts" && (
              <span className="ml-2 inline-block bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                via Open Food Facts
              </span>
            )}
          </label>
          <input
            type="text" required value={form.name} onChange={set("name")}
            className={inputCls} autoComplete="off"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Barcode
            {form.barcode && (
              <span className="ml-2 inline-block bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                will be saved for future scans
              </span>
            )}
          </label>
          <div className="flex gap-2">
            <input
              ref={barcodeInputRef}
              type="text" value={form.barcode}
              onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && form.barcode.length >= 6) {
                  e.preventDefault();
                  handleBarcodeScan(form.barcode);
                }
              }}
              className={inputCls} placeholder="Type, scan, or use camera"
              inputMode="numeric"
            />
            <button
              type="button"
              onClick={() => setShowCamScanner(!showCamScanner)}
              className={`shrink-0 px-3 rounded-lg border transition-colors ${
                showCamScanner
                  ? "bg-[var(--ice-blue)] text-white border-[var(--ice-blue)]"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
              title="Scan with camera"
            >
              {showCamScanner ? <X size={18} /> : <Camera size={18} />}
            </button>
          </div>
          {barcodeLookupMsg && (
            <p className="text-xs text-gray-500 mt-1.5">{barcodeLookupMsg}</p>
          )}
          {showCamScanner && (
            <div className="mt-2 rounded-lg overflow-hidden border border-gray-200">
              <CameraScanner onScan={handleBarcodeScan} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Brand</label>
            <input
              type="text" value={form.brand} onChange={set("brand")}
              className={inputCls} autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
            <input
              type="text" list="categories" value={form.category} onChange={set("category")}
              className={inputCls} placeholder="Select or type..."
            />
            <datalist id="categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Frozen Date</label>
            <input
              type="date" value={form.frozen_date} onChange={set("frozen_date")}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Shelf Life (days)</label>
            <input
              type="number" min="1" value={form.shelf_life_days} onChange={set("shelf_life_days")}
              className={inputCls} placeholder="Auto from category"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Servings</label>
            <input
              type="number" min="1" value={form.quantity} onChange={set("quantity")}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Containers</label>
            <input
              type="number" min="1" value={form.containers} onChange={set("containers")}
              className={inputCls}
            />
          </div>
        </div>

        {totalItems > 1 && (
          <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2.5">
            This will add <strong>{totalItems} items</strong> to the freezer
            ({servingsEach} serving{servingsEach > 1 ? "s" : ""} each)
            {form.auto_print && <> and print <strong>{totalItems} labels</strong></>}.
          </p>
        )}

        {freezers.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Freezer</label>
            <select value={form.freezer_id} onChange={set("freezer_id")} className={inputCls}>
              <option value="">Default</option>
              {freezers.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
          <textarea value={form.notes} onChange={set("notes")} rows={2} className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Photo</label>
          <input
            type="file" accept="image/*" capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer py-1">
          <input
            type="checkbox" checked={form.auto_print} onChange={set("auto_print")}
            className="w-5 h-5 sm:w-4 sm:h-4 rounded text-[var(--ice-blue)] focus:ring-[var(--ice-blue)]"
          />
          <span className="text-sm text-gray-700">Print label{totalItems > 1 ? "s" : ""}</span>
        </label>

        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm font-medium text-red-700">
            {submitError}
          </div>
        )}

        <button
          type="submit" disabled={submitting}
          className="w-full py-3.5 sm:py-3 bg-[var(--ice-blue)] text-white rounded-lg font-medium text-base sm:text-sm hover:bg-[#4a9bd9] transition-colors disabled:opacity-50 active:scale-[0.98]"
        >
          {submitting
            ? `Adding ${totalItems > 1 ? `${totalItems} items` : "item"}...`
            : `Add ${totalItems > 1 ? `${totalItems} containers` : ""} to Freezer`}
        </button>
      </form>
    </div>
  );
}

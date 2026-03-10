import { useState, useEffect, useCallback } from "react";
import { getConfig, updateConfig, invalidateLabelCache } from "../api/client";
import { Save, RotateCcw } from "lucide-react";

const PRESETS = [
  { name: "Standard (50x30mm)", width: 400, height: 240 },
  { name: "Small (40x20mm)", width: 320, height: 160 },
  { name: "Wide (60x30mm)", width: 480, height: 240 },
  { name: "Square (40x40mm)", width: 320, height: 320 },
];

export default function LabelDesigner() {
  const [form, setForm] = useState({
    width: 400,
    height: 240,
    font_size: 22,
    show_brand: true,
    show_notes: false,
    show_category: false,
  });
  const [sample, setSample] = useState({
    name: "Chicken Curry",
    brand: "Home Made",
    category: "Ready Meals",
    qty: 2,
    notes: "Spicy, double portion",
  });
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getConfig().then((data) => {
      const s = data.settings;
      setForm({
        width: Number(s.LABEL_WIDTH) || 400,
        height: Number(s.LABEL_HEIGHT) || 240,
        font_size: Number(s.LABEL_FONT_SIZE) || 22,
        show_brand: s.LABEL_SHOW_BRAND === "true" || s.LABEL_SHOW_BRAND === "True",
        show_notes: s.LABEL_SHOW_NOTES === "true" || s.LABEL_SHOW_NOTES === "True",
        show_category: s.LABEL_SHOW_CATEGORY === "true" || s.LABEL_SHOW_CATEGORY === "True",
      });
      setLoaded(true);
    });
  }, []);

  const refreshPreview = useCallback(() => {
    const params = new URLSearchParams({
      width: form.width,
      height: form.height,
      font_size: form.font_size,
      show_brand: form.show_brand,
      show_notes: form.show_notes,
      show_category: form.show_category,
      sample_name: sample.name,
      sample_brand: sample.brand,
      sample_category: sample.category,
      sample_qty: sample.qty,
      sample_notes: sample.notes,
    });
    setPreviewUrl(`/api/labels/preview-sample?${params.toString()}&_t=${Date.now()}`);
  }, [form, sample]);

  useEffect(() => {
    if (loaded) refreshPreview();
  }, [loaded, refreshPreview]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await updateConfig({
        LABEL_WIDTH: String(form.width),
        LABEL_HEIGHT: String(form.height),
        LABEL_FONT_SIZE: String(form.font_size),
        LABEL_SHOW_BRAND: String(form.show_brand),
        LABEL_SHOW_NOTES: String(form.show_notes),
        LABEL_SHOW_CATEGORY: String(form.show_category),
      });
      await invalidateLabelCache();
      setSaveMsg({ type: "ok", text: "Label settings saved. Cached labels cleared." });
    } catch {
      setSaveMsg({ type: "err", text: "Failed to save." });
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (p) => {
    setForm((f) => ({ ...f, width: p.width, height: p.height }));
  };

  const setField = (key) => (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : Number(e.target.value) || e.target.value;
    setForm((f) => ({ ...f, [key]: val }));
  };

  const setSampleField = (key) => (e) => {
    setSample((s) => ({ ...s, [key]: e.target.value }));
  };

  const inputCls =
    "w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none bg-[var(--surface)] text-[var(--text)]";

  if (!loaded) {
    return <div className="max-w-4xl mx-auto py-12 text-center text-[var(--text-secondary)]">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Label Designer</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Controls */}
        <div className="space-y-4">
          {/* Presets */}
          <section className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
            <h3 className="text-sm font-semibold mb-3">Size Presets</h3>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => applyPreset(p)}
                  className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors active:scale-[0.98] ${
                    form.width === p.width && form.height === p.height
                      ? "bg-[var(--ice-blue)] text-white"
                      : "bg-[var(--bg)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </section>

          {/* Dimensions & Font */}
          <section className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
            <h3 className="text-sm font-semibold mb-3">Layout</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Width (px)</label>
                <input type="number" value={form.width} onChange={setField("width")} min="200" max="800" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Height (px)</label>
                <input type="number" value={form.height} onChange={setField("height")} min="100" max="600" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Font Size</label>
                <input type="number" value={form.font_size} onChange={setField("font_size")} min="10" max="40" className={inputCls} />
              </div>
            </div>
          </section>

          {/* Show/Hide Fields */}
          <section className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
            <h3 className="text-sm font-semibold mb-3">Visible Fields</h3>
            <div className="space-y-2.5">
              {[
                { key: "show_brand", label: "Brand" },
                { key: "show_notes", label: "Notes" },
                { key: "show_category", label: "Category" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={setField(key)}
                    className="w-4 h-4 rounded text-[var(--ice-blue)]"
                  />
                  <span className="text-sm text-[var(--text)]">{label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Sample Data */}
          <section className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
            <h3 className="text-sm font-semibold mb-3">Sample Data</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Name</label>
                <input type="text" value={sample.name} onChange={setSampleField("name")} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">Brand</label>
                  <input type="text" value={sample.brand} onChange={setSampleField("brand")} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">Category</label>
                  <input type="text" value={sample.category} onChange={setSampleField("category")} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">Quantity</label>
                  <input type="number" value={sample.qty} onChange={setSampleField("qty")} min="1" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">Notes</label>
                  <input type="text" value={sample.notes} onChange={setSampleField("notes")} className={inputCls} />
                </div>
              </div>
            </div>
          </section>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={refreshPreview}
              className="flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 bg-[var(--bg)] text-[var(--text)] rounded-lg font-medium hover:bg-[var(--border)] active:scale-[0.98] text-sm"
            >
              <RotateCcw size={16} />
              Refresh Preview
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 bg-[var(--ice-blue)] text-white rounded-lg font-medium hover:bg-[#4a9bd9] disabled:opacity-50 active:scale-[0.98] text-sm"
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save & Apply"}
            </button>
          </div>

          {saveMsg && (
            <div className={`px-3 py-2.5 rounded-lg text-sm font-medium ${
              saveMsg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>
              {saveMsg.text}
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-20 self-start">
          <section className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
            <h3 className="text-sm font-semibold mb-3">Preview</h3>
            <div className="bg-[var(--bg)] rounded-lg p-4 flex items-center justify-center min-h-[200px]">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Label preview"
                  className="max-w-full h-auto rounded shadow-md border border-[var(--border)]"
                  style={{ imageRendering: "auto" }}
                />
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">Loading preview...</p>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-2 text-center">
              {form.width} x {form.height} px
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

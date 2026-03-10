import { useState, useEffect, useRef } from "react";
import {
  getConfig, updateConfig, triggerUpdate, getUpdateStatus,
  restartService, restoreBackup, getPrinterStatus, invalidateLabelCache,
  getFreezers, createFreezer, deleteFreezer,
} from "../api/client";
import {
  RefreshCw, Save, RotateCcw, Download, FileDown, Upload,
  Printer, Plus, Trash2, Sun, Moon, Monitor,
} from "lucide-react";
import useTheme from "../hooks/useTheme";

const CONFIG_FIELDS = {
  NIIMBOT_MAC: { label: "Printer Bluetooth MAC", placeholder: "AA:BB:CC:DD:EE:FF" },
  AUTO_PRINT: { label: "Auto-print labels on add", type: "toggle" },
  UPC_ITEM_DB_KEY: { label: "UPC Item DB API Key", placeholder: "Optional" },
  BARCODE_CACHE_TTL_SECONDS: { label: "Barcode cache TTL (seconds)", type: "number" },
  ALERT_DAYS_FROZEN: { label: "Alert after days frozen", type: "number" },
  LOW_STOCK_THRESHOLD: { label: "Low stock alert threshold", type: "number" },
};

const LABEL_FIELDS = {
  LABEL_WIDTH: { label: "Label width (px)", type: "number" },
  LABEL_HEIGHT: { label: "Label height (px)", type: "number" },
  LABEL_FONT_SIZE: { label: "Font size", type: "number" },
  LABEL_SHOW_BRAND: { label: "Show brand on label", type: "toggle" },
  LABEL_SHOW_NOTES: { label: "Show notes on label", type: "toggle" },
  LABEL_SHOW_CATEGORY: { label: "Show category on label", type: "toggle" },
};

export default function Admin() {
  const { theme, setTheme } = useTheme();
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updateLog, setUpdateLog] = useState("");
  const [updateDone, setUpdateDone] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const [printerStatus, setPrinterStatus] = useState(null);
  const [freezers, setFreezers] = useState([]);
  const [newFreezerName, setNewFreezerName] = useState("");
  const logRef = useRef(null);

  useEffect(() => {
    getConfig()
      .then((data) => { setConfig(data); setForm(data.settings); })
      .catch(() => setLoadError(true));
    getFreezers().then(setFreezers).catch(() => {});
  }, []);

  useEffect(() => {
    if (!updating) return;
    const id = setInterval(async () => {
      try {
        const status = await getUpdateStatus();
        setUpdateLog(status.log || "");
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        if (!status.running) {
          setUpdating(false);
          setUpdateDone(status.exit_code === 0 ? "success" : "failed");
          clearInterval(id);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(id);
  }, [updating]);

  const handleSave = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const res = await updateConfig(form);
      if (res.updated.length > 0) {
        setSaveMsg({ type: "ok", text: `Updated: ${res.updated.join(", ")}. ${res.restart_required ? "Restart required." : ""}` });
        if (res.updated.some((k) => k.startsWith("LABEL_"))) {
          await invalidateLabelCache();
        }
      } else {
        setSaveMsg({ type: "ok", text: "No changes to save." });
      }
    } catch { setSaveMsg({ type: "err", text: "Failed to save." }); }
    finally { setSaving(false); }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try { await restartService(); setSaveMsg({ type: "ok", text: "Service restarted." }); }
    catch { setSaveMsg({ type: "err", text: "Failed to restart." }); }
    finally { setRestarting(false); }
  };

  const handleUpdate = async () => {
    if (!confirm("Update FreezerTrack to the latest version?")) return;
    setUpdating(true); setUpdateLog(""); setUpdateDone(null);
    try { await triggerUpdate(); }
    catch (e) {
      if (e.response?.status === 409) setUpdateLog("Update already in progress...\n");
      else { setUpdating(false); setUpdateDone("failed"); }
    }
  };

  const checkPrinter = async () => {
    setPrinterStatus(null);
    try { setPrinterStatus(await getPrinterStatus()); }
    catch { setPrinterStatus({ connected: false, error: "Check failed" }); }
  };

  const handleAddFreezer = async () => {
    if (!newFreezerName.trim()) return;
    await createFreezer({ name: newFreezerName.trim() });
    setNewFreezerName("");
    getFreezers().then(setFreezers);
  };

  const handleDeleteFreezer = async (id) => {
    try { await deleteFreezer(id); getFreezers().then(setFreezers); }
    catch { alert("Cannot delete a freezer that has items in it."); }
  };

  const set = (key) => (e) => {
    const val = e.target.type === "checkbox" ? String(e.target.checked) : e.target.value;
    setForm((f) => ({ ...f, [key]: val }));
  };

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <p className="text-red-600 font-medium mb-2">Failed to load settings</p>
        <p className="text-sm text-[var(--text-secondary)]">Check that FreezerTrack is fully installed.</p>
      </div>
    );
  }

  if (!config) return <div className="max-w-2xl mx-auto py-12 text-center text-[var(--text-secondary)]">Loading...</div>;

  const inputCls = "w-full border border-[var(--border)] rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none bg-[var(--surface)] text-[var(--text)]";
  const sectionCls = "bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 sm:p-6 mb-4 sm:mb-6";
  const isTruthy = (v) => v === "true" || v === "True";

  const renderFields = (fields) =>
    Object.entries(fields).map(([key, meta]) => (
      <div key={key}>
        <label className="block text-sm font-medium text-[var(--text)] mb-1.5">{meta.label}</label>
        {meta.type === "toggle" ? (
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isTruthy(form[key])} onChange={(e) => setForm((f) => ({ ...f, [key]: String(e.target.checked) }))} className="w-5 h-5 sm:w-4 sm:h-4 rounded text-[var(--ice-blue)]" />
            <span className="text-sm text-[var(--text-secondary)]">{isTruthy(form[key]) ? "Enabled" : "Disabled"}</span>
          </label>
        ) : (
          <input type={meta.type === "number" ? "number" : "text"} value={form[key] || ""} onChange={set(key)} placeholder={meta.placeholder || ""} className={inputCls} />
        )}
      </div>
    ));

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Admin</h2>

      {/* Theme */}
      <section className={sectionCls}>
        <h3 className="text-base sm:text-lg font-semibold mb-3">Appearance</h3>
        <div className="flex gap-2">
          {[{ value: "light", icon: Sun, label: "Light" }, { value: "dark", icon: Moon, label: "Dark" }, { value: "system", icon: Monitor, label: "System" }].map(({ value, icon: Icon, label }) => (
            <button key={value} onClick={() => setTheme(value)} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${theme === value ? "bg-[var(--ice-blue)] text-white" : "bg-[var(--bg)] text-[var(--text-secondary)] hover:bg-[var(--border)]"}`}>
              <Icon size={16} />{label}
            </button>
          ))}
        </div>
      </section>

      {/* Printer Status */}
      <section className={sectionCls}>
        <h3 className="text-base sm:text-lg font-semibold mb-3">Printer</h3>
        <button onClick={checkPrinter} className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--bg)] text-[var(--text)] rounded-lg text-sm font-medium hover:bg-[var(--border)] active:scale-[0.98]">
          <Printer size={16} />Check Printer Status
        </button>
        {printerStatus && (
          <div className={`mt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${printerStatus.connected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${printerStatus.connected ? "bg-green-500" : "bg-red-500"}`} />
            {printerStatus.connected ? `Connected (${printerStatus.mac})` : `Not connected: ${printerStatus.error || "unreachable"}`}
          </div>
        )}
      </section>

      {/* Configuration */}
      <section className={sectionCls}>
        <h3 className="text-base sm:text-lg font-semibold mb-4">Configuration</h3>
        <div className="space-y-4">{renderFields(CONFIG_FIELDS)}</div>
        {saveMsg && <div className={`mt-4 px-3 py-2.5 rounded-lg text-sm font-medium ${saveMsg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{saveMsg.text}</div>}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-5">
          <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 bg-[var(--ice-blue)] text-white rounded-lg font-medium hover:bg-[#4a9bd9] disabled:opacity-50 active:scale-[0.98]">
            <Save size={16} />{saving ? "Saving..." : "Save Settings"}
          </button>
          <button onClick={handleRestart} disabled={restarting} className="flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 bg-[var(--bg)] text-[var(--text)] rounded-lg font-medium hover:bg-[var(--border)] disabled:opacity-50 active:scale-[0.98]">
            <RotateCcw size={16} />{restarting ? "Restarting..." : "Restart Service"}
          </button>
        </div>
      </section>

      {/* Label Settings */}
      <section className={sectionCls}>
        <h3 className="text-base sm:text-lg font-semibold mb-4">Label Template</h3>
        <div className="space-y-4">{renderFields(LABEL_FIELDS)}</div>
        <p className="text-xs text-[var(--text-secondary)] mt-3">Save settings above to apply. Cached labels will be regenerated on next print.</p>
      </section>

      {/* Freezer Management */}
      <section className={sectionCls}>
        <h3 className="text-base sm:text-lg font-semibold mb-3">Freezers</h3>
        <div className="flex gap-2 mb-3">
          <input type="text" placeholder="New freezer name..." value={newFreezerName} onChange={(e) => setNewFreezerName(e.target.value)} className={`flex-1 ${inputCls}`} />
          <button onClick={handleAddFreezer} disabled={!newFreezerName.trim()} className="px-4 py-2.5 bg-[var(--ice-blue)] text-white rounded-lg font-medium disabled:opacity-50 active:scale-[0.98]"><Plus size={18} /></button>
        </div>
        <div className="space-y-2">
          {freezers.map((f) => (
            <div key={f.id} className="flex items-center justify-between bg-[var(--bg)] rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[var(--text)]">{f.name}</p>
                <p className="text-xs text-[var(--text-secondary)]">{f.item_count} items{f.location ? ` · ${f.location}` : ""}</p>
              </div>
              <button onClick={() => handleDeleteFreezer(f.id)} className="p-1 text-[var(--text-secondary)] hover:text-red-500"><Trash2 size={16} /></button>
            </div>
          ))}
          {freezers.length === 0 && <p className="text-sm text-[var(--text-secondary)] text-center py-4">No freezers configured. Items use the default freezer.</p>}
        </div>
      </section>

      {/* Data Management */}
      <section className={sectionCls}>
        <h3 className="text-base sm:text-lg font-semibold mb-4">Data Management</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-4">
          <a href="/api/admin/export/csv" download className="flex items-center justify-center gap-2 py-3 sm:py-2.5 bg-[var(--bg)] text-[var(--text)] rounded-lg font-medium hover:bg-[var(--border)] active:scale-[0.98] text-sm"><FileDown size={16} />Export CSV</a>
          <a href="/api/admin/export/json" download className="flex items-center justify-center gap-2 py-3 sm:py-2.5 bg-[var(--bg)] text-[var(--text)] rounded-lg font-medium hover:bg-[var(--border)] active:scale-[0.98] text-sm"><FileDown size={16} />Export JSON</a>
        </div>
        <div className="border-t border-[var(--border)] pt-4">
          <h4 className="text-sm font-medium text-[var(--text)] mb-3">Database Backup</h4>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <a href="/api/admin/backup" download className="flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 bg-[var(--ice-blue)] text-white rounded-lg font-medium hover:bg-[#4a9bd9] active:scale-[0.98] text-sm"><Download size={16} />Download Backup</a>
            <label className="flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 active:scale-[0.98] text-sm cursor-pointer">
              <Upload size={16} />Restore Backup
              <input type="file" accept=".db" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return;
                if (!confirm("This will REPLACE all current data. Are you sure?")) return;
                try { const res = await restoreBackup(file); setSaveMsg({ type: "ok", text: res.message }); }
                catch { setSaveMsg({ type: "err", text: "Failed to restore." }); }
                e.target.value = "";
              }} />
            </label>
          </div>
        </div>
      </section>

      {/* Software Update */}
      <section className={sectionCls}>
        <h3 className="text-base sm:text-lg font-semibold mb-2">Software Update</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">Pull latest from GitHub, rebuild, and restart.</p>
        <button onClick={handleUpdate} disabled={updating} className="w-full flex items-center justify-center gap-2 py-3 sm:py-2.5 bg-[var(--navy)] text-white rounded-lg font-medium hover:bg-[#243556] disabled:opacity-50 active:scale-[0.98]">
          {updating ? <><RefreshCw size={16} className="animate-spin" />Updating...</> : <><Download size={16} />Check for Updates</>}
        </button>
        {(updateLog || updateDone) && (
          <div className="mt-4">
            <div ref={logRef} className="bg-gray-900 text-gray-100 text-xs font-mono rounded-lg p-3 sm:p-4 max-h-64 overflow-y-auto whitespace-pre-wrap">{updateLog || "Waiting..."}</div>
            {updateDone && <div className={`mt-3 px-3 py-2.5 rounded-lg text-sm font-medium ${updateDone === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{updateDone === "success" ? "Update complete. App will reload shortly." : "Update failed. Check log above."}</div>}
          </div>
        )}
      </section>
    </div>
  );
}

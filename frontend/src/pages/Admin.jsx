import { useState, useEffect, useRef } from "react";
import {
  getConfig,
  updateConfig,
  triggerUpdate,
  getUpdateStatus,
  restartService,
} from "../api/client";
import { RefreshCw, Save, RotateCcw, Download } from "lucide-react";

const FIELD_META = {
  NIIMBOT_MAC: { label: "Printer Bluetooth MAC", placeholder: "AA:BB:CC:DD:EE:FF" },
  AUTO_PRINT: { label: "Auto-print labels on add", type: "toggle" },
  UPC_ITEM_DB_KEY: { label: "UPC Item DB API Key", placeholder: "Optional" },
  BARCODE_CACHE_TTL_SECONDS: { label: "Barcode cache TTL (seconds)", type: "number" },
  ALERT_DAYS_FROZEN: { label: "Alert after days frozen", type: "number" },
  LOW_STOCK_THRESHOLD: { label: "Low stock alert threshold", type: "number" },
};

export default function Admin() {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updateLog, setUpdateLog] = useState("");
  const [updateDone, setUpdateDone] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    getConfig().then((data) => {
      setConfig(data);
      setForm(data.settings);
    });
  }, []);

  useEffect(() => {
    if (!updating) return;
    const id = setInterval(async () => {
      try {
        const status = await getUpdateStatus();
        setUpdateLog(status.log || "");
        if (logRef.current) {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }
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
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await updateConfig(form);
      if (res.updated.length > 0) {
        setSaveMsg({
          type: "ok",
          text: `Updated: ${res.updated.join(", ")}. ${res.restart_required ? "Restart required." : ""}`,
        });
      } else {
        setSaveMsg({ type: "ok", text: "No changes to save." });
      }
    } catch {
      setSaveMsg({ type: "err", text: "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!confirm("This will update FreezerTrack to the latest version. The app will restart. Continue?"))
      return;
    setUpdating(true);
    setUpdateLog("");
    setUpdateDone(null);
    try {
      await triggerUpdate();
    } catch (e) {
      if (e.response?.status === 409) {
        setUpdateLog("Update already in progress...\n");
      } else {
        setUpdating(false);
        setUpdateDone("failed");
      }
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await restartService();
      setSaveMsg({ type: "ok", text: "Service restarted." });
    } catch {
      setSaveMsg({ type: "err", text: "Failed to restart service." });
    } finally {
      setRestarting(false);
    }
  };

  const set = (key) => (e) => {
    const val = e.target.type === "checkbox" ? String(e.target.checked) : e.target.value;
    setForm((f) => ({ ...f, [key]: val }));
  };

  if (!config) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-gray-400">
        Loading settings...
      </div>
    );
  }

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none bg-white";

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Admin</h2>

      {/* Configuration */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
        <h3 className="text-base sm:text-lg font-semibold mb-4">Configuration</h3>

        <div className="space-y-4">
          {Object.entries(FIELD_META).map(([key, meta]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {meta.label}
              </label>
              {meta.type === "toggle" ? (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[key] === "true" || form[key] === "True"}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: String(e.target.checked) }))
                    }
                    className="w-5 h-5 sm:w-4 sm:h-4 rounded text-[var(--ice-blue)] focus:ring-[var(--ice-blue)]"
                  />
                  <span className="text-sm text-gray-600">
                    {form[key] === "true" || form[key] === "True"
                      ? "Enabled"
                      : "Disabled"}
                  </span>
                </label>
              ) : (
                <input
                  type={meta.type === "number" ? "number" : "text"}
                  value={form[key] || ""}
                  onChange={set(key)}
                  placeholder={meta.placeholder || ""}
                  className={inputCls}
                />
              )}
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Database URL
            </label>
            <input
              type="text"
              value={config.readonly.DATABASE_URL}
              disabled
              className={`${inputCls} bg-gray-50 text-gray-400 cursor-not-allowed`}
            />
          </div>
        </div>

        {saveMsg && (
          <div
            className={`mt-4 px-3 py-2.5 rounded-lg text-sm font-medium ${
              saveMsg.type === "ok"
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {saveMsg.text}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 bg-[var(--ice-blue)] text-white rounded-lg font-medium hover:bg-[#4a9bd9] disabled:opacity-50 active:scale-[0.98]"
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save Settings"}
          </button>
          <button
            onClick={handleRestart}
            disabled={restarting}
            className="flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50 active:scale-[0.98]"
          >
            <RotateCcw size={16} />
            {restarting ? "Restarting..." : "Restart Service"}
          </button>
        </div>
      </section>

      {/* Software Update */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold mb-2">Software Update</h3>
        <p className="text-sm text-gray-500 mb-4">
          Pull the latest version from GitHub, rebuild the frontend, update
          dependencies, and restart the service.
        </p>

        <button
          onClick={handleUpdate}
          disabled={updating}
          className="w-full flex items-center justify-center gap-2 py-3 sm:py-2.5 bg-[var(--navy)] text-white rounded-lg font-medium hover:bg-[#243556] disabled:opacity-50 active:scale-[0.98]"
        >
          {updating ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              Updating...
            </>
          ) : (
            <>
              <Download size={16} />
              Check for Updates
            </>
          )}
        </button>

        {(updateLog || updateDone) && (
          <div className="mt-4">
            <div
              ref={logRef}
              className="bg-gray-900 text-gray-100 text-xs font-mono rounded-lg p-3 sm:p-4 max-h-64 overflow-y-auto whitespace-pre-wrap"
            >
              {updateLog || "Waiting for output..."}
            </div>
            {updateDone && (
              <div
                className={`mt-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                  updateDone === "success"
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {updateDone === "success"
                  ? "Update completed successfully. The app will reload shortly."
                  : "Update failed. Check the log above for details."}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

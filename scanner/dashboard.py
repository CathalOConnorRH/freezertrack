#!/usr/bin/env python3
"""
FreezerTrack Scanner Dashboard

Lightweight web dashboard showing scanner status. Reads shared state
from the scanner process via a JSON file.

Runs on port 8888 by default.
"""

import html
import json
import os
import socket
from http.server import HTTPServer, SimpleHTTPRequestHandler

STATE_FILE = os.environ.get(
    "SCANNER_STATE_FILE", "/opt/freezertrack-scanner/state.json"
)
PORT = int(os.environ.get("SCANNER_DASHBOARD_PORT", "8888"))


def read_state() -> dict:
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {
            "api_connected": False,
            "usb_connected": False,
            "scanner_device": None,
            "api_url": None,
            "mode": "out",
            "last_scan": None,
            "last_scan_time": None,
            "last_scan_result": None,
            "total_scans": 0,
            "successful_scans": 0,
            "failed_scans": 0,
            "uptime_since": None,
            "scan_history": [],
        }


DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#1b2a4a">
<title>FreezerTrack Scanner</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --ice: #5DADE2; --navy: #1b2a4a; --green: #22c55e; --red: #ef4444; --amber: #f59e0b; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; background: #0f172a; color: #f1f5f9; min-height: 100vh; padding: 1rem; }
  .container { max-width: 600px; margin: 0 auto; }
  h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; text-align: center; }
  h1 span { color: var(--ice); }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 0.75rem; }
  .card h2 { font-size: 0.875rem; font-weight: 600; color: #94a3b8; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .status-row { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; }
  .status-row:not(:last-child) { border-bottom: 1px solid #293548; }
  .status-label { font-size: 0.875rem; color: #94a3b8; }
  .status-value { font-size: 0.875rem; font-weight: 600; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .dot.green { background: var(--green); box-shadow: 0 0 8px rgba(34,197,94,0.4); }
  .dot.red { background: var(--red); box-shadow: 0 0 8px rgba(239,68,68,0.4); }
  .dot.amber { background: var(--amber); }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 0.75rem; }
  .stat { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1rem; text-align: center; }
  .stat .num { font-size: 2rem; font-weight: 700; color: var(--ice); }
  .stat .label { font-size: 0.7rem; color: #94a3b8; margin-top: 0.25rem; }
  .history { max-height: 300px; overflow-y: auto; }
  .history-item { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #293548; font-size: 0.8rem; }
  .history-item .barcode { color: #f1f5f9; font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 0.5rem; }
  .history-item .time { color: #64748b; font-size: 0.75rem; white-space: nowrap; }
  .badge { font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
  .badge.ok { background: rgba(34,197,94,0.15); color: var(--green); }
  .badge.fail { background: rgba(239,68,68,0.15); color: var(--red); }
  .mode-toggle { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
  .mode-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem; border: 2px solid #334155; border-radius: 12px; background: #1e293b; color: #94a3b8; font-family: inherit; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .mode-btn:active { transform: scale(0.97); }
  .mode-btn.active-in { background: var(--green); color: #fff; border-color: var(--green); }
  .mode-btn.active-out { background: var(--ice); color: #fff; border-color: var(--ice); }
  .mode-btn svg { width: 18px; height: 18px; }
  .refresh-note { text-align: center; color: #475569; font-size: 0.75rem; margin-top: 1rem; }
</style>
</head>
<body>
<div class="container">
  <h1><span>FreezerTrack</span> Scanner</h1>

  <div class="stats" id="stats">
    <div class="stat"><div class="num" id="total">-</div><div class="label">Total Scans</div></div>
    <div class="stat"><div class="num" id="success" style="color:#22c55e">-</div><div class="label">Successful</div></div>
    <div class="stat"><div class="num" id="failed" style="color:#ef4444">-</div><div class="label">Failed</div></div>
  </div>

  <div class="mode-toggle">
    <button class="mode-btn" id="btn-in" onclick="setMode('in')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
      Scan In
    </button>
    <button class="mode-btn" id="btn-out" onclick="setMode('out')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      Scan Out
    </button>
  </div>

  <div class="card">
    <h2>Connection Status</h2>
    <div class="status-row">
      <span class="status-label">FreezerTrack API</span>
      <span class="status-value" id="api-status">Checking...</span>
    </div>
    <div class="status-row">
      <span class="status-label">USB Scanner</span>
      <span class="status-value" id="usb-status">Checking...</span>
    </div>
    <div class="status-row">
      <span class="status-label">Mode</span>
      <span class="status-value" id="mode">-</span>
    </div>
    <div class="status-row">
      <span class="status-label">Running Since</span>
      <span class="status-value" id="uptime">-</span>
    </div>
  </div>

  <div class="card">
    <h2>Last Scan</h2>
    <div class="status-row">
      <span class="status-label">Barcode</span>
      <span class="status-value" id="last-barcode" style="color:var(--ice)">None</span>
    </div>
    <div class="status-row">
      <span class="status-label">Result</span>
      <span class="status-value" id="last-result">-</span>
    </div>
    <div class="status-row">
      <span class="status-label">Time</span>
      <span class="status-value" id="last-time">-</span>
    </div>
  </div>

  <div class="card">
    <h2>Scan History</h2>
    <div class="history" id="history">
      <p style="color:#475569;font-size:0.8rem;text-align:center;padding:1rem">No scans yet</p>
    </div>
  </div>

  <p class="refresh-note">Auto-refreshes every 3 seconds</p>
</div>

<script>
let apiUrl = '';

function statusDot(ok) {
  return `<span class="dot ${ok ? 'green' : 'red'}"></span>${ok ? 'Connected' : 'Disconnected'}`;
}

function relTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  return d.toLocaleTimeString();
}

function updateModeButtons(mode) {
  const btnIn = document.getElementById('btn-in');
  const btnOut = document.getElementById('btn-out');
  btnIn.className = 'mode-btn' + (mode === 'in' ? ' active-in' : '');
  btnOut.className = 'mode-btn' + (mode === 'out' ? ' active-out' : '');
  document.getElementById('mode').textContent = 'Scan ' + (mode || 'out').charAt(0).toUpperCase() + (mode || 'out').slice(1);
}

async function setMode(m) {
  updateModeButtons(m);
  if (!apiUrl) return;
  try {
    await fetch(apiUrl.replace(/\\/$/, '') + '/api/scanner/mode', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: m })
    });
  } catch {}
}

async function fetchMode() {
  if (!apiUrl) return;
  try {
    const r = await fetch(apiUrl.replace(/\\/$/, '') + '/api/scanner/mode');
    if (r.ok) {
      const d = await r.json();
      updateModeButtons(d.mode);
    }
  } catch {}
}

async function refresh() {
  try {
    const r = await fetch('/api/status');
    const s = await r.json();

    if (s.api_url && !apiUrl) {
      apiUrl = s.api_url;
      fetchMode();
    }

    document.getElementById('total').textContent = s.total_scans;
    document.getElementById('success').textContent = s.successful_scans;
    document.getElementById('failed').textContent = s.failed_scans;
    document.getElementById('api-status').innerHTML = statusDot(s.api_connected);
    document.getElementById('usb-status').innerHTML = statusDot(s.usb_connected);
    document.getElementById('uptime').textContent = s.uptime_since ? new Date(s.uptime_since).toLocaleString() : '-';
    const lb = s.last_scan ? (s.last_scan.length > 30 ? s.last_scan.slice(0,30)+'...' : s.last_scan) : 'None';
    document.getElementById('last-barcode').textContent = lb;
    document.getElementById('last-result').innerHTML = s.last_scan_result === 'ok'
      ? '<span class="badge ok">OK</span>'
      : s.last_scan_result === 'fail'
      ? '<span class="badge fail">Failed</span>'
      : '-';
    document.getElementById('last-time').textContent = relTime(s.last_scan_time);

    const hist = s.scan_history || [];
    if (hist.length > 0) {
      document.getElementById('history').innerHTML = hist.map(h => {
        const bc = document.createElement('span');
        bc.textContent = h.barcode.length > 25 ? h.barcode.slice(0,25)+'...' : h.barcode;
        const safe = bc.textContent;
        return `<div class="history-item">
          <span class="barcode">${safe}</span>
          <span class="badge ${h.success ? 'ok' : 'fail'}">${h.success ? 'OK' : 'FAIL'}</span>
          <span class="time">${relTime(h.time)}</span>
        </div>`;
      }).join('');
    }
  } catch {}
}

refresh();
setInterval(refresh, 3000);
setInterval(fetchMode, 5000);
</script>
</body>
</html>"""


class DashboardHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/status":
            state = read_state()
            body = json.dumps(state).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", len(body))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/" or self.path == "/index.html":
            body = DASHBOARD_HTML.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", len(body))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        pass


def main():
    hostname = socket.gethostname()
    ip = socket.gethostbyname(hostname)
    server = HTTPServer(("0.0.0.0", PORT), DashboardHandler)
    print(f"Scanner dashboard running on http://{ip}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

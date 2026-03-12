#!/usr/bin/env bash
# FreezerTrack Scanner Service Installer
# Installs the barcode scanner daemon on any Debian/Ubuntu system.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/CathalOConnorRH/freezertrack/main/scanner/install.sh | sudo bash

set -euo pipefail

INSTALL_DIR="/opt/freezertrack-scanner"
REPO_URL="https://raw.githubusercontent.com/CathalOConnorRH/freezertrack/main/scanner"

info()  { echo -e "\e[1;34m[INFO]\e[0m  $*"; }
ok()    { echo -e "\e[1;32m[OK]\e[0m    $*"; }
err()   { echo -e "\e[1;31m[ERROR]\e[0m $*" >&2; }

[[ "$(id -u)" -eq 0 ]] || { err "Run with sudo."; exit 1; }

# ── Install system deps ─────────────────────────────────────────────────────

info "Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv curl >/dev/null
ok "Dependencies installed"

# ── Download scanner files ───────────────────────────────────────────────────

mkdir -p "${INSTALL_DIR}"

info "Downloading scanner..."
curl -fsSL "${REPO_URL}/scanner.py" -o "${INSTALL_DIR}/scanner.py"
curl -fsSL "${REPO_URL}/dashboard.py" -o "${INSTALL_DIR}/dashboard.py"
curl -fsSL "${REPO_URL}/requirements.txt" -o "${INSTALL_DIR}/requirements.txt"
chmod +x "${INSTALL_DIR}/scanner.py" "${INSTALL_DIR}/dashboard.py"
ok "Scanner downloaded"

# ── Python venv ──────────────────────────────────────────────────────────────

info "Setting up Python environment..."
python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip -q
"${INSTALL_DIR}/venv/bin/pip" install -r "${INSTALL_DIR}/requirements.txt" -q
ok "Python environment ready"

# ── Configure ────────────────────────────────────────────────────────────────

CONFIG="${INSTALL_DIR}/config.env"

if [[ ! -f "${CONFIG}" ]]; then
  echo ""
  read -rp "FreezerTrack server URL (e.g. http://192.168.1.100): " API_URL
  API_URL="${API_URL:-http://localhost}"

  echo ""
  info "Detecting scanner devices..."
  "${INSTALL_DIR}/venv/bin/python3" "${INSTALL_DIR}/scanner.py" --list-devices 2>/dev/null || true
  echo ""
  read -rp "Scanner device path (leave blank for auto-detect): " DEVICE_PATH

  cat <<EOF >"${CONFIG}"
FREEZERTRACK_API_URL=${API_URL}
SCANNER_DEVICE=${DEVICE_PATH}
SCANNER_MODE=out
EOF
  ok "Configuration saved to ${CONFIG}"
else
  ok "Configuration already exists: ${CONFIG}"
fi

# ── Systemd service ──────────────────────────────────────────────────────────

info "Creating systemd service..."
cat <<SERVICE >/etc/systemd/system/freezertrack-scanner.service
[Unit]
Description=FreezerTrack Barcode Scanner
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=5
User=root
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/config.env
Environment=SCANNER_STATE_FILE=${INSTALL_DIR}/state.json
ExecStart=${INSTALL_DIR}/venv/bin/python3 ${INSTALL_DIR}/scanner.py

[Install]
WantedBy=multi-user.target
SERVICE

cat <<SERVICE >/etc/systemd/system/freezertrack-scanner-dashboard.service
[Unit]
Description=FreezerTrack Scanner Dashboard
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=5
User=root
WorkingDirectory=${INSTALL_DIR}
Environment=SCANNER_STATE_FILE=${INSTALL_DIR}/state.json
Environment=SCANNER_DASHBOARD_PORT=8888
ExecStart=${INSTALL_DIR}/venv/bin/python3 ${INSTALL_DIR}/dashboard.py

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable freezertrack-scanner freezertrack-scanner-dashboard
systemctl restart freezertrack-scanner freezertrack-scanner-dashboard
ok "Services created and started"

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "\e[1;32m════════════════════════════════════════════════════\e[0m"
echo -e "\e[1;32m  FreezerTrack Scanner installed!\e[0m"
echo -e "\e[1;32m════════════════════════════════════════════════════\e[0m"
echo ""
LOCAL_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost')"
echo -e "  Dashboard: \e[1;36mhttp://${LOCAL_IP}:8888\e[0m"
echo -e "  Config:    ${CONFIG}"
echo -e "  Scanner:   systemctl status freezertrack-scanner"
echo -e "  Dashboard: systemctl status freezertrack-scanner-dashboard"
echo -e "  Logs:      journalctl -u freezertrack-scanner -f"
echo ""
echo -e "  To change settings:"
echo -e "    nano ${CONFIG}"
echo -e "    systemctl restart freezertrack-scanner"
echo ""

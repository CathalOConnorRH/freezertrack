#!/usr/bin/env bash
# FreezerTrack standalone installer
# Works on any Debian/Ubuntu system (amd64 or arm64), including Raspberry Pi.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/CathalOConnorRH/freezertrack/main/install.sh | sudo bash

set -euo pipefail

APP="FreezerTrack"
INSTALL_DIR="/opt/freezertrack"
WEB_DIR="/var/www/freezertrack"
REPO_URL="https://github.com/CathalOConnorRH/freezertrack.git"

# ── Helpers ──────────────────────────────────────────────────────────────────

info()  { echo -e "\e[1;34m[INFO]\e[0m  $*"; }
ok()    { echo -e "\e[1;32m[OK]\e[0m    $*"; }
err()   { echo -e "\e[1;31m[ERROR]\e[0m $*" >&2; }

fail() { err "$*"; exit 1; }

# ── Preflight ────────────────────────────────────────────────────────────────

[[ "$(id -u)" -eq 0 ]] || fail "This script must be run as root (use sudo)."

ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)"
info "Detected architecture: ${ARCH}"

if ! command -v apt-get &>/dev/null; then
  fail "This installer requires a Debian-based system (apt-get not found)."
fi

# ── System packages ──────────────────────────────────────────────────────────

info "Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq \
  curl \
  git \
  build-essential \
  python3 \
  python3-pip \
  python3-venv \
  python3-dev \
  nginx \
  openssl \
  libbluetooth-dev \
  libglib2.0-dev \
  libffi-dev \
  ca-certificates \
  gnupg >/dev/null
ok "System dependencies installed"

# ── Node.js 22 ───────────────────────────────────────────────────────────────

if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
  info "Installing Node.js 22..."
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
  ok "Node.js $(node -v) installed"
else
  ok "Node.js $(node -v) already present"
fi

# ── Clone / update repo ─────────────────────────────────────────────────────

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  info "Updating existing installation..."
  git -C "${INSTALL_DIR}" pull --ff-only
  ok "Repository updated"
else
  info "Cloning FreezerTrack..."
  git clone "${REPO_URL}" "${INSTALL_DIR}"
  ok "Repository cloned"
fi

# ── Python backend ───────────────────────────────────────────────────────────

info "Setting up Python backend..."
cd "${INSTALL_DIR}/backend"
python3 -m venv "${INSTALL_DIR}/backend/venv"
"${INSTALL_DIR}/backend/venv/bin/pip" install --upgrade pip -q
"${INSTALL_DIR}/backend/venv/bin/pip" install -r "${INSTALL_DIR}/backend/requirements.txt" -q
ok "Python backend ready"

# ── Frontend build ───────────────────────────────────────────────────────────

info "Building frontend (this may take a few minutes on ARM)..."
cd "${INSTALL_DIR}/frontend"
npm ci --silent
npm run build --silent
mkdir -p "${WEB_DIR}"
rm -rf "${WEB_DIR:?}"/*
cp -r "${INSTALL_DIR}/frontend/dist"/* "${WEB_DIR}/"
ok "Frontend built"

# ── Environment ──────────────────────────────────────────────────────────────

mkdir -p "${INSTALL_DIR}/data/labels"

if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
  info "Generating environment file..."
  SECRET_KEY="$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 40)"
  cat <<EOF >"${INSTALL_DIR}/.env"
DATABASE_URL=sqlite:////${INSTALL_DIR}/data/freezer.db
NIIMBOT_MAC=AA:BB:CC:DD:EE:FF
AUTO_PRINT=false
UPC_ITEM_DB_KEY=
BARCODE_CACHE_TTL_SECONDS=86400
ALERT_DAYS_FROZEN=90
LOW_STOCK_THRESHOLD=5
SECRET_KEY=${SECRET_KEY}
EOF
  ok "Environment file created"
else
  ok "Environment file already exists, keeping it"
fi

# ── Database migrations ──────────────────────────────────────────────────────

info "Running database migrations..."
ln -sf "${INSTALL_DIR}/.env" "${INSTALL_DIR}/backend/.env"
cd "${INSTALL_DIR}/backend"
"${INSTALL_DIR}/backend/venv/bin/alembic" upgrade head
ok "Database ready"

# ── nginx ────────────────────────────────────────────────────────────────────

info "Configuring nginx..."
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
cat <<'NGINX' >/etc/nginx/sites-available/freezertrack
server {
    listen 80;
    root /var/www/freezertrack;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri /index.html;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/freezertrack /etc/nginx/sites-enabled/freezertrack
# Handle both sites-enabled and conf.d setups (some distros differ)
if [[ ! -d /etc/nginx/sites-available ]]; then
  cp /etc/nginx/sites-available/freezertrack /etc/nginx/conf.d/freezertrack.conf
fi
systemctl enable nginx
systemctl reload nginx
ok "nginx configured"

# ── systemd service ──────────────────────────────────────────────────────────

info "Creating systemd service..."
cat <<SERVICE >/etc/systemd/system/freezertrack.service
[Unit]
Description=FreezerTrack Backend
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=5
User=root
WorkingDirectory=${INSTALL_DIR}/backend
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=${INSTALL_DIR}/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
systemctl enable --now freezertrack
ok "Service created and started"

# ── Done ─────────────────────────────────────────────────────────────────────

LOCAL_IP="$(hostname -I | awk '{print $1}')"
echo ""
echo -e "\e[1;32m════════════════════════════════════════════════\e[0m"
echo -e "\e[1;32m  ${APP} installed successfully!\e[0m"
echo -e "\e[1;32m════════════════════════════════════════════════\e[0m"
echo ""
echo -e "  Access the app:  \e[1;36mhttp://${LOCAL_IP}\e[0m"
echo ""
echo -e "  Config file:     ${INSTALL_DIR}/.env"
echo -e "  Data directory:  ${INSTALL_DIR}/data/"
echo -e "  Service:         systemctl status freezertrack"
echo ""
echo -e "  To update later: curl -fsSL https://raw.githubusercontent.com/CathalOConnorRH/freezertrack/main/install.sh | sudo bash"
echo ""

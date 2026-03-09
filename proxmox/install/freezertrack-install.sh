#!/usr/bin/env bash
# Copyright (c) 2021-2026 community-scripts ORG
# Author: CathalOConnorRH
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/CathalOConnorRH/freezertrack

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
$STD apt-get install -y \
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
  libffi-dev
msg_ok "Installed Dependencies"

NODE_VERSION="22" setup_nodejs

REPO_URL="https://github.com/CathalOConnorRH/freezertrack.git"
msg_info "Cloning FreezerTrack"
$STD git clone "${REPO_URL}" /opt/freezertrack
msg_ok "Cloned FreezerTrack"

msg_info "Setting up Python backend"
cd /opt/freezertrack/backend
python3 -m venv /opt/freezertrack/backend/venv
$STD /opt/freezertrack/backend/venv/bin/pip install --upgrade pip
$STD /opt/freezertrack/backend/venv/bin/pip install -r /opt/freezertrack/backend/requirements.txt
msg_ok "Python backend ready"

msg_info "Building frontend"
cd /opt/freezertrack/frontend
$STD npm ci
$STD npm run build
mkdir -p /var/www/freezertrack
cp -r /opt/freezertrack/frontend/dist/* /var/www/freezertrack/
msg_ok "Frontend built"

msg_info "Configuring environment"
mkdir -p /opt/freezertrack/data/labels
SECRET_KEY="$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 40)"
cat <<EOF >/opt/freezertrack/.env
DATABASE_URL=sqlite:////opt/freezertrack/data/freezer.db
NIIMBOT_MAC=AA:BB:CC:DD:EE:FF
AUTO_PRINT=false
UPC_ITEM_DB_KEY=
BARCODE_CACHE_TTL_SECONDS=86400
ALERT_DAYS_FROZEN=90
LOW_STOCK_THRESHOLD=5
SECRET_KEY=${SECRET_KEY}
EOF
msg_ok "Environment configured"

msg_info "Running database migrations"
cd /opt/freezertrack/backend
/opt/freezertrack/backend/venv/bin/alembic upgrade head
msg_ok "Database ready"

msg_info "Configuring nginx"
rm -f /etc/nginx/sites-enabled/default
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
$STD systemctl reload nginx
msg_ok "nginx configured"

msg_info "Creating systemd service"
cat <<'SERVICE' >/etc/systemd/system/freezertrack.service
[Unit]
Description=FreezerTrack Backend
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=5
User=root
WorkingDirectory=/opt/freezertrack/backend
EnvironmentFile=/opt/freezertrack/.env
ExecStart=/opt/freezertrack/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

[Install]
WantedBy=multi-user.target
SERVICE
systemctl enable -q --now freezertrack
msg_ok "Service created and started"

motd_ssh
customize
cleanup_lxc

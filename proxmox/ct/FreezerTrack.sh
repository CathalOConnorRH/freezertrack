#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG
# Author: CathalOConnorRH
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/CathalOConnorRH/freezertrack

APP="FreezerTrack"
var_tags="${var_tags:-home-automation;inventory}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-2048}"
var_disk="${var_disk:-6}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -d /opt/freezertrack ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi

  msg_info "Pulling latest changes"
  git -C /opt/freezertrack pull --ff-only
  msg_ok "Pulled latest changes"

  msg_info "Updating Python dependencies"
  /opt/freezertrack/backend/venv/bin/pip install --upgrade -q -r /opt/freezertrack/backend/requirements.txt
  msg_ok "Updated Python dependencies"

  msg_info "Rebuilding frontend"
  cd /opt/freezertrack/frontend
  $STD npm ci
  $STD npm run build
  rm -rf /var/www/freezertrack/*
  cp -r /opt/freezertrack/frontend/dist/* /var/www/freezertrack/
  msg_ok "Rebuilt frontend"

  msg_info "Running database migrations"
  cd /opt/freezertrack/backend
  /opt/freezertrack/backend/venv/bin/alembic upgrade head
  msg_ok "Database migrations complete"

  msg_info "Restarting service"
  systemctl restart freezertrack
  msg_ok "Restarted service"

  msg_ok "Updated successfully!"
  exit
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access it using the following URL:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:80${CL}"

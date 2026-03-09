#!/usr/bin/env bash
# FreezerTrack — Proxmox LXC installer
# Author: CathalOConnorRH
# Source: https://github.com/CathalOConnorRH/freezertrack
#
# Usage (run on Proxmox host):
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/CathalOConnorRH/freezertrack/main/proxmox/ct/FreezerTrack.sh)"

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────

APP="FreezerTrack"
INSTALL_SCRIPT_URL="https://raw.githubusercontent.com/CathalOConnorRH/freezertrack/main/install.sh"

DEFAULT_CPU=2
DEFAULT_RAM=2048
DEFAULT_DISK=6
DEFAULT_STORAGE="local-lvm"
DEFAULT_BRIDGE="vmbr0"
TEMPLATE_OS="debian"
TEMPLATE_VERSION="12"

# ── Colors ───────────────────────────────────────────────────────────────────

GN="\e[1;32m"
YW="\e[1;33m"
BL="\e[1;34m"
RD="\e[1;31m"
CL="\e[0m"

info()  { echo -e "${BL}[INFO]${CL}  $*"; }
ok()    { echo -e "${GN}[OK]${CL}    $*"; }
warn()  { echo -e "${YW}[WARN]${CL}  $*"; }
err()   { echo -e "${RD}[ERROR]${CL} $*" >&2; }

# ── Preflight ────────────────────────────────────────────────────────────────

if ! command -v pct &>/dev/null; then
  err "This script must be run on a Proxmox VE host (pct not found)."
  exit 1
fi

echo -e "\n${GN}╔═══════════════════════════════════════╗${CL}"
echo -e "${GN}║         ${APP} LXC Installer         ║${CL}"
echo -e "${GN}╚═══════════════════════════════════════╝${CL}\n"

# ── Check for existing installation (update mode) ────────────────────────────

read -rp "Enter container ID (CTID) to create or update [default: next available]: " INPUT_CTID

if [[ -n "${INPUT_CTID}" ]] && pct status "${INPUT_CTID}" &>/dev/null; then
  info "Container ${INPUT_CTID} exists. Checking for FreezerTrack installation..."
  if pct exec "${INPUT_CTID}" -- test -d /opt/freezertrack 2>/dev/null; then
    echo ""
    read -rp "FreezerTrack found in CT ${INPUT_CTID}. Update it? [y/N]: " DO_UPDATE
    if [[ "${DO_UPDATE,,}" == "y" ]]; then
      info "Updating FreezerTrack in CT ${INPUT_CTID}..."
      TMPFILE=$(mktemp)
      curl -fsSL "${INSTALL_SCRIPT_URL}" -o "${TMPFILE}"
      pct push "${INPUT_CTID}" "${TMPFILE}" /tmp/freezertrack-install.sh
      rm -f "${TMPFILE}"
      pct exec "${INPUT_CTID}" -- bash /tmp/freezertrack-install.sh
      ok "Update complete!"
      exit 0
    else
      info "Update cancelled."
      exit 0
    fi
  fi
fi

# ── Determine CTID ──────────────────────────────────────────────────────────

if [[ -n "${INPUT_CTID}" ]]; then
  CTID="${INPUT_CTID}"
else
  CTID=$(pvesh get /cluster/nextid)
  info "Using next available CTID: ${CTID}"
fi

# ── Gather settings ──────────────────────────────────────────────────────────

echo ""
info "Configure the LXC container (press Enter for defaults):"
echo ""

read -rp "  CPU cores [${DEFAULT_CPU}]: " CPU
CPU="${CPU:-${DEFAULT_CPU}}"

read -rp "  RAM in MB [${DEFAULT_RAM}]: " RAM
RAM="${RAM:-${DEFAULT_RAM}}"

read -rp "  Disk size in GB [${DEFAULT_DISK}]: " DISK
DISK="${DISK:-${DEFAULT_DISK}}"

read -rp "  Storage volume [${DEFAULT_STORAGE}]: " STORAGE
STORAGE="${STORAGE:-${DEFAULT_STORAGE}}"

read -rp "  Network bridge [${DEFAULT_BRIDGE}]: " BRIDGE
BRIDGE="${BRIDGE:-${DEFAULT_BRIDGE}}"

read -rp "  Hostname [freezertrack]: " HOSTNAME
HOSTNAME="${HOSTNAME:-freezertrack}"

# ── Download template ────────────────────────────────────────────────────────

ARCH="$(dpkg --print-architecture)"
info "Host architecture: ${ARCH}"

TEMPLATE_STORE="local"
AVAILABLE=$(pveam available --section system | grep "${TEMPLATE_OS}-${TEMPLATE_VERSION}" | grep "${ARCH}" | tail -1 | awk '{print $2}')

if [[ -z "${AVAILABLE}" ]]; then
  AVAILABLE=$(pveam available --section system | grep "${TEMPLATE_OS}-${TEMPLATE_VERSION}" | tail -1 | awk '{print $2}')
fi

if [[ -z "${AVAILABLE}" ]]; then
  err "Could not find a Debian ${TEMPLATE_VERSION} template. Available templates:"
  pveam available --section system | grep debian
  exit 1
fi

info "Template: ${AVAILABLE}"

if ! pveam list "${TEMPLATE_STORE}" | grep -q "${AVAILABLE}"; then
  info "Downloading template..."
  pveam download "${TEMPLATE_STORE}" "${AVAILABLE}"
fi
ok "Template ready"

# ── Create container ─────────────────────────────────────────────────────────

info "Creating LXC container ${CTID}..."

pct create "${CTID}" "${TEMPLATE_STORE}:vztmpl/${AVAILABLE}" \
  -hostname "${HOSTNAME}" \
  -cores "${CPU}" \
  -memory "${RAM}" \
  -rootfs "${STORAGE}:${DISK}" \
  -net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  -unprivileged 1 \
  -features "nesting=1,keyctl=1" \
  -onboot 1 \
  -tags "freezertrack"

ok "Container ${CTID} created"

# ── Start and install ────────────────────────────────────────────────────────

info "Starting container..."
pct start "${CTID}"
sleep 5

info "Waiting for network..."
for i in $(seq 1 30); do
  if pct exec "${CTID}" -- ping -c1 -W1 8.8.8.8 &>/dev/null; then
    break
  fi
  sleep 2
done

if ! pct exec "${CTID}" -- ping -c1 -W1 8.8.8.8 &>/dev/null; then
  err "Container has no network connectivity. Check your bridge (${BRIDGE}) and DHCP."
  exit 1
fi
ok "Network is up"

info "Preparing container..."
pct exec "${CTID}" -- bash -c "apt-get update -qq && apt-get install -y -qq curl >/dev/null 2>&1"
ok "Container ready"

info "Downloading install script..."
TMPFILE=$(mktemp)
curl -fsSL "${INSTALL_SCRIPT_URL}" -o "${TMPFILE}"
pct push "${CTID}" "${TMPFILE}" /tmp/freezertrack-install.sh
rm -f "${TMPFILE}"
ok "Install script loaded"

info "Running FreezerTrack installer inside container (this takes a few minutes)..."
pct exec "${CTID}" -- bash /tmp/freezertrack-install.sh

# ── Done ─────────────────────────────────────────────────────────────────────

CT_IP=$(pct exec "${CTID}" -- hostname -I 2>/dev/null | awk '{print $1}')

echo ""
echo -e "${GN}════════════════════════════════════════════════════${CL}"
echo -e "${GN}  ${APP} installed successfully!${CL}"
echo -e "${GN}════════════════════════════════════════════════════${CL}"
echo ""
echo -e "  Container ID:  ${YW}${CTID}${CL}"
echo -e "  Access the app: ${BL}http://${CT_IP}${CL}"
echo ""
echo -e "  To enter the container:  ${YW}pct enter ${CTID}${CL}"
echo -e "  Config file:             /opt/freezertrack/.env"
echo -e "  Service logs:            journalctl -u freezertrack"
echo ""
echo -e "  To update later, run this script again with CTID ${CTID}."
echo ""

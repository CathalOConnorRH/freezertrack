# FreezerTrack

A containerised freezer inventory tracker with QR label printing, barcode lookup, camera scanning, and Home Assistant integration. Designed to run on a Raspberry Pi 4.

Works with **Docker**, **Podman**, or as a native **Proxmox LXC** container.

## Quick Start

```bash
git clone https://github.com/yourname/freezertrack.git
cd freezertrack
cp .env.example .env
# Edit .env — fill in NIIMBOT_MAC and other settings
```

Then bring up the stack with whichever engine you have installed:

```bash
# Docker
docker compose up -d --build

# Podman
podman-compose up -d --build
```

Access the app at **http://raspberrypi.local:8080** from any device on your home network.

## Container Engine Notes

Both Docker and Podman are supported. The compose file uses `network_mode: host` and `cap_add` for Bluetooth access, which work in both engines.

| | Docker | Podman |
|---|--------|--------|
| Compose tool | `docker compose` (V2 plugin) | `podman-compose` (install via pip) |
| Bluetooth access | Works out of the box | Run rootful: `sudo podman-compose up -d --build` |
| D-Bus socket | Mounted automatically | Mounted via volume (`/var/run/dbus`) |

If using Podman rootless and Bluetooth fails, run with `sudo` or configure the BlueZ D-Bus policy to allow your user access.

## Proxmox LXC Install

Install FreezerTrack as a native LXC container on Proxmox VE (no Docker required). Works on both amd64 and arm64 hosts. Run this on your Proxmox host shell:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/CathalOConnorRH/freezertrack/main/proxmox/ct/FreezerTrack.sh)"
```

This uses the [community-scripts/ProxmoxVE](https://github.com/community-scripts/ProxmoxVE) framework to create a Debian 13 LXC with 2 CPU cores, 2 GB RAM, and 6 GB disk (all configurable during setup). Python, Node.js, and nginx are installed natively inside the container.

**Defaults**: 2 vCPU, 2048 MB RAM, 6 GB disk, Debian 13, unprivileged container.

To **update** an existing installation, run the same command again and select "Update".

## One-Time Pi Bluetooth Setup

Pair the Niimbot B1 label printer before first use:

```bash
sudo bluetoothctl
power on
scan on
# Wait for your B1 to appear, note the MAC address (AA:BB:CC:DD:EE:FF)
scan off
pair AA:BB:CC:DD:EE:FF
trust AA:BB:CC:DD:EE:FF
quit
```

Then set `NIIMBOT_MAC=AA:BB:CC:DD:EE:FF` in your `.env` file.

## Accessing the App

- **Local network**: http://raspberrypi.local:8080
- **Direct IP**: http://192.168.x.x:8080 (use your Pi's IP address)

## Home Assistant Setup

Add the following to your Home Assistant `configuration.yaml`:

```yaml
sensor:
  - platform: rest
    name: freezer_state
    resource: http://raspberrypi.local:8080/api/ha/state
    scan_interval: 300
    value_template: "{{ value_json.total_items }}"
    json_attributes:
      - items
      - alerts
      - oldest_item_days
```

See the full configuration reference in `freezertrack-build-instructions.md`.

## Enabling HTTPS for Mobile Camera

Camera scanning requires HTTPS on non-localhost origins. To enable:

```bash
bash scripts/gen-cert.sh
# Uncomment the HTTPS block in nginx/nginx.conf

# Docker
docker compose restart nginx

# Podman
podman-compose restart nginx
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:////app/data/freezer.db` | SQLite database path |
| `NIIMBOT_MAC` | `AA:BB:CC:DD:EE:FF` | Bluetooth MAC of Niimbot B1 |
| `AUTO_PRINT` | `true` | Auto-print label on item creation |
| `UPC_ITEM_DB_KEY` | *(empty)* | Optional UPC Item DB API key |
| `BARCODE_CACHE_TTL_SECONDS` | `86400` | Barcode lookup cache duration |
| `ALERT_DAYS_FROZEN` | `90` | Days before item flagged as old |
| `LOW_STOCK_THRESHOLD` | `5` | Alert when fewer items than this |
| `SECRET_KEY` | `changeme` | Application secret key |

## Running Tests

```bash
pip install -r backend/requirements.txt
pytest backend/ -v
```

## Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy, SQLite, Alembic
- **Frontend**: React 18, Vite, Tailwind CSS, React Router v6
- **Printer**: Niimbot B1 via Bluetooth (niimprint library)
- **Deploy**: Docker / Podman / Proxmox LXC, nginx, Raspberry Pi 4

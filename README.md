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

## Standalone Install (Raspberry Pi / any Debian system)

Install directly on a Raspberry Pi or any Debian/Ubuntu machine (arm64 or amd64). No Docker or Proxmox needed:

```bash
curl -fsSL https://raw.githubusercontent.com/CathalOConnorRH/freezertrack/main/install.sh | sudo bash
```

This installs Python 3, Node.js 22, and nginx natively, builds the frontend, and sets up a systemd service. Works on Raspberry Pi OS, Ubuntu, and Debian. Re-run the same command to update.

## Proxmox LXC Install

Install as an LXC container on a **Proxmox VE x86_64** host. Run this on your Proxmox host shell:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/CathalOConnorRH/freezertrack/main/proxmox/ct/FreezerTrack.sh)"
```

This uses the [community-scripts/ProxmoxVE](https://github.com/community-scripts/ProxmoxVE) framework to create a Debian 12 LXC with 2 CPU cores, 2 GB RAM, and 6 GB disk (all configurable during setup).

**Note**: The Proxmox LXC script requires an x86_64 Proxmox host. For ARM hosts (Pimox / Raspberry Pi), use the standalone installer above instead.

To **update** an existing LXC installation, run the same command again and select "Update".

## USB Barcode Scanner (NetumScan / any HID scanner)

Run a headless barcode scanner service on a separate Pi or machine near your freezer. Scans are sent to FreezerTrack over the network. Works with any USB HID barcode scanner (NetumScan, Tera, Inateck, etc.).

```bash
curl -fsSL https://raw.githubusercontent.com/CathalOConnorRH/freezertrack/main/scanner/install.sh | sudo bash
```

The installer will:
1. Ask for your FreezerTrack server URL (e.g. `http://192.168.1.100`)
2. List available input devices and let you pick the scanner (or auto-detect)
3. Install as a systemd service that starts on boot

Monitor scans: `journalctl -u freezertrack-scanner -f`

Change settings: `nano /opt/freezertrack-scanner/config.env && systemctl restart freezertrack-scanner`

The scanner host also runs a **status dashboard** on port 8888 showing connection status, scan history, and a Scan In / Scan Out mode toggle. Open `http://<scanner-ip>:8888` in a browser.

## Touchscreen Scanner Controller (ESPHome)

Control the USB scanner's mode (Scan In / Scan Out) from a [Waveshare ESP32-S3-Touch-LCD-2.1](https://www.waveshare.com/wiki/ESP32-S3-Touch-LCD-2.1) round touchscreen, connected to Home Assistant.

### Hardware

- Waveshare ESP32-S3-Touch-LCD-2.1 (480x480, ST7701S + CST820)
- USB barcode scanner connected to a separate Pi (existing scanner service)

### Setup

1. **Install ESPHome** (if not already):
   ```bash
   pip install esphome
   # or via Home Assistant add-on
   ```

2. **Configure secrets** — copy and fill in `esphome/secrets.yaml`:
   ```bash
   cd esphome
   cp secrets.yaml.example secrets.yaml   # or just edit secrets.yaml directly
   nano secrets.yaml
   ```

3. **Flash the ESP32-S3**:
   ```bash
   # First flash via USB (hold BOOT, press RESET, release BOOT):
   esphome run freezertrack-scanner.yaml

   # Subsequent updates go over WiFi (OTA) automatically
   ```

4. **Adopt in Home Assistant** — once flashed and connected to WiFi, the device appears in HA under *Settings > Devices & Services > ESPHome*. Click "Configure" to adopt it.

5. **Connect the scanner service to HA** — generate a long-lived access token in your HA profile, then update the scanner config:
   ```bash
   # /opt/freezertrack-scanner/config.env
   HA_URL=http://homeassistant.local:8123
   HA_TOKEN=your_long_lived_access_token
   ```
   Restart the scanner: `sudo systemctl restart freezertrack-scanner`

### How It Works

- The touchscreen shows two buttons: **SCAN IN** (add to freezer) and **SCAN OUT** (remove from freezer).
- Tapping a button updates the scan mode via `PUT /api/scanner/mode` on the FreezerTrack API.
- The scanner service reads the current mode from the API before processing each barcode.
- The mode syncs across all clients: touchscreen, web dashboard, scanner dashboard (port 8888), and Home Assistant.
- After each scan, the result (e.g., "Added: Chicken Breast") is pushed back to the touchscreen display via HA.
- The touchscreen also has a **Settings** page (gear icon) with **Update** and **Restart** buttons for the FreezerTrack server.
- The display sleeps after 5 minutes of inactivity; touch to wake.

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

## API Endpoints

### Scanner Mode

The scan mode (in/out) is the single source of truth shared across all clients:

```bash
# Get current mode
curl https://freezer.local/api/scanner/mode

# Set mode
curl -X PUT https://freezer.local/api/scanner/mode \
  -H 'Content-Type: application/json' -d '{"mode": "in"}'
```

### Auto-Categorise

Assign categories to uncategorised items using keyword matching:

```bash
curl -X POST https://freezer.local/api/scanner/auto-categorise
```

### Manual Barcode Mapping

Save a barcode-to-product mapping so future scans resolve it:

```bash
curl -X POST https://freezer.local/api/food/barcode \
  -H 'Content-Type: application/json' \
  -d '{"barcode": "5054269866902", "name": "Fish Fingers", "brand": "Tesco"}'
```

The Add Item page also has a barcode field with USB scanner and camera support for this.

## Running Tests

```bash
pip install -r backend/requirements.txt
pytest backend/ -v
```

## Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy, SQLite, Alembic
- **Frontend**: React 18, Vite, Tailwind CSS, React Router v6
- **Printer**: Niimbot B1 via Bluetooth (niimprint library)
- **Scanner HMI**: ESPHome, LVGL, Waveshare ESP32-S3-Touch-LCD-2.1
- **Deploy**: Docker / Podman / Proxmox LXC, nginx, Raspberry Pi 4

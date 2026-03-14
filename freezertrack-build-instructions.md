# FreezerTrack — Full Build Instructions

> **Stack**: Python 3.12 · FastAPI · SQLite · SQLAlchemy · React · Vite · Tailwind · Docker · Niimbot B1 · Raspberry Pi 4
> **Purpose**: Containerised freezer inventory tracker with QR label printing, barcode lookup, camera scanning, and Home Assistant integration.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Environment & Configuration](#2-environment--configuration)
3. [Phase 1 — Backend Scaffold](#3-phase-1--backend-scaffold)
4. [Phase 2 — QR & Label Image Generation](#4-phase-2--qr--label-image-generation)
5. [Phase 2b — Barcode Lookup Service](#5-phase-2b--barcode-lookup-service)
6. [Phase 3 — Niimbot B1 Print Service](#6-phase-3--niimbot-b1-print-service)
7. [Phase 4 — Frontend](#7-phase-4--frontend)
8. [Phase 4b — Mobile Camera Scanning](#8-phase-4b--mobile-camera-scanning)
9. [Phase 5 — Home Assistant Integration](#9-phase-5--home-assistant-integration)
10. [Phase 6 — Docker & Pi Deploy](#10-phase-6--docker--pi-deploy)
11. [Phase 7 — End-to-End Testing](#11-phase-7--end-to-end-testing)
12. [Home Assistant Configuration Reference](#12-home-assistant-configuration-reference)
13. [One-Time Pi Setup](#13-one-time-pi-setup)

---

## 1. Project Structure

Create this directory layout before starting any phase:

```
freezertrack/
├── docker-compose.yml
├── .env
├── .env.example
├── README.md
├── scripts/
│   └── gen-cert.sh                  # optional self-signed HTTPS cert for camera
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── models/
│       │   └── food.py
│       ├── schemas/
│       │   └── food.py
│       ├── routers/
│       │   ├── food.py
│       │   ├── labels.py
│       │   └── homeassistant.py
│       ├── services/
│       │   ├── qr_service.py
│       │   ├── label_image.py
│       │   ├── print_service.py
│       │   ├── barcode_service.py
│       │   ├── ha_service.py
│       │   └── alert_service.py
│       └── tests/
│           ├── conftest.py
│           ├── test_food.py
│           ├── test_labels.py
│           ├── test_barcode.py
│           └── test_ha.py
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   ├── Scanner.jsx
│       │   ├── AddItem.jsx
│       │   └── Inventory.jsx
│       ├── components/
│       │   ├── FoodCard.jsx
│       │   ├── ScanInput.jsx
│       │   ├── CameraScanner.jsx
│       │   └── AlertBanner.jsx
│       └── api/
│           └── client.js
│
└── nginx/
    └── nginx.conf
```

---

## 2. Environment & Configuration

### `.env.example`

```env
# ── Database ──────────────────────────────────────────
DATABASE_URL=sqlite:////app/data/freezer.db

# ── Printer ───────────────────────────────────────────
NIIMBOT_MAC=AA:BB:CC:DD:EE:FF        # Bluetooth MAC of your Niimbot B1
AUTO_PRINT=true                       # auto-print label on item creation

# ── Barcode lookup ────────────────────────────────────
UPC_ITEM_DB_KEY=                      # optional – get free key at upcitemdb.com
BARCODE_CACHE_TTL_SECONDS=86400       # 24 hours

# ── Alerts ────────────────────────────────────────────
ALERT_DAYS_FROZEN=90                  # flag items older than this many days
LOW_STOCK_THRESHOLD=5                 # alert when fewer items than this

# ── App ───────────────────────────────────────────────
SECRET_KEY=changeme
```

Copy to `.env` and fill in your values before deploying.

---

## 3. Phase 1 — Backend Scaffold

### Prompt for Cursor / Claude Code

```
Scaffold a Python FastAPI backend in the `backend/` directory.

Requirements:

1. Use Python 3.12. All config is read from environment variables using a Pydantic
   BaseSettings class in `app/config.py`. Settings needed:
   - DATABASE_URL (str)
   - NIIMBOT_MAC (str)
   - AUTO_PRINT (bool, default True)
   - UPC_ITEM_DB_KEY (str, default "")
   - BARCODE_CACHE_TTL_SECONDS (int, default 86400)
   - ALERT_DAYS_FROZEN (int, default 90)
   - LOW_STOCK_THRESHOLD (int, default 5)
   - SECRET_KEY (str)

2. Set up SQLAlchemy with SQLite in `app/database.py`. The DB file path comes from
   DATABASE_URL. Create a `get_db` dependency that yields a session.

3. Set up Alembic for migrations.

4. Create a `FoodItem` SQLAlchemy model in `app/models/food.py` with these fields:
   - id: String primary key, default uuid4 as string
   - name: String, not null
   - frozen_date: Date, not null
   - quantity: Integer, not null, default 1
   - notes: String, nullable
   - removed_at: DateTime, nullable (null = currently in freezer)
   - qr_code_id: String, unique, not null (same as id, generated at creation)
   - created_at: DateTime, default utcnow

5. Create Pydantic v2 schemas in `app/schemas/food.py`:
   - FoodItemCreate: name, frozen_date, quantity, notes (optional), auto_print (bool, default True)
   - FoodItemUpdate: all fields optional
   - FoodItemResponse: all model fields, orm_mode enabled

6. Create router `app/routers/food.py` with these endpoints:
   - GET  /api/food              → list all items where removed_at IS NULL
   - GET  /api/food/history      → list all removed items
   - POST /api/food              → create item, generate qr_code_id = str(uuid4())
   - GET  /api/food/{id}         → get single item or 404
   - PATCH /api/food/{id}        → partial update
   - POST /api/food/{id}/remove  → set removed_at = utcnow()
   - DELETE /api/food/{id}       → hard delete

7. Mount the router in `app/main.py`. Add CORS middleware allowing all origins
   (for local network access from phones). Add a GET /health endpoint returning
   {"status": "ok"}.

8. Create `requirements.txt` with: fastapi, uvicorn[standard], sqlalchemy, alembic,
   pydantic-settings, httpx, qrcode[pil], Pillow, python-multipart, pytest,
   pytest-asyncio, httpx (for TestClient), niimprint.

9. Write pytest tests in `backend/app/tests/`:

   conftest.py:
   - Create an in-memory SQLite engine and override the get_db dependency
   - Provide a TestClient fixture

   test_food.py — test all 7 endpoints:
   - POST creates item with correct fields
   - GET /api/food only returns items where removed_at is null
   - GET /api/food/{id} returns 404 for missing item
   - POST /api/food/{id}/remove sets removed_at and item disappears from GET /api/food
   - PATCH updates only supplied fields
   - DELETE removes item

All tests must pass with `pytest backend/`.
```

---

## 4. Phase 2 — QR & Label Image Generation

### Prompt for Cursor / Claude Code

```
Add QR code generation and label image creation to the FreezerTrack backend.

Requirements:

1. Create `app/services/qr_service.py`:
   - Function `generate_qr_png(data: dict, output_path: str) -> str`
   - Encodes `data` as compact JSON into a QR code using the `qrcode` library
   - QR version auto, error correction L, box_size=6, border=2
   - Saves as PNG to `output_path`, returns the path
   - Function `decode_qr_string(raw: str) -> dict | None`
   - Attempts to parse raw string as JSON, returns dict or None

2. Create `app/services/label_image.py`:
   - Function `compose_label(item: FoodItemResponse, qr_path: str, output_path: str) -> str`
   - Canvas: 400×240px (50×30mm at 203dpi), white background
   - Left third (0–130px wide): QR code image, scaled to fit with 8px padding
   - Right section (140px–390px): text layout using Pillow ImageDraw
     - Line 1: item.name — bold, font size 22, truncated to 18 chars with ellipsis
     - Line 2: "Frozen: " + frozen_date formatted as "01 Mar 2025" — size 16
     - Line 3: "Qty: " + str(quantity) + " serving(s)" — size 16
     - Line 4 (small, bottom): item.id[:8] — size 11, grey #888888
   - Use PIL's default font (no external font files required)
   - Draw a thin vertical dividing line at x=135, colour #CCCCCC
   - Save as PNG to output_path, return the path
   - Store generated label PNGs in /app/data/labels/{item_id}.png

3. Create router `app/routers/labels.py`:
   - GET /api/labels/{id}/preview
     → generate label PNG if not cached, return as FileResponse (image/png)
   - POST /api/labels/{id}/print
     → generate label PNG, call print_service.print_label() (stubbed in this phase),
       return {"printed": true}

4. Wire labels router into main.py.

5. Add tests in `test_labels.py`:
   - Test that GET /api/labels/{id}/preview returns 200 with content-type image/png
   - Test that the QR decode round-trip works:
     encode {"id": "abc", "name": "Test"} → QR PNG → the raw JSON string decodes back correctly
   - Mock the print_service in the print endpoint test
```

---

## 5. Phase 2b — Barcode Lookup Service

### Prompt for Cursor / Claude Code

```
Add a retail barcode lookup service to the FreezerTrack backend.

Requirements:

1. Create `app/services/barcode_service.py`:

   - Async function `lookup_barcode(barcode: str, settings: Settings) -> dict | None`

   - Step 1 — check module-level cache dict:
     Cache structure: { barcode: {"result": dict|None, "cached_at": datetime} }
     If cached and age < BARCODE_CACHE_TTL_SECONDS, return cached result

   - Step 2 — query Open Food Facts (no API key needed):
     URL: https://world.openfoodfacts.org/api/v2/product/{barcode}.json
     Timeout: 5 seconds
     If response status 200 and json["status"] == 1:
       Extract product_name (or product_name_en as fallback) and brands
       Return {"name": ..., "brand": ..., "source": "open_food_facts", "found": True}

   - Step 3 — fallback to UPC Item DB if UPC_ITEM_DB_KEY is set:
     URL: https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}
     Header: Accept: application/json
     If items list not empty:
       Return {"name": items[0]["title"], "brand": items[0].get("brand",""), "source": "upc_item_db", "found": True}

   - Step 4 — both failed: cache {"found": False} and return it

   - Always store result in cache with current timestamp before returning

2. Add endpoint to `app/routers/food.py`:
   GET /api/food/lookup/{barcode}
   - Call lookup_barcode() with the barcode string
   - Return the result dict directly
   - IMPORTANT: register this route BEFORE /api/food/{id} to avoid routing conflict

3. Write tests in `test_barcode.py` using pytest-asyncio and respx (or unittest.mock):
   - Mock httpx to return a valid Open Food Facts response → assert name/brand returned
   - Mock OFF to return status 0, mock UPC Item DB to return a result → assert fallback works
   - Mock both to fail → assert {"found": False} returned
   - Call twice with same barcode after first succeeds → assert httpx called only once (cache hit)
```

---

## 6. Phase 3 — Niimbot B1 Print Service

### Prompt for Cursor / Claude Code

```
Add Niimbot B1 Bluetooth printing to the FreezerTrack backend.

Requirements:

1. Create `app/services/print_service.py`:

   - Function `print_label(image_path: str, mac_address: str) -> bool`
   - Opens the PNG at image_path using PIL Image.open()
   - Connects to Niimbot B1 using niimprint library:
     from niimprint import PrinterClient, BluetoothTransport
     transport = BluetoothTransport(mac_address)
     client = PrinterClient(transport)
     client.print_image(image, density=3)
   - Returns True on success, False on any exception (log the exception, don't raise)
   - Wrap the entire function in try/except so a missing printer never crashes the API

2. Update `app/routers/labels.py` POST /api/labels/{id}/print:
   - After generating the label PNG, call print_service.print_label(path, settings.NIIMBOT_MAC)
   - Return {"printed": True, "success": result}

3. Update `app/routers/food.py` POST /api/food:
   - After creating the item and generating the label PNG (via label_image.compose_label),
     if settings.AUTO_PRINT is True, call print_service.print_label()
   - The response should include a "printed" boolean field

4. In tests (conftest.py and test_food.py):
   - Patch print_service.print_label with a MagicMock returning True for all tests
   - Add a specific test that when AUTO_PRINT=True a new item creation calls print_label once
   - Add a test that print_label returning False does not cause the endpoint to return an error

5. Document in a comment at the top of print_service.py:
   One-time Pi setup required before printing works:
     bluetoothctl
     > scan on
     > pair AA:BB:CC:DD:EE:FF
     > trust AA:BB:CC:DD:EE:FF
     > quit
   Then set NIIMBOT_MAC=AA:BB:CC:DD:EE:FF in .env
```

---

## 7. Phase 4 — Frontend

### Prompt for Cursor / Claude Code

```
Build the FreezerTrack React frontend in the `frontend/` directory.

Tech: React 18, Vite, Tailwind CSS, React Router v6, Axios.

Design direction: Clean, utilitarian, mobile-first. Dark navy sidebar on desktop,
bottom tab bar on mobile. Use the font "DM Sans" from Google Fonts. Accent colour
is a cold ice-blue (#5DADE2). Status badges use amber for warnings, red for alerts,
green for fresh items. The overall feel is a well-designed kitchen utility app —
not corporate, not playful, just clear and functional.

Requirements:

── Setup ─────────────────────────────────────────────────────────────────────

1. package.json dependencies:
   react, react-dom, react-router-dom, axios, @zxing/browser, tailwindcss,
   autoprefixer, postcss, vite, @vitejs/plugin-react, lucide-react

2. vite.config.js:
   - proxy /api → http://localhost:8000 (for local dev without nginx)

3. `src/api/client.js`:
   - Axios instance with baseURL from import.meta.env.VITE_API_URL or "/api"
   - Export named functions: getItems(), getHistory(), createItem(data),
     removeItem(id), updateItem(id, data), deleteItem(id),
     lookupBarcode(barcode), printLabel(id), getHAState()

── Pages ─────────────────────────────────────────────────────────────────────

4. `src/pages/Dashboard.jsx`:
   - Top stat cards: total items in freezer, items added this week, items needing
     attention (frozen > ALERT threshold — fetch from /api/ha/state)
   - AlertBanner component below stats showing any active alerts
   - Grid of the 6 most recently added FoodCards
   - Refresh data every 60 seconds

5. `src/pages/Scanner.jsx`:
   - Tab switcher at top: "📷 Camera" | "⌨️ USB Scanner"
   - Auto-select Camera tab if navigator.maxTouchPoints > 0 (mobile), else USB tab
   - USB tab: renders <ScanInput onScan={handleScan} /> (invisible focused input)
   - Camera tab: renders <CameraScanner onScan={handleScan} /> (built in Phase 4b)
   - handleScan(rawString):
     1. Try JSON.parse(rawString) — if it has an `id` field, call removeItem(id),
        show success toast "✓ [name] removed from freezer"
     2. Otherwise treat as retail barcode: call lookupBarcode(rawString),
        navigate to /add with state { barcode: rawString, prefill: result }
   - Show last scan result below the input/viewfinder:
     success (green), not found (amber), error (red)

6. `src/pages/AddItem.jsx`:
   - Receives optional location state: { barcode, prefill: { name, brand } }
   - Form fields:
     - Name (text, required) — pre-filled from prefill.name if present
       Show "via Open Food Facts" badge if prefill.source === "open_food_facts"
     - Brand (text, optional) — pre-filled from prefill.brand
     - Frozen date (date, default today)
     - Quantity (number, min 1, default 1)
     - Notes (textarea, optional)
     - "Print label" checkbox (default checked, controlled by AUTO_PRINT env hint)
   - On submit: POST /api/food, then navigate to /inventory
   - Show a "Printing label..." spinner if print is in progress

7. `src/pages/Inventory.jsx`:
   - Fetch all items (GET /api/food) and history (GET /api/food/history)
   - Toggle between "In Freezer" and "History" tabs
   - Search bar filtering by name
   - Sort controls: Date frozen (default desc), Name (A–Z), Quantity
   - Each item shown as a FoodCard
   - In Freezer items: tap to open detail panel with Remove and Reprint buttons

── Components ────────────────────────────────────────────────────────────────

8. `src/components/FoodCard.jsx`:
   - Shows: name, frozen date as relative ("3 weeks ago"), quantity badge,
     and an age badge: green <30 days, amber 30–89 days, red ≥90 days
   - Compact card style, tap/click opens detail

9. `src/components/ScanInput.jsx`:
   - Renders a visually hidden <input> that is always focused on mount
   - Captures USB HID scanner input: scanner types fast (each keystroke < 50ms apart)
   - Accumulate keystrokes until Enter key, then call onScan(accumulated)
   - Re-focus after each scan
   - Shows a pulsing indicator dot to show it is listening

10. `src/components/AlertBanner.jsx`:
    - Accepts alerts array from /api/ha/state
    - old_item alerts: amber banner "⚠ [name] has been frozen for [N] days"
    - low_stock alert: red banner "🧊 Only [N] items left in freezer"
    - Dismissible per session (useState, not persisted)

── Navigation ────────────────────────────────────────────────────────────────

11. `src/App.jsx`:
    - React Router routes: / → Dashboard, /scan → Scanner, /add → AddItem,
      /inventory → Inventory
    - Desktop: fixed left sidebar (240px) with nav links and app name
    - Mobile (<768px): bottom tab bar with icons for the 4 pages
    - Use lucide-react icons: LayoutDashboard, ScanLine, PlusCircle, Archive
```

---

## 8. Phase 4b — Mobile Camera Scanning

### Prompt for Cursor / Claude Code

```
Add mobile camera scanning to the FreezerTrack frontend.

Requirements:

1. Install `@zxing/browser` (already in package.json from Phase 4).

2. Create `src/components/CameraScanner.jsx`:

   - Import BrowserMultiFormatReader from @zxing/browser
   - Props: onScan (callback receiving the decoded string)
   - On mount: create new BrowserMultiFormatReader(), call
     reader.decodeFromVideoDevice(undefined, videoRef.current, callback)
     where `undefined` selects the default (rear) camera
   - On unmount: call reader.reset() to release the camera
   - Render a <video> element (ref={videoRef}) styled to fill its container,
     with borderRadius 12px and a subtle ice-blue border (#5DADE2)
   - Overlay a targeting reticle (CSS-only, no images): a centred 200×200px box
     with corner accent lines (4 L-shaped corners, 2px wide, ice-blue colour,
     20px long) using absolute positioning and ::before/::after or divs
   - Handle three camera permission states:

     a. "prompt" — show a full-width button "Tap to enable camera"
        that calls navigator.mediaDevices.getUserMedia({video:true}) on click,
        then updates permissionState to "granted" or "denied" accordingly
        NOTE: getUserMedia must be triggered by a user gesture (tap), not on load

     b. "granted" — show the <video> viewfinder with targeting reticle

     c. "denied" — show a message:
        "Camera access was blocked. To re-enable:
        iOS: Settings → Safari → Camera → Allow
        Android: tap the lock icon in your browser's address bar"

   - Detect initial permission state on mount using:
     navigator.permissions?.query({ name: "camera" })
     Default to "prompt" if Permissions API not available (e.g. Safari)

   - After a successful scan, show a brief green flash overlay (200ms) before
     calling onScan, to give visual feedback on mobile

3. Update `src/pages/Scanner.jsx` to import and render CameraScanner in the
   Camera tab, passing the existing handleScan as the onScan prop.

4. Add a note as a comment at the top of CameraScanner.jsx:
   Camera scanning requires HTTPS except on localhost.
   On local network, either access via http://raspberrypi.local (works on most
   home networks) or enable HTTPS in nginx using the self-signed cert from
   scripts/gen-cert.sh
```

---

## 9. Phase 5 — Home Assistant Integration

### Prompt for Cursor / Claude Code

```
Add the Home Assistant integration endpoints to the FreezerTrack backend.

Requirements:

1. Create `app/services/alert_service.py`:

   - Function `get_alerts(items: list[FoodItem], settings: Settings) -> list[dict]`
   - For each item where removed_at is None:
     - Calculate days_frozen = (date.today() - item.frozen_date).days
     - If days_frozen >= settings.ALERT_DAYS_FROZEN:
       append {"type": "old_item", "id": item.id, "name": item.name,
               "frozen_date": str(item.frozen_date), "days_frozen": days_frozen}
   - Count active items (removed_at is None)
   - If count < settings.LOW_STOCK_THRESHOLD:
     append {"type": "low_stock", "current_count": count,
             "threshold": settings.LOW_STOCK_THRESHOLD}
   - Return the alerts list

2. Create `app/services/ha_service.py`:

   - Function `build_ha_state(items: list[FoodItem], settings: Settings) -> dict`
   - active_items = [i for i in items if i.removed_at is None]
   - oldest_days = max days_frozen across active items, or 0 if empty
   - Return:
     {
       "total_items": len(active_items),
       "oldest_item_days": oldest_days,
       "items": [
         {"id": i.id, "name": i.name, "brand": i.brand, "category": i.category,
          "frozen_date": str(i.frozen_date), "quantity": i.quantity,
          "days_frozen": days_frozen, "expiration_date": expiration_date,
          "notes": i.notes, "freezer_id": i.freezer_id}
         for i in active_items
       ],
       "alerts": get_alerts(active_items, settings)
     }
   - expiration_date is computed as frozen_date + shelf_life_days (or null if shelf_life_days is None)

3. Create `app/routers/homeassistant.py`:

   - GET /api/ha/state
     → fetch all items, call build_ha_state(), return result as JSON
   - GET /api/ha/alerts
     → fetch active items, call get_alerts(), return {"alerts": [...]}
   - POST /api/ha/scan-out/{item_id}
     → mark item as removed (same logic as /api/food/{id}/remove)
     → return {"success": true, "item_id": ..., "name": ..., "removed_at": ...}
     → 404 if item not found, 400 if already removed
     → add to shopping list if last item with that name

4. Register the HA router in main.py.

5. Write tests in `test_ha.py`:

   - Create 3 items: one fresh (7 days), one old (100 days), one removed
   - Assert /api/ha/state returns total_items=2 (removed one not counted)
   - Assert alerts contain one old_item entry for the 100-day item
   - Assert removed item does not appear in items list
   - Test low_stock: create only 2 items with LOW_STOCK_THRESHOLD=5,
     assert low_stock alert is present
   - Test boundary: item at exactly ALERT_DAYS_FROZEN days → should be included
   - Test item at ALERT_DAYS_FROZEN - 1 days → should NOT be in alerts
   - Test /api/ha/state returns brand, category, notes, expiration_date fields
   - Test POST /api/ha/scan-out/{id}: item is marked removed, disappears from state
   - Test POST /api/ha/scan-out/{id}: 404 for unknown id, 400 if already removed
   - Test POST /api/ha/scan-out/{id}: adds item to shopping list when last of its kind
```

---

## 10. Phase 6 — Docker & Pi Deploy

### Prompt for Cursor / Claude Code

```
Write all Docker and deployment configuration for FreezerTrack on Raspberry Pi 4.

Requirements:

── Backend Dockerfile (backend/Dockerfile) ──────────────────────────────────

FROM python:3.12-slim

RUN apt-get update && apt-get install -y \
    bluetooth bluez libbluetooth-dev \
    libglib2.0-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
RUN mkdir -p /app/data/labels

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

── Frontend Dockerfile (frontend/Dockerfile) ────────────────────────────────

Two-stage build:
Stage 1 (builder): node:20-slim, copy package.json, run npm ci, copy src, run npm run build
Stage 2: nginx:alpine, copy built /dist from stage 1 to /usr/share/nginx/html,
copy a simple nginx snippet to serve the SPA (try_files $uri /index.html)
Expose port 80.

── nginx/nginx.conf ─────────────────────────────────────────────────────────

events { worker_processes 1; }
http {
  server {
    listen 80;

    # IMPORTANT: Camera scanning requires HTTPS on non-localhost origins.
    # For local network use, either:
    #   a) Access via http://raspberrypi.local — works on most home networks
    #   b) Uncomment the HTTPS block below and run scripts/gen-cert.sh
    #
    # HTTPS block (uncomment to enable):
    # listen 443 ssl;
    # ssl_certificate /etc/nginx/certs/cert.pem;
    # ssl_certificate_key /etc/nginx/certs/key.pem;

    location /api/ {
      proxy_pass http://127.0.0.1:8000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
      proxy_pass http://127.0.0.1:3000;
      proxy_set_header Host $host;
    }
  }
}

── docker-compose.yml ───────────────────────────────────────────────────────

version: "3.9"
services:
  backend:
    build: ./backend
    restart: unless-stopped
    network_mode: host           # required for Bluetooth access on Pi
    privileged: true             # required for BlueZ Bluetooth stack
    volumes:
      - ./data:/app/data         # persists SQLite DB and label PNGs
    env_file: .env

  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - "3000:80"

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - backend
      - frontend

── scripts/gen-cert.sh ──────────────────────────────────────────────────────

Write a bash script that:
1. Creates nginx/certs/ directory
2. Runs openssl to generate a self-signed cert valid for 365 days,
   CN=raspberrypi.local, output cert.pem and key.pem into nginx/certs/
3. Prints instructions for trusting the cert on iOS and Android
4. Makes itself executable

── README.md ────────────────────────────────────────────────────────────────

Write a README.md with sections:
- Quick Start (clone, copy .env.example to .env, fill in NIIMBOT_MAC, docker compose up)
- One-time Pi Bluetooth setup (bluetoothctl pair commands)
- Accessing the app (http://raspberrypi.local)
- Home Assistant setup (link to section)
- Enabling HTTPS for mobile camera (scripts/gen-cert.sh)
- Environment variables reference
- Running tests (pytest backend/)
```

---

## 11. Phase 7 — End-to-End Testing

### Prompt for Cursor / Claude Code

```
Write end-to-end integration tests and a manual QA checklist for FreezerTrack.

Requirements:

1. Add `backend/app/tests/test_integration.py`:

   Test the full happy-path flow using TestClient:

   a. Create a home-cooked item via POST /api/food
      → assert 201, item in GET /api/food, printed=True (mocked)

   b. Get the label preview via GET /api/labels/{id}/preview
      → assert 200, content-type image/png

   c. Scan the item out via POST /api/food/{id}/remove
      → assert item no longer in GET /api/food
      → assert item appears in GET /api/food/history

   d. Scan a retail barcode via GET /api/food/lookup/5000159484695
      → mock Open Food Facts to return a product
      → assert name and brand returned

   e. Create item from retail barcode lookup result, assert it's in inventory

   f. Create 3 items with frozen_date = today - 100 days
      → assert GET /api/ha/alerts returns old_item alerts for all 3

   g. Remove enough items to go below LOW_STOCK_THRESHOLD
      → assert GET /api/ha/alerts returns a low_stock alert

2. Create `TESTING.md` with a manual QA checklist:

   ## Manual QA Checklist

   ### Desktop (USB Scanner)
   - [ ] Open http://raspberrypi.local, dashboard loads with item count
   - [ ] Navigate to Scanner page, USB tab active by default
   - [ ] Scan a new QR label → redirected to Add Item with fields blank
   - [ ] Fill in name, frozen date, qty → submit → label prints on B1
   - [ ] Navigate to Inventory → new item appears
   - [ ] Return to Scanner → scan same QR label → "removed" toast appears
   - [ ] Item moves to History tab in Inventory
   - [ ] Scan a retail product barcode → Add Item form pre-filled with name

   ### Mobile (Camera)
   - [ ] Open http://raspberrypi.local on phone
   - [ ] Navigate to Scanner → Camera tab auto-selected
   - [ ] Tap "Enable camera" → browser permission prompt appears
   - [ ] Grant permission → live viewfinder shown with targeting reticle
   - [ ] Point camera at QR label → green flash → correct action taken
   - [ ] Point camera at retail barcode → lookup fires, Add Item pre-filled
   - [ ] Deny camera permission → friendly message with re-enable instructions shown

   ### Home Assistant
   - [ ] Add sensor config to configuration.yaml, restart HA
   - [ ] sensor.freezer_state shows correct item count
   - [ ] Add item over 90 days old → HA alert fires within 5 minutes (next poll)
   - [ ] Remove items below threshold → low stock alert fires

   ### Printer
   - [ ] Niimbot B1 paired via bluetoothctl on Pi
   - [ ] Create item → label prints within 10 seconds
   - [ ] Label shows correct name, frozen date, quantity, and scannable QR code
   - [ ] Scan printed QR code with both USB scanner and phone camera → both decode correctly
```

---

## 12. Home Assistant Configuration Reference

Add this to `configuration.yaml` on your Home Assistant instance.
Replace `[PI_IP]` with your Pi's local IP address or `raspberrypi.local`.

```yaml
# ── Freezer Tracker ───────────────────────────────────────────────────────
sensor:
  - platform: rest
    name: freezer_state
    resource: http://[PI_IP]/api/ha/state
    scan_interval: 300           # poll every 5 minutes
    value_template: "{{ value_json.total_items }}"
    json_attributes:
      - items
      - alerts
      - oldest_item_days

template:
  - binary_sensor:
      - name: "Freezer Low Stock"
        state: >-
          {{ state_attr('sensor.freezer_state', 'alerts')
             | selectattr('type', 'eq', 'low_stock')
             | list | length > 0 }}

      - name: "Freezer Has Old Items"
        state: >-
          {{ state_attr('sensor.freezer_state', 'alerts')
             | selectattr('type', 'eq', 'old_item')
             | list | length > 0 }}

alert:
  freezer_low_stock:
    name: Freezer Low Stock
    entity_id: binary_sensor.freezer_low_stock
    state: "true"
    repeat: 1440                 # re-notify every 24 hours
    notifiers: notify.mobile_app

  freezer_old_items:
    name: Freezer Has Old Items
    entity_id: binary_sensor.freezer_has_old_items
    state: "true"
    repeat: 10080                # re-notify every 7 days
    notifiers: notify.mobile_app
```

### Item Data Available in Home Assistant

Each entry in `state_attr('sensor.freezer_state', 'items')` contains:

| Field | Description |
|-------|-------------|
| `id` | UUID of the item (used for scan-out) |
| `name` | Item name (e.g. "Chicken Curry") |
| `brand` | Brand name (or null) |
| `category` | Category (e.g. "Poultry", or null) |
| `frozen_date` | Date frozen (YYYY-MM-DD) |
| `quantity` | Number of servings |
| `days_frozen` | How many days the item has been in the freezer |
| `expiration_date` | Computed expiry date (YYYY-MM-DD, or null if no shelf life set) |
| `notes` | Free-text notes (or null) |
| `freezer_id` | ID of the freezer it belongs to (or null) |

### Scanning Items Out from Home Assistant

To remove (scan out) an item from the freezer using a Home Assistant automation or script,
call the REST endpoint with the item's `id`:

```yaml
# Example Home Assistant REST command configuration
rest_command:
  freezer_scan_out:
    url: "http://[PI_IP]/api/ha/scan-out/{{ item_id }}"
    method: POST
```

Use it in an automation or script:

```yaml
action:
  - service: rest_command.freezer_scan_out
    data:
      item_id: "{{ item_id }}"   # UUID of the item to remove
```

The endpoint returns:

```json
{
  "success": true,
  "item_id": "uuid-string",
  "name": "Chicken Curry",
  "removed_at": "2025-06-01T12:00:00+00:00"
}
```

If the scanned-out item was the last one of its kind, it is automatically added to the
shopping list so you remember to restock.

### Lovelace Dashboard Card

```yaml
type: entities
title: 🧊 Freezer
entities:
  - entity: sensor.freezer_state
    name: Items in Freezer
  - entity: binary_sensor.freezer_low_stock
    name: Low Stock Alert
  - entity: binary_sensor.freezer_has_old_items
    name: Old Items Alert
```

---

## 13. One-Time Pi Setup

These steps are run once on the Pi before deploying the containers.

### 1. Pair Niimbot B1 via Bluetooth

```bash
# On the Pi terminal:
sudo bluetoothctl

# Inside bluetoothctl:
power on
scan on
# Wait for your B1 to appear, note its MAC address (format AA:BB:CC:DD:EE:FF)
scan off
pair AA:BB:CC:DD:EE:FF
trust AA:BB:CC:DD:EE:FF
quit
```

Then set `NIIMBOT_MAC=AA:BB:CC:DD:EE:FF` in your `.env` file.

### 2. Install Docker on Pi

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### 3. Deploy

```bash
git clone https://github.com/yourname/freezertrack.git
cd freezertrack
cp .env.example .env
nano .env                    # fill in NIIMBOT_MAC and other settings
docker compose up -d --build
```

### 4. Access the app

- From any device on your home network: `http://raspberrypi.local`
- Or use the Pi's IP address: `http://192.168.x.x`

### 5. Enable HTTPS (required for camera on some devices)

```bash
bash scripts/gen-cert.sh
# Then uncomment the HTTPS block in nginx/nginx.conf
docker compose restart nginx
```

---

## Data Model Reference

```
FoodItem
────────
id            : UUID string, primary key
name          : string, required
frozen_date   : date, required
quantity      : int, default 1
notes         : string, optional
removed_at    : datetime, null = currently in freezer
qr_code_id    : string, unique (same as id)
created_at    : datetime, auto

QR Code Payload (JSON encoded into QR)
──────────────────────────────────────
{"id": "...", "name": "Chicken Curry", "frozen": "2025-03-01", "qty": 2}
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/food | All items in freezer |
| GET | /api/food/history | All removed items |
| POST | /api/food | Add item (+ auto-print) |
| GET | /api/food/{id} | Single item |
| PATCH | /api/food/{id} | Update item |
| POST | /api/food/{id}/remove | Scan-out |
| DELETE | /api/food/{id} | Hard delete |
| GET | /api/food/lookup/{barcode} | Retail barcode lookup |
| GET | /api/labels/{id}/preview | Label PNG preview |
| POST | /api/labels/{id}/print | Reprint label |
| GET | /api/ha/state | Full HA sensor payload |
| GET | /api/ha/alerts | Active alerts only |
| POST | /api/ha/scan-out/{id} | Scan item out via Home Assistant |
| GET | /health | Health check |

---

*End of FreezerTrack Build Instructions*

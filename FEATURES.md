# FreezerTrack — Missing Features & Implementation Guide

> Each feature below is self-contained and can be implemented independently.
> Implementation sections are written as detailed instructions for an LLM coding agent.

---

## Table of Contents

### High Priority
1. [Store Brand Field](#1-store-brand-field)
2. [Local Barcode-to-Name Cache](#2-local-barcode-to-name-cache)
3. [Quantity Decrement on Scan-Out](#3-quantity-decrement-on-scan-out)
4. [Batch / Group Tracking](#4-batch--group-tracking)
5. [Data Export (CSV & JSON)](#5-data-export-csv--json)
6. [Database Backup & Restore](#6-database-backup--restore)

### Medium Priority
7. [Categories & Tags](#7-categories--tags)
8. [Expiry / Use-By Estimation](#8-expiry--use-by-estimation)
9. [Shopping List](#9-shopping-list)
10. [Statistics & Charts Page](#10-statistics--charts-page)
11. [Photo Attachment](#11-photo-attachment)
12. [History Detail Panel & Re-Add](#12-history-detail-panel--re-add)
13. [PWA with Offline Support](#13-pwa-with-offline-support)

### Low Priority
14. [Dark Mode](#14-dark-mode)
15. [Multi-Freezer Support](#15-multi-freezer-support)
16. [User Authentication](#16-user-authentication)
17. [Multi-Language (i18n)](#17-multi-language-i18n)
18. [Printer Status Check](#18-printer-status-check)
19. [Label Template Customization](#19-label-template-customization)
20. [Notification Service](#20-notification-service)

---

## Current Architecture Reference

Before implementing any feature, understand the existing layout:

```
backend/app/
  config.py          — Pydantic BaseSettings (reads .env)
  database.py        — SQLAlchemy engine, SessionLocal, get_db, Base
  main.py            — FastAPI app, CORS, lifespan, router mounting
  models/food.py     — FoodItem SQLAlchemy model
  schemas/food.py    — FoodItemCreate, FoodItemUpdate, FoodItemResponse
  routers/food.py    — CRUD + search + barcode lookup
  routers/labels.py  — Label preview + print
  routers/homeassistant.py — HA state + alerts
  routers/admin.py   — Config editor, update trigger, restart
  services/          — qr_service, label_image, print_service, barcode_service,
                       alert_service, ha_service

frontend/src/
  api/client.js      — Axios API functions
  App.jsx            — Router, sidebar, bottom nav
  pages/             — Dashboard, Scanner, AddItem, Inventory, Admin
  components/        — FoodCard, ScanInput, CameraScanner, AlertBanner
```

**Data model** (FoodItem): `id`, `name`, `frozen_date`, `quantity`, `notes`, `removed_at`, `qr_code_id`, `created_at`

**Key conventions**: Pydantic v2 schemas with `ConfigDict(from_attributes=True)`, SQLAlchemy 2.0 `Mapped` columns, FastAPI dependency injection for DB sessions, Tailwind CSS with `var(--ice-blue)` accent.

---

## High Priority

---

### 1. Store Brand Field

**What**: The AddItem form collects a "Brand" field and barcode lookups return a brand, but the brand is never sent to the API or stored in the database. It is silently discarded.

**Why**: Users want to distinguish between "Heinz Baked Beans" and "Tesco Baked Beans" in their inventory.

**Implementation**:

**Model** — `backend/app/models/food.py`:
```python
brand: Mapped[str | None] = mapped_column(String, nullable=True)
```

**Alembic migration**:
```bash
cd backend && alembic revision --autogenerate -m "add brand column"
alembic upgrade head
```

**Schemas** — `backend/app/schemas/food.py`:
- Add `brand: str | None = None` to `FoodItemCreate`, `FoodItemUpdate`, and `FoodItemResponse`.

**Router** — `backend/app/routers/food.py`:
- In `create_item`, pass `payload.brand` to the `FoodItem()` constructor: `brand=payload.brand`.

**Frontend** — `frontend/src/pages/AddItem.jsx`:
- The form already has a `brand` field in state. Add `brand: form.brand || null` to the `createItem()` call payload.

**Frontend** — `frontend/src/components/FoodCard.jsx`:
- Show brand below the name if present: `{item.brand && <span className="text-xs text-gray-400">{item.brand}</span>}`.

**Label** — `backend/app/services/label_image.py`:
- Optionally add brand as a smaller line between name and frozen date on the label.

**Search** — `backend/app/routers/food.py`:
- Update the `/search` endpoint to also search by brand: `.filter(or_(FoodItem.name.ilike(...), FoodItem.brand.ilike(...)))`.

**Tests**: Update `test_food.py` to include brand in create payload and assert it appears in the response.

---

### 2. Local Barcode-to-Name Cache

**What**: The barcode lookup service (`barcode_service.py`) uses an in-memory dict cache that is lost on every restart. Repeat scans of the same barcode hit the external API again.

**Why**: Faster scan-out flow, works offline for previously scanned barcodes, reduces external API calls.

**Implementation**:

**New model** — `backend/app/models/barcode_cache.py`:
```python
class BarcodeCache(Base):
    __tablename__ = "barcode_cache"

    barcode: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    brand: Mapped[str | None] = mapped_column(String, nullable=True)
    source: Mapped[str] = mapped_column(String, nullable=False)
    found: Mapped[bool] = mapped_column(Boolean, nullable=False)
    cached_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
```

**Alembic migration**: Generate after creating the model.

**Service** — `backend/app/services/barcode_service.py`:
- Import `SessionLocal` from `app.database`.
- Before checking the in-memory cache, query `BarcodeCache` table.
- After a successful external lookup, insert/update into `BarcodeCache`.
- Keep the in-memory cache as a fast L1 layer; SQLite becomes the persistent L2.
- On startup (or on cache miss in memory), load from SQLite.
- Respect `BARCODE_CACHE_TTL_SECONDS` for both layers.

**Admin** — Add a "Clear barcode cache" button to the admin page:
- Backend: `DELETE /api/admin/barcode-cache` — truncate the `barcode_cache` table and clear the in-memory dict.
- Frontend: Button in Admin.jsx that calls this endpoint.

**Tests**: Update `test_barcode.py` to verify that after one lookup, restarting (clearing in-memory) and looking up again still returns cached result from SQLite.

---

### 3. Quantity Decrement on Scan-Out

**What**: When scanning out, the only option is to remove the entire item. Users who have "4 servings" in a container want to take 1 serving and leave 3.

**Why**: Avoids removing and re-adding items when partially using a container.

**Implementation**:

**Backend** — `backend/app/routers/food.py`:
- Add a new endpoint:
  ```
  POST /api/food/{item_id}/decrement
  ```
  - If `item.quantity > 1`: decrement by 1, return updated item.
  - If `item.quantity == 1`: set `removed_at = utcnow()` (fully consumed), return item.
  - Return a `{"remaining": N, "removed": bool}` wrapper.

**Scanner (Scan Out)** — `frontend/src/pages/Scanner.jsx`:
- When a single match is found, instead of auto-removing, show a choice:
  - "Remove container" (existing behavior)
  - "Use 1 serving" (calls `/decrement` instead)
- When multiple matches are shown in the picker, add both options per row.

**API client** — `frontend/src/api/client.js`:
```javascript
export const decrementItem = (id) =>
  api.post(`/food/${id}/decrement`).then((r) => r.data);
```

**Inventory detail panel** — `frontend/src/pages/Inventory.jsx`:
- Add a "Use 1 serving" button alongside "Remove" in the detail panel.

**Tests**: Test that decrementing from quantity 3 results in 2, and decrementing from 1 removes the item.

---

### 4. Batch / Group Tracking

**What**: When creating 5 containers of "Bolognese", each gets a unique ID but there is no link between them. Users can't see "I made 5 containers and 3 are left".

**Why**: Enables batch-level tracking: "How many of this batch are left?"

**Implementation**:

**Model** — `backend/app/models/food.py`:
```python
batch_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
```

**Alembic migration**: Generate after adding the column.

**Router** — `backend/app/routers/food.py`:
- In `create_item`, when `containers > 1`, generate one `batch_id = str(uuid.uuid4())` and assign it to all items in the batch.
- Add endpoint:
  ```
  GET /api/food/batch/{batch_id}
  ```
  Returns all items (active + removed) with that batch_id plus summary: `{"total": 5, "remaining": 3, "items": [...]}`.

**Schemas** — `backend/app/schemas/food.py`:
- Add `batch_id: str | None` to `FoodItemResponse`.

**Frontend** — `frontend/src/components/FoodCard.jsx`:
- If `item.batch_id`, show a small "Batch: 3/5 left" indicator.
- Tap the batch indicator to navigate to a batch detail view.

**Frontend** — New page `frontend/src/pages/BatchDetail.jsx`:
- Route: `/batch/:batchId`
- Fetch `/api/food/batch/{batchId}`, show all containers in the batch with their status (active / removed).

**API client**:
```javascript
export const getBatch = (batchId) =>
  api.get(`/food/batch/${batchId}`).then((r) => r.data);
```

---

### 5. Data Export (CSV & JSON)

**What**: No way to export inventory data. Users want to download their freezer contents for spreadsheets, meal planning, or backup.

**Why**: Data portability, offline reference, integration with other tools.

**Implementation**:

**Backend** — `backend/app/routers/admin.py`:
- Add two endpoints:
  ```
  GET /api/admin/export/csv
  GET /api/admin/export/json
  ```
- CSV endpoint: Query all FoodItems (both active and removed), use Python `csv.writer` with `io.StringIO`, return as `StreamingResponse` with `Content-Disposition: attachment; filename=freezertrack-export-{date}.csv` and `text/csv` content type.
- JSON endpoint: Same query, serialize with Pydantic, return as JSON download.
- Fields: id, name, brand, frozen_date, quantity, notes, removed_at, created_at, qr_code_id.
- Optional query param `?active_only=true` to export only current inventory.

**Frontend** — `frontend/src/pages/Admin.jsx`:
- Add an "Export Data" section with two buttons:
  ```jsx
  <a href="/api/admin/export/csv" download>Export CSV</a>
  <a href="/api/admin/export/json" download>Export JSON</a>
  ```
- Use `<a>` tags with `download` attribute for native browser download behavior.

**API client**: Not needed — use direct `<a href>` links since these return file downloads.

---

### 6. Database Backup & Restore

**What**: No way to back up or restore the SQLite database from the UI. Users must SSH in to copy the file.

**Why**: Disaster recovery, migration between hosts, peace of mind.

**Implementation**:

**Backend** — `backend/app/routers/admin.py`:
- Add endpoints:
  ```
  GET  /api/admin/backup          — download SQLite file
  POST /api/admin/restore         — upload SQLite file to replace current DB
  ```
- Backup: Read `DATABASE_URL` to find the `.db` file path, return as `FileResponse` with `application/octet-stream` and `Content-Disposition: attachment`.
- Restore: Accept `UploadFile`, validate it's a valid SQLite file (check magic bytes `SQLite format 3\000`), stop the current DB connections, replace the file, restart. Require confirmation parameter `?confirm=true` to prevent accidental overwrites.

**Frontend** — `frontend/src/pages/Admin.jsx`:
- Add "Database" section:
  - "Download Backup" button (link to `/api/admin/backup`).
  - "Restore from Backup" file upload input with confirmation dialog: "This will replace all current data. Are you sure?"
- Show file size and last backup date if available.

**API client**:
```javascript
export const restoreBackup = (file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/admin/restore?confirm=true", form).then((r) => r.data);
};
```

---

## Medium Priority

---

### 7. Categories & Tags

**What**: No way to categorize items. A freezer with 50 items is hard to browse without filtering by type.

**Why**: Users want to filter by "meat", "vegetables", "ready meals", "desserts", etc.

**Implementation**:

**Model** — `backend/app/models/food.py`:
```python
category: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
```
Use a free-text field (not a separate table) for simplicity. Suggest common values in the UI.

**Alembic migration**: Generate after adding the column.

**Schemas**: Add `category: str | None = None` to Create, Update, and Response.

**Router** — `backend/app/routers/food.py`:
- Add query parameter to list endpoint: `GET /api/food?category=meat`.
- Add endpoint: `GET /api/food/categories` — return distinct categories from active items.

**Frontend** — `frontend/src/pages/AddItem.jsx`:
- Add a category field with a `<datalist>` providing suggestions (fetched from `/api/food/categories`): Meat, Poultry, Fish, Vegetables, Fruit, Ready Meals, Soups, Bread, Desserts, Other.
- User can type a custom category or select from suggestions.

**Frontend** — `frontend/src/pages/Inventory.jsx`:
- Add a category filter dropdown above the item grid, populated from `/api/food/categories`.

**Frontend** — `frontend/src/components/FoodCard.jsx`:
- Show category as a small tag below the name if present.

**Label** — Optionally show category on the printed label.

---

### 8. Expiry / Use-By Estimation

**What**: Items only have a `frozen_date`. There's no estimated expiry or "use by" date. The alert system only flags items older than a flat threshold (default 90 days).

**Why**: Different foods have different freezer shelf lives. Chicken should be used within 6 months; bread within 3 months.

**Implementation**:

**Config** — `backend/app/config.py`:
- Add `DEFAULT_SHELF_LIFE_DAYS: int = 180` to Settings.

**Model** — `backend/app/models/food.py`:
```python
shelf_life_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
```
If null, use the default from settings.

**Computed property** — Add to `FoodItemResponse`:
```python
expiry_date: date | None  # frozen_date + shelf_life_days
days_until_expiry: int | None
```
Calculate these in the router before returning (or use a Pydantic `@computed_field`).

**Category-based defaults** — Create a dict mapping category names to default shelf life days:
```python
SHELF_LIFE_MAP = {
    "Meat": 120, "Poultry": 180, "Fish": 90, "Vegetables": 240,
    "Bread": 90, "Ready Meals": 90, "Desserts": 180,
}
```
When creating an item with a category, auto-set `shelf_life_days` from this map if not explicitly provided.

**Alert service** — `backend/app/services/alert_service.py`:
- Add `expiring_soon` alert type: flag items within 14 days of expiry.
- Keep the existing `old_item` alert for backwards compatibility.

**Frontend** — `frontend/src/components/FoodCard.jsx`:
- Replace or supplement the age badge with an expiry badge: "Use by Mar 2026", color-coded by urgency.

**Frontend** — `frontend/src/pages/AddItem.jsx`:
- Add an optional "Shelf life (days)" field, auto-filled from category selection.

---

### 9. Shopping List

**What**: When items are removed from the freezer, there's no record of what should be repurchased. Users must manually remember what to buy.

**Why**: Automatic "you're running low on X" suggestions based on usage patterns.

**Implementation**:

**New model** — `backend/app/models/shopping.py`:
```python
class ShoppingItem(Base):
    __tablename__ = "shopping_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    brand: Mapped[str | None] = mapped_column(String, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    source_item_id: Mapped[str | None] = mapped_column(String, nullable=True)
```

**Router** — New file `backend/app/routers/shopping.py`:
```
GET    /api/shopping              — list uncompleted items
POST   /api/shopping              — add item manually
POST   /api/shopping/{id}/complete — mark as purchased
DELETE /api/shopping/{id}         — remove from list
POST   /api/shopping/suggest      — auto-generate suggestions from recently removed items
```
The suggest endpoint: query items removed in the last 30 days, group by name, return names not currently in freezer.

**Frontend** — New page `frontend/src/pages/ShoppingList.jsx`:
- Route: `/shopping`
- List of items to buy with checkboxes to mark as complete.
- "Auto-suggest" button that calls the suggest endpoint.
- Manual add input at the top.

**Navigation** — Add to `App.jsx` nav with `ShoppingCart` lucide icon.

**Auto-add on remove** — In `backend/app/routers/food.py`, when removing an item, optionally auto-add to shopping list if the item name no longer exists in active inventory.

---

### 10. Statistics & Charts Page

**What**: The dashboard shows basic counts but no trends. Users can't see patterns like "I add 10 items per week" or "chicken is my most frozen item."

**Why**: Helps with meal planning and understanding freezer usage.

**Implementation**:

**Backend** — New file `backend/app/routers/stats.py`:
```
GET /api/stats/summary     — total items, total removed, avg age, oldest item
GET /api/stats/timeline    — items added/removed per week for last 12 weeks
GET /api/stats/top-items   — most frequently frozen item names (top 10)
GET /api/stats/categories  — count per category (if categories feature exists)
```
Each endpoint queries FoodItem and groups/aggregates using SQLAlchemy.

**Frontend** — New page `frontend/src/pages/Statistics.jsx`:
- Route: `/stats`
- Use Chart.js (add `chart.js` and `react-chartjs-2` to `package.json`).
- **Timeline chart**: stacked bar chart showing items added (green) and removed (red) per week.
- **Top items**: horizontal bar chart of most frozen item names.
- **Summary cards**: average freezer age, total items ever frozen, busiest week.

**Navigation** — Add to `App.jsx` nav with `BarChart3` lucide icon.

---

### 11. Photo Attachment

**What**: No way to attach a photo to a food item. Users want a visual reference of what's in each container.

**Why**: A photo is worth a thousand words — especially when containers look identical.

**Implementation**:

**Model** — `backend/app/models/food.py`:
```python
photo_path: Mapped[str | None] = mapped_column(String, nullable=True)
```

**Backend** — `backend/app/routers/food.py`:
- Add endpoint:
  ```
  POST /api/food/{item_id}/photo   — upload photo (multipart file)
  GET  /api/food/{item_id}/photo   — serve photo as image response
  ```
- Save photos to `/opt/freezertrack/data/photos/{item_id}.jpg`.
- Resize to max 800px wide using Pillow to save space.

**Schemas**: Add `photo_path: str | None` to `FoodItemResponse`. Add computed `has_photo: bool`.

**Frontend** — `frontend/src/pages/AddItem.jsx`:
- Add a camera/file input below the form: `<input type="file" accept="image/*" capture="environment">`.
- On mobile, `capture="environment"` opens the rear camera directly.
- Upload after item creation via `POST /api/food/{id}/photo`.

**Frontend** — `frontend/src/components/FoodCard.jsx`:
- If `item.has_photo`, show a small thumbnail in the card.

**Frontend** — `frontend/src/pages/Inventory.jsx`:
- Show photo in the detail panel when available.

---

### 12. History Detail Panel & Re-Add

**What**: In the Inventory page, history tab items can't be tapped. The detail panel only works for active items. Users want to see details of removed items and re-add them.

**Why**: "I took out Bolognese last week, I want to make another batch with the same settings."

**Implementation**:

**Frontend** — `frontend/src/pages/Inventory.jsx`:
- Change the FoodCard `onClick` to also work in history tab:
  ```jsx
  onClick={(i) => { setSelected(i); setReprintMsg(null); }}
  ```
  Remove the `tab === "active"` check.
- In the detail panel, conditionally render buttons based on `selected.removed_at`:
  - If active: show Remove, Reprint, Delete (existing).
  - If history: show "Re-add to Freezer" and Delete.

**Re-add endpoint** — `backend/app/routers/food.py`:
```
POST /api/food/{item_id}/readd
```
- Creates a new FoodItem copying name, brand, quantity, notes, category from the source item.
- Sets `frozen_date = date.today()`, new UUID, new `qr_code_id`.
- Optionally auto-print.
- Returns the new item.

**API client**:
```javascript
export const readdItem = (id) =>
  api.post(`/food/${id}/readd`).then((r) => r.data);
```

---

### 13. PWA with Offline Support

**What**: The app is a standard web page. Users must type the URL each time. There's no offline access.

**Why**: Installable on phone home screen, works without network for browsing inventory (not for API calls, but cached UI loads instantly).

**Implementation**:

**Manifest** — `frontend/public/manifest.json`:
```json
{
  "name": "FreezerTrack",
  "short_name": "Freezer",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1b2a4a",
  "theme_color": "#1b2a4a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Icons**: Generate 192x192 and 512x512 PNG icons (snowflake/freezer icon in ice-blue on navy background). Place in `frontend/public/`.

**Service worker** — `frontend/public/sw.js`:
- Cache the app shell (HTML, JS, CSS) using a cache-first strategy.
- Cache API responses (GET /api/food) with a network-first strategy and stale-while-revalidate fallback.
- On network failure, serve cached inventory data.

**Registration** — `frontend/src/main.jsx`:
```javascript
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
```

**HTML** — `frontend/index.html`:
```html
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icon-192.png">
```

**Vite config**: Ensure `public/` files are copied to build output (they are by default).

---

## Low Priority

---

### 14. Dark Mode

**What**: The app only has a light theme. No dark mode.

**Why**: Easier on the eyes at night, user preference, modern UI expectation.

**Implementation**:

**CSS** — `frontend/src/index.css`:
- Define dark mode CSS variables:
  ```css
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f172a;
      --surface: #1e293b;
      --text: #f1f5f9;
      --border: #334155;
    }
  }
  ```

**Tailwind** — Use Tailwind's `dark:` variant classes throughout all components. Add `darkMode: 'class'` to Tailwind config for manual toggle support.

**Theme toggle** — `frontend/src/pages/Admin.jsx` (or a global toggle):
- Store preference in `localStorage` as `theme: "light" | "dark" | "system"`.
- Apply `class="dark"` on `<html>` element based on preference.

**Component updates**: Every component needs `dark:bg-*`, `dark:text-*`, `dark:border-*` variants. Major files to update:
- `App.jsx` (sidebar, header, bottom nav)
- `FoodCard.jsx`, `AlertBanner.jsx`
- All pages (Dashboard, Scanner, AddItem, Inventory, Admin)
- `index.html` body class

---

### 15. Multi-Freezer Support

**What**: All items go into a single "freezer". Users with multiple freezers (garage freezer, kitchen freezer, chest freezer) can't separate them.

**Why**: Know which freezer to check when looking for an item.

**Implementation**:

**New model** — `backend/app/models/freezer.py`:
```python
class Freezer(Base):
    __tablename__ = "freezers"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
```

**Model** — `backend/app/models/food.py`:
```python
freezer_id: Mapped[str | None] = mapped_column(String, ForeignKey("freezers.id"), nullable=True)
```

**Router** — New file `backend/app/routers/freezers.py`:
```
GET    /api/freezers         — list all freezers
POST   /api/freezers         — create freezer
PATCH  /api/freezers/{id}    — rename/update
DELETE /api/freezers/{id}    — delete (only if empty)
```

**Existing endpoints**: Add optional `?freezer_id=` query parameter to `GET /api/food` and `GET /api/food/history`.

**Frontend**: Add a freezer selector dropdown to the AddItem form and a filter to the Inventory and Dashboard pages.

**Admin**: Add a "Manage Freezers" section to create/rename/delete freezers.

---

### 16. User Authentication

**What**: The app has no authentication. Anyone on the network can access it.

**Why**: Optional security for shared households or network-accessible deployments.

**Implementation**:

**Backend** — Simple PIN-based auth (not full user management):
- Add `AUTH_PIN: str = ""` to `backend/app/config.py`. Empty string = auth disabled.
- Create middleware in `backend/app/main.py` that checks for a `Bearer {pin}` header on all `/api/` routes except `/health`.
- If `AUTH_PIN` is set and the header doesn't match, return 401.

**Frontend** — `frontend/src/pages/Login.jsx`:
- Simple PIN input page shown when API returns 401.
- Store PIN in `sessionStorage` (cleared on tab close).
- Add PIN as `Authorization: Bearer {pin}` header to the Axios instance in `client.js`.

**Admin**: Add the PIN setting to the admin config page. Allow clearing to disable auth.

---

### 17. Multi-Language (i18n)

**What**: All UI text is hardcoded in English.

**Why**: Accessibility for non-English speakers.

**Implementation**:

**Install**: `npm install react-i18next i18next` in `frontend/`.

**Translation files** — `frontend/src/i18n/`:
```
en.json — {"dashboard.title": "Dashboard", "scanner.title": "Scanner", ...}
de.json — {"dashboard.title": "Dashboard", "scanner.title": "Scanner", ...}
fr.json — {"dashboard.title": "Tableau de bord", ...}
```

**Setup** — `frontend/src/i18n/index.js`:
```javascript
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
i18n.use(initReactI18next).init({
  resources: { en, de, fr },
  lng: localStorage.getItem("lang") || "en",
  fallbackLng: "en",
});
```

**Usage**: Replace all hardcoded strings with `const { t } = useTranslation()` and `{t("key")}`.

**Admin**: Add a language selector dropdown that saves to `localStorage`.

---

### 18. Printer Status Check

**What**: The print endpoint tries to print and silently fails if the printer is unreachable. There's no way to check if the printer is connected before printing.

**Why**: Users waste time wondering why labels aren't printing.

**Implementation**:

**Backend** — `backend/app/services/print_service.py`:
- Add function:
  ```python
  def check_printer(mac_address: str) -> dict:
  ```
  Attempt a Bluetooth socket connection to the MAC address with a short timeout (3 seconds). Return `{"connected": True/False, "mac": mac_address}`.

**Router** — `backend/app/routers/labels.py`:
```
GET /api/labels/printer/status
```
Calls `check_printer(settings.NIIMBOT_MAC)` and returns the result.

**Frontend** — `frontend/src/pages/Admin.jsx`:
- Add a "Printer Status" section showing connection status with a refresh button.
- Color indicator: green dot if connected, red dot if not.

**Frontend** — `frontend/src/pages/AddItem.jsx`:
- Before showing the "Print label" checkbox, optionally check printer status and show a warning if disconnected.

---

### 19. Label Template Customization

**What**: Labels are always 400x240px with a fixed layout. Users with different Niimbot label sizes or preferences can't adjust them.

**Why**: Different label roll sizes, user preference for what info appears on the label.

**Implementation**:

**Config** — `backend/app/config.py`:
```python
LABEL_WIDTH: int = 400
LABEL_HEIGHT: int = 240
LABEL_SHOW_QR: bool = True
LABEL_SHOW_NOTES: bool = False
LABEL_FONT_SIZE: int = 22
```

**Service** — `backend/app/services/label_image.py`:
- Read dimensions and options from settings instead of hardcoding.
- Add optional fields: show notes line, show brand line, show category.
- Support at least two presets: "Standard (50x30mm)" and "Small (40x20mm)".

**Admin** — `frontend/src/pages/Admin.jsx`:
- Add "Label Settings" section with:
  - Label size preset dropdown
  - Checkboxes for which fields to show
  - Font size slider
  - Live preview that fetches `/api/labels/{sample_id}/preview` and displays it.

**Labels router** — `backend/app/routers/labels.py`:
- Invalidate cached label PNGs when label settings change (delete files in `data/labels/`).

---

### 20. Notification Service

**What**: Alerts only appear in the UI and via Home Assistant polling. No proactive notifications.

**Why**: Users want to be notified about expiring items or low stock without opening the app.

**Implementation**:

**Backend** — New file `backend/app/services/notification_service.py`:
- Support multiple channels:
  - **Webhook**: POST alert JSON to a configurable URL (works with Slack, Discord, ntfy.sh, Gotify).
  - **Email**: SMTP with `smtplib` (optional, configured via env vars).
- Function: `send_notification(title: str, body: str, channel: str)`.

**Config** — `backend/app/config.py`:
```python
NOTIFY_WEBHOOK_URL: str = ""
NOTIFY_EMAIL_TO: str = ""
SMTP_HOST: str = ""
SMTP_PORT: int = 587
SMTP_USER: str = ""
SMTP_PASS: str = ""
```

**Scheduled check** — Use FastAPI's lifespan or a background thread:
- Every hour, call `get_alerts()` and compare with previously sent alerts.
- Only send notifications for new alerts (track last sent alert IDs in memory or SQLite).

**Admin** — Add notification settings to the config page:
- Webhook URL input
- "Send test notification" button
- Email settings (optional, collapsed by default)

---

*End of FreezerTrack Feature Guide*

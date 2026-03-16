# FreezerTrack — Improvement Backlog

A prioritised list of improvements identified from a full codebase audit. Each item is actionable and includes the specific files and changes needed. Items are grouped by priority and area.

---

## Critical — Security

### 1. Add authentication to admin API endpoints

**Problem**: All `/api/admin/*` endpoints (config, export, backup, restore, update, restart) are completely unauthenticated. Anyone on the network can read secrets, overwrite the database, or trigger remote code execution.

**Files**: `backend/app/routers/admin.py`, `backend/app/main.py`, `backend/app/config.py`

**Implementation**:
- Add a `ADMIN_TOKEN` setting to `config.py` (generated on first install like `SECRET_KEY`).
- Create a FastAPI dependency `verify_admin_token` that checks the `Authorization: Bearer <token>` header.
- Apply the dependency to all routes in `admin.py`.
- Update the frontend `api/client.js` to include the token from a login flow or localStorage.
- Update `install.sh` and `proxmox/install/freezertrack-install.sh` to generate and display the token on first install.

---

### 2. Sanitise `.env` config writes to prevent injection

**Problem**: `backend/app/routers/admin.py` `_write_env()` writes values without escaping. A value containing `\n` can inject arbitrary environment variables.

**Files**: `backend/app/routers/admin.py`

**Implementation**:
- In `_write_env()`, strip newlines and carriage returns from all values before writing.
- Add validation in `update_config()` to reject values containing `\n`, `\r`, or null bytes.

```python
def _write_env(data: dict) -> None:
    lines = []
    for key, value in data.items():
        clean = str(value).replace("\n", "").replace("\r", "")
        lines.append(f"{key}={clean}")
    ...
```

---

### 3. Sandbox the self-update mechanism

**Problem**: `trigger_update` runs `curl | bash` from a remote URL. If the repo or network is compromised, this is remote code execution.

**Files**: `backend/app/routers/admin.py`

**Implementation**:
- Replace `curl | bash` with `git -C /opt/freezertrack pull --ff-only` followed by the specific rebuild steps (pip install, npm build, alembic upgrade, systemctl restart).
- Run the update in a subprocess with a timeout.
- Log the output but do not expose raw shell errors to the API response.

---

### 4. Replace wildcard CORS with explicit origins

**Problem**: `allow_origins=["*"]` with `allow_credentials=True` is a misconfiguration.

**Files**: `backend/app/main.py`, `backend/app/config.py`

**Implementation**:
- Add `CORS_ORIGINS` to `config.py` defaulting to `"*"` for development.
- In `main.py`, read `settings.CORS_ORIGINS` and split by comma.
- Document in `.env.example` that production should list actual origins (e.g. `http://192.168.1.100,https://freezer.coconnor.ie`).

---

## High — Bugs and Reliability

### 5. Fix settings mutation race condition in label preview

**Problem**: `routers/labels.py` `preview_sample()` mutates the global `settings` object for the duration of the request. Concurrent requests can see each other's changes.

**Files**: `backend/app/routers/labels.py`

**Implementation**:
- Instead of mutating `settings`, pass the override values directly to `label_image.compose_label()` as parameters.
- Modify `compose_label()` to accept optional width/height/font_size/show_* overrides that take precedence over `settings`.

---

### 6. Fix `create_item` committing inside a loop

**Problem**: `routers/food.py` `create_item()` calls `db.commit()` inside the for-loop, creating N separate transactions for N containers. If one fails mid-way, some items are created and some are not.

**Files**: `backend/app/routers/food.py`

**Implementation**:
- Move `db.commit()` outside the loop so all containers are created in a single transaction.
- Call `db.refresh()` after the single commit for all items.
- Keep the print logic after the commit.

---

### 7. Add file size limit and type validation to photo upload

**Problem**: `upload_photo` has no file size limit and does not validate file type. Large uploads can cause memory issues; malicious files could cause PIL errors.

**Files**: `backend/app/routers/food.py`

**Implementation**:
- Add a `MAX_PHOTO_SIZE = 10 * 1024 * 1024` (10 MB) constant.
- Check `file.size` or read in chunks and reject if too large.
- Wrap `Image.open()` in try/except and return 400 for invalid images.
- Validate `file.content_type` starts with `image/`.

---

### 8. Add path traversal protection to photo serving

**Problem**: `get_photo` serves `item.photo_path` directly from the database. A corrupted path could serve arbitrary files.

**Files**: `backend/app/routers/food.py`

**Implementation**:
- Resolve `item.photo_path` with `os.path.realpath()` and verify it starts with `os.path.realpath(PHOTO_DIR)`.
- Return 404 if the resolved path is outside the photo directory.

---

### 9. Fix scanner dashboard XSS vulnerability

**Problem**: `scanner/dashboard.py` injects `h.barcode` and `h.time` into HTML without escaping. A QR code containing `<script>` tags would execute in the browser.

**Files**: `scanner/dashboard.py`

**Implementation**:
- Import `html.escape` and escape all user-supplied values before embedding in HTML.
- Apply to barcode, time, and any other dynamic values in the dashboard HTML template.

---

### 10. Cap maximum containers per create request

**Problem**: `create_item` caps containers at `max(1, payload.containers)` but has no upper bound. A request with `containers: 10000` would create 10,000 items.

**Files**: `backend/app/routers/food.py`, `backend/app/schemas/food.py`

**Implementation**:
- Add `Field(ge=1, le=50)` to `containers` in `FoodItemCreate`.
- Add `Field(ge=1, le=999)` to `quantity`.
- Add `Field(max_length=200)` to `name`, `brand`, `notes`, `category`.

---

## High — UX and Accessibility

### 11. Replace `alert()` and `confirm()` with inline UI

**Problem**: `AddItem.jsx` uses `alert("Failed to add item")` and `Inventory.jsx` uses `confirm()` for deletes. These are disruptive on mobile and inaccessible.

**Files**: `frontend/src/pages/AddItem.jsx`, `frontend/src/pages/Inventory.jsx`, `frontend/src/pages/Admin.jsx`

**Implementation**:
- Add an inline error/success banner component (similar to what Scanner and Admin already use).
- Replace `alert()` calls with inline error state displayed in the form.
- Replace `confirm()` with a confirmation modal component with focus trap and Escape to close.

---

### 12. Add loading states across all pages

**Problem**: Dashboard, Inventory, ShoppingList, AddItem, and Scanner show no feedback while data loads. Content appears abruptly.

**Files**: All page components in `frontend/src/pages/`

**Implementation**:
- Create a shared `LoadingSkeleton` component (or use simple spinners).
- Add `loading` state to each page; show skeleton while initial fetch is in progress.
- Pattern: `const [loading, setLoading] = useState(true)` → `useEffect(() => { fetchData().finally(() => setLoading(false)); }, [])`.

---

### 13. Add ARIA labels to icon-only navigation

**Problem**: Mobile header icons (Stats, Labels, Admin) and the sidebar nav have no `aria-label`. Screen readers cannot identify their purpose.

**Files**: `frontend/src/App.jsx`

**Implementation**:
- Add `aria-label` to all `NavLink` components (e.g. `aria-label="Statistics"`).
- Add `aria-label="Main navigation"` to the `<nav>` element.

---

### 14. Add focus trap and Escape handling to modals

**Problem**: Inventory detail panel and history panel have no focus trap. Tab can leave the modal; Escape does not close it.

**Files**: `frontend/src/pages/Inventory.jsx`

**Implementation**:
- Create a shared `Modal` wrapper component that:
  - Traps focus within the modal.
  - Closes on Escape key.
  - Moves focus to the modal on open and back to the trigger on close.
  - Applies `aria-modal="true"` and `role="dialog"`.
- Wrap all modal content in this component.

---

### 15. Add error handling to all silent `.catch(() => {})` calls

**Problem**: Many API calls silently swallow errors. Dashboard, Scanner, ShoppingList, AddItem, and Inventory have `.catch(() => {})` patterns that show stale or empty data with no explanation.

**Files**: `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Scanner.jsx`, `frontend/src/pages/ShoppingList.jsx`, `frontend/src/pages/AddItem.jsx`, `frontend/src/pages/Inventory.jsx`

**Implementation**:
- Add `error` state to each page.
- In `.catch()`, set the error state.
- Display an inline error banner (e.g. "Failed to load data. Tap to retry.") with a retry button.

---

## Medium — API Design and Backend

### 16. Add pagination to list endpoints

**Problem**: `list_items`, `list_history`, `list_grouped`, `search_items`, `list_shopping` return all results. Large datasets will be slow.

**Files**: `backend/app/routers/food.py`, `backend/app/routers/shopping.py`

**Implementation**:
- Add `skip: int = 0` and `limit: int = 50` query parameters to list endpoints.
- Apply `.offset(skip).limit(limit)` to queries.
- Return a `total` count in the response alongside the items.
- Update frontend to implement infinite scroll or "Load More" buttons.

---

### 17. Add a global exception handler

**Problem**: Unhandled exceptions return raw stack traces. No consistent error envelope.

**Files**: `backend/app/main.py`

**Implementation**:
- Add an `@app.exception_handler(Exception)` that logs the error and returns `{"detail": "Internal server error", "error_code": "internal_error"}` with status 500.
- Add a handler for `RequestValidationError` that returns a clean 422 with field-level errors.

---

### 18. Add request logging

**Problem**: No structured logging of API requests/responses. Difficult to debug issues in production.

**Files**: `backend/app/main.py`

**Implementation**:
- Add a FastAPI middleware that logs method, path, status code, and duration for each request.
- Use Python's `logging` module with structured format (JSON or key-value).

---

### 19. Improve health check to verify DB connectivity

**Problem**: `/health` returns `{"status": "ok"}` without checking if the database is accessible.

**Files**: `backend/app/main.py`, `backend/app/database.py`

**Implementation**:
- In the health endpoint, execute a simple query (`SELECT 1`) to verify the DB connection.
- Return `{"status": "ok", "database": "connected"}` or `{"status": "degraded", "database": "error"}`.

---

### 20. Fix N+1 query in shopping suggest endpoint

**Problem**: `suggest_items` runs two queries per recently removed item (active count + shopping list check). For 50 removed items, that is 100 extra queries.

**Files**: `backend/app/routers/shopping.py`

**Implementation**:
- Pre-fetch active item name counts and shopping list names in two bulk queries.
- Filter in Python using the pre-fetched sets.

---

## Medium — Infrastructure and CI

### 21. Add security scanning to CI

**Files**: `.github/workflows/ci.yml`

**Implementation**:
- Add a `pip audit` step after installing Python dependencies.
- Add an `npm audit --audit-level=high` step after installing Node dependencies.
- Add a linting step (`ruff check backend/` for Python, `npx eslint src/` for frontend).

---

### 22. Run services as non-root

**Files**: `install.sh`, `proxmox/install/freezertrack-install.sh`, `backend/Dockerfile`, `scanner/install.sh`

**Implementation**:
- Create a `freezertrack` system user in install scripts.
- Set `User=freezertrack` in the systemd service file.
- Ensure data directories are owned by the service user.
- Add `USER` directive to backend Dockerfile.

---

### 23. Add nginx security headers

**Files**: `nginx/nginx.conf`, `proxmox/misc/freezertrack.conf`, `install.sh` (inline nginx config)

**Implementation**:
- Add to the server block:
  ```nginx
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  ```

---

### 24. Remove unnecessary Docker capabilities

**Files**: `docker-compose.yml`

**Implementation**:
- Remove `NET_ADMIN` and `NET_RAW` if Bluetooth is not used in Docker mode.
- If Bluetooth is needed, document why in a comment.

---

### 25. Pause polling when browser tab is hidden

**Files**: `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Scanner.jsx`

**Implementation**:
- Use the Page Visibility API to pause `setInterval` polling when the tab is not visible.
- Resume polling when the tab becomes visible again.
- Pattern:
  ```javascript
  useEffect(() => {
    const handler = () => { if (document.hidden) clearInterval(id); else id = setInterval(...); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  ```

---

## Low — Polish and Consistency

### 26. Extract shared components (TabButton, StatCard, Modal)

**Problem**: `TabButton` is duplicated in `Scanner.jsx` and `Inventory.jsx`. `StatCard` is duplicated in `Dashboard.jsx` and `Statistics.jsx`.

**Files**: Create `frontend/src/components/TabButton.jsx`, `frontend/src/components/StatCard.jsx`, `frontend/src/components/Modal.jsx`

**Implementation**:
- Extract each into a standalone component.
- Import from the new files in all consuming pages.

---

### 27. Unify colour usage for dark mode

**Problem**: Some components use hardcoded `bg-white`, `border-gray-200`; others use CSS variables (`var(--surface)`, `var(--border)`). This causes inconsistencies in dark mode.

**Files**: `frontend/src/pages/AddItem.jsx`, `frontend/src/pages/Inventory.jsx`, `frontend/src/pages/Scanner.jsx`, `frontend/src/pages/ShoppingList.jsx`

**Implementation**:
- Replace all `bg-white` with `bg-[var(--surface)]`.
- Replace all `border-gray-200` with `border-[var(--border)]`.
- Replace all `text-gray-900` with `text-[var(--text)]`.
- Audit all pages for hardcoded light-mode colours.

---

### 28. Add `prefers-reduced-motion` support

**Problem**: Animations like `animate-ping` in ScanInput run regardless of user preference.

**Files**: `frontend/src/index.css`

**Implementation**:
- Add a media query:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```

---

### 29. Add debounce to Inventory search and LabelDesigner preview

**Problem**: Inventory search filters on every keystroke. LabelDesigner refreshes the preview image on every form change.

**Files**: `frontend/src/pages/Inventory.jsx`, `frontend/src/pages/LabelDesigner.jsx`

**Implementation**:
- Create a `useDebounce(value, delay)` hook.
- Use debounced values for filtering and preview requests (300ms delay).

---

### 30. Add `max-width` consistency across pages

**Problem**: Dashboard/Inventory use `max-w-4xl`, Scanner/AddItem use `max-w-lg`, Admin uses `max-w-2xl`. No clear system.

**Files**: All page components

**Implementation**:
- Standardise on two widths: `max-w-2xl` for single-column forms (AddItem, Scanner, ShoppingList, Admin) and `max-w-5xl` for grid layouts (Dashboard, Inventory, Statistics).
- Apply consistently across all pages.

---

## Implementation Order

For an LLM implementing these changes, follow this order:

1. **Items 1–4** (Critical security) — must be done first.
2. **Items 5–10** (High bugs/reliability) — fix correctness issues.
3. **Items 11–15** (High UX/accessibility) — user-facing quality.
4. **Items 16–20** (Medium API/backend) — scalability and robustness.
5. **Items 21–25** (Medium infra/CI) — production hardening.
6. **Items 26–30** (Low polish) — consistency and refinement.

Each item is independent and can be implemented as a separate commit or PR.

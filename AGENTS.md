# FreezerTrack — Agent Operations Guide

## Quick Reference

This repo contains 6 role-specific focus documents that define what each agent should work on:

| Role | Focus File | What It Covers |
|------|-----------|----------------|
| **Backend** | [`backend.md`](backend.md) | FastAPI, SQLAlchemy, API security, database |
| **Frontend** | [`frontend.md`](frontend.md) | React, Tailwind, UX, accessibility |
| **DevOps** | [`devops.md`](devops.md) | Docker, Proxmox, CI/CD, deployment |
| **QA** | [`qa.md`](qa.md) | Security testing, edge cases, integration |
| **TechWriter** | [`techwriter.md`](techwriter.md) | Documentation accuracy and structure |

## Feature Implementation Guide

[`FEATURES.md`](FEATURES.md) is the canonical implementation reference. Each of the 20 features contains:
- Step-by-step changes mapped to specific files
- Code snippets ready for direct insertion
- Schema/model diffs
- Test update instructions

Use this as your primary source when adding features. Follow the priority order listed at the top (High → Medium → Low).

## Improvement Backlog

[`IMPROVEMENTS.md`](IMPROVEMENTS.md) has 30 prioritised items with actionable patch-level changes and exact files to touch.

Items are grouped: Critical (1-4), High bugs/reliability (5-10), High UX/accessibility (11-15), Medium API/backend (16-20), Medium infra/CI (21-25), Low polish (26-30).

## Manual QA Checklist

[`TESTING.md`](TESTING.md) lists 80+ manual test scenarios covering USB scanner, camera, inventory edit, mobile UX, ESPHome, and printer flows.

**Do not implement or merge changes without running the relevant test from this checklist.**

## Project Structure

```
├── backend/                      # Python 3.12, FastAPI
│   ├── app/
│   │   ├── main.py              # App entry, CORS, middleware, error handlers
│   │   ├── config.py            # Pydantic BaseSettings (.env)
│   │   ├── database.py          # SQLAlchemy engine, session, Base
│   │   ├── models/food.py       # SQLAlchemy ORM models
│   │   ├── schemas/food.py      # Pydantic v2 request/response schemas
│   │   ├── routers/             # API route modules (one file per resource)
│   │   └── services/            # Business logic (barcode, label, print, etc.)
│   ├── requirements.txt
│   └── alembic/                 # Database migrations
├── frontend/                     # React 18/19, Vite, Tailwind CSS v4
│   ├── src/
│   │   ├── App.jsx              # Router, sidebar, bottom nav layout
│   │   ├── pages/               # Route-level components (Dashboard, Scanner, etc.)
│   │   ├── components/          # Shared UI primitives (FoodCard, Modal, etc.)
│   │   ├── hooks/               # Custom hooks (useTheme, useDebounce)
│   │   └── api/client.js        # Axios API client functions
├── esphome/                      # ESPHome device configurations
├── scanner/                      # USB barcode scanner service
├── custom_components/            # Home Assistant integration
├── nginx/                        # Reverse proxy configuration
├── proxmox/                      # LXC container scripts
└── scripts/                      # Cert generation, helpers
```

## Design Patterns

### Backend
- **Models**: SQLAlchemy 2.0 `Mapped` columns with `uuid4()` lambdas as default ID generators
- **Schemas**: Pydantic v2 with `ConfigDict(from_attributes=True)`, `Field()` constraints on all string/num fields
- **Routers**: `APIRouter(prefix="/api/...", tags=["..."])`, functions receive `db: Session = Depends(get_db)`
- **Error handling**: Central exception handlers in `main.py` — 422 for validation, 500 with logged traceback for unexpected errors
- **Database**: All commits happen outside loops (atomic operations). Never commit inside a for-loop.

### Frontend
- **API calls**: Chain `.then(r => r.data)` on every axios call. No silent `.catch(() => {})` without error state.
- **State management**: `useState` + `useEffect` pattern. Loading/error states required on all data-fetching pages.
- **Styling**: CSS variables exclusively (`--ice-blue`, `--surface`, `--text`, `--border`). No hardcoded Tailwind colors in new code.
- **Navigation**: Sidebar desktop, bottom nav mobile — defined in `NAV` and `SIDEBAR_ONLY` arrays in `App.jsx`.

## Agent Coordination

When multiple agents work on the same feature or when roles share boundaries, follow these rules:

### Dependency Order
Always implement in this order when cross-cutting changes are needed:

```
1. Backend (API endpoints, models, schemas)
2. Frontend (UI consuming the new API)
3. DevOps (if deployment config is affected)
4. QA (verify integration between backend + frontend)
5. TechWriter (update docs to reflect new behavior)
```

### Signalling Protocol
- **Backend → Frontend**: After adding/changing an endpoint, update the corresponding entry in `frontend/src/api/client.js` and add an import usage example
- **Frontend → Backend**: Do not change API contract signatures — if a new field is needed, request it of the backend agent first
- **Any → QA**: When a feature touches multiple subsystems (e.g., scanner + API + HA), notify the QA agent to run integration scenarios from `TESTING.md`

### Shared State & Naming
All agents must agree on these shared conventions:
- **HTTP verbs**: POST = create, GET = read, PATCH = partial update, DELETE = remove
- **ID format**: UUID strings, never integers — matches every model's `id` column
- **Date format**: ISO 8601 date only (`YYYY-MM-DD`) via Pydantic's `date` type
- **Error responses**: Always `{ "detail": "{message}" }` (FastAPI default + global handler)
- **Success codes**: 200 (read/patch), 201 (create), 204 (delete without content)

### Breaking Changes
If a change modifies an existing API response shape, URL path, or model field:

1. The backend agent must add an **[API Change]** section in `IMPROVEMENTS.md` under "Medium — API Design" before implementing
2. The frontend agent must then update ALL consuming pages in parallel (no lag where UI expects old fields)
3. Run `pytest` + `npm run build` after changes to catch mismatches early

### Task Handoff Template

When handing off work between agents, include:

```markdown
## API Change Summary
- Endpoint: `GET /api/food/decrement/{item_id}`
- Request: POST (path param only)
- Response: `{ "item": {...}, "remaining": int, "removed": bool }`
- Affected frontend pages: Scanner.jsx, Inventory.jsx

## What's Done (Backend Agent)
- [ ] Router function at `routers/food.py` line ~370
- [ ] No new schemas needed (uses existing FoodItemResponse)
- [ ] Tests in `test_food.py`: decrement from 3 → 2, from 1 → removed

## Next Steps (Frontend Agent)
- Add UI button triggering `/decrement`, show remaining count feedback
```

## Running the Stack

```bash
# Environment setup
cp .env.example .env
# Edit .env — fill in NIIMBOT_MAC and other settings

# Docker
docker compose up -d --build

# Podman
podman-compose up -d --build
```

## Running Tests

```bash
pip install -r backend/requirements.txt
pytest backend/app/tests/ -v
```

## Agent Workflow

When given a task, follow this flow:

1. **Read the role focus doc** (`backend.md`, `frontend.md`, etc.) to understand what that agent should prioritize
2. **Check FEATURES.md and IMPROVEMENTS.md** — if the task is already listed with an implementation guide, follow it exactly
3. **If not listed**, create a detailed plan matching the style of those documents (file paths, code snippets, test expectations)
4. **Implement changes** following the coding patterns above
5. **Run tests**: `pytest backend/app/tests/` (backend) and verify frontend build (`npm run build` in frontend/)
6. **Check against TESTING.md** — ensure manual QA scenarios still pass
7. **Write a commit message**: imperative mood, max 72 chars, reference the feature item number:
   `factory: issue #X task Y - <description>`

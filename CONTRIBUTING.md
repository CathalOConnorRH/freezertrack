# Contributing — FreezerTrack Standards

Welcome! Whether you're a human developer or an agent, this guide covers the conventions for contributing code to FreezerTrack.

## For Human Contributors

FreezerTrack currently has one maintainer — [CathalOConnorRH](https://github.com/CathalOConnorRH). All PRs and issues go through GitHub directly. We follow standard fork-based workflow:

1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Make your changes, run tests (`pytest backend/app/tests/`), then `cd frontend && npm run build`
4. Push and open a PR with a clear description of what changed and why

## For AI Agents

If you are an agent working in this repo, follow the full [AGENTS.md](AGENTS.md) file which contains:
- Role focus document index (backend, frontend, devops, qa, techwriter)
- Codebase structure map
- Design patterns to follow
- Agent workflow and coordination rules

## Coding Conventions

### Python (Backend)

| Rule | Detail |
|------|--------|
| **Style guide** | PEP 8 — use `ruff check backend/` |
| **Indentation** | 4 spaces, no tabs |
| **Line length** | 120 characters max |
| **Type hints** | Required on all function parameters and return types. Use `X | None`, not `Optional[X]` |
| **Imports** | stdlib → third-party → local app (no blank lines between groups) |
| **Naming** | `snake_case` functions/variables, `camelCase` for API payloads, `PascalCase` classes |
| **Router modules** | One per resource (`routers/{resource}.py`), singular name |
| **DB sessions** | Always inject with `Depends(get_db)` |
| **Commits** | Never commit inside a loop — add all items, then one `db.commit()` then refresh |

```python
# Example router function signature
@router.post("", status_code=201)
def create_item(payload: ItemCreate, db: Session = Depends(get_db)) -> ItemResponse:
```

### React (Frontend)

| Rule | Detail |
|------|--------|
| **Component naming** | PascalCase (`FoodCard.jsx`) for components, camelCase (`useTheme.js`) for hooks |
| **File layout** | Pages in `/src/pages/`, shared UI in `/src/components/`, hooks in `/src/hooks/` |
| **Imports** | External packages first, then relative local modules |
| **API calls** | All chain `.then(r => r.data)`. No silent `.catch(() => {})` without error state |
| **State management** | `useState` + `useEffect` pattern. Loading and error states mandatory on data-fetching pages |
| **Styling** | CSS variables only (`--ice-blue`, `--surface`, `--text`). No hardcoded Tailwind colors in new code |
| **Navigation** | Desktop sidebar + mobile bottom nav defined in `NAV` / `SIDEBAR_ONLY` arrays in `App.jsx` |

```javascript
// Example: data fetching with loading/error states
const [items, setItems] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  api.getItems()
    .then(data => { setItems(data); setLoading(false); })
    .catch(err => setError(err.message ?? "Failed to load"));
}, []);
```

### Tests

- **Backend**: `pytest backend/app/tests/` — place tests in `test_{module}.py`, use shared fixtures from `conftest.py`
- **Frontend**: `.test.jsx` files next to the component being tested, use `@testing-library` query-by-role/text patterns

### Git

- Commit messages: imperative mood, max 72 chars, reference issue number if applicable
- Format: ```{tag}: issue #{N} task #{M} - <description>```
  - Examples: `fix: move commit outside loop in create_item`, `docs: update agent reference file paths`

## Review Checklist

Before submitting changes:

- [ ] New code follows naming conventions shown above
- [ ] All function parameters and return types are annotated (Python)
- [ ] No hardcoded colours — CSS variables used (`--ice-blue`, `--surface`, etc.)
- [ ] No silent error handling — every API call reports errors in state
- [ ] Tests included and passing (`pytest backend/app/tests/`)
- [ ] Frontend builds cleanly: `cd frontend && npm run build`

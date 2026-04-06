# Backend Agent Focus

As the Backend Agent, your primary responsibility is the stability, security, and efficiency of the FastAPI server and database.

## High Priority: Security
- **Admin API Authentication**: Implement `ADMIN_TOKEN` verification for all `/api/admin/*` endpoints.
- **Environment Sanitization**: Ensure `_write_env()` strips newlines and carriage returns to prevent injection.
- **Self-Update Sandboxing**: Replace `curl | bash` with a safer `git pull` and controlled rebuild process.
- **CORS Hardening**: Replace wildcard `*` with explicit allowed origins in production.

## High Priority: Reliability & Correctness
- **Transaction Integrity**: Fix `create_item` to commit outside the loop to ensure atomic operations.
- **Race Condition Prevention**: Fix `preview_sample` in `labels.py` to avoid mutating the global settings object.
- **Input Validation**: Implement strict file size and type validation for photo uploads.
- **Path Traversal Protection**: Ensure `get_photo` verifies that resolved paths are within the intended directory.

## Medium Priority: API & Performance
- **Scalability**: Add pagination (`skip`/`limit`) to all list and search endpoints.
- **Robustness**: Implement a global exception handler and structured request logging.
- **Health Checks**: Enhance the `/health` endpoint to verify actual database connectivity.
- **Optimization**: Resolve the N+1 query issue in the shopping suggestion endpoint.

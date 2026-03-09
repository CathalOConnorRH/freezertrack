import os
import subprocess
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/api/admin", tags=["admin"])

_SEARCH_PATHS = [
    os.environ.get("FREEZERTRACK_ENV_PATH", ""),
    "/opt/freezertrack/.env",
    os.path.join(os.getcwd(), ".env"),
    os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
]

_update_state = {
    "running": False,
    "log": "",
    "started_at": None,
    "finished_at": None,
    "exit_code": None,
}

EDITABLE_KEYS = {
    "NIIMBOT_MAC",
    "AUTO_PRINT",
    "UPC_ITEM_DB_KEY",
    "BARCODE_CACHE_TTL_SECONDS",
    "ALERT_DAYS_FROZEN",
    "LOW_STOCK_THRESHOLD",
}


def _resolve_env_path() -> str:
    for p in _SEARCH_PATHS:
        if p and os.path.isfile(p):
            return os.path.abspath(p)
        if p and os.path.isfile(os.path.abspath(p)):
            return os.path.abspath(p)
    return os.path.abspath(".env")


def _read_env() -> dict:
    result = {}
    path = _resolve_env_path()
    if not os.path.exists(path):
        return result
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                result[key.strip()] = value.strip()
    return result


def _write_env(data: dict) -> None:
    path = _resolve_env_path()
    lines = []
    for key, value in data.items():
        lines.append(f"{key}={value}")
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


@router.get("/config")
def get_config():
    env = _read_env()
    return {
        "settings": {k: env.get(k, "") for k in EDITABLE_KEYS},
        "readonly": {
            "DATABASE_URL": env.get("DATABASE_URL", ""),
        },
    }


class ConfigUpdate(BaseModel):
    settings: dict[str, str]


@router.patch("/config")
def update_config(payload: ConfigUpdate):
    env = _read_env()
    changed = []
    for key, value in payload.settings.items():
        if key not in EDITABLE_KEYS:
            raise HTTPException(status_code=400, detail=f"Cannot edit {key}")
        if env.get(key) != str(value):
            env[key] = str(value)
            changed.append(key)

    if changed:
        _write_env(env)

    return {"updated": changed, "restart_required": bool(changed)}


@router.post("/update")
def trigger_update():
    if _update_state["running"]:
        raise HTTPException(status_code=409, detail="Update already in progress")

    _update_state["running"] = True
    _update_state["log"] = ""
    _update_state["started_at"] = datetime.now(timezone.utc).isoformat()
    _update_state["finished_at"] = None
    _update_state["exit_code"] = None

    def run():
        try:
            proc = subprocess.Popen(
                [
                    "bash",
                    "-c",
                    "curl -fsSL https://raw.githubusercontent.com/CathalOConnorRH/freezertrack/main/install.sh | bash",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            for line in proc.stdout:
                _update_state["log"] += line
            proc.wait()
            _update_state["exit_code"] = proc.returncode
        except Exception as e:
            _update_state["log"] += f"\nError: {e}\n"
            _update_state["exit_code"] = -1
        finally:
            _update_state["running"] = False
            _update_state["finished_at"] = datetime.now(timezone.utc).isoformat()

    threading.Thread(target=run, daemon=True).start()
    return {"status": "started"}


@router.get("/update/status")
def update_status():
    return _update_state


@router.post("/restart")
def restart_service():
    try:
        result = subprocess.run(
            ["systemctl", "restart", "freezertrack"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return {
            "success": result.returncode == 0,
            "output": result.stdout + result.stderr,
        }
    except Exception as e:
        return {"success": False, "output": str(e)}

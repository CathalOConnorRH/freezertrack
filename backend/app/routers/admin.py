import csv
import io
import json
import os
import shutil
import subprocess
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.food import FoodItem
from app.schemas.food import FoodItemResponse

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
    "LABEL_WIDTH",
    "LABEL_HEIGHT",
    "LABEL_FONT_SIZE",
    "LABEL_SHOW_NOTES",
    "LABEL_SHOW_BRAND",
    "LABEL_SHOW_CATEGORY",
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


def _get_db_path() -> str:
    url = settings.DATABASE_URL
    if url.startswith("sqlite:////"):
        return url[len("sqlite:////") :]
    if url.startswith("sqlite:///"):
        return url[len("sqlite:///") :]
    return ""


# ── Config ───────────────────────────────────────────────────────────────────


@router.get("/config")
def get_config():
    try:
        env_path = _resolve_env_path()
        env = _read_env()
        return {
            "settings": {k: env.get(k, "") for k in EDITABLE_KEYS},
            "readonly": {
                "DATABASE_URL": env.get("DATABASE_URL", ""),
            },
            "env_path": env_path,
            "env_found": os.path.exists(env_path),
        }
    except Exception as e:
        return {
            "settings": {k: "" for k in EDITABLE_KEYS},
            "readonly": {"DATABASE_URL": ""},
            "error": str(e),
            "searched_paths": [p for p in _SEARCH_PATHS if p],
            "cwd": os.getcwd(),
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


# ── Export ───────────────────────────────────────────────────────────────────


@router.get("/export/csv")
def export_csv(active_only: bool = False, db: Session = Depends(get_db)):
    query = db.query(FoodItem)
    if active_only:
        query = query.filter(FoodItem.removed_at.is_(None))
    items = query.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "name", "brand", "frozen_date", "quantity",
        "notes", "removed_at", "created_at", "qr_code_id",
    ])
    for item in items:
        writer.writerow([
            item.id, item.name, item.brand or "", str(item.frozen_date),
            item.quantity, item.notes or "",
            str(item.removed_at) if item.removed_at else "",
            str(item.created_at), item.qr_code_id,
        ])

    output.seek(0)
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename = f"freezertrack-export-{today}.csv"
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/json")
def export_json(active_only: bool = False, db: Session = Depends(get_db)):
    query = db.query(FoodItem)
    if active_only:
        query = query.filter(FoodItem.removed_at.is_(None))
    items = query.all()

    data = [FoodItemResponse.model_validate(i).model_dump(mode="json") for i in items]
    output = json.dumps(data, indent=2, default=str)

    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename = f"freezertrack-export-{today}.json"
    return StreamingResponse(
        io.StringIO(output),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Backup / Restore ────────────────────────────────────────────────────────


@router.get("/backup")
def download_backup():
    db_path = _get_db_path()
    if not db_path or not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Database file not found")

    today = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"freezertrack-backup-{today}.db"
    return FileResponse(
        db_path,
        media_type="application/octet-stream",
        filename=filename,
    )


@router.post("/restore")
async def restore_backup(file: UploadFile, confirm: bool = False):
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="Add ?confirm=true to confirm database replacement",
        )

    content = await file.read()
    if not content[:16].startswith(b"SQLite format 3"):
        raise HTTPException(status_code=400, detail="Invalid SQLite file")

    db_path = _get_db_path()
    if not db_path:
        raise HTTPException(status_code=500, detail="Cannot determine database path")

    backup_path = db_path + ".bak"
    if os.path.exists(db_path):
        shutil.copy2(db_path, backup_path)

    with open(db_path, "wb") as f:
        f.write(content)

    return {
        "success": True,
        "message": "Database restored. Restart the service to apply.",
        "backup_of_previous": backup_path,
    }


# ── Update ───────────────────────────────────────────────────────────────────


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

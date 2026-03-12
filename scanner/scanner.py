#!/usr/bin/env python3
"""
FreezerTrack Barcode Scanner Service

Reads barcodes from a USB HID scanner (e.g. NetumScan) and sends them
to the FreezerTrack API for scan-out. Grabs exclusive access to the
input device so keystrokes don't leak into the terminal.

Usage:
  sudo python3 scanner.py --api http://192.168.1.100 --device /dev/input/event0

Environment variables (alternative to CLI args):
  FREEZERTRACK_API_URL    e.g. http://192.168.1.100
  SCANNER_DEVICE          e.g. /dev/input/event0  (auto-detect if not set)
  SCANNER_MODE            "out" (default) or "in"
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

import evdev
import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("scanner")

STATE_FILE = os.environ.get(
    "SCANNER_STATE_FILE", "/opt/freezertrack-scanner/state.json"
)
MAX_HISTORY = 50

_state = {
    "api_connected": False,
    "usb_connected": False,
    "scanner_device": None,
    "scanner_device_name": None,
    "api_url": None,
    "mode": "out",
    "last_scan": None,
    "last_scan_time": None,
    "last_scan_result": None,
    "total_scans": 0,
    "successful_scans": 0,
    "failed_scans": 0,
    "uptime_since": None,
    "scan_history": [],
}

KEYMAP = {
    evdev.ecodes.KEY_0: ("0", ")"), evdev.ecodes.KEY_1: ("1", "!"),
    evdev.ecodes.KEY_2: ("2", "@"), evdev.ecodes.KEY_3: ("3", "#"),
    evdev.ecodes.KEY_4: ("4", "$"), evdev.ecodes.KEY_5: ("5", "%"),
    evdev.ecodes.KEY_6: ("6", "^"), evdev.ecodes.KEY_7: ("7", "&"),
    evdev.ecodes.KEY_8: ("8", "*"), evdev.ecodes.KEY_9: ("9", "("),
    evdev.ecodes.KEY_A: ("a", "A"), evdev.ecodes.KEY_B: ("b", "B"),
    evdev.ecodes.KEY_C: ("c", "C"), evdev.ecodes.KEY_D: ("d", "D"),
    evdev.ecodes.KEY_E: ("e", "E"), evdev.ecodes.KEY_F: ("f", "F"),
    evdev.ecodes.KEY_G: ("g", "G"), evdev.ecodes.KEY_H: ("h", "H"),
    evdev.ecodes.KEY_I: ("i", "I"), evdev.ecodes.KEY_J: ("j", "J"),
    evdev.ecodes.KEY_K: ("k", "K"), evdev.ecodes.KEY_L: ("l", "L"),
    evdev.ecodes.KEY_M: ("m", "M"), evdev.ecodes.KEY_N: ("n", "N"),
    evdev.ecodes.KEY_O: ("o", "O"), evdev.ecodes.KEY_P: ("p", "P"),
    evdev.ecodes.KEY_Q: ("q", "Q"), evdev.ecodes.KEY_R: ("r", "R"),
    evdev.ecodes.KEY_S: ("s", "S"), evdev.ecodes.KEY_T: ("t", "T"),
    evdev.ecodes.KEY_U: ("u", "U"), evdev.ecodes.KEY_V: ("v", "V"),
    evdev.ecodes.KEY_W: ("w", "W"), evdev.ecodes.KEY_X: ("x", "X"),
    evdev.ecodes.KEY_Y: ("y", "Y"), evdev.ecodes.KEY_Z: ("z", "Z"),
    evdev.ecodes.KEY_MINUS: ("-", "_"),
    evdev.ecodes.KEY_EQUAL: ("=", "+"),
    evdev.ecodes.KEY_LEFTBRACE: ("[", "{"),
    evdev.ecodes.KEY_RIGHTBRACE: ("]", "}"),
    evdev.ecodes.KEY_SEMICOLON: (";", ":"),
    evdev.ecodes.KEY_APOSTROPHE: ("'", '"'),
    evdev.ecodes.KEY_GRAVE: ("`", "~"),
    evdev.ecodes.KEY_BACKSLASH: ("\\", "|"),
    evdev.ecodes.KEY_COMMA: (",", "<"),
    evdev.ecodes.KEY_DOT: (".", ">"),
    evdev.ecodes.KEY_SLASH: ("/", "?"),
    evdev.ecodes.KEY_SPACE: (" ", " "),
}


def save_state():
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(_state, f)
    except Exception:
        pass


def record_scan(barcode: str, success: bool):
    now = datetime.now(timezone.utc).isoformat()
    _state["last_scan"] = barcode
    _state["last_scan_time"] = now
    _state["last_scan_result"] = "ok" if success else "fail"
    _state["total_scans"] += 1
    if success:
        _state["successful_scans"] += 1
    else:
        _state["failed_scans"] += 1
    _state["scan_history"].insert(0, {
        "barcode": barcode,
        "success": success,
        "time": now,
    })
    _state["scan_history"] = _state["scan_history"][:MAX_HISTORY]
    save_state()


def check_api(api_url: str, client: httpx.Client) -> bool:
    try:
        r = client.get(f"{api_url.rstrip('/')}/health", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def find_scanner_device() -> str | None:
    devices = [evdev.InputDevice(path) for path in evdev.list_devices()]
    for dev in devices:
        name_lower = dev.name.lower()
        if any(kw in name_lower for kw in ("barcode", "scanner", "netum", "hid")):
            log.info(f"Auto-detected scanner: {dev.path} ({dev.name})")
            return dev.path

    for dev in devices:
        caps = dev.capabilities(verbose=False)
        has_keys = evdev.ecodes.EV_KEY in caps
        has_rel = evdev.ecodes.EV_REL in caps
        if has_keys and not has_rel:
            log.info(f"Possible scanner (keyboard-only HID): {dev.path} ({dev.name})")
            return dev.path

    return None


def list_devices():
    devices = [evdev.InputDevice(path) for path in evdev.list_devices()]
    if not devices:
        print("No input devices found. Are you running as root?")
        return
    print(f"\n{'Path':<25} {'Name':<40} {'Phys'}")
    print("-" * 90)
    for dev in devices:
        print(f"{dev.path:<25} {dev.name:<40} {dev.phys or ''}")
    print()


def read_barcodes(device_path: str):
    dev = evdev.InputDevice(device_path)
    log.info(f"Grabbing exclusive access to: {dev.name} ({device_path})")

    _state["scanner_device"] = device_path
    _state["scanner_device_name"] = dev.name
    _state["usb_connected"] = True
    save_state()

    dev.grab()
    buffer = []
    shift = False

    try:
        for event in dev.read_loop():
            if event.type != evdev.ecodes.EV_KEY:
                continue

            key_event = evdev.categorize(event)

            if key_event.keycode in ("KEY_LEFTSHIFT", "KEY_RIGHTSHIFT"):
                shift = event.value != 0
                continue

            if event.value != 1:
                continue

            if key_event.keycode == "KEY_ENTER":
                barcode = "".join(buffer)
                buffer.clear()
                if barcode:
                    yield barcode
                continue

            mapped = KEYMAP.get(event.code)
            if mapped:
                char = mapped[1] if shift else mapped[0]
                buffer.append(char)
    finally:
        _state["usb_connected"] = False
        save_state()
        dev.ungrab()


def handle_scan_out(barcode: str, api_url: str, client: httpx.Client) -> bool:
    base = api_url.rstrip("/")

    try:
        data = json.loads(barcode)
        if "id" in data:
            resp = client.post(f"{base}/api/food/{data['id']}/remove")
            if resp.status_code == 200:
                name = data.get("name", "Item")
                log.info(f"REMOVED: {name} (QR code ID: {data['id'][:8]})")
                return True
            else:
                log.warning(f"Remove failed ({resp.status_code}): {resp.text}")
                return False
    except (json.JSONDecodeError, TypeError):
        pass

    log.info(f"Looking up barcode: {barcode}")
    try:
        lookup = client.get(f"{base}/api/food/lookup/{barcode}")
        lookup_data = lookup.json()
        search_name = lookup_data.get("name", barcode) if lookup_data.get("found") else barcode

        search = client.get(f"{base}/api/food/search", params={"q": search_name})
        items = search.json()

        if not items:
            log.warning(f"NOT FOUND in freezer: {search_name}")
            return False

        oldest = min(items, key=lambda i: i["frozen_date"])
        resp = client.post(f"{base}/api/food/{oldest['id']}/remove")
        if resp.status_code == 200:
            log.info(f"REMOVED: {oldest['name']} (oldest, frozen {oldest['frozen_date']})")
            return True
        else:
            log.warning(f"Remove failed ({resp.status_code}): {resp.text}")
            return False

    except Exception as e:
        log.error(f"Scan-out error: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="FreezerTrack Barcode Scanner Service")
    parser.add_argument("--api", default=os.environ.get("FREEZERTRACK_API_URL", ""),
                        help="FreezerTrack API URL (e.g. http://192.168.1.100)")
    parser.add_argument("--device", default=os.environ.get("SCANNER_DEVICE", ""),
                        help="Input device path (e.g. /dev/input/event0). Auto-detects if not set.")
    parser.add_argument("--mode", default=os.environ.get("SCANNER_MODE", "out"),
                        choices=["out", "in"], help="Scan mode: out (remove) or in (add)")
    parser.add_argument("--list-devices", action="store_true", help="List input devices and exit")
    args = parser.parse_args()

    if args.list_devices:
        list_devices()
        sys.exit(0)

    if not args.api:
        log.error("No API URL set. Use --api or FREEZERTRACK_API_URL env var.")
        sys.exit(1)

    device_path = args.device or find_scanner_device()
    if not device_path:
        log.error("No scanner device found. Use --device or SCANNER_DEVICE env var.")
        log.error("Run with --list-devices to see available input devices.")
        sys.exit(1)

    _state["api_url"] = args.api
    _state["mode"] = args.mode
    _state["uptime_since"] = datetime.now(timezone.utc).isoformat()

    client = httpx.Client(timeout=10)
    _state["api_connected"] = check_api(args.api, client)
    save_state()

    log.info(f"FreezerTrack Scanner Service")
    log.info(f"  API:    {args.api} ({'connected' if _state['api_connected'] else 'UNREACHABLE'})")
    log.info(f"  Device: {device_path}")
    log.info(f"  Mode:   scan-{args.mode}")
    log.info(f"Waiting for scans...")

    try:
        for barcode in read_barcodes(device_path):
            log.info(f"SCANNED: {barcode}")

            _state["api_connected"] = check_api(args.api, client)

            if args.mode == "out":
                success = handle_scan_out(barcode, args.api, client)
            else:
                log.info(f"Scan-in mode not yet implemented. Barcode: {barcode}")
                success = False

            record_scan(barcode, success)

            if success:
                log.info(">>> OK")
            else:
                log.warning(">>> FAILED")

    except KeyboardInterrupt:
        log.info("Scanner stopped.")
    except PermissionError:
        log.error("Permission denied. Run with sudo or add your user to the 'input' group.")
        sys.exit(1)
    finally:
        _state["usb_connected"] = False
        save_state()
        client.close()


if __name__ == "__main__":
    main()

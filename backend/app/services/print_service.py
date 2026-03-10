# One-time Pi setup required before printing works:
#   bluetoothctl
#   > scan on
#   > pair AA:BB:CC:DD:EE:FF
#   > trust AA:BB:CC:DD:EE:FF
#   > quit
# Then set NIIMBOT_MAC=AA:BB:CC:DD:EE:FF in .env

import logging
import socket

from PIL import Image

logger = logging.getLogger(__name__)


def print_label(image_path: str, mac_address: str) -> bool:
    try:
        from niimprint import BluetoothTransport, PrinterClient

        image = Image.open(image_path)
        transport = BluetoothTransport(mac_address)
        client = PrinterClient(transport)
        client.print_image(image, density=3)
        return True
    except Exception:
        logger.exception("Failed to print label to %s", mac_address)
        return False


def check_printer(mac_address: str) -> dict:
    if not mac_address or mac_address == "AA:BB:CC:DD:EE:FF":
        return {"connected": False, "mac": mac_address, "error": "No printer configured"}

    try:
        sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
        sock.settimeout(3)
        sock.connect((mac_address, 1))
        sock.close()
        return {"connected": True, "mac": mac_address}
    except OSError as e:
        return {"connected": False, "mac": mac_address, "error": str(e)}
    except Exception as e:
        return {"connected": False, "mac": mac_address, "error": str(e)}

# One-time Pi setup required before printing works:
#   bluetoothctl
#   > scan on
#   > pair AA:BB:CC:DD:EE:FF
#   > trust AA:BB:CC:DD:EE:FF
#   > quit
# Then set NIIMBOT_MAC=AA:BB:CC:DD:EE:FF in .env

import logging

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

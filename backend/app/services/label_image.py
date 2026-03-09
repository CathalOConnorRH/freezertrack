import os

from PIL import Image, ImageDraw, ImageFont

from app.schemas.food import FoodItemResponse


def compose_label(item: FoodItemResponse, qr_path: str, output_path: str) -> str:
    canvas = Image.new("RGB", (400, 240), "white")
    draw = ImageDraw.Draw(canvas)

    qr_img = Image.open(qr_path)
    qr_size = 130 - 16  # 8px padding on each side
    qr_img = qr_img.resize((qr_size, qr_size), Image.NEAREST)
    canvas.paste(qr_img, (8, 8))

    draw.line([(135, 0), (135, 240)], fill="#CCCCCC", width=1)

    try:
        font_large = ImageFont.truetype("DejaVuSans-Bold.ttf", 22)
    except (IOError, OSError):
        font_large = ImageFont.load_default()

    try:
        font_medium = ImageFont.truetype("DejaVuSans.ttf", 16)
    except (IOError, OSError):
        font_medium = ImageFont.load_default()

    try:
        font_small = ImageFont.truetype("DejaVuSans.ttf", 11)
    except (IOError, OSError):
        font_small = ImageFont.load_default()

    text_x = 140
    name = item.name if len(item.name) <= 18 else item.name[:15] + "..."
    draw.text((text_x, 20), name, fill="black", font=font_large)

    frozen_str = item.frozen_date.strftime("%d %b %Y")
    draw.text((text_x, 60), f"Frozen: {frozen_str}", fill="black", font=font_medium)

    draw.text(
        (text_x, 90),
        f"Qty: {item.quantity} serving(s)",
        fill="black",
        font=font_medium,
    )

    draw.text((text_x, 200), item.id[:8], fill="#888888", font=font_small)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    canvas.save(output_path)
    return output_path

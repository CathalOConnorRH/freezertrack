import os

from PIL import Image, ImageDraw, ImageFont

from app.config import settings
from app.schemas.food import FoodItemResponse


def compose_label(
    item: FoodItemResponse,
    qr_path: str,
    output_path: str,
    *,
    width: int | None = None,
    height: int | None = None,
    font_size: int | None = None,
    show_brand: bool | None = None,
    show_notes: bool | None = None,
    show_category: bool | None = None,
) -> str:
    w = width if width is not None else settings.LABEL_WIDTH
    h = height if height is not None else settings.LABEL_HEIGHT
    fs = font_size if font_size is not None else settings.LABEL_FONT_SIZE
    s_brand = show_brand if show_brand is not None else settings.LABEL_SHOW_BRAND
    s_notes = show_notes if show_notes is not None else settings.LABEL_SHOW_NOTES
    s_category = show_category if show_category is not None else settings.LABEL_SHOW_CATEGORY

    canvas = Image.new("RGB", (w, h), "white")
    draw = ImageDraw.Draw(canvas)

    qr_section_w = int(w * 0.325)
    qr_img = Image.open(qr_path)
    qr_size = qr_section_w - 16
    qr_img = qr_img.resize((qr_size, qr_size), Image.NEAREST)
    canvas.paste(qr_img, (8, 8))

    divider_x = qr_section_w + 5
    draw.line([(divider_x, 0), (divider_x, h)], fill="#CCCCCC", width=1)

    try:
        font_large = ImageFont.truetype("DejaVuSans-Bold.ttf", fs)
    except (IOError, OSError):
        font_large = ImageFont.load_default()

    med_size = max(fs - 6, 10)
    try:
        font_medium = ImageFont.truetype("DejaVuSans.ttf", med_size)
    except (IOError, OSError):
        font_medium = ImageFont.load_default()

    try:
        font_small = ImageFont.truetype("DejaVuSans.ttf", max(fs - 11, 8))
    except (IOError, OSError):
        font_small = ImageFont.load_default()

    text_x = divider_x + 8
    y = 12

    max_chars = max(12, (w - text_x - 8) // (fs // 2))
    name = item.name if len(item.name) <= max_chars else item.name[: max_chars - 3] + "..."
    draw.text((text_x, y), name, fill="black", font=font_large)
    y += fs + 8

    if s_brand and item.brand:
        brand_text = item.brand if len(item.brand) <= max_chars else item.brand[: max_chars - 3] + "..."
        draw.text((text_x, y), brand_text, fill="#666666", font=font_medium)
        y += med_size + 6

    frozen_str = item.frozen_date.strftime("%d %b %Y")
    draw.text((text_x, y), f"Frozen: {frozen_str}", fill="black", font=font_medium)
    y += med_size + 6

    draw.text((text_x, y), f"Qty: {item.quantity} serving(s)", fill="black", font=font_medium)
    y += med_size + 6

    if s_category and item.category:
        draw.text((text_x, y), item.category, fill="#888888", font=font_small)
        y += med_size + 4

    if s_notes and item.notes:
        notes_text = item.notes if len(item.notes) <= 30 else item.notes[:27] + "..."
        draw.text((text_x, y), notes_text, fill="#888888", font=font_small)

    draw.text((text_x, h - 18), item.id[:8], fill="#888888", font=font_small)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    canvas.save(output_path)
    return output_path

"""生成 32px 指针在多种背景上的实际尺寸和放大预览。"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CURSOR = ROOT / "output" / "arrow_32.png"
DEFAULT_OUTPUT = ROOT / "output" / "preview.png"

CANVAS_SIZE = (1200, 900)
CARD_SIZE = (560, 350)
ZOOM = 8


def load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    """优先使用 Windows 中文字体，其余环境回退到 Pillow 默认字体。"""
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def vertical_gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    image = Image.new("RGBA", size)
    pixels = image.load()
    height = max(1, size[1] - 1)
    for y in range(size[1]):
        t = y / height
        color = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3)) + (255,)
        for x in range(size[0]):
            pixels[x, y] = color
    return image


def checker_background(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGBA", size, (232, 237, 242, 255))
    draw = ImageDraw.Draw(image)
    cell = 24
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(196, 207, 218, 255))
    font = load_font(31, bold=True)
    draw.text((28, 132), "Complex UI 复杂背景", font=font, fill=(27, 55, 76, 220))
    draw.line((28, 178, size[0] - 30, 178), fill=(57, 112, 148, 190), width=3)
    draw.rounded_rectangle((28, 210, 245, 270), radius=16, fill=(20, 112, 170, 220))
    draw.text((62, 220), "示例按钮", font=load_font(23, bold=True), fill=(255, 255, 255, 255))
    return image


def make_background(kind: str, size: tuple[int, int]) -> Image.Image:
    if kind == "white":
        return Image.new("RGBA", size, (248, 250, 252, 255))
    if kind == "dark":
        return vertical_gradient(size, (28, 39, 53), (5, 12, 22))
    if kind == "color":
        base = vertical_gradient(size, (71, 65, 190), (0, 195, 188))
        draw = ImageDraw.Draw(base, "RGBA")
        draw.ellipse((260, -100, 630, 270), fill=(255, 99, 170, 128))
        draw.ellipse((-80, 180, 270, 500), fill=(81, 213, 255, 150))
        return base
    if kind == "complex":
        return checker_background(size)
    raise ValueError(f"未知背景类型：{kind}")


def draw_card(canvas: Image.Image, position: tuple[int, int], kind: str, title: str, cursor: Image.Image) -> None:
    x, y = position
    card = make_background(kind, CARD_SIZE)
    draw = ImageDraw.Draw(card, "RGBA")
    is_dark = kind in {"dark", "color"}
    primary = (255, 255, 255, 245) if is_dark else (19, 42, 60, 245)
    secondary = (225, 238, 247, 220) if is_dark else (53, 78, 95, 220)

    draw.rounded_rectangle((0, 0, CARD_SIZE[0] - 1, CARD_SIZE[1] - 1), radius=20, outline=(112, 151, 176, 150), width=2)
    draw.text((24, 18), title, font=load_font(25, bold=True), fill=primary)
    draw.text((26, 64), "实际 32×32", font=load_font(19), fill=secondary)

    actual_anchor = (80, 128)
    card.alpha_composite(cursor, actual_anchor)
    draw.rectangle((actual_anchor[0] - 1, actual_anchor[1] - 1, actual_anchor[0] + 32, actual_anchor[1] + 32), outline=(105, 170, 208, 120), width=1)

    zoomed = cursor.resize((32 * ZOOM, 32 * ZOOM), Image.Resampling.NEAREST)
    zoom_anchor = (260, 68)
    checker = Image.new("RGBA", zoomed.size, (224, 230, 236, 255))
    checker_draw = ImageDraw.Draw(checker)
    for cy in range(0, zoomed.height, 16):
        for cx in range(0, zoomed.width, 16):
            if (cx // 16 + cy // 16) % 2:
                checker_draw.rectangle((cx, cy, cx + 15, cy + 15), fill=(191, 202, 213, 255))
    checker.alpha_composite(zoomed)
    card.alpha_composite(checker, zoom_anchor)
    draw.rectangle((zoom_anchor[0] - 1, zoom_anchor[1] - 1, zoom_anchor[0] + zoomed.width, zoom_anchor[1] + zoomed.height), outline=(96, 143, 171, 210), width=2)
    draw.text((zoom_anchor[0], 326), "放大预览 8×（仅供像素检查）", font=load_font(16), fill=secondary)

    canvas.alpha_composite(card, (x, y))


def generate_preview(cursor_path: Path = DEFAULT_CURSOR, output_path: Path = DEFAULT_OUTPUT) -> None:
    cursor = Image.open(cursor_path).convert("RGBA")
    if cursor.size != (32, 32):
        raise ValueError(f"预览要求 32×32 指针，当前为 {cursor.size}")

    canvas = vertical_gradient(CANVAS_SIZE, (238, 245, 250), (207, 220, 231))
    draw = ImageDraw.Draw(canvas, "RGBA")
    draw.text((40, 28), "LiquidGlassCursor V0.1 — Crystal Refraction Arrow", font=load_font(34, bold=True), fill=(18, 43, 61, 255))
    draw.text((42, 78), "真实尺寸评估与透明材质检查", font=load_font(20), fill=(61, 86, 103, 235))

    cards = [
        ((30, 125), "white", "白色背景"),
        ((610, 125), "dark", "深色背景"),
        ((30, 505), "color", "彩色渐变背景"),
        ((610, 505), "complex", "文字 / 棋盘格复杂背景"),
    ]
    for position, kind, title in cards:
        draw_card(canvas, position, kind, title, cursor)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output_path, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 LiquidGlassCursor 多背景预览")
    parser.add_argument("--cursor", type=Path, default=DEFAULT_CURSOR, help="32×32 RGBA 指针 PNG")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="预览输出路径")
    args = parser.parse_args()
    generate_preview(args.cursor, args.output)
    print(f"已生成：{args.output}")


if __name__ == "__main__":
    main()

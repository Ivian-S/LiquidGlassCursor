"""构建 LiquidGlassCursor 的 PNG、CUR 与预览图。

CUR 使用 Windows Vista 及更高版本支持的 PNG 图像载荷，从而保留
32 位 RGBA Alpha。文件目录项中的 Hotspot 指向箭头尖端。
"""

from __future__ import annotations

import argparse
import io
import struct
from pathlib import Path

from PIL import Image
from resvg_py import svg_to_bytes

ROOT = Path(__file__).resolve().parents[1]
SVG_PATH = ROOT / "assets" / "arrow.svg"
OUTPUT_DIR = ROOT / "output"
SIZES = (32, 48, 64)
LOGICAL_SIZE = 64
HOTSPOT_LOGICAL = (2, 2)


def hotspot_for_size(size: int) -> tuple[int, int]:
    """把 SVG 逻辑坐标中的尖端转换为目标像素坐标。"""
    scale = size / LOGICAL_SIZE
    return (round(HOTSPOT_LOGICAL[0] * scale), round(HOTSPOT_LOGICAL[1] * scale))


def render_svg(size: int, output_path: Path) -> Image.Image:
    """使用 resvg 渲染 SVG，并强制保存为 RGBA PNG。"""
    png_bytes = svg_to_bytes(
        svg_path=str(SVG_PATH),
        width=size,
        height=size,
        shape_rendering="geometric_precision",
        image_rendering="optimize_quality",
    )
    image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, format="PNG", optimize=True)
    return image


def write_cur(png_path: Path, cur_path: Path, hotspot: tuple[int, int]) -> None:
    """把一张 RGBA PNG 封装为单图 Windows CUR 文件。"""
    with Image.open(png_path) as image:
        width, height = image.size
        if image.mode != "RGBA":
            raise ValueError(f"CUR 源图必须为 RGBA，当前为 {image.mode}")

    if not (1 <= width <= 256 and 1 <= height <= 256):
        raise ValueError("CUR 图像尺寸必须在 1..256 像素范围内")

    hotspot_x, hotspot_y = hotspot
    if not (0 <= hotspot_x < width and 0 <= hotspot_y < height):
        raise ValueError("Hotspot 必须位于图像范围内")

    png_data = png_path.read_bytes()
    header = struct.pack("<HHH", 0, 2, 1)
    directory_entry = struct.pack(
        "<BBBBHHII",
        0 if width == 256 else width,
        0 if height == 256 else height,
        0,
        0,
        hotspot_x,
        hotspot_y,
        len(png_data),
        6 + 16,
    )
    cur_path.write_bytes(header + directory_entry + png_data)


def build() -> None:
    """生成任务要求的所有输出。"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        png_path = OUTPUT_DIR / f"arrow_{size}.png"
        render_svg(size, png_path)
        print(f"已生成：{png_path.relative_to(ROOT)}")

    cursor_png = OUTPUT_DIR / "arrow_32.png"
    cursor_path = OUTPUT_DIR / "arrow_32.cur"
    write_cur(cursor_png, cursor_path, hotspot_for_size(32))
    print(
        f"已生成：{cursor_path.relative_to(ROOT)} "
        f"(Hotspot={hotspot_for_size(32)})"
    )

    try:
        from .preview import generate_preview
    except ImportError:
        from preview import generate_preview

    preview_path = OUTPUT_DIR / "preview.png"
    generate_preview(cursor_png, preview_path)
    print(f"已生成：{preview_path.relative_to(ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="构建 LiquidGlassCursor V0.1")
    parser.parse_args()
    build()


if __name__ == "__main__":
    main()

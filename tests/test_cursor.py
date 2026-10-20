"""LiquidGlassCursor V0.1 的构建产物验收测试。"""

from __future__ import annotations

import ctypes
import os
import struct
import subprocess
import sys
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output"
PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
EXPECTED_PNGS = {32: OUTPUT / "arrow_32.png", 48: OUTPUT / "arrow_48.png", 64: OUTPUT / "arrow_64.png"}
CUR_PATH = OUTPUT / "arrow_32.cur"
PREVIEW_PATH = OUTPUT / "preview.png"
EXPECTED_HOTSPOT = (1, 1)


def read_cur_header(path: Path) -> dict[str, int | bytes]:
    data = path.read_bytes()
    if len(data) < 22:
        raise AssertionError("CUR 文件短于最小头部长度")

    reserved, image_type, count = struct.unpack_from("<HHH", data, 0)
    width_byte, height_byte, color_count, entry_reserved, hotspot_x, hotspot_y, size, offset = struct.unpack_from(
        "<BBBBHHII", data, 6
    )
    width = 256 if width_byte == 0 else width_byte
    height = 256 if height_byte == 0 else height_byte
    payload = data[offset : offset + size]
    return {
        "reserved": reserved,
        "image_type": image_type,
        "count": count,
        "width": width,
        "height": height,
        "color_count": color_count,
        "entry_reserved": entry_reserved,
        "hotspot_x": hotspot_x,
        "hotspot_y": hotspot_y,
        "size": size,
        "offset": offset,
        "payload": payload,
        "file_size": len(data),
    }


class CursorBuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        python = PYTHON if PYTHON.exists() else Path(sys.executable)
        result = subprocess.run(
            [str(python), str(ROOT / "scripts" / "build.py")],
            cwd=ROOT,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            stdout = result.stdout.decode(errors="replace")
            stderr = result.stderr.decode(errors="replace")
            raise AssertionError(f"构建失败：\nSTDOUT:\n{stdout}\nSTDERR:\n{stderr}")

    def test_required_output_files_exist(self) -> None:
        for path in [*EXPECTED_PNGS.values(), CUR_PATH, PREVIEW_PATH]:
            with self.subTest(path=path.name):
                self.assertTrue(path.is_file(), f"缺少输出文件：{path}")
                self.assertGreater(path.stat().st_size, 0)

    def test_png_dimensions_mode_and_alpha(self) -> None:
        for size, path in EXPECTED_PNGS.items():
            with self.subTest(size=size), Image.open(path) as image:
                self.assertEqual(image.size, (size, size))
                self.assertEqual(image.mode, "RGBA")
                alpha = image.getchannel("A")
                extrema = alpha.getextrema()
                self.assertEqual(extrema[0], 0, "必须包含完全透明像素")
                self.assertGreater(extrema[1], 0)
                histogram = alpha.histogram()
                self.assertGreater(sum(histogram[1:255]), 0, "必须包含半透明像素")

    def test_32px_cursor_has_clear_compact_silhouette(self) -> None:
        with Image.open(EXPECTED_PNGS[32]) as image:
            rgba = image.convert("RGBA")
            alpha = rgba.getchannel("A")
            bbox = alpha.getbbox()
            self.assertIsNotNone(bbox)
            assert bbox is not None
            self.assertLessEqual(bbox[0], 1, "箭头尖端应靠近左上角")
            self.assertLessEqual(bbox[1], 1, "箭头尖端应靠近左上角")
            self.assertGreaterEqual(bbox[2], 28, "轮廓宽度不足")
            self.assertGreaterEqual(bbox[3], 29, "轮廓高度不足")
            visible_pixels = sum(1 for value in alpha.get_flattened_data() if value >= 64)
            self.assertGreater(visible_pixels, 100, "32px 轮廓过于稀薄")

    def test_cur_header_dimensions_payload_and_hotspot(self) -> None:
        header = read_cur_header(CUR_PATH)
        self.assertEqual(header["reserved"], 0)
        self.assertEqual(header["image_type"], 2, "CUR 类型字段必须为 2")
        self.assertEqual(header["count"], 1)
        self.assertEqual((header["width"], header["height"]), (32, 32))
        self.assertEqual((header["hotspot_x"], header["hotspot_y"]), EXPECTED_HOTSPOT)
        self.assertTrue(0 <= int(header["hotspot_x"]) < int(header["width"]))
        self.assertTrue(0 <= int(header["hotspot_y"]) < int(header["height"]))
        self.assertEqual(header["offset"], 22)
        self.assertEqual(int(header["offset"]) + int(header["size"]), header["file_size"])
        self.assertTrue(bytes(header["payload"]).startswith(b"\x89PNG\r\n\x1a\n"))

    def test_cur_embedded_png_matches_source(self) -> None:
        header = read_cur_header(CUR_PATH)
        self.assertEqual(bytes(header["payload"]), EXPECTED_PNGS[32].read_bytes())

    @unittest.skipUnless(os.name == "nt", "仅在 Windows 上验证系统光标加载")
    def test_windows_can_load_cursor(self) -> None:
        user32 = ctypes.WinDLL("user32", use_last_error=True)
        load_image = user32.LoadImageW
        load_image.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_uint, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
        load_image.restype = ctypes.c_void_p
        destroy_cursor = user32.DestroyCursor
        destroy_cursor.argtypes = [ctypes.c_void_p]
        destroy_cursor.restype = ctypes.c_bool

        IMAGE_CURSOR = 2
        LR_LOADFROMFILE = 0x0010
        LR_DEFAULTSIZE = 0x0040
        handle = load_image(None, str(CUR_PATH), IMAGE_CURSOR, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE)
        error_code = ctypes.get_last_error()
        self.assertTrue(handle, f"Windows LoadImageW 无法加载 CUR，错误码：{error_code}")
        if handle:
            destroy_cursor(handle)


if __name__ == "__main__":
    unittest.main(verbosity=2)

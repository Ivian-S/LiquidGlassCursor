"""V0.2 WebGL2 实验的静态完整性测试。"""

from __future__ import annotations

import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / "experiments" / "liquid_glass_lab"


class LiquidGlassLabTests(unittest.TestCase):
    def test_required_files_exist(self) -> None:
        for name in ("index.html", "styles.css", "app.js", "serve.py", "README.md"):
            with self.subTest(name=name):
                self.assertTrue((LAB / name).is_file())

    def test_v01_svg_has_reusable_arrow_clip(self) -> None:
        root = ET.parse(ROOT / "assets" / "arrow.svg").getroot()
        namespace = {"svg": "http://www.w3.org/2000/svg"}
        path = root.find(".//svg:clipPath[@id='arrowClip']/svg:path", namespace)
        self.assertIsNotNone(path)
        self.assertGreater(len(path.attrib.get("d", "")), 80)

    def test_lab_fetches_existing_svg_and_uses_webgl2(self) -> None:
        script = (LAB / "app.js").read_text(encoding="utf-8")
        self.assertIn("fetch('../../assets/arrow.svg'", script)
        self.assertIn("getContext('webgl2'", script)
        self.assertIn("clipPath#arrowClip", script)
        self.assertIn("texture(u_background, refractedUv", script)
        self.assertIn("glass.r = texture(u_background, refractedUv + channelShift).r", script)
        self.assertIn("glass.b = texture(u_background, refractedUv - channelShift).b", script)

    def test_all_effects_have_independent_controls(self) -> None:
        html = (LAB / "index.html").read_text(encoding="utf-8")
        for control_id in (
            "enableRefraction", "enableBlur", "enableEdge", "enableDispersion", "enableSpecular",
            "refraction", "blur", "edge", "dispersion", "specular",
        ):
            with self.subTest(control_id=control_id):
                self.assertRegex(html, rf'id="{re.escape(control_id)}"')

    def test_no_external_cdn_or_remote_assets(self) -> None:
        content = "\n".join((LAB / name).read_text(encoding="utf-8") for name in ("index.html", "styles.css", "app.js"))
        self.assertNotRegex(content, r"(?:src|href)=[\"']https?://")
        self.assertNotRegex(content, r"@import\s+(?:url\()?\s*[\"']?https?://")


if __name__ == "__main__":
    unittest.main(verbosity=2)

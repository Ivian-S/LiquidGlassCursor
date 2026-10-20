"""从项目根目录启动 V0.2 本地实验服务器。"""

from __future__ import annotations

import argparse
import http.server
import socketserver
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        print(f"[Liquid Glass Lab] {format % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="启动 LiquidGlassCursor V0.2 WebGL2 实验页")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址，默认仅本机访问")
    parser.add_argument("--port", default=8765, type=int, help="监听端口，默认 8765")
    args = parser.parse_args()

    handler = lambda *handler_args, **handler_kwargs: QuietHandler(
        *handler_args, directory=str(ROOT), **handler_kwargs
    )
    with socketserver.TCPServer((args.host, args.port), handler) as server:
        url = f"http://{args.host}:{args.port}/experiments/liquid_glass_lab/"
        print(f"Liquid Glass Lab 已启动：{url}")
        print("按 Ctrl+C 停止服务器。")
        server.serve_forever()


if __name__ == "__main__":
    main()

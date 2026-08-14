#!/usr/bin/env python3
"""Локальный сервер игр: статика с корня репо + POST /log/round в журнал."""

from __future__ import annotations

import argparse
import json
import signal
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import journal

ROOT = Path(__file__).resolve().parent.parent


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self) -> None:
        if urlparse(self.path).path.rstrip("/") != "/log/round":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            message = journal.add_round(
                game=str(payload.get("game") or ""),
                pack=str(payload.get("pack") or ""),
                correct=int(payload["correct"]),
                total=int(payload["total"]),
                minutes=None if payload.get("minutes") is None else int(payload["minutes"]),
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            journal.log_error(str(exc))
            self._send_json(400, {"ok": False, "error": str(exc)})
            return
        except journal.JournalError as exc:
            journal.log_error(str(exc))
            self._send_json(400, {"ok": False, "error": str(exc)})
            return
        journal.log_success(message)
        self._send_json(200, {"ok": True, "message": message})

    def _send_json(self, status: int, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def _watch_off(stop: threading.Event) -> None:
    for line in sys.stdin:
        if line.strip().lower() == "off":
            stop.set()
            return


def _shutdown_when_stopped(httpd: ThreadingHTTPServer, stop: threading.Event) -> None:
    stop.wait()
    httpd.shutdown()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="serve.py")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args(argv)
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    journal.log_success(f"http://127.0.0.1:{args.port}/games/")
    if sys.stdin.isatty():
        journal.log_success("off — остановить сервер")

    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    threading.Thread(target=_shutdown_when_stopped, args=(httpd, stop), daemon=True).start()
    if sys.stdin.isatty():
        threading.Thread(target=_watch_off, args=(stop,), daemon=True).start()

    httpd.serve_forever()
    httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

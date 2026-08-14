#!/usr/bin/env python3
"""Дневник занятий. Точка входа — ./Xfile session и ./Xfile minutes."""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "log"
START_RE = re.compile(r"^- Старт: (\d{2}:\d{2})\s*$")
MINUTES_PREFIX = "- Минуты:"


def _log(emoji: str, color: str, message: str) -> None:
    print(f"{emoji} \033[{color}m{message}\033[0m", file=sys.stderr)


def log_success(message: str) -> None:
    _log("✅", "32", message)


def log_error(message: str) -> None:
    _log("❌", "31", message)


class JournalError(Exception):
    pass


def today_path(now: datetime | None = None) -> Path:
    now = now or datetime.now()
    return LOG_DIR / f"{now.date().isoformat()}.md"


def start_session(focus: str = "", now: datetime | None = None) -> str:
    now = now or datetime.now()
    path = today_path(now)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    date = now.date().isoformat()
    time = now.strftime("%H:%M")
    if not path.exists():
        path.write_text(f"# {date}\n\n", encoding="utf-8")
    block = (
        f"## {time}\n\n"
        f"- Старт: {time}\n"
        f"- Минуты:\n"
        f"- Фокус: {focus}\n"
        f"- Новое:\n"
        f"- Что путалось:\n"
        f"- 3 фразы вслух:\n\n"
    )
    with path.open("a", encoding="utf-8") as fh:
        fh.write(block)
    return f"Старт сессии {date} {time} ({path.relative_to(ROOT)})"


def set_minutes(explicit: int | None = None, now: datetime | None = None) -> str:
    now = now or datetime.now()
    path = today_path(now)
    if not path.exists():
        raise JournalError("Нет журнала за сегодня. Сначала: ./Xfile session")

    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    minute_idx = None
    start = None
    for i, line in enumerate(lines):
        stripped = line.rstrip("\n")
        match = START_RE.match(stripped)
        if match:
            start = match.group(1)
        if stripped.startswith(MINUTES_PREFIX):
            minute_idx = i

    if minute_idx is None:
        raise JournalError(f"В {path.relative_to(ROOT)} нет строки «Минуты»")

    if explicit is None:
        if not start:
            raise JournalError(
                f"В {path.relative_to(ROOT)} нет строки «Старт». "
                "Укажи --minutes 25 или вызови ./Xfile session"
            )
        started = datetime.combine(now.date(), datetime.strptime(start, "%H:%M").time())
        value = max(0, int((now - started).total_seconds() // 60))
    else:
        value = explicit

    newline = "\n" if lines[minute_idx].endswith("\n") else ""
    lines[minute_idx] = f"{MINUTES_PREFIX} {value}{newline}"
    path.write_text("".join(lines), encoding="utf-8")
    return f"Минуты: {value} ({path.relative_to(ROOT)})"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="journal.py")
    sub = parser.add_subparsers(dest="cmd", required=True)

    session_cmd = sub.add_parser("session", help="зафиксировать старт занятия")
    session_cmd.add_argument("--focus", default="")

    minutes_cmd = sub.add_parser("minutes", help="дописать минуты в последний блок")
    minutes_cmd.add_argument("--minutes", type=int, default=None)

    args = parser.parse_args(argv)
    try:
        if args.cmd == "session":
            log_success(start_session(focus=args.focus))
        elif args.cmd == "minutes":
            log_success(set_minutes(explicit=args.minutes))
    except JournalError as exc:
        log_error(str(exc))
        return 9
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

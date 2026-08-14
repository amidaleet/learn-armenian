#!/usr/bin/env python3
"""Дневник занятий. Точка входа — ./Xfile session; раунды пишет игра через ./Xfile serve."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "log"
ROUND_PREFIX = "- Раунд:"


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
        f"- Фокус: {focus}\n"
        f"- Новое:\n"
        f"- Что путалось:\n"
        f"- 3 фразы вслух:\n\n"
    )
    with path.open("a", encoding="utf-8") as fh:
        fh.write(block)
    return f"Старт сессии {date} {time} ({path.relative_to(ROOT)})"


def add_round(
    game: str,
    correct: int,
    total: int,
    minutes: int | None = None,
    now: datetime | None = None,
) -> str:
    game = game.strip()
    if not game:
        raise JournalError("Не указана игра")
    if total < 1 or correct < 0 or correct > total:
        raise JournalError("Некорректный счёт раунда")
    if minutes is not None and minutes < 0:
        raise JournalError("Минуты не могут быть отрицательными")

    now = now or datetime.now()
    path = today_path(now)
    if not path.exists():
        start_session(focus=game, now=now)

    parts = [game, f"{correct}/{total}"]
    if minutes is not None:
        parts.append(f"{minutes} мин")
    summary = ", ".join(parts)
    line = f"{ROUND_PREFIX} {summary}\n"
    text = path.read_text(encoding="utf-8")
    if not text.endswith("\n"):
        text += "\n"
    path.write_text(text + line, encoding="utf-8")
    return f"Раунд: {summary} ({path.relative_to(ROOT)})"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="journal.py")
    sub = parser.add_subparsers(dest="cmd", required=True)

    session_cmd = sub.add_parser("session", help="зафиксировать старт занятия")
    session_cmd.add_argument("--focus", default="")

    round_cmd = sub.add_parser("round", help="дописать результат раунда")
    round_cmd.add_argument("--game", required=True)
    round_cmd.add_argument("--correct", type=int, required=True)
    round_cmd.add_argument("--total", type=int, required=True)
    round_cmd.add_argument("--minutes", type=int, default=None)

    args = parser.parse_args(argv)
    try:
        if args.cmd == "session":
            log_success(start_session(focus=args.focus))
        elif args.cmd == "round":
            log_success(
                add_round(
                    game=args.game,
                    correct=args.correct,
                    total=args.total,
                    minutes=args.minutes,
                )
            )
    except JournalError as exc:
        log_error(str(exc))
        return 9
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

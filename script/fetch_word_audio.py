#!/usr/bin/env python3
"""Скачать живые записи через Wayback, если Commons отвечает 429."""

from __future__ import annotations

import hashlib
import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
WORDS_PATH = ROOT / "data/words.json"
OUT_DIR = ROOT / "data/audio/words"
META_PATH = ROOT / "data/audio/words.json"
PLAN_PATH = Path("/tmp/hy-word-audio-plan.json")
UA = "LearnArmenianLocal/0.1 (personal offline language study)"
SLEEP = 4.5


def commons_url(filename: str) -> str:
    name = filename.replace(" ", "_")
    digest = hashlib.md5(name.encode("utf-8")).hexdigest()
    return (
        "https://upload.wikimedia.org/wikipedia/commons/"
        f"{digest[0]}/{digest[:2]}/{urllib.parse.quote(name)}"
    )


def wayback(url: str) -> str:
    return f"https://web.archive.org/web/2023id_/{url}"


def candidates(hy: str, planned_title: str | None) -> list[str]:
    names: list[str] = []
    if planned_title:
        names.append(planned_title.removeprefix("File:"))
    names.extend(
        [
            f"Hy-{hy}.ogg",
            f"LL-Q8785_(hye)-Vahagn_Petrosyan-{hy}.wav",
            f"Hy-{hy}.wav",
            f"LL-Q8785_(hye)-Vahagn_Petrosyan-{hy}.ogg",
        ]
    )
    seen: set[str] = set()
    out: list[str] = []
    for name in names:
        name = name.replace(" ", "_")
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


def fetch(url: str) -> bytes:
    last: Exception | None = None
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=50) as response:
                data = response.read()
                if data[:4] not in {b"OggS", b"RIFF", b"fLaC"} and data[:3] != b"ID3":
                    raise RuntimeError(f"not audio ({data[:8]!r})")
                return data
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code == 404:
                raise
            wait = 60 if exc.code in {429, 503} else 8
            print(f"  HTTP {exc.code}, wait {wait}s", flush=True)
            time.sleep(wait)
        except Exception as exc:  # noqa: BLE001
            last = exc
            print(f"  retry {exc}", flush=True)
            time.sleep(10)
    raise RuntimeError(str(last))


def to_wav(src: Path, dest: Path) -> None:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp.wav")
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(src),
            "-ac",
            "1",
            "-ar",
            "44100",
            "-sample_fmt",
            "s16",
            str(tmp),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    tmp.replace(dest)


def needs_audio(word: dict) -> bool:
    audio = word.get("audio")
    path = ROOT / "data/audio" / audio if audio else None
    return not audio or not path.exists()


def main() -> int:
    data = json.loads(WORDS_PATH.read_text(encoding="utf-8"))
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8")) if PLAN_PATH.exists() else []
    planned = {item["id"]: item.get("title") for item in plan}
    meta = (
        json.loads(META_PATH.read_text(encoding="utf-8"))
        if META_PATH.exists()
        else {
            "license": "CC BY-SA (Wikimedia Commons / Lingua Libre / Wiktionary file pages)",
            "notes": "Клипы из Wayback Machine, исходник — Commons / Lingua Libre.",
            "clips": {},
        }
    )
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    raw_dir = Path("/tmp/hy-word-audio")
    raw_dir.mkdir(exist_ok=True)

    todo = [word for word in data["words"] if needs_audio(word)]
    ok = 0
    failed: list[str] = []
    for index, word in enumerate(todo, start=1):
        dest = OUT_DIR / f"{word['id']}.wav"
        print(f"[{index}/{len(todo)}] {word['hy']}", flush=True)
        saved = False
        for name in candidates(word["hy"], planned.get(word["id"])):
            title = f"File:{name}"
            url = wayback(commons_url(name))
            try:
                payload = fetch(url)
                ext = ".wav" if payload[:4] == b"RIFF" else ".ogg"
                raw = raw_dir / f"{word['id']}{ext}"
                raw.write_bytes(payload)
                to_wav(raw, dest)
                word["audio"] = f"words/{word['id']}.wav"
                meta["clips"][word["id"]] = {
                    "file": word["audio"],
                    "source": title,
                    "via": "web.archive.org",
                    "bytes": dest.stat().st_size,
                }
                WORDS_PATH.write_text(
                    json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
                META_PATH.write_text(
                    json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
                print(f"  {title} -> {dest.name}", flush=True)
                ok += 1
                saved = True
                break
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    print(f"  miss {title}", flush=True)
                    continue
                print(f"  FAIL {title}: {exc}", flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"  FAIL {title}: {exc}", flush=True)
            time.sleep(1.2)
        if not saved:
            failed.append(word["hy"])
        time.sleep(SLEEP)

    print(f"done ok={ok} failed={failed}", flush=True)
    return 0 if not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())

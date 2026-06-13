"""
ocr_enrich — for Discord notifications where the body field only has plain
text (e.g. "@Pro") because the real content is in an embed that macOS
notifications don't surface.

Strategy:
  1. Use the discord:// deep link from the notification's bplist to navigate
     Discord to the exact message.
  2. Wait briefly for Discord to render.
  3. Screenshot Discord's window.
  4. Run macOS Vision framework OCR on the image.
  5. Return the recognised text so the caller can include it in the
     Telegram forward.

Requirements:
  - Discord desktop client running (not just web).
  - `pyobjc-framework-Vision` and `pyobjc-framework-Quartz` installed.
  - Screen Recording permission granted to the Python binary that runs this
    (System Settings → Privacy & Security → Screen Recording).

Caveats:
  - Steals window focus from whatever you're doing.
  - ~3-5 seconds of latency per enriched message.
  - Chart images do not OCR meaningfully; you'll get the text around them.
  - Anything visible in the Discord window during the screenshot ends up in
    Telegram. If sensitive content might be visible, leave this disabled.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path


DISCORD_DEEPLINK_RE = re.compile(
    r"discord://discord\.com/channels/(\d+)/(\d+)(?:/(\d+))?"
)


def extract_deeplink(payload) -> tuple[str | None, str | None, str | None]:
    """Walk the bplist payload looking for a Discord deep link.
    Returns (server_id, channel_id, message_id) or all-None."""
    found = [None, None, None]

    def visit(obj, depth=0):
        if depth > 10:
            return
        if isinstance(obj, str):
            m = DISCORD_DEEPLINK_RE.search(obj)
            if m:
                found[0], found[1], found[2] = m.group(1), m.group(2), m.group(3)
        elif isinstance(obj, dict):
            for v in obj.values():
                visit(v, depth + 1)
        elif isinstance(obj, (list, tuple)):
            for v in obj:
                visit(v, depth + 1)
        elif isinstance(obj, bytes) and obj.startswith(b"bplist"):
            try:
                import plistlib
                visit(plistlib.loads(obj), depth + 1)
            except Exception:
                pass

    visit(payload)
    return found[0], found[1], found[2]


def open_in_discord(server_id: str, channel_id: str, message_id: str | None = None) -> None:
    """Open Discord's client to the given channel/message via deep link."""
    if message_id:
        url = f"discord://discord.com/channels/{server_id}/{channel_id}/{message_id}"
    else:
        url = f"discord://discord.com/channels/{server_id}/{channel_id}"
    # -g would open without bringing to foreground but discord:// usually
    # ignores that; we accept the focus-steal.
    subprocess.run(["open", url], check=False)


def screenshot_discord_window() -> str | None:
    """Screenshot Discord's frontmost window. Returns PNG path or None."""
    fd, path = tempfile.mkstemp(prefix="discord-ocr-", suffix=".png")
    os.close(fd)
    # -W: window mode (no shadow, frontmost window) — quick & focused
    # -x: silent (no shutter sound)
    # -o: no shadow border
    # -t png: explicit format
    try:
        result = subprocess.run(
            ["screencapture", "-x", "-o", "-t", "png", path],
            timeout=8,
            capture_output=True,
        )
        if result.returncode != 0 or not Path(path).exists() or Path(path).stat().st_size == 0:
            return None
        return path
    except subprocess.TimeoutExpired:
        return None


def ocr_image(path: str) -> str:
    """Vision-framework OCR. Returns recognised text, one line per region."""
    try:
        from Vision import (
            VNRecognizeTextRequest,
            VNImageRequestHandler,
            VNRequestTextRecognitionLevelAccurate,
        )
        from Quartz import (
            CGImageSourceCreateWithURL,
            CGImageSourceCreateImageAtIndex,
            kCFAllocatorDefault,
        )
        from Foundation import NSURL
    except ImportError as e:
        return f"[ocr] missing pyobjc Vision bindings: {e}"

    url = NSURL.fileURLWithPath_(path)
    src = CGImageSourceCreateWithURL(url, None)
    if not src:
        return ""
    img = CGImageSourceCreateImageAtIndex(src, 0, None)
    if not img:
        return ""

    req = VNRecognizeTextRequest.alloc().init()
    try:
        req.setRecognitionLevel_(VNRequestTextRecognitionLevelAccurate)
    except Exception:
        pass
    try:
        req.setUsesLanguageCorrection_(True)
    except Exception:
        pass

    handler = VNImageRequestHandler.alloc().initWithCGImage_options_(img, {})
    ok, err = handler.performRequests_error_([req], None)
    if not ok:
        return f"[ocr] vision error: {err}"
    results = req.results() or []
    lines = []
    for obs in results:
        cands = obs.topCandidates_(1)
        if cands and cands.count() > 0:
            lines.append(str(cands[0].string()))
    return "\n".join(lines)


def enrich(payload, wait_seconds: float = 2.5) -> str:
    """Top-level: open Discord to the notification's message, screenshot,
    OCR, and return the recognised text. Returns '' on any failure."""
    server, channel, message = extract_deeplink(payload)
    if not (server and channel):
        return ""
    open_in_discord(server, channel, message)
    time.sleep(wait_seconds)
    path = screenshot_discord_window()
    if not path:
        return ""
    try:
        return ocr_image(path) or ""
    finally:
        try:
            os.remove(path)
        except Exception:
            pass


# CLI for manual testing:
#   python3 ocr_enrich.py <channel_id> [<message_id>] [<server_id>]
if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("server_id")
    ap.add_argument("channel_id")
    ap.add_argument("message_id", nargs="?")
    a = ap.parse_args()
    open_in_discord(a.server_id, a.channel_id, a.message_id)
    time.sleep(2.5)
    p = screenshot_discord_window()
    if not p:
        print("[error] screenshot failed (Screen Recording permission?)")
        sys.exit(1)
    print(ocr_image(p))
    os.remove(p)

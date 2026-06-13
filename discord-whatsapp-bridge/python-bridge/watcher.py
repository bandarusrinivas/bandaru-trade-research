#!/usr/bin/env python3
"""
discord-watcher — Forward macOS Discord notifications to Telegram (or Twilio
WhatsApp, or Meta WhatsApp Cloud). Pure-Python replacement for the
Hammerspoon-based watcher.lua.

Polls ~/Library/Group Containers/group.com.apple.usernoted/db2/db every N
seconds, filters for Discord (com.hnc.Discord) notifications, and forwards
new ones using whichever provider is configured in .env.

Run:
    python3 watcher.py            # poll forever
    python3 watcher.py --once     # one poll, exit (useful for cron/testing)
    python3 watcher.py --smoke    # send a test message via the configured provider

The launchd plist installs this as a LaunchAgent that runs continuously.

Full Disk Access must be granted to whichever Python binary runs this
(System Settings → Privacy & Security → Full Disk Access). Without it the
SQLite open will fail with "unable to open database file".
"""

from __future__ import annotations

import argparse
import json
import os
import plistlib
import sqlite3
import sys
import time
from pathlib import Path
from urllib import error, request
from urllib.parse import urlencode

NOTIF_DB = Path.home() / "Library/Group Containers/group.com.apple.usernoted/db2/db"
# Discord actually registers its bundle as lowercase 'discord' on current
# macOS versions. We accept either to be future-proof.
DISCORD_BUNDLES = ("com.hnc.discord", "com.hnc.Discord")
STATE_DIR = Path.home() / ".discord-wa-bridge"
STATE_FILE = STATE_DIR / "state.json"


def log(msg: str) -> None:
    print(f"[watcher] {msg}", flush=True)


# ── .env loader ────────────────────────────────────────────────────────────

def load_env(env_path: Path) -> dict:
    env: dict = {}
    if not env_path.exists():
        return env
    for raw in env_path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env


# ── state file ─────────────────────────────────────────────────────────────

def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            data = json.loads(STATE_FILE.read_text())
            if isinstance(data, dict) and isinstance(data.get("last_rec_id"), int):
                return data
        except Exception:
            pass
    return {"last_rec_id": 0}


def save_state(state: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state))


# ── Notification Center DB reader ──────────────────────────────────────────

def _open_db() -> sqlite3.Connection:
    return sqlite3.connect(f"file:{NOTIF_DB}?mode=ro", uri=True, timeout=2)


def fetch_new_discord(last_rec_id: int):
    if not NOTIF_DB.exists():
        return [], f"Notification DB missing at {NOTIF_DB}"
    try:
        conn = _open_db()
    except sqlite3.OperationalError as e:
        return [], f"Cannot open Notification DB: {e}. Grant Full Disk Access to Python."
    try:
        cur = conn.cursor()
        placeholders = ",".join("?" * len(DISCORD_BUNDLES))
        cur.execute(
            f"SELECT app_id FROM app WHERE identifier IN ({placeholders})",
            DISCORD_BUNDLES,
        )
        app_ids = [r[0] for r in cur.fetchall()]
        if not app_ids:
            return [], None  # Discord hasn't posted any notifications yet
        ph = ",".join("?" * len(app_ids))
        cur.execute(
            f"SELECT rec_id, data FROM record WHERE app_id IN ({ph}) AND rec_id > ? "
            f"ORDER BY rec_id ASC",
            (*app_ids, last_rec_id),
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    out = []
    for rec_id, blob in rows:
        try:
            payload = plistlib.loads(blob)
        except Exception as e:
            log(f"skip rec {rec_id}: bplist parse failed ({e})")
            continue
        # The notification text lives under 'req' on recent macOS versions, or
        # at top-level on older ones. Fall back gracefully.
        req = payload.get("req") if isinstance(payload, dict) else None
        if not isinstance(req, dict):
            req = payload if isinstance(payload, dict) else {}
        out.append({
            "rec_id": rec_id,
            "title":    (req.get("titl") or req.get("title") or "").strip(),
            "subtitle": (req.get("subt") or req.get("subtitle") or "").strip(),
            "body":     (req.get("body") or req.get("Body") or "").strip(),
            # Hold the raw payload so the OCR-enrich path can pull out the
            # discord:// deep link to navigate Discord to this exact message.
            "_payload": payload,
        })
    return out, None


def get_max_rec_id():
    if not NOTIF_DB.exists():
        return None
    try:
        conn = _open_db()
    except sqlite3.OperationalError:
        return None
    try:
        cur = conn.cursor()
        cur.execute("SELECT COALESCE(MAX(rec_id), 0) FROM record")
        row = cur.fetchone()
        return int(row[0]) if row and row[0] is not None else 0
    finally:
        conn.close()


# ── HTTP helpers ───────────────────────────────────────────────────────────

def _post(url: str, body: bytes, headers: dict):
    req = request.Request(url, data=body, method="POST", headers=headers)
    try:
        with request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)


def _post_json(url: str, payload: dict, headers: dict | None = None):
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    return _post(url, json.dumps(payload).encode(), h)


def _post_form(url: str, form: dict, headers: dict | None = None):
    h = {"Content-Type": "application/x-www-form-urlencoded"}
    if headers:
        h.update(headers)
    return _post(url, urlencode(form).encode(), h)


# ── providers ──────────────────────────────────────────────────────────────

def send_telegram(env: dict, text: str) -> None:
    token = env["TELEGRAM_BOT_TOKEN"]
    chat = env["TELEGRAM_CHAT_ID"]
    chat_val = int(chat) if chat.lstrip("-").isdigit() else chat
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    code, body = _post_json(url, {
        "chat_id": chat_val,
        "text": text[:4096],
        "disable_web_page_preview": True,
    })
    if not (200 <= code < 300):
        log(f"telegram send failed {code}: {body[:200]}")


def send_twilio(env: dict, text: str) -> None:
    import base64
    sid = env["TWILIO_ACCOUNT_SID"]
    tok = env["TWILIO_AUTH_TOKEN"]
    from_ = env["TWILIO_FROM"]
    to = env["TWILIO_TO"]
    if not from_.startswith("whatsapp:"): from_ = "whatsapp:" + from_
    if not to.startswith("whatsapp:"): to = "whatsapp:" + to
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    auth = base64.b64encode(f"{sid}:{tok}".encode()).decode()
    code, body = _post_form(
        url, {"From": from_, "To": to, "Body": text[:1500]},
        headers={"Authorization": f"Basic {auth}"},
    )
    if not (200 <= code < 300):
        log(f"twilio send failed {code}: {body[:200]}")


def send_meta(env: dict, text: str) -> None:
    phone_id = env["WHATSAPP_PHONE_ID"]
    token = env["WHATSAPP_TOKEN"]
    to = env["WHATSAPP_TO"]
    api_v = env.get("WHATSAPP_API_VERSION", "v20.0")
    url = f"https://graph.facebook.com/{api_v}/{phone_id}/messages"
    code, body = _post_json(url, {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text[:4096], "preview_url": True},
    }, headers={"Authorization": f"Bearer {token}"})
    if not (200 <= code < 300):
        log(f"meta send failed {code}: {body[:200]}")


def pick_sender(env: dict):
    if env.get("TELEGRAM_BOT_TOKEN") and env.get("TELEGRAM_CHAT_ID"):
        return "telegram", send_telegram
    if (env.get("TWILIO_ACCOUNT_SID") and env.get("TWILIO_AUTH_TOKEN")
            and env.get("TWILIO_FROM") and env.get("TWILIO_TO")):
        return "twilio", send_twilio
    if (env.get("WHATSAPP_PHONE_ID") and env.get("WHATSAPP_TOKEN")
            and env.get("WHATSAPP_TO")):
        return "meta", send_meta
    return None, None


# ── filter + format ───────────────────────────────────────────────────────

def parse_filter(env: dict):
    raw = env.get("DISCORD_CHANNEL_FILTER", "")
    return [s.strip().lower() for s in raw.split(",") if s.strip()]


def passes_filter(n: dict, filt) -> bool:
    if not filt:
        return True
    hay = f"{n['title']} {n['subtitle']}".lower()
    return any(s in hay for s in filt)


def format_text(n: dict) -> str:
    parts = []
    if n["title"]:    parts.append(f"[{n['title']}]")
    if n["subtitle"]: parts.append(f"{n['subtitle']}:")
    if n["body"]:     parts.append(n["body"])
    return " ".join(parts) or "(empty Discord notification)"


# ── optional OCR enrichment ────────────────────────────────────────────────
# When the notification body is very short (likely a bot post with embeds
# that macOS notifications don't surface), open the Discord client to the
# specific message, screenshot, and OCR. Adds 3-5s latency per enriched
# message and steals focus. Enable with OCR_ENRICH=true in .env.

def maybe_enrich(env: dict, n: dict, base_text: str) -> str:
    if (env.get("OCR_ENRICH", "").lower() not in ("1", "true", "yes", "on")):
        return base_text
    body = n.get("body", "")
    threshold = int(env.get("OCR_ENRICH_BODY_THRESHOLD", "30"))
    if len(body) >= threshold:
        return base_text  # plain-text message, no enrichment needed
    payload = n.get("_payload")
    if not payload:
        return base_text
    try:
        # Lazy import so missing PyObjC bindings don't break the watcher.
        from ocr_enrich import enrich
    except Exception as e:
        log(f"OCR_ENRICH set but ocr_enrich import failed: {e}")
        return base_text
    try:
        ocr_text = enrich(payload, wait_seconds=float(env.get("OCR_WAIT", "2.5")))
    except Exception as e:
        log(f"enrich error: {e}")
        return base_text
    if not ocr_text or not ocr_text.strip():
        return base_text
    # Trim to a reasonable size — Telegram max is 4096
    snippet = ocr_text.strip()[:2500]
    return f"{base_text}\n\n── via OCR ──\n{snippet}"


# ── main loop ─────────────────────────────────────────────────────────────

def poll_once(env_path: Path) -> int:
    env = load_env(env_path)
    provider, fn = pick_sender(env)
    if not fn:
        log("no provider configured — need TELEGRAM_*, TWILIO_*, or WHATSAPP_* in .env")
        return 0
    state = load_state()
    notifications, err = fetch_new_discord(state["last_rec_id"])
    if err:
        log(err)
        return 0
    if not notifications:
        return 0
    filt = parse_filter(env)
    sent = 0
    for n in notifications:
        if passes_filter(n, filt):
            try:
                text = format_text(n)
                text = maybe_enrich(env, n, text)
                fn(env, text)
                sent += 1
            except Exception as e:
                log(f"send error rec {n['rec_id']}: {e}")
        state["last_rec_id"] = n["rec_id"]
    save_state(state)
    if sent:
        log(f"forwarded {sent} (last rec_id={state['last_rec_id']})")
    return sent


def smoke(env_path: Path) -> None:
    env = load_env(env_path)
    provider, fn = pick_sender(env)
    if not fn:
        log("no provider configured in .env")
        return
    try:
        fn(env, "✅ Python watcher smoke test — if you see this, .env credentials are good.")
        log(f"smoke test sent via {provider}")
    except Exception as e:
        log(f"smoke send failed: {e}")


def initialize_state_if_empty():
    state = load_state()
    if state["last_rec_id"] == 0:
        max_id = get_max_rec_id()
        if max_id is not None:
            save_state({"last_rec_id": max_id})
            log(f"initialized at rec_id={max_id} (no backfill)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--env",
        default=str(Path(__file__).resolve().parent.parent / ".env"),
        help="Path to .env file (default: ../.env relative to this script)",
    )
    ap.add_argument("--interval", type=int, default=5,
                    help="Seconds between polls (default: 5)")
    ap.add_argument("--once", action="store_true",
                    help="Poll once and exit")
    ap.add_argument("--smoke", action="store_true",
                    help="Send a smoke-test message via the configured provider and exit")
    args = ap.parse_args()
    env_path = Path(args.env)

    if args.smoke:
        smoke(env_path)
        return
    if args.once:
        poll_once(env_path)
        return

    initialize_state_if_empty()
    log(f"started — polling every {args.interval}s, env={env_path}")
    while True:
        try:
            poll_once(env_path)
        except KeyboardInterrupt:
            log("interrupted, exiting")
            return
        except Exception as e:
            log(f"poll error: {e}")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()

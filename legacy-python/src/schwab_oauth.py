"""Robust Schwab OAuth helper.

This is a drop-in replacement for `schwab_setup.py` that eliminates the
copy-paste step (and the transcription errors that come with it):

  1. Opens the Schwab auth URL in Safari automatically.
  2. Polls Safari's address bar via AppleScript for the redirect URL.
  3. As soon as Safari receives the redirect to https://127.0.0.1/?code=...,
     reads the URL programmatically and exchanges it for a token.

The user only does the actual Schwab login + Allow click. No URL copy/paste.
Run via: `python schwab_oauth.py` or `bandaru auth`.
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from urllib.parse import urlparse, parse_qs

from dotenv import load_dotenv

# Load .env from the first existing path. Works in both the Docker sidecar
# (/app/.env) and the host venv (project root or legacy-python/.env). Avoids
# find_dotenv()'s sys._getframe() walk for sourceless-loader safety.
_HERE = os.path.dirname(os.path.abspath(__file__))
for _p in (
    "/app/.env",
    os.path.normpath(os.path.join(_HERE, "..", ".env")),
    os.path.normpath(os.path.join(_HERE, "..", "..", ".env")),
    os.path.join(os.getcwd(), ".env"),
):
    if os.path.isfile(_p):
        load_dotenv(_p, override=False)
        break

API_KEY = os.environ.get("SCHWAB_API_KEY")
APP_SECRET = os.environ.get("SCHWAB_APP_SECRET")
CALLBACK_URL = os.environ.get("SCHWAB_CALLBACK_URL", "https://127.0.0.1")
TOKEN_PATH = os.environ.get("SCHWAB_TOKEN_PATH", "./schwab_token.json")

if not (API_KEY and APP_SECRET):
    sys.exit(
        "ERROR: SCHWAB_API_KEY and SCHWAB_APP_SECRET must be set in .env first.\n"
        "Edit .env and add your developer-portal credentials."
    )

from schwab.auth import (  # noqa: E402
    client_from_received_url,
    get_auth_context,
)


def _safari_current_url() -> str:
    """Return the URL of Safari's frontmost tab, or '' if Safari isn't running."""
    script = """
    tell application "Safari"
        if (count of windows) = 0 then return ""
        try
            return URL of current tab of window 1
        on error
            return ""
        end try
    end tell
    """
    try:
        r = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=5,
        )
        return (r.stdout or "").strip()
    except subprocess.TimeoutExpired:
        return ""
    except Exception:
        return ""


def _looks_like_redirect(url: str, callback_url: str) -> bool:
    """Is this URL a Schwab OAuth redirect we can exchange?"""
    if not url:
        return False
    try:
        parsed = urlparse(url)
        cb = urlparse(callback_url)
    except Exception:
        return False
    if parsed.scheme != cb.scheme or parsed.hostname != cb.hostname:
        return False
    qs = parse_qs(parsed.query)
    return "code" in qs and "state" in qs


def _open_in_safari(url: str) -> None:
    """Open URL in Safari (foreground)."""
    subprocess.run(["open", "-a", "Safari", url], check=False)


def main() -> int:
    print("================================================")
    print("  Schwab OAuth — Auto Flow (no copy/paste needed)")
    print("================================================\n")

    # 1. Build the auth URL + state using schwab-py's own helper so the
    #    state matches what client_from_received_url expects.
    print("→ Generating authorization URL…")
    auth_context = get_auth_context(API_KEY, CALLBACK_URL)
    auth_url = auth_context.authorization_url
    print(f"   {auth_url[:80]}…\n")

    # 2. Open it in Safari for the user.
    print("→ Opening Safari to the Schwab login page…")
    _open_in_safari(auth_url)
    time.sleep(2)

    # 3. Wait for the user to log in + approve, then poll Safari for the redirect.
    print("\nWhat to do now:")
    print("  1. Log in to your Schwab BROKERAGE account in the Safari window")
    print("  2. Complete 2FA if asked")
    print("  3. Click ALLOW when Schwab asks for permission")
    print("  4. The page will redirect to https://127.0.0.1/... (says 'Can't connect')")
    print("  5. Just leave that page open — I'll grab the URL automatically.\n")
    print("→ Watching Safari's address bar (timeout 5 min)…")

    TIMEOUT_S = 300
    POLL_S = 1.5
    start = time.time()
    last_url = ""
    while time.time() - start < TIMEOUT_S:
        url = _safari_current_url()
        if url and url != last_url:
            # Progress trace — show first 60 chars so user can see what tab is active
            preview = url[:60] + ("…" if len(url) > 60 else "")
            print(f"   Safari → {preview}")
            last_url = url
        if _looks_like_redirect(url, CALLBACK_URL):
            print(f"\n✓ Captured redirect URL ({len(url)} chars).")
            return _exchange_and_save(url, auth_context)
        time.sleep(POLL_S)

    print("\n✗ Timed out waiting for the redirect. Re-run to try again.", file=sys.stderr)
    return 2


def _exchange_and_save(redirect_url: str, auth_context) -> int:
    """Exchange the auth code for a token and write to TOKEN_PATH."""
    print("→ Exchanging authorization code for token…")

    def _token_write(token, *a, **k):
        # schwab-py calls this with (token, ...) on every refresh. Persist it.
        import json
        os.makedirs(os.path.dirname(os.path.abspath(TOKEN_PATH)) or ".", exist_ok=True)
        with open(TOKEN_PATH, "w") as f:
            json.dump({"token": token}, f, indent=2)
        return None

    try:
        client = client_from_received_url(
            API_KEY,
            APP_SECRET,
            auth_context,
            redirect_url,
            _token_write,
            False,   # asyncio
            True,    # enforce_enums
        )
    except Exception as e:
        msg = str(e)
        print(f"\n✗ Token exchange failed: {msg}", file=sys.stderr)
        if "Bad authorization code" in msg or "Unable to decrypt" in msg:
            print(
                "\nThe authorization code Schwab returned could not be decrypted. "
                "Common causes:\n"
                "  • Code already used (each code is one-shot)\n"
                "  • Code older than ~30 seconds\n"
                "  • Wrong Client Secret in .env\n"
                "\nRe-run `python schwab_oauth.py` to try a fresh round.",
                file=sys.stderr,
            )
        return 3

    # 4. Smoke test: pull a SPY quote.
    try:
        resp = client.get_quote("SPY")
        data = resp.json() or {}
        node = data.get("SPY", {}) or {}
        q = node.get("quote", {}) or {}
        price = q.get("lastPrice") or q.get("mark") or "?"
        print(f"\n✓ SUCCESS — SPY last price: ${price}")
        print(f"  Token saved to: {os.path.abspath(TOKEN_PATH)}")
        print("\nYou can now start the dashboard with Schwab real-time data:")
        print("  bandaru start          (if installed)  OR")
        print("  ./start-app.command")
    except Exception as e:
        print(f"\n✓ Token saved, but smoke test (SPY quote) failed: {e}")
        print(f"  Token still written to: {os.path.abspath(TOKEN_PATH)}")
        print("  Try starting the app anyway — it may work for other endpoints.")

    return 0


if __name__ == "__main__":
    sys.exit(main())

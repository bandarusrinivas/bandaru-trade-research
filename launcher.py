"""Standalone launcher for the Bandaru Trade Analysis Platform.

This file is the PyInstaller entry point — it boots the Flask server, picks
a free port, opens the user's default browser, and keeps the app running
until the user closes the terminal or quits the app.

Run directly (`python launcher.py`) for development. PyInstaller packages
this into a double-clickable executable for Mac (.app) and Windows (.exe).
"""
from __future__ import annotations

import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path


# ---------------------------------------------------------------------------
# Path resolution — works whether running as a script or a PyInstaller bundle
# ---------------------------------------------------------------------------

def _bundle_dir() -> Path:
    """Return the directory containing bundled resources (templates, static, .env)."""
    if getattr(sys, "frozen", False):
        # Running under PyInstaller — resources live next to the executable
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent


def _user_data_dir() -> Path:
    """Return a writable per-user directory for tokens / user .env / cache."""
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    d = base / "BandaruTradeAnalysis"
    d.mkdir(parents=True, exist_ok=True)
    return d


BUNDLE_DIR = _bundle_dir()
USER_DIR = _user_data_dir()

# Make sure Flask can find the templates + static folders inside the bundle
os.environ.setdefault("FLASK_TEMPLATES", str(BUNDLE_DIR / "templates"))
os.environ.setdefault("FLASK_STATIC", str(BUNDLE_DIR / "static"))

# Tokens + writable .env live in the user data dir so the bundle stays read-only
os.environ.setdefault("SCHWAB_TOKEN_PATH", str(USER_DIR / "schwab_token.json"))


# ---------------------------------------------------------------------------
# .env handling — prefer USER_DIR/.env, fall back to bundled .env.example
# ---------------------------------------------------------------------------

def _load_env() -> None:
    """Load environment from USER_DIR/.env (writable) or bundle .env.example."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    user_env = USER_DIR / ".env"
    if user_env.exists():
        load_dotenv(user_env)
    else:
        # First run — seed a user .env from the bundled example if available
        example = BUNDLE_DIR / ".env.example"
        if example.exists():
            user_env.write_text(example.read_text())
            print(f"Created user config at: {user_env}")
            print("Edit it to add Schwab credentials (or leave empty to use Yahoo).")
        load_dotenv(user_env if user_env.exists() else example)


# ---------------------------------------------------------------------------
# Find a free port (5000 → 5001 → 5002 → ...)
# ---------------------------------------------------------------------------

def _pick_port(start: int = 5000, end: int = 5050) -> int:
    for p in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    raise RuntimeError(f"No free port in {start}-{end}")


# ---------------------------------------------------------------------------
# Open the browser after the server is up
# ---------------------------------------------------------------------------

def _open_browser_when_ready(url: str, port: int) -> None:
    """Wait for the Flask server to accept connections, then open the browser."""
    for _ in range(60):  # ~6 seconds max
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.1)
            try:
                s.connect(("127.0.0.1", port))
                break
            except OSError:
                time.sleep(0.1)
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Could not open browser automatically: {e}")
        print(f"Open this URL manually: {url}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    print("================================================")
    print("  Bandaru Trade Analysis Platform")
    print("================================================")
    print(f"Bundle dir: {BUNDLE_DIR}")
    print(f"User dir:   {USER_DIR}")
    print()

    _load_env()

    # Chdir to bundle so Flask's relative paths to templates / static work
    os.chdir(BUNDLE_DIR)

    # Import app late — after env + path setup
    from app import app as flask_app  # noqa: E402

    port = _pick_port()
    url = f"http://127.0.0.1:{port}"
    print(f"→ Starting Flask server at {url}")
    print("  (Close this window to stop the server.)")
    print()

    # Open the browser in a background thread once the server is ready
    threading.Thread(
        target=_open_browser_when_ready, args=(url, port), daemon=True
    ).start()

    # Run Flask. debug=False so the reloader doesn't spawn a second process
    # which would confuse PyInstaller-bundled executables.
    try:
        flask_app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)
    except KeyboardInterrupt:
        print("\nShutting down — goodbye.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

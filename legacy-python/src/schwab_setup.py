"""One-time Schwab OAuth setup. Opens a browser; user logs in and approves.
After that, the saved token auto-refreshes and app.py runs headless.

    python schwab_setup.py
"""
from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

# Load .env from the first path that exists. This script runs in TWO contexts:
#   1. Inside the Schwab sidecar container — .env is mounted at /app/.env
#   2. From the host venv via auth-schwab.command — .env is at the project
#      root (one level above legacy-python/).
# Explicit paths instead of find_dotenv() because find_dotenv() walks the
# call stack via sys._getframe() and asserts on sourceless module loaders
# (a problem if we ever ship .pyc-only).
_HERE = os.path.dirname(os.path.abspath(__file__))
_CANDIDATE_ENV_PATHS = [
    "/app/.env",                                    # Docker sidecar
    os.path.normpath(os.path.join(_HERE, "..", ".env")),       # legacy-python/.env
    os.path.normpath(os.path.join(_HERE, "..", "..", ".env")), # project root
    os.path.join(os.getcwd(), ".env"),              # current working dir
]
_loaded_from = None
for _p in _CANDIDATE_ENV_PATHS:
    if os.path.isfile(_p):
        load_dotenv(_p, override=False)
        _loaded_from = _p
        break

api_key = os.environ.get("SCHWAB_API_KEY")
app_secret = os.environ.get("SCHWAB_APP_SECRET")

if not (api_key and app_secret):
    sys.exit(
        "ERROR: SCHWAB_API_KEY and SCHWAB_APP_SECRET must be set in .env first.\n"
        "Copy .env.example to .env and fill them in."
    )

from src.clients.schwab_client import SchwabClient  # noqa: E402

print("Starting Schwab OAuth flow…")
print("A browser window will open. Log in to Schwab and approve the app.")
print("Schwab will then redirect to your callback URL — the page will look")
print("broken, that's expected. Copy the FULL URL from the address bar and")
print("paste it back into this terminal when prompted.\n")

client = SchwabClient(interactive=True)

quote = client.get_current_quote("SPY")
print(f"\nSUCCESS — SPY last price: {quote['price']}")
print(f"Token saved to {client.token_path}")
print("You can now run: python app.py")

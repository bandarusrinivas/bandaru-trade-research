# Bandaru Trade Analysis — Start & Stop User Guide

A reference for the three launcher scripts that control the dashboard. Each one is a double-clickable file in the project folder.

---

## At a glance

| What you want to do | Double-click | What it does |
|---|---|---|
| **Start** the dashboard | `start-app.command` | Boots Flask, opens Safari to the dashboard |
| **Pause** the server | `stop-app.command` | Kills Flask, leaves Terminal/browser open |
| **Fully exit** | `exit-app.command` | Kills Flask + closes Safari tabs + closes Terminal windows |

All three live in the project folder:
`~/Library/Application Support/Claude/.../outputs/spy-zero-dte/`

If you want desktop access, drag any of them to your Desktop with **Option** held — that creates an alias so the original stays in place.

---

## Starting the app — `start-app.command`

**What happens, step by step:**

1. Activates the Python virtual environment (`.venv`)
2. Reads `DATA_SOURCE` from `.env` (defaults to `schwab` if blank)
3. Kills anything still running on port 5000 (clears zombies from previous sessions)
4. **If Schwab is selected and there's no `schwab_token.json`:**
   - Runs the one-time OAuth flow (browser opens, you log in to Schwab, paste the redirect URL back into Terminal)
   - If OAuth fails for any reason, falls back to Yahoo Finance for this session
5. Starts the Flask server on `http://127.0.0.1:5000`
6. Auto-opens Safari to the dashboard after a 2-second delay

**Terminal output you'll see when it works:**

```
Bandaru Trade Analysis — LIVE (schwab)
Starting on http://localhost:5000 …
Opening Safari in 2 seconds. (Press Ctrl+C to stop the server.)
 * Running on http://127.0.0.1:5000
```

**Keep this Terminal window open** while you're using the dashboard. Closing it kills the server.

---

## Stopping the server — `stop-app.command`

Use this when you want to **stop the dashboard but keep Safari and Terminal open** — for example, to free up port 5000 before relaunching with different settings, or to pause without losing your browser state.

**What happens:**

1. Looks for processes on port 5000 and kills them with `kill -9`
2. Reaps any orphan `python app.py` / `python schwab_setup.py` processes
3. Confirms with `✓ Server stopped` or `⚠ Server still alive`
4. Waits for **Enter** so you can read the result

After this runs, the Safari dashboard will show "Safari Can't Connect to the Server" on next refresh — that's expected, the backend is down.

To restart: double-click `start-app.command` again.

---

## Full cleanup — `exit-app.command`

The "end of day" button. Closes everything related to the app so your desktop goes back to a clean slate.

**What happens:**

1. Kills Flask on port 5000 + any lingering Python processes
2. **Closes all Safari tabs** pointing at `127.0.0.1:5000` or `localhost:5000`. Tabs for other sites stay open.
3. **Closes every Terminal window** running any of these processes:
   - `app.py`, `schwab_setup.py`
   - `start-app.command`, `stop-app.command`
   - `run-schwab.command`, `run-app.command`, `run-live.command`, `run-auth.command`
4. **Closes its own Terminal window last**

**First-time permission prompts** — macOS may ask for permission the first time you run this:

> *"Terminal wants to control Safari"*
> *"Terminal wants to control System Events"*

Click **OK** on each. After that the script runs silently.

You can pre-approve under **System Settings → Privacy & Security → Automation → Terminal → ☑ Safari + ☑ System Events**.

---

## Daily workflow

| Time | Action |
|---|---|
| **Market open** | Double-click `start-app.command`. Safari opens. Trade. |
| **Lunch / step away** | Leave it running — auto-refresh keeps data fresh, costs you nothing |
| **Reload with different ticker / settings** | Type the ticker in the dashboard, or click Reset / change `.env` and use `stop-app.command` then `start-app.command` |
| **End of day** | Double-click `exit-app.command`. Desktop returns to baseline. |

---

## Switching data sources

The data source is controlled by the `DATA_SOURCE` line in `.env`. Open `.env` in any text editor:

```
DATA_SOURCE=schwab    # real-time, requires OAuth token (default)
DATA_SOURCE=yahoo     # ~15-min delayed, no auth needed
DATA_SOURCE=demo      # synthetic data — useful for testing UI without market
```

After changing `.env`, run **stop-app.command** then **start-app.command**. The new source picks up.

---

## Schwab OAuth — what happens the first time

Only matters if `DATA_SOURCE=schwab` and there's no `schwab_token.json` file yet.

1. `start-app.command` detects no token and runs the OAuth flow automatically
2. Terminal prints a long Schwab authorization URL — copy it
3. Open Safari (Cmd+Tab), paste the URL in the address bar (Cmd+L → Cmd+V), Enter
4. Log in to **Schwab.com** with your brokerage account (not the developer-portal account)
5. Click **Allow** when Schwab asks "Authorize Bandaru Trade Analysis to access your account?"
6. Schwab redirects to `https://127.0.0.1/?code=...&session=...` — Safari shows "Can't connect to server", that's expected
7. **Click Safari's address bar** (Cmd+L) to expand the truncated URL. Cmd+A then Cmd+C to copy the full URL.
8. Cmd+Tab back to Terminal — it's waiting at `Redirect URL>`
9. Cmd+V to paste, Return
10. Token gets saved to `schwab_token.json`. You're done — the app starts automatically.

**Critical**: the auth code in step 6 expires in ~30 seconds. Move fast between steps 7 and 9.

**Token lifetime**: Refresh tokens last 7 days. After a week, `start-app.command` will detect the expired token and run OAuth again automatically.

---

## Troubleshooting

**"Address already in use" / "Port 5000 in use"**
Another Flask is still running. Double-click `stop-app.command`, then try `start-app.command` again.

**"No Schwab token at .../schwab_token.json"**
The OAuth wasn't completed. Run `start-app.command` — it'll trigger the OAuth flow.

**Dashboard shows "Options data unavailable: ..."**
Yahoo throttled the chain request (common at 2-second auto-refresh) or `schwab_token.json` is expired. Try clicking Refresh after a minute, or run `stop-app.command` then `start-app.command` to reset.

**Safari shows the dashboard but no data updates**
The auto-refresh checkbox in the header may be unchecked. Click it back on. Or check the interval dropdown — set it to 10s.

**`exit-app.command` doesn't close Terminal**
First-time AppleScript permission prompt was probably denied. Open **System Settings → Privacy & Security → Automation → Terminal** and check ☑ for Safari and System Events. Then try again.

**Schwab API "401 Unauthorized" in logs**
Token expired (>7 days old). Delete `schwab_token.json` and run `start-app.command` — it'll prompt for a fresh OAuth.

**Chrome shows "ERR_BLOCKED_BY_CLIENT" on localhost**
Your Chrome profile is managed (Prosper ISD) and blocks localhost. Use Safari — `start-app.command` opens Safari automatically.

---

## File reference

| File | Purpose | Keep open? |
|---|---|---|
| `start-app.command` | Boot the dashboard | Yes — closing kills server |
| `stop-app.command` | Stop server only | No — closes after Enter |
| `exit-app.command` | Stop + close everything | Closes itself |
| `setup.command` | One-time first install | No — run once |
| `.env` | Credentials + data source | Edit any time |
| `schwab_token.json` | OAuth tokens (auto-generated) | Don't delete unless re-auth needed |

---

## Quick command-line equivalents

If you prefer Terminal commands over double-clicking:

```bash
# Start
cd /path/to/spy-zero-dte
./start-app.command

# Stop
./stop-app.command

# Full exit
./exit-app.command

# Manual kill (alternative to stop-app.command)
lsof -ti:5000 | xargs kill -9
```

---

*Last updated: 2026-05-14*

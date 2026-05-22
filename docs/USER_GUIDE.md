# Bandaru Trade Research — User Guide

**Version 2.1.1**

A complete, step-by-step manual for installing, running, and troubleshooting
Bandaru Trade Research on **macOS** and **Windows**.

The app runs as a small set of Docker containers. You control all of it with
just **two scripts**:

| | Start everything | Stop everything |
|---|---|---|
| **macOS** | `start.command` | `stop.command` |
| **Windows** | `start.bat` | `stop.bat` |

`start` does the entire job in one double-click — it checks Docker, signs you
in to Schwab when needed, builds and launches every container, and opens the
dashboard. There is no menu and no separate sign-in step.

---

## Contents

1. [What you need](#1-what-you-need)
2. [First-time setup — macOS](#2-first-time-setup--macos)
3. [First-time setup — Windows](#3-first-time-setup--windows)
4. [Starting the app (every day)](#4-starting-the-app-every-day)
5. [The Schwab sign-in](#5-the-schwab-sign-in)
6. [Stopping the app](#6-stopping-the-app)
7. [A quick tour of the dashboard](#7-a-quick-tour-of-the-dashboard)
8. [Troubleshooting](#8-troubleshooting)
9. [Updating the app](#9-updating-the-app)

---

## 1. What you need

Both platforms need the same things:

**Docker Desktop** — free software that runs the app's containers. It bundles
everything else the app needs (Node.js, Python, MongoDB), so you do **not**
install those yourself.

**A Schwab brokerage account + a free Schwab developer app** — required only
for *real-time* data. Without it the app still runs fine on free Yahoo Finance
data, which is delayed roughly 15 minutes.

**Hardware** — any Mac or PC from the last several years with at least 8 GB of
RAM. The running app uses about 1 GB of RAM and 2 GB of disk.

Your Schwab API keys live in a file named `.env` in the project folder. It must
contain two lines:

```
SCHWAB_API_KEY=your_key_here
SCHWAB_APP_SECRET=your_secret_here
```

If you do not have a Schwab developer app yet, create one (free) at
**https://developer.schwab.com** — add the "Market Data Production" product,
set the callback URL to `https://127.0.0.1`, and copy the App Key and Secret
into `.env`.

---

## 2. First-time setup — macOS

**Step 1 — Install Docker Desktop.**
Download it from **https://www.docker.com/products/docker-desktop**, open the
`.dmg`, and drag Docker to Applications. Launch Docker Desktop once and wait
until the whale icon in the menu bar stops animating — that means the engine
is running.

**Step 2 — Put the project folder somewhere stable.**
Keep the `bandaru-trade-research` folder in your home folder or Documents — not
in Downloads or the Trash. Moving it later is fine; just don't delete it.

**Step 3 — Confirm your Schwab keys.**
Open the `.env` file in the project folder with TextEdit and check that
`SCHWAB_API_KEY` and `SCHWAB_APP_SECRET` both have values after the `=`.

**Step 4 — First launch (clears Apple's Gatekeeper warning).**
The very first time, macOS blocks scripts from unidentified developers. Instead
of double-clicking, **right-click `start.command` → Open**, then click **Open**
in the dialog. You only do this once; after that a normal double-click works.

`start.command` takes over from here — see [section 4](#4-starting-the-app-every-day).

---

## 3. First-time setup — Windows

**Step 1 — Install prerequisites.**
The easiest path: double-click **`install-windows.bat`**. It checks for Docker
Desktop and Python and points you to the downloads you still need. You can also
install manually:

- **Docker Desktop** — https://www.docker.com/products/docker-desktop
  Docker on Windows needs the **WSL 2** backend; the Docker installer enables
  it for you and may ask for one reboot.
- **Python 3.10 or newer** — https://www.python.org/downloads/
  On the installer's first screen, tick **"Add Python to PATH"**.

**Step 2 — Launch Docker Desktop** and wait for the whale icon in the system
tray to go solid (engine running).

**Step 3 — Put the project folder somewhere stable** — for example
`C:\Users\<you>\bandaru-trade-research`. Avoid Downloads.

**Step 4 — Confirm your Schwab keys** in the `.env` file (open with Notepad) —
`SCHWAB_API_KEY` and `SCHWAB_APP_SECRET` must both have values.

**Step 5 — First launch.**
Double-click **`start.bat`**. If Windows SmartScreen shows a blue warning,
click **More info → Run anyway**. You only do this once.

---

## 4. Starting the app (every day)

Make sure **Docker Desktop is running** first (whale icon solid). Then:

- **macOS** — double-click **`start.command`**
- **Windows** — double-click **`start.bat`**

A terminal window opens and walks through seven steps:

1. **Checking Docker** — if Docker Desktop isn't running, `start` tries to
   launch it for you and waits up to a minute.
2. **Checking Schwab credentials** — confirms `.env` has your keys.
3. **Checking your Schwab sign-in** — if the token is missing or expired,
   `start` runs the Schwab sign-in automatically (see [section 5](#5-the-schwab-sign-in)).
4. **Starting all containers** — Mongo, the Schwab data service, the Express
   API, and the web server. The first run builds the images and can take
   **5–10 minutes**. Later runs take under a minute.
5. **Waiting for the dashboard** to come online.
6. **Checking real-time Schwab data** — if Schwab rejects the token, `start`
   re-runs the sign-in on the spot and checks again.
7. **Opening the dashboard** in your browser at **http://localhost:3000**.

When it finishes you'll see either:

- `✓ Live — real-time Schwab data` — everything is working, or
- `! ... delayed Yahoo data` — the app is up but couldn't reach Schwab; the
  message tells you why. See [Troubleshooting](#8-troubleshooting).

Leave the terminal window open while you use the app — closing it is harmless,
but it shows useful status.

---

## 5. The Schwab sign-in

Schwab's security tokens **expire every 7 days**, so roughly once a week `start`
will pause to sign you in again. This is normal and not a bug. When it happens:

1. A browser window opens to the Schwab login page.
2. Sign in with your **Schwab brokerage account** (the one you trade with — not
   the developer portal login).
3. Approve the **"Bandaru Trade Research"** app on the consent screen.
4. Schwab redirects to an address starting with `https://127.0.0.1/?code=...`.
   **The page will look broken** — "this site can't be reached" or a security
   warning. **That is expected.** Schwab has no real website at that address;
   the part that matters is the URL itself.
5. **Copy the entire address bar** — the whole thing, starting with
   `https://127.0.0.1/?code=` and including everything after it.
6. Switch back to the terminal window, **paste the URL**, and press Return.
7. The script exchanges the code for a token, fetches a live SPY price to
   confirm it works, and continues starting the app.

**You have about 30 seconds** to paste the URL back before the code expires, so
move promptly. If it times out, just run `start` again.

---

## 6. Stopping the app

- **macOS** — double-click **`stop.command`**
- **Windows** — double-click **`stop.bat`**

This shuts down every container, frees the network ports, and closes the
dashboard browser tabs. Your **trade journal is preserved** — it lives in a
MongoDB volume that survives stops and restarts. Tomorrow, just run `start`
again and your data is still there.

---

## 7. A quick tour of the dashboard

The dashboard opens at **http://localhost:3000** with a ticker picker in the
header and these tabs:

- **Chart Analysis** — candlestick chart with EMA 8/21/50, pivot support and
  resistance, volume, MACD, and TTM Squeeze. Mouse-wheel to zoom.
- **Entry / Exit Alerts** — pivot levels and 0DTE trade suggestions with status
  badges.
- **Pro Signals** — stacked EMA, ADX trend strength, MACD, and RSI.
- **Watchlist** — live quotes for several symbols; click one to switch tickers.
- **Screener** — scans a list of tickers for actionable setups; click any row
  to load that ticker.
- **Trade Journal** — log open and closed trades with P&L; stored in MongoDB.
- **Options Chain** — calls and puts around the at-the-money strike.
- **Profile** — company overview, analyst view, earnings, news, and a
  short/long-term outlook.
- **Option Decay** — a heatmap of how an option's premium changes with stock
  price and time decay.

Switch the active symbol any time with the ticker picker in the header.

---

## 8. Troubleshooting

Start here for the quick fix, then read the detailed notes below.

| Symptom | Quick fix |
|---|---|
| `start` won't open — macOS says "unidentified developer" | Right-click `start.command` → **Open** → **Open**. One time only. |
| Windows SmartScreen warning | Click **More info → Run anyway**. One time only. |
| `start` says Docker isn't running | Open **Docker Desktop**, wait for the whale icon to go solid, run `start` again. |
| Dashboard shows nothing / "can't connect" | The containers are still starting. Wait 30–60 seconds and refresh the browser. |
| Dashboard works but data looks delayed / `! Yahoo data` | The Schwab token was rejected. See **"Schwab data isn't loading"** below. |
| Schwab sign-in: "site can't be reached" after login | Expected — copy the whole URL and paste it into the terminal. |
| Schwab sign-in fails / "code expired" | Run `start` again and paste the redirect URL faster (within ~30 seconds). |
| Screener is empty or every row errors | The data source is rate-limited. Wait a minute and click **Scan** again. |
| "Port already in use" | Run `stop`, then `start` again. |
| First launch is taking many minutes | Normal — the first build is 5–10 minutes. Later runs are fast. |

### Docker isn't running

`start` needs Docker Desktop running before it can do anything. Open Docker
Desktop and wait until the whale icon (menu bar on Mac, system tray on Windows)
is **solid, not animating**. On Windows, if Docker complains about WSL, open a
terminal and run `wsl --update`, then restart Docker Desktop.

### Schwab data isn't loading

The dashboard always works — if Schwab is unreachable it automatically falls
back to delayed Yahoo data. When you want real-time Schwab data back, work
through this in order:

1. **Check the exact reason.** Open this address in your browser:
   **http://localhost:3000/api/diagnose?ticker=SPY**
   It reports precisely what's wrong — expired token, app not approved, missing
   data permission, or the data service being unreachable.

2. **If it says the token is expired or rejected** — re-run the sign-in.
   Double-click `auth-schwab.command` (Mac) or `auth-schwab.bat` (Windows),
   complete the browser steps, and wait for `✓ Token saved AND verified`. Then
   run `start` again. Remember: Schwab tokens last only 7 days, so this is a
   routine weekly step.

3. **If you just re-authed and it's *still* rejected** — the running container
   may be holding the old token. Run `stop`, then `start` — a fresh start
   forces the container to load the new token from disk.

4. **If a brand-new token is still rejected** — the problem is on Schwab's
   side, not the app's. Sign in at **https://developer.schwab.com**, open your
   app, and confirm it is approved ("Ready for use") and has the **Market Data
   Production** product enabled. A token can't work until the app does.

### The Screener shows errors or no rows

The screener scans dozens of symbols at once. If the data provider is
temporarily rate-limiting your connection, some rows show errors. Wait about a
minute and click **Scan** again — results are cached for 5 minutes, so the
second scan is fast and usually clean. A cold first scan can take 10–15 seconds.

### The dashboard won't open in the browser

Give it time on the first run — building the containers takes several minutes.
If `http://localhost:3000` still won't load after that, check the terminal
window `start` opened for error messages, or view the container logs:

```
cd mern
docker compose logs -f
```

(Press Ctrl+C to stop watching the logs.)

### A specific tab shows an error

If one tab misbehaves after an update, the browser may be caching old files.
Do a hard refresh: **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows). If it
persists, run `stop` then `start` to rebuild with the latest code.

### Starting completely fresh

To wipe everything **including your trade journal** and rebuild from scratch:

```
cd mern
docker compose --profile schwab down -v
```

The `-v` deletes the database volume — only do this if you truly want to erase
your saved trades. Then run `start` again.

---

## 9. Updating the app

When you get new code (a download or `git pull`), simply run `start` again.
It rebuilds any containers whose code changed and recreates them, so the latest
version is always what launches. Your trade journal is preserved.

To clean out disposable junk (caches, editor backups, old token backups, stale
build output) without touching anything important, run `cleanup.command` (Mac)
or `cleanup.bat` (Windows). Add `--dry-run` to preview what it would remove.

---

*Bandaru Trade Research is a personal analysis tool. It is not financial
advice. Day trading 0DTE options carries substantial risk of total loss.
Verify every signal independently before placing trades.*

# Bandaru Trade Research — Windows Installation Guide

A complete, beginner-friendly walkthrough for getting the dashboard
running on Windows 10 or Windows 11. **No coding experience required.**
Total time from zero to a working dashboard: about **15 minutes** if
you already have Docker Desktop installed, or **45 minutes** including
Docker Desktop installation.

---

## Table of contents

1. [What you're installing](#1-what-youre-installing)
2. [Before you begin — system check](#2-before-you-begin--system-check)
3. [Install Docker Desktop](#3-install-docker-desktop-one-time)
4. [Get the project files](#4-get-the-project-files)
5. [First-time install (one click)](#5-first-time-install-one-click)
6. [Daily use](#6-daily-use)
7. [Schwab real-time data (optional)](#7-schwab-real-time-data-optional)
8. [What if something goes wrong?](#8-what-if-something-goes-wrong)
9. [Common Windows gotchas](#9-common-windows-gotchas)
10. [Uninstall / clean reset](#10-uninstall--clean-reset)
11. [Quick command reference](#11-quick-command-reference)

---

## 1. What you're installing

Bandaru Trade Research is a **trading-research dashboard** that runs in
your browser at `http://localhost:3000`. It analyzes SPY 0DTE options
trades, market data, news, and signals.

Under the hood the app is a small set of **Docker containers** that all
run on your PC. You don't have to know what Docker is — the installer
handles every detail. All you have to do is double-click `install.bat`.

What you'll **see**:

- A folder you extracted from a ZIP, named `bandaru-trade-research`
- A few double-clickable files: `install.bat`, `start.bat`, `stop.bat`,
  `auth-schwab.bat`
- A browser tab that opens to `http://localhost:3000`

What's **running in the background** after install:

- A small database (MongoDB) holding your trade-journal entries
- A backend API (Node.js) doing all the math
- The dashboard UI (React) you interact with
- Optionally: a Schwab data sidecar (Python) for real-time quotes

---

## 2. Before you begin — system check

**Required:**

| Requirement                | Need                            | Verify                                   |
| -------------------------- | ------------------------------- | ---------------------------------------- |
| Windows 10 or 11           | 64-bit, build 19041 or newer    | `Win + R`, type `winver`, press Enter    |
| Free disk space            | At least 5 GB                   | Right-click `C:` in File Explorer → Properties |
| Internet connection        | yes — for first-time downloads  |                                          |
| Administrator rights       | needed for Docker install only  |                                          |
| Working RAM                | 8 GB recommended (4 GB minimum) |                                          |

**Not required:**

- Python ❌ — the installer doesn't need a Python install. Schwab OAuth
  runs inside the Docker container which already has Python baked in.
- Node.js ❌ — same reason; Node lives inside the containers.
- Git ❌ — you can download the project as a ZIP.
- Any developer experience ❌ — every step is a double-click or copy/paste.

**Check your Windows build:**

1. Press `Win + R` to open the Run dialog.
2. Type `winver` and press Enter.
3. A small window opens. Look for "Version" and "OS Build". You need
   **Windows 10 version 1903 (build 19041) or newer**, or any Windows 11.

If your Windows is older, run Windows Update first
(`Settings → Update & Security → Windows Update → Check for updates`).

---

## 3. Install Docker Desktop (one time)

Skip this section if you already have Docker Desktop installed and the
whale icon in your system tray is steady (not animating).

### 3.1 Download

Open your browser and go to:
**<https://www.docker.com/products/docker-desktop>**

Click the big blue **Download for Windows (AMD64)** button. The file is
about 600 MB — usually 1–3 minutes to download.

> **Apple Silicon Mac users running Windows via Parallels:** download the
> ARM64 version instead. Most PCs are AMD64.

### 3.2 Install

1. Open your `Downloads` folder.
2. Double-click `Docker Desktop Installer.exe`.
3. Windows asks "Do you want to allow this app to make changes?" → click **Yes**.
4. The installer dialog appears with a single checkbox: **"Use WSL 2 instead
   of Hyper-V (recommended)"** — leave it **checked**.
5. Click **OK**. Installation takes 2–5 minutes.
6. When asked, **restart your computer**.

### 3.3 First launch of Docker Desktop

1. After the restart, Docker Desktop opens automatically. If not, find it
   in the Start menu and launch it.
2. Accept the service agreement.
3. You can skip the sign-in screen (click **"Continue without signing in"**).
4. Wait. The first launch initializes WSL2 and downloads ~1 GB more —
   this takes 3–10 minutes on a typical home connection.
5. **You're ready when:**
   - The Docker whale icon in the bottom-right system tray is **steady**
     (not animating).
   - Docker Desktop's main window says **"Engine running"** at the bottom-left.

If Docker shows a message about "WSL 2 installation is incomplete," click
the link it shows and run the suggested installer. Then close and
re-open Docker Desktop.

### 3.4 Verify Docker is working

1. Press `Win + R`, type `cmd`, press Enter. A black Command Prompt window opens.
2. Type this and press Enter:
   ```
   docker --version
   ```
3. You should see something like `Docker version 24.0.6, build ed223bc`.
   The exact version doesn't matter — anything 20.10 or newer is fine.
4. Type this and press Enter:
   ```
   docker info
   ```
5. You should see a long block of text describing your Docker
   installation. The important line near the top is **`Server Version:`**
   followed by a number. If you see an error like *"error during connect…
   Docker Desktop is not running"*, go back to Docker Desktop and make
   sure the whale icon is steady.

If both commands work, Docker is set up. Close the Command Prompt.

---

## 4. Get the project files

### 4.1 Download the ZIP

If someone shared a ZIP file with you (`bandaru-trade-research-…zip`),
skip to **4.2**.

Otherwise:

1. Open the project's GitHub page in your browser.
2. Click the green **Code** button (top-right of the file listing).
3. Click **Download ZIP** at the bottom of the menu.
4. The ZIP downloads to your `Downloads` folder.

### 4.2 Extract — CRITICAL: do this right

**This is the step most people get wrong.** Double-clicking a ZIP file
in Windows opens a *preview* — it does NOT extract the files. If you try
to run anything from inside that preview, Windows runs it from a
temporary folder that gets deleted on reboot, and Docker bind-mounts
fail. You'll see errors like *"The system cannot find the path
specified"* and *"docker-compose.yml not found"*.

Do this instead:

1. Open File Explorer (`Win + E`).
2. Navigate to your `Downloads` folder.
3. **Right-click** the ZIP file (e.g. `bandaru-trade-research-main.zip`)
   → **Extract All…** in the context menu.
4. The "Extract Compressed (Zipped) Folders" dialog opens. **Delete the
   default path** and type exactly:
   ```
   C:\bandaru-trade-research
   ```
   No quotes. No trailing backslash. Make sure it's `C:\`, not
   `C:\Users\<name>\Documents\`, not `C:\Users\<name>\OneDrive\…`. The
   plain `C:\` root is best because it avoids OneDrive sync conflicts.
5. Untick "Show extracted files when complete" if you want, then click
   **Extract**.
6. Wait ~10 seconds for extraction to finish.

### 4.3 Verify the folder

1. Open File Explorer.
2. In the address bar at the top, type `C:\bandaru-trade-research` and press Enter.
3. You should see folders like `mern`, `legacy-python`, `scripts`, `docs`
   and files like `install.bat`, `start.bat`, `stop.bat`,
   `auth-schwab.bat`, `.env.example`, `README.md`.

If you instead see another nested folder named
`bandaru-trade-research-main`, open it — that's your real project root.
Either work from inside that nested folder, or move all of its contents
up one level so they sit directly under `C:\bandaru-trade-research`.

---

## 5. First-time install (one click)

This is the easy part. The installer handles every manual step you might
have read elsewhere.

### 5.1 Run install.bat

1. Open File Explorer to `C:\bandaru-trade-research`.
2. **Double-click `install.bat`.**

Windows may show a SmartScreen warning the first time:
**"Windows protected your PC."** This is normal for unsigned scripts.
Click **"More info"** then **"Run anyway"**.

A black Command Prompt window opens and the installer starts.

### 5.2 What you'll see — prerequisite check

```
╔═══════════════════════════════════════════════════════════════╗
║  Bandaru Trade Research — Windows Installer                   ║
╚═══════════════════════════════════════════════════════════════╝

▸ 1. Checking prerequisites
  ✓ PowerShell 5.1 (need 5.1+)
  ✓ Windows 10.0 build 19045
  ✓ Docker CLI 24.0.6
  ✓ Docker daemon reachable (server 24.0.6)
  ✓ Docker is using Linux containers (good)
  ✓ 47.3 GB free on C: drive
  ! No host Python on PATH — that's FINE.
    Schwab OAuth runs inside the Docker sidecar container,
    so the dashboard works without a Python install on Windows.
  ✓ Windows long-path support enabled
```

Each line is a check the installer runs for you. A `✓` means good. A
`!` is informational (not an error). A `✗` means something is wrong —
the installer prints the exact fix below the line and stops.

If you see all `✓` and `!` (no `✗`), the installer continues.

### 5.3 Credential prompt

You'll then see:

```
▸ 2. Setting up the .env file
  ✓ .env created from template

▸ 3. Schwab API credentials

  Two options:
    [1] Real-time Schwab data  (need API key + secret from
         https://developer.schwab.com)
    [2] Free Yahoo Finance     (15-minute delayed)

  Choice [1/2, default 1]:
```

**If you don't have Schwab developer credentials yet:** type `2` and
press Enter. The dashboard runs on free, 15-minute-delayed Yahoo
Finance data. You can always add Schwab credentials later by re-running
`install.bat --force-env`.

**If you have Schwab credentials:** type `1` (or just press Enter for
the default), then paste your API key when asked, then paste your
secret. (See **section 7** below for how to get those.)

The secret input is **masked** — you'll see nothing as you type. Paste
it (`Ctrl + V` or right-click → Paste) and press Enter.

### 5.4 First build — wait 3 to 5 minutes

You'll then see:

```
▸ 4. Starting containers (first build can take 3-5 minutes)
[+] Building 142.3s (28/28) FINISHED
 ...
[+] Running 4/4
 ✔ Network mern_bandaru-net    Created
 ✔ Container bandaru-mongo     Started
 ✔ Container bandaru-server    Started
 ✔ Container bandaru-client    Started

  ✓ Containers started

▸ 5. Waiting for the dashboard to come online
........  ✓ Dashboard is responding

▸ 6. Opening dashboard in your browser
  ✓ Browser tab opened
```

That's it. A browser tab opens to **<http://localhost:3000>** and the
dashboard loads.

### 5.5 What success looks like

In your browser at `http://localhost:3000` you should see:

- A header reading **"Bandaru — Trade Research"**
- A ticker input prefilled with **SPY** and a price like `$758.34`
- A row of tabs: Chart Analysis, Entry/Exit Alerts, Pro Signals,
  GEX Dashboard, etc.
- The chart shows recent candles for SPY

If the dashboard is on Yahoo mode, you'll see a yellow banner near the
top: *"DELAYED DATA — Quotes are about 15 minutes delayed"*. That's the
expected behavior for free mode.

---

## 6. Daily use

### 6.1 Starting the dashboard each day

Open File Explorer to `C:\bandaru-trade-research` and **double-click
`start.bat`**.

This is the **daily-use** launcher — much faster than `install.bat`
because it skips the build step. Usually ready in 10–20 seconds.

### 6.2 Stopping the dashboard

When you're done for the day, **double-click `stop.bat`**.

Containers shut down cleanly. Your **trade-journal data is preserved**
in a Docker volume — the next `start.bat` brings it all back.

### 6.3 Re-authenticating Schwab (every 7 days)

The Schwab token expires every 7 days. When the dashboard banner shows
**"Schwab token rejected — re-run auth-schwab"**, double-click
**`auth-schwab.bat`** and follow the prompts.

See **section 7.3** for the full OAuth walkthrough.

### 6.4 Re-running the installer

`install.bat` is **idempotent** — safe to run again any time. Use it
when:

- You want to switch from Yahoo to Schwab data (run with `--force-env`)
- Containers are misbehaving and you want a clean rebuild
- You moved the project to a new folder

---

## 7. Schwab real-time data (optional)

Default Yahoo mode is fine for trying the app. Real-time Schwab quotes
need a one-time Schwab developer-portal registration.

### 7.1 Create a Schwab developer app

1. Make sure you have a **Schwab brokerage account** (the normal
   trading account you log into at schwab.com).
2. In your browser, go to **<https://developer.schwab.com>** and click
   **Register**. Use the same email as your brokerage account.
3. Sign in to the developer portal after registering.
4. Click **Dashboard** in the top-right, then **+ Add a New App**.
5. Fill in the form:
   - **App name:** anything, e.g. `Bandaru Trade Research`
   - **API products:** check **"Accounts and Trading Production"**
   - **Callback URL:** type exactly `https://127.0.0.1` (no port, no
     path, no trailing slash — Schwab is strict about this)
   - **Order limit:** any value, e.g. 1
6. Click **Create**.

### 7.2 Wait for approval, then copy keys

1. Schwab reviews your app. This typically takes a few minutes to a few
   hours. The portal will show the app's status as **"Ready For Use"**
   when approved.
2. Once approved, click into your app. You'll see:
   - **App Key** (sometimes labeled "Client ID") — a long alphanumeric
     string like `sRBBFUTkL1w4jnf7AC…`
   - **App Secret** — a shorter alphanumeric string. Click **Show** to
     reveal it.
3. Keep this browser tab open — you'll paste both values into the
   installer in the next step.

### 7.3 Add credentials to the dashboard

1. Make sure `start.bat` (or `install.bat`) isn't currently running.
2. Double-click `install.bat`.
3. At the credential prompt, press `1` for Schwab mode.
4. When asked for **SCHWAB_API_KEY**, switch to the Schwab dev-portal
   browser tab, copy the App Key, switch back to the installer, right-
   click in the Command Prompt → Paste, press Enter.
5. When asked for **SCHWAB_APP_SECRET**, do the same with the secret.
   The secret input is masked — you won't see anything as you paste.
6. The installer rebuilds containers with Schwab mode enabled.

### 7.4 First OAuth sign-in

After install finishes, you'll see the dashboard but with a banner:
**"Schwab token rejected — re-run auth-schwab.command"** (the message
is Mac-style but the meaning is the same).

1. Double-click **`auth-schwab.bat`**.
2. A Command Prompt opens explaining what's about to happen. Press
   Enter to start.
3. The script prints a Schwab authorization URL — a long URL starting
   with `https://api.schwabapi.com/v1/oauth/authorize?...`
4. **Select the URL** in the Command Prompt — click at the start, hold
   Shift, click at the end. Then `Ctrl + C` to copy.
5. Open your browser, click in the address bar, paste (`Ctrl + V`),
   press Enter.
6. Sign in with your **Schwab brokerage account** (not the developer-
   portal account — they're separate logins).
7. On the consent screen, click **Allow** for "Bandaru Trade Research".
8. Schwab redirects to **`https://127.0.0.1/?code=…&session=…`**. The
   browser page won't load — *"site can't be reached"* or a certificate
   error. **This is correct and expected.**
9. Click in the browser's address bar (`Ctrl + L` selects everything),
   copy the **entire URL** (`Ctrl + C`).
10. Switch back to the auth-schwab Command Prompt. Right-click in the
    window → Paste. The URL appears at the `Redirect URL>` prompt.
11. Press Enter.

You'll see:

```
  ✓ Token saved AND verified — Schwab accepted it.
    Token file: legacy-python\schwab_token.json (good for 7 days)
```

Refresh `http://localhost:3000` — the yellow "DELAYED DATA" banner
disappears, and you're now on real-time Schwab data.

---

## 8. What if something goes wrong?

A symptom-first table. Look up your error message; jump to the fix.

### 8.1 During install

| What you see                                                         | What it means                                                | Fix                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `'docker' is not recognized as an internal or external command`       | Docker isn't installed or PATH isn't set                     | Reinstall Docker Desktop (§3), then **close and re-open** Command Prompt.                            |
| `Docker daemon NOT reachable`                                         | Docker Desktop isn't running                                 | Open Docker Desktop, wait until whale icon stops animating, re-run `install.bat`.                    |
| `Docker is in Windows-container mode`                                 | Wrong container engine                                       | Right-click whale icon → "Switch to Linux containers…", wait 30s, re-run.                            |
| `.env.example is missing`                                             | You're not in the project root                               | Confirm you double-clicked `install.bat` *inside* `C:\bandaru-trade-research`, not some other place. |
| `Windows long-path support is OFF`                                    | A registry key needs flipping                                | Run as admin in Command Prompt: `reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f` |
| `Container bandaru-server` keeps restarting in `docker compose ps`    | Server crashed — usually a `.env` problem                    | `cd C:\bandaru-trade-research\mern && docker compose logs server`. Read the last 50 lines for the cause. |
| First build is stuck at `RUN npm install` for over 10 minutes         | Slow internet                                                | Patience. First builds download ~700 MB. Subsequent builds are 30 seconds.                           |
| Build fails with `failed to resolve source metadata for docker.io/…`  | Docker Hub is throttling or your internet dropped            | Wait 5 minutes, re-run. If persistent, sign in to Docker Hub via the Docker Desktop UI.              |
| `Dashboard didn't respond within 2 minutes`                           | Containers are up but the UI isn't reachable                 | `docker compose ps` — check all containers say `Up`. If yes, give it another 30s and refresh browser. |

### 8.2 Once running

| What you see in the dashboard                                        | What's happening                                             | Fix                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Yellow banner: *"DELAYED DATA"*                                      | You're in Yahoo mode                                          | Expected. Add Schwab creds and re-auth (§7) for real-time.                                           |
| Banner: *"Schwab token rejected"*                                    | Token expired or revoked                                      | Double-click `auth-schwab.bat`.                                                                      |
| Chart shows *"Yahoo Finance is rate-limiting — try again in ~60s"*  | Yahoo throttled your IP                                       | Wait 60s. Or add Schwab creds for real-time.                                                         |
| Chart is blank with no message                                       | Old client bundle is cached                                   | `Ctrl + Shift + R` in browser to hard-refresh. If still blank, `stop.bat` → `start.bat`.             |
| Dashboard shows `—` for SPY price                                    | API call failed                                               | Open `http://localhost:4000/api/diagnose?ticker=SPY` — the JSON tells you exactly which source failed. |
| Pivot Stop Ladder shows all `—`                                      | Pivots route returned `available: false`                      | Same as above — check `/api/diagnose`. Usually means both Yahoo and Schwab are unhealthy.            |
| Browser hangs loading `localhost:3000`                               | Containers haven't fully booted                               | Wait another 30s. If still hung: `cd mern && docker compose restart`.                                |

### 8.3 Inspecting container state directly

Open Command Prompt and run:

```
cd C:\bandaru-trade-research\mern
docker compose ps
```

Each container should say `Up` and `(healthy)`. If any say `Restarting`
or `Exited`, see its logs:

```
docker compose logs --tail 100 server
docker compose logs --tail 100 client
docker compose logs --tail 100 schwab
docker compose logs --tail 100 mongo
```

### 8.4 If everything looks broken, nuke and reinstall

```
cd C:\bandaru-trade-research\mern
docker compose down -v
cd ..
install.bat --force-env
```

This wipes Mongo (trade-journal data gone), removes containers,
recreates `.env` from the template, and rebuilds from scratch. About 5
minutes.

---

## 9. Common Windows gotchas

### 9.1 OneDrive — the silent killer

If you extract the project into `Documents`, `Desktop`, or `Pictures`
and OneDrive is syncing those folders, Docker bind mounts will randomly
fail with permission errors. Files may show with a cloud icon instead of
a checkmark.

**Fix:** Extract to `C:\bandaru-trade-research` (or any non-OneDrive
path). The project README everywhere assumes this path.

### 9.2 ZIP preview vs extracted ZIP

Double-clicking a ZIP in File Explorer opens a *preview*, not an
extraction. Running `install.bat` from the preview puts the project in
`C:\Users\<name>\AppData\Local\Temp\…` which Windows deletes on reboot.

**Fix:** Always right-click the ZIP → **Extract All…** → specify a real
path like `C:\bandaru-trade-research`.

### 9.3 Antivirus blocking the build

Some antivirus products (Avast, McAfee, Norton, Bitdefender) flag the
Docker socket or block scripts running from `C:\bandaru-trade-research`.
Symptoms: `install.bat` exits at random points, containers crash
without a clear cause.

**Fix:** Add `C:\bandaru-trade-research\` to your AV's exclusion list,
and add `docker.exe` / `com.docker.backend.exe` to allowed processes.

### 9.4 SmartScreen warning on first run

Windows shows *"Windows protected your PC"* the first time you
double-click `install.bat`. This is because the script isn't
code-signed.

**Fix:** Click **"More info"** then **"Run anyway"**. Only happens once
per file.

### 9.5 PowerShell execution policy

The `.bat` wrappers pass `-ExecutionPolicy Bypass` to PowerShell so you
don't have to change your global policy. If you ever see *"running
scripts is disabled on this system"* from a `.ps1` invocation, that's
the global policy. You can leave it alone — the `.bat` wrappers
override it per-invocation.

### 9.6 Hyper-V vs WSL2

Docker Desktop 4.x uses WSL2 by default. If you previously used Hyper-V
mode and switched, run `wsl --update` in an admin PowerShell to make
sure WSL2 is current.

### 9.7 Port 3000 or 4000 already in use

If another app (Node dev server, Grafana, etc.) is already on port 3000
or 4000, the dashboard won't load.

**Fix:** In Command Prompt, find what's holding the port:
```
netstat -ano | findstr :3000
```
The last column is a PID. Kill it via Task Manager → Details tab. Or
edit `mern\docker-compose.yml` to use a different host port (`"3000:80"`
→ `"3010:80"`, then visit `localhost:3010`).

---

## 10. Uninstall / clean reset

### 10.1 Stop and remove containers (keep data)

```
cd C:\bandaru-trade-research\mern
docker compose down
```

### 10.2 Remove containers AND wipe trade-journal data

```
cd C:\bandaru-trade-research\mern
docker compose down -v
```

### 10.3 Remove Docker images (~2 GB reclaimed)

```
docker image rm bandaru-server bandaru-client bandaru-schwab
docker image prune -f
```

### 10.4 Remove the project folder

In File Explorer, delete `C:\bandaru-trade-research`. Empty the
Recycle Bin if you want the space back immediately.

### 10.5 Uninstall Docker Desktop (optional)

`Settings → Apps → Installed apps → Docker Desktop → Uninstall`. This
removes Docker but not your project folder.

---

## 11. Quick command reference

### Daily

| What                         | How                                              |
| ---------------------------- | ------------------------------------------------ |
| Start dashboard              | Double-click `start.bat`                         |
| Stop dashboard               | Double-click `stop.bat`                          |
| Re-auth Schwab (every 7 days)| Double-click `auth-schwab.bat`                   |
| Open dashboard in browser    | `http://localhost:3000`                          |
| Backend API health check     | `http://localhost:4000/api/diagnose?ticker=SPY`  |

### First-time / Recovery

| What                              | How                                           |
| --------------------------------- | --------------------------------------------- |
| First install                     | Double-click `install.bat`                    |
| Recreate `.env` from template     | `install.bat --force-env`                     |
| Skip Schwab prompt; use Yahoo     | `install.bat --yahoo-only`                    |
| Fully unattended (CI / scripted)  | `install.bat --non-interactive`               |

### Inspection (Command Prompt, run from `C:\bandaru-trade-research\mern`)

| What                              | How                                           |
| --------------------------------- | --------------------------------------------- |
| List running containers           | `docker compose ps`                           |
| Tail backend logs (live)          | `docker compose logs -f server`               |
| Tail Schwab sidecar logs          | `docker compose logs -f schwab`               |
| Restart a single container        | `docker compose restart server`               |
| Force-rebuild everything          | `cd .. && install.bat`                        |

### Cleanup

| What                              | How                                           |
| --------------------------------- | --------------------------------------------- |
| Stop + remove containers          | `docker compose down`                         |
| Above + wipe DB                   | `docker compose down -v`                      |
| Remove images                     | `docker image rm bandaru-server bandaru-client bandaru-schwab` |

---

## Getting help

If you're stuck and the troubleshooting tables didn't fix it:

1. Copy the **last 30 lines** of the failing window (right-click in the
   Command Prompt title bar → Edit → Select All → Copy).
2. Note the exact step you were on.
3. Share both with whoever sent you the project.

Including the full output makes it 10× easier to diagnose.

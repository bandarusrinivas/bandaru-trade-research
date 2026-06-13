# Bandaru Trade Research — Installation & Setup Guide

This guide walks you through **every prerequisite** and **every step** needed to
get the dashboard running, on both **macOS** and **Windows**. No prior
developer experience is assumed — each command is spelled out.

If you only want to *use* the app once it is installed, see
[USER_GUIDE.md](USER_GUIDE.md).

---

## Contents

1. [What you are installing](#1-what-you-are-installing)
2. [System requirements](#2-system-requirements)
3. [macOS — prerequisites & setup](#3-macos--prerequisites--setup)
4. [Windows — prerequisites & setup](#4-windows--prerequisites--setup)
5. [Verifying the installation](#5-verifying-the-installation)
6. [Schwab real-time data (optional)](#6-schwab-real-time-data-optional)
7. [The `.env` configuration file](#7-the-env-configuration-file)
8. [Updating the app](#8-updating-the-app)
9. [Uninstalling](#9-uninstalling)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. What you are installing

Bandaru Trade Research is a **Docker Compose application**. You do not install
the app itself — instead you install **Docker**, and Docker builds and runs the
four pieces of the app inside isolated containers:

| Container | Role |
|---|---|
| `bandaru-client` | The web dashboard (React, served by nginx) |
| `bandaru-server` | The API (Node.js + Express) |
| `bandaru-mongo` | The database (MongoDB — stores your trade journal) |
| `bandaru-schwab` | Optional real-time data sidecar (Python + Flask) |

Because everything runs in Docker, the **only hard requirement is Docker
Desktop**. Git and Python are recommended add-ons (Git makes updates easy;
Python is needed only for the optional Schwab real-time sign-in).

**Two ways to run, two data sources:**

| Data source | Cost | Latency | Extra setup |
|---|---|---|---|
| **Yahoo Finance** (default) | Free | ~15 min delayed | None |
| **Schwab API** | Free | Real-time | Schwab brokerage + developer account + Python |

You can install with just Docker and run on Yahoo today, then add Schwab later.

---

## 2. System requirements

| | Minimum | Recommended |
|---|---|---|
| **macOS** | macOS 12 Monterey | macOS 13 Ventura or newer |
| **Windows** | Windows 10 64-bit (version 2004 / build 19041+) | Windows 11 |
| **CPU** | 64-bit, virtualization-capable | Apple Silicon / modern Intel / AMD |
| **RAM** | 4 GB free | 8 GB or more |
| **Disk** | 5 GB free | 10 GB free |
| **Network** | Broadband (first build downloads ~1 GB of images) | — |

> **Apple Silicon (M1/M2/M3/M4) and Intel Macs are both supported.** Docker
> Desktop and this app pick the correct architecture automatically.

---

## 3. macOS — prerequisites & setup

You will install, in order: **Homebrew → Docker Desktop → Git → Python 3**,
then get the project and launch it. Homebrew is a package manager that makes
installing the rest a one-line command each.

### 3.1 Install Homebrew

Open the **Terminal** app (press `Cmd + Space`, type `Terminal`, press Return),
then paste this command and press Return:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

It will ask for your Mac password (typing is invisible — that is normal) and
take a few minutes.

**Apple Silicon Macs only** — after it finishes, add Homebrew to your shell so
the `brew` command is found in every new Terminal window:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

Verify Homebrew works:

```bash
brew --version
```

You should see `Homebrew 4.x.x`. If you see "command not found", close and
reopen Terminal and try again.

### 3.2 Install Docker Desktop

Docker Desktop is the engine that runs the app. Install it with Homebrew:

```bash
brew install --cask docker
```

Then **start Docker Desktop**:

1. Open it: press `Cmd + Space`, type `Docker`, press Return.
2. Accept the service agreement on first launch.
3. Wait until the **whale icon** appears in the menu bar (top-right) and stops
   animating — that means the Docker engine is running.

> You can also download Docker Desktop manually from
> <https://www.docker.com/products/docker-desktop/> if you prefer not to use
> Homebrew. Either way works.

Verify Docker is installed and running:

```bash
docker --version
docker compose version
docker info
```

The first two print version numbers; `docker info` should print details
**without** an error. If `docker info` errors, Docker Desktop is not running
yet — open it and wait for the whale icon.

### 3.3 Install Git (recommended)

Git lets you download the project and pull updates with one command:

```bash
brew install git
git --version
```

> Git is optional — you can instead download the project as a ZIP (see 3.5) —
> but with Git, updating later is a single `git pull`.

### 3.4 Install Python 3 (only for Schwab real-time data)

**Skip this step if you will run on free Yahoo data.** Python is needed only
for the one-time Schwab sign-in (the `auth-schwab.command` script builds a
small local Python environment to perform the OAuth handshake).

```bash
brew install python
python3 --version
```

You need **Python 3.10 or newer**.

### 3.5 Get the project

**Option A — with Git (recommended):**

```bash
cd ~/Documents
git clone https://github.com/bandarusrinivas/bandaru-trade-research.git
cd bandaru-trade-research
```

**Option B — download the ZIP:**

1. Go to the project's GitHub page.
2. Click the green **Code** button → **Download ZIP**.
3. Double-click the downloaded ZIP to unzip it.
4. Move the resulting `bandaru-trade-research` folder somewhere stable, e.g.
   `~/Documents`.

> **iCloud Drive warning.** If you place the project inside a folder that
> iCloud syncs (Desktop or Documents with "Optimize Mac Storage" on), macOS
> may keep some files "in the cloud" rather than on disk. That can make the
> launch scripts stall. The simplest fix: keep the project in a **non-synced**
> location, or right-click the project folder → **Download Now** and wait for
> all the cloud icons to disappear before launching. See
> [Troubleshooting](#10-troubleshooting).

### 3.6 First launch

In the `bandaru-trade-research` folder, **double-click `start.command`**.

- On the very first launch macOS Gatekeeper may block it with *"cannot be
  opened because it is from an unidentified developer."* Fix it once:
  **right-click `start.command` → Open → Open**. (Or: System Settings →
  Privacy & Security → scroll down → **Open Anyway**.)
- A Terminal window opens and `start.command` does everything: checks Docker,
  creates the `.env` file, builds the containers (first build takes several
  minutes), and opens the dashboard.

When it finishes, your browser opens **<http://localhost:3000>**.

To stop everything later, double-click **`stop.command`**.

---

## 4. Windows — prerequisites & setup

> **For an even more beginner-friendly version of this section — with
> troubleshooting tables and OneDrive/antivirus gotchas — see the
> dedicated [WINDOWS-INSTALL.md](../WINDOWS-INSTALL.md) at the project
> root.** This section is the canonical, technically-thorough version
> with full PATH-variable setup; that doc is the screenshot-friendly
> walkthrough for non-technical users.

Order of installation:

1. **WSL2** (Windows Subsystem for Linux 2) — Docker's backend on Windows
2. **Docker Desktop** — runs the application's containers
3. **Git** — for cloning/updating the project (recommended)
4. **Python 3** (optional) — only needed if you want to run helper scripts
   on the host; **NOT required for the dashboard itself** because the
   Schwab sidecar container has its own Python 3.11
5. **The project files**
6. **install.bat** for the one-click setup

Total time end-to-end on a clean Windows machine: about **30–45 minutes**.

### 4.1 Enable WSL2 (Windows Subsystem for Linux)

Docker Desktop on Windows runs on top of WSL2. You enable it once per
machine.

**Quick path (Windows 10 build 19041+ and Windows 11):**

1. Click **Start**, type `PowerShell`.
2. Right-click **Windows PowerShell** → **Run as administrator**. Confirm
   the UAC prompt by clicking **Yes**.
3. In the elevated PowerShell window run:

   ```powershell
   wsl --install
   ```

   This installs the WSL2 kernel, registers the Linux feature, and sets
   WSL2 as the default version in one shot.
4. **Restart your PC** when Windows prompts you.

**Verify WSL2 is active** (open a fresh PowerShell after the restart):

```powershell
wsl --list --verbose
```

Expected output:

```
  NAME      STATE           VERSION
* Ubuntu    Running         2
```

The `VERSION` column must say `2`. If it says `1`, force the upgrade:

```powershell
wsl --set-default-version 2
wsl --set-version Ubuntu 2
```

**If `wsl --install` errors with "virtualization is disabled"**, hardware
virtualization is turned off in your BIOS/UEFI. Reboot, press the BIOS
key on startup (`F2`, `F10`, `F12`, or `Del` depending on manufacturer),
look for **Virtualization Technology** / **Intel VT-x** / **AMD-V** /
**SVM Mode** under the CPU or Advanced section, set it to **Enabled**,
save and exit.

### 4.2 Install Docker Desktop

1. In a browser, open <https://www.docker.com/products/docker-desktop/>.
2. Click the big **Download for Windows (AMD64)** button. The installer
   is ~600 MB.
3. Run `Docker Desktop Installer.exe` from your Downloads folder.
4. **Important:** in the installer's options dialog, ensure
   ☑ **Use WSL 2 instead of Hyper-V (recommended)** is checked.
   Leave the other defaults alone. Click **Ok**.
5. Installation takes 3–5 minutes. When asked, **restart Windows**.
6. After the restart, Docker Desktop launches automatically. Accept the
   service agreement. You can skip the sign-in screen ("Continue without
   signing in").
7. First-launch initialization downloads ~1 GB more — 3–10 minutes
   depending on connection. **You're ready when the whale icon in the
   bottom-right system tray is steady (not animating)** and Docker
   Desktop's status bar at the bottom-left says **"Engine running"**.

**Verify Docker installed correctly.** Open a fresh PowerShell or
Command Prompt and run all three:

```powershell
docker --version
docker compose version
docker info
```

- `docker --version` should print something like `Docker version 24.0.6, build ed223bc`.
- `docker compose version` should print `Docker Compose version v2.x.x`.
- `docker info` should print a long block of system information ending
  with no errors. The key line is `Server Version:` followed by a number.

**If `docker info` errors with "error during connect…"**, Docker Desktop
isn't fully started yet. Wait until the whale icon is steady and retry.

### 4.3 Install Git (recommended)

Git lets you clone the project and pull updates without re-downloading
the ZIP every time. Two install methods:

**Method A — winget (built into Windows 10/11):**

```powershell
winget install --id Git.Git -e --source winget
```

**Method B — installer GUI:**

1. Open <https://git-scm.com/download/win>.
2. Download and run `Git-x.xx.x-64-bit.exe`.
3. Accept the default options on every screen. The installer
   automatically adds `git` to your `PATH`.

**Verify Git is on the PATH.** Open a NEW PowerShell window (old windows
don't see PATH changes) and run:

```powershell
git --version
```

You should see `git version 2.xx.x.windows.x`. If you instead get
*"'git' is not recognized…"*, see **section 4.5 — fixing PATH** below.

### 4.4 Install Python 3 (optional but documented)

> **Read this first:** Python is **NOT required** for the Bandaru Trade
> Research dashboard to work. The Schwab OAuth flow runs inside the
> `bandaru-schwab` Docker container, which already has Python 3.11.
> `install.bat` will detect the absence of host Python and continue
> happily.
>
> Install Python on Windows only if you want to:
> - Run the unit tests in `legacy-python/tests/` outside Docker
> - Use `pip install` for development tools alongside the dashboard
> - Write your own scripts that import from the project's Python modules
>
> If none of that applies, **skip to section 4.6**.

#### 4.4.1 Download

1. Open <https://www.python.org/downloads/windows/>.
2. Under **"Latest Python 3 Release"**, click the version link (3.12.x or
   newer; **never older than 3.10**).
3. On the version page, scroll to **Files** and download
   **"Windows installer (64-bit)"**.

> **Do not install Python from the Microsoft Store.** The Store version
> ships as a Windows app and its `python.exe` lives behind an "app
> execution alias" stub. This stub is NOT the same as a real Python
> install and confuses many scripts — including some Docker / poetry /
> pipx workflows. Use the python.org installer.

#### 4.4.2 Run the installer — checkbox that matters

1. Double-click `python-3.x.x-amd64.exe` from your Downloads folder.
2. **On the very first screen, before clicking anything else, check
   both boxes at the bottom:**
   - ☑ **Use admin privileges when installing py.exe**
   - ☑ **Add python.exe to PATH** ← THIS IS THE CRITICAL ONE
3. Click **Install Now** (the simple option). Installation takes ~1
   minute.
4. On the final screen, click **Disable path length limit** (it's a
   button). This removes the 260-character path limit and prevents
   obscure errors with deeply-nested `node_modules` and similar.
5. Click **Close**.

**If you forgot to check "Add python.exe to PATH"** — that's the most
common mistake. You can fix it without reinstalling; see section 4.4.4
below for the manual PATH steps.

#### 4.4.3 Verify Python is on the PATH

Open a NEW PowerShell window (old ones don't see PATH changes — close
and reopen) and run all three:

```powershell
python --version
pip --version
where.exe python
```

Expected output:

```
Python 3.12.x
pip 23.x.x from C:\Users\<you>\AppData\Local\Programs\Python\Python312\Lib\site-packages\pip (python 3.12)
C:\Users\<you>\AppData\Local\Programs\Python\Python312\python.exe
```

The `where.exe python` line is the important one — it shows you the
ACTUAL `python.exe` that will run when you type `python`. If it points
to `C:\Users\<you>\AppData\Local\Microsoft\WindowsApps\python.exe`,
that's the Microsoft Store shim — see 4.4.5 below to disable it.

#### 4.4.4 Manually adding Python to PATH (if you forgot the checkbox)

If `python --version` says *"'python' is not recognized as an internal
or external command"*, Python is installed but not on your `PATH`. Fix:

1. Press `Win + R`, type `sysdm.cpl`, press Enter. The **System
   Properties** dialog opens.
2. Click the **Advanced** tab.
3. Click the **Environment Variables…** button near the bottom.
4. In the **User variables for <your-username>** section (top half of
   the dialog), find the variable named `Path` and click it to highlight,
   then click **Edit…**.
5. A list of existing PATH entries appears. Click **New** and paste:
   ```
   %LOCALAPPDATA%\Programs\Python\Python312\Scripts\
   ```
   Click **New** again and paste:
   ```
   %LOCALAPPDATA%\Programs\Python\Python312\
   ```
   *(Replace `Python312` with `Python311`, `Python313`, etc. if you
   installed a different version. Look in
   `C:\Users\<you>\AppData\Local\Programs\Python\` to confirm.)*
6. Click **OK** on each open dialog (three times: PATH editor → User
   variables → System Properties).
7. **Close every open PowerShell and Command Prompt window.** PATH
   changes don't propagate into running shells — you must open fresh
   ones.
8. Open a NEW PowerShell and re-run the verification commands from
   section 4.4.3.

#### 4.4.5 Disabling the Microsoft Store Python alias

If `where.exe python` points to
`WindowsApps\python.exe`, that's the Microsoft Store stub interfering
with your real Python install. Disable it:

1. Press `Win + I` to open **Settings**.
2. Go to **Apps → Advanced app settings → App execution aliases**.
3. Find the rows for `python.exe` and `python3.exe`. Switch both **Off**.
4. Close the Settings window.
5. Open a NEW PowerShell. Re-run `where.exe python`. It should now point
   to your real Python install in `Programs\Python\Python312\`.

#### 4.4.6 Confirm `pip` works

Once `python` and `pip` resolve correctly, do one more check:

```powershell
pip install --user --upgrade pip
pip --version
```

This upgrades pip to the latest and confirms write access to the per-
user site-packages directory. If pip fails with "access denied," your
install may be system-wide instead of per-user — re-run the python.org
installer and pick **"Install Now"** (not "Customize") which defaults
to a user-local install.

### 4.5 Fixing "command not recognized" errors (general PATH troubleshooting)

If `git`, `python`, `docker`, or `node` returns
*"is not recognized as an internal or external command"*, the binary is
installed but not on your `PATH`. The general fix:

1. Find where the tool is installed. Typical locations:
   - Git → `C:\Program Files\Git\cmd\`
   - Python → `%LOCALAPPDATA%\Programs\Python\Python312\` and `Python312\Scripts\`
   - Docker → `C:\Program Files\Docker\Docker\resources\bin\`
   - Node.js → `C:\Program Files\nodejs\`
2. Open **System Properties → Advanced → Environment Variables** (run
   `sysdm.cpl`).
3. Edit your **User PATH** variable. Click **New**. Paste the directory
   that contains the `.exe`. Click **OK**.
4. **Close ALL existing terminal windows.** They cached the old PATH.
5. Open a fresh PowerShell. The tool now works.

> **Pro tip:** if you'd rather see your PATH in a readable list (it's
> semicolon-separated and unreadable raw), run this in PowerShell:
> ```powershell
> $env:Path -split ';' | Sort-Object
> ```

### 4.6 Get the project

**Option A — with Git (recommended):**

```powershell
cd $env:USERPROFILE\Documents
git clone https://github.com/bandarusrinivas/bandaru-trade-research.git
cd bandaru-trade-research
```

To update later: `git pull`. No re-download needed.

**Option B — download the ZIP:**

1. Open <https://github.com/bandarusrinivas/bandaru-trade-research> in
   your browser.
2. Click the green **Code** button → **Download ZIP**.
3. In File Explorer, navigate to your **Downloads** folder.
4. **Right-click** the ZIP file → **Extract All…** (do NOT double-click
   — that just opens a preview).
5. Change the extraction path to `C:\bandaru-trade-research` (NOT inside
   OneDrive, NOT Desktop, NOT Documents-with-OneDrive-sync — those
   sync conflicts break Docker bind mounts). Click **Extract**.

### 4.7 First launch — run install.bat

Open File Explorer to your project folder (`C:\bandaru-trade-research`
or wherever you put it) and **double-click `install.bat`**.

- **First time only:** Windows SmartScreen may warn *"Windows protected
  your PC."* Click **More info → Run anyway**.
- The installer runs **8 prerequisite checks** automatically:
  1. PowerShell ≥ 5.1
  2. Windows 10/11 build
  3. `docker` CLI on PATH
  4. Docker daemon reachable (Docker Desktop running)
  5. Linux container mode (vs Windows containers)
  6. ≥ 3 GB free disk space
  7. Host Python (informational only — `!` is not an error)
  8. Windows long-path support
- Each prints a `✓`, `!`, or `✗` line.
- On any `✗`, the installer prints the exact fix below the line and
  stops. Apply the fix, then re-run `install.bat`.
- On success it creates `.env` from the template, prompts for **Schwab
  credentials or Yahoo mode**, builds the containers (first build is
  3–5 minutes), waits for the dashboard to come online, and opens your
  browser.

When it finishes, your browser opens **<http://localhost:3000>**.

### 4.8 Daily use after install

| Action            | Double-click          | What it does                       |
| ----------------- | --------------------- | ---------------------------------- |
| Start dashboard   | **`start.bat`**       | No rebuild (~10s); opens browser   |
| Stop dashboard    | **`stop.bat`**        | `docker compose down`              |
| Re-auth Schwab    | **`auth-schwab.bat`** | OAuth inside Docker (no host Python)|
| Re-install        | **`install.bat`**     | Idempotent — safe to re-run        |

> **Always use the `.bat` files on Windows.** The `.command` files are
> macOS-only. See [WINDOWS-INSTALL.md](../WINDOWS-INSTALL.md) for the
> full beginner-friendly walkthrough, including OneDrive / antivirus
> gotchas, the Schwab developer-portal registration walkthrough, and a
> thorough symptom-first troubleshooting table.

---

## 5. Verifying the installation

After the first launch, confirm everything is healthy:

1. **The dashboard loads** at <http://localhost:3000> and shows a price for
   SPY.
2. **Containers are running** — in a terminal:

   ```bash
   docker ps
   ```

   You should see `bandaru-client`, `bandaru-server`, and `bandaru-mongo`
   (plus `bandaru-schwab` if you enabled Schwab).
3. **Data-source health** — open
   <http://localhost:4000/api/diagnose?ticker=SPY> in your browser. It reports
   which data source is active and whether Schwab is connected.

If the dashboard shows prices, the installation succeeded.

---

## 6. Schwab real-time data (optional)

By default the app runs on free, ~15-minute-delayed Yahoo data — no account
needed. For **real-time** quotes you need a free Schwab developer app.

### 6.1 Get Schwab API credentials

1. You need a **Schwab brokerage account** (the normal trading account).
2. Create a **free developer account** at <https://developer.schwab.com>.
3. Create an app of type **"Accounts and Trading Production"** (or Market
   Data). Set the **callback URL** to exactly:

   ```
   https://127.0.0.1
   ```

4. Once Schwab approves the app (this can take a short while), copy its
   **App Key** and **App Secret**.

### 6.2 Add the credentials

Open the `.env` file in the project root (create it from `.env.example` if it
is not there yet) and set:

```
SCHWAB_API_KEY=your_app_key_here
SCHWAB_APP_SECRET=your_app_secret_here
DATA_SOURCE=schwab
```

> **Never share or commit these keys.** The `.env` file is already excluded
> from Git so your secrets are never uploaded.

### 6.3 Sign in

Run `start.command` (Mac) / `start.bat` (Windows). When it detects Schwab
credentials but no valid token, it offers to sign you in. Follow the prompts:

1. The script prints (or opens) a Schwab authorization URL.
2. Open it, log in with your **Schwab brokerage account**, and approve the app.
3. Schwab redirects to a `https://127.0.0.1/?code=...` page that looks broken —
   **that is expected**. Copy the **entire URL** from the address bar.
4. Paste that URL back into the script's terminal window and press Return.
5. It saves a token and verifies it with a live quote.

> **The Schwab refresh token lasts 7 days.** After that you simply repeat the
> sign-in. If the token is ever rejected, the app automatically falls back to
> Yahoo data so the dashboard keeps working.

---

## 7. The `.env` configuration file

`start` creates `.env` automatically from `.env.example` on first run. You can
edit it to change behaviour. Common keys:

| Key | Purpose | Default |
|---|---|---|
| `DATA_SOURCE` | `yahoo` or `schwab` | `yahoo` |
| `SCHWAB_API_KEY` | Schwab developer app key | *(empty)* |
| `SCHWAB_APP_SECRET` | Schwab developer app secret | *(empty)* |
| `SCHWAB_FALLBACK_TO_YAHOO` | Auto-fall back to Yahoo if Schwab fails | `true` |
| `MONGO_URI` | Database connection string | local container |
| `PORT` | API server port | `4000` |
| `RISK_FREE_RATE` | Rate used in option pricing | `0.05` |

After editing `.env`, restart the app (`stop` then `start`) for changes to
take effect.

---

## 8. Updating the app

**With Git:**

```bash
cd bandaru-trade-research
git pull
```

then run `start.command` / `start.bat` again — it rebuilds the containers with
the new code. Your `.env` and trade-journal database are preserved.

**With a ZIP download:** download the new ZIP, unzip it, and copy your existing
`.env` file into the new folder before launching.

---

## 9. Uninstalling

1. Stop the app: `stop.command` / `stop.bat`.
2. Remove the containers, images, and the database volume:

   ```bash
   cd bandaru-trade-research/mern
   docker compose --profile schwab down --volumes --rmi all
   ```

   > `--volumes` also deletes your trade journal. Omit it to keep the database.
3. Delete the `bandaru-trade-research` folder.
4. To remove Docker itself: uninstall Docker Desktop like any other app.

---

## 10. Troubleshooting

**"Docker isn't running" / `docker info` errors**
Open Docker Desktop and wait for the whale icon to be steady before launching.
The first start of Docker after a reboot can take a minute.

**The dashboard won't open / "port already in use"**
Another program is using port 3000, 4000, or 27017. Close it, or stop any
other Docker projects (`docker ps` to see what is running), then retry.

**macOS: "cannot be opened because it is from an unidentified developer"**
Right-click the script → **Open** → **Open**. You only do this once per script.

**Windows: "Windows protected your PC" (SmartScreen)**
Click **More info → Run anyway**. Only appears the first time.

**The launch script stalls or a script exits with no message (macOS)**
Most often the project folder is in iCloud Drive and some files are not
downloaded to disk. In Finder, right-click the `bandaru-trade-research` folder
→ **Download Now**, wait for every cloud icon to disappear, then retry. Best
long-term fix: keep the project in a folder iCloud does not sync.

**"couldn't find env file"**
Older builds needed a hand-made `.env`. Current `start` scripts create one
automatically from `.env.example`. If you see this, update to the latest code.

**Schwab says the token was rejected**
The 7-day refresh token has expired or is invalid. Run `auth-schwab.command` /
`auth-schwab.bat` and complete the sign-in again. The app keeps running on
Yahoo data in the meantime.

**The Schwab sign-in (`auth-schwab`) won't start or hangs**
It builds a small Python environment first. Make sure Python 3.10+ is
installed (section 3.4 / 4.4) and the project folder is fully downloaded
(not an iCloud placeholder). If it still fails, delete the
`legacy-python/.venv` folder so it is rebuilt fresh on the next run.

**First build is very slow**
The first `start` downloads ~1 GB of base images and compiles the app. Later
launches reuse the cache and take seconds. A slow connection makes the first
run take 10+ minutes — this is normal.

**Still stuck?**
Open a terminal in the `mern` folder and run `docker compose logs -f` to see
live container logs, and check
<http://localhost:4000/api/diagnose?ticker=SPY> for a data-source health
report.

---

*Educational use only — not financial advice. See the project README and
LICENSE for full terms.*

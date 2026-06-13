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

> **For a much more detailed Windows-only walkthrough — beginner-friendly,
> with troubleshooting tables and OneDrive/antivirus gotchas — see the
> dedicated [WINDOWS-INSTALL.md](../WINDOWS-INSTALL.md) at the project
> root.** This section is the quick reference; that doc is the
> step-by-step for non-technical users.

You will install: **WSL2 → Docker Desktop**, then get the project and
launch it. **Python is NOT required** — Schwab OAuth runs inside the
Docker container which already has Python 3.11 baked in.

### 4.1 Enable WSL2

Docker Desktop on Windows runs on top of WSL2 (the Windows Subsystem for
Linux). Enable it once:

1. Click **Start**, type `PowerShell`, right-click **Windows PowerShell** →
   **Run as administrator**.
2. Run:

   ```powershell
   wsl --install
   ```

3. **Restart your PC** when prompted.

If `wsl --install` reports virtualization is disabled, reboot into your
BIOS/UEFI (usually `F2`, `F10`, or `Del` during startup) and enable
**Virtualization** / **Intel VT-x** / **AMD-V** / **SVM Mode**, then save and
exit.

### 4.2 Install Docker Desktop

1. Download the installer from
   <https://www.docker.com/products/docker-desktop/> (the **Windows** button).
2. Run `Docker Desktop Installer.exe`. When asked, **keep "Use WSL 2 instead
   of Hyper-V" checked**.
3. Restart if prompted, then **launch Docker Desktop** and accept the service
   agreement.
4. Wait until the Docker whale icon in the system tray (bottom-right) is
   steady — that means the engine is running.

Verify in a new PowerShell or Command Prompt window:

```powershell
docker --version
docker compose version
docker info
```

`docker info` must run without an error. If it errors, Docker Desktop is not
running yet.

### 4.3 Install Git (recommended)

Download and run the installer from
<https://git-scm.com/download/win> (the default options are fine), or with the
built-in package manager:

```powershell
winget install --id Git.Git -e
```

> Git is optional but recommended — without it you must re-download the ZIP
> each time you want to update the app.

### 4.4 (Skip — Python not needed on Windows)

> Earlier revisions required a host Python install for Schwab OAuth.
> That's **no longer the case**: `auth-schwab.bat` runs the OAuth flow
> inside the `bandaru-schwab` Docker container, which already has
> Python 3.11. You don't need to install Python on Windows for any
> reason — host or otherwise.

### 4.5 Get the project

**Option A — with Git (recommended):**

```powershell
cd %USERPROFILE%\Documents
git clone https://github.com/bandarusrinivas/bandaru-trade-research.git
```

**Option B — download the ZIP:** click the green **Code** button on GitHub →
**Download ZIP**, then right-click the ZIP → **Extract All**. Move the
`bandaru-trade-research` folder somewhere stable such as
`Documents`. Avoid extracting it into `Downloads` or onto the Desktop.

### 4.6 First launch — run install.bat

In the `bandaru-trade-research` folder, **double-click `install.bat`**.

- Windows SmartScreen may warn *"Windows protected your PC."* Click
  **More info → Run anyway** (this happens only the first time).
- The installer runs **8 prerequisite checks** automatically (PowerShell
  version, Windows build, Docker CLI, Docker daemon, Linux containers,
  free disk, host Python — informational only, long-path support). Each
  prints a `✓`, `!`, or `✗` line so you see exactly what's missing.
- If something fails, the installer prints the exact fix below the `✗`
  line and stops. Apply the fix, then re-run `install.bat`.
- On success it creates `.env` from the template, prompts for **Schwab
  credentials or Yahoo mode**, builds the containers (first build is
  3–5 minutes), waits for the dashboard to respond, and opens your
  browser.

When it finishes, your browser opens **<http://localhost:3000>**.

To stop everything later, double-click **`stop.bat`**.
To re-launch the next day (no rebuild, ~10 seconds), double-click **`start.bat`**.
To re-authenticate Schwab (every 7 days), double-click **`auth-schwab.bat`**.

> **Always use the `.bat` files on Windows.** The `.command` files are macOS-only.
> See [WINDOWS-INSTALL.md](../WINDOWS-INSTALL.md) for the full
> beginner-friendly walkthrough, including OneDrive / antivirus
> gotchas and a thorough troubleshooting table.

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

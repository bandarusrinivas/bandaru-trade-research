# Building Bandaru Trade Research as a Standalone App

This guide explains how to package the dashboard as a runnable application that distributes to **Mac (.app)** or **Windows (.exe)** — recipients double-click it and the app launches without needing Python installed.

The build uses **PyInstaller**, which bundles Python + every dependency + the Flask server + templates + static assets into a single distributable folder.

---

## Quick start

### On macOS

```bash
# In Terminal, from the project folder:
./build-mac.command
```

Or double-click **`build-mac.command`** in Finder.

Output: `dist/Bandaru Trade Research.app` — a native Mac app bundle.

### On Windows

```bat
REM In Command Prompt, from the project folder:
build-windows.bat
```

Or double-click **`build-windows.bat`** in File Explorer.

Output: `dist\Bandaru Trade Research\Bandaru Trade Research.exe` — runs on any Windows 10/11 PC.

---

## Cross-platform builds — important caveat

**PyInstaller does NOT cross-compile.** You can only build for the platform you're currently on:

| Building for | Must run build on |
|---|---|
| macOS (Intel + Apple Silicon) | macOS |
| Windows | Windows |
| Linux | Linux |

To distribute both Mac and Windows versions you need access to a machine of each platform (or set up CI like GitHub Actions — see "Automated CI builds" below).

---

## What's in the output?

The bundle includes:

- **Python interpreter** (~30 MB)
- **Flask + Werkzeug + Jinja2** (the web server)
- **yfinance + pandas + numpy** (market data fallback)
- **schwab-py + authlib + httpx** (Schwab API client)
- **All `templates/` and `static/`** (HTML, CSS, JS)
- **`.env.example`** (gets copied to user data dir on first launch)
- The custom Flask app + indicators + greeks + analysis code

Final size: **~150–250 MB** unzipped on disk. The `.zip` for distribution is typically ~70–100 MB.

---

## Where the app stores user data

Once launched, the app writes user-specific data **outside** the bundle (so the bundle itself stays read-only and can be moved/reinstalled):

| Platform | User data path |
|---|---|
| macOS | `~/Library/Application Support/BandaruTradeResearch/` |
| Windows | `%APPDATA%\BandaruTradeResearch\` |
| Linux | `~/.local/share/BandaruTradeResearch/` |

Files saved there:
- `.env` — Schwab credentials + DATA_SOURCE choice
- `schwab_token.json` — OAuth refresh tokens

On **first launch**, the app copies `.env.example` from the bundle into the user data dir. Users edit that file (or use the in-app config panel if you add one later) to set their Schwab credentials.

---

## Distributing to end users

### macOS distribution

1. Right-click `dist/Bandaru Trade Research.app` → **Compress** to get a `.zip`
2. Share the `.zip` via email, Dropbox, etc.
3. Recipients:
   - Unzip
   - Drag `Bandaru Trade Research.app` to Applications (or anywhere)
   - **First launch**: right-click → **Open** (because the app isn't notarized by Apple)
   - Click **Open** at the security warning
   - Subsequent launches: just double-click normally

#### Avoiding the security warning permanently

To distribute professionally, you need an **Apple Developer ID** ($99/year) and to:

1. Code-sign: `codesign --deep --force --options runtime --sign "Developer ID Application: Your Name" "dist/Bandaru Trade Research.app"`
2. Notarize: `xcrun notarytool submit ... --wait`
3. Staple: `xcrun stapler staple "dist/Bandaru Trade Research.app"`

Once notarized, recipients can double-click without the warning.

### Windows distribution

1. Right-click the `dist\Bandaru Trade Research` folder → **Send to → Compressed (zipped) folder**
2. Share the `.zip`
3. Recipients:
   - Unzip to any location (Desktop, Documents, Program Files)
   - Double-click `Bandaru Trade Research.exe`
   - **First launch**: Windows SmartScreen will warn "Windows protected your PC" — click **More info → Run anyway**

#### Avoiding the SmartScreen warning

You need a **code-signing certificate** ($100–400/year from DigiCert, Sectigo, etc.) and:

```cmd
signtool sign /a /t http://timestamp.digicert.com "dist\Bandaru Trade Research\Bandaru Trade Research.exe"
```

After signing + a few hundred users running it, SmartScreen reputation builds and the warning disappears.

### One-file builds (single .exe, no folder)

Edit `bandaru.spec` and change the `EXE(...)` call from `exclude_binaries=True` to `exclude_binaries=False`, and remove the `COLLECT(...)` block. Or just run:

```bash
pyinstaller bandaru.spec --noconfirm --onefile
```

Trade-off: single file is cleaner to ship, but startup is 3–5× slower (extracts to a temp dir on every launch).

---

## Troubleshooting builds

### "ModuleNotFoundError: No module named 'X'" on launch

PyInstaller missed a hidden import. Edit `bandaru.spec` and add `"X"` to the `hiddenimports` list. Rebuild.

### "Failed to load Python DLL" on Windows

The build picked up the wrong Python. Make sure your `.venv` is activated and `python --version` shows the version you want bundled.

### `dist` folder is enormous (500+ MB)

Trim unused dependencies in the `excludes` list of `bandaru.spec`. Common bloat: `matplotlib`, `IPython`, `notebook`, `pytest`.

### App opens, browser shows "Can't connect"

The Flask server crashed during boot. Run from Terminal to see the error:

```bash
# macOS
"dist/Bandaru Trade Research.app/Contents/MacOS/Bandaru Trade Research"

# Windows
"dist\Bandaru Trade Research\Bandaru Trade Research.exe"
```

### Schwab OAuth fails in the bundled app

Edit the user `.env` (see paths above) and add your Schwab `SCHWAB_API_KEY` + `SCHWAB_APP_SECRET`. Or leave them blank and the app will fall back to Yahoo automatically.

---

## Automated CI builds (advanced)

To build for both Mac and Windows automatically on every git push, set up GitHub Actions. Example workflow `.github/workflows/build.yml`:

```yaml
name: Build distributables
on: [push, workflow_dispatch]
jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt pyinstaller
      - run: pyinstaller bandaru.spec --noconfirm
      - uses: actions/upload-artifact@v4
        with:
          name: bandaru-${{ matrix.os }}
          path: dist/
```

Every push produces downloadable artifacts for both platforms.

---

## File reference (build-related)

| File | Purpose |
|---|---|
| `launcher.py` | App entry point — starts Flask, opens browser, handles paths |
| `bandaru.spec` | PyInstaller bundle specification |
| `build-mac.command` | One-click Mac build (double-click in Finder) |
| `build-windows.bat` | One-click Windows build (double-click in Explorer) |
| `requirements.txt` | Python dependencies installed during build |
| `BUILD.md` | This file |

---

*Last updated: 2026-05-14*

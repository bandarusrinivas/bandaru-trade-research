# Push to GitHub — github.com/bandarusrinivas/

One-time setup to publish this project as a public (or private) GitHub repository.

---

## Step 1 — Create the empty repository on GitHub

1. Sign in at [github.com](https://github.com) as **bandarusrinivas**
2. Click the **+** (top-right) → **New repository**
3. Fill in:
   - **Repository name**: `bandaru-trade-research`  (or any name you prefer)
   - **Description**: "SPY 0DTE options day-trading dashboard with pivots, indicators, and option-chain analysis"
   - **Visibility**: Public OR Private (your choice — Schwab credentials are gitignored either way)
   - **DO NOT** check "Add a README", "Add .gitignore", or "Add a license" — we already have those
4. Click **Create repository**
5. Copy the repo URL: `https://github.com/bandarusrinivas/bandaru-trade-research.git`

---

## Step 2 — Verify your local repo is clean of secrets

```bash
cd /path/to/spy-zero-dte

# Sanity check — these files should NEVER be committed:
ls -la .env schwab_token.json 2>/dev/null

# The .gitignore already excludes them. Verify:
git status --ignored | head -20
```

If `.env` or `schwab_token.json` appear in `git status` (NOT under "Ignored files"), STOP and check `.gitignore` is in place.

---

## Step 3 — Initialize git and push

```bash
cd /path/to/spy-zero-dte

# First-time setup
git init
git branch -M main
git add .
git status                    # ← review what's being committed; ensure no secrets!
git commit -m "Initial commit — Bandaru Trade Research"

# Connect to GitHub
git remote add origin https://github.com/bandarusrinivas/bandaru-trade-research.git

# Push
git push -u origin main
```

If prompted to authenticate:
- **HTTPS**: GitHub requires a Personal Access Token (PAT). Go to **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token**. Scope: `repo`. Use the token as your password.
- **SSH** (preferred): Set up an SSH key first via [GitHub's guide](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) and change the remote to `git@github.com:bandarusrinivas/bandaru-trade-research.git`.

---

## Step 4 — Verify the GitHub Actions build kicks off

After the first push:

1. Go to `https://github.com/bandarusrinivas/bandaru-trade-research/actions`
2. You should see a workflow run titled "Build distributables"
3. Click it — both `macos-latest` and `windows-latest` jobs run in parallel (~5–10 min each)
4. When green, download artifacts from the workflow run page:
   - `BandaruTradeResearch-macOS` (a .app bundle)
   - `BandaruTradeResearch-Windows` (a folder with .exe)

These are the distributables you can hand to anyone.

---

## Step 5 — Optional: tag a release

When you want to ship a version:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The Actions workflow automatically:
- Builds Mac + Windows
- Creates a GitHub Release titled `v1.0.0`
- Attaches both binaries as downloadable .zip files
- Generates release notes from your commit history

Subsequent versions: `git tag v1.0.1 && git push origin v1.0.1` — same flow.

---

## Step 6 — Subsequent updates

After the initial push, the daily workflow is:

```bash
# Make changes locally...
git add .
git commit -m "Brief description of change"
git push
```

GitHub Actions rebuilds the binaries on every push to `main`. No manual rebuild needed.

---

## Files included in the repo

| File / folder | Purpose |
|---|---|
| `README.md` | Project landing page (what visitors see) |
| `LICENSE` | MIT license |
| `BUILD.md` | Build + distribution guide |
| `USER_GUIDE.md` | Start/stop/exit usage |
| `.gitignore` | Excludes secrets, venv, build artifacts |
| `.github/workflows/build.yml` | CI builds for Mac + Windows |
| `bandaru.spec`, `launcher.py` | PyInstaller config |
| `build-mac.command`, `build-windows.bat` | Local one-click builds |

## Files NOT in the repo (gitignored)

| File | Why excluded |
|---|---|
| `.env` | Contains Schwab API credentials |
| `schwab_token.json` | OAuth refresh tokens |
| `.venv/` | Python virtual environment (recreated per machine) |
| `dist/`, `build/` | PyInstaller build output |
| `__pycache__/`, `*.pyc` | Python bytecode cache |

---

## Rotating the leaked Schwab Client Secret

Reminder from earlier in our work: you pasted your Schwab Client Secret into chat. **Before pushing this repo public**, rotate the secret:

1. Sign in at [developer.schwab.com](https://developer.schwab.com)
2. Apps → your app → **Regenerate Secret**
3. Update `SCHWAB_APP_SECRET=` in your local `.env`
4. Delete `schwab_token.json` and run `bandaru auth` to mint a fresh token

Since `.env` is gitignored, the new secret will never appear in the repo.

---

## Repository description suggestion

For the GitHub repo About panel:

> "Day-trading dashboard for SPY 0DTE options — real-time pivots, S/R levels, option-chain levels (Max Pain, top OI), TTM Squeeze, MACD, ADX, Heikin-Ashi candles. Runs locally as a Flask web app with Schwab API or Yahoo Finance fallback. Cross-platform standalone builds available."

Topics to add: `trading`, `options-trading`, `spy`, `0dte`, `schwab-api`, `yfinance`, `flask`, `technical-analysis`, `pivot-points`, `dashboard`

---

*Last updated: 2026-05-14*

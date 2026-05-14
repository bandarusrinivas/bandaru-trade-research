# Push to GitHub — step by step

Two paths: **Mac** below, **Windows** further down. Each is a self-contained walkthrough — follow only the section for your OS.

Target repository: **github.com/bandarusrinivas/bandaru-trade-research**

---

## 🍎 macOS

### Prerequisites

You need these installed (most are already on a developer Mac):

| Tool | How to check | If missing |
|---|---|---|
| `git` | Open Terminal → `git --version` | macOS bundles it; otherwise install Xcode Command Line Tools: `xcode-select --install` |
| `brew` (Homebrew) | `brew --version` | `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` |
| `gh` (GitHub CLI) | `gh --version` | The script installs it automatically |

The script handles `gh` install automatically — you only need git and brew up front.

### Step 1 — Quit any old Terminal windows

If you have stale Terminal windows from previous push attempts, close them:
- Click the Terminal in your Dock
- Press **Cmd+Q** to quit fully
- Confirm "Terminate" if prompted

### Step 2 — Open the project folder in Finder

- Press **Cmd+Space**, type `Finder`, hit Return
- Press **Cmd+Shift+G** (Go to Folder)
- Paste this path and press Return:
  ```
  ~/Library/Application Support/Claude/local-agent-mode-sessions/0cf6dd82-fe77-4872-bb0c-9ea8f01e3e72/a1a82aa9-f8d0-415b-adb7-43e70c58f41d/local_307df02a-a735-4f8d-be69-0aee9d27387c/outputs/spy-zero-dte
  ```

### Step 3 — Double-click `push-to-github.command`

Find it in the file list (alphabetically near the bottom). Double-click. A new Terminal window opens automatically.

### Step 4 — Wait for the script to run

You'll see output like:
```
================================================
  Push to GitHub — bandarusrinivas/bandaru-trade-research
================================================
✓ .gitignore properly excludes .env and schwab_token.json
→ git init
✓ 49 files staged
✓ Confirmed no secrets in staged files
✓ Committed: Initial commit — ...
→ Authenticating GitHub CLI via your browser…
```

### Step 5 — Authorize gh CLI in your browser

The script will print a one-time code, like:
```
! First copy your one-time code: ABCD-1234
Press Enter to open github.com in your browser...
```

- Press **Return** to continue
- **Safari opens** to `github.com/login/device`
- **Paste the code** (it's already in your clipboard automatically)
- Click **Continue → Authorize github**
- Safari shows "Congratulations, you're all set!"
- Return to Terminal — it continues automatically

### Step 6 — Done

The Terminal will show:
```
================================================
  ✓ PUSH COMPLETE!
================================================
Repo:    https://github.com/bandarusrinivas/bandaru-trade-research
```

Your default browser opens to the new repo automatically. **GitHub Actions kicks off the cross-platform builds** at `…/actions` within a few seconds.

### macOS Troubleshooting

**"Permission denied" when double-clicking the .command**
- Right-click → **Open** → confirm at the security prompt. (One-time per file.)
- Or in Terminal: `chmod +x push-to-github.command`

**"command not found: brew"**
- Install Homebrew first: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` — then re-run the .command.

**Stale `.git/index.lock` error**
- The script handles this automatically. If it persists: `rm -f .git/index.lock` in Terminal, then re-run.

**"fatal: not in a git directory"**
- The script changes into the project folder via `cd "$(dirname "$0")"`. If this fails, you moved the .command file. Move it back into the spy-zero-dte folder.

---

## 🪟 Windows

### Prerequisites

| Tool | How to check | If missing |
|---|---|---|
| `git` | Open PowerShell → `git --version` | Install **Git for Windows**: https://git-scm.com/download/win |
| `winget` (Win 10/11) | `winget --version` | Update Windows; or use Chocolatey alternative |
| `gh` (GitHub CLI) | `gh --version` | The script installs it via winget automatically |

### Step 1 — Close stale Command Prompt or PowerShell windows

Any leftover terminal windows from previous attempts: click the X to close them.

### Step 2 — Open the project folder in File Explorer

- Press **Win+E** to open File Explorer
- Navigate to wherever you extracted the project (likely your Documents or Downloads)
- Or paste this path in the address bar (adjust to your install location):
  ```
  C:\Users\<YourName>\Documents\spy-zero-dte
  ```

### Step 3 — Double-click `push-to-github.bat`

A Command Prompt window opens automatically.

### Step 4 — First-time SmartScreen warning

The first time you run the .bat, Windows Defender SmartScreen may show:

> "Windows protected your PC"

- Click **More info**
- Click **Run anyway**

This only happens the first time per .bat file.

### Step 5 — Wait for the script to run

Same flow as Mac:
```
================================================
  Push to GitHub - bandarusrinivas/bandaru-trade-research
================================================
+ .gitignore properly excludes secrets
+ git init
+ 49 files staged
+ Confirmed no secrets in staged files
+ Committed: Initial commit...
+ GitHub CLI not installed. Attempting winget install...
```

If `winget` is available, it installs `gh` silently (~30 seconds). If not, the script tells you what to do manually.

### Step 6 — Authorize gh CLI in your browser

The script prints a one-time code:
```
! First copy your one-time code: ABCD-1234
Press ENTER to open github.com in your browser...
```

- Press **Enter**
- Your default browser opens to `github.com/login/device`
- **Paste the code** (Ctrl+V — it's already on your clipboard)
- Click **Continue → Authorize github**
- Browser shows "Congratulations, you're all set!"
- Return to Command Prompt — it continues automatically

### Step 7 — Done

```
================================================
  + PUSH COMPLETE!
================================================
Repo:    https://github.com/bandarusrinivas/bandaru-trade-research
Actions: https://github.com/bandarusrinivas/bandaru-trade-research/actions
```

Your default browser opens to the repo. **GitHub Actions starts building** the Mac + Windows distributables.

### Windows Troubleshooting

**"git is not recognized as an internal or external command"**
- Install Git for Windows: https://git-scm.com/download/win
- Accept all defaults during installation
- Open a **new** Command Prompt (PATH refresh) and re-run

**"winget is not recognized"**
- Update to Windows 10 1709+ or Windows 11
- Or install gh manually: download .msi from https://cli.github.com/ → run installer

**Script flashes briefly and closes**
- Open Command Prompt manually first:
  - Press **Win+R**, type `cmd`, Enter
  - Navigate to project: `cd C:\Users\<YourName>\Documents\spy-zero-dte`
  - Run: `push-to-github.bat`
- You'll see all error messages instead of the window vanishing

**"Push failed: authentication failed"**
- Run: `gh auth refresh`
- Then re-run: `push-to-github.bat`

**Path has spaces in it**
- This is fine — the script wraps paths in quotes. If you wrote your own commands, wrap paths: `cd "C:\My Folder\spy-zero-dte"`

---

## Manual fallback (works on both Mac and Windows)

If the script fails for any reason, do these by hand. Works identically in Terminal (Mac) or Command Prompt / PowerShell (Windows):

```bash
# 1. From the project folder:
git init
git branch -M main
git add .
git commit -m "Initial commit"

# 2. Create the repo at https://github.com/new
#    Repository name: bandaru-trade-research
#    Visibility: Public
#    DO NOT initialize with README/license/gitignore

# 3. After GitHub gives you the URL:
git remote add origin https://github.com/bandarusrinivas/bandaru-trade-research.git
git push -u origin main
```

When `git push` asks for username/password:
- **Username**: `bandarusrinivas`
- **Password**: a **Personal Access Token** (create at https://github.com/settings/tokens with `repo` scope)
- NOT your GitHub password — GitHub disabled password auth for git in 2021

---

## After the push

Once your code is on GitHub:

- **Watch the CI build**: https://github.com/bandarusrinivas/bandaru-trade-research/actions
- **Cross-platform builds run automatically** on every push — Mac .app + Windows folder
- **Tag a release** when ready: `git tag v1.0.0 && git push origin v1.0.0` — produces a GitHub Release with downloadable binaries

For day-to-day pushes after the first one:
```bash
git add .
git commit -m "Brief description"
git push
```

That's it. The Actions workflow rebuilds binaries on every push to `main`.

---

*Last updated: 2026-05-14*

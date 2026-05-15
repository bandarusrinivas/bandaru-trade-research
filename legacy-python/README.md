# Bandaru Trade Research — Legacy Python Implementation

⚠ **This is the legacy implementation.** The primary stack has been rebuilt on MERN — see `../README.md` and `../mern/`.

The Python/Flask version is preserved here for:

- **Reference** — earliest feature-complete version of every indicator, chart pane, and analysis algorithm
- **Single-binary desktop distribution** — PyInstaller can package this as `.app` (macOS) and `.exe` (Windows) for end-users who can't or won't install Docker
- **Backporting features** to MERN — when a feature exists here but not yet in MERN

If you don't specifically need desktop binaries, **use the MERN stack** (`../mern/`) which is the actively-maintained version.

---

## What's in here

| File / folder | Purpose |
|---|---|
| `app.py` | Flask routes |
| `launcher.py` | PyInstaller entry point |
| `bandaru.spec` | PyInstaller bundle spec |
| `requirements.txt` | Python deps |
| `src/` | All Python modules (analysis, indicators, screener, clients) |
| `src/clients/` | Broker adapters (Schwab, Yahoo, demo, etc.) |
| `templates/index.html` | Jinja2 dashboard |
| `static/css/, static/js/` | Vanilla JS chart + dashboard |
| `scripts/` | macOS `.command` + Windows `.bat` launchers, `bandaru` CLI |
| `tests/test_all.py` | 120-check pytest suite |

---

## Running the legacy Python version

If you need to run this instead of the MERN stack:

```bash
cd legacy-python
python3 -m venv .venv
source .venv/bin/activate           # macOS/Linux
# .venv\Scripts\activate            # Windows
pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000.

Or use the one-click launchers:

- **macOS**: double-click `scripts/start-app.command`
- **Windows**: there's no `.bat` equivalent for start; run `python app.py` after the venv setup above

---

## Building desktop binaries from this version

```bash
cd legacy-python
./scripts/build-mac.command         # → dist/Bandaru Trade Research.app
# OR on Windows:
scripts\build-windows.bat           # → dist\Bandaru Trade Research\*.exe
```

---

*Maintained for backward compatibility. New features go into `../mern/`.*

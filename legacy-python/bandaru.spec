# PyInstaller spec for Bandaru Trade Research.
#
# Build:
#   pyinstaller bandaru.spec --noconfirm
#
# Output:
#   dist/Bandaru Trade Research        (folder + executable; cross-platform)
#   dist/Bandaru Trade Research.app    (macOS only, app bundle)
#
# Distribute the folder + .app (Mac) or the folder + .exe (Windows).

from PyInstaller.utils.hooks import collect_data_files, collect_submodules
import sys

# Bundle every template, every static asset, and the example .env
datas = [
    ("templates", "templates"),
    ("static",    "static"),
    (".env.example", "."),
    ("VERSION", "."),
    ("docs", "docs"),
]

# Hidden imports — yfinance, schwab-py, authlib, etc. have dynamic imports
# PyInstaller can't always detect.
hiddenimports = (
    collect_submodules("yfinance")
    + collect_submodules("schwab")
    + collect_submodules("authlib")
    + collect_submodules("dotenv")
    + collect_submodules("pandas")
    + collect_submodules("numpy")
    + ["pytz", "flask", "werkzeug", "click", "itsdangerous", "jinja2", "markupsafe"]
)

# Some packages ship data files (CA bundles, etc.) we need to copy
for pkg in ("certifi", "yfinance", "schwab"):
    try:
        datas += collect_data_files(pkg)
    except Exception:
        pass


block_cipher = None


a = Analysis(
    ["launcher.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Trim things we definitely don't need (saves ~50 MB)
        "tkinter", "test", "tests", "matplotlib", "IPython", "notebook",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Bandaru Trade Research",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,   # show terminal window so user can see logs / Ctrl+C
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="Bandaru Trade Research",
)

# macOS: produce a .app bundle as well
if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="Bandaru Trade Research.app",
        icon=None,
        bundle_identifier="com.bandaru.traderesearch",
        info_plist={
            "CFBundleName": "Bandaru Trade Research",
            "CFBundleDisplayName": "Bandaru Trade Research",
            "CFBundleShortVersionString": "1.0.0",
            "CFBundleVersion": "1.0.0",
            "NSHighResolutionCapable": True,
            "LSUIElement": False,
        },
    )

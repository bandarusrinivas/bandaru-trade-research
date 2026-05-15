"""Single source of truth for the application version.

Reads from the VERSION file (so build tools, the in-app footer, and the
CHANGELOG all stay in sync). Follows Semantic Versioning (semver.org):

    MAJOR.MINOR.PATCH

    MAJOR — incompatible API / data-shape changes
    MINOR — backwards-compatible new features
    PATCH — bug fixes only

To release a new version:
    1. Edit VERSION with the new number
    2. Add a section to CHANGELOG.md describing the changes
    3. git tag vX.Y.Z && git push origin vX.Y.Z
       (Triggers the CI workflow to build distributables and create a Release)
"""
from __future__ import annotations

import os
from pathlib import Path


def get_version() -> str:
    """Return the current app version (read from VERSION file)."""
    try:
        # When running from source
        vfile = Path(__file__).parent / "VERSION"
        if vfile.exists():
            return vfile.read_text().strip()
    except Exception:
        pass

    try:
        # When running from a PyInstaller bundle, VERSION sits next to sys._MEIPASS
        import sys
        if getattr(sys, "frozen", False):
            vfile = Path(sys._MEIPASS) / "VERSION"  # type: ignore[attr-defined]
            if vfile.exists():
                return vfile.read_text().strip()
    except Exception:
        pass

    return "0.0.0-dev"


__version__ = get_version()

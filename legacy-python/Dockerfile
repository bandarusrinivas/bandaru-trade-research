# Bandaru Trade Research — Schwab data sidecar.
# Tiny Flask service exposing /data/* endpoints in MERN-compatible JSON shapes.
# The MERN Express server proxies live-data calls to this container when
# DATA_SOURCE=schwab.

FROM python:3.11-slim

WORKDIR /app

# System deps for cryptography (schwab-py -> authlib -> cryptography)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Source — kept as plain .py.
#
# An earlier revision compiled the Python sources to .pyc + deleted the .py
# files for "source protection". That broke `python-dotenv`'s find_dotenv(),
# which walks the call stack via sys._getframe() and asserts when the calling
# module was loaded by the sourceless legacy-pyc importer (the case for
# .pyc-only modules). The Schwab sidecar is a thin OAuth + REST shim, not the
# value-add of the product, so plain .py is fine here. The Node server stays
# bundled + minified for source-protection.
COPY data_api.py ./
COPY src/ ./src/
RUN find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# Token lives in a mounted volume so it survives container restarts and OAuth
# happens once on the host (auth-schwab.command), not inside the container.
ENV SCHWAB_TOKEN_PATH=/tokens/schwab_token.json
VOLUME ["/tokens"]

EXPOSE 5050

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=10s \
    CMD curl -fsS http://localhost:5050/health || exit 1

CMD ["python", "data_api.py"]

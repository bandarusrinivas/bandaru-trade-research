# Bandaru Trade Research — Schwab data sidecar (source-protected image).
# Tiny Flask service exposing /data/* endpoints in MERN-compatible JSON shapes.
# The MERN Express server proxies live-data calls to this container when
# DATA_SOURCE=schwab.
#
# The Python source is compiled to .pyc bytecode and the .py files are removed,
# so the shipped image contains no readable Python source.

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

# Source — compiled to .pyc bytecode, then the .py source is deleted so the
# image ships no readable Python source.
COPY data_api.py ./
COPY src/ ./src/
RUN find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true \
 && python -m compileall -b -q . \
 && find . -name '*.py' -delete

# Token lives in a mounted volume so it survives container restarts and OAuth
# happens once on the host (auth-schwab.command), not inside the container.
ENV SCHWAB_TOKEN_PATH=/tokens/schwab_token.json
VOLUME ["/tokens"]

EXPOSE 5050

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=10s \
    CMD curl -fsS http://localhost:5050/health || exit 1

CMD ["python", "data_api.pyc"]

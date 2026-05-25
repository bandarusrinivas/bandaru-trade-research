# Cloud Deployment Guide

Bandaru Trade Research ships as a Docker Compose stack (MongoDB + Express API +
React/nginx client, with an optional Schwab sidecar). The same stack that runs
locally runs in the cloud — no code changes are needed.

## What you need

- A Linux host you can reach over SSH — any cloud VM works (AWS EC2, GCP
  Compute Engine, Azure VM, DigitalOcean Droplet, Hetzner, etc.). 2 vCPU /
  4 GB RAM is comfortable.
- **Docker Engine** and the **Docker Compose** plugin installed on that host.
- An inbound firewall rule for the port you expose (see below).

## Deploy steps

1. Copy the project to the host (`git clone` your repository, or `scp` it).
2. Create the environment file:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env`:
   - `DATA_SOURCE=yahoo` — recommended for cloud. Yahoo needs no auth and works
     headless. (Schwab needs an interactive OAuth login — see the note below.)
   - `FINNHUB_API_KEY=` — optional; paste a free key from finnhub.io to enable
     the Finnhub news source.
4. Start the stack:
   ```bash
   cd mern
   docker compose --env-file ../.env -f docker-compose.yml up -d --build
   ```
5. The dashboard is served on port **3000**. Open `http://<host-ip>:3000`.

## Production hardening

- **TLS / domain:** put the client behind a reverse proxy (Caddy, nginx, or a
  cloud load balancer) that terminates HTTPS. Point it at container port 3000.
- **Don't expose MongoDB or the API port publicly** — only the client port
  needs to be reachable. The compose network keeps the API and DB internal.
- **Persistence:** MongoDB writes to a named Docker volume, so the Trade
  Journal survives restarts. Back the volume up with your host's snapshot tooling.
- **Restarts:** the compose services use restart policies, so the stack comes
  back automatically after a host reboot.
- **Secrets:** never commit `.env`, `schwab_token.json`, or `*.token` — they are
  already in `.gitignore`. On the host, keep `.env` readable only by the deploy
  user (`chmod 600 .env`).

## Note on Schwab data in the cloud

Schwab's API uses an interactive OAuth login that returns a 7-day refresh
token. On a headless server you cannot complete that browser login directly.
Two options:

1. **Use Yahoo** (`DATA_SOURCE=yahoo`) — simplest for an always-on cloud
   deployment. Data is ~15-minute delayed.
2. **Bring your own token** — complete the Schwab OAuth on a machine with a
   browser, then copy the resulting `schwab_token.json` to the host. The token
   must be refreshed before its 7-day expiry.

## Updating a running deployment

```bash
git pull
cd mern
docker compose --env-file ../.env -f docker-compose.yml up -d --build
```

Docker rebuilds only the layers that changed, so updates are quick.

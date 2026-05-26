# Bandaru Trade Research

A ready-to-run build of the Bandaru Trade Research dashboard. It runs entirely
from prebuilt Docker images — there is no source code to compile.

## What you need

**Docker Desktop** — <https://www.docker.com/products/docker-desktop/>
(macOS, Windows, or Linux). Install it and make sure it is running before you
continue.

## Run it

1. **Load the images** (one time — this reads the bundled archive):

   ```
   docker load -i bandaru-images-*.tar.gz
   ```

2. **Configure** (optional): copy `.env.example` to `.env` and edit it. With no
   `.env` file the app simply runs on free, ~15-minute-delayed Yahoo data.

   ```
   cp .env.example .env
   ```

3. **Start it:**

   ```
   docker compose up -d
   ```

4. Open **<http://localhost:3000>** in your browser. The first start takes a
   few seconds while the database initializes — if the page looks empty, wait a
   moment and refresh.

5. **Stop it:**

   ```
   docker compose down
   ```

## Data sources

By default the dashboard runs on free **Yahoo Finance** data (about 15 minutes
delayed) and shows a caution banner under the header so you always know the
data is delayed.

The **News** tab works out of the box. Adding a free **Finnhub** API key
(`FINNHUB_API_KEY` in `.env`, from <https://finnhub.io/register>) adds Finnhub
headlines to the stock news feed.

## Schwab real-time data (advanced, optional)

Real-time quotes require your own **Schwab brokerage account** plus a free
**Schwab developer app**, and a one-time OAuth sign-in. To use it:

1. Put `SCHWAB_API_KEY`, `SCHWAB_APP_SECRET` and `SCHWAB_CALLBACK_URL` in `.env`
   and set `DATA_SOURCE=schwab`.
2. Place your Schwab OAuth token at `./tokens/schwab_token.json` (create the
   `tokens` folder next to this file).
3. Start with the Schwab profile:

   ```
   docker compose --profile schwab up -d
   ```

If Schwab is unavailable the app automatically falls back to delayed Yahoo data
and the caution banner appears.

## Troubleshooting

- **Port already in use** — another app is using port 3000 or 4000. Stop it, or
  edit the `ports:` lines in `docker-compose.yml`.
- **Blank page right after starting** — give it ~30 seconds on the first run
  and refresh; the database and server need a moment to come up.
- **Trade Journal shows an error** — the MongoDB container is still starting;
  wait and retry.
- **See what's happening:** `docker compose logs -f`

## Notes

- Your trade journal and settings persist in a Docker volume across restarts.
- **Educational use only — not financial advice.** Trade signals and
  projections are estimates; verify everything independently before trading.

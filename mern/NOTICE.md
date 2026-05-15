# Open Source Attribution — Bandaru Trade Research (MERN)

Every component used in this project is open source. Below is the full attribution.

This software itself is released under the **MIT License** (see [../LICENSE](../LICENSE)).

---

## Runtime dependencies

### Backend (Node.js / Express)

| Package | License | Project URL |
|---|---|---|
| node | MIT | https://github.com/nodejs/node |
| express | MIT | https://github.com/expressjs/express |
| mongoose | MIT | https://github.com/Automattic/mongoose |
| cors | MIT | https://github.com/expressjs/cors |
| morgan | MIT | https://github.com/expressjs/morgan |
| dotenv | BSD-2-Clause | https://github.com/motdotla/dotenv |
| yahoo-finance2 | MIT | https://github.com/gadicc/node-yahoo-finance2 |
| axios | MIT | https://github.com/axios/axios |

### Frontend (React)

| Package | License | Project URL |
|---|---|---|
| react | MIT | https://github.com/facebook/react |
| react-dom | MIT | https://github.com/facebook/react |
| @vitejs/plugin-react | MIT | https://github.com/vitejs/vite-plugin-react |
| vite | MIT | https://github.com/vitejs/vite |
| axios | MIT | https://github.com/axios/axios |

### Infrastructure (Docker images)

| Image | License | Project URL |
|---|---|---|
| node:20-alpine | MIT (Node) + MIT-style (Alpine) | https://github.com/nodejs/docker-node |
| nginx:alpine | 2-Clause BSD | https://nginx.org/LICENSE |
| mongo:7 | **SSPL v1** | https://www.mongodb.com/licensing/server-side-public-license |

### Notes on MongoDB's SSPL

MongoDB switched from AGPL to **Server Side Public License (SSPL) v1** in 2018. SSPL is considered open source by MongoDB Inc., though the Open Source Initiative (OSI) and Debian declined to certify it because of section 13's reach. For end-users running this app **for their own use** (the standard case here), SSPL imposes the same freedoms as AGPL — modify, redistribute, deploy. The restrictions kick in only if you offer MongoDB **itself** as a managed third-party service.

If you need a 100% OSI-certified open-source alternative, swap MongoDB for **PostgreSQL** (PostgreSQL License — OSI approved) — see the "Migrating to PostgreSQL" section below.

---

## License compatibility

All MIT and BSD licenses are mutually compatible and compatible with the MIT license under which this software is distributed. SSPL is one-way compatible: MongoDB's terms apply to MongoDB itself, not to this software that uses MongoDB.

---

## Migrating to PostgreSQL (OSI-certified open source DB, optional)

If you'd rather avoid SSPL entirely:

1. Replace `mongoose` with `pg` + `knex` or `prisma`
2. Edit `docker-compose.yml`:
   ```yaml
   db:
     image: postgres:16-alpine
     environment:
       POSTGRES_DB: bandaru
       POSTGRES_PASSWORD: bandaru
   ```
3. Rewrite `server/models/Trade.js` as a SQL schema
4. Update `server/server.js` to use a SQL client

All functionality is preserved — Trade Journal is the only feature that uses the database.

---

## Reporting license issues

If you find a dependency whose license has changed or whose source has been removed, please open an issue at:
https://github.com/bandarusrinivas/bandaru-trade-research/issues

---

*Last updated: 2026-05-14*

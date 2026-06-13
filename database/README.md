# Database — Local Development Setup

This directory contains SQL migrations, seed scripts, and test fixtures for Primis.

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.
- `.env` file copied from `.env.example` at the repo root.

### 1. Start the local database

```bash
# From the repo root:
bash scripts/db-up.sh
```

This starts a Postgres 16 container in the background and waits for it to be ready.

Alternatively, you can start it directly with Docker Compose:

```bash
docker compose up -d db
docker compose exec db pg_isready -U primis -d primis_dev
```

### 2. Apply migrations

> **Available after CU-026.** Migrations are not yet wired up.

```bash
pnpm db:migrate
```

### 3. Seed the database

> **Available after CU-029.** Seed scripts are not yet implemented.

```bash
pnpm db:seed
```

### 4. Connect with psql

```bash
psql postgres://primis:primis@localhost:5432/primis_dev
```

---

## Connection Details (Local Only)

| Field    | Value                                                |
| -------- | ---------------------------------------------------- |
| Host     | `localhost`                                          |
| Port     | `5432` (override with `POSTGRES_PORT` in `.env`)     |
| User     | `primis`                                             |
| Password | `primis`                                             |
| Database | `primis_dev`                                         |
| URL      | `postgres://primis:primis@localhost:5432/primis_dev` |

These are **local development credentials only**. No production credentials are ever stored here
or committed to this repository.

---

## Port Conflicts

If your host already has Postgres running on port 5432, add the following to your `.env` file
to override the host port:

```dotenv
POSTGRES_PORT=5433
```

The `DATABASE_URL` in `.env` must be updated to match if you change the port.

---

## ⚠️ Resetting the Database (DESTRUCTIVE)

The reset script permanently deletes all local data and starts fresh:

```bash
bash scripts/db-reset.sh
```

You will be prompted to confirm before any data is deleted. To skip the prompt (e.g. in scripts):

```bash
bash scripts/db-reset.sh --yes
```

After a reset, re-run migrations and seeds:

```bash
pnpm db:migrate   # restores the schema
pnpm db:seed      # restores seed data
```

**This script only affects local Docker volumes.** It has no effect on production or staging
databases.

---

## Directory Structure

```
database/
├── README.md           — this file
├── migrations/         — sequential SQL migration files (000001_init.sql, 000002_identity.sql, …)
├── seeds/              — TypeScript seed scripts executed by pnpm db:seed
└── fixtures/           — redacted test fixtures (never contains real user data)
    └── README.md       — fixture redaction policy and usage
```

---

## Stopping the Database

```bash
docker compose stop db
```

To stop and remove the container (data is preserved in the volume):

```bash
docker compose down
```

To stop, remove the container, **and delete all data** (same as the reset script):

```bash
docker compose down -v
```

---

## Notes for Future CUs

- **CU-026** adds `pnpm db:migrate`, the Kysely client, and the migration runner.
- **CU-027–CU-031** add all schema tables via numbered migration files.
- **CU-029** adds `pnpm db:seed` to populate `metric_definitions` from `@primis/health-metrics`.
- Integration tests require `TEST_DATABASE_URL` to be set. See `tests/README.md` for details.

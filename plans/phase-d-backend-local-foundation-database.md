# Phase D — Backend Local Foundation and Database

**Plan version:** 1.0
**Created:** 2026-06-12
**Scope:** CU-024 through CU-033
**Optimized for:** Sequential AI coding-agent execution, one commit unit at a time
**Prerequisite reading:** See §3 below before implementing any CU.

---

## 1. Phase D Goal and Non-Goals

### Goal

Stand up a locally runnable API service backed by Docker Postgres, establish the SQL migration
framework and typed Kysely query layer, implement every core schema table from the Data Model
source of truth, add a Cognito-aware auth middleware shell that supports mock auth for local dev,
and expose minimal user-bootstrap/onboarding endpoints — so that Phase E (provider sync) and Phase
F (scoring) have a correct, fully-typed, tested persistence layer to build on.

When Phase D is complete, a Cursor agent or human contributor can:

- Start local Postgres with one Docker command.
- Run `pnpm db:migrate` to apply all migrations idempotently.
- Run `pnpm --filter @primis/api test` and see all passing tests (unit + integration against local DB).
- Start the API server locally (`pnpm --filter @primis/api dev`) with mock auth enabled.
- Hit `GET /health` and receive a structured response.
- Hit `GET /api/v1/me` with a mock auth header and receive a bootstrapped user profile.
- Trust that every table, column, enum, and index in the database matches
  `docs/source-of-truth/primis_data_model_health_metric_schema.md` exactly.

### Non-Goals for Phase D

- No real AWS resource deployment, no CDK stacks, no RDS provisioning.
- No real Cognito user pool or real JWT verification against live AWS.
- No Google Health OAuth flow or token exchange.
- No raw OAuth token storage (secret-reference fields/interfaces only; actual Secrets Manager wiring
  is Phase Z).
- No provider sync execution, normalization workers, or raw payload ingestion.
- No scoring formula implementation, no baselines calculation, no algorithm runs.
- No AI gateway calls, no LLM prompts, no model invocations.
- No new mobile UI screens or design-system components (only compatibility in api-contracts if
  needed).
- No production credentials of any kind.
- No FoodData Central import or full food catalog.
- No HealthKit / Health Connect connector scaffolding (Phase E).
- No silently editing source-of-truth documents; create ADRs for material conflicts.

---

## 2. Current Repo State Summary

### 2.1 What Phase A Created (CU-001–007)

- PNPM monorepo with `apps/`, `services/`, `packages/`, `infrastructure/`, `database/`, `scripts/`,
  `docs/`, `tests/` directories.
- Strict TypeScript baseline (`tsconfig.base.json`, `moduleResolution: bundler`, `strict: true`,
  `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`).
- ESLint (`.eslintrc.cjs`), Prettier (`.prettierrc`), `.editorconfig`.
- Vitest workspace (`vitest.workspace.ts`, auto-discovers `*/vitest.config.ts`).
- GitHub Actions CI gate (details in `.github/`).
- Typed environment contract (`packages/config/src/env.ts`) with Zod validation for both
  `PublicEnv` and `BackendEnv` shapes including `DATABASE_URL`, `DATABASE_SSL`, Cognito
  placeholders, Google Health placeholders, AI key placeholders.
- `.env.example` with `DATABASE_URL=postgres://primis:primis@localhost:5432/primis_dev` already
  documented.
- `CONTRIBUTING.md`, `.ai-agent-instructions.md`, `docs/README.md`, `tests/README.md`,
  `database/fixtures/README.md`.
- `scripts/redact-fixture.ts` (redaction tooling).

### 2.2 What Phase B Created (CU-008–013)

- `packages/core-types/` (`@primis/core-types`): domain enum vocabulary
  - `ProviderCode` (8 canonical codes per ADR-001)
  - `ConnectionStatus`, `SyncJobType`, `SyncJobStatus`
  - `ScoreType`, `ScoreState`, `ScoreConfidence`, `ScoreBand`, `scoreToBand()`
  - `AiIntent` (20 values per ADR-002), `ContextDomain`
  - `MetricCategory`, `ValueType`, `SamplingType`, `AggregationMethod`, `DataQualityLabel`,
    `MissingReason`, `DataSensitivityLevel`
  - `SENSITIVE_FIELD_PATTERNS`, `redactFixture()`
- `packages/health-metrics/` (`@primis/health-metrics`): 69-metric canonical registry
  - `METRIC_DEFINITIONS`: frozen record of all 69 `MetricDefinition` objects
  - `getMetric(code)` accessor, `UnknownMetricCodeError`
  - `CanonicalUnit` union (24 units), `convertUnit()`, unit conversion tables
  - Category arrays: `ACTIVITY_METRIC_CODES` (13), `VITALS_METRIC_CODES` (9),
    `BODY_COMPOSITION_METRIC_CODES` (11), `SLEEP_METRIC_CODES` (12),
    `NUTRITION_METRIC_CODES` (17), `SCORE_METRIC_CODES` (7), `ALL_METRIC_CODES` (69)
- `packages/api-contracts/` (`@primis/api-contracts`): API response/error shapes
  - `ApiSuccessResponse<T>`, `ApiErrorResponse`, `ApiResponse<T>` with Zod schemas
  - 11-code `ApiErrorCode` enum (UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, NOT_FOUND, etc.)
  - `PaginationMeta`, `PaginatedResponse<T>` with helpers
  - `ScoreSnapshotDto`, `ScoreComponentDto`, `ScoreDriverDto` + Zod schemas
  - `ScoreQualityMetadataDto`, `ProviderFreshnessDto`
  - `makeSuccessResponse()`, `makeErrorResponse()`, `makePaginatedResponse()`
- `packages/config/` (`@primis/config`): `loadBackendEnv()`, `loadPublicEnv()` with full Zod
  validation. Does NOT yet have `ALLOW_MOCK_AUTH` — Phase D must add this.
- Fixture redaction tooling functional and tested.

### 2.3 What Phase C Created (CU-014–023)

- `apps/mobile/` (`@primis/mobile`): Full Expo 56 / React Native 0.86 app
  - Expo Router 5-tab navigation (dashboard, sleep, recovery, activity, coach)
  - `src/api/client.ts`, `src/api/endpoints.ts`: typed API client using `@primis/api-contracts`
    shapes; currently mock-mode only
  - `src/mocks/`: mock data for all major screens using `@primis/api-contracts` DTOs
  - `src/state/`: Zustand stores for settings and widget preferences
  - `src/cache/localDashboardCache.ts`: SQLite-backed local dashboard cache
- `packages/design-system/` (`@primis/design-system`): tokens, components, charts, motion
- `apps/mobile/src/api/endpoints.ts` defines the route shapes Phase D API must conform to.

### 2.4 Services Currently Empty

`services/api/`, `services/ai/`, and `services/workers/` each contain only a `.gitkeep` file.
Phase D creates all initial content in `services/api/`.

### 2.5 Database Directories Currently Empty

`database/migrations/`, `database/seeds/`, and `database/fixtures/provider/` (subdirectory)
contain only `.gitkeep` files. Phase D populates `migrations/` and `seeds/`.

### 2.6 ADRs That Affect Phase D

| ADR      | File                                                    | Decision                                                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-0001 | `docs/decisions/ADR-0001-vitest-workspace-file-name.md` | Use `vitest.workspace.ts`, not `vitest.config.ts`, for the root workspace config. Per-package configs still use `vitest.config.ts` with `defineConfig`.                                                                                             |
| ADR-001  | `docs/decisions/ADR-001-provider-code-naming.md`        | Canonical provider codes: `google_health`, `healthkit`, `health_connect`, `hume_via_healthkit`, `hume_direct_unverified`, `fooddata_central`, `manual`, `primis_internal`. All DB columns, seeds, and repository code MUST use these exact strings. |
| ADR-002  | `docs/decisions/ADR-002-ai-intent-count-discrepancy.md` | `AiIntent` has 20 values (spec §7.2), not 19 as stated in some plan annotations. All Phase D code referencing AI intent must use the spec/enum values.                                                                                              |

### 2.7 Conventions Established in A/B/C

- **Test file naming:** `*.test.ts` (never `*.spec.ts`); co-located in `src/` or under `test/`.
- **Commit message format:** `<area>: <short imperative summary> (<CU-ID>)`
- **Branch naming:** `cu/<cu-id-lowercase>-<short-name>`
- **Package type:** `"type": "module"` with `"exports": { ".": "./src/index.ts" }`
- **No build step for workspace consumption:** direct `.ts` exports, `tsx` for scripts
- **Verification order:** `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check`
- **Sensitive field patterns:** `redactFixture()` from `@primis/core-types` (6 categories)
- **No real secrets in any committed file**; use `PLACEHOLDER` strings

### 2.8 Known Repo Drift and Mismatches Executing Agents Must Account For

1. **Kysely vs TAD §21.2 conflict:** `primis_technical_architecture_document.md §21.2` recommends
   Drizzle or Prisma. `primis_full_implementation_spec_commit_plan.md §4.2` mandates Kysely + SQL
   migrations. Per source-priority (spec > TAD), **Kysely wins**. CU-026 executing agent MUST
   create `docs/decisions/ADR-003-query-layer-and-migrations.md` documenting this before writing
   any migration or query code.

2. **`ALLOW_MOCK_AUTH` missing from `@primis/config`:** The env contract in
   `packages/config/src/env.ts` does not yet have `ALLOW_MOCK_AUTH`. CU-032 must add this field
   to the `BackendEnv` Zod schema and export it. Do not break existing tests in `@primis/config`.

3. **`pnpm db:migrate` and `pnpm db:seed` scripts not yet in root `package.json`:** CU-026 must
   add these root-level scripts.

4. **`services/api` package name must be `@primis/api`:** This matches the spec's verification
   commands (`pnpm --filter @primis/api test`). The `services/api/package.json` must use this
   exact name.

5. **`tests/README.md` states integration tests deferred to Phase D:** Each service with DB
   integration tests needs a `tests/integration/` subdirectory and must document how to run them
   when `TEST_DATABASE_URL` is set. CI skips integration tests unless this env var is present.

6. **`database/migrations/` directory exists but is empty (`.gitkeep`):** Agents should delete
   `.gitkeep` when adding the first SQL file.

7. **`apps/mobile/src/api/endpoints.ts`** defines API route shapes that Phase D endpoints must
   satisfy. The `/api/v1/me` and onboarding endpoint shapes defined in CU-033 must be compatible
   with the mobile client's expected DTOs.

---

## 3. Required Source Docs and Sections

Before implementing any CU in Phase D, read these documents in order:

| Priority | Document                                                                 | Sections Required for Phase D                                                                                                    |
| -------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `docs/source-of-truth/primis_full_implementation_spec_commit_plan.md`    | §1–§5, Phase D (CU-024–CU-033)                                                                                                   |
| 3        | `docs/source-of-truth/primis_technical_architecture_document.md`         | §0, §6.2–6.3, §7, §8, §9, §11, §12, §21, §22                                                                                     |
| 4        | `docs/source-of-truth/primis_data_model_health_metric_schema.md`         | §0, §5 (global conventions), §7 (identity), §8 (provider), §9–10 (metrics), §11–15 (domain tables), §16–19 (scores/AI/dashboard) |
| 8        | `docs/source-of-truth/primis_product_requirements_document.md`           | Auth/account requirements; onboarding/personalization requirements; Google Health authorization separation                       |
| 6        | `docs/source-of-truth/primis_ai_context_engine_spec.md`                  | AI storage/context safety constraints only (§9, §13)                                                                             |
| 5        | `docs/source-of-truth/primis_scoring_algorithms_spec.md`                 | Score snapshot/data-quality concepts only; do NOT implement formulas                                                             |
| 7        | `docs/source-of-truth/primis_ui_ux_design_system_spec.md`                | Dashboard/widget/settings schema references only                                                                                 |
| 9        | `docs/source-of-truth/primis_google_health_api_feature_parity_matrix.md` | Provider/metric availability concepts only                                                                                       |

Also read:

- `plans/phase-a-repo-tooling-foundation.md` §2 (agent boundary rules)
- `plans/phase-b-shared-contracts-health-model-foundations.md` §2, §4 (packages and their exports)
- `plans/phase-c-mobile-shell-design-system.md` §4 CU-022 (API client shape the mobile app expects)
- `docs/decisions/ADR-001-provider-code-naming.md` (canonical provider codes for all DB seeds)
- `.ai-agent-instructions.md` (agent boundary rules)
- `CONTRIBUTING.md` (commit format, ADR workflow)

---

## 4. CU Dependency Graph

```
CU-024 (API skeleton)
  └─► independent; start first

CU-025 (Docker Postgres)
  └─► independent; can run in parallel with CU-024 conceptually,
      but execute sequentially: CU-025 after CU-024

CU-026 (Migration framework + Kysely)
  └─► requires CU-024 (api service structure exists)
  └─► requires CU-025 (local DB available)

CU-027 (Identity / preferences / consent tables)
  └─► requires CU-026 (migration framework in place)

CU-028 (Provider connection + sync tables)
  └─► requires CU-027 (users table exists for FK)

CU-029 (Metric registry + observation tables)
  └─► requires CU-028 (provider_connections exists for FK)

CU-030 (Domain tables: sleep, activity, body, manual, nutrition)
  └─► requires CU-029 (metric_definitions exists for FK)

CU-031 (Score, insight, AI, dashboard tables)
  └─► requires CU-030 (full domain layer exists for FK)

CU-032 (Auth middleware shell)
  └─► requires CU-024 (Hono app exists for middleware injection)
  └─► requires CU-027 (user lookup by cognito_sub)
  └─► requires ALLOW_MOCK_AUTH added to @primis/config

CU-033 (User bootstrap + onboarding endpoints)
  └─► requires CU-032 (auth middleware attaches user context)
  └─► requires CU-027 (repositories for user / preferences / consent)
  └─► adds new contracts to packages/api-contracts
```

**Execution order:** CU-024 → CU-025 → CU-026 → CU-027 → CU-028 → CU-029 → CU-030 → CU-031
→ CU-032 → CU-033

Note: CU-032 can technically begin after CU-024 + CU-027 complete. For simplicity, this plan
treats the schema CUs (027–031) as a sequential block before the auth CUs (032–033).

---

## 5. CU-024 — Add Backend API Service Skeleton

### Goal

Create the `services/api/` package (`@primis/api`) as a locally runnable Hono-based API service
that uses `@primis/api-contracts` for all response/error shapes, exposes a `GET /health` endpoint,
and includes a Lambda handler wrapper alongside a local dev server entrypoint.

### Relevant Docs / Sections

- Spec §4.2 (Hono, Lambda router, Zod, Kysely stack decisions)
- TAD §6.2 (backend stack), §12.1–12.5 (API style, versioning, response design)
- TAD §29.1–29.2 (Lambda/API Gateway topology)
- `plans/phase-b-shared-contracts-health-model-foundations.md` §4 CU-009 (api-contracts package)

### Existing Repo Files / Packages to Build On

- `packages/api-contracts/src/` — use `makeSuccessResponse()`, `makeErrorResponse()`,
  `ApiErrorCode` for all responses
- `packages/config/src/env.ts` — use `loadBackendEnv()` for all env access
- `packages/core-types/src/` — import types as needed
- `tsconfig.base.json` — extend in `services/api/tsconfig.json`
- `.eslintrc.cjs`, `.prettierrc` — inherited at workspace root
- `vitest.workspace.ts` — auto-discovers `services/api/vitest.config.ts`

### Files Created or Edited

```
services/api/package.json             ← new; name: @primis/api
services/api/tsconfig.json            ← new; extends ../../tsconfig.base.json
services/api/vitest.config.ts         ← new; defineConfig for node env
services/api/src/app.ts               ← new; Hono app factory + route registration
services/api/src/handler.ts           ← new; Lambda handler + local dev server switch
services/api/src/routes/health.ts     ← new; GET /health route
services/api/src/middleware/errorHandler.ts   ← new; maps errors → ApiErrorResponse
services/api/src/middleware/requestId.ts      ← new; attaches x-request-id header
services/api/test/health.test.ts      ← new; unit test for /health endpoint
```

### In-Scope Work

- `package.json` with name `@primis/api`, `"type": "module"`, deps on `hono`,
  `@hono/node-server`, `@primis/api-contracts`, `@primis/config`, `@primis/core-types`,
  dev deps `vitest`, plus scripts: `test`, `typecheck`, `dev` (local server), `build`.
- `tsconfig.json` extending base, including `src/**/*` and `test/**/*`.
- `vitest.config.ts` using `defineConfig({ test: { environment: 'node' } })` — matching
  existing package patterns.
- `src/app.ts`: Hono app factory function (`createApp()`) that registers middleware and routes.
  All routes mount under `/api/v1/`. The `/health` endpoint lives at the root path `/health`
  (not versioned).
- `src/handler.ts`: exports `handler` for Lambda (using `handle` from `hono/lambda`) and a
  local dev entrypoint using `@hono/node-server`; detects `APP_ENV === 'local'` to start local
  server, otherwise exports Lambda handler.
- `src/routes/health.ts`: returns `{ status: 'ok', version, env, requestId }` using
  `makeSuccessResponse()`.
- `src/middleware/errorHandler.ts`: catches unhandled errors, maps known types to
  `ApiErrorCode`, returns `makeErrorResponse()`.
- `src/middleware/requestId.ts`: generates or passes through `x-request-id`, attaches to
  `c.set('requestId', id)`.
- Unit test for `/health`: verifies shape, status 200, uses `makeSuccessResponse()` structure.

### Out-of-Scope Work

- Database connection (CU-026).
- Auth middleware (CU-032).
- Any real endpoint beyond `/health` and future `/api/v1/me` (CU-033).
- Real Lambda deployment or API Gateway config.
- OpenAPI/Swagger spec generation.
- Rate limiting, CORS (placeholder comments are fine).

### Acceptance Criteria

1. `pnpm --filter @primis/api typecheck` exits 0.
2. `pnpm --filter @primis/api test` exits 0 with at least one passing test for `/health`.
3. `GET /health` returns `{ data: { status: "ok", version: string, env: string, requestId: string } }`
   wrapped in `ApiSuccessResponse` shape.
4. Any unhandled error returns a properly shaped `ApiErrorResponse` (not a raw stack trace).
5. `services/api/package.json` has `"name": "@primis/api"` and `"type": "module"`.
6. No secrets or real credentials in any committed file.
7. `pnpm lint` passes (root-level ESLint covers `services/`).

### Verification Commands

```bash
pnpm install
pnpm --filter @primis/api typecheck
pnpm --filter @primis/api test
pnpm lint
pnpm format:check
```

### Likely Pitfalls

- **Hono + ESM + Vitest**: Hono uses ESM; ensure `vitest.config.ts` does not need a custom
  transform. The existing packages work with `"type": "module"` and direct `.ts` exports.
- **Lambda handler vs local server**: Keep these in a single `handler.ts` with a conditional
  entrypoint rather than two separate files, to avoid divergence.
- **`moduleResolution: bundler`** in `tsconfig.base.json`: Hono and `@hono/node-server` must be
  importable under this setting. Verify at typecheck time.
- **Do not add `@hono/aws-lambda`** yet — the spec uses `hono/lambda` which is included in the
  core `hono` package.

### Questions Before Implementation

None. This CU is self-contained and the technology choices are locked by spec §4.2.

### Commit Message

```
api: add Lambda API service skeleton (CU-024)
```

---

## 6. CU-025 — Add Local Docker Postgres Setup

### Goal

Provide a reliable one-command local Postgres database for migrations and tests via
`docker compose up db`, with a clearly destructive reset script and updated `.env.example`.

### Relevant Docs / Sections

- Spec §4.2 (local Postgres for dev)
- TAD §8.1 (local environment strategy)
- Data Model §5.1–5.2 (UUID and timestamp conventions — not implemented yet, but informs DB
  settings like timezone)
- `.env.example` (already has `DATABASE_URL=postgres://primis:primis@localhost:5432/primis_dev`)

### Existing Repo Files / Packages to Build On

- `.env.example` — already documents `DATABASE_URL`, `DATABASE_SSL=false`
- `database/` directory structure — `migrations/`, `seeds/`, `fixtures/` subdirs exist
- `scripts/` directory — already has `redact-fixture.ts`; add shell scripts here

### Files Created or Edited

```
docker-compose.yml            ← new; db service only
database/README.md            ← new; explains local DB setup
scripts/db-up.sh              ← new; convenience wrapper: docker compose up -d db
scripts/db-reset.sh           ← new; DESTRUCTIVE: drops and recreates DB
.env.example                  ← edit if needed (DATABASE_URL already correct)
```

### In-Scope Work

- `docker-compose.yml`: single `db` service using `postgres:16-alpine`, port `5432:5432`,
  env vars `POSTGRES_USER=primis`, `POSTGRES_PASSWORD=primis`, `POSTGRES_DB=primis_dev`,
  named volume `primis_db_data`, health check.
- `scripts/db-up.sh`: `docker compose up -d db && docker compose exec db pg_isready -U primis`
- `scripts/db-reset.sh`: clearly marked DESTRUCTIVE header, drops and recreates the DB volume,
  re-creates the DB, and runs `pnpm db:migrate` (once CU-026 adds that script). For now,
  just drops/recreates the volume.
- `database/README.md`: quick-start steps, reset instructions, warning that reset is destructive,
  note that this is local dev only.
- Verify `.env.example` `DATABASE_URL` is `postgres://primis:primis@localhost:5432/primis_dev`
  (already set — no change likely needed).

### Out-of-Scope Work

- Real RDS, staging, or production database setup.
- Migration execution (CU-026).
- Connection pooling (`pgBouncer`, `pg-pool` config) — deferred.
- Test database setup (integration test DB URL handled in CU-026).
- Docker Compose service for the API itself (local API is run via `pnpm --filter @primis/api dev`).

### Acceptance Criteria

1. `docker compose config` exits 0 and validates the compose file.
2. `docker compose up -d db` starts Postgres successfully.
3. `docker compose exec db pg_isready -U primis` returns `accepting connections`.
4. `scripts/db-reset.sh` header contains the word "DESTRUCTIVE" prominently.
5. `database/README.md` exists with setup instructions.
6. No production credentials anywhere in committed files.

### Verification Commands

```bash
docker compose config
docker compose up -d db
docker compose exec db pg_isready -U primis
```

### Likely Pitfalls

- **Port conflicts**: If the host already has Postgres on 5432, the compose file should document
  the override: `POSTGRES_PORT=5432` in `.env.example` and map it as `${POSTGRES_PORT:-5432}:5432`.
- **Volume naming**: Use a project-specific volume name (`primis_db_data`) to avoid collisions.
- **Shell script permissions**: Scripts must be executable (`chmod +x`); add a note in
  `database/README.md`.

### Questions Before Implementation

None.

### Commit Message

```
db: add local Postgres development setup (CU-025)
```

---

## 7. CU-026 — Add SQL Migration Framework and Kysely DB Layer

### Goal

Establish the SQL-first migration runner, the Kysely client, and the Kysely `Database` interface
skeleton, so that all subsequent schema CUs can add migrations and queries on a stable foundation.

**Required ADR before code:** The executing agent MUST create
`docs/decisions/ADR-003-query-layer-and-migrations.md` before writing any query or migration code.
This ADR documents two coupled decisions: (1) Kysely as the query layer per spec §4.2,
superseding the TAD §21.2 recommendation for Drizzle/Prisma, and (2) a custom
`scripts/db-migrate.ts` raw SQL runner as the canonical migration mechanism.

### Relevant Docs / Sections

- Spec §4.2 (Kysely + SQL migrations, rationale)
- TAD §21.2 (migration tooling — conflict, see ADR-003)
- TAD §21.3–21.4 (indexing strategy, time handling)
- Data Model §5.1–5.2 (ID and timestamp conventions)
- `docs/decisions/ADR-001-provider-code-naming.md` (provider codes for future seeds)

### Existing Repo Files / Packages to Build On

- `packages/config/src/env.ts` — `loadBackendEnv()` provides `DATABASE_URL`, `DATABASE_SSL`
- `services/api/src/` — from CU-024; DB client lives here
- `database/migrations/` — empty; first SQL file goes here; remove `.gitkeep`
- `database/seeds/` — empty; seed scripts go here later
- Root `package.json` — add `db:migrate` and `db:seed` scripts

### Files Created or Edited

```
docs/decisions/ADR-003-query-layer-and-migrations.md    ← new ADR (create first)
database/migrations/000001_init.sql                     ← new; pgcrypto extension + migration history
services/api/src/db/client.ts                          ← new; Kysely instance factory
services/api/src/db/types.ts                           ← new; Database interface (empty tables map)
services/api/src/db/migrate.ts                         ← new; migration runner (programmatic)
scripts/db-migrate.ts                                   ← new; CLI entrypoint for pnpm db:migrate
scripts/db-seed.ts                                     ← new; CLI entrypoint for pnpm db:seed (stub)
package.json                                           ← edit; add db:migrate, db:seed, db:reset scripts
services/api/test/db/client.test.ts                    ← new; unit test for client factory (mock pg)
```

### In-Scope Work

**ADR-003** (create first — covers two coupled decisions):

Decision 1 — Query layer:

- Context: TAD §21.2 recommends Drizzle/Prisma; spec §4.2 mandates Kysely + SQL migrations.
- Decision: Kysely wins per source-priority (spec priority 1 > TAD priority 3).
- Consequences: All queries use Kysely's type-safe builder; no ORM schema generation.

Decision 2 — Migration runner:

- Context: Spec §4.2 says "SQL-first migrations." No specific runner library is mandated.
- Decision: Custom `scripts/db-migrate.ts` that reads `.sql` files from `database/migrations/`
  lexicographically and applies pending ones via `pg` directly. No third-party migration
  library required. This keeps the migration mechanism transparent and dependency-free.
- Consequences: Migration runner logic lives in `src/db/migrate.ts` (library function) and
  `scripts/db-migrate.ts` (CLI wrapper). If a future agent finds a strong reason to add a
  library (e.g., `node-pg-migrate`), they must update this ADR rather than silently introducing
  the dependency.

**`database/migrations/000001_init.sql`:**

```sql
create extension if not exists "pgcrypto";

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
```

**`services/api/src/db/client.ts`:** Kysely client factory using `PostgresDialect` from `kysely`
and `pg.Pool`. Reads `DATABASE_URL` and `DATABASE_SSL` via `loadBackendEnv()`. Exports a
singleton `db` instance and a `createDb(config?)` factory for testing. Never logs the
connection string.

**`services/api/src/db/types.ts`:** Exports `Database` interface — initially empty `{}` table map
that grows with each schema CU. CU-027+ add table types here.

**`services/api/src/db/migrate.ts`:** Programmatic migration runner that:

1. Lists `.sql` files in `database/migrations/` in lexicographic order.
2. Checks `schema_migrations` for already-applied versions.
3. Runs pending migrations in a transaction.
4. Records version in `schema_migrations`.
5. Returns a summary of applied migrations.

**`scripts/db-migrate.ts`:** CLI wrapper invoking `migrate.ts` against `DATABASE_URL` from env.
Logs applied migrations. Exits 0 on success, 1 on error.

**`scripts/db-seed.ts`:** Stub — logs "No seeds yet" and exits 0. Populated in CU-029.

**Root `package.json` additions:**

```json
"db:migrate": "tsx scripts/db-migrate.ts",
"db:seed": "tsx scripts/db-seed.ts",
"db:reset": "bash scripts/db-reset.sh"
```

**Integration test:** `services/api/tests/integration/` directory with a `README.md` explaining
that tests run only when `TEST_DATABASE_URL` is set. Add a basic smoke test that runs migrations
against the test DB and confirms `schema_migrations` has at least one row. Skip if no
`TEST_DATABASE_URL`.

**Unit test:** Mock the `pg.Pool` in `services/api/test/db/client.test.ts` and verify the client
factory does not log the connection string.

### Out-of-Scope Work

- Actual table creation (CU-027+).
- Kysely type generation via `kysely-codegen` — types are maintained manually in `types.ts`.
- Connection pooling with `pg-pool` configuration beyond defaults.
- Database backup or schema dump tooling.

### Acceptance Criteria

1. `docs/decisions/ADR-003-query-layer-and-migrations.md` exists before any other file in this CU is written.
2. `pnpm db:migrate` runs against local DB, applies `000001_init.sql`, exits 0.
3. Running `pnpm db:migrate` a second time is idempotent (no error, no duplicate rows).
4. `select version from schema_migrations` returns at least `000001_init`.
5. `services/api/src/db/client.ts` does not log `DATABASE_URL` or any credential.
6. `pnpm --filter @primis/api typecheck` exits 0.
7. `pnpm --filter @primis/api test` exits 0 (unit tests only; integration tests skipped in CI
   unless `TEST_DATABASE_URL` is set).
8. `pnpm lint` and `pnpm format:check` pass.

### Verification Commands

```bash
pnpm install
pnpm db:migrate
pnpm db:migrate       # idempotency check
pnpm --filter @primis/api typecheck
pnpm --filter @primis/api test
pnpm lint
pnpm format:check
# Manually: psql $DATABASE_URL -c "select * from schema_migrations;"
```

### Likely Pitfalls

- **ESM + `pg`**: `pg` is CommonJS. Use `import pg from 'pg'` with `esModuleInterop: true`
  (already in base tsconfig). Kysely's `PostgresDialect` accepts a `pg.Pool` instance.
- **Migration file sort order**: `000001`, `000002`, etc. must sort correctly lexicographically.
  Zero-pad to 6 digits (or 6 minimum) to be safe.
- **Transaction per migration**: Wrap each migration file's SQL in a `BEGIN`/`COMMIT` block in
  the runner so a failed migration leaves the DB in a clean state.
- **`TEST_DATABASE_URL`**: Integration tests must check `process.env.TEST_DATABASE_URL` and call
  `describe.skipIf(!testDbUrl)(...)`. Do NOT use `DATABASE_URL` for tests or you'll corrupt the
  dev DB.

### Questions Before Implementation

The executing agent must decide: which `pg` dialect package to use with Kysely
(`pg` or `postgres.js`). **Recommendation: use `pg` (the classic `node-postgres`)**. It is the
most tested with Kysely and aligns with the existing `.env.example` URL format. If the agent
chooses otherwise, update ADR-003 rather than silently diverging.

### Commit Message

```
db: add SQL migrations and typed query layer (CU-026)
```

---

## 8. CU-027 — Implement Identity, Preferences, and Consent Tables

### Goal

Add the first user-owned schema tables matching Data Model §7 exactly: `users`,
`auth_identities`, `user_goals`, `coach_preferences`, `nutrition_philosophy_preferences`,
`consent_records`, and `data_retention_preferences`, plus the corresponding Kysely type additions
and repository layer.

### Relevant Docs / Sections

- Data Model §5.1–5.4 (schema conventions, ID types, timestamps, sensitivity)
- Data Model §7.1–7.7 (all identity/preferences/consent tables — read in full)
- TAD §9 (auth/identity architecture, ARCH-AUTH-001 through ARCH-AUTH-005)
- PRD auth/account requirements; onboarding/personalization section
- ADR-001 (provider codes — not directly used here but establishes naming discipline)

### Existing Repo Files / Packages to Build On

- `services/api/src/db/types.ts` — add table interfaces here
- `services/api/src/db/client.ts` — singleton `db` for repositories
- `database/migrations/000001_init.sql` — migration history in place
- `packages/config/src/env.ts` — `loadBackendEnv()` for DB URL
- `packages/core-types/src/` — `DataSensitivityLevel` enum for documentation/typing

### Files Created or Edited

```
database/migrations/000002_identity.sql                    ← new
services/api/src/db/types.ts                               ← edit; add 7 table interfaces
services/api/src/repositories/userRepository.ts            ← new
services/api/src/repositories/preferencesRepository.ts     ← new
services/api/src/repositories/consentRepository.ts         ← new
services/api/test/repositories/userRepository.test.ts      ← new (unit; mock db)
services/api/tests/integration/identity.test.ts            ← new (integration; skipped without TEST_DB)
```

### In-Scope Work

**`database/migrations/000002_identity.sql`:** Implement all 7 tables from Data Model §7 with
the exact column names, types, defaults, and constraints from the spec. Critical fidelity points:

- `users.id` is UUID primary key (use `gen_random_uuid()` from pgcrypto as default).
- `users.cognito_sub` is `text unique not null` — NOT the primary health-data key (ARCH-AUTH-001).
- `users.status` check constraint: `active`, `suspended`, `deletion_requested`, `deleted`.
- `auth_identities`: provider values should NOT include Google Health provider codes — only
  `email_password`, `google`, `apple`, `facebook` (TAD §9.2 — app auth != provider auth).
- `user_goals.goal_code` — seed values match PRD onboarding goals:
  `athletic_performance`, `sleep`, `body_composition`, `fat_loss`, `muscle_gain`, `longevity`,
  `general_health`.
- `coach_preferences.coach_style` — initial allowed values from Data Model §7.4:
  `analyst_coach`, `strict`, `encouraging`, `performance_coach`, `calm`, `concise`,
  `explanatory`, `unhinged_lite`. Add as CHECK constraint or document as application-level enum.
- All `updated_at` columns should have a trigger or be updated explicitly in repositories.
- All tables with `deleted_at` support soft deletion.
- Include the indexes implied by §7: `users(cognito_sub)`, `auth_identities(provider, provider_subject)`.

**Kysely `Database` interface updates in `types.ts`:** Add typed interfaces for:
`UsersTable`, `AuthIdentitiesTable`, `UserGoalsTable`, `CoachPreferencesTable`,
`NutritionPhilosophyPreferencesTable`, `ConsentRecordsTable`, `DataRetentionPreferencesTable`.

**Repositories:**

- `userRepository.ts`: `findByCognitoSub(sub)`, `create(data)`, `updateStatus(id, status)`,
  `softDelete(id)`.
- `preferencesRepository.ts`: `getCoachPrefs(userId)`, `upsertCoachPrefs(userId, data)`,
  `getNutritionPhilosophy(userId)`, `upsertNutritionPhilosophy(userId, data)`,
  `getGoals(userId)`, `upsertGoals(userId, goals[])`, `getRetentionPrefs(userId)`.
- `consentRepository.ts`: `recordConsent(userId, type, version, granted)`,
  `getConsentHistory(userId)`.

**Unit tests:** Mock the Kysely `db` instance with `vi.fn()` to test repository logic without
hitting a real DB. Test `findByCognitoSub` returns `null` for unknown users, `create` generates
correct insert, etc.

**Integration tests:** Create/read/update/delete for `users`, `coach_preferences`,
`consent_records`. Skipped if `TEST_DATABASE_URL` is not set.

### Out-of-Scope Work

- Provider connection tables (CU-028).
- Actual Cognito JWT validation (CU-032).
- Any user-facing endpoint (CU-033).
- Google Sign-In social connection handling.

### Acceptance Criteria

1. `pnpm db:migrate` applies `000002_identity.sql` successfully and idempotently.
2. All 7 tables exist in the DB with correct columns and constraints.
3. `users.id` does NOT equal `users.cognito_sub` in structure (separate internal UUID key).
4. `auth_identities.provider` values do NOT include `google_health` or any provider sync code.
5. `pnpm --filter @primis/api typecheck` exits 0.
6. `pnpm --filter @primis/api test` exits 0 (unit tests pass).
7. Integration tests pass when `TEST_DATABASE_URL` is set.
8. `pnpm lint` and `pnpm format:check` pass.

### Verification Commands

```bash
pnpm db:migrate
pnpm --filter @primis/api typecheck
pnpm --filter @primis/api test
# With TEST_DATABASE_URL set:
TEST_DATABASE_URL=$DATABASE_URL pnpm --filter @primis/api test
pnpm lint
```

### Likely Pitfalls

- **App auth vs provider auth confusion**: `auth_identities.provider` is for Cognito-level
  sign-in methods only. Never put `google_health` here — that belongs in `provider_connections`
  (CU-028).
- **`exactOptionalPropertyTypes: true`** in tsconfig: Kysely repository types must not use
  `field?: T` where `T` includes `undefined`; use `field?: T | null` or explicit `Insertable`
  Kysely helpers.
- **Trigger for `updated_at`**: Either create a Postgres function/trigger in the migration or
  update `updated_at` explicitly in every repository write. Choose one approach and document it.

### Questions Before Implementation

None.

### Commit Message

```
db: add identity preferences and consent schema (CU-027)
```

---

## 9. CU-028 — Implement Provider Connection and Sync Tables

### Goal

Add provider connection metadata, data availability, metric mapping, sync jobs, sync cursors, and
raw payload metadata tables per Data Model §8, with strict token-reference-only storage and
repository tests.

### Relevant Docs / Sections

- Data Model §8.1–8.7 (all provider tables — read in full)
- TAD §10 (provider integration boundaries)
- TAD §22.2 (token security — NEVER log tokens, NEVER store raw tokens in plaintext)
- ADR-001 (`docs/decisions/ADR-001-provider-code-naming.md`) — canonical provider code strings
- `packages/core-types/src/provider.ts` — `ProviderCode`, `ConnectionStatus`, `SyncJobStatus`,
  `SyncJobType`; use these in Kysely types

### Existing Repo Files / Packages to Build On

- `database/migrations/000002_identity.sql` — `users` table exists (FK target)
- `services/api/src/db/types.ts` — add provider table interfaces
- `services/api/src/repositories/` — add provider and sync repos alongside existing ones
- `packages/core-types/src/provider.ts` — reuse enum string values in CHECK constraints

### Files Created or Edited

```
database/migrations/000003_provider_sync.sql               ← new
services/api/src/db/types.ts                               ← edit; add 6 provider table interfaces
services/api/src/repositories/providerRepository.ts        ← new
services/api/src/repositories/syncRepository.ts            ← new
services/api/test/repositories/providerRepository.test.ts  ← new (unit)
services/api/tests/integration/provider_sync.test.ts       ← new (integration; skipIf no TEST_DB)
```

### In-Scope Work

**`database/migrations/000003_provider_sync.sql`:** Implement 6 tables from Data Model §8:

1. `provider_connections` (§8.2): CRITICAL — `access_token_secret_ref` and
   `refresh_token_secret_ref` are `text null` (secret reference strings), NOT actual token
   values. Add a comment in the SQL file: `-- NEVER store raw tokens; use Secrets Manager refs`.
2. `provider_data_availability` (§8.3): includes `status` CHECK with values from spec.
3. `provider_metric_mappings` (§8.4): `verification_status` CHECK values.
4. `provider_sync_jobs` (§8.5): `job_type` and `status` CHECK constraints per spec.
5. `provider_sync_cursors` (§8.6): `unique(provider_connection_id, provider_data_type)`.
6. `raw_provider_payloads` (§8.7): tracks S3 metadata only — `s3_bucket`, `s3_key`. No actual
   payload content in the DB.

Seed `provider_metric_mappings` with rows for `google_health` provider codes that are
`documented` in the parity matrix. Use `verification_status = 'unverified'` as default per spec;
only mark `verified` after Phase AA live validation. Do NOT seed mappings for metrics marked
`provider_unverified` in the parity matrix.

**Kysely types:** Add `ProviderConnectionsTable`, `ProviderDataAvailabilityTable`,
`ProviderMetricMappingsTable`, `ProviderSyncJobsTable`, `ProviderSyncCursorsTable`,
`RawProviderPayloadsTable` to `Database` interface.

**Repositories:**

- `providerRepository.ts`: `createConnection(data)`, `findConnection(userId, providerCode)`,
  `updateConnectionStatus(id, status)`, `upsertDataAvailability(data)`.
- `syncRepository.ts`: `createSyncJob(data)`, `updateSyncJob(id, updates)`,
  `getLatestSyncJob(connectionId)`, `upsertSyncCursor(connectionId, dataType, cursor)`,
  `recordRawPayloadRef(data)`.

**Unit tests:** Test that repository methods do NOT accept raw token strings (type-safe only via
Kysely — document this in test). Test sync job lifecycle transitions.

### Out-of-Scope Work

- Actual OAuth token exchange or refresh (Phase E / Phase Z).
- Actual sync execution or worker implementation.
- S3 bucket creation or raw payload upload.
- HealthKit / Health Connect connection rows (Phase E).

### Acceptance Criteria

1. `pnpm db:migrate` applies `000003_provider_sync.sql` successfully and idempotently.
2. `provider_connections.access_token_secret_ref` is a text field (not `bytea`, not encrypted
   column) containing only a reference path/ARN string format — verified by SQL comment + test
   documentation.
3. No test, seed, or migration file logs a real token value.
4. ADR-001 provider codes match all CHECK constraints in the migration.
5. `pnpm --filter @primis/api typecheck` exits 0.
6. `pnpm --filter @primis/api test` exits 0.
7. `pnpm lint` passes.

### Verification Commands

```bash
pnpm db:migrate
pnpm --filter @primis/api typecheck
pnpm --filter @primis/api test
pnpm lint
```

### Likely Pitfalls

- **Secret reference format**: Document that `access_token_secret_ref` will be a Secrets Manager
  ARN like `arn:aws:secretsmanager:us-east-1:123:secret:primis/prod/user/XXX/google_health_token`.
  In local dev, this column is `null` (no real AWS).
- **Provider code drift**: All CHECK constraints must use the exact 8 canonical codes from ADR-001.
  Do not add `apple_healthkit` — use `healthkit`.

### Questions Before Implementation

None blocking. Executor may decide whether to seed `provider_metric_mappings` in this CU or defer
to CU-029. Recommendation: seed a minimal set in this CU (10–15 rows for documented Google Health
metrics) so CU-029 has FK targets.

### Commit Message

```
db: add provider connection and sync schema (CU-028)
```

---

## 10. CU-029 — Implement Metric Registry and Observation Tables

### Goal

Add `metric_definitions`, `metric_observations`, and `metric_timeseries_samples` tables per Data
Model §9–10, seed `metric_definitions` from `packages/health-metrics` (not a second namespace),
and provide a metric repository.

### Relevant Docs / Sections

- Data Model §9.1–10.3 (metric registry and observation tables — read in full)
- Data Model §9.2 (required canonical metric codes — do NOT rename any code)
- `packages/health-metrics/src/registry.ts` — `METRIC_DEFINITIONS` (69 metrics, all metadata)
- `packages/health-metrics/src/categories.ts` — category arrays (use for seeding order)
- `packages/core-types/src/metrics.ts` — `MetricCategory`, `ValueType`, `SamplingType`,
  `AggregationMethod`, `DataQualityLabel`

### Existing Repo Files / Packages to Build On

- `database/migrations/000003_provider_sync.sql` — `provider_connections` for FK in observations
- `services/api/src/db/types.ts` — add 3 metric table interfaces
- `database/seeds/` — empty directory; create seed script here

### Files Created or Edited

```
database/migrations/000004_metrics.sql                     ← new
database/seeds/seed_metric_definitions.ts                  ← new; derives from @primis/health-metrics
services/api/src/db/types.ts                               ← edit; add 3 metric table interfaces
services/api/src/repositories/metricRepository.ts          ← new
scripts/db-seed.ts                                         ← edit; replace stub, invoke seed script
services/api/test/repositories/metricRepository.test.ts    ← new (unit)
services/api/tests/integration/metrics.test.ts             ← new (integration; skipIf)
```

### In-Scope Work

**`database/migrations/000004_metrics.sql`:** Implement from Data Model §9–10:

1. `metric_definitions` (§9.1): `metric_code text primary key`, all columns from spec.
2. `metric_observations` (§10.2): full schema including `unique(user_id, metric_code,
source_provider, source_record_id)` and the three recommended indexes.
3. `metric_timeseries_samples` (§10.3): optional high-volume table.
4. `daily_metric_summaries` (§10.4): precomputed daily summaries.
5. `rolling_metric_baselines` (§10.5): personal baselines.

**`database/seeds/seed_metric_definitions.ts`:** Read from `@primis/health-metrics`:

```typescript
import { METRIC_DEFINITIONS } from '@primis/health-metrics';
// Use db.insertInto('metric_definitions').values(Object.values(METRIC_DEFINITIONS))
// .onConflict(oc => oc.column('metric_code').doUpdateSet(...))
// to enable idempotent re-seeding.
```

This is the authoritative metric seeding source. Do NOT hardcode metric metadata in SQL seed
files — derive from the TypeScript registry to keep them in sync.

**`scripts/db-seed.ts`:** Replace stub; invoke `seed_metric_definitions.ts` via import.

**Repositories:**

- `metricRepository.ts`: `upsertObservation(data)`, `getObservations(userId, metricCode, dateRange)`,
  `getDailySummary(userId, metricCode, localDate)`, `upsertDailySummary(data)`,
  `upsertBaseline(data)`, `getBaseline(userId, metricCode, windowDays)`.

**Unit tests:** Test idempotent upsert behavior; verify `source_record_id` deduplication.
**Integration tests:** Seed metric definitions, insert observations, query summaries.

### Out-of-Scope Work

- Calculating daily summaries or baselines (Phase F).
- High-frequency heart-rate partition setup (deferred until volume demands it).
- Provider-specific observation ingestion (Phase E).

### Acceptance Criteria

1. `pnpm db:migrate` applies `000004_metrics.sql` successfully and idempotently.
2. `pnpm db:seed` inserts all 69 metric definitions from `@primis/health-metrics` registry.
3. Running `pnpm db:seed` twice is idempotent (no duplicate errors).
4. `metric_observations` can store `numeric_value`, `text_value`, `boolean_value`, and
   `json_value` independently.
5. `pnpm --filter @primis/api typecheck` exits 0.
6. `pnpm --filter @primis/api test` exits 0.
7. `select count(*) from metric_definitions` returns 69 after seeding.

### Verification Commands

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:seed   # idempotency
pnpm --filter @primis/api typecheck
pnpm --filter @primis/api test
# Manually: psql $DATABASE_URL -c "select count(*) from metric_definitions;"
```

### Likely Pitfalls

- **Metric code sync**: If `@primis/health-metrics` changes metric codes in a future commit, the
  seed script will automatically reflect that. Always run `pnpm db:seed` after updating the
  health-metrics package.
- **FK from observations to metric_definitions**: `metric_observations.metric_code references
metric_definitions(metric_code)` requires that seeding runs before inserting observations.
  Document this in `database/README.md`.
- **`source_record_id` uniqueness**: The unique constraint on `(user_id, metric_code,
source_provider, source_record_id)` means duplicate provider records are caught at DB level.
  Use upsert (`INSERT ... ON CONFLICT DO UPDATE`) in the repository.

### Questions Before Implementation

None.

### Commit Message

```
db: add metric registry and observation schema (CU-029)
```

---

## 11. CU-030 — Implement Daily Summary, Baseline, and Domain Tables

### Goal

Add all domain-specific tables for sleep, workout/activity, vitals, body composition, manual
inputs, nutrition, and the food catalog, matching Data Model §11–15 exactly. Tables must be
queryable and have representative repository methods and tests, but must NOT calculate summaries,
baselines, or derived features.

### Relevant Docs / Sections

- Data Model §11 (sleep domain — full section)
- Data Model §12 (workout and activity — full section)
- Data Model §13 (vitals and body composition — full section)
- Data Model §14 (manual inputs — full section)
- Data Model §15 (nutrition and food catalog — full section)
- TAD §21.4 (time handling rules ARCH-TIME-001 through ARCH-TIME-005)
- Spec §2.1 (health-data-model-first constraint)
- Scoring spec (data-quality concepts only — do NOT implement score formulas)

### Existing Repo Files / Packages to Build On

- `database/migrations/000004_metrics.sql` — `metric_definitions`, `metric_observations` (FK
  targets for domain tables)
- `database/migrations/000003_provider_sync.sql` — `provider_connections` (FK target)
- `database/migrations/000002_identity.sql` — `users` (FK target)

### Files Created or Edited

```
database/migrations/000005_domain_tables.sql               ← new; all domain tables
services/api/src/db/types.ts                               ← edit; add all domain table interfaces
services/api/src/repositories/sleepRepository.ts           ← new
services/api/src/repositories/activityRepository.ts        ← new
services/api/src/repositories/vitalRepository.ts           ← new
services/api/src/repositories/bodyCompositionRepository.ts ← new
services/api/src/repositories/manualInputRepository.ts     ← new
services/api/src/repositories/nutritionRepository.ts       ← new
services/api/test/repositories/sleepRepository.test.ts     ← new (unit)
services/api/tests/integration/domain_tables.test.ts       ← new (integration; skipIf)
```

### In-Scope Work

**`database/migrations/000005_domain_tables.sql`:**

Implement these tables in order (respecting FK dependencies):

Sleep (§11):

- `sleep_sessions` (§11.1): unique on `(user_id, source_provider, source_record_id)`.
  `provider_sleep_score` and `primis_sleep_score` are nullable.
- `sleep_stage_intervals` (§11.2): FK to `sleep_sessions` with `ON DELETE CASCADE`.
- `sleep_daily_features` (§11.3): unique on `(user_id, local_date)`. Stores precomputed features
  but does NOT require those features to be calculated yet.
- `bedtime_planner_requests` (§11.4a).
- `bedtime_recommendations` (§11.4b).

Activity (§12):

- `workout_sessions` (§12.1): unique on `(user_id, source_provider, source_record_id)`.
- `workout_hr_zone_summaries` (§12.2): FK to `workout_sessions` with `ON DELETE CASCADE`.
- `training_load_daily` (§12.3): unique on `(user_id, local_date)`.

Vitals / Body Composition (§13):

- `body_composition_measurements` (§13.1): unique on `(user_id, source_provider, source_record_id)`.
- `vital_daily_features` (§13.2): unique on `(user_id, local_date)`.

Manual Inputs (§14):

- `manual_checkins` (§14.1)
- `custom_tags` (§14.2): unique on `(user_id, tag_code)`.
- `tag_events` (§14.3)
- `hydration_entries` (§14.4)
- `caffeine_entries` (§14.5)
- `alcohol_entries` (§14.6)
- `bowel_entries` (§14.7): S3-sensitive handling note in SQL comment.

Nutrition and Food Catalog (§15):

- `food_catalog_sources` (§15.1): seed `fdc` (FoodData Central) source row in this migration.
- `food_items` (§15.2): `search_vector tsvector` column; full-text index deferred.
- `food_nutrient_values` (§15.3): FK to `food_items` with `ON DELETE CASCADE`.
- `nutrition_entries` (§15.4)
- `nutrition_entry_items` (§15.5): FK to `nutrition_entries` with `ON DELETE CASCADE`.
- `daily_nutrition_summaries` (§15.6): unique on `(user_id, local_date)`.

**Repositories:**

- `sleepRepository.ts`: `upsertSleepSession(data)`, `getSleepSession(id)`,
  `getSleepSessionsForDate(userId, localDate)`, `upsertSleepDailyFeatures(data)`.
- `activityRepository.ts`: `upsertWorkoutSession(data)`, `getWorkoutSessions(userId, dateRange)`,
  `upsertTrainingLoadDaily(data)`.
- `vitalRepository.ts`: `upsertVitalDailyFeatures(data)`, `getVitalDailyFeatures(userId, date)`.
- `bodyCompositionRepository.ts`: `upsertMeasurement(data)`, `getLatestMeasurement(userId)`.
- `manualInputRepository.ts`: `createCheckin(data)`, `getCheckins(userId, dateRange)`,
  `upsertCustomTag(data)`, `createTagEvent(data)`, `createHydrationEntry(data)`,
  `createCaffeineEntry(data)`, `createAlcoholEntry(data)`, `createBowelEntry(data)`.
- `nutritionRepository.ts`: `createNutritionEntry(data)`, `addEntryItem(data)`,
  `getDailyNutritionSummary(userId, localDate)`.

**Unit tests:** Focus on sleep session upsert deduplication and manual input insertion.
**Integration tests:** Insert representative records for each domain and query them back.

### Out-of-Scope Work

- Calculating `sleep_daily_features` values from sessions (Phase F scoring engine).
- Calculating `vital_daily_features` from observations (Phase F).
- Calculating `daily_nutrition_summaries` from entries (Phase F).
- Calculating `training_load_daily` from workout sessions (Phase F).
- FoodData Central import / `food_items` bulk seeding (Phase K).
- `bedtime_planner_requests` endpoint (Phase G — tables are created now, endpoints later).

### Acceptance Criteria

1. `pnpm db:migrate` applies `000005_domain_tables.sql` successfully and idempotently.
2. All domain tables exist with correct columns and constraints per spec.
3. FK cascade deletes work: deleting a `sleep_sessions` row removes child
   `sleep_stage_intervals`.
4. `sleep_daily_features.total_sleep_seconds` can be `null` (not yet calculated).
5. `bowel_entries` and `manual_checkins` rows support soft delete via `deleted_at` (or are
   simply deletable with cascade from `users`).
6. `pnpm --filter @primis/api typecheck` exits 0.
7. `pnpm --filter @primis/api test` exits 0.
8. Integration tests pass when `TEST_DATABASE_URL` is set.

### Verification Commands

```bash
pnpm db:migrate
pnpm --filter @primis/api typecheck
pnpm --filter @primis/api test
pnpm lint
```

### Likely Pitfalls

- **Time zone handling (ARCH-TIME-004)**: `sleep_sessions.local_sleep_date` should use the wake
  date convention. Add a SQL comment: `-- local_sleep_date: use wake date per ARCH-TIME-004`.
- **Nullable computed columns**: Many columns in `sleep_daily_features`, `vital_daily_features`,
  and `training_load_daily` are null until Phase F populates them. Do not add NOT NULL without a
  default on these computed fields.
- **`food_catalog_sources` FK in `food_items`**: Seed the `fdc` row in the migration file itself
  so the FK constraint can be satisfied in tests.
- **Migration size**: This migration may be 300–500 lines of SQL. Split into logical `-- == SLEEP ==`
  comment sections within the single file to keep it readable.

### Questions Before Implementation

None.

### Commit Message

```
db: add health domain summary schema (CU-030)
```

---

## 12. CU-031 — Implement Score, Insight, AI, and Dashboard Tables

### Goal

Add the computed-output and dashboard-configuration tables per Data Model §16–19:
`score_snapshots`, `score_component_values`, `algorithm_runs`, `insight_candidates`,
`correlation_results`, `anomaly_events`, `ai_conversations`, `ai_messages`,
`ai_context_snapshots`, `ai_model_invocations`, `dashboard_widgets`, `theme_settings`,
`mobile_cache_manifests`, with repository methods for reading/writing scores and dashboard state.
This CU stores computed outputs only — it does NOT compute any values.

### Relevant Docs / Sections

- Data Model §16 (scores and explainability — full section)
- Data Model §17 (insights, correlations, anomalies — full section)
- Data Model §18 (AI data model — full section)
- Data Model §19 (dashboard personalization — full section)
- AI Context Engine spec §9, §13 (AI storage/context safety constraints only)
- Scoring spec — score snapshot/data-quality concepts only; do NOT read formula sections
- TAD §22.5 (AI privacy controls)

### Existing Repo Files / Packages to Build On

- All previous migrations (001–005) are FK targets for this migration
- `packages/core-types/src/scores.ts` — `ScoreType`, `ScoreState`, `ScoreBand`, `ScoreConfidence`
- `packages/api-contracts/src/scores.ts` — `ScoreSnapshotDto` matches what Phase G will return
- `packages/api-contracts/src/dataQuality.ts` — data quality shapes

### Files Created or Edited

```
database/migrations/000006_outputs_and_dashboard.sql       ← new
services/api/src/db/types.ts                               ← edit; add output/dashboard table interfaces
services/api/src/repositories/scoreRepository.ts           ← new
services/api/src/repositories/insightRepository.ts         ← new
services/api/src/repositories/aiRepository.ts              ← new
services/api/src/repositories/dashboardRepository.ts       ← new
services/api/test/repositories/scoreRepository.test.ts     ← new (unit)
services/api/tests/integration/outputs_dashboard.test.ts   ← new (integration; skipIf)
```

### In-Scope Work

**`database/migrations/000006_outputs_and_dashboard.sql`:**

Scores (§16):

- `score_snapshots` (§16.2): unique on `(user_id, score_type, local_date, algorithm_version)`.
  `score_type` values: `sleep_score`, `recovery_score`, `training_readiness_score`,
  `strain_score`, `nutrition_score`, `wellbeing_score`, `bedtime_adherence_score`.
- `score_component_values` (§16.3): FK to `score_snapshots` with `ON DELETE CASCADE`.
- `algorithm_runs` (§16.4).

Insights and Correlations (§17):

- `insight_candidates` (§17.1): `status` CHECK: `active`, `dismissed`, `expired`, `superseded`.
- `correlation_results` (§17.2).
- `anomaly_events` (§17.3).

AI (§18):

- `ai_conversations` (§18.1): `conversation_type` CHECK values from spec.
- `ai_messages` (§18.2): includes `content_redacted text` column alongside `content text`.
- `ai_context_snapshots` (§18.3): this is the most important AI table. `context_json jsonb not
null` must not store raw health payloads — this constraint is enforced by application logic, not
  DB constraint. Add a SQL comment noting this.
- `ai_model_invocations` (§18.5).

Dashboard (§19):

- `dashboard_widgets` (§19.1): unique on `(user_id, dashboard_code, widget_type)`. Seed default
  widget rows in a separate seed script (not in the migration).
- `theme_settings` (§19.2): user_id primary key.
- `mobile_cache_manifests` (§19.3): unique on `(user_id, cache_scope, scope_date)`.

**Repositories:**

- `scoreRepository.ts`:
  - `upsertScoreSnapshot(data)`: idempotent upsert by `(user_id, score_type, local_date, algorithm_version)`.
  - `getLatestScoreSnapshot(userId, scoreType, localDate)`: returns the most recent snapshot.
  - `getScoreHistory(userId, scoreType, dateRange)`: for trend charts.
- `insightRepository.ts`:
  - `createInsight(data)`, `dismissInsight(id)`, `getActiveInsights(userId, limit)`.
- `aiRepository.ts`:
  - `createConversation(userId, type)`, `addMessage(conversationId, role, content)`,
  - `getConversation(id)`, `getConversationMessages(id)`.
  - `createContextSnapshot(data)`, `recordModelInvocation(data)`.
- `dashboardRepository.ts`:
  - `getWidgets(userId, dashboardCode)`, `upsertWidget(userId, dashboardCode, widgetType, config)`,
  - `getThemeSettings(userId)`, `upsertThemeSettings(userId, data)`.

**Unit and integration tests:** Verify score upsert idempotency; verify `getLatestScoreSnapshot`
returns correct row; verify widget ordering by `display_order`.

### Out-of-Scope Work

- Computing any score values (Phase F).
- Running AI model calls or generating summaries (Phase I).
- Generating insights or correlations (Phase F/I).
- Widget rendering in mobile UI (Phase G).

### Acceptance Criteria

1. `pnpm db:migrate` applies `000006_outputs_and_dashboard.sql` successfully and idempotently.
2. `score_snapshots` can store a row with `score_value`, `score_band`, `algorithm_version`.
3. `ai_context_snapshots.context_json` is a nullable or non-null `jsonb` column per spec.
4. `dashboard_widgets` unique constraint is enforced at DB level.
5. `scoreRepository.upsertScoreSnapshot` is idempotent.
6. `pnpm --filter @primis/api typecheck` exits 0.
7. `pnpm --filter @primis/api test` exits 0.
8. Integration tests pass when `TEST_DATABASE_URL` is set.

### Verification Commands

```bash
pnpm db:migrate
pnpm --filter @primis/api typecheck
pnpm --filter @primis/api test
pnpm lint
```

### Likely Pitfalls

- **`ai_messages.content`**: The content column stores the actual message text, which may contain
  sensitive health context. Ensure `aiRepository.ts` never logs message content. The
  `content_redacted` column is for storing a redacted version for audit purposes.
- **Score snapshot FK from component values**: `score_component_values` has a CASCADE delete from
  `score_snapshots`. When upserting a snapshot, old component values from the same version are
  automatically cleaned up.
- **`ai_model_invocations` does not reference `ai_messages`**: It tracks model calls
  independently for cost/usage reporting and can be joined via `message_id` when needed.

### Questions Before Implementation

None.

### Commit Message

```
db: add score insight ai and dashboard schema (CU-031)
```

---

## 13. CU-032 — Add Cognito-Aware Auth Middleware Shell

### Goal

Implement auth middleware that validates Cognito JWTs in production/staging, supports mock auth
only when `ALLOW_MOCK_AUTH=true` in local/dev mode, attaches typed user context to Hono's context
object, and exposes `GET /api/v1/me` returning the bootstrapped user profile.

### Relevant Docs / Sections

- TAD §9 (auth/identity architecture — ARCH-AUTH-001 through ARCH-AUTH-005)
- TAD §22.1 (security baseline), §22.4 (logging — no tokens in logs)
- PRD auth/account requirements
- `packages/config/src/env.ts` — needs `ALLOW_MOCK_AUTH` added here

### Existing Repo Files / Packages to Build On

- `services/api/src/app.ts` — Hono app from CU-024; middleware registered here
- `services/api/src/repositories/userRepository.ts` — `findByCognitoSub()` from CU-027
- `packages/config/src/env.ts` — `BackendEnv` Zod schema; ADD `ALLOW_MOCK_AUTH` here
- `packages/config/src/env.test.ts` — update tests for new field

### Files Created or Edited

```
packages/config/src/env.ts                                 ← edit; add ALLOW_MOCK_AUTH to BackendEnv
packages/config/src/env.test.ts                            ← edit; add ALLOW_MOCK_AUTH test cases
services/api/src/auth/authMiddleware.ts                    ← new; main middleware
services/api/src/auth/cognitoJwtVerifier.ts                ← new; Cognito JWT verification shell
services/api/src/auth/mockAuth.ts                          ← new; mock user for local dev only
services/api/src/types/context.ts                          ← new; Hono context type augmentation
services/api/src/routes/me.ts                              ← new; GET /api/v1/me route
services/api/src/app.ts                                    ← edit; register auth middleware + me route
services/api/test/auth/authMiddleware.test.ts              ← new (unit)
services/api/test/routes/me.test.ts                        ← new (unit)
```

### In-Scope Work

**`packages/config/src/env.ts` edit:** Add to `BackendEnvSchema`:

```typescript
ALLOW_MOCK_AUTH: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
```

Export `AllowMockAuth` type. Update `env.test.ts` to cover the new field.

**`services/api/src/auth/cognitoJwtVerifier.ts`:**
A shell that uses `aws-jwt-verify` (`CognitoJwtVerifier`) to verify Cognito JWTs. The verifier
requires `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_REGION` from env. In Phase Z,
these will be real values; in Phase D, they are `PLACEHOLDER` strings from `.env.example`.
Do NOT make the verifier fatal at startup if Cognito values are placeholder — only fail at
request time when real verification is attempted without mock mode.

**`services/api/src/auth/mockAuth.ts`:**
Returns a fixed synthetic user context when `ALLOW_MOCK_AUTH=true`:

```typescript
const MOCK_USER: AuthenticatedUser = {
  internalUserId: 'mock-user-00000000-0000-0000-0000-000000000001',
  cognitoSub: 'mock-cognito-sub',
  email: 'dev@example.invalid',
};
```

The `internalUserId` must be a valid UUID format. No real user identifiers.

**`services/api/src/auth/authMiddleware.ts`:**

- Check `Authorization: Bearer <token>` header.
- If `ALLOW_MOCK_AUTH=true` AND `APP_ENV` is `local` or `development`: accept header value
  `Bearer mock-dev-token` and attach mock user context.
- Otherwise: verify JWT via `cognitoJwtVerifier`, extract `sub` and `email`, look up user via
  `userRepository.findByCognitoSub(sub)`.
- If user not found: return 401 UNAUTHORIZED using `makeErrorResponse()`.
- Attach result to `c.set('user', authenticatedUser)` for downstream routes.
- **PRODUCTION GUARD**: If `APP_ENV !== 'local'` and `APP_ENV !== 'development'` and
  `ALLOW_MOCK_AUTH=true`, the middleware MUST panic/throw at startup (not at request time). This
  prevents accidental mock auth in staging or production.

**`services/api/src/routes/me.ts`:**
`GET /api/v1/me` — requires auth middleware. Returns the user's basic profile from the DB using
`userRepository`. Response shape must be compatible with `@primis/api-contracts` envelope.

**Unit tests:** Test mock auth path; test that production guard throws when `ALLOW_MOCK_AUTH=true`
with non-local `APP_ENV`; test 401 response for missing/invalid token in non-mock mode (mock
out the JWT verifier).

### Out-of-Scope Work

- Real Cognito JWT validation against live AWS (Phase Z).
- Google OAuth / provider auth flow (Phase E / Phase Z).
- Role-based access control or admin claims.
- Session refresh logic.

### Acceptance Criteria

1. `ALLOW_MOCK_AUTH=true` with `APP_ENV=local`: `GET /api/v1/me` with `Bearer mock-dev-token`
   returns 200 with user profile.
2. `ALLOW_MOCK_AUTH=true` with `APP_ENV=production`: middleware throws at startup (cannot serve
   requests).
3. `ALLOW_MOCK_AUTH=false` with invalid/missing token: returns 401 with `UNAUTHORIZED` error code.
4. No token values appear in application logs.
5. `packages/config/src/env.ts` exports `ALLOW_MOCK_AUTH` field.
6. `pnpm --filter @primis/config test` exits 0 (updated env tests pass).
7. `pnpm --filter @primis/api typecheck` exits 0.
8. `pnpm --filter @primis/api test` exits 0.
9. `pnpm lint` passes.

### Verification Commands

```bash
pnpm --filter @primis/config test
pnpm --filter @primis/api typecheck
pnpm --filter @primis/api test
pnpm lint
pnpm format:check
```

### Likely Pitfalls

- **`aws-jwt-verify` with placeholder Cognito values**: The library fetches JWKS from Cognito on
  first use. With `PLACEHOLDER` values, it will fail at request time (not startup). This is
  acceptable — mock auth bypasses this in local dev.
- **Hono context typing**: Use `createMiddleware<{ Variables: { user: AuthenticatedUser } }>()`
  for type-safe access to `c.var.user` in routes.
- **`ALLOW_MOCK_AUTH` env variable type**: Env variables are strings; the Zod transform handles
  `'true'`/`'false'` → boolean. Do not compare raw env string in middleware — use the typed
  `loadBackendEnv()` result.
- **`@primis/config` is a public package**: Adding `ALLOW_MOCK_AUTH` must not break mobile or
  other consumers. It should only be in `BackendEnv` (not `PublicEnv`).

### Questions Before Implementation

None blocking. The JWT library choice (`aws-jwt-verify` vs `jose`) is an assumption: use
`aws-jwt-verify` since it is Amazon's official library for Cognito specifically.

### Commit Message

```
api: add Cognito JWT auth middleware shell (CU-032)
```

---

## 14. CU-033 — Add User Bootstrap and Onboarding API Endpoints

### Goal

Add the `POST /api/v1/users/bootstrap`, `GET /api/v1/me`, `PATCH /api/v1/me/preferences`, and
`PATCH /api/v1/me/onboarding` endpoints, add the corresponding `user.ts` and `onboarding.ts`
contracts to `@primis/api-contracts`, and ensure the mobile API client's expected shapes are
satisfied. App authentication must remain separate from Google Health authorization.

### Relevant Docs / Sections

- PRD onboarding/personalization requirements; Google Health authorization separation
- Data Model §7 (identity/preferences tables — all fields bootstrapped here)
- TAD §9.2 (app auth vs health provider auth separation)
- TAD §12.3 (`GET /api/v1/me`, `PATCH /api/v1/me/profile`, `PATCH /api/v1/me/preferences`)
- `apps/mobile/src/api/endpoints.ts` — mobile API client shapes (verify compatibility)
- `packages/api-contracts/src/` — add `user.ts` and `onboarding.ts` here

### Existing Repo Files / Packages to Build On

- `services/api/src/auth/authMiddleware.ts` — auth middleware from CU-032
- `services/api/src/repositories/userRepository.ts` — user CRUD
- `services/api/src/repositories/preferencesRepository.ts` — goals, coach prefs, etc.
- `services/api/src/repositories/consentRepository.ts` — consent recording
- `packages/api-contracts/src/index.ts` — add exports for new contracts
- `packages/api-contracts/src/envelope.ts` — `makeSuccessResponse()`

### Files Created or Edited

```
packages/api-contracts/src/user.ts                         ← new; UserProfileDto + Zod schema
packages/api-contracts/src/onboarding.ts                   ← new; OnboardingRequestDto + Zod schema
packages/api-contracts/src/index.ts                        ← edit; export new modules
packages/api-contracts/test/user.test.ts                   ← new (unit; schema validation)
services/api/src/routes/user.ts                            ← new; /api/v1/me routes
services/api/src/routes/onboarding.ts                      ← new; onboarding routes
services/api/src/app.ts                                    ← edit; register new routes
services/api/test/routes/user.test.ts                      ← new (unit; mock auth + mock repos)
services/api/test/routes/onboarding.test.ts                ← new (unit)
services/api/tests/integration/onboarding.test.ts          ← new (integration; skipIf)
```

### In-Scope Work

**`packages/api-contracts/src/user.ts`:**

```typescript
// UserProfileDto: id, email, displayName, primaryTimezone, status,
//   dateOfBirth (optional), goals (ranked list), coachPreferences, themePreference
// UpdateProfileDto: Partial<UserProfileDto> (display name, timezone, etc.)
```

**`packages/api-contracts/src/onboarding.ts`:**

```typescript
// OnboardingGoalsDto: goals[] with goal_code + priority_rank
// OnboardingPreferencesDto: coachStyle, summaryStyle, explanationDepth, coachingIntensity,
//   nutritionPhilosophy (optional)
// OnboardingCompleteDto: combined
// GoalCode enum: athletic_performance | sleep | body_composition | fat_loss | muscle_gain |
//   longevity | general_health
```

All DTOs use Zod schemas and `makeSuccessResponse()` wrappers.

**`services/api/src/routes/user.ts`:**

- `GET /api/v1/me`: Return user profile from DB (via userRepository). If user row does not exist
  for the auth identity, auto-bootstrap one (idempotent).
- `PATCH /api/v1/me/profile`: Update displayName, primaryTimezone. Validate with Zod.
- `PATCH /api/v1/me/preferences`: Update coach preferences and nutrition philosophy.

**`services/api/src/routes/onboarding.ts`:**

- `POST /api/v1/me/onboarding/goals`: Upsert ranked goal list.
- `POST /api/v1/me/onboarding/preferences`: Upsert coach/nutrition preferences.
- `POST /api/v1/me/onboarding/consent`: Record consent event with version.

**IMPORTANT — app auth vs Google Health auth separation:**

- The onboarding endpoints MUST NOT include any field or flow for connecting Google Health.
- No `googleHealthConnected` field in `UserProfileDto`.
- Google Health authorization starts a separate flow (Phase E/Z under `/api/v1/provider-connections/`).
- This must be explicitly documented in the `onboarding.ts` contract file with a JSDoc comment.

**User bootstrap logic:**

- On `GET /api/v1/me`, if user row does not exist for the authenticated Cognito sub:
  1. Create the `users` row from JWT claims (sub, email).
  2. Create default `coach_preferences` row with spec defaults.
  3. Create default `data_retention_preferences` row with spec defaults.
  4. Return the newly created profile.
- This is idempotent: subsequent calls return the existing profile.

**Unit tests:** Test bootstrap idempotency (mock repo returns null then created user); test
onboarding goal upsert replaces existing goals; test Zod validation rejects invalid goal codes.

**Integration tests:** Full bootstrap → set goals → set preferences → GET /me round-trip.

### Out-of-Scope Work

- Google Health authorization endpoint (Phase E/Z).
- Provider connection management endpoints.
- Account deletion endpoint (Phase J).
- Data export endpoint (Phase J).

### Acceptance Criteria

1. `POST /api/v1/me/onboarding/goals` with valid goals array: 200 with updated goal list.
2. `GET /api/v1/me` auto-bootstraps user row if it doesn't exist.
3. `GET /api/v1/me` returns identical result on second call (idempotent bootstrap).
4. `OnboardingGoalsDto` rejects invalid `goal_code` values via Zod.
5. No Google Health–specific field exists in `UserProfileDto` or `OnboardingCompleteDto`.
6. `pnpm --filter @primis/api-contracts typecheck` exits 0.
7. `pnpm --filter @primis/api-contracts test` exits 0.
8. `pnpm --filter @primis/api typecheck` exits 0.
9. `pnpm --filter @primis/api test` exits 0.
10. `pnpm lint` and `pnpm format:check` pass.

### Verification Commands

```bash
pnpm install
pnpm --filter @primis/api-contracts typecheck
pnpm --filter @primis/api-contracts test
pnpm --filter @primis/api typecheck
pnpm --filter @primis/api test
pnpm lint
pnpm format:check
pnpm typecheck   # full workspace
pnpm test        # full workspace
```

### Likely Pitfalls

- **Auto-bootstrap race condition**: If two concurrent requests for a new user both hit
  `GET /api/v1/me`, both may try to insert the user row. Handle via `INSERT ... ON CONFLICT DO
NOTHING` + re-fetch in `userRepository.create()`.
- **Goal code enum in DB vs TypeScript**: Goal codes are stored as `text` in the DB (no Postgres
  enum). Application-level validation via Zod prevents invalid codes; DB stores whatever passes
  validation.
- **Circular import risk**: `packages/api-contracts` cannot import from `services/api`. The Zod
  schemas in `api-contracts` define the shapes; the route handlers in `services/api` validate
  against them.
- **Mobile compatibility**: After writing `UserProfileDto`, cross-check
  `apps/mobile/src/api/endpoints.ts` to confirm the shape matches what the mobile API client
  expects. If there is a mismatch, create an ADR rather than silently diverging.

### Questions Before Implementation

None blocking. If the executing agent finds the mobile client's endpoint shape conflicts with the
data model, document the discrepancy in a new ADR (`ADR-004-user-profile-dto-shape.md`) before
deciding which version to implement.

### Commit Message

```
api: add user bootstrap and onboarding endpoints (CU-033)
```

---

## 15. Phase-Level Guardrails

The following are absolute constraints for every CU in Phase D. Violations are not acceptable.

| Guardrail                                  | Detail                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| No real AWS deployment                     | No CDK stacks, no RDS, no Lambda deployment, no S3 buckets                              |
| No real Cognito dependency                 | Cognito values remain `PLACEHOLDER`; mock auth handles local dev                        |
| No real Google Health OAuth                | No OAuth client IDs, secrets, or token exchange                                         |
| No raw tokens in storage                   | `*_secret_ref` fields store ARN/path strings only; never raw token values               |
| No raw tokens in logs                      | No `console.log()` or structured log that contains a token, refresh token, or auth code |
| No provider sync execution                 | No worker, cron, or sync trigger code                                                   |
| No raw health payloads in logs or fixtures | All fixture data must pass redaction policy in `database/fixtures/README.md`            |
| No unredacted user data in tests           | Test user IDs use `test-user-001` etc., emails use `@example.invalid`                   |
| No scoring formula implementation          | No baseline calculation, no sleep score formula, no weight application                  |
| No AI provider calls                       | No OpenAI/Anthropic calls, no prompt construction, no LLM invocation                    |
| No new mobile UI screens                   | No changes to `apps/mobile/app/` beyond what's needed for type compatibility            |
| No production credentials                  | `.env.example` remains the only committed env file; all values are `PLACEHOLDER`        |
| No source-of-truth doc edits               | Any conflict → create an ADR under `docs/decisions/`                                    |
| Table names match spec exactly             | Do not rename tables, columns, enums, metric codes, provider codes, or score states     |
| Provider codes match ADR-001               | Use the 8 canonical codes verbatim in all DB seeds, constraints, and TypeScript         |

---

## 16. Reusable Handoff Prompt Template

Copy and fill this template for each CU's Cursor agent session:

```
You are a Cursor coding agent implementing exactly one commit unit for the Primis project.

ASSIGNED COMMIT UNIT: CU-0XX — <title>

PHASE D PLAN: Read /plans/phase-d-backend-local-foundation-database.md §<section number>
for the complete specification of this CU before writing any code.

PREREQUISITE DOCS TO READ (in order):
1. docs/source-of-truth/primis_full_implementation_spec_commit_plan.md — §1–§5, Phase D CU-0XX
2. docs/source-of-truth/primis_technical_architecture_document.md — <relevant sections from plan>
3. docs/source-of-truth/primis_data_model_health_metric_schema.md — <relevant sections from plan>
4. docs/decisions/ADR-001-provider-code-naming.md (if writing any provider code or DB seed)
5. .ai-agent-instructions.md
6. CONTRIBUTING.md

PACKAGES TO IMPORT FROM:
- @primis/core-types (enums, types)
- @primis/health-metrics (metric registry — for CU-029 seeding)
- @primis/api-contracts (response shapes)
- @primis/config (loadBackendEnv)

STRICT CONSTRAINTS:
- Implement ONLY CU-0XX. Do not implement adjacent CUs.
- Table/column/enum names MUST match the data model spec exactly.
- Provider codes MUST use ADR-001 values exactly.
- No raw tokens stored or logged.
- No scoring formulas, no AI calls, no provider sync.
- No production credentials.
- Create ADRs for any spec conflicts before writing code.

VERIFICATION (run before committing):
pnpm install
pnpm --filter @primis/api typecheck
pnpm --filter @primis/api test
pnpm lint
pnpm format:check

COMMIT MESSAGE FORMAT: <area>: <short imperative summary> (CU-0XX)
BRANCH FORMAT: cu/cu-0xx-<short-name>
```

---

## 17. Definition of Done for Phase D

Phase D is complete when ALL of the following are true:

### Service and Infrastructure

- [ ] `services/api/` (`@primis/api`) is a functioning Hono-based API service with `package.json`
      name `@primis/api`.
- [ ] `GET /health` returns a structured `ApiSuccessResponse`.
- [ ] `docker compose up -d db` starts Postgres without error.
- [ ] `pnpm db:migrate` applies all 6 migration files idempotently.
- [ ] `pnpm db:seed` seeds 69 metric definitions from `@primis/health-metrics`.

### Schema Completeness

- [ ] All 7 identity/preference/consent tables exist (§7 of data model).
- [ ] All 6 provider connection/sync tables exist (§8 of data model).
- [ ] `metric_definitions`, `metric_observations`, `metric_timeseries_samples`,
      `daily_metric_summaries`, `rolling_metric_baselines` exist.
- [ ] All sleep domain tables exist (§11).
- [ ] All workout/activity domain tables exist (§12).
- [ ] Vitals and body composition tables exist (§13).
- [ ] All manual input tables exist (§14).
- [ ] All nutrition/food catalog tables exist (§15).
- [ ] All score, insight, AI, and dashboard tables exist (§16–19).
- [ ] No table name deviates from the data model spec.

### Auth

- [ ] `ALLOW_MOCK_AUTH=true` + `APP_ENV=local` allows mock auth.
- [ ] `ALLOW_MOCK_AUTH=true` + `APP_ENV=production` panics at startup.
- [ ] `GET /api/v1/me` returns bootstrapped user profile with mock auth.

### Onboarding Endpoints

- [ ] `GET /api/v1/me` auto-bootstraps a new user idempotently.
- [ ] `POST /api/v1/me/onboarding/goals` saves ranked goals.
- [ ] `POST /api/v1/me/onboarding/preferences` saves coach/nutrition preferences.
- [ ] App auth and Google Health authorization are modeled separately.

### Code Quality

- [ ] `pnpm typecheck` (full workspace) exits 0.
- [ ] `pnpm lint` exits 0.
- [ ] `pnpm test` exits 0 (unit tests; integration tests skipped in CI).
- [ ] `pnpm format:check` exits 0.

### Security and Safety

- [ ] No raw tokens in any committed file.
- [ ] No unredacted user/health data in any fixture or test.
- [ ] No scoring formulas implemented.
- [ ] No AI provider calls.
- [ ] No real AWS credentials.
- [ ] `git grep -r "ya29\." .` returns nothing.
- [ ] `git grep -r "AKIA" .` returns nothing.
- [ ] `git grep -r "sk-" .` returns nothing.

### Documentation

- [ ] `ADR-003-query-layer-and-migrations.md` exists in `docs/decisions/`.
- [ ] `database/README.md` explains local DB setup.
- [ ] `tests/integration/README.md` or equivalent documents integration test requirements.

---

## 18. Known Risks / Decisions to Defer

| Risk / Decision                         | Notes                                                                                                                                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kysely type maintenance**             | `services/api/src/db/types.ts` is manually maintained. As migrations grow (6 files, ~30+ tables), keeping this in sync requires discipline. Consider adding `kysely-codegen` in Phase E or a CI check that validates the interface.       |
| **Migration atomicity**                 | The runner uses transactions per migration file. If a migration is very large (e.g., `000005_domain_tables.sql`), a partial failure could leave the DB in an inconsistent state. Test carefully on local DB before committing.            |
| **`pg` connection pool for Lambda**     | Postgres connection pooling inside Lambda (ephemeral compute) can cause connection exhaustion. Phase D uses simple `pg.Pool` which is fine for local dev. Before production (Phase Z), add RDS Proxy or connection pooling configuration. |
| **`ai_messages.content` field size**    | Long AI conversations can produce very large content fields. Phase D schema does not set explicit limits. Phase J should evaluate whether to cap message size or use S3 for long conversations.                                           |
| **`food_items.search_vector` tsvector** | The column is defined but no GIN index or full-text search is implemented yet. Phase K (FoodData Central import) will need this.                                                                                                          |
| **Bowel entries sensitivity**           | `bowel_entries` stores gut health data (S3 in sensitivity classification). The migration creates the table; Phase J should confirm the encryption/access-control strategy for these rows specifically.                                    |
| **`users.status` enum**                 | Stored as `text` with application-level validation. A Postgres `CREATE TYPE` ENUM would provide DB-level safety but is harder to migrate later. The current text approach is consistent with the rest of the schema.                      |
| **Integration test DB URL in CI**       | CI currently skips integration tests. Before Phase J hardening, `TEST_DATABASE_URL` should point to an ephemeral CI database so integration tests run on every PR.                                                                        |
| **RDS Proxy / pgBouncer**               | Not needed for Phase D (local dev only). Required before public launch. Defer to Phase Z.                                                                                                                                                 |

---

## 19. Open Questions / Assumptions

| ID      | Question / Assumption                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Status                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| D-A-001 | **Migration runner implementation**: The canonical approach is a **custom `scripts/db-migrate.ts` raw SQL runner** that reads `.sql` files from `database/migrations/` lexicographically and applies them via `pg` directly — no third-party migration library. This is the stated default per ADR-003. If the CU-026 executor finds a strong reason to use a library (e.g., `node-pg-migrate`), they must update ADR-003 rather than silently introducing the dependency. | Decided — documented in ADR-003                      |
| D-A-002 | **Kysely driver**: Assumes `pg` (`node-postgres`) as the Kysely PostgresDialect driver, consistent with `.env.example` URL format.                                                                                                                                                                                                                                                                                                                                         | Assumption — non-blocking                            |
| D-A-003 | **UUID strategy**: Assumes UUID v4 (`gen_random_uuid()` from pgcrypto) for simplicity and broad Postgres support. UUID v7 (time-sortable) could replace this later without a breaking schema change.                                                                                                                                                                                                                                                                       | Assumption — non-blocking                            |
| D-A-004 | **Hono version**: Uses latest stable Hono 4.x. The Lambda adapter is included in `hono/lambda` (core package). No `@hono/aws-lambda` separate package needed.                                                                                                                                                                                                                                                                                                              | Assumption — verify at install time                  |
| D-A-005 | **`aws-jwt-verify` for Cognito shell**: Assumes `aws-jwt-verify` (Amazon's official library) over `jose` for CU-032. This provides the correct JWKS endpoint auto-detection for Cognito without manual configuration.                                                                                                                                                                                                                                                      | Assumption — non-blocking                            |
| D-A-006 | **Mock user ID format**: Mock user ID `mock-user-00000000-0000-0000-0000-000000000001` is a valid UUID format but obviously synthetic. No real user data.                                                                                                                                                                                                                                                                                                                  | Assumption — confirmed safe                          |
| D-A-007 | **`services/api/tests/integration/` location**: Integration tests live in `services/api/tests/integration/` (matching `tests/README.md` spec). CI skips these unless `TEST_DATABASE_URL` is set.                                                                                                                                                                                                                                                                           | Assumption — consistent with tests README            |
| D-A-008 | **`updated_at` trigger approach**: Assumes repositories update `updated_at` explicitly (via Kysely `updateTable`), not via a Postgres trigger. This keeps migration SQL simpler and puts the update responsibility in the repository layer.                                                                                                                                                                                                                                | Assumption — consistent with spec                    |
| D-A-009 | **Goal codes are application enums, not Postgres ENUMs**: `user_goals.goal_code` is `text` validated by Zod in the API layer. Postgres ENUMs are harder to extend without migrations.                                                                                                                                                                                                                                                                                      | Assumption — consistent with overall schema approach |
| D-A-010 | **Mobile API client compatibility**: `apps/mobile/src/api/endpoints.ts` shapes have not been fully cross-checked against the CU-033 DTOs in this plan. The executing agent for CU-033 MUST compare these before finalizing `UserProfileDto`. If shapes conflict, create ADR-004.                                                                                                                                                                                           | Open question — must check in CU-033                 |

---

## 20. Next Phase Preview (Phase E Awareness)

Phase E (Provider Validation and Sync Infrastructure) builds directly on Phase D's schema. The
following Phase D outputs are critical dependencies:

| Phase D Output                                                       | Phase E Dependency                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `provider_connections` table + repository                            | Phase E creates Google Health connection rows                                |
| `provider_sync_jobs` table + `syncRepository`                        | Phase E creates and tracks sync jobs                                         |
| `provider_sync_cursors` table                                        | Phase E updates cursors after each sync window                               |
| `raw_provider_payloads` table                                        | Phase E inserts S3 payload metadata after archiving                          |
| `metric_observations` table + `metricRepository.upsertObservation()` | Phase E normalizes Google Health data into observations                      |
| `provider_data_availability` table                                   | Phase E marks metrics as `available` / `unavailable` per user                |
| `provider_metric_mappings` seed                                      | Phase E uses these mappings during normalization                             |
| Auth middleware (`authMiddleware.ts`)                                | Phase E endpoints for provider connection initiation use the same middleware |

**Phase E will NOT be implemented in Phase D.** The only Phase E awareness in Phase D is:

1. Ensuring the above tables and repositories are queryable and correctly constrained.
2. Ensuring `provider_metric_mappings` has initial seed rows for documented Google Health metrics.
3. Ensuring `raw_provider_payloads.s3_key` and `s3_bucket` columns accept the S3 key pattern
   documented in Data Model §8.7.

Phase E will create: Google Health API client, OAuth flow shell, sync worker architecture,
normalization pipeline, fixture spike scripts, and metric availability validation tooling. None
of that belongs in Phase D.

---

_End of Phase D — Backend Local Foundation and Database Plan_

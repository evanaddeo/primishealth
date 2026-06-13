# ADR-003: Query Layer and Migration Strategy

**Date:** 2026-06-12
**Status:** Accepted
**Commit Unit:** CU-026

---

## Context

Two coupled technology decisions were required before writing any database query or migration code
for Phase D. A conflict was identified between two source-of-truth documents:

- **TAD §21.2** (`primis_technical_architecture_document.md`) recommends Drizzle ORM or Prisma
  as the query/schema layer.
- **Spec §4.2** (`primis_full_implementation_spec_commit_plan.md`) mandates Kysely with
  SQL-first migrations.

Per the source-priority hierarchy documented in `docs/README.md`, the implementation spec (Priority 1)
outranks the TAD (Priority 3). Both decisions below resolve in favour of the spec.

Additionally, the spec states "SQL-first migrations" but does not prescribe a specific migration
runner library. This ADR documents the runner choice.

---

## Decision 1 — Query Layer: Kysely

**Use Kysely as the exclusive query layer for all database access in `services/api`.**

### Rationale

- The implementation spec (`primis_full_implementation_spec_commit_plan.md §4.2`) explicitly
  mandates Kysely. Source-priority rules require this to supersede the TAD recommendation.
- Kysely is SQL-first and type-safe without ORM schema generation. This aligns with the
  "data-model-first" constraint (spec §2.1) — table definitions live in raw `.sql` migration
  files, and TypeScript types in `services/api/src/db/types.ts` are maintained manually.
- No ORM schema generation (no `prisma generate`, no `drizzle-kit push`). Migrations are the
  authoritative source of truth for the DB schema.
- Kysely uses `pg` (`node-postgres`) as the underlying driver via `PostgresDialect`. This is
  consistent with the `DATABASE_URL` format already documented in `.env.example`
  (`postgres://...`).

### Consequences

- All queries across Phase D–Z use Kysely's type-safe builder (`db.selectFrom`, `db.insertInto`,
  etc.).
- `services/api/src/db/types.ts` is the single manually-maintained `Database` interface.
  Each schema CU (CU-027–CU-031) adds table interfaces to this file.
- ORM code generation tools (Drizzle Kit, Prisma CLI) are not installed.
- If a future agent finds a strong reason to replace Kysely, they must update this ADR rather than
  silently introducing a different library.

### Driver: `pg` (node-postgres)

Kysely's `PostgresDialect` accepts a `pg.Pool` instance. The `pg` package is the most widely
tested Kysely driver and matches the `postgres://` connection string format in `.env.example`.
`postgres.js` was considered but is not chosen — using `pg` avoids introducing a second driver
pattern in the codebase. This assumption is recorded in Phase D open question D-A-002.

---

## Decision 2 — Migration Runner: Custom Raw SQL Runner

**Use a custom `scripts/db-migrate.ts` raw SQL runner — no third-party migration library.**

### Rationale

- The implementation spec §4.2 mandates "SQL-first migrations". The canonical migration files
  are `.sql` files in `database/migrations/`, numbered lexicographically (`000001_init.sql`,
  `000002_identity.sql`, …).
- A custom runner keeps the mechanism transparent: it reads `.sql` files, checks the
  `schema_migrations` tracking table, and executes pending files via `pg` in a transaction.
  There are no hidden library behaviours, no DSL to learn, and no lock-in.
- Third-party libraries such as `node-pg-migrate`, `db-migrate`, or `flyway` were considered.
  None were chosen — the added abstraction surface is not justified for a project that owns
  its SQL files directly.
- The runner wraps each migration file in a `BEGIN` / `COMMIT` block, so a failed migration
  leaves the DB in a clean, pre-migration state.

### Runner architecture

```
scripts/db-migrate.ts          CLI entrypoint — reads DATABASE_URL from env, invokes runner
services/api/src/db/migrate.ts Programmatic library function — importable in integration tests
database/migrations/           Directory of .sql files; lexicographic order = application order
```

`schema_migrations` table columns:

| Column       | Type          | Notes                              |
| ------------ | ------------- | ---------------------------------- |
| `version`    | `text PK`     | Filename stem, e.g. `000001_init`  |
| `applied_at` | `timestamptz` | Set to `now()` when migration runs |

The `version` key is the full filename stem (without `.sql`), so `000001_init.sql` records
version `000001_init`. This makes the tracking row human-readable and directly traceable to the
file.

### Idempotency

Running `pnpm db:migrate` multiple times is always safe. The runner selects already-applied
versions from `schema_migrations` and skips them. Only files whose stems are not present in
`schema_migrations` are executed.

### Consequences

- `database/migrations/` is the canonical schema source. Migrations are never auto-generated.
- Migration file names must zero-pad to at least 6 digits to sort correctly lexicographically.
- If a future agent finds a strong reason to adopt a migration library (e.g., rollback support
  becomes critical), they must update this ADR and justify the change explicitly.

---

## Follow-up Actions

| Action                                                               | CU      |
| -------------------------------------------------------------------- | ------- |
| Add `kysely-codegen` as an optional CI check once schema stabilises  | Phase E |
| Evaluate `pg-pool` / RDS Proxy configuration for Lambda environments | Phase Z |
| Add integration test DB (`TEST_DATABASE_URL`) to CI pipeline         | Phase J |

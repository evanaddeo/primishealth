# Integration Tests

Integration tests in this directory connect to a real Postgres database.

## Running Integration Tests

Set `TEST_DATABASE_URL` to a valid Postgres connection string and re-run the test suite:

```bash
TEST_DATABASE_URL=postgres://primis:primis@localhost:5432/primis_dev \
  pnpm --filter @primis/api test
```

All integration test files use `describe.skipIf(!process.env['TEST_DATABASE_URL'])` so they are
**silently skipped** when the variable is absent. This means `pnpm --filter @primis/api test` in
CI passes without a live database.

## Local Setup

1. Start Postgres: `bash scripts/db-up.sh` (or `docker compose up -d db`)
2. Apply migrations: `pnpm db:migrate`
3. Run all tests with the real DB URL:

```bash
TEST_DATABASE_URL=postgres://primis:primis@localhost:5432/primis_dev \
  pnpm --filter @primis/api test
```

## CI Behaviour

The CI pipeline does not set `TEST_DATABASE_URL`, so integration tests are skipped on every PR.
Before Phase J hardening, point CI at an ephemeral Postgres instance and set
`TEST_DATABASE_URL` in the workflow environment to enable full integration coverage on every run.

## Files

| File                 | Added In | What It Tests                                         |
| -------------------- | -------- | ----------------------------------------------------- |
| `migrations.test.ts` | CU-026   | Migration runner applies 000001_init.sql idempotently |

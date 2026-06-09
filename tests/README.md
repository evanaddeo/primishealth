# Primis Test Conventions

This document defines the test conventions and fixture policy for all TypeScript packages and
services in the Primis monorepo.

---

## 1. Test Runner

All TypeScript packages and services use **Vitest** (v1.x).

- The root `vitest.workspace.ts` operates in **workspace mode** and auto-discovers any package or
  service that provides its own `vitest.config.ts`.
- Packages without tests yet do not need a `vitest.config.ts` — add one when the first test is
  written.
- Run all tests from the repo root:

```bash
pnpm test
```

- Run tests for a single package:

```bash
pnpm --filter @primis/<package-name> test
```

---

## 2. Test File Naming and Location

| Convention | Rule |
| --- | --- |
| Co-located unit tests | `src/foo.test.ts` (same directory as `src/foo.ts`) |
| Isolated test directory | `test/foo.test.ts` or `tests/foo.test.ts` inside the package |
| Integration test directory | `tests/integration/` (Phase D+; requires a running database) |
| File extension | Always `.test.ts`; never `.spec.ts` |

---

## 3. Test Quality Rules

1. **Deterministic** — no real network calls, no real database connections, and no system-clock
   dependency in unit tests. Use dependency injection or Vitest's `vi.mock` / `vi.fn` for I/O
   boundaries.
2. **No secrets in tests** — never hard-code real API keys, OAuth tokens, refresh tokens, real
   user IDs, real email addresses, or real device identifiers. Use the placeholder values in
   `.env.example`, or fabricate plausible synthetic values.
3. **Fixtures from `database/fixtures/`** — when a test needs a provider payload sample, load it
   from a redacted fixture file. See `database/fixtures/README.md` for the fixture policy and
   directory layout.
4. **No real provider payloads** — never commit an unredacted Google Health, Fitbit, Apple
   HealthKit, or any other provider API response. All fixtures must be redacted (see fixture
   policy).
5. **No raw health data in assertions** — test assertions must not reproduce raw personal
   identifiers, OAuth tokens, or unredacted S2/S3 health records. Use anonymized synthetic
   values only.

---

## 4. Data Sensitivity in Tests

Tests that exercise health-data logic must respect the sensitivity levels defined in
`docs/source-of-truth/primis_data_model_health_metric_schema.md §5.4`:

| Level | Label | Examples | Test rule |
| --- | --- | --- | --- |
| S0 | Public/reference | FoodData Central records | Allowed verbatim |
| S1 | User preferences | Theme, widget layout | Synthetic values only |
| S2 | Personal wellness | Steps, sleep, calories | Synthetic or redacted fixtures |
| S3 | Sensitive health data | HRV, SpO2, body composition, bowel entries, AI conversations | Synthetic values only; never log in test output |
| S4 | Secrets/credentials | OAuth tokens, API keys | Never in tests; use `PLACEHOLDER` strings |

---

## 5. What Must Never Appear in Test Files or Fixtures

The following are **absolutely forbidden** in any committed test file, fixture, snapshot, or
inline test data:

- Real OAuth access tokens or refresh tokens (any provider)
- Real API keys (OpenAI, Anthropic, AWS, Google, Fitbit, or any other)
- Real user IDs or Cognito sub values
- Real email addresses
- Real device identifiers (UDID, advertising ID, push token)
- Unredacted provider API payloads (Google Health, Fitbit, Apple HealthKit, etc.)
- Raw personal health records from any real person

Verify before committing:

```bash
git grep -r "sk-" .          # should return nothing (no OpenAI-format keys)
git grep -r "AKIA" .         # should return nothing (no AWS access key IDs)
git grep -r "ya29\." .       # should return nothing (no Google OAuth access tokens)
```

---

## 6. Integration Tests (Deferred to Phase D)

Integration tests that require a live Postgres connection live under `tests/integration/` inside
each service package. They are out of scope until Phase D (CU-014+), when the database schema is
established. Integration tests should be skipped by default in CI unless a `TEST_DATABASE_URL`
variable is set.

---

## 7. Coverage (Deferred)

Coverage reporting is not configured in Phase A. It will be added when enough tests exist to be
meaningful (Phase B/C). At that point, configure `v8` coverage in each package's
`vitest.config.ts` and add a `coverage` script to `package.json`.

---

## 8. Mobile Testing (Deferred to Phase C)

React Native component and hook testing uses **React Native Testing Library**. That setup is
out of scope until Phase C (CU-014+), when the mobile app package (`apps/mobile`) is initialized.

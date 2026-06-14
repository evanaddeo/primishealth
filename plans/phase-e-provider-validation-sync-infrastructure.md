# Phase E — Provider Validation and Sync Infrastructure

**Plan version:** 1.0  
**Covers:** CU-034 through CU-046  
**Status:** Implementation-ready draft  
**Created:** 2026-06-13  
**Audience:** Cursor AI coding agents, founder/developer  
**Prerequisites:** Phases A–D complete and green (`pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` pass from repo root)

---

## 1. Phase Goal and Non-Goals

### Goal

Build the complete provider ingestion stack for Google Health API — from the data-availability documentation artifact through OAuth skeleton, raw-payload archiving, normalization pipeline, idempotent record writing, a local sync runner, and the API endpoints the mobile app needs to connect and inspect sync state.

At the end of Phase E the repo can:

- Document Google Health metric availability (scaffold only; real validation is Phase Z).
- Define a provider-agnostic connector interface that all future providers will implement.
- Archive raw provider payloads locally (and via S3 shell) without requiring real AWS.
- Simulate the Google Health OAuth flow with injected clients (no real credentials needed).
- Normalize Google Health activity, vitals, sleep, and workout payloads into canonical records using mock fixtures.
- Write normalized records idempotently into the existing `metric_observations`, `sleep_sessions`, and `workout_sessions` tables.
- Run a full local mock sync lifecycle end-to-end.
- Expose REST endpoints for provider connection and sync management.

### Non-Goals for Phase E

- Real live Google Health API calls in automated tests.
- Committing real Google OAuth tokens, credentials, or unredacted provider payloads.
- Scoring, baselines, or daily summary computation (Phase F).
- AI gateway, prompts, or model calls (Phase I).
- Mobile UI for the provider connection flow (Phase G).
- AWS EventBridge, SQS, or Lambda deployment infrastructure (Phase Z).
- iOS HealthKit or Android Health Connect integration (Phase K).
- FoodData Central or Hume provider connectors.
- Marking any metric as `verified` in `provider_metric_mappings` (requires live validation in Phase Z / Phase AA).

---

## 2. Current Repo State Summary

### 2.1 What Phases A–D Already Created

| Phase   | CUs        | Key deliverables                                                                                                                                                                                                                         |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase A | CU-001–007 | pnpm monorepo, TS strict, ESLint/Prettier, Vitest workspace, GitHub Actions CI, `@primis/config` Zod env loader                                                                                                                          |
| Phase B | CU-008–013 | `@primis/core-types` (enums incl. `PROVIDER_CODE`, `SyncJobType`, `SyncJobStatus`), `@primis/health-metrics` (69-metric registry + `convertUnit`), `@primis/api-contracts` (envelope, errors, scores, DTOs), `scripts/redact-fixture.ts` |
| Phase C | CU-014–023 | `apps/mobile` (Expo Dev Client), `@primis/design-system`, navigation shell, mock dashboard states                                                                                                                                        |
| Phase D | CU-024–033 | `services/api` (Hono + Kysely + `pg`), 6 SQL migrations (all provider tables, metric tables, domain tables), `auth/`, 15 repository modules, `GET /health`, `GET/PATCH /api/v1/me/*`, `POST /api/v1/me/onboarding/*`                     |

### 2.2 Packages, Services, Tables, and Scripts to Reuse

**Packages to import in Phase E:**

| Package                  | Import path   | What Phase E uses                                                                                                                                                  |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@primis/core-types`     | `workspace:*` | `PROVIDER_CODE`, `ProviderCode`, `ConnectionStatus`, `ProviderDataAvailabilityStatus`, `SyncJobType`, `SyncJobStatus`, `redactFixture`, `SENSITIVE_FIELD_PATTERNS` |
| `@primis/health-metrics` | `workspace:*` | `convertUnit`, `UnitConversionError`, `METRIC_REGISTRY`, canonical metric codes                                                                                    |
| `@primis/api-contracts`  | `workspace:*` | `makeSuccessResponse`, `makeErrorResponse`, `ApiSuccessResponse`, `ApiErrorResponse`, error codes, pagination types                                                |
| `@primis/config`         | `workspace:*` | `loadBackendEnv`, `BackendEnv` Zod env schema                                                                                                                      |

**services/api files to extend or reuse in Phase E:**

| File                                                  | Reuse in                                                |
| ----------------------------------------------------- | ------------------------------------------------------- |
| `services/api/src/db/client.ts`                       | Pattern to copy for `services/workers/src/db/client.ts` |
| `services/api/src/db/types.ts`                        | Reference (not importable directly from workers)        |
| `services/api/src/repositories/providerRepository.ts` | Extend in CU-046 for new query methods                  |
| `services/api/src/app.ts`                             | Register new routes in CU-037 and CU-046                |
| `services/api/src/auth/authMiddleware.ts`             | Apply to new routes in CU-037 and CU-046                |

**Database tables already created by Phase D migrations:**

| Table                        | Migration | Phase E write pattern                                    |
| ---------------------------- | --------- | -------------------------------------------------------- |
| `provider_connections`       | 000003    | Read (token refs), update status                         |
| `provider_data_availability` | 000003    | Upsert in CU-044                                         |
| `provider_metric_mappings`   | 000003    | Read-only (seeded with 15 unverified google_health rows) |
| `provider_sync_jobs`         | 000003    | Insert + update status in CU-045                         |
| `provider_sync_cursors`      | 000003    | Upsert high-watermark in CU-045                          |
| `raw_provider_payloads`      | 000003    | Insert metadata in CU-044                                |
| `metric_observations`        | 000004    | Upsert normalized records in CU-044                      |
| `metric_timeseries_samples`  | 000004    | Upsert HR samples in CU-044 (optional)                   |
| `sleep_sessions`             | 000005    | Upsert in CU-043/044                                     |
| `sleep_stage_intervals`      | 000005    | Upsert in CU-043/044                                     |
| `workout_sessions`           | 000005    | Upsert in CU-043/044                                     |

**Scripts to reuse:**

| Script                      | Use                                                |
| --------------------------- | -------------------------------------------------- |
| `scripts/redact-fixture.ts` | Redact raw spike output before committing fixtures |
| `scripts/db-migrate.ts`     | Run before integration tests                       |
| `scripts/db-seed.ts`        | Seed metric_definitions before integration tests   |

### 2.3 ADRs Affecting Phase E

| ADR                                                                 | Decision                                                               | Phase E impact                                                                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [ADR-001](../docs/decisions/ADR-001-provider-code-naming.md)        | `google_health`, `healthkit`, `health_connect` (not `apple_healthkit`) | All provider codes in connectors, normalizers, and DB writes must use these exact strings                          |
| [ADR-002](../docs/decisions/ADR-002-ai-intent-count-discrepancy.md) | `AiIntent` has 20 values                                               | No direct impact; illustrates that spec annotations can have count errors — validate against spec text, not counts |
| [ADR-003](../docs/decisions/ADR-003-query-layer-and-migrations.md)  | Kysely + custom SQL migration runner                                   | Workers DB layer must use Kysely + `pg`; any new tables need a new migration file                                  |

### 2.4 Existing Package and Test Conventions

- **TS strict mode** — `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`. Use `Insertable<T>` / `Updateable<T>` from Kysely; do not write `field?: T | undefined` by hand.
- **`updated_at`** — managed explicitly in repository write methods (D-A-008); no DB triggers.
- **Test files** — co-located `src/foo.test.ts` or in `test/foo.test.ts`. Extension always `.test.ts`.
- **No real network in tests** — inject fetch/HTTP client; mock at the boundary.
- **Fixtures** — under `database/fixtures/provider/google_health/synthetic/` for hand-crafted fixtures. Run through `scripts/redact-fixture.ts` before commit.
- **Commit message format** — `<area>: <short imperative summary> (<CU-ID>)`
- **Verification** — `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` from repo root.
- **`vitest.workspace.ts`** at repo root — auto-discovers any package with a `vitest.config.ts`. New packages must add one.

### 2.5 Repo Drift and Mismatches Executing Agents Must Account For

| ID          | Drift                                                                                                                                                                                                                                | Resolution                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-DRIFT-001 | `services/workers` is currently a `.gitkeep` placeholder — not a real pnpm package.                                                                                                                                                  | CU-035 bootstraps it as `@primis/workers` with `package.json`, `tsconfig.json`, `vitest.config.ts`, and minimal DB client.                                                                         |
| E-DRIFT-002 | The implementation spec CU-035 references `packages/core-types/src/providers.ts` (plural). The existing file is `packages/core-types/src/provider.ts` (singular).                                                                    | CU-035 creates a NEW `packages/core-types/src/providers.ts` for connector-capability types and exports it from `src/index.ts`. The existing `provider.ts` is not renamed.                          |
| E-DRIFT-003 | `services/api/src/db/types.ts` is a 106 KB file containing all table types. Workers cannot import from `services/api` without creating a service-to-service dependency.                                                              | Workers defines its own minimal `services/workers/src/db/types.ts` covering only the tables it writes, matching the same SQL migrations.                                                           |
| E-DRIFT-004 | `services/api/src/repositories/providerRepository.ts` exists but CU-046 needs connection-management queries not yet present.                                                                                                         | CU-046 extends `providerRepository.ts` with the new query methods; it does not replace it.                                                                                                         |
| E-DRIFT-005 | Migration 000003 seeds `provider_metric_mappings` with 15 rows at `verification_status = 'unverified'`. The `google_health_feature_parity_items` table mentioned in Data Model V1.1 §27.2 has not been migrated yet.                 | CU-034 creates the documentation artifact; the `google_health_feature_parity_items` DB table is a Phase Z / Phase AA concern unless future CUs specifically need it. Create an ADR task if needed. |
| E-DRIFT-006 | The spec's CU-036 mentions `database/fixtures/generated/raw/` as the local archive output path. The fixture policy requires subdirectories under `database/fixtures/provider/`.                                                      | Local dev archive writes to a gitignored temp path (e.g., `database/fixtures/.local-dev-archive/`) to avoid polluting the committed fixture structure. Add this path to `.gitignore`.              |
| E-DRIFT-007 | `@primis/config`'s `BackendEnv` Zod schema likely needs new env vars for Phase E (e.g., `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, spike script vars). These env vars are already in `.env.example` as `PLACEHOLDER`. | CU-037 extends `BackendEnv` in `@primis/config` to add typed Google Health OAuth env vars if not already present. Check `packages/config/src/env.ts` before implementing.                          |

---

## 3. Required Source Documents and Sections

Executing agents must read these sections before implementing each CU. Sections are ordered by source priority.

| Document                                                                 | Sections                                                                                                                                                                                                                                                                       | Relevant to                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `docs/source-of-truth/primis_full_implementation_spec_commit_plan.md`    | §1–§3.5 (principles, CU contract, DoD), §5 Phase Overview, Phase E CU-034–CU-046 in full                                                                                                                                                                                       | All CUs                                                                    |
| `docs/source-of-truth/primis_mvp_build_plan_milestones.md`               | §0 (agent instructions), §0.5 (health-data-model-first), §7 M1, §10 M4                                                                                                                                                                                                         | CU-034, CU-037, CU-039, CU-040, CU-041, CU-045                             |
| `docs/source-of-truth/primis_technical_architecture_document.md`         | §0 (agent instructions), §3.1 (Google constraints), §9.2 (app auth vs provider auth separation), §10.1–10.3 (provider connector, capability model, Google connector), §11.3 (raw payload S3 pattern), §13 (event taxonomy), §14 (sync pipeline), §22 (security/token handling) | CU-035, CU-036, CU-037, CU-038, CU-039, CU-044, CU-045, CU-046             |
| `docs/source-of-truth/primis_data_model_health_metric_schema.md`         | §0, §5.4 (sensitivity), §8 (provider tables — full), §9 (metric_definitions), §10.2 (`metric_observations` — full), §20 (provider mapping matrix), §21 (source reconciliation), §22 (data quality enum), §27 (security by table), §28 (testing), V1.1 §27.1–27.9               | CU-035, CU-041, CU-042, CU-043, CU-044, CU-045, CU-046                     |
| `docs/source-of-truth/primis_google_health_api_feature_parity_matrix.md` | Full doc (classification enum, validation status enum, 38-row matrix, §4 live-validation rules)                                                                                                                                                                                | CU-034, CU-042, CU-043                                                     |
| `docs/source-of-truth/primis_product_requirements_document.md`           | §10.3 (Google Health sync requirements), §10.4 (API spike), §13 (backend OAuth token storage), PRD-FR-GH-001–009, PRD-BE-002, PRD-BE-003, PRD-BE-009, PRD-SEC-001, PRD-SEC-006                                                                                                 | CU-037, CU-038, CU-046                                                     |
| `docs/source-of-truth/primis_ai_context_engine_spec.md`                  | §0 (agent instructions), §19.3, §23.2 (safe logging rules only)                                                                                                                                                                                                                | Phase-level guardrails; not a primary source for any single CU             |
| `docs/source-of-truth/primis_scoring_algorithms_spec.md`                 | §8 (data quality/missingness — data quality score, missing reasons, ScoreQualityMetadata) — concepts only                                                                                                                                                                      | CU-044 (do not implement scoring; understand data quality metadata fields) |
| `docs/decisions/ADR-001-provider-code-naming.md`                         | Full doc                                                                                                                                                                                                                                                                       | All CUs referencing a provider code                                        |
| `docs/decisions/ADR-003-query-layer-and-migrations.md`                   | Full doc                                                                                                                                                                                                                                                                       | CU-035 (workers DB layer), CU-044, CU-045                                  |
| `database/fixtures/README.md`                                            | Full doc                                                                                                                                                                                                                                                                       | CU-036, CU-042, CU-043 (fixture creation)                                  |
| `tests/README.md`                                                        | Full doc                                                                                                                                                                                                                                                                       | All CUs with tests                                                         |

---

## 4. Dependency Graph

```
CU-034 (docs only)
  │
  └─→ CU-035 (workers bootstrap + connector interface + core-types/providers.ts)
           │
           ├─→ CU-036 (raw payload archive abstraction)
           │
           ├─→ CU-037 (Google Health OAuth skeleton + api-contracts + api route stub)
           │       │
           │       └─→ CU-038 (token secret reference adapter — api + workers)
           │
           └─→ CU-039 (Google Health API client wrappers — injected fetch)
                   │
                   ├─→ CU-040 (spike script: mock mode now, live mode ready)
                   │      │  (also depends on CU-036 for archive)
                   │      │
                   │      └─→ CU-041 (normalization pipeline core — NormalizedRecord types)
                   │               │
                   │               ├─→ CU-042 (activity + vitals normalizers + fixtures)
                   │               │
                   │               └─→ CU-043 (sleep + workout normalizers + fixtures)
                   │                       │
                   │                       └─→ CU-044 (idempotent normalized record writer)
                   │                               │
                   │                               └─→ CU-045 (local sync job runner)
                   │                                       │
                   │                                       └─→ CU-046 (provider connection
                   │                                                    + sync API endpoints)
                   │
                   └─→ (CU-040 also depends on CU-039)
```

**Mandatory execution order:** CU-034 → 035 → 036 → 037 → 038 → 039 → 040 → 041 → 042 → 043 → 044 → 045 → 046.

No parallelism is safe between adjacent CUs. Each CU imports types or extends files from the prior CU.

---

## 5. Commit Units

---

### CU-034 — Create Google Health Availability Matrix Scaffold

**Commit message:** `docs: add Google Health availability matrix scaffold (CU-034)`

**Branch:** `cu/cu-034-google-health-availability-matrix`

---

#### Goal

Create the documentation artifact that will be filled with live validation data in Phase Z / Phase AA. Explicitly mark proprietary provider scores as `unverified`. Create the spike README so later CUs can reference it.

#### Docs and Sections to Read

- `primis_full_implementation_spec_commit_plan.md` — Phase E CU-034 definition
- `primis_mvp_build_plan_milestones.md` — §7 M1 in full (metric availability matrix template)
- `primis_google_health_api_feature_parity_matrix.md` — full doc (classification enum, 38-row matrix)
- `primis_technical_architecture_document.md` — §3.1 Google Health API constraints, §10.3.2 Phase 0 data-availability spike

#### Existing Repo Files to Build On

- `docs/decisions/` directory (where the matrix will live)
- `scripts/.gitkeep` (scripts directory exists)
- `primis_mvp_build_plan_milestones.md §7.5` — exact column template for the matrix

#### Files Created or Edited

```
docs/decisions/google-health-api-metric-availability.md   [CREATE]
scripts/google-health-spike/README.md                     [CREATE]
scripts/google-health-spike/.gitkeep                      [CREATE — makes git track the dir]
```

#### In-Scope Work

1. Create `docs/decisions/google-health-api-metric-availability.md`:
   - Columns: Canonical metric code | Google data type | Scope | Operation | Available? | Sample fixture path | Validation status | Notes
   - All rows for the 15 seed mappings from migration 000003 plus the additional metrics from the MVP plan §7.5 matrix
   - Provider scores (`provider_sleep_score`, `provider_readiness_score`, `provider_cardio_load`) explicitly marked `Available?: NO/unverified` with note: "Proprietary Google/Fitbit score; not exposed as a first-class API object per EXT-GOOGLE-004. Primis will derive its own equivalent. Do not mark available until Phase AA live validation confirms otherwise."
   - A preamble stating: "This document is filled manually during Phase Z live validation. Until Phase AA acceptance criteria are met, all rows with 'TBD' or 'unverified' must NOT be used as a guarantee of metric availability in scoring or dashboard logic."
   - Reference to `primis_google_health_api_feature_parity_matrix.md` for classification/validation status enums
   - Reference to `database/fixtures/provider/google_health/` for fixture paths (currently empty; will be populated in Phase Z)
2. Create `scripts/google-health-spike/README.md`:
   - Documents what the spike script does (created in CU-040)
   - Documents required env vars for live mode (`GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, `GOOGLE_HEALTH_TEST_REFRESH_TOKEN`)
   - Documents mock mode usage
   - States: "Live mode must not be run in CI or automated tests. Live mode requires real credentials in `.env` (never committed)."

#### Out-of-Scope Work

- Any TypeScript code.
- Real fixture data or sample payloads.
- Marking any metric `verified` or `available`.
- Creating the spike script itself (CU-040).

#### Acceptance Criteria

- [ ] `docs/decisions/google-health-api-metric-availability.md` exists and passes `pnpm format:check`.
- [ ] Provider scores (`sleep_score`, `readiness_score`, `cardio_load`) have an explicit `unverified` / `NO` marker with a note explaining they are proprietary.
- [ ] All 15 seeded mappings from migration 000003 have corresponding rows.
- [ ] Additional metrics from MVP plan §7.5 table (`VO2 max`, `weight`, `body_fat`, `food`, `hydration`, `respiratory_rate`, `SpO2`, `floors`, `active_zone_minutes`, `heart_rate`) have rows with `Available?: TBD`.
- [ ] `scripts/google-health-spike/README.md` exists and documents env var requirements.
- [ ] No actual provider data is committed.

#### Verification Commands

```bash
pnpm format:check
```

#### Likely Pitfalls

- Do not conflate the classification enum from `primis_google_health_api_feature_parity_matrix.md` with availability status. They are separate columns.
- The 15 migration seeds cover only a subset of target metrics. The full matrix should include all metrics from MVP plan §7.5.

#### Questions Before Implementation

None — this is documentation-only work.

---

### CU-035 — Add Provider Connector Interface Package

**Commit message:** `providers: add health provider connector interface (CU-035)`

**Branch:** `cu/cu-035-provider-connector-interface`

---

#### Goal

Bootstrap `services/workers` as a real pnpm package (`@primis/workers`), define the provider-agnostic connector interface, create minimal workers DB client scaffold, and add shared connector-capability types to `@primis/core-types`.

#### Docs and Sections to Read

- `primis_full_implementation_spec_commit_plan.md` — Phase E CU-035 definition
- `primis_technical_architecture_document.md` — §10.1 (provider connector pattern full), §10.2 (provider capability model full)
- `primis_mvp_build_plan_milestones.md` — §10.3 (connector interface definition)
- `primis_data_model_health_metric_schema.md` — §8 provider tables (understand what workers reads/writes)
- `docs/decisions/ADR-001-provider-code-naming.md`
- `docs/decisions/ADR-003-query-layer-and-migrations.md`

#### Existing Repo Files to Build On

- `services/api/src/db/client.ts` — copy pattern for workers DB client
- `services/api/package.json` — copy dependency pattern
- `packages/core-types/src/provider.ts` — existing provider code types (do not edit; add new file)
- `packages/core-types/src/index.ts` — must add new export
- `tsconfig.base.json` — all packages extend this
- `vitest.workspace.ts` — auto-discovers `vitest.config.ts`

#### Files Created or Edited

```
services/workers/package.json                               [CREATE — @primis/workers]
services/workers/tsconfig.json                              [CREATE — extends ../../tsconfig.base.json]
services/workers/vitest.config.ts                           [CREATE — Vitest config for workers]
services/workers/src/index.ts                               [CREATE — placeholder export]
services/workers/src/db/client.ts                           [CREATE — Kysely + pg.Pool for workers]
services/workers/src/db/types.ts                            [CREATE — minimal table types for tables workers writes]
services/workers/src/providers/HealthProviderConnector.ts   [CREATE — provider-agnostic interface]
services/workers/src/providers/types.ts                     [CREATE — shared provider I/O types]
services/workers/src/providers/FakeHealthProviderConnector.ts  [CREATE — test double]
services/workers/test/providers/HealthProviderConnector.test.ts  [CREATE — interface shape tests]
packages/core-types/src/providers.ts                        [CREATE — ProviderCapabilities, ProviderCapabilityMetric]
packages/core-types/src/index.ts                            [EDIT — add export for providers.ts]
services/workers/.gitkeep                                   [DELETE]
```

#### In-Scope Work

1. **Bootstrap `services/workers`**:
   - `package.json`: name `@primis/workers`, deps include `@primis/core-types workspace:*`, `@primis/health-metrics workspace:*`, `@primis/config workspace:*`, `kysely`, `pg`, `@types/pg`; devDeps include `vitest`, `typescript`
   - `tsconfig.json`: extends `../../tsconfig.base.json`, strict, `moduleResolution: bundler`
   - `vitest.config.ts`: standard Vitest config (see `packages/core-types/vitest.config.ts` as pattern)
   - `src/index.ts`: placeholder `export {};`
   - `src/db/client.ts`: Kysely + `pg.Pool` factory; reads `DATABASE_URL` via `loadBackendEnv()` from `@primis/config`. Do not import from `services/api`.
   - `src/db/types.ts`: Minimal `Database` interface covering only the tables workers reads/writes: `provider_connections`, `provider_data_availability`, `provider_sync_jobs`, `provider_sync_cursors`, `raw_provider_payloads`, `metric_observations`, `metric_timeseries_samples`, `sleep_sessions`, `sleep_stage_intervals`, `workout_sessions`, `users`. Table shapes must match migrations 000003–000005 exactly (use the same column type aliases as `services/api/src/db/types.ts`).

2. **`packages/core-types/src/providers.ts`** (new file — note plural filename):
   - `ProviderCapabilityMetric`: `{ metricType: string; access: 'read' | 'write' | 'read_write'; granularity: 'raw' | 'session' | 'daily' | 'summary'; historicalDepth?: string; verified: boolean; notes?: string; }`
   - `ProviderCapabilities`: `{ providerCode: ProviderCode; metrics: ProviderCapabilityMetric[]; supportsWebhooks: boolean; supportsIncrementalSync: boolean; requiresMobileLocalAccess: boolean; }`
   - `SyncWindowStrategy`: `'initial_backfill' | 'daily_incremental' | 'recent_refresh' | 'weekly_reconciliation' | 'manual_refresh'`
   - `SyncWindow`: `{ strategy: SyncWindowStrategy; startUtc: Date; endUtc: Date; }`
   - Source: TAD §10.2 capability model

3. **`services/workers/src/providers/types.ts`**:
   - `AuthStartResult`: `{ authorizeUrl: string; state: string; }`
   - `OAuthCallbackParams`: `{ code: string; state: string; redirectUri: string; }`
   - `TokenExchangeResult`: `{ accessTokenRef: string; refreshTokenRef: string; expiresAt: Date | null; scopesGranted: string[]; externalAccountId: string; }`
   - `ProviderSyncResult`: `{ jobId: string; recordsFetched: number; recordsNormalized: number; payloadsArchived: number; status: SyncJobStatus; errors: ProviderSyncError[]; }`
   - `ProviderSyncError`: `{ code: string; message: string; dataType?: string; }`
   - `RawProviderPayload`: `{ providerCode: ProviderCode; dataType: string; data: unknown; fetchedAt: Date; windowStart: Date; windowEnd: Date; }`
   - **Important:** `TokenExchangeResult` stores `*Ref` strings (Secrets Manager ARN-shaped references), NOT raw token values. See ADR-001 and migration 000003 comments.

4. **`services/workers/src/providers/HealthProviderConnector.ts`**:
   - Interface based on TAD §10.1 and MVP plan §10.3:
     ```ts
     interface HealthProviderConnector {
       readonly providerCode: ProviderCode;
       startAuthorization(userId: string, requestedScopes: string[]): Promise<AuthStartResult>;
       completeAuthorization(
         userId: string,
         params: OAuthCallbackParams,
       ): Promise<TokenExchangeResult>;
       refreshConnection(connectionId: string): Promise<void>;
       syncWindow(connectionId: string, window: SyncWindow): Promise<ProviderSyncResult>;
       revokeConnection(connectionId: string): Promise<void>;
       listCapabilities(): ProviderCapabilities;
     }
     ```
   - No Google-specific parameters, types, or fields in the interface.
   - Include a `ProviderConnectorError` class with `code: string` and optional `retryable: boolean`.

5. **`services/workers/src/providers/FakeHealthProviderConnector.ts`**:
   - Implements `HealthProviderConnector` with deterministic in-memory behavior.
   - `startAuthorization` returns a predictable URL.
   - `syncWindow` returns a `ProviderSyncResult` with zero records and `status: 'succeeded'` by default; configurable via constructor option.
   - Used in tests for CU-045.

6. **Test**: verify `FakeHealthProviderConnector` satisfies the `HealthProviderConnector` interface (TypeScript compile-only test is sufficient for the interface contract).

7. **Update `packages/core-types/src/index.ts`** to add: `export * from './providers.js';`

#### Out-of-Scope Work

- Google-specific connector implementation (CU-037, CU-039).
- Raw payload archive (CU-036).
- Any DB writes (CU-044+).
- Token secret adapter (CU-038).

#### Acceptance Criteria

- [ ] `pnpm --filter @primis/workers typecheck` passes.
- [ ] `pnpm --filter @primis/workers test` passes.
- [ ] `pnpm --filter @primis/core-types typecheck` passes after the `providers.ts` addition.
- [ ] `FakeHealthProviderConnector` implements `HealthProviderConnector` with no TypeScript errors.
- [ ] Workers `db/types.ts` column types match migrations 000003–000005 (manually reviewed).
- [ ] No Google-specific names in `HealthProviderConnector.ts` interface.
- [ ] `TokenExchangeResult` fields are named `*Ref` (not `accessToken`/`refreshToken`).
- [ ] `pnpm test` passes from repo root.

#### Verification Commands

```bash
pnpm install
pnpm --filter @primis/workers typecheck
pnpm --filter @primis/workers test
pnpm --filter @primis/core-types typecheck
pnpm lint && pnpm typecheck && pnpm test && pnpm format:check
```

#### Likely Pitfalls

- **E-DRIFT-002**: The new file is `providers.ts` (plural). The existing `provider.ts` (singular) remains unchanged. Do not rename or merge them. Add `export * from './providers.js'` to `core-types/src/index.ts`.
- **E-DRIFT-003**: Do not import from `services/api`. Workers `db/types.ts` is a separate, manually-maintained file. Copy only the type structure (column aliases, table interfaces) — not the entire 106 KB file.
- **E-DRIFT-007**: `BackendEnv` in `@primis/config` may not yet have `GOOGLE_HEALTH_CLIENT_ID` typed. Check `packages/config/src/env.ts`. If the var is missing from the Zod schema, add it (with `z.string().default('PLACEHOLDER')`) in this CU.
- The `exactOptionalPropertyTypes: true` TS setting means interface methods must use `param?: Type` consistently; `undefined` union on optional params may need to be explicit.
- Workers `db/client.ts` must **not** auto-create a pool at module load time. Use a factory function so tests can bypass it (same pattern as `services/api/src/db/client.ts`).

#### Questions Before Implementation

None — sufficient context exists.

---

### CU-036 — Add Local Raw Payload Storage Abstraction

**Commit message:** `storage: add raw payload archive abstraction (CU-036)`

**Branch:** `cu/cu-036-raw-payload-archive`

---

#### Goal

Create a storage abstraction for raw provider payloads that works locally without AWS credentials, records S3-shaped metadata, and prepares a shell S3 implementation for Phase Z.

#### Docs and Sections to Read

- `primis_full_implementation_spec_commit_plan.md` — Phase E CU-036 definition
- `primis_technical_architecture_document.md` — §11.3 (raw payload S3 path pattern full), §22.1–22.4 (security/encryption)
- `primis_data_model_health_metric_schema.md` — §8.7 (`raw_provider_payloads` table full), §5.4 (data sensitivity)
- `database/fixtures/README.md` — fixture policy, sensitivity levels

#### Existing Repo Files to Build On

- `packages/core-types/src/redaction.ts` — `redactFixture()`, `SENSITIVE_FIELD_PATTERNS` (used to validate no tokens in payload before archiving)
- `services/workers/src/providers/types.ts` — `RawProviderPayload` (from CU-035)
- `services/workers/src/db/` — for future metadata insert (not wired in this CU)

#### Files Created or Edited

```
services/workers/src/storage/RawPayloadArchive.ts          [CREATE — interface]
services/workers/src/storage/LocalRawPayloadArchive.ts      [CREATE — writes to local gitignored path]
services/workers/src/storage/S3RawPayloadArchive.ts         [CREATE — shell, throws NotImplementedError]
services/workers/src/storage/archiveUtils.ts                [CREATE — SHA-256, gzip helpers]
services/workers/test/storage/LocalRawPayloadArchive.test.ts  [CREATE]
.gitignore                                                  [EDIT — add database/fixtures/.local-dev-archive/]
```

#### In-Scope Work

1. **`RawPayloadArchive` interface**:

   ```ts
   interface ArchiveResult {
     s3Bucket: string;
     s3Key: string;
     contentSha256: string;
     compressed: boolean;
     recordCount: number;
     payloadStartTimeUtc: Date;
     payloadEndTimeUtc: Date;
   }
   interface RawPayloadArchive {
     store(
       payload: RawProviderPayload,
       userId: string,
       connectionId: string | null,
     ): Promise<ArchiveResult>;
   }
   ```

   S3 key must follow the pattern from TAD §11.3: `provider={code}/user_id={id}/data_type={type}/year={yyyy}/month={mm}/day={dd}/{payloadId}.json.gz`

2. **`LocalRawPayloadArchive`**:
   - Writes gzip JSON to `database/fixtures/.local-dev-archive/` (gitignored; creates dir if needed)
   - Returns a fake `s3Bucket: 'local-dev'` and the constructed local path as `s3Key`
   - Computes `contentSha256` using Node `crypto.createHash('sha256')` before gzip
   - **MUST call `redactFixture()` on the payload before writing** to ensure no tokens are archived locally even in dev
   - Records `recordCount` if `payload.data` is an array; otherwise 1

3. **`S3RawPayloadArchive`**:
   - Constructor accepts `{ bucket: string; region: string; kmsKeyId?: string }`
   - `store()` throws `new Error('S3RawPayloadArchive: not implemented in Phase E. Configure for Phase Z with real AWS credentials.')` with a clear message
   - **Must NOT import `@aws-sdk/client-s3`** in Phase E — do not add the dependency yet; defer to Phase Z

4. **`archiveUtils.ts`**:
   - `computeSha256(data: string): string` — pure, uses Node crypto
   - `gzipJson(data: unknown): Buffer` — pure, uses Node zlib

5. **Tests** (`LocalRawPayloadArchive.test.ts`):
   - Verify `store()` writes a file to the temp path
   - Verify `contentSha256` matches the uncompressed JSON content
   - Verify the stored file is valid gzip
   - Verify that a payload containing a `refresh_token` field is redacted before writing (use `SENSITIVE_FIELD_PATTERNS`)
   - **No real AWS credentials needed** — `S3RawPayloadArchive` is not tested beyond type-checking in this CU

6. **`.gitignore`**: add `database/fixtures/.local-dev-archive/`

#### Out-of-Scope Work

- Real S3 writes.
- DB `raw_provider_payloads` metadata insert (happens in CU-044).
- AWS SDK installation.

#### Acceptance Criteria

- [ ] `pnpm --filter @primis/workers typecheck` passes.
- [ ] `pnpm --filter @primis/workers test` passes including `LocalRawPayloadArchive.test.ts`.
- [ ] `S3RawPayloadArchive` compiles but throws a clear `NotImplementedError`-style message on `store()`.
- [ ] Test verifies that `refresh_token` fields are redacted before the payload is written locally.
- [ ] `database/fixtures/.local-dev-archive/` is in `.gitignore`.
- [ ] No `@aws-sdk/*` package is added to any `package.json`.

#### Verification Commands

```bash
pnpm install
pnpm --filter @primis/workers typecheck
pnpm --filter @primis/workers test
pnpm lint && pnpm format:check
```

#### Likely Pitfalls

- **E-DRIFT-006**: Do not write local dev archives under `database/fixtures/provider/` (the committed fixture directory). Use the gitignored `.local-dev-archive/` path.
- `gzip` in Node is callback-based; use `util.promisify(zlib.gzip)` or the `pipeline` API with a writable stream.
- `redactFixture()` from `@primis/core-types` operates on a JSON-parsed object, not a raw string. Call `JSON.parse()` then `redactFixture()` then `JSON.stringify()` before gzip.
- SHA-256 must be computed on the raw JSON string (before gzip), matching the `raw_provider_payloads.content_sha256` column intent.

#### Questions Before Implementation

None.

---

### CU-037 — Add Google Health Connector OAuth Skeleton

**Commit message:** `providers: add Google Health OAuth connector skeleton (CU-037)`

**Branch:** `cu/cu-037-google-health-oauth-skeleton`

---

#### Goal

Implement the shape of Google Health OAuth — authorization URL generation, callback handling — without real credentials. Keep app authentication (Cognito) and Google Health authorization strictly separate. Expose two placeholder API endpoints.

#### Docs and Sections to Read

- `primis_full_implementation_spec_commit_plan.md` — Phase E CU-037 definition
- `primis_technical_architecture_document.md` — §9.2 (app auth vs health provider authorization separation CRITICAL), §10.3.1 (Google Health connector responsibilities)
- `primis_product_requirements_document.md` — §10.3 Google Health sync requirements, PRD-FR-GH-001–002, PRD-BE-002–003
- `primis_data_model_health_metric_schema.md` — §8.2 `provider_connections` table (token_secret_ref columns)
- `packages/config/src/env.ts` — check current BackendEnv fields before extending
- `services/api/src/app.ts` — route registration pattern

#### Existing Repo Files to Build On

- `services/workers/src/providers/HealthProviderConnector.ts` (CU-035) — implement this interface
- `services/workers/src/providers/types.ts` (CU-035) — `AuthStartResult`, `OAuthCallbackParams`, `TokenExchangeResult`
- `packages/core-types/src/providers.ts` (CU-035) — `ProviderCapabilities`
- `packages/api-contracts/src/` — envelope helpers
- `services/api/src/auth/authMiddleware.ts` — apply to new routes
- `services/api/src/repositories/providerRepository.ts` — existing repo to extend

#### Files Created or Edited

```
services/workers/src/providers/google/GoogleHealthConnector.ts      [CREATE]
services/workers/src/providers/google/googleHealthConfig.ts         [CREATE — config type/factory]
services/workers/src/providers/google/types.ts                      [CREATE — Google-specific raw types]
services/workers/test/providers/google/GoogleHealthConnector.test.ts  [CREATE]
packages/api-contracts/src/providerConnections.ts                   [CREATE — OAuth/connection DTOs]
services/api/src/routes/providerConnections.ts                      [CREATE — route handler stub]
services/api/src/db/types.ts                                        [NO CHANGE — all tables already present]
packages/config/src/env.ts                                          [EDIT IF NEEDED — add Google OAuth env vars]
services/api/src/app.ts                                             [EDIT — register providerConnectionsRouter]
```

#### In-Scope Work

1. **`packages/api-contracts/src/providerConnections.ts`** (new DTOs):
   - `InitiateConnectionRequestDto` / `InitiateConnectionRequestDtoSchema`: `{ providerCode: ProviderCode; redirectUri: string; }`
   - `InitiateConnectionResponseDto` / `InitiateConnectionResponseDtoSchema`: `{ authorizeUrl: string; state: string; }`
   - `OAuthCallbackQueryDto` / `OAuthCallbackQueryDtoSchema`: `{ code: string; state: string; }`
   - `ProviderConnectionDto` / `ProviderConnectionDtoSchema`: `{ id: string; providerCode: string; status: ConnectionStatus; displayName: string | null; scopesGranted: string[]; lastSuccessfulSyncAt: string | null; createdAt: string; }`
   - Export from `packages/api-contracts/src/index.ts`

2. **`services/workers/src/providers/google/googleHealthConfig.ts`**:
   - `GoogleHealthOAuthConfig`: `{ clientId: string; clientSecret: string; redirectUri: string; scopes: string[]; }`
   - `GOOGLE_HEALTH_SCOPES`: array of required OAuth scope strings (sourced from TAD §3.1 / PRD §10.3 — `activity_and_fitness`, `sleep`, `health_metrics_and_measurements` etc.)
   - `createGoogleHealthConfigFromEnv(env: BackendEnv): GoogleHealthOAuthConfig` — reads from `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`

3. **`services/workers/src/providers/google/types.ts`**:
   - `GoogleOAuthTokenResponse`: raw token exchange response shape
   - `GoogleHealthScope`: string literal union for the three primary scopes
   - **No implementation logic** — types only

4. **`services/workers/src/providers/google/GoogleHealthConnector.ts`**:
   - Implements `HealthProviderConnector` interface
   - Constructor accepts: `config: GoogleHealthOAuthConfig`, `httpClient: typeof fetch` (injected — default to global `fetch` in production, mock in tests)
   - `startAuthorization()`: builds Google OAuth authorize URL with PKCE state, returns `AuthStartResult`
   - `completeAuthorization()`: calls token exchange endpoint via injected `httpClient`; returns `TokenExchangeResult` with `*Ref` strings set to `'LOCAL_DEV_PLACEHOLDER'` in dev (CU-038 will wire real refs)
   - `refreshConnection()`: stub that throws `ProviderConnectorError` with `code: 'not_implemented'` and `retryable: false` — **must not attempt a real HTTP call**
   - `syncWindow()`: stub that returns empty `ProviderSyncResult` with `status: 'succeeded'` — the real implementation is in CU-039
   - `revokeConnection()`: stub
   - `listCapabilities()`: returns capabilities based on `GOOGLE_HEALTH_SCOPES` with all metrics `verified: false`
   - **App auth vs Google Health auth separation**: add a JSDoc comment at the class level and in `startAuthorization()` explicitly stating: "This authorizes access to Google Health data. It is separate from Cognito app authentication. A user can be logged in to Primis (Cognito auth) without having connected Google Health data (this authorization)."

5. **`services/api/src/routes/providerConnections.ts`** (route stub):
   - `POST /api/v1/me/providers/:providerCode/connect` — validates request body, calls `GoogleHealthConnector.startAuthorization()` via injected connector, returns `InitiateConnectionResponseDto`
   - `GET /api/v1/me/providers/oauth/callback` — validates query params, calls `completeAuthorization()`, upserts `provider_connections` row via `providerRepository`; returns success or redirect
   - Both endpoints protected by `authMiddleware`
   - Connector is injected (not hard-coded) for testability — use a simple factory pattern or pass connector as Hono context binding

6. **Register route** in `services/api/src/app.ts`: `app.route('/api/v1/me/providers', providerConnectionsRouter);`

7. **Tests**:
   - `GoogleHealthConnector.test.ts`: mock `httpClient`; verify `startAuthorization()` builds a URL with `client_id`, `redirect_uri`, `scope`, `state`; verify `completeAuthorization()` parses a mocked token response; verify injected HTTP client is called with the correct URL
   - Route integration test (Hono `app.request()`): verify the routes exist and return expected shapes with mock connector

8. **Config extension**: if `BackendEnv` in `packages/config/src/env.ts` does not already include `GOOGLE_HEALTH_CLIENT_ID` and `GOOGLE_HEALTH_CLIENT_SECRET` as typed fields, add them as `z.string().default('PLACEHOLDER')`.

#### Out-of-Scope Work

- Token secret storage (CU-038) — in this CU, `*Ref` values are `'LOCAL_DEV_PLACEHOLDER'`.
- Real HTTP calls in tests — all network calls use injected mock `httpClient`.
- Real `provider_connections` DB writes (CU-046 wires up the full endpoint; CU-037 creates the shape only with a partial repository call).
- Webhook/push notification handling.

#### Acceptance Criteria

- [ ] `pnpm --filter @primis/workers typecheck` passes.
- [ ] `pnpm --filter @primis/api typecheck` passes.
- [ ] `pnpm --filter @primis/workers test` passes including `GoogleHealthConnector.test.ts`.
- [ ] `pnpm --filter @primis/api test` passes including the new route tests.
- [ ] `GoogleHealthConnector` compiles as a valid implementation of `HealthProviderConnector`.
- [ ] No `fetch()` call or HTTP client call in `GoogleHealthConnector` without the injected `httpClient`.
- [ ] The class-level JSDoc for `GoogleHealthConnector` explicitly states the app auth / Google Health auth separation.
- [ ] `POST /api/v1/me/providers/:providerCode/connect` and `GET /api/v1/me/providers/oauth/callback` are registered in the app and require auth.

#### Verification Commands

```bash
pnpm install
pnpm --filter @primis/workers typecheck
pnpm --filter @primis/api typecheck
pnpm --filter @primis/workers test
pnpm --filter @primis/api test
pnpm lint && pnpm typecheck && pnpm test && pnpm format:check
```

#### Likely Pitfalls

- **App auth vs Google Health auth** is a critical separation. Google OAuth for health data uses `accounts.google.com/o/oauth2/v2/auth` with health-specific scopes. Cognito is separate. Never pass Cognito tokens to Google or vice versa.
- `PKCE / state` parameter: generate a random `state` string to prevent CSRF; store in session or return to mobile for round-trip validation. Since sessions don't exist yet, the state can be a signed JWT or just passed through for mobile to validate. Document the approach clearly.
- Google scopes include `https://www.googleapis.com/auth/` prefixes. Use the exact scope strings from the Google Health API docs (referenced in TAD §3.1 and MVP plan §7.2). Do not invent scope strings.
- Token exchange response from Google includes `token_type`, `expires_in`, `scope` (not `expires_at`). Compute `expiresAt` from `expires_in` at exchange time.

#### Questions Before Implementation

None blocking; document approach to PKCE state management in the implementation.

---

### CU-038 — Add Provider Token Secret Reference Adapter

**Commit message:** `security: add provider token secret reference adapter (CU-038)`

**Branch:** `cu/cu-038-token-secret-reference-adapter`

---

#### Goal

Ensure that provider OAuth tokens are never stored as raw strings in the database or logs. Create an injectable `SecretStore` abstraction with a local (dev/test) implementation and an AWS Secrets Manager shell.

#### Docs and Sections to Read

- `primis_full_implementation_spec_commit_plan.md` — Phase E CU-038 definition
- `primis_technical_architecture_document.md` — §22.2 (token security full), §22.1 (security baseline), §8.2–8.3 (config loading from Secrets Manager)
- `primis_data_model_health_metric_schema.md` — §8.2 `provider_connections` (`access_token_secret_ref`, `refresh_token_secret_ref` columns — ARN-format refs only)
- `database/migrations/000003_provider_sync.sql` — read the SECURITY comment at the top of the migration

#### Existing Repo Files to Build On

- `services/workers/src/providers/google/GoogleHealthConnector.ts` (CU-037) — wire `SecretStore` here
- `services/api/src/repositories/providerRepository.ts` — the repository that writes `provider_connections`

#### Files Created or Edited

```
services/api/src/security/SecretStore.ts           [CREATE — shared interface]
services/api/src/security/LocalSecretStore.ts       [CREATE — in-memory, dev/test only]
services/api/src/security/AwsSecretsManagerStore.ts [CREATE — shell, throws on use without real config]
services/workers/src/security/SecretStore.ts        [CREATE — re-export or copy of the interface]
services/workers/src/security/LocalSecretStore.ts   [CREATE — same local implementation]
services/api/src/security/index.ts                  [CREATE — barrel export]
services/workers/src/security/index.ts              [CREATE — barrel export]
services/workers/src/providers/google/GoogleHealthConnector.ts  [EDIT — inject SecretStore, store real refs]
services/api/src/routes/providerConnections.ts      [EDIT — inject SecretStore into connector factory]
services/api/test/security/LocalSecretStore.test.ts [CREATE]
```

#### In-Scope Work

1. **`SecretStore` interface** (in both `services/api/src/security/` and `services/workers/src/security/`):

   ```ts
   interface SecretStore {
     /** Store a secret value; returns an opaque reference string (ARN in production). */
     storeSecret(logicalKey: string, value: string): Promise<string>;
     /** Retrieve a secret value by its reference string. */
     getSecret(ref: string): Promise<string>;
     /** Delete a secret by its reference string. */
     deleteSecret(ref: string): Promise<void>;
   }
   ```
   - `logicalKey` is the namespaced key, e.g. `primis/providers/google_health/{userId}/refresh_token`
   - `storeSecret` returns the reference (in production: Secrets Manager ARN; in local dev: the key itself)
   - **Critical constraint**: `getSecret` must never appear in logs. Add a JSDoc `@internal` warning and a runtime guard that throws if called in a context where logging is occurring.

2. **`LocalSecretStore`** (dev/test only):
   - Stores in a `Map<string, string>` in memory (not persisted between restarts)
   - `storeSecret(key, value)` returns `key` as the ref
   - `getSecret(ref)` returns the stored value or throws `SecretNotFoundError`
   - Add a `// DEV/TEST ONLY — never use in production` comment banner
   - Add a constructor guard: if `APP_ENV !== 'local' && APP_ENV !== 'test'`, throw a startup error

3. **`AwsSecretsManagerStore`** (shell):
   - Constructor accepts `{ region: string; kmsKeyId?: string }`
   - All three methods throw: `new Error('AwsSecretsManagerStore: not implemented in Phase E. Use in Phase Z with real AWS credentials.')`
   - **Do not import `@aws-sdk/client-secrets-manager`** — defer the dependency to Phase Z

4. **Wire `SecretStore` into `GoogleHealthConnector`**:
   - `GoogleHealthConnector` constructor now accepts `secretStore: SecretStore`
   - `completeAuthorization()` calls `secretStore.storeSecret(...)` for access and refresh tokens; stores the returned refs in `TokenExchangeResult.accessTokenRef` and `.refreshTokenRef`
   - `refreshConnection()` stub calls `secretStore.getSecret(refreshTokenRef)` but still throws `not_implemented` for the actual refresh call

5. **Tests** (`LocalSecretStore.test.ts`):
   - `storeSecret` then `getSecret` round-trip
   - `getSecret` on unknown ref throws `SecretNotFoundError`
   - `deleteSecret` removes the entry
   - Verify `LocalSecretStore` constructor throws in non-local/test env (mock `APP_ENV`)
   - Verify `GoogleHealthConnector.completeAuthorization()` with mock httpClient stores refs (not raw tokens) in `TokenExchangeResult`

6. **Test that `providerRepository.ts` never returns raw token values**:
   - Add a test asserting the `provider_connections` repository methods do not select `access_token_secret_ref` or `refresh_token_secret_ref` columns in their return types (or if they do, that the columns are typed as opaque `string | null` refs, not decoded values)

#### Out-of-Scope Work

- Real AWS Secrets Manager calls.
- KMS key configuration.
- Rotating tokens (Phase Z).
- Sharing the `SecretStore` between api and workers as a package (if needed, create an ADR task — for Phase E, the interface is duplicated for simplicity).

#### Acceptance Criteria

- [ ] `pnpm --filter @primis/api typecheck` passes.
- [ ] `pnpm --filter @primis/workers typecheck` passes.
- [ ] `pnpm --filter @primis/api test` passes including `LocalSecretStore.test.ts`.
- [ ] `LocalSecretStore` throws on construction outside `local`/`test` APP_ENV.
- [ ] `AwsSecretsManagerStore` compiles but all methods throw a clear Phase E placeholder error.
- [ ] `GoogleHealthConnector.completeAuthorization()` with a mock `LocalSecretStore` returns `*Ref` strings, not raw token values.
- [ ] No `@aws-sdk/*` package in any `package.json`.
- [ ] No test asserts a raw OAuth token string as a return value from `GoogleHealthConnector`.

#### Verification Commands

```bash
pnpm install
pnpm --filter @primis/api typecheck
pnpm --filter @primis/workers typecheck
pnpm --filter @primis/api test
pnpm --filter @primis/workers test
pnpm lint && pnpm typecheck && pnpm test && pnpm format:check
```

#### Likely Pitfalls

- The `SecretStore` interface is duplicated between `services/api` and `services/workers` in Phase E. This is intentional to avoid a service-to-service import. If the duplication becomes a maintenance problem, create an ADR task to extract to a shared package in Phase Z.
- Do not accidentally log the `value` argument in `storeSecret`. Add `// NEVER LOG THE VALUE PARAMETER` to the interface docs.
- `LocalSecretStore` must be used in route handler integration tests to avoid requiring real AWS. Inject it via the Hono context or factory.

#### Questions Before Implementation

None.

---

### CU-039 — Add Google Health API Client Wrappers

**Commit message:** `providers: add Google Health API client wrappers (CU-039)`

**Branch:** `cu/cu-039-google-health-api-client`

---

#### Goal

Create type-safe wrappers for Google Health API data type endpoints. All network calls are made through an injected fetch function so tests use mocked HTTP only.

#### Docs and Sections to Read

- `primis_full_implementation_spec_commit_plan.md` — Phase E CU-039 definition
- `primis_technical_architecture_document.md` — §3.1 (Google constraints: rate limits EXT-GOOGLE-002), §10.3 (sync flow, data types)
- `primis_mvp_build_plan_milestones.md` — §7.4 (critical questions M1 must answer), §7.5 (metric availability matrix data types)
- `primis_google_health_api_feature_parity_matrix.md` — Google data type names and scope columns (38-row matrix)

#### Existing Repo Files to Build On

- `services/workers/src/providers/google/GoogleHealthConnector.ts` (CU-037) — `syncWindow()` stub will be wired here
- `services/workers/src/providers/google/types.ts` (CU-037) — Google-specific types file to extend
- `services/workers/src/providers/types.ts` (CU-035) — `RawProviderPayload`
- `services/workers/src/providers/google/googleHealthConfig.ts` (CU-037) — config type

#### Files Created or Edited

```
services/workers/src/providers/google/GoogleHealthApiClient.ts        [CREATE]
services/workers/src/providers/google/dataTypes.ts                    [CREATE — Google data type string constants]
services/workers/src/providers/google/operations.ts                   [CREATE — typed operation wrappers]
services/workers/src/providers/google/types.ts                        [EDIT — add API response shapes]
services/workers/src/providers/google/GoogleHealthConnector.ts        [EDIT — wire real API client into syncWindow()]
services/workers/test/providers/google/GoogleHealthApiClient.test.ts  [CREATE]
```

#### In-Scope Work

1. **`dataTypes.ts`** — string constants for each Google Health data type:

   ```ts
   const GOOGLE_HEALTH_DATA_TYPES = {
     STEPS: 'steps',
     FLOORS: 'floors',
     ACTIVE_ENERGY_BURNED: 'active-energy-burned',
     TOTAL_CALORIES: 'total-calories',
     ACTIVE_ZONE_MINUTES: 'active-zone-minutes',
     TIME_IN_HR_ZONE: 'time-in-heart-rate-zone',
     HEART_RATE: 'heart-rate',
     DAILY_HRV: 'daily-heart-rate-variability',
     DAILY_RHR: 'daily-resting-heart-rate',
     DAILY_SPO2: 'daily-oxygen-saturation',
     DAILY_RESPIRATORY_RATE: 'daily-respiratory-rate',
     SLEEP: 'sleep',
     EXERCISE: 'exercise',
     VO2_MAX: 'vo2-max',
     WEIGHT: 'weight',
     BODY_FAT: 'body-fat',
   } as const;
   type GoogleHealthDataType =
     (typeof GOOGLE_HEALTH_DATA_TYPES)[keyof typeof GOOGLE_HEALTH_DATA_TYPES];
   ```

   Source: `primis_google_health_api_feature_parity_matrix.md` matrix rows (Google data type column).

2. **`types.ts` additions** — Google API response shapes:
   - `GoogleHealthListResponse<T>`: `{ dataPoints: T[]; nextPageToken?: string; }`
   - `GoogleHealthDailyRollupResponse<T>`: `{ rows: T[]; }`
   - `GoogleDataPoint`: base `{ startTimeNanos: string; endTimeNanos: string; value?: Array<{ fpVal?: number; intVal?: number; stringVal?: string; }>; }`
   - `GoogleSleepSession`: shaped from Google Health sleep endpoint (see `primis_mvp_build_plan_milestones.md` V1.1 amendment for sleep field names)
   - `GoogleExerciseSession`: exercise session shape
   - `GoogleHealthError`: `{ code: number; message: string; status: string; }`
   - These are documentation shapes — mark with `// TODO(Phase-AA): verify field names against real payload after M1 validation`

3. **`operations.ts`** — operation types:
   - `DataOperation`: `'list' | 'reconcile' | 'dailyRollup'`
   - `SyncWindowRequest`: `{ dataType: GoogleHealthDataType; operation: DataOperation; startTimeNanos: string; endTimeNanos: string; pageToken?: string; }`
   - `SyncWindowResponse`: `{ dataType: GoogleHealthDataType; rawPayloads: RawProviderPayload[]; nextPageToken?: string; }`

4. **`GoogleHealthApiClient`**:
   - Constructor: `constructor(config: { baseUrl: string; accessToken: string; httpClient: typeof fetch; })`
   - `fetchDataType(req: SyncWindowRequest): Promise<SyncWindowResponse>` — calls appropriate endpoint; handles `dailyRollup` vs `list/reconcile` path differences
   - `handleError(status: number, body: unknown): ProviderConnectorError` — maps 401 → `auth_expired`, 403 → `permission_denied`, 429 → `rate_limited` (retryable), 5xx → `server_error` (retryable)
   - All HTTP calls through injected `httpClient` — **zero real network calls** in Phase E

5. **Wire into `GoogleHealthConnector.syncWindow()`**:
   - Create a `GoogleHealthApiClient` from the `accessToken` (retrieved from `SecretStore` via `getSecret(accessTokenRef)`) and the injected `httpClient`
   - Call `fetchDataType()` for each enabled data type in the sync window
   - Return `ProviderSyncResult` with counts; raw payloads returned for CU-040/CU-041 to process

6. **Tests** (`GoogleHealthApiClient.test.ts`):
   - Mock `httpClient` returning fixture JSON
   - Verify correct URL construction for `list` and `dailyRollup` operations
   - Verify 401 maps to `auth_expired` error
   - Verify 429 maps to `rate_limited` with `retryable: true`
   - Verify pagination: when `nextPageToken` is present, `fetchDataType()` result contains it for the caller to handle

#### Out-of-Scope Work

- Actual pagination loop (caller's responsibility — CU-045 sync runner).
- Writing raw payloads to archive (CU-044/CU-045).
- Normalization (CU-041+).

#### Acceptance Criteria

- [ ] `pnpm --filter @primis/workers typecheck` passes.
- [ ] `pnpm --filter @primis/workers test` passes including `GoogleHealthApiClient.test.ts`.
- [ ] `GOOGLE_HEALTH_DATA_TYPES` constants match the data type names in the feature parity matrix.
- [ ] All 401/403/429/5xx error cases are covered in tests.
- [ ] No real HTTP call is made in any test.
- [ ] `GoogleHealthConnector.syncWindow()` compiles with the API client wired in.

#### Verification Commands

```bash
pnpm --filter @primis/workers typecheck
pnpm --filter @primis/workers test
pnpm lint && pnpm format:check
```

#### Likely Pitfalls

- Google Health API uses nanosecond timestamps (`startTimeNanos`, `endTimeNanos`) — not ISO strings. Convert from `Date` to nanoseconds (`date.getTime() * 1_000_000`) and back.
- The base URL differs between `list` operations (`https://healthconnect.googleapis.com/v1/users/-/...`) and `dailyRollup` operations. Capture these in `dataTypes.ts` as a map.
- Google API returns `fpVal` (float), `intVal` (int), or `stringVal` in `value` arrays. Normalizers (CU-042/CU-043) are responsible for picking the right field.
- Do not invent API endpoint paths. Comment all endpoint paths with `// Source: Google Health API docs — verify in Phase AA` and use TODO markers.

#### Questions Before Implementation

None.

---

### CU-040 — Add Google Health Spike Script (Mock and Live Modes)

**Commit message:** `providers: add Google Health spike script scaffold (CU-040)`

**Branch:** `cu/cu-040-google-health-spike-script`

---

#### Goal

Create a runnable spike script that produces an API availability report. Mock mode works immediately with synthetic fixtures; live mode is ready for Phase Z real-credentials validation but fails clearly when env vars are missing.

#### Docs and Sections to Read

- `primis_full_implementation_spec_commit_plan.md` — Phase E CU-040 definition
- `primis_mvp_build_plan_milestones.md` — §7.4–7.7 (M1 spike requirements, M1-T001–T005)
- `database/fixtures/README.md` — redaction policy for any output files

#### Existing Repo Files to Build On

- `services/workers/src/providers/google/GoogleHealthApiClient.ts` (CU-039)
- `services/workers/src/providers/google/dataTypes.ts` (CU-039)
- `services/workers/src/storage/LocalRawPayloadArchive.ts` (CU-036)
- `scripts/redact-fixture.ts` (Phase B)
- `packages/config/src/env.ts` — env loader pattern

#### Files Created or Edited

```
scripts/google-health-spike/index.ts        [CREATE — main entrypoint]
scripts/google-health-spike/config.ts       [CREATE — mode + env config]
scripts/google-health-spike/mockData.ts     [CREATE — synthetic fixture responses]
scripts/google-health-spike/report.ts       [CREATE — availability report formatter]
scripts/google-health-spike/README.md       [EDIT — fill in script details (created stub in CU-034)]
database/fixtures/provider/google_health/synthetic/  [CREATE directory with .gitkeep]
```

#### In-Scope Work

1. **`config.ts`**:
   - `SpikeMode`: `'mock' | 'live'`
   - `SpikeConfig`: `{ mode: SpikeMode; accessToken?: string; userId: string; windowDays: number; outputDir: string; }`
   - `loadSpikeConfig()`: reads `--mode` CLI arg; in live mode, reads `GOOGLE_HEALTH_TEST_ACCESS_TOKEN` from env; in mock mode, no credentials required
   - **Live mode guard**: if `mode === 'live'` and `GOOGLE_HEALTH_TEST_ACCESS_TOKEN` is missing, print a clear error message and call `process.exit(1)` — never throw a stack trace silently

2. **`mockData.ts`**:
   - Exports synthetic fixture responses for each data type in `GOOGLE_HEALTH_DATA_TYPES`
   - Uses realistic but fake data (see fixture policy: steps: 8200, hrv: 42ms, etc.)
   - Every fixture has `"user_id": "test-user-spike-001"` and timestamps based on a fixed reference date (`2024-01-15T00:00:00Z`)

3. **`report.ts`**:
   - `generateAvailabilityReport(results: SpikeDataTypeResult[]): string` — formats a Markdown table with columns: Data type | HTTP status | Record count | Sample field names | Notes
   - `SpikeDataTypeResult`: `{ dataType: string; status: 'success' | 'error' | 'empty'; recordCount: number; sampleFieldNames: string[]; errorCode?: string; }`

4. **`index.ts`** (main entrypoint):
   - In mock mode: for each data type, call `mockData.ts` to get the fixture, create a `GoogleHealthApiClient` backed by a mock httpClient that returns the fixture, call `fetchDataType()`, archive via `LocalRawPayloadArchive`, collect result
   - In live mode: create a real `GoogleHealthApiClient` with the env access token and real `fetch`; run for the configured window; archive results via `LocalRawPayloadArchive`; **redact before archiving** using `redactFixture()`
   - Generate and print the availability report to stdout
   - Optionally write the report to `outputDir` (default: `scripts/google-health-spike/output/`, gitignored)

5. **Create `database/fixtures/provider/google_health/synthetic/` directory** with a `.gitkeep`

6. **`.gitignore`**: add `scripts/google-health-spike/output/`

7. **Update `scripts/google-health-spike/README.md`** with:
   - Mock mode: `pnpm tsx scripts/google-health-spike/index.ts --mode mock`
   - Live mode: `GOOGLE_HEALTH_TEST_ACCESS_TOKEN=... pnpm tsx scripts/google-health-spike/index.ts --mode live`
   - "Live mode is never run in CI. Store credentials in `.env` (gitignored). Never commit credentials."

#### Out-of-Scope Work

- Real OAuth token acquisition (Phase Z — M1-T001).
- Historical range tests (M1-T003) — script foundation only.
- Provider score validation (M1-T004) — left as a TODO in the script.
- Automated CI execution.

#### Acceptance Criteria

- [ ] `pnpm tsx scripts/google-health-spike/index.ts --mode mock` runs without errors and prints an availability report.
- [ ] Mock mode does not require any env vars beyond `NODE_ENV`.
- [ ] Live mode with missing `GOOGLE_HEALTH_TEST_ACCESS_TOKEN` prints a clear error message and exits with code 1 (not a stack trace).
- [ ] The script does not commit any real credentials or unredacted payloads.
- [ ] Output directory is gitignored.
- [ ] `pnpm format:check` passes.

#### Verification Commands

```bash
pnpm tsx scripts/google-health-spike/index.ts --mode mock
# Verify: prints availability report, exits 0
pnpm tsx scripts/google-health-spike/index.ts --mode live 2>&1 | grep "missing"
# Verify: prints clear env var missing message, exits 1
pnpm format:check
```

#### Likely Pitfalls

- `process.exit(1)` in live mode must happen BEFORE attempting any network call — check credentials first.
- Use `tsx` (already installed as root devDep) to run TypeScript scripts directly.
- `pnpm tsx` runs from the repo root with `--env-file .env` optional. The spike script should use `dotenv` or read from `process.env` directly (not via `@primis/config`'s strict Zod loader, which would fail on missing vars).

#### Questions Before Implementation

None.

---

### CU-041 — Add Normalization Pipeline Core

**Commit message:** `ingestion: add normalized health record pipeline core (CU-041)`

**Branch:** `cu/cu-041-normalization-pipeline-core`

---

#### Goal

Define the canonical `NormalizedRecord` variants used throughout the normalization pipeline, apply unit conversion at the normalization boundary, and establish error types.

#### Docs and Sections to Read

- `primis_full_implementation_spec_commit_plan.md` — Phase E CU-041 definition
- `primis_data_model_health_metric_schema.md` — §10.2 (`metric_observations` full), §11.1 (`sleep_sessions`), §12 (workout schema), §22 (data quality enum full)
- `primis_technical_architecture_document.md` — §14.2 ingestion rules (ARCH-INGEST-001 through ARCH-INGEST-006)
- `packages/health-metrics/src/units.ts` — `convertUnit`, `UnitConversionError`, `CanonicalUnit`
- `packages/health-metrics/src/registry.ts` — `METRIC_REGISTRY`, canonical metric codes

#### Existing Repo Files to Build On

- `packages/health-metrics/src/units.ts` (Phase B) — unit conversion
- `packages/core-types/src/provider.ts` — `ProviderCode`, `ProviderDataAvailabilityStatus`
- `packages/core-types/src/metrics.ts` — `MetricCode`, `DataQuality` (check if DataQuality enum exists; if not, add in this CU or source from data model)

#### Files Created or Edited

```
services/workers/src/normalization/NormalizedRecord.ts          [CREATE]
services/workers/src/normalization/normalizeMetricObservation.ts  [CREATE]
services/workers/src/normalization/normalizationErrors.ts        [CREATE]
services/workers/test/normalization/normalizeMetricObservation.test.ts  [CREATE]
```

#### In-Scope Work

1. **`normalizationErrors.ts`**:
   - `NormalizationError`: base class with `code: string`, `dataType: string`, `reason: string`
   - `MissingValueError extends NormalizationError`
   - `UnknownMetricCodeError extends NormalizationError`
   - `UnitConversionNormalizationError extends NormalizationError` (wraps `UnitConversionError`)

2. **`NormalizedRecord.ts`** — discriminated union of normalized output variants:

   ```ts
   // Variant 1: a scalar metric observation (maps to metric_observations)
   interface NormalizedMetricObservation {
     kind: 'metric_observation';
     userId: string;
     providerCode: ProviderCode;
     providerConnectionId: string | null;
     metricCode: string; // from METRIC_REGISTRY canonical codes
     sourceRecordId: string | null;
     startTimeUtc: Date;
     endTimeUtc: Date | null;
     localDate: string; // 'YYYY-MM-DD'
     timezone: string;
     numericValue: number | null;
     textValue: string | null;
     unit: string; // canonical unit
     aggregationLevel: string; // 'raw' | 'day' | 'session'
     dataQuality: DataQualityValue;
     metadata: Record<string, unknown>;
   }
   // Variant 2: sleep session (maps to sleep_sessions + sleep_stage_intervals)
   interface NormalizedSleepSession {
     kind: 'sleep_session'; /* ... */
   }
   // Variant 3: workout session (maps to workout_sessions)
   interface NormalizedWorkoutSession {
     kind: 'workout_session'; /* ... */
   }
   // Variant 4: timeseries sample (maps to metric_timeseries_samples)
   interface NormalizedTimeseriesSample {
     kind: 'timeseries_sample'; /* ... */
   }

   type NormalizedRecord =
     | NormalizedMetricObservation
     | NormalizedSleepSession
     | NormalizedWorkoutSession
     | NormalizedTimeseriesSample;
   ```

   Field shapes must match `database/migrations/000004_metrics.sql` and `000005_domain_tables.sql`.

3. **`DataQualityValue`** type — **pre-flight check required**:

   Read `packages/core-types/src/metrics.ts` before writing any code in this CU.

   - If a `DataQuality` type (or equivalent union) already exists, **import and reuse it** — do not create a duplicate. Add a re-export alias in `NormalizedRecord.ts` if the name differs.
   - If no such type exists, create `DataQualityValue` in `packages/core-types/src/metrics.ts` (not in workers) sourced from Data Model §22, export it from `packages/core-types/src/index.ts`, then import it in workers.
   - Under no circumstances create a second data-quality enum or union in the workers package if one already exists in core-types.

   Values (12 total, from Data Model §22):

   ```ts
   type DataQualityValue =
     | 'normal'
     | 'estimated'
     | 'user_reported'
     | 'partial'
     | 'sparse'
     | 'stale'
     | 'duplicate_candidate'
     | 'corrected'
     | 'low_confidence'
     | 'provider_unverified'
     | 'permission_missing'
     | 'no_data'
     | 'error';
   ```

4. **`normalizeMetricObservation.ts`**:
   - `normalizeMetricObservation(params: { value: number; providerUnit: string; canonicalUnit: string; metricCode: string; ... }): NormalizedMetricObservation`
   - Calls `convertUnit(value, providerUnit, canonicalUnit)` from `@primis/health-metrics`
   - Throws `UnitConversionNormalizationError` if the conversion is not registered
   - Applies `localDate` computation: use `toLocaleDateString('sv-SE', { timeZone: timezone })` (ISO date format) or `Intl.DateTimeFormat` — source the approach clearly in a comment
   - Returns `dataQuality: 'normal'` by default; callers may override

5. **Tests**:
   - `normalizeMetricObservation` with steps (count → count, no conversion)
   - `normalizeMetricObservation` with sleep duration (minutes → seconds conversion)
   - `normalizeMetricObservation` throws `UnitConversionNormalizationError` for unknown conversion
   - Verify `localDate` is computed from `timezone`, not UTC date

#### Out-of-Scope Work

- Google-specific normalizer logic (CU-042/CU-043).
- DB writes (CU-044).
- Domain-specific fields in sleep/workout sessions (CU-043 fills these in).

#### Acceptance Criteria

- [ ] `pnpm --filter @primis/workers typecheck` passes.
- [ ] `pnpm --filter @primis/workers test` passes including normalization tests.
- [ ] `NormalizedRecord` discriminated union compiles and exhaustiveness checks work.
- [ ] `normalizeMetricObservation` with a unit mismatch throws `UnitConversionNormalizationError`.
- [ ] `localDate` test uses a non-UTC timezone to verify it is not just `toISOString().split('T')[0]`.

#### Verification Commands

```bash
pnpm --filter @primis/workers typecheck
pnpm --filter @primis/workers test
pnpm lint && pnpm format:check
```

#### Likely Pitfalls

- **ARCH-INGEST-004**: unit conversion happens here (normalization layer), not in the UI layer and not in the Google connector.
- **ARCH-INGEST-003**: always preserve `localDate` for sleep/daily summaries; UTC is for ordering; local date is for "what day was this".
- `DataQualityValue` from Data Model §22 has 12 values. Check `packages/core-types/src/metrics.ts` — if a `DataQuality` type already exists there, use it; if the values differ, create an ADR task.
- Sleep sessions have a `local_date` convention: use the **wake date** (end of sleep), not the start date, when sleep crosses midnight. This rule is enforced in CU-043.

#### Questions Before Implementation

**Required pre-flight**: Read `packages/core-types/src/metrics.ts` before writing any code. Resolve the `DataQualityValue` sourcing (reuse or create) as described in item 3 above before writing `NormalizedRecord.ts`.

---

### CU-042 — Add Google Activity/Vitals Normalizers

**Commit message:** `ingestion: add Google activity and vitals normalizers (CU-042)`

**Branch:** `cu/cu-042-google-activity-vitals-normalizers`

---

#### Goal

Normalize steps, calories, floors, active zone minutes, heart rate, HRV, resting heart rate, SpO2, and respiratory rate from Google Health API responses into `NormalizedMetricObservation` records.

#### Docs and Sections to Read

- `primis_full_implementation_spec_commit_plan.md` — Phase E CU-042 definition
- `primis_data_model_health_metric_schema.md` — §9.2 (canonical metric codes for activity and vitals), §20 (provider mapping matrix)
- `primis_google_health_api_feature_parity_matrix.md` — rows for steps, calories, floors, AZM, HR, HRV, RHR, SpO2, respiratory rate (data type and field path columns)
- `docs/decisions/google-health-api-metric-availability.md` (CU-034) — matrix for data type confirmation

#### Existing Repo Files to Build On

- `services/workers/src/normalization/NormalizedRecord.ts` (CU-041)
- `services/workers/src/normalization/normalizeMetricObservation.ts` (CU-041)
- `services/workers/src/providers/google/types.ts` (CU-039) — `GoogleDataPoint` shape
- `services/workers/src/providers/google/dataTypes.ts` (CU-039) — data type constants
- `packages/health-metrics/src/registry.ts` — canonical metric codes

#### Files Created or Edited

```
services/workers/src/providers/google/normalizers/activity.ts        [CREATE]
services/workers/src/providers/google/normalizers/vitals.ts          [CREATE]
services/workers/src/providers/google/normalizers/normalizerUtils.ts  [CREATE — shared helpers]
database/fixtures/provider/google_health/synthetic/activity.json      [CREATE]
database/fixtures/provider/google_health/synthetic/vitals.json        [CREATE]
services/workers/test/normalizers/googleActivity.test.ts              [CREATE]
services/workers/test/normalizers/googleVitals.test.ts                [CREATE]
```

#### In-Scope Work

1. **`normalizerUtils.ts`**:
   - `extractNumericValue(dataPoint: GoogleDataPoint): number | null` — picks `fpVal` or `intVal` from `value[0]`; returns `null` if no value
   - `nanosToDate(nanos: string): Date` — converts nanosecond string to `Date`
   - `buildSourceRecordId(dataType: string, startNanos: string): string` — deterministic record ID for deduplication

2. **`activity.ts`** — normalizers for:
   - `steps` (Google `steps`, operation `dailyRollup`) → metric code `steps`, unit `count`
   - `floors` (Google `floors`) → metric code `floors`, unit `count`
   - `active_energy_kcal` (Google `active-energy-burned`) → metric code `active_energy_kcal`, unit `kcal`
   - `total_energy_kcal` (Google `total-calories`) → metric code `total_energy_kcal`, unit `kcal`
   - `active_zone_minutes` (Google `active-zone-minutes`) → metric code `active_zone_minutes`, unit `seconds`
   - Each normalizer function signature: `(raw: RawProviderPayload, userId: string, connectionId: string | null, timezone: string): NormalizedMetricObservation[]`
   - Missing/null values → skip the record (return `[]`), do not crash
   - Add `// TODO(Phase-AA): verify field path against real payload` comment on each field extraction

3. **`vitals.ts`** — normalizers for:
   - `hrv_daily_mean` (Google `daily-heart-rate-variability`) → `ms`
   - `resting_heart_rate` (Google `daily-resting-heart-rate`) → `bpm`
   - `oxygen_saturation` (Google `daily-oxygen-saturation`) → `percent`
   - `respiratory_rate` (Google `daily-respiratory-rate`) → `breaths_per_minute`
   - **Do not include `provider_sleep_score`, `provider_readiness_score`, or `provider_cardio_load`** — these are `provider_unverified` per CU-034

4. **Synthetic fixtures** (`database/fixtures/provider/google_health/synthetic/`):
   - `activity.json`: synthetic `steps` dailyRollup response with `user_id: "test-user-001"`, numeric values, and timestamps based on `2024-01-15`
   - `vitals.json`: synthetic HRV/RHR/SpO2/respiratory rate list response
   - Run each through `scripts/redact-fixture.ts` to verify no sensitive fields remain (even synthetic fixtures must pass the check)

5. **Tests**:
   - Happy path: normalizes a fixture step record to correct `metricCode`, `numericValue`, `unit`
   - Missing value: `extractNumericValue` returns `null`, normalizer returns `[]`
   - `localDate` is correct for a fixture in `America/New_York` timezone
   - Vitals: HRV in `ms`, RHR in `bpm`, SpO2 in `percent`, respiratory rate in `breaths_per_minute`
   - Verify `provider_sleep_score` is NOT produced by any normalizer in this file

#### Out-of-Scope Work

- Sleep or workout normalization (CU-043).
- Provider score normalization — explicitly excluded.
- Heart rate time-series samples (optional; defer to Phase Z if `metric_timeseries_samples` volume is a concern).
- DB writes (CU-044).

#### Acceptance Criteria

- [ ] `pnpm --filter @primis/workers typecheck` passes.
- [ ] `pnpm --filter @primis/workers test` passes including `googleActivity.test.ts` and `googleVitals.test.ts`.
- [ ] Every normalizer handles `null` / missing values without throwing.
- [ ] `unit` in every output matches the canonical unit from Data Model §9.2.
- [ ] No `provider_sleep_score`, `provider_readiness_score`, or `provider_cardio_load` metrics are produced.
- [ ] Synthetic fixtures in `database/fixtures/provider/google_health/synthetic/` have no sensitive fields (verify with `pnpm tsx scripts/redact-fixture.ts < fixture.json | diff fixture.json -` — diff should be empty or only redacted fields).

#### Verification Commands

```bash
pnpm --filter @primis/workers typecheck
pnpm --filter @primis/workers test
pnpm lint && pnpm format:check
# Verify fixtures are clean:
pnpm tsx scripts/redact-fixture.ts < database/fixtures/provider/google_health/synthetic/activity.json | diff - database/fixtures/provider/google_health/synthetic/activity.json
```

#### Likely Pitfalls

- `active_zone_minutes` from Google is returned as an integer count of minutes; canonical unit is `seconds` per Data Model §9.2 migration seed. Apply `convertUnit(value, 'minutes', 'seconds')`.
- Respiratory rate from Google may be in `breaths_per_minute` directly; confirm in fixture. If the provider sends a different unit, apply conversion.
- Do not use `new Date()` or `Date.now()` for fixture timestamps — use fixed reference dates so tests are deterministic.

#### Questions Before Implementation

Verify the `daily-respiratory-rate` canonical unit: Data Model §9.2 seeds show `breaths_per_minute`. If the Google payload unit differs, add the conversion to `units.ts` in `@primis/health-metrics` (create an ADR task for the conversion addition).

---

### CU-043 — Add Google Sleep and Workout Normalizers

**Commit message:** `ingestion: add Google sleep and workout normalizers (CU-043)`

**Branch:** `cu/cu-043-google-sleep-workout-normalizers`

---

#### Goal

Normalize Google Health sleep sessions (with stage segments) and exercise sessions into `NormalizedSleepSession` and `NormalizedWorkoutSession` records.

#### Docs and Sections to Read

- `primis_full_implementation_spec_commit_plan.md` — Phase E CU-043 definition
- `primis_data_model_health_metric_schema.md` — §11 sleep schema (§11.1 `sleep_sessions`, §11.2 `sleep_stage_intervals`, §11.3 `sleep_daily_features`), §12 workout schema, V1.1 §27.3–27.8 (sleep field amendments, `sleep_minutes_in_period`, `sleep_minutes_after_wake_up`, etc.)
- `primis_scoring_algorithms_spec.md` — §10 Sleep Score inputs (concepts only — do not implement scoring)
- `primis_google_health_api_feature_parity_matrix.md` — sleep rows (session, stages, duration, latency, awake, efficiency, REM, DEEP, light)
- `database/migrations/000005_domain_tables.sql` — actual `sleep_sessions`, `sleep_stage_intervals`, `workout_sessions` column definitions

#### Existing Repo Files to Build On

- `services/workers/src/normalization/NormalizedRecord.ts` (CU-041) — `NormalizedSleepSession`, `NormalizedWorkoutSession` variants
- `services/workers/src/providers/google/normalizers/normalizerUtils.ts` (CU-042)
- `services/workers/src/providers/google/types.ts` (CU-039) — `GoogleSleepSession`, `GoogleExerciseSession`
- `database/migrations/000005_domain_tables.sql` — must check exact column names

#### Files Created or Edited

```
services/workers/src/providers/google/normalizers/sleep.ts           [CREATE]
services/workers/src/providers/google/normalizers/workout.ts         [CREATE]
database/fixtures/provider/google_health/synthetic/sleep.json         [CREATE]
database/fixtures/provider/google_health/synthetic/workout.json       [CREATE]
services/workers/test/normalizers/googleSleep.test.ts                [CREATE]
services/workers/test/normalizers/googleWorkout.test.ts              [CREATE]
services/workers/src/normalization/NormalizedRecord.ts               [EDIT — fill in sleep/workout variant fields]
```

#### In-Scope Work

1. **Fill in `NormalizedSleepSession`** fields from Data Model §11.1 (sync with `sleep_sessions` columns in migration 000005):
   - `startTimeUtc`, `endTimeUtc`, `localDate` (wake date), `timezone`
   - `totalDurationSeconds`, `minutesAsleep`, `minutesInBed`, `minutesToFallAsleep`, `minutesAwake`, `minutesAfterWakeUp`
   - `sleepEfficiency`, `mainSleepFlag`, `provider_code`, `sourceRecordId`
   - `stages: NormalizedSleepStage[]` (optional — may be absent)
   - Add `// TODO(Phase-AA): verify minutesAfterWakeUp field path in real payload` per V1.1 amendment

2. **Fill in `NormalizedWorkoutSession`** fields from migration 000005 `workout_sessions` columns:
   - `startTimeUtc`, `endTimeUtc`, `localDate`, `timezone`
   - `activityType` (string), `durationSeconds`, `activeEnergyKcal`
   - `distanceMeters`, `avgHeartRateBpm`, `maxHeartRateBpm`, `peakHrZoneMinutes`
   - `sourceRecordId`, `providerCode`

3. **`sleep.ts`** — normalizer:
   - `normalizeGoogleSleepSession(raw: RawProviderPayload, ...): NormalizedSleepSession[]`
   - **Midnight-crossing rule**: `localDate` is derived from the **end time** (wake time) in the user's timezone, not the start time. Source: Scoring Spec §10 and TAD §14.2 ARCH-INGEST-003.
   - Stage mapping: Google stages → canonical stage names (`'awake' | 'light' | 'deep' | 'rem'`)
   - If stages array is absent: set `stages: []`, do not crash
   - Parse `minutesAsleep` from `details.minutesAsleep` (or equivalent Google field — mark with `// TODO(Phase-AA): verify`)

4. **`workout.ts`** — normalizer:
   - `normalizeGoogleWorkoutSession(raw: RawProviderPayload, ...): NormalizedWorkoutSession[]`
   - Map Google `activity.activityType` codes to canonical `activityType` strings (provide a comment-documented mapping table; mark unknown codes as `'unknown'`)
   - `distanceMeters` may be absent for non-distance workouts — set `null`
   - HR zones: if present, extract into `peakHrZoneMinutes`; if absent, set `null`

5. **Synthetic fixtures**:
   - `sleep.json`: one sleep session that crosses midnight (start `2024-01-14T23:00:00Z`, end `2024-01-15T07:00:00Z`) with 4 stages
   - `workout.json`: one run session with distance and HR data
   - Both with synthetic IDs and shifted timestamps

6. **Tests**:
   - Sleep: `localDate` is wake date, not start date, for midnight-crossing sleep
   - Sleep: missing `stages` produces `stages: []` (not an error)
   - Sleep: `minutesAsleep` is computed correctly from fixture values
   - Workout: missing `distanceMeters` produces `distanceMeters: null`
   - Workout: partial HR data (avg present, max absent) does not crash

#### Out-of-Scope Work

- Sleep score or sleep debt calculation (Phase F).
- DB writes (CU-044).
- `sleep_daily_features` derivation (Phase F).
- Bedtime planner (Phase F).

#### Acceptance Criteria

- [ ] `pnpm --filter @primis/workers typecheck` passes.
- [ ] `pnpm --filter @primis/workers test` passes including sleep and workout tests.
- [ ] Midnight-crossing sleep test asserts `localDate === '2024-01-15'` (wake date), not `'2024-01-14'` (start date).
- [ ] Missing stages test asserts `stages: []` result (no error).
- [ ] `NormalizedSleepSession` fields match `sleep_sessions` column names from migration 000005.
- [ ] `NormalizedWorkoutSession` fields match `workout_sessions` column names from migration 000005.

#### Verification Commands

```bash
pnpm --filter @primis/workers typecheck
pnpm --filter @primis/workers test
pnpm lint && pnpm format:check
```

#### Likely Pitfalls

- **Midnight-crossing rule** is critical. Sleep starting the evening of Jan 14 and ending the morning of Jan 15 should have `local_date = '2024-01-15'` (the day the user woke up), not `'2024-01-14'`. This is how the user experiences the sleep night.
- Google sleep stages use integer type codes (1=awake, 2=asleep/light/other, 3=rem, 4=light, 5=deep — validate exact codes; mark with `// TODO(Phase-AA): verify stage codes against real payload`).
- Migration 000005 must be checked for the exact column names in `sleep_sessions`. The plan references Data Model §11.1 but the actual truth is the SQL migration. Prefer the migration if there is a discrepancy.
- `minutesAfterWakeUp` was added in the Data Model V1.1 amendment. Verify the field is in migration 000005 before writing to it.

#### Questions Before Implementation

**Pre-flight check (required before writing any code in this CU):**

1. Read `database/migrations/000005_domain_tables.sql` and search for `minutes_after_wake_up` in the `sleep_sessions` table definition.
2. **If the column is present:** proceed normally. Reference it in `NormalizedSleepSession`.
3. **If the column is absent:** before writing any normalizer logic that depends on it, create the corrective migration:
   ```
   database/migrations/000007_add_sleep_minutes_after_wake_up.sql
   ```
   (Migration 000006 already exists from Phase D.) The migration must add the column as `nullable integer` to `sleep_sessions` only — do not edit the existing 000005 file, which may already be applied in local dev databases. Include this migration file in the CU-043 commit. Do not create a separate CU for it.

Never edit an existing migration file that may already be applied.

---

### CU-044 — Add Idempotent Normalized Record Writer

**Commit message:** `ingestion: add idempotent normalized record writer (CU-044)`

**Branch:** `cu/cu-044-idempotent-record-writer`

---

#### Goal

Write `NormalizedRecord` variants to the database idempotently (upsert), record raw payload metadata in `raw_provider_payloads`, and update `provider_data_availability`. Must never compute summaries or scores.

#### Docs and Sections to Read

- `primis_full_implementation_spec_commit_plan.md` — Phase E CU-044 definition
- `primis_technical_architecture_document.md` — ARCH-PRINCIPLE-004 (idempotent processing), §14.2 ARCH-INGEST-001–006, §13.1 (event taxonomy for downstream enqueue)
- `primis_data_model_health_metric_schema.md` — §10.2 (`metric_observations` upsert key), §8.5 (`provider_sync_jobs`), §8.7 (`raw_provider_payloads`), §22 (data quality values)
- `docs/decisions/ADR-003-query-layer-and-migrations.md` — Kysely patterns

#### Existing Repo Files to Build On

- `services/workers/src/db/client.ts` (CU-035) — Kysely instance
- `services/workers/src/db/types.ts` (CU-035) — table types
- `services/workers/src/normalization/NormalizedRecord.ts` (CU-041)
- `services/workers/src/storage/RawPayloadArchive.ts` (CU-036)
- `services/workers/src/security/SecretStore.ts` (CU-038) — not directly needed here

#### Files Created or Edited

```
services/workers/src/normalization/writeNormalizedRecords.ts          [CREATE]
services/workers/src/repositories/normalizedRecordWriter.ts           [CREATE — Kysely write methods]
services/workers/src/repositories/providerDataAvailabilityWriter.ts   [CREATE]
services/workers/src/repositories/rawPayloadMetadataWriter.ts         [CREATE]
services/workers/test/normalization/writeNormalizedRecords.test.ts    [CREATE — in-memory DB mock or Kysely mock]
```

#### In-Scope Work

1. **`normalizedRecordWriter.ts`** — Kysely-based upsert methods:
   - `upsertMetricObservation(db: Kysely<Database>, record: NormalizedMetricObservation): Promise<void>`
     - Upsert key: `ON CONFLICT (user_id, metric_code, source_provider, source_record_id) DO UPDATE`
     - If `source_record_id` is `null` (no provider ID), insert without conflict detection (nullable NULL exclusion per migration comment)
     - Sets `updated_at = now()` on UPDATE
   - `upsertSleepSession(db: Kysely<Database>, session: NormalizedSleepSession): Promise<void>`
   - `upsertSleepStageIntervals(db: Kysely<Database>, sessionId: string, stages: NormalizedSleepStage[]): Promise<void>`
   - `upsertWorkoutSession(db: Kysely<Database>, session: NormalizedWorkoutSession): Promise<void>`
   - All methods use Kysely `.onConflict().doUpdateSet()` pattern

2. **`providerDataAvailabilityWriter.ts`**:
   - `upsertDataAvailability(db: Kysely<Database>, params: { userId: string; providerCode: ProviderCode; providerDataType: string; canonicalMetricCode: string | null; status: ProviderDataAvailabilityStatus; }): Promise<void>`
   - Upsert on `(user_id, provider_code, provider_data_type, canonical_metric_code)` — sets `last_seen_at = now()`, increments `sample_count`
   - **Does NOT compute summaries or scores** — only records that data exists

3. **`rawPayloadMetadataWriter.ts`**:
   - `insertRawPayloadMetadata(db: Kysely<Database>, params: ArchiveResult & { userId: string; providerCode: ProviderCode; ... }): Promise<string>`
   - Inserts a row into `raw_provider_payloads` with the S3 metadata from `ArchiveResult`
   - Returns the new `id`

4. **`writeNormalizedRecords.ts`** — orchestrator:
   - `writeNormalizedRecords(db: Kysely<Database>, records: NormalizedRecord[], archive: RawPayloadArchive, ...): Promise<WriteResult>`
   - `WriteResult`: `{ writtenCount: number; skippedCount: number; errors: WriteError[]; affectedDates: string[]; }`
   - Loops over `records`, dispatches to the correct upsert method by `kind`
   - For each successful write, calls `upsertDataAvailability()`
   - Calls `archive.store()` and then `insertRawPayloadMetadata()` per raw payload
   - Returns `affectedDates` (the set of `localDate` values written) — caller (CU-045) will use this to enqueue scoring jobs **through an interface** (not implemented in Phase E)
   - **Must NOT compute summaries, baselines, or scores** — `affectedDates` are returned for the caller

5. **`ScoringEnqueuePort` interface** (in `writeNormalizedRecords.ts` or a separate file):

   ```ts
   interface ScoringEnqueuePort {
     enqueueScoringForDates(userId: string, dates: string[]): Promise<void>;
   }
   ```

   A `NoopScoringEnqueuePort` (no-op implementation) is the default in Phase E. CU-045 passes this through.

6. **Tests** (unit tests using mock DB or `vitest.fn()` mocks):
   - Use `vi.fn()` to mock all Kysely methods — avoid requiring a real DB in CU-044 unit tests
   - Verify `upsertMetricObservation` constructs the correct Kysely `.onConflict()` chain
   - Verify `upsertDataAvailability` is called for each successful write
   - Verify `writeNormalizedRecords` handles a `WriteError` from a failed upsert without crashing the whole batch
   - Verify `affectedDates` is the distinct set of `localDate` values

#### Out-of-Scope Work

- Real DB integration tests (Phase J).
- Daily summary computation (Phase F).
- Scoring or baseline computation (Phase F).
- SQS enqueue (Phase Z).

#### Acceptance Criteria

- [ ] `pnpm --filter @primis/workers typecheck` passes.
- [ ] `pnpm --filter @primis/workers test` passes including `writeNormalizedRecords.test.ts`.
- [ ] Upsert methods use `ON CONFLICT DO UPDATE` semantics (verified by Kysely query structure in tests).
- [ ] `writeNormalizedRecords` does not directly call any scoring or summary computation.
- [ ] `affectedDates` returned contains distinct `localDate` strings.
- [ ] `NoopScoringEnqueuePort` is the default implementation, doing nothing.

#### Verification Commands

```bash
pnpm --filter @primis/workers typecheck
pnpm --filter @primis/workers test
pnpm lint && pnpm format:check
```

#### Likely Pitfalls

- **NULL source_record_id**: the unique constraint `(user_id, metric_code, source_provider, source_record_id)` treats `NULL != NULL` in Postgres. Records without a source_record_id can be inserted multiple times. Add a comment in the code documenting this behavior and note that callers must be aware.
- **Kysely `onConflict()`**: use `.onConflict((oc) => oc.columns([...]).doUpdateSet(...))` — check Kysely v0.29 docs for exact API (do not guess; use context7 MCP or docs if needed).
- `updated_at` must be set explicitly (D-A-008 convention from ADR-003) — use `new Date()` in the `doUpdateSet` payload.

#### Questions Before Implementation

Verify Kysely v0.29 `onConflict` API. Check `services/api/src/repositories/*.ts` for existing usage patterns to ensure consistency.

---

### CU-045 — Add Local Sync Job Runner

**Commit message:** `sync: add local provider sync job runner (CU-045)`

**Branch:** `cu/cu-045-local-sync-job-runner`

---

#### Goal

Run a complete local provider sync lifecycle — create a sync job row, call the connector, archive raw payloads, write normalized records, update sync cursors, and mark job completion.

#### Docs and Sections to Read

- `primis_full_implementation_spec_commit_plan.md` — Phase E CU-045 definition
- `primis_technical_architecture_document.md` — §10.3.3 (sync flow sequence diagram), §10.3.4 (sync window strategy), §14.1 (end-to-end pipeline), §13.4 (retry/DLQ policy)
- `primis_mvp_build_plan_milestones.md` — §10.7 M4-T003, M4-T004 (sync worker requirements)
- `primis_data_model_health_metric_schema.md` — §8.5 (`provider_sync_jobs`), §8.6 (`provider_sync_cursors`)

#### Existing Repo Files to Build On

- `services/workers/src/providers/HealthProviderConnector.ts` (CU-035) — interface
- `services/workers/src/providers/FakeHealthProviderConnector.ts` (CU-035) — test double
- `services/workers/src/providers/google/GoogleHealthConnector.ts` (CU-037/CU-039)
- `services/workers/src/normalization/writeNormalizedRecords.ts` (CU-044)
- `services/workers/src/storage/LocalRawPayloadArchive.ts` (CU-036)
- `services/workers/src/db/client.ts` (CU-035)
- `services/workers/src/db/types.ts` (CU-035)

#### Files Created or Edited

```
services/workers/src/sync/SyncJobRunner.ts                 [CREATE]
services/workers/src/sync/syncJobRepository.ts             [CREATE — DB read/write for sync job lifecycle]
services/workers/src/sync/syncCursorRepository.ts          [CREATE — DB read/write for sync cursors]
services/workers/src/sync/localRunner.ts                   [CREATE — runnable entry for local dev/test]
services/workers/test/sync/SyncJobRunner.test.ts           [CREATE]
```

#### In-Scope Work

1. **`syncJobRepository.ts`** — Kysely operations for `provider_sync_jobs`:
   - `createSyncJob(db, params: { userId; connectionId; jobType; syncWindowStart; syncWindowEnd; }): Promise<string>` — inserts with `status: 'queued'`, returns `id`
   - `markJobRunning(db, jobId: string): Promise<void>` — sets `status: 'running'`, `started_at: now()`
   - `markJobSucceeded(db, jobId: string, counts: { fetched; normalized; archived }): Promise<void>`
   - `markJobFailed(db, jobId: string, error: { code; message }): Promise<void>`
   - `markJobPartialSuccess(db, jobId: string, counts, errors): Promise<void>`

2. **`syncCursorRepository.ts`** — Kysely operations for `provider_sync_cursors`:
   - `getCursor(db, connectionId, dataType): Promise<SyncCursor | null>`
   - `upsertCursor(db, connectionId, dataType, highWatermark: Date): Promise<void>`

3. **`SyncJobRunner`** (main orchestrator):
   - Constructor: `constructor(db: Kysely<Database>, connector: HealthProviderConnector, archive: RawPayloadArchive, scoringPort: ScoringEnqueuePort)`
   - `runJob(params: SyncJobParams): Promise<ProviderSyncResult>`:
     1. `createSyncJob()` → get `jobId`
     2. `markJobRunning(jobId)`
     3. Call `connector.syncWindow(connectionId, window)` → get `ProviderSyncResult`
     4. For each raw payload in result: `archive.store()` → `insertRawPayloadMetadata()`
     5. For each normalized record: `writeNormalizedRecords()`
     6. `upsertCursor()` with the window end time
     7. Call `scoringPort.enqueueScoringForDates()` with `affectedDates` (no-op in Phase E)
     8. `markJobSucceeded()` or `markJobFailed()` depending on errors
     9. Return `ProviderSyncResult`
   - **Error handling**: if connector throws `ProviderConnectorError` with `retryable: false`, mark job failed; if `retryable: true`, mark job failed with `retry_count + 1` (actual retry loop is Phase Z EventBridge)
   - **No live API calls without real credentials** — use `FakeHealthProviderConnector` in tests

4. **`localRunner.ts`** — runnable script:
   - `runLocalMockSync(userId: string, window: SyncWindow): Promise<void>`
   - Creates a `FakeHealthProviderConnector` and `LocalRawPayloadArchive`
   - Requires a real DB connection (`DATABASE_URL` in env) — fails gracefully if `DATABASE_URL` is missing
   - Usage: `pnpm tsx services/workers/src/sync/localRunner.ts`

5. **Tests** (`SyncJobRunner.test.ts`):
   - Mock all DB methods (`vi.fn()`)
   - Mock `FakeHealthProviderConnector`
   - Verify job lifecycle: `queued` → `running` → `succeeded`
   - Verify `markJobFailed` is called when connector throws
   - Verify cursor is updated with the window end time
   - Verify `scoringPort.enqueueScoringForDates()` is called with the correct dates

#### Out-of-Scope Work

- SQS/EventBridge job triggering (Phase Z).
- Real live Google sync (Phase Z — M1-T002).
- Backfill chunking (Phase Z).
- Token refresh retry (Phase Z).
- Summary/scoring computation (Phase F).

#### Acceptance Criteria

- [ ] `pnpm --filter @primis/workers typecheck` passes.
- [ ] `pnpm --filter @primis/workers test` passes including `SyncJobRunner.test.ts`.
- [ ] Job lifecycle test confirms `queued → running → succeeded` transitions via mocked DB.
- [ ] Connector error with `retryable: false` results in `markJobFailed()` call.
- [ ] `upsertCursor()` is called with the window end time after a successful sync.
- [ ] `localRunner.ts` fails clearly (not silently) when `DATABASE_URL` is missing.

#### Verification Commands

```bash
pnpm --filter @primis/workers typecheck
pnpm --filter @primis/workers test
pnpm lint && pnpm format:check
# Local runner (requires local DB):
# pnpm tsx services/workers/src/sync/localRunner.ts
```

#### Likely Pitfalls

- Do not mix job status updates with data writes in a single transaction if it means the job row could be marked `succeeded` before all data is written. Prefer writing data first, then updating the job status.
- `provider_sync_jobs` has no `updated_at` column (per migration 000003 design comment). Status changes are tracked via `started_at` / `finished_at`. Do not add `updated_at` to sync job update methods.
- The `retry_count` field in the DB is informational only in Phase E. Real exponential backoff is deferred to Phase Z.

#### Questions Before Implementation

None.

---

### CU-046 — Add Provider Connection and Sync API Endpoints

**Commit message:** `api: add provider connection and sync endpoints (CU-046)`

**Branch:** `cu/cu-046-provider-connection-sync-api`

---

#### Goal

Expose the full set of provider connection and sync management endpoints the mobile app needs: list connections, get capabilities, disconnect, sync status, and manual refresh trigger.

#### Docs and Sections to Read

- `primis_full_implementation_spec_commit_plan.md` — Phase E CU-046 definition
- `primis_technical_architecture_document.md` — §12 API architecture, §9.2 (app auth vs provider auth separation reminder)
- `primis_product_requirements_document.md` — PRD-FR-GH-001–009, PRD-FR-SET-004, PRD-BE-002–003
- `primis_data_model_health_metric_schema.md` — §8.2–8.5 (provider_connections, sync_jobs)
- `primis_ui_ux_design_system_spec.md` — §6.1 provider sync widget, §7.4 baseline building state, §20.1 `UX-AC-HOME-001` (sync status visible)

#### Existing Repo Files to Build On

- `services/api/src/routes/providerConnections.ts` (CU-037) — extend with list/disconnect endpoints
- `services/api/src/repositories/providerRepository.ts` (Phase D CU-028) — extend with new queries
- `services/api/src/app.ts` (Phase D) — route already registered in CU-037
- `packages/api-contracts/src/providerConnections.ts` (CU-037) — extend with new DTOs
- `services/workers/src/sync/SyncJobRunner.ts` (CU-045) — for understanding sync job lifecycle
- `services/workers/src/sync/syncJobRepository.ts` (CU-045) — query pattern to mirror in API

#### Files Created or Edited

```
packages/api-contracts/src/providerConnections.ts              [EDIT — add list/status/disconnect DTOs]
packages/api-contracts/src/sync.ts                             [CREATE — sync status and trigger DTOs]
packages/api-contracts/src/index.ts                            [EDIT — add sync.ts export]
services/api/src/routes/providerConnections.ts                 [EDIT — add list, disconnect, capabilities endpoints]
services/api/src/routes/sync.ts                                [CREATE — sync status and manual refresh endpoints]
services/api/src/repositories/providerRepository.ts            [EDIT — add list/status/disconnect queries]
services/api/src/app.ts                                        [EDIT — register syncRouter]
services/api/test/routes/providerConnections.test.ts           [CREATE OR EDIT]
services/api/test/routes/sync.test.ts                          [CREATE]
```

#### In-Scope Work

1. **`packages/api-contracts/src/providerConnections.ts` additions**:
   - `ListConnectionsResponseDto`: `{ connections: ProviderConnectionDto[]; }`
   - `ProviderCapabilitiesDto`: `{ providerCode: string; metrics: ProviderCapabilityMetricDto[]; supportsWebhooks: boolean; }`
   - `DisconnectConnectionResponseDto`: `{ success: boolean; }`

2. **`packages/api-contracts/src/sync.ts`** (new file):
   - `SyncStatusDto`: `{ connectionId: string; providerCode: string; lastSyncAt: string | null; lastSyncStatus: string | null; pendingJobCount: number; }`
   - `SyncStatusListResponseDto`: `{ statuses: SyncStatusDto[]; }`
   - `ManualSyncRequestDto`: `{ providerCode: string; windowDays?: number; }`
   - `ManualSyncResponseDto`: `{ jobId: string; status: 'queued'; message: string; }`
   - Export from `packages/api-contracts/src/index.ts`

3. **Endpoints to implement** (all under `/api/v1/me/providers`, all require auth middleware):
   - `GET /api/v1/me/providers` → `ListConnectionsResponseDto` — list all non-deleted connections for the authenticated user
   - `GET /api/v1/me/providers/:connectionId/capabilities` → `ProviderCapabilitiesDto` — returns static capability list for the provider type
   - `DELETE /api/v1/me/providers/:connectionId` → `DisconnectConnectionResponseDto` — soft-deletes `provider_connections` row (sets `connection_status: 'revoked'`, `deleted_at: now()`); **does NOT call Google revocation API** (Phase Z); does **not** delete health data (Phase J deletion workflow)
   - `GET /api/v1/me/sync/status` → `SyncStatusListResponseDto` — returns most recent sync job per connection from `provider_sync_jobs`
   - `POST /api/v1/me/sync/refresh` → `ManualSyncResponseDto` — creates a `provider_sync_jobs` row with `job_type: 'manual_refresh'`, `status: 'queued'`; does **not** actually execute the sync (execution is workers' responsibility); in Phase E this just inserts the row

4. **`providerRepository.ts` extensions**:
   - `listConnectionsByUserId(db, userId): Promise<ProviderConnectionRow[]>`
   - `softDeleteConnection(db, connectionId, userId): Promise<void>` — ensures the connection belongs to the user before deleting
   - `getConnectionById(db, connectionId, userId): Promise<ProviderConnectionRow | null>`

5. **`services/api/src/routes/sync.ts`** (new route file):
   - `GET /status` and `POST /refresh` handlers
   - Queries `provider_sync_jobs` for most recent job per connection
   - Inserts new sync job row on refresh

6. **Security**: `DELETE /providers/:connectionId` must verify `provider_connections.user_id = authenticatedUserId` before deleting — **never allow cross-user deletion**. Use the `userId` from the auth middleware context.

7. **Token non-exposure**: none of the `GET /providers` or `GET /sync/status` endpoints may return `access_token_secret_ref` or `refresh_token_secret_ref` column values in the response DTO.

8. **Tests**:
   - `GET /api/v1/me/providers` returns `[]` for a user with no connections
   - `DELETE` with wrong userId returns 404
   - `POST /sync/refresh` creates a `queued` job row (mock the DB)
   - `GET /sync/status` returns the most recent job per connection

#### Out-of-Scope Work

- Real sync execution from the API (workers job; Phase Z triggers).
- Token revocation call to Google (Phase Z).
- Health data deletion on disconnect (Phase J deletion workflow).
- Rate limiting on manual refresh (Phase J hardening).
- Webhook subscription (Phase Z).

#### Acceptance Criteria

- [ ] `pnpm --filter @primis/api typecheck` passes.
- [ ] `pnpm --filter @primis/api test` passes including new route tests.
- [ ] `GET /api/v1/me/providers` returns `200` with `{ connections: [] }` for a new user.
- [ ] `DELETE /api/v1/me/providers/:connectionId` returns `404` when the connection belongs to a different user.
- [ ] None of the endpoint responses include `access_token_secret_ref` or `refresh_token_secret_ref`.
- [ ] `POST /api/v1/me/sync/refresh` creates a `provider_sync_jobs` row with `status: 'queued'` (verified with mock DB).
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` passes from root.

#### Verification Commands

```bash
pnpm install
pnpm --filter @primis/api typecheck
pnpm --filter @primis/api test
pnpm lint && pnpm typecheck && pnpm test && pnpm format:check
```

#### Likely Pitfalls

- The `providerRepository.ts` `softDeleteConnection()` method MUST include a `WHERE user_id = $userId` clause — never delete by ID alone.
- `GET /providers` should return connections with `deleted_at IS NULL` only.
- The `capabilities` endpoint returns static data (from `GoogleHealthConnector.listCapabilities()`). No DB call needed.
- When registering `syncRouter` in `app.ts`, keep the auth middleware in the `app.use('/api/v1/*', authMiddleware)` chain — new routes under `/api/v1/me/sync/` are automatically protected.

#### Questions Before Implementation

None.

---

## 6. Phase-Level Guardrails

All Phase E commit units must respect the following constraints. Any violation is a blocking issue for the CU's acceptance criteria.

| ID   | Guardrail                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G-01 | **No real Google Health credentials or OAuth tokens.** `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, and any access/refresh tokens remain `PLACEHOLDER` values in `.env.example`. Live credentials only in `.env` (gitignored).                                    |
| G-02 | **No committed provider secrets.** `git grep -r "ya29\." .` and `git grep -r "AKIA" .` must return nothing. Add to CI secret scan if not already present.                                                                                                                      |
| G-03 | **No raw provider payloads.** No unredacted Google Health, Fitbit, or any provider API response may be committed. All fixtures must pass through `scripts/redact-fixture.ts` and the fixture policy checklist in `database/fixtures/README.md`.                                |
| G-04 | **No real live API calls in automated tests.** All HTTP/network calls in Vitest tests must use injected mock functions or `vi.fn()` mocks.                                                                                                                                     |
| G-05 | **Live mode scripts must fail clearly when env vars are missing.** Any script in `scripts/google-health-spike/` that needs credentials must call `process.exit(1)` with a clear message (not a thrown stack trace) when the env var is absent.                                 |
| G-06 | **Mock mode must work without credentials.** `pnpm tsx scripts/google-health-spike/index.ts --mode mock` must succeed in a clean CI environment with no `.env` file.                                                                                                           |
| G-07 | **Provider scores remain `unverified`.** Do not mark `provider_sleep_score`, `provider_readiness_score`, `provider_cardio_load`, or any metric as `verified` or `available` in any migration, seed, fixture, or code until Phase AA live validation is complete.               |
| G-08 | **No direct token storage in DB.** `access_token_secret_ref` and `refresh_token_secret_ref` columns in `provider_connections` hold Secrets Manager ARN reference strings only. Never write raw token strings to these columns in any repository method.                        |
| G-09 | **No source-of-truth doc rewrites.** If a Phase E implementation finding conflicts with a source doc, create a new file under `docs/decisions/ADR-00X-*.md` describing the conflict and resolution. Do not silently edit source docs.                                          |
| G-10 | **No scoring, baseline, or summary computation.** Phase E writes `metric_observations` and domain session rows. It must not compute `daily_metric_summaries`, `rolling_metric_baselines`, or `score_snapshots`. Return `affectedDates` from writers; defer scoring to Phase F. |
| G-11 | **No AI provider calls, prompts, or model logic.** Phase E has no `AiIntent`, no AI context packets, no calls to OpenAI/Anthropic.                                                                                                                                             |
| G-12 | **No mobile feature UI.** Phase E does not modify `apps/mobile`. The API endpoints (CU-046) will be consumed by the mobile app in Phase G.                                                                                                                                     |
| G-13 | **No AWS deployment infrastructure.** No CDK stacks, no Lambda handlers, no EventBridge rules, no SQS queues. Phase E sync runs locally only. AWS shells (S3, Secrets Manager) must throw `NotImplementedError`-style errors if called.                                        |
| G-14 | **No `@aws-sdk/*` dependencies.** Do not install AWS SDK packages in Phase E. The S3 and Secrets Manager implementations are stubs only.                                                                                                                                       |
| G-15 | **Logs must not include raw health values or tokens.** Any `console.log` or logger call must not include raw HRV, SpO2, body composition, or OAuth token values. Use metric codes and job IDs for correlation only.                                                            |

---

## 7. Handoff Prompt Template

Use this template when starting each commit unit. Replace the bracketed values.

```
You are implementing [CU-0XX — <CU title>] for Primis.

REQUIRED READING BEFORE WRITING ANY CODE:
1. docs/source-of-truth/primis_full_implementation_spec_commit_plan.md — Phase E CU-0XX definition
2. [List 2–4 additional specific source doc sections from §3 of this plan for this CU]
3. plans/phase-e-provider-validation-sync-infrastructure.md — §5 CU-0XX section (this plan)
4. docs/decisions/ADR-001-provider-code-naming.md
5. docs/decisions/ADR-003-query-layer-and-migrations.md (if DB work is involved)

CONTEXT:
- Phases A–D are complete. services/workers is a real pnpm package as of CU-035.
- The following CUs in Phase E are already complete: [list CUs before this one]
- You may import from: @primis/core-types, @primis/health-metrics, @primis/api-contracts, @primis/config,
  and services/workers built artifacts.

IMPLEMENT ONLY:
[Paste the "In-Scope Work" section for this CU from the plan]

DO NOT IMPLEMENT:
[Paste the "Out-of-Scope Work" section for this CU from the plan]

PHASE-LEVEL GUARDRAILS (non-negotiable):
- No real Google credentials or tokens
- No committed provider secrets
- No real API calls in tests (inject mock httpClient / vi.fn())
- No scoring or summary computation
- No AWS SDK installation
- Logs must not include raw health values or tokens

VERIFICATION COMMANDS:
[Paste from the CU's "Verification Commands" section]

COMMIT MESSAGE: [paste exact commit message from the CU section]
BRANCH: [paste exact branch name from the CU section]
```

---

## 8. Definition of Done for Phase E

Phase E is complete when ALL of the following pass:

**Verification gate (must pass from repo root):**

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

**Per-package verification:**

```bash
pnpm --filter @primis/core-types typecheck
pnpm --filter @primis/api-contracts typecheck
pnpm --filter @primis/workers typecheck
pnpm --filter @primis/workers test
pnpm --filter @primis/api typecheck
pnpm --filter @primis/api test
```

**Deliverable checklist:**

- [ ] `docs/decisions/google-health-api-metric-availability.md` exists with all target metrics and explicit unverified markers for provider scores.
- [ ] `scripts/google-health-spike/index.ts` runs in mock mode without credentials.
- [ ] `@primis/workers` is a real pnpm workspace package with `package.json`, `tsconfig.json`, `vitest.config.ts`.
- [ ] `packages/core-types/src/providers.ts` exports `ProviderCapabilities` and `SyncWindow` types.
- [ ] `HealthProviderConnector` interface has no Google-specific parameter types.
- [ ] `RawPayloadArchive` interface exists with `LocalRawPayloadArchive` passing tests.
- [ ] `GoogleHealthConnector` implements `HealthProviderConnector` with injected `httpClient`.
- [ ] `SecretStore` interface exists; `LocalSecretStore` throws on non-local/non-test env.
- [ ] `GoogleHealthApiClient` maps 401/403/429/5xx to typed `ProviderConnectorError`.
- [ ] Activity normalizer produces `steps`, `floors`, `active_energy_kcal`, `total_energy_kcal`, `active_zone_minutes` records from synthetic fixtures.
- [ ] Vitals normalizer produces `hrv_daily_mean`, `resting_heart_rate`, `oxygen_saturation`, `respiratory_rate` records.
- [ ] Sleep normalizer sets `localDate` to wake date (not start date) for midnight-crossing sessions.
- [ ] Workout normalizer handles missing `distanceMeters` without crashing.
- [ ] `writeNormalizedRecords` upserts metric observations and updates `provider_data_availability`.
- [ ] `SyncJobRunner` lifecycle transitions `queued → running → succeeded/failed` in tests.
- [ ] `GET /api/v1/me/providers` and `POST /api/v1/me/sync/refresh` endpoints registered and tested.
- [ ] No `access_token_secret_ref` or `refresh_token_secret_ref` values in any API response.
- [ ] `git grep -r "ya29\." .` returns nothing.
- [ ] `git grep -r "AKIA" .` returns nothing.
- [ ] `database/fixtures/.local-dev-archive/` is in `.gitignore`.
- [ ] No `@aws-sdk/*` in any `package.json`.

---

## 9. Known Risks / Decisions to Defer

| ID         | Risk / Decision                                                                                                                                                                           | Defer to                | Notes                                                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E-RISK-001 | Google Health API field paths for `minutesAfterWakeUp` (V1.1 amendment) are not confirmed until live validation.                                                                          | Phase AA (M1-T002)      | Mark with `// TODO(Phase-AA): verify field path` comments throughout sleep normalizer.                                                                                                                                               |
| E-RISK-002 | Google sleep stage integer codes (awake/light/deep/rem) may differ between Fitbit-sourced and Google Pixel-sourced data.                                                                  | Phase AA                | Mark stage mapping with `// TODO(Phase-AA): verify stage codes in real payload`.                                                                                                                                                     |
| E-RISK-003 | The `minutes_after_wake_up` column in migration 000005 `sleep_sessions` may not exist (it was added in the Data Model V1.1 amendment but the Phase D migration may not have included it). | CU-043 pre-check        | **Resolved**: CU-043 pre-flight reads migration 000005. If column is absent, add `database/migrations/000007_add_sleep_minutes_after_wake_up.sql` in the same commit. Never edit an already-applied migration.                       |
| E-RISK-004 | `BackendEnv` Zod schema in `@primis/config` may need new fields for Google OAuth vars. If the current env schema uses `.strict()`, adding new fields could break existing tests.          | CU-035/CU-037 pre-check | **Resolved**: Add Google OAuth env vars as `z.string().default('PLACEHOLDER')`. Never make them required at startup — only check presence at runtime in live-mode code paths. This keeps all unit tests green without a real `.env`. |
| E-RISK-005 | Sharing `SecretStore` interface between `services/api` and `services/workers` as duplicated files may cause drift.                                                                        | Phase Z                 | Create an ADR task to extract to `@primis/secrets` package if the interface changes materially.                                                                                                                                      |
| E-RISK-006 | `kysely-codegen` was mentioned as a Phase E follow-up in ADR-003. It is not required for Phase E but could help keep `db/types.ts` files in sync.                                         | Phase Z                 | Evaluate after schema stabilizes.                                                                                                                                                                                                    |
| E-RISK-007 | The `google_health_feature_parity_items` DB table (Data Model V1.1 §27.2) is not in any existing migration.                                                                               | Phase AA                | CU-034 creates the documentation artifact. The DB table is not needed until Phase AA validates real payloads. Create an ADR task if a future CU needs the table.                                                                     |
| E-RISK-008 | Google OAuth PKCE state parameter: the current design has the state returned to mobile for round-trip validation without a server-side session store. This is architecturally unusual.    | Phase Z OAuth hardening | Document the state validation approach explicitly in CU-037 implementation comments. Create an ADR task if the team wants server-side state validation.                                                                              |

---

## 10. Open Questions / Assumptions

| ID       | Question / Assumption                                                                                                                                                                                                                                             | Status                                                                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-OQ-001 | **Assumption**: `services/workers` will use its own Kysely+pg client that reads `DATABASE_URL` from env. Workers and API share the same Postgres database in local dev. In production they would be separate Lambda/ECS processes with IAM-scoped DB credentials. | Assumed unless otherwise directed                                                                                                                                                                    |
| E-OQ-002 | **Assumption**: The `google_health_feature_parity_items` table from Data Model V1.1 §27.2 is NOT created in Phase E. The CU-034 document artifact is sufficient for Phase E.                                                                                      | Assumed. Create an ADR task if Phase E specifically needs the DB table.                                                                                                                              |
| E-OQ-003 | **Resolved**: Does migration 000005 include `minutes_after_wake_up` in `sleep_sessions`?                                                                                                                                                                          | CU-043 pre-flight reads migration 000005. If column absent: add `database/migrations/000007_add_sleep_minutes_after_wake_up.sql` in the same CU-043 commit. Never edit an already-applied migration. |
| E-OQ-004 | **Assumption**: `provider_devices` table (Data Model V1.1 §27.1) is not created in Phase E. Device battery/sync metadata is deferred to Phase AA.                                                                                                                 | Assumed.                                                                                                                                                                                             |
| E-OQ-005 | **Assumption**: Workers `db/types.ts` is the sole typed DB interface for workers. It is maintained by hand to match the migrations. No code generation in Phase E.                                                                                                | Assumed per ADR-003.                                                                                                                                                                                 |
| E-OQ-006 | **Resolved**: `POST /api/v1/me/sync/refresh` queues only.                                                                                                                                                                                                         | Queue only: insert `provider_sync_jobs` row with `status: 'queued'`. Actual execution is workers' responsibility. Mobile polls `GET /sync/status`.                                                   |
| E-OQ-007 | **Resolved**: `DataQualityValue` sourcing.                                                                                                                                                                                                                        | CU-041 pre-flight reads `packages/core-types/src/metrics.ts`. Reuse existing quality type; do not create a duplicate. If absent, add to core-types (not workers).                                    |
| E-OQ-008 | **Assumption**: Live mode spike script uses `GOOGLE_HEALTH_TEST_ACCESS_TOKEN` directly for Phase E simplicity. The full OAuth flow is exercised by the app UI in Phase G.                                                                                         | Assumed for Phase E spike script simplicity.                                                                                                                                                         |

---

## 11. Next Phase Preview (Phase F Awareness Only)

Phase F (CU-047–CU-057) builds on Phase E's output. Phase E must not implement Phase F work but should be aware of these dependencies so Phase E code does not block Phase F.

| Phase F need                                                                      | Phase E setup                                                                                                                     |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `daily_metric_summaries` computation                                              | CU-044 `writeNormalizedRecords` returns `affectedDates` via `ScoringEnqueuePort` interface; Phase F wires the real implementation |
| `rolling_metric_baselines` computation                                            | Same `affectedDates` pattern                                                                                                      |
| Sleep Score engine reads `sleep_sessions`, `sleep_stage_intervals`                | CU-043 normalizes and writes these rows                                                                                           |
| Recovery Score reads `hrv_daily_mean`, `resting_heart_rate` `metric_observations` | CU-042 normalizes and writes these rows                                                                                           |
| Scoring `@primis/scoring` package bootstrap                                       | Currently `packages/scoring/.gitkeep` — Phase F CU-047 bootstraps it                                                              |
| Dashboard API reads `home_daily_snapshot` cache                                   | Phase F CU-056/057 — not a Phase E concern                                                                                        |

**Phase E must not:**

- Pre-populate `daily_metric_summaries` or `rolling_metric_baselines`.
- Compute any `score_snapshots`.
- Call `@primis/scoring` (it is still a `.gitkeep`).
- Emit real SQS messages (use `NoopScoringEnqueuePort`).

---

_End of Phase E Implementation Plan_

# Phase B — Shared Contracts and Health Model Foundations

**Plan version:** 1.1
**Created:** 2026-06-09
**Last updated:** 2026-06-09
**Scope:** CU-008 through CU-013
**Optimized for:** Sequential AI coding-agent execution, one commit unit at a time
**Prerequisite:** Phase A DoD checklist (see `plans/phase-a-repo-tooling-foundation.md §7`) must be fully green before CU-008 begins.

---

## 1. Phase B Goal and Non-Goals

### Goal

Lock in the shared TypeScript vocabulary — domain enums, canonical metric registry, unit conversion
utilities, API response envelope, score snapshot DTOs, and fixture redaction helpers — that every
subsequent phase (backend, mobile, scoring, AI) will import. Phase B produces zero-I/O, pure
TypeScript packages. No runtime infrastructure is required.

When Phase B is complete, a new contributor or AI coding agent can:

- Import any Primis domain enum from `@primis/core-types` without looking up raw string values.
- Look up any canonical metric code and its metadata from `@primis/health-metrics`.
- Convert provider units to canonical units using pure functions from `@primis/health-metrics`.
- Shape any API response using the typed envelope from `@primis/api-contracts`.
- Describe score state, confidence, band, and data-quality completeness using DTOs from `@primis/api-contracts`.
- Safely redact sensitive fields from a fixture before committing it.

### Non-Goals for Phase B

- No database migrations, SQL DDL, or ORM schemas.
- No backend routes, Lambda handlers, or API Gateway configuration.
- No mobile screens, UI components, or design tokens.
- No scoring formula implementation (beyond DTO/type definitions).
- No AI gateway, prompt templates, or model calls.
- No `packages/scoring` source code (Phase F).
- No `packages/design-system` source code (Phase C).
- No real provider API clients or sync jobs.
- No real provider credentials, OAuth tokens, or secrets.
- No metric codes invented outside `primis_data_model_health_metric_schema.md §9.2`.

---

## 2. Required Source Documents

Before implementing any CU in Phase B, the executing agent MUST read the following sections.

| Priority | Document                                         | Sections to read                       | Why                                                                                                                  |
| -------- | ------------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1        | `primis_full_implementation_spec_commit_plan.md` | §0–§5, Phase B CU-008–013, §9          | Commit sequencing authority; branch naming; verification commands; acceptance criteria                               |
| 2        | `primis_data_model_health_metric_schema.md`      | §0, §5.3, §5.4, §5.5, §8.1, §9.1, §9.2 | Provider enum values (authority), canonical metric codes, unit conventions, sensitivity classification               |
| 3        | `primis_scoring_algorithms_spec.md`              | §0, §6, §8.1–§8.4                      | Score scale, ScoreState enum, ScoreConfidence enum, ScoreBand ranges, ScoreQualityMetadata shape, MissingReason enum |
| 4        | `primis_ai_context_engine_spec.md`               | §0, §7.2, §8.1                         | AiIntent enum, ContextDomain enum                                                                                    |
| 5        | `primis_technical_architecture_document.md`      | §0, §6.3, §7.2, §7.3                   | TypeScript/Zod decisions; code boundary rules; package naming clarification                                          |
| 6        | `primis_mvp_build_plan_milestones.md`            | §0, §0.5                               | Health-data-model-first constraint; build order gate                                                                 |
| 7        | `plans/phase-a-repo-tooling-foundation.md`       | §5 (guardrails), §7 (DoD)              | Phase A baseline confirmed; same guardrails apply in Phase B                                                         |

### Source priority order (conflict resolution)

If documents conflict, resolve in this order:

1. `primis_full_implementation_spec_commit_plan.md` — commit sequencing authority
2. `primis_mvp_build_plan_milestones.md` — milestone/gate intent
3. `primis_technical_architecture_document.md` — system boundaries
4. `primis_data_model_health_metric_schema.md` — **schema and metric names** (enum string values)
5. `primis_scoring_algorithms_spec.md` — algorithm/type rules
6. `primis_ai_context_engine_spec.md` — AI behavior rules

If a real-world implementation finding contradicts any source doc, create `docs/decisions/ADR-000X-<topic>.md` instead of silently changing the doc.

---

## 3. Phase B Dependency Graph

```
Phase A complete (CU-001–CU-007)
  └─> CU-008  packages/core-types — domain enums (no new package deps)
        └─> CU-009  packages/health-metrics — metric registry (imports @primis/core-types)
              └─> CU-010  packages/health-metrics — unit conversion (same package as CU-009)
                    └─> CU-011  packages/api-contracts — envelope + error schema (no core-types dep)
                          └─> CU-012  packages/api-contracts — score + DQ DTOs (imports @primis/core-types + api-contracts envelope)
                                └─> CU-013  scripts/ + core-types — fixture redaction helper (imports @primis/core-types)
```

**Hard rule:** Do not start CU-N+1 until CU-N's acceptance criteria and all verification commands
pass with exit code 0.

**Package dependency summary:**

| Package                     | Imports from                                    |
| --------------------------- | ----------------------------------------------- |
| `@primis/core-types`        | `@primis/config` (none required for types-only) |
| `@primis/health-metrics`    | `@primis/core-types`                            |
| `@primis/api-contracts`     | `@primis/core-types` (CU-012 only), `zod`       |
| `scripts/redact-fixture.ts` | `@primis/core-types` (sensitivity types)        |

---

## 4. Commit Units

---

### CU-008 — Create core type package with domain enums

**Branch name:** `cu/cu-008-core-types`

**Commit message:** `types: add core Primis domain enums (CU-008)`

#### Goal

Establish the shared TypeScript enum vocabulary before any DB/API/UI code is written. This
package is a leaf dependency — it has no runtime dependencies on other Phase B packages.

Every subsequent package that needs a provider code, score type, sync status, AI intent, or
data-sensitivity level imports it from here.

#### Relevant docs / sections

- `primis_data_model_health_metric_schema.md` §8.1 (provider enum values), §5.4 (sensitivity levels), §8.2–§8.5 (connection/sync statuses), §10.2 (DataQualityLabel values)
- `primis_scoring_algorithms_spec.md` §6.2–§6.4 (ScoreBand, ScoreState, ScoreConfidence)
- `primis_ai_context_engine_spec.md` §7.2 (AiIntent), §8.1 (ContextDomain)
- `primis_full_implementation_spec_commit_plan.md` Phase B CU-008

#### Files created

```text
packages/core-types/package.json
packages/core-types/tsconfig.json
packages/core-types/vitest.config.ts
packages/core-types/src/provider.ts      — ProviderCode, ConnectionStatus, ProviderDataAvailabilityStatus,
                                            MappingVerificationStatus, SyncJobType, SyncJobStatus
packages/core-types/src/metrics.ts       — MetricCategory, ValueType, SamplingType, AggregationMethod,
                                            DataQualityLabel, MissingReason, DataSensitivityLevel
packages/core-types/src/scores.ts        — ScoreType, ScoreState, ScoreConfidence, ScoreBand, SCORE_BAND_RANGES,
                                            scoreToBand()
packages/core-types/src/ai.ts            — AiIntent, ContextDomain
packages/core-types/src/index.ts         — re-exports all
packages/core-types/test/enums.test.ts   — exhaustiveness, scoreToBand(), band ranges
docs/decisions/ADR-001-provider-code-naming.md   — resolves naming conflict before any DB/API code uses it
```

#### In scope

**`package.json`** shape (no runtime deps beyond Node built-ins for types):

```json
{
  "name": "@primis/core-types",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc"
  }
}
```

**`docs/decisions/ADR-001-provider-code-naming.md`** must be created as part of this CU with the
following content (adapt date and status fields):

````markdown
# ADR-001: Canonical Provider Code Naming

**Date:** 2026-06-09
**Status:** Accepted

## Context

`primis_data_model_health_metric_schema.md §8.1` defines provider codes as:
`healthkit`, `health_connect`.

`primis_full_implementation_spec_commit_plan.md` CU-008 acceptance criteria names them:
`apple_healthkit`, `android_health_connect`.

These string values will be stored in `provider_connections.provider_code` database rows,
`metric_observations.source_provider` columns, and API response bodies. Changing them after
data exists requires a migration.

## Decision

Use the **Data Model §8.1 values** as the canonical stored/typed values:

- `healthkit` (not `apple_healthkit`)
- `health_connect` (not `android_health_connect`)

The descriptive names `apple_healthkit` / `android_health_connect` appear in architecture
and planning docs as human-readable labels only. They are not stored values.

The complete canonical provider code list is:

```text
google_health
healthkit
health_connect
hume_via_healthkit
hume_direct_unverified
fooddata_central
manual
primis_internal
```
````

## Consequences

- All future commits referencing a provider code MUST use these exact strings.
- The implementation spec CU-008 acceptance criteria (`apple_healthkit`, `android_health_connect`)
  is superseded by this ADR for the actual TypeScript enum values.
- Future agents reading CU-008 acceptance criteria should consult this ADR first.

````

**`src/provider.ts`** must export:

- `PROVIDER_CODE` as const object — string values taken from **ADR-001** / Data Model §8.1:
  `google_health`, `healthkit`, `health_connect`, `hume_via_healthkit`, `hume_direct_unverified`,
  `fooddata_central`, `manual`, `primis_internal`
- `ProviderCode` union type derived from `typeof PROVIDER_CODE[keyof typeof PROVIDER_CODE]`
- `ConnectionStatus` — `'active' | 'needs_reauth' | 'revoked' | 'error' | 'disabled'`
- `ProviderDataAvailabilityStatus` — `'available' | 'unavailable' | 'permission_missing' | 'no_data_yet' | 'provider_unverified' | 'deprecated' | 'error'`
- `MappingVerificationStatus` — `'verified' | 'unverified' | 'deprecated'`
- `SyncJobType` — `'initial_backfill' | 'incremental' | 'manual_refresh' | 'webhook' | 'reprocess'`
- `SyncJobStatus` — `'queued' | 'running' | 'succeeded' | 'partial_success' | 'failed' | 'cancelled'`

**`src/metrics.ts`** must export:

- `MetricCategory` — `'activity' | 'sleep' | 'recovery' | 'vitals' | 'nutrition' | 'body_composition' | 'manual' | 'derived' | 'score'`
- `ValueType` — `'numeric' | 'boolean' | 'enum' | 'json'`
- `SamplingType` — `'point' | 'interval' | 'daily' | 'session' | 'event'`
- `AggregationMethod` — `'sum' | 'avg' | 'min' | 'max' | 'latest' | 'duration_weighted_avg' | 'none'`
- `DataQualityLabel` — `'normal' | 'estimated' | 'partial' | 'sparse' | 'stale' | 'duplicate_candidate' | 'corrected' | 'low_confidence'` (from Data Model §10.2)
- `MissingReason` — the 8-value union from Scoring Spec §8.3
- `DataSensitivityLevel` — `'S0' | 'S1' | 'S2' | 'S3' | 'S4'`

**`src/scores.ts`** must export:

- `ScoreType` — `'sleep' | 'recovery' | 'training_readiness' | 'activity' | 'nutrition' | 'wellbeing' | 'bedtime'`
- `ScoreState` — exact 7-value union from Scoring Spec §6.3
- `ScoreConfidence` — `'high' | 'medium' | 'low' | 'unknown'`
- `ScoreBand` — `'excellent' | 'good' | 'moderate' | 'low' | 'very_low'`
- `SCORE_BAND_RANGES` as const — min/max for each band from Scoring Spec §6.2
- `scoreToBand(score: number): ScoreBand` — pure function, throws on out-of-range

**`src/ai.ts`** must export:

- `AiIntent` — exact 19-value union from AI Context Engine Spec §7.2
- `ContextDomain` — exact 24-value union from AI Context Engine Spec §8.1

**`src/index.ts`** re-exports all named exports from all four files.

#### Out of scope

- No runtime logic beyond `scoreToBand()` and the `SCORE_BAND_RANGES` const.
- No Zod schemas in this package (Zod-based validation lives in `@primis/api-contracts`).
- No database-related types (those are Phase D).
- No future provider codes beyond what Data Model §8.1 lists.
- No `@primis/config` dependency.

#### Acceptance criteria

- `pnpm --filter @primis/core-types typecheck` exits 0.
- `pnpm --filter @primis/core-types test` exits 0 with at least 5 passing tests.
- `ProviderCode` includes exactly the 8 values from ADR-001: `google_health`, `healthkit`, `health_connect`, `hume_via_healthkit`, `hume_direct_unverified`, `fooddata_central`, `manual`, `primis_internal`.
- `AiIntent` union matches AI Context Engine Spec §7.2 exactly (19 values).
- `ContextDomain` union matches AI Context Engine Spec §8.1 exactly (24 values).
- `ScoreState` has exactly 7 members matching Scoring Spec §6.3.
- `scoreToBand(85)` returns `'excellent'`; `scoreToBand(34)` returns `'very_low'`.
- No `any` types introduced.
- `src/index.ts` re-exports every named export.
- Package has no runtime dependencies on other `@primis/*` packages.

#### Verification commands

```bash
pnpm install
pnpm --filter @primis/core-types typecheck
pnpm --filter @primis/core-types test
pnpm lint
````

#### Likely pitfalls

- The `PROVIDER_CODE` const must use the 8 canonical string values from ADR-001. **Do not use
  `apple_healthkit` or `android_health_connect`** — those are planning-doc labels, not stored
  values. See `docs/decisions/ADR-001-provider-code-naming.md`.
- The `scoreToBand` function must cover the full 0–100 range with no gap between bands; test
  boundary values (0, 34, 35, 54, 55, 69, 70, 84, 85, 100).
- `"exports": { ".": "./src/index.ts" }` allows direct TypeScript import in a pnpm workspace
  without a build step. Confirm the root `tsconfig.base.json` `moduleResolution` supports this.
- Do not add `"sync.ts"` as a separate file (the spec lists it as a file option; the sync enums
  can live in `provider.ts` for compactness unless the executing agent judges a separate file
  is cleaner — document the decision).
- Add the package to the Vitest workspace glob in root `vitest.config.ts` if it is not already
  covered by `packages/*/vitest.config.ts`.

---

### CU-009 — Create canonical metric registry package

**Branch name:** `cu/cu-009-metric-registry`

**Commit message:** `metrics: add canonical metric registry (CU-009)`

#### Goal

Define every canonical metric code once, with full metadata, so backend ingestion, scoring, and
UI all share the same source of truth. The registry is an in-process, immutable record — not a
database query.

#### Relevant docs / sections

- `primis_data_model_health_metric_schema.md` §9.1 (metric_definitions table shape), §9.2 (complete metric code tables by category)
- `primis_full_implementation_spec_commit_plan.md` Phase B CU-009

#### Files created

```text
packages/health-metrics/package.json
packages/health-metrics/tsconfig.json
packages/health-metrics/vitest.config.ts
packages/health-metrics/src/registry.ts      — MetricDefinition interface, METRIC_DEFINITIONS record
packages/health-metrics/src/categories.ts    — metric code lists grouped by category (typed string literal arrays)
packages/health-metrics/src/index.ts         — re-exports
packages/health-metrics/test/registry.test.ts
```

#### In scope

**`package.json`**:

```json
{
  "name": "@primis/health-metrics",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "dependencies": { "@primis/core-types": "workspace:*" },
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run", "build": "tsc" }
}
```

**`MetricDefinition` interface** (mirrors Data Model §9.1 columns as TS types):

```typescript
export interface MetricDefinition {
  readonly code: string;
  readonly displayName: string;
  readonly category: MetricCategory;
  readonly valueType: ValueType;
  readonly canonicalUnit: string | null;
  readonly samplingType: SamplingType;
  readonly defaultAggregation: AggregationMethod;
  readonly higherIsBetter: boolean | null;
  readonly description?: string;
}
```

**`METRIC_DEFINITIONS`**: `Readonly<Record<string, MetricDefinition>>` keyed by metric code.
Must include every metric code listed in Data Model §9.2 across all categories:

- Activity (13 codes): `steps`, `floors`, `distance_m`, `active_energy_kcal`, `resting_energy_kcal`, `total_energy_kcal`, `active_minutes`, `sedentary_minutes`, `active_zone_minutes`, `time_in_hr_zone`, `calories_in_hr_zone`, `vo2_max`, `run_vo2_max`
- Vitals (9 codes): `heart_rate`, `resting_heart_rate`, `hrv_rmssd`, `hrv_daily_mean`, `oxygen_saturation`, `respiratory_rate`, `sleep_respiratory_rate`, `skin_temp_delta_c`, `body_temp_c`
- Body composition (11 codes): `weight_kg`, `body_fat_pct`, `lean_mass_kg`, `fat_mass_kg`, `bmi`, `bone_mass_kg`, `body_water_pct`, `visceral_fat_index`, `basal_metabolic_rate_kcal`, `segmental_lean_mass`, `segmental_fat_mass`
- Sleep (12 codes): `sleep_duration`, `time_in_bed`, `sleep_efficiency`, `deep_sleep_duration`, `rem_sleep_duration`, `light_sleep_duration`, `awake_duration`, `sleep_latency`, `wake_after_sleep_onset`, `sleep_consistency`, `sleep_debt_seconds`, `chronotype_offset_minutes`
- Nutrition/manual (17 codes): `calories_in_kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `sugar_g`, `sodium_mg`, `hydration_ml`, `caffeine_mg`, `latest_caffeine_time`, `alcohol_standard_drinks`, `latest_alcohol_time`, `energy_subjective`, `mood_subjective`, `stress_subjective`, `soreness_subjective`, `productivity_subjective`
- Derived score metrics (7 codes): `sleep_score`, `recovery_score`, `training_readiness_score`, `strain_score`, `nutrition_score`, `wellbeing_score`, `bedtime_adherence_score`

**`src/categories.ts`** exports typed arrays of metric codes per category for consumers that need
to iterate by domain (e.g. `ACTIVITY_METRIC_CODES`, `SLEEP_METRIC_CODES`).

**`getMetric(code: string): MetricDefinition`** — helper that returns the definition or throws a
typed `UnknownMetricCodeError`.

#### Out of scope

- No unit conversion logic (that is CU-010).
- No provider-specific metric mappings (those are database rows, not package code).
- No metric codes invented beyond Data Model §9.2.
- No database queries; the registry is a static in-process constant.

#### Acceptance criteria

- `pnpm --filter @primis/health-metrics typecheck` exits 0.
- `pnpm --filter @primis/health-metrics test` exits 0.
- Tests assert all metric codes are unique strings.
- Tests assert every entry has a non-empty `code`, `displayName`, `category`, and `samplingType`.
- Tests assert total metric count matches the expected count from Data Model §9.2 (count per category is documented in the test file).
- `getMetric('steps')` returns the correct definition without error.
- `getMetric('made_up_code')` throws `UnknownMetricCodeError`.
- No `any` types.

#### Verification commands

```bash
pnpm install
pnpm --filter @primis/health-metrics typecheck
pnpm --filter @primis/health-metrics test
pnpm lint
```

#### Likely pitfalls

- Unit values for derived/score metrics use `'score_0_100'` or `'score_1_5'` strings per the
  data model table — do not normalize these to numeric units.
- `latest_caffeine_time` and `latest_alcohol_time` have `valueType: 'json'` / `canonicalUnit: 'timestamp'` — confirm against data model rather than assuming numeric.
- `segmental_lean_mass` and `segmental_fat_mass` have `valueType: 'json'` — type as such.
- The metric definitions registry must be `readonly` (or `Object.freeze`d) to prevent accidental
  mutation in tests or service code.
- Do not add a `normalRange` field yet unless the data model §9.1 `normal_range` is fully defined
  for all metrics. Leave it as an optional field defaulting to `{}` if included.

---

### CU-010 — Add unit conversion utilities

**Branch name:** `cu/cu-010-unit-conversion`

**Commit message:** `metrics: add canonical unit conversion utilities (CU-010)`

#### Goal

Provide pure, tested functions to convert provider-supplied units into canonical Primis units
at ingestion time, and canonical units into user-preferred display units. The functions must be
deterministic, throw typed errors on invalid conversions, and never mutate state.

#### Relevant docs / sections

- `primis_data_model_health_metric_schema.md` §5.3 (canonical unit table)
- `primis_full_implementation_spec_commit_plan.md` Phase B CU-010

#### Files created (extends `packages/health-metrics`)

```text
packages/health-metrics/src/units.ts
packages/health-metrics/test/units.test.ts
```

#### In scope

**`UnitConversionError`** — extends `Error`, includes `fromUnit` and `toUnit` properties.

**`CanonicalUnit`** type — string literal union of canonical unit strings from Data Model §5.3:
`'count' | 'meters' | 'seconds' | 'kcal' | 'bpm' | 'ms' | 'percent' | 'breaths_per_minute' | 'ml_per_kg_min' | 'celsius' | 'kg' | 'kg_m2' | 'milliliters' | 'milligrams' | 'standard_drinks' | 'grams' | 'score_0_100' | 'score_1_5' | 'score_0_5' | 'kcal_per_day' | 'index' | 'json' | 'timestamp'`

**`UNIT_CONVERSIONS`** — nested record of `from → to → (value: number) => number` pure conversion
functions. Must support:

| From          | To            | Conversion    |
| ------------- | ------------- | ------------- |
| `kg`          | `lb`          | × 2.20462     |
| `lb`          | `kg`          | × 0.453592    |
| `meters`      | `km`          | ÷ 1000        |
| `meters`      | `miles`       | × 0.000621371 |
| `km`          | `meters`      | × 1000        |
| `miles`       | `meters`      | × 1609.344    |
| `milliliters` | `fl_oz`       | × 0.033814    |
| `fl_oz`       | `milliliters` | × 29.5735     |
| `celsius`     | `fahrenheit`  | × 9/5 + 32    |
| `fahrenheit`  | `celsius`     | (−32) × 5/9   |
| `seconds`     | `minutes`     | ÷ 60          |
| `minutes`     | `seconds`     | × 60          |
| `seconds`     | `hours`       | ÷ 3600        |
| `hours`       | `seconds`     | × 3600        |

**`convertUnit(value: number, from: string, to: string): number`** — converts using
`UNIT_CONVERSIONS`; throws `UnitConversionError` if the conversion pair is not defined.

**`DISPLAY_UNIT_OPTIONS`** — const record mapping each canonical unit to valid display unit strings,
e.g. `{ meters: ['meters', 'km', 'miles'], kg: ['kg', 'lb'] }`.

#### Out of scope

- No conversion for `bpm`, `ms`, `percent`, `kcal` — these are display-identical to canonical.
- No locale-aware formatting (that is UI rendering, Phase C/G).
- No currency conversions or non-health units.

#### Acceptance criteria

- `pnpm --filter @primis/health-metrics test` exits 0 (covers both CU-009 and CU-010 tests).
- `convertUnit(1, 'kg', 'lb')` returns approximately 2.20462 (within 0.0001 epsilon).
- `convertUnit(1, 'lb', 'kg')` round-trips back to 1 (within 0.001 epsilon).
- `convertUnit(0, 'celsius', 'fahrenheit')` returns 32.
- `convertUnit(100, 'celsius', 'fahrenheit')` returns 212.
- `convertUnit(1000, 'meters', 'km')` returns 1.
- `convertUnit(1, 'kg', 'bpm')` throws `UnitConversionError`.
- `UnitConversionError` carries `fromUnit` and `toUnit` fields.
- No `any` types.

#### Verification commands

```bash
pnpm --filter @primis/health-metrics typecheck
pnpm --filter @primis/health-metrics test
pnpm lint
```

#### Likely pitfalls

- Floating-point precision: conversions involving imperial units will have rounding errors. Tests
  should use `Math.abs(result - expected) < epsilon` rather than strict equality.
- Do not add conversions that are not listed in the Data Model §5.3 canonical unit table —
  if a unit is not in the table, leave a `// TODO(ADR):` comment and create a decision record.
- Confirm the `packages/health-metrics/test/` or `test/` path convention matches the existing
  Vitest workspace glob in root `vitest.config.ts`.

---

### CU-011 — Add API contract envelope and error schema

**Branch name:** `cu/cu-011-api-contracts`

**Commit message:** `contracts: add API response and error contracts (CU-011)`

#### Goal

Standardize the shape of every API response — success and error — across the mobile app and all
backend services, before any route or screen is built. Zod schemas let both sides validate DTOs
at runtime without duplication.

#### Relevant docs / sections

- `primis_technical_architecture_document.md` §7.3 (ARCH-CODE-006: shared DTO schemas in packages)
- `primis_ai_context_engine_spec.md` §0, §9 (AI response schemas must conform to this envelope)
- `primis_full_implementation_spec_commit_plan.md` Phase B CU-011

#### Files created

```text
packages/api-contracts/package.json
packages/api-contracts/tsconfig.json
packages/api-contracts/vitest.config.ts
packages/api-contracts/src/envelope.ts      — ApiSuccessResponse, ApiErrorResponse, ApiResponse union,
                                              makeSuccessResponse(), makeErrorResponse() helpers
packages/api-contracts/src/errors.ts        — ApiErrorCode, ApiError interface, Zod schemas
packages/api-contracts/src/pagination.ts    — PaginationMeta, PaginatedResponse, cursor/page variants
packages/api-contracts/src/index.ts         — re-exports
packages/api-contracts/test/envelope.test.ts
```

#### In scope

**`package.json`**:

```json
{
  "name": "@primis/api-contracts",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "dependencies": { "zod": "^3.x" },
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run", "build": "tsc" }
}
```

**`src/envelope.ts`** — export both TypeScript interfaces and matching Zod schemas:

```typescript
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
  requestId?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiError;
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function makeSuccessResponse<T>(
  data: T,
  meta?: Record<string, unknown>,
): ApiSuccessResponse<T>;
export function makeErrorResponse(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ApiErrorResponse;
```

**`src/errors.ts`** must define:

- `ApiErrorCode` — string literal union:
  `'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'NOT_FOUND' | 'MISSING_DATA' | 'STALE_DATA' | 'PROVIDER_ERROR' | 'PROVIDER_RATE_LIMIT' | 'INTERNAL_ERROR' | 'SERVICE_UNAVAILABLE' | 'CONFLICT'`
- `ApiError` interface: `{ code: ApiErrorCode; message: string; details?: Record<string, unknown>; field?: string }`
- `ApiErrorCodeSchema` — Zod `z.enum([...])` for runtime validation
- `ApiErrorSchema` — Zod object schema matching `ApiError`

**`src/pagination.ts`** must define:

- `PaginationMeta`: `{ page: number; pageSize: number; total: number; hasNext: boolean; hasPrev: boolean; cursor?: string }`
- `PaginatedResponse<T>`: `{ items: T[]; pagination: PaginationMeta }`
- Zod schema for `PaginationMeta`

#### Out of scope

- No route-specific response shapes (those are Phase D).
- No score-specific DTOs (CU-012).
- Do not import from `@primis/core-types` in CU-011. Error codes are API-level strings, not
  domain enums. (CU-012 will add the cross-package dep for score types.)

#### Acceptance criteria

- `pnpm --filter @primis/api-contracts typecheck` exits 0.
- `pnpm --filter @primis/api-contracts test` exits 0.
- `makeSuccessResponse({ id: '1' })` returns `{ success: true, data: { id: '1' } }`.
- `makeErrorResponse('NOT_FOUND', 'Resource not found')` returns `{ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } }`.
- Zod schema rejects a response with `success: true` but no `data` field.
- Zod schema rejects an `ApiError` with an unknown `code` value.
- No `any` types.

#### Verification commands

```bash
pnpm install
pnpm --filter @primis/api-contracts typecheck
pnpm --filter @primis/api-contracts test
pnpm lint
```

#### Likely pitfalls

- Zod generic schemas for `ApiResponse<T>` require careful handling. Use `z.unknown()` for the
  `data` field in the base schema and let callers refine with `.extend()` or `.transform()`.
- `zod@^3.x` — verify the version is compatible with the TypeScript version already in the
  workspace (`@primis/config` already uses Zod; align the version).
- The `ApiErrorCode` string union must be kept in sync between the TypeScript type and the Zod
  `z.enum([...])` call. Consider deriving the TS type from Zod to avoid drift:
  `type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>`.

---

### CU-012 — Add score and data-quality DTOs

**Branch name:** `cu/cu-012-score-dtos`

**Commit message:** `contracts: add score snapshot and data quality DTOs (CU-012)`

#### Goal

Define the exact shape of score snapshot and data-quality objects that the backend will produce
and the mobile app will consume. Locking in these DTOs now prevents shape drift between the
scoring engine (Phase F), API routes (Phase D), and mobile screens (Phase G).

#### Relevant docs / sections

- `primis_scoring_algorithms_spec.md` §6, §8.4 (ScoreQualityMetadata shape), §10.10 (SleepScoreSnapshot shape reference), §11-§14 (other score output shapes)
- `primis_data_model_health_metric_schema.md` score tables section (for component/driver shape)
- `primis_full_implementation_spec_commit_plan.md` Phase B CU-012

#### Files created (extends `packages/api-contracts`)

```text
packages/api-contracts/src/scores.ts
packages/api-contracts/src/dataQuality.ts
packages/api-contracts/test/scores.test.ts
```

**Add dependency to `packages/api-contracts/package.json`:**

```json
"dependencies": {
  "@primis/core-types": "workspace:*",
  "zod": "^3.x"
}
```

#### In scope

**`src/scores.ts`** must export:

```typescript
// Shape that the backend score engine writes and the mobile app reads.
export interface ScoreSnapshotDto {
  scoreType: ScoreType; // from @primis/core-types
  value: number | null; // 0–100; null when unavailable
  band: ScoreBand | null; // from @primis/core-types
  state: ScoreState; // from @primis/core-types
  confidence: ScoreConfidence; // from @primis/core-types
  localDate: string; // YYYY-MM-DD ISO date string
  algorithmVersion: string; // e.g. "1.0.0"
  components: ScoreComponentDto[];
  missingMetrics: MissingMetricDto[];
  topDrivers: ScoreDriverDto[];
  qualityMetadata: ScoreQualityMetadataDto;
}

export interface ScoreComponentDto {
  key: string;
  displayName: string;
  value: number | null;
  weight: number;
  contribution: number | null;
  missingReason: MissingReason | null; // from @primis/core-types
}

export interface MissingMetricDto {
  metricCode: string;
  reason: MissingReason; // from @primis/core-types
  isRequired: boolean;
}

export interface ScoreDriverDto {
  key: string;
  displayLabel: string;
  direction: 'positive' | 'negative' | 'neutral';
  magnitude: 'major' | 'minor';
}
```

**`src/dataQuality.ts`** must export:

```typescript
export interface ScoreQualityMetadataDto {
  scoreState: ScoreState; // from @primis/core-types
  confidence: ScoreConfidence;
  dataQualityScore: number; // 0–100, from Scoring Spec §8.1
  completenessRatio: number; // 0–1
  missingRequiredMetrics: string[];
  missingOptionalMetrics: string[];
  staleProviderConnections: string[]; // provider codes
  baselineStatus: 'ready' | 'partial' | 'learning' | 'unavailable';
}

export interface ProviderFreshnessDto {
  providerCode: string;
  lastSyncAt: string | null; // ISO 8601 UTC
  hoursSinceLastSync: number | null;
  recencyScore: number; // 0–100, from Scoring Spec §8.2
  isStale: boolean;
}
```

Export Zod schemas for both DTOs and a test fixture object per DTO.

**`test/scores.test.ts`** must:

- Validate a complete `ScoreSnapshotDto` fixture using the Zod schema.
- Assert that a score value of 101 fails Zod validation.
- Assert that an unknown `scoreType` fails Zod validation.
- Assert that `qualityMetadata.completenessRatio` must be 0–1 (not > 1).
- Validate a `DataQualityDto` fixture.

#### Out of scope

- No score computation logic.
- No database repository methods.
- No mobile rendering logic.
- Do not define score-type-specific shapes (SleepScoreSnapshot, RecoveryScoreSnapshot) here —
  use the generic `ScoreSnapshotDto` for Phase B. Specific shapes can extend it in Phase F if needed.

#### Acceptance criteria

- `pnpm --filter @primis/api-contracts typecheck` exits 0.
- `pnpm --filter @primis/api-contracts test` exits 0 and covers CU-011 + CU-012 tests.
- `ScoreSnapshotDto` includes all fields from Scoring Spec §8.4 ScoreQualityMetadata.
- Zod schema rejects a `value` outside 0–100.
- Zod schema rejects an unknown `scoreType`.
- No `any` types.
- `src/index.ts` re-exports all new exports.

#### Verification commands

```bash
pnpm --filter @primis/api-contracts typecheck
pnpm --filter @primis/api-contracts test
pnpm lint
```

#### Likely pitfalls

- `ScoreSnapshotDto.value` is `number | null`, not `number`. Zod: use `z.number().min(0).max(100).nullable()`.
- The `algorithmVersion` field is a string, not a semver object. Do not over-type it.
- Importing `ScoreType`, `ScoreState`, `ScoreConfidence`, `ScoreBand`, `MissingReason` from
  `@primis/core-types` requires that CU-008 is complete and the workspace symlink resolves.
  Confirm with `pnpm --filter @primis/core-types build` if TypeScript resolver struggles.
- `ScoreQualityMetadataDto.baselineStatus` is a 4-value literal union, not a reference to another
  enum — define it inline or as a local type alias.

---

### CU-013 — Add fixture redaction and no-secrets policy

**Branch name:** `cu/cu-013-fixture-redaction`

**Commit message:** `test: add fixture redaction policy and helpers (CU-013)`

#### Goal

Make provider/API fixture use safe from day one by providing a script and library function that
strips sensitive fields before committing fixtures. Also formalize the redaction policy that was
established in Phase A CU-005, adding concrete patterns and tooling.

#### Relevant docs / sections

- `primis_data_model_health_metric_schema.md` §5.4 (sensitivity levels S0–S4), §5.5 (deletion conventions)
- `primis_full_implementation_spec_commit_plan.md` Phase B CU-013
- `primis_mvp_build_plan_milestones.md` §7.6 (referenced as fixture redaction policy)
- `plans/phase-a-repo-tooling-foundation.md` §4 CU-005 (existing `database/fixtures/README.md`)

#### Files created / edited

```text
packages/core-types/src/redaction.ts         — RedactionPattern type, SENSITIVE_FIELD_PATTERNS,
                                               redactFixture() pure function
packages/core-types/test/redaction.test.ts   — tests that secrets are removed from fixtures
scripts/redact-fixture.ts                    — CLI wrapper: reads stdin JSON, writes redacted JSON to stdout
database/fixtures/README.md                  — UPDATE (do not overwrite): add section linking to the
                                               redact-fixture script and listing regex patterns
```

#### In scope

**`packages/core-types/src/redaction.ts`**:

```typescript
export type RedactionPattern = {
  name: string;
  fieldNamePatterns: RegExp[]; // match against JSON key names
  valuePatterns: RegExp[]; // match against string values
  replacement: string; // default: '[REDACTED]'
};

export const SENSITIVE_FIELD_PATTERNS: RedactionPattern[] = [
  // OAuth tokens
  {
    name: 'oauth_token',
    fieldNamePatterns: [/token/i, /access_token/i, /refresh_token/i],
    valuePatterns: [/^ya29\./],
    replacement: '[REDACTED_TOKEN]',
  },
  // Email addresses
  {
    name: 'email',
    fieldNamePatterns: [/email/i],
    valuePatterns: [/^[^@]+@[^@]+\.[^@]+$/],
    replacement: '[REDACTED_EMAIL]',
  },
  // UUIDs in user-identifying fields
  {
    name: 'user_id',
    fieldNamePatterns: [/^user_?id$/i, /^sub$/i],
    valuePatterns: [/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
    replacement: '[REDACTED_UUID]',
  },
  // API keys
  {
    name: 'api_key',
    fieldNamePatterns: [/api[_-]?key/i, /client[_-]?secret/i],
    valuePatterns: [/.+/],
    replacement: '[REDACTED_KEY]',
  },
  // Real names
  {
    name: 'name',
    fieldNamePatterns: [/^(display_)?name$/i, /^(first|last)_name$/i],
    valuePatterns: [/.+/],
    replacement: '[REDACTED_NAME]',
  },
];

export function redactFixture(input: unknown): unknown;
// Recursively walks the input object/array. For each string value,
// checks all patterns. For each key, checks fieldNamePatterns.
// Returns a new object with sensitive values replaced.
```

**`scripts/redact-fixture.ts`** — CLI that reads a JSON file from stdin, calls `redactFixture`,
and writes the redacted JSON to stdout:

```bash
# Usage:
pnpm tsx scripts/redact-fixture.ts < raw_fixture.json > redacted_fixture.json
```

**`database/fixtures/README.md`** — append a new section (do not overwrite Phase A content):

```markdown
## Redaction Tooling

Use `scripts/redact-fixture.ts` to redact sensitive fields from provider API responses
before committing them as fixtures. The script removes OAuth tokens, email addresses,
user UUIDs in identifying fields, API keys, and real names.

### Redaction pattern reference

See `packages/core-types/src/redaction.ts` for the canonical `SENSITIVE_FIELD_PATTERNS` list.
```

#### Out of scope

- No automatic CI gate that scans fixture files for secrets (that is a future quality gate).
- No redaction of numeric health values (steps, sleep duration, heart rate are fine to commit
  with realistic values as long as no real identifiers are present).
- No encryption of fixture files.

#### Acceptance criteria

- `pnpm --filter @primis/core-types test` exits 0 (includes new redaction tests).
- `redactFixture({ user_id: 'abc-123', email: 'real@user.com', steps: 8000 })` returns `{ user_id: '[REDACTED_UUID]', email: '[REDACTED_EMAIL]', steps: 8000 }`.
- `redactFixture` correctly recurses into nested objects and arrays.
- `redactFixture` does not mutate the input object.
- Running `echo '{"access_token":"ya29.abc"}' | pnpm tsx scripts/redact-fixture.ts` produces `{"access_token":"[REDACTED_TOKEN]"}`.
- `database/fixtures/README.md` references the script and patterns.

#### Verification commands

```bash
pnpm --filter @primis/core-types typecheck
pnpm --filter @primis/core-types test
echo '{"user_id":"123e4567-e89b-12d3-a456-426614174000","steps":8000}' | pnpm tsx scripts/redact-fixture.ts
pnpm lint
```

#### Likely pitfalls

- `tsx` must be available as a dev dependency (it is likely already in the root `package.json`
  from Phase A; confirm before adding it again).
- The `redactFixture` function must handle `null`, `undefined`, numbers, booleans, arrays, and
  nested objects without throwing.
- Pattern matching for UUIDs in `user_id` fields should be conservative — only redact when the
  field name matches AND the value looks like a UUID. Avoid redacting all UUID-shaped values
  regardless of field name (e.g. `metric_code_id` pointing to a known resource ID may be fine).
- The `scripts/` directory is at the repo root, not inside a package. `scripts/redact-fixture.ts`
  imports from `@primis/core-types` via workspace path; confirm resolution works from the root.

---

## 5. Phase-Level Guardrails

These rules apply to every CU in Phase B:

| Guardrail                          | Rule                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| No provider integration            | Do not call any Google Health, HealthKit, or Health Connect API.                                                                      |
| No database migrations             | No SQL DDL, no ORM migration files, no seed data.                                                                                     |
| No mobile screens                  | Do not touch `apps/mobile/` in any Phase B commit.                                                                                    |
| No backend routes                  | Do not touch `services/api/` or `services/workers/` in Phase B.                                                                       |
| No scoring formulas                | Phase B defines DTO shapes and enums only. Score calculation code lives in Phase F.                                                   |
| No AI provider calls               | No OpenAI, Anthropic, or any model provider API call.                                                                                 |
| No secrets committed               | No `.env`, OAuth tokens, real API keys, real user IDs, or real health payloads.                                                       |
| No ad hoc metric codes             | Every metric code used must exist in Data Model §9.2. Use `// TODO(ADR):` if you need a code not listed there.                        |
| Use ADR-001 provider codes         | Every provider code string must match ADR-001 values. `apple_healthkit` and `android_health_connect` are **not** valid stored values. |
| Do not silently change source docs | If implementation contradicts a source doc, create `docs/decisions/ADR-000X-<topic>.md`.                                              |

---

## 6. Handoff Prompt Template

Copy and adapt this template when handing a commit unit to a new agent session. Replace all
`<PLACEHOLDER>` values before sending.

```
You are a senior AI coding agent working on the Primis monorepo.

Your task is to implement exactly ONE commit unit: <CU-ID> — <CU-TITLE>.

BEFORE writing any code, read these documents in order:

1. docs/source-of-truth/primis_full_implementation_spec_commit_plan.md
   Read: §0–§4, Phase B <CU-ID> section, §9

2. docs/source-of-truth/primis_data_model_health_metric_schema.md
   Read: §0, §5.3, §5.4, §8.1, §9.2 (for CU-008/009); §5.3 only (for CU-010)

3. docs/source-of-truth/primis_scoring_algorithms_spec.md
   Read: §0, §6, §8.1–§8.4 (for CU-008/012); §0 only (for CU-009/010/011/013)

4. docs/source-of-truth/primis_ai_context_engine_spec.md
   Read: §0, §7.2, §8.1 (for CU-008 only); §0 only (for others)

5. plans/phase-b-shared-contracts-health-model-foundations.md
   Read: §4 <CU-ID> section, §5 Guardrails, §9 Open Questions

6. docs/decisions/ADR-001-provider-code-naming.md  (once CU-008 creates it)
   Required for any CU that references a provider code string value.

THEN implement only the files listed under "Files created" for <CU-ID> in this plan.

GUARDRAILS — apply to every line you write:
- Do not commit .env, real credentials, real provider payloads, or real health data with identifiers.
- Do not create mobile screens, database migrations, scoring formulas, or AI calls.
- Do not implement Phase C or later work.
- Do not invent metric codes, enum values, or DTO fields not in the source docs.
- If you find a conflict between source docs, create docs/decisions/ADR-<topic>.md — do not silently pick one.
- Use commit message format: `<area>: <short imperative> (<CU-ID>)`
- Use branch: `cu/<cu-id-lowercase>-<short-name>`

AFTER implementing:
1. Run all verification commands listed in the plan for <CU-ID>.
2. Run: pnpm lint && pnpm typecheck && pnpm test && pnpm format:check
3. Confirm all acceptance criteria are met.
4. State any known limitations or deferred decisions.
5. Note any source doc conflicts in docs/decisions/ before committing.
6. Do not commit until all checks are green.
```

---

## 7. Definition of Done for Phase B

Phase B is complete when ALL of the following are true:

### Package structure

- [ ] `packages/core-types/` has `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/`, and no `.gitkeep`.
- [ ] `packages/health-metrics/` has `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/`, and no `.gitkeep`.
- [ ] `packages/api-contracts/` has `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/`, and no `.gitkeep`.

### `@primis/core-types` (CU-008)

- [ ] `docs/decisions/ADR-001-provider-code-naming.md` exists and documents the canonical value decision.
- [ ] `ProviderCode` contains exactly the 8 values from ADR-001: `google_health`, `healthkit`, `health_connect`, `hume_via_healthkit`, `hume_direct_unverified`, `fooddata_central`, `manual`, `primis_internal`.
- [ ] `AiIntent` has exactly 19 values matching AI Context Engine Spec §7.2.
- [ ] `ContextDomain` has exactly 24 values matching AI Context Engine Spec §8.1.
- [ ] `ScoreState` has exactly 7 values matching Scoring Spec §6.3.
- [ ] `scoreToBand()` maps all boundary values correctly.
- [ ] `pnpm --filter @primis/core-types typecheck` exits 0.
- [ ] `pnpm --filter @primis/core-types test` exits 0.

### `@primis/health-metrics` (CU-009/010)

- [ ] `METRIC_DEFINITIONS` includes all metric codes from Data Model §9.2 (count per category documented in tests).
- [ ] `getMetric('unknown_code')` throws `UnknownMetricCodeError`.
- [ ] `convertUnit(1, 'kg', 'lb')` ≈ 2.20462 (within epsilon).
- [ ] `convertUnit(1, 'kg', 'bpm')` throws `UnitConversionError`.
- [ ] `pnpm --filter @primis/health-metrics typecheck` exits 0.
- [ ] `pnpm --filter @primis/health-metrics test` exits 0.

### `@primis/api-contracts` (CU-011/012)

- [ ] `makeSuccessResponse` and `makeErrorResponse` helpers exist and are tested.
- [ ] `ApiErrorCode` union includes all 11 codes listed in CU-011.
- [ ] `ScoreSnapshotDto` includes `scoreType`, `value`, `band`, `state`, `confidence`, `localDate`, `algorithmVersion`, `components`, `missingMetrics`, `topDrivers`, `qualityMetadata`.
- [ ] `ScoreQualityMetadataDto` mirrors Scoring Spec §8.4 `ScoreQualityMetadata` shape exactly.
- [ ] Zod schemas reject out-of-range `value` and unknown `scoreType`.
- [ ] `pnpm --filter @primis/api-contracts typecheck` exits 0.
- [ ] `pnpm --filter @primis/api-contracts test` exits 0.

### Fixture redaction (CU-013)

- [ ] `packages/core-types/src/redaction.ts` exports `redactFixture` and `SENSITIVE_FIELD_PATTERNS`.
- [ ] `redactFixture` removes OAuth tokens, email addresses, user UUIDs, API keys, and real names.
- [ ] `scripts/redact-fixture.ts` is executable as a CLI via `pnpm tsx`.
- [ ] `database/fixtures/README.md` references the script and patterns.

### CI and full suite

- [ ] `pnpm lint` exits 0 with zero warnings across all new files.
- [ ] `pnpm typecheck` exits 0 across all packages.
- [ ] `pnpm test` exits 0 across all packages.
- [ ] `pnpm format:check` exits 0 (no Prettier diff).
- [ ] GitHub Actions CI is green on a PR containing all Phase B commits.

### Guardrails verified

- [ ] `git grep -r "ya29\." packages/` returns nothing (no live OAuth tokens).
- [ ] `git grep -r "AKIA" .` returns nothing (no AWS key IDs).
- [ ] `git grep -r "@gmail.com\|@icloud.com\|@yahoo.com" database/fixtures/` returns nothing.
- [ ] No `.env` file in `git status` output.
- [ ] No metric codes in any source file that are not listed in Data Model §9.2.

---

## 8. Known Risks and Decisions to Defer

| Risk / Decision                                  | Status                                                                                                                                                                                                                                                   | Where to resolve                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Provider code naming conflict                    | **Resolved** — canonical values are `healthkit` and `health_connect` per Data Model §8.1. CU-008 creates `docs/decisions/ADR-001-provider-code-naming.md` to record the decision. Future agents must read the ADR before using any provider code string. | Closed — ADR-001 created in CU-008                        |
| Zod version alignment                            | `@primis/config` already uses Zod; `@primis/api-contracts` must match the same major version                                                                                                                                                             | Confirm in CU-011 before adding dependency                |
| `moduleResolution: "bundler"` import in scripts  | `scripts/redact-fixture.ts` at repo root imports from a workspace package; confirm `pnpm tsx` resolves workspace paths                                                                                                                                   | Test in CU-013                                            |
| `packages/scoring` initialization                | Phase B does not touch the `scoring` package; its `.gitkeep` remains                                                                                                                                                                                     | Phase F                                                   |
| `packages/design-system` initialization          | Phase B does not touch the `design-system` package                                                                                                                                                                                                       | Phase C                                                   |
| TypeScript project references / composite builds | `tsconfig.base.json` uses `moduleResolution: "bundler"`; backend services (Phase D) may need `node16`; ADR needed                                                                                                                                        | Phase D per `plans/phase-a-repo-tooling-foundation.md §8` |
| Generic vs. score-specific DTO shapes            | Phase B uses one generic `ScoreSnapshotDto`. Phase F scoring engine may need type-narrowed shapes per score type.                                                                                                                                        | Phase F — extend or specialize at that point              |
| `DataSensitivityLevel` placement                 | Included in `src/metrics.ts`. If it grows large, extract to `src/sensitivity.ts`.                                                                                                                                                                        | Agent decision at CU-008 time                             |
| `sync.ts` as separate file                       | Spec lists it; plan recommends merging into `provider.ts`.                                                                                                                                                                                               | Agent decision at CU-008 time; document choice            |

---

## 9. Open Questions / Assumptions

| ID      | Question / Assumption                                                                                                                                                                                                           | Impact                                                                                                            | Resolution path                                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-Q-001 | **Provider code naming conflict — RESOLVED.** `primis_data_model_health_metric_schema.md §8.1` uses `healthkit` / `health_connect`; the impl spec CU-008 acceptance criteria used `apple_healthkit` / `android_health_connect`. | `ProviderCode` values are stored in DB rows and API responses; changing them post-data requires a migration.      | **Decision (product owner, 2026-06-09):** Canonical stored values are the Data Model §8.1 names: `healthkit` and `health_connect`. The descriptive aliases in the impl spec are planning labels only, not stored values. CU-008 creates `docs/decisions/ADR-001-provider-code-naming.md` to record this permanently. All future agents must read ADR-001 before writing any provider code string. |
| B-Q-002 | Should `ScoreBand` include `'strain'` or `'bedtime'` bands or is the 5-band system (excellent/good/moderate/low/very_low) universal?                                                                                            | Scoring Spec §6.2 only defines 5 bands. Strain score and bedtime score may have different semantics.              | **Assumption:** Use the 5-band system for all `ScoreType` values in Phase B. Specialized bands can be added in Phase F via an ADR if needed.                                                                                                                                                                                                                                                      |
| B-Q-003 | Does `@primis/api-contracts` need to import from `@primis/core-types` in CU-011, or is it standalone?                                                                                                                           | Affects package dependency graph complexity.                                                                      | **Assumption:** CU-011 is standalone (no core-types dep). CU-012 adds the dep for score enums.                                                                                                                                                                                                                                                                                                    |
| B-Q-004 | Should `METRIC_DEFINITIONS` include `normal_range` per metric (as in Data Model §9.1 `metric_definitions.normal_range`)?                                                                                                        | Normal ranges may be population-level or computed — adding them now may require spec research that delays CU-009. | **Assumption:** Omit `normalRange` from `MetricDefinition` in Phase B. Add it when Phase F scoring needs it. Leave a `// TODO(Phase F):` comment in the interface.                                                                                                                                                                                                                                |
| B-Q-005 | Does `redactFixture` need to handle numeric health values (e.g., should it optionally blur heart rate data to prevent re-identification)?                                                                                       | Over-redaction would make fixtures useless for testing.                                                           | **Assumption:** Redact only identifiers (tokens, emails, UUIDs, names, keys). Leave numeric health values (steps, sleep duration, HR) intact in fixtures — they are not considered identifying on their own.                                                                                                                                                                                      |

---

## 10. Next Phase Preview — Phase C Awareness

**Phase B must be complete before Phase C begins.** Do not implement any Phase C work in Phase B.

Phase C — Mobile Shell and Design System (CU-014 onward) will:

- Initialize the Expo Dev Client mobile app (`apps/mobile/`)
- Add EAS build/update configuration
- Add Expo Router navigation shell
- Add design tokens and the `packages/design-system` package

**Phase C dependency on Phase B:**

- `apps/mobile/` will import `ScoreType`, `ScoreBand`, and `ProviderCode` from `@primis/core-types`.
- `apps/mobile/` will use `ScoreSnapshotDto` from `@primis/api-contracts` for mock data and TanStack Query response typing.
- `apps/mobile/` must not re-define any enum values from Phase B packages.
- `packages/design-system/` may import `MetricCategory` from `@primis/health-metrics` for category-aware design tokens.

**Before starting CU-014, the executing agent must:**

1. Confirm Phase B DoD checklist (§7 above) is fully checked.
2. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` and confirm all green.
3. Read `primis_technical_architecture_document.md` §6.1 (mobile stack) and `primis_ui_ux_design_system_spec.md` §0 before writing any mobile or design-system code.

---

_End of Phase B — Shared Contracts and Health Model Foundations Plan_

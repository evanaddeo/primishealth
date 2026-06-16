# Phase F — Summary, Baseline, Scoring, and Bedtime Engine

> **Status:** Planning artifact. Implementation-ready. One commit unit (CU) per Cursor-agent session.
> **Branch family:** `feature/summary-baseline-scoring-bedtime-engine` (per-CU work uses
> `cu/cu-0XX-<short-name>` per `.ai-agent-instructions.md` §Workflow).
> **Covers:** CU-047 → CU-057.
> **Authoritative sequencing:** `docs/source-of-truth/primis_full_implementation_spec_commit_plan.md`
> (Phase F section). This plan elaborates that spec; it does not override it. On any conflict, the
> source docs win in the priority order from `docs/README.md`.

---

## 1. Phase F goal and non-goals

### Goal

Build the **deterministic scoring and algorithm layer**: pure, explainable, versioned functions
that turn already-normalized health data into day-level summaries, personal baselines, and the
core Primis scores (Sleep, Recovery, Training Readiness, Activity, plus the Bedtime Planner), then
persist those outputs idempotently and serve them to mobile via precomputed read APIs.

The architecture flows: **normalized observations → daily summaries → rolling baselines → scores →
insight candidates → persisted snapshots → read APIs**. Every output must be explainable
(component breakdown + top drivers), versioned (`algorithm_version`), testable (golden fixtures),
and explicit about missing / stale / low-confidence data.

### Non-goals (explicitly out of scope for Phase F)

- ❌ Mobile screens (Home, Sleep, Recovery, Activity, Bedtime Planner UI) — Phase G.
- ❌ AI gateway, prompts, model calls, context builders, chat, or any LLM-generated score logic.
- ❌ Provider sync, live Google/Fitbit/Apple API calls, OAuth flows (done/owned by Phase E).
- ❌ Reading **raw provider payloads** inside scoring code — scoring consumes canonical normalized
  tables only.
- ❌ AWS deploy infra (EventBridge, SQS, Lambda wiring, CDK) — workers run locally in Phase F.
- ❌ Nutrition UI, manual-input UI, gut/body-composition/wellbeing/correlation engines
  (spec §16–§19, §22) — not in the CU-047→057 scope. Implement only Sleep, Recovery, Activity,
  Strain/Load, Training Readiness, and Bedtime.
- ❌ New database schema / migrations — **all Phase F tables already exist** (see §2).
- ❌ Rewriting any source-of-truth doc — material conflicts produce an ADR under `docs/decisions/`.

---

## 2. Current repo state (verified) — what to reuse and watch for

### 2.1 What Phases A–E already created

| Area                     | Artifact                                                                                                                                                                                                                                                                                                                                            | Phase F relevance                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Tooling                  | pnpm workspace, `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), root `vitest.workspace.ts`, ESLint/Prettier, CI in `.github/workflows/`                                                                                                                                                                    | All new packages/dirs must conform; CI runs `lint`/`typecheck`/`test`/`format:check`.                            |
| `@primis/core-types`     | `src/scores.ts` (`ScoreType`, `ScoreState`, `ScoreConfidence`, `ScoreBand`, `SCORE_BAND_RANGES`, `scoreToBand()`), `src/metrics.ts`, `src/redaction.ts`                                                                                                                                                                                             | **Reuse these enums/helpers. Do NOT redefine score taxonomy.**                                                   |
| `@primis/health-metrics` | `src/registry.ts`, `src/units.ts`, `src/categories.ts`                                                                                                                                                                                                                                                                                              | Canonical metric codes + units. Scoring inputs reference metric codes from here — **no ad hoc metric codes.**    |
| `@primis/api-contracts`  | `src/scores.ts` (311 lines), `src/dataQuality.ts` (169 lines), `src/envelope.ts`, `src/errors.ts`, `src/pagination.ts`                                                                                                                                                                                                                              | Score/data-quality response DTOs and the API envelope/error schema. CU-056/057 **reuse and extend** these.       |
| `@primis/scoring`        | **EMPTY** (`.gitkeep` only)                                                                                                                                                                                                                                                                                                                         | CU-047 bootstraps `package.json` + `tsconfig.json` + `vitest.config.ts` (mirror `@primis/health-metrics`).       |
| `database/migrations`    | `000001`–`000007`                                                                                                                                                                                                                                                                                                                                   | All Phase F tables exist (see §2.2). **Do not add migrations in Phase F.**                                       |
| `services/workers`       | `normalization/`, `sync/`, `providers/`, `repositories/`, `db/{client,types}.ts`, `storage/`                                                                                                                                                                                                                                                        | New `summaries/`, `baselines/`, `scoring/` dirs added here. Reuse `db/client.ts` (Kysely) + repository patterns. |
| `services/api`           | Repositories: `scoreRepository`, `dashboardRepository`, `sleepRepository`, `vitalRepository`, `activityRepository`, `insightRepository`, `metricRepository`, +more. Routes: `providerConnections`, `onboarding`, `me`, `user`, `sync`, `health`. Middleware: `requestId`, `errorHandler`. Auth: `authMiddleware`, `mockAuth`, `cognitoJwtVerifier`. | CU-056/057 add **routes only**, reusing existing repositories. No dashboard/score/detail route exists yet.       |
| Scripts                  | `db-migrate.ts`, `db-seed.ts`, `db-reset.sh`, `db-up.sh`, `redact-fixture.ts`                                                                                                                                                                                                                                                                       | Use for local DB + fixture redaction.                                                                            |
| Fixtures                 | `database/fixtures/` (`README.md`, `provider/`)                                                                                                                                                                                                                                                                                                     | Golden scoring fixtures (spec §27.2) live under `database/fixtures/` — **redacted only**.                        |

### 2.2 Phase F tables (already migrated — populate/read only)

- `daily_metric_summaries`, `rolling_metric_baselines` — `000004_metrics.sql`
- `sleep_sessions`, `sleep_stage_intervals`, `sleep_daily_features`, `workout_sessions`,
  `training_load_daily`, `vital_daily_features` — `000005_domain_tables.sql`
- `score_snapshots`, `score_component_values`, `insight_candidates`, `dashboard_widgets`,
  `theme_settings` — `000006_outputs_and_dashboard.sql`
- `algorithm_runs` (audit log) — referenced by `scoreRepository`; confirm exact location in
  `services/api/src/db/types.ts` before CU-055.

### 2.3 `scoreRepository` contract (critical for CU-055 idempotency)

`services/api/src/repositories/scoreRepository.ts` already provides:

- `upsertScoreSnapshot(NewScoreSnapshot)` — dedup key
  **`(user_id, score_type, local_date, algorithm_version)`**; on conflict updates mutable columns,
  **preserves original `generated_at`**, and **CASCADE-deletes child `score_component_values`** →
  callers must **re-insert component values after every upsert**.
- bulk insert for `score_component_values`; append-only `algorithm_runs`.
- **"Stores computed outputs only. Do NOT compute score values here."** The worker (CU-055) calls
  the pure engines, then writes through this layer (or the workers DB layer mirroring it).

### 2.4 ADRs affecting Phase F

| ADR                                        | Effect on Phase F                                                                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADR-003-query-layer-and-migrations.md`    | **Kysely is the exclusive query layer**; types are hand-maintained in `services/*/src/db/types.ts`; raw SQL migrations; no ORM codegen. All CU-048/049/055/056/057 DB access uses Kysely. |
| `ADR-001-provider-code-naming.md`          | Canonical provider codes — relevant when scores record provider freshness/availability.                                                                                                   |
| `ADR-002-ai-intent-count-discrepancy.md`   | AI scope only; informs the CU-055 insight-candidate / AI boundary (do not call AI).                                                                                                       |
| `ADR-0001-vitest-workspace-file-name.md`   | New packages must ship `vitest.config.ts` to be auto-discovered by the root workspace.                                                                                                    |
| `google-health-api-metric-availability.md` | **Required provider-availability context.** Scores MUST degrade confidence / mark missing/unverified per this doc — never assume HRV, SpO2, stages, respiratory rate, etc. are present.   |

### 2.5 Repo drift / mismatches executing agents must account for

1. **Spec §28 vs commit-plan paths.** Spec §28 shows a single monolithic `/src/scoring/...` tree.
   The commit plan (Priority 1) splits responsibilities across the monorepo. **Resolution:** pure,
   DB-free formula modules live in **`packages/scoring/src/`**; job orchestration + all DB I/O live
   in **`services/workers/src/`**. §28 informs file naming (`core/`, `sleep/`, `recovery/`,
   `training/`, `bedtime/`), but follow the commit-plan paths where they differ
   (e.g. CU-047 uses `packages/scoring/src/primitives/`, not `/core`).
2. **`scoreRepository` lives in `services/api`, not `services/workers`.** The CU-055 worker either
   imports a shared workers-side writer or reuses the api repository pattern via the workers Kysely
   client. Confirm where `algorithm_runs` / score types are declared (`services/api/src/db/types.ts`)
   and decide on a single write path in the CU-055 prompt (flag as "ask before implementing").
3. **`@primis/scoring` has no build/test config yet.** CU-047 must create them before any later CU
   can `import` from it.
4. **Score DTOs already exist** in `@primis/api-contracts/src/scores.ts`. CU-056/057 must read that
   file first and extend it rather than inventing parallel response types.

---

## 3. Required source docs and exact sections (read before each CU)

Always-read for every Phase F CU:

- `.ai-agent-instructions.md` (boundary rules), `CONTRIBUTING.md` (commit/branch format),
  `docs/README.md` (conflict-resolution priority).
- `primis_full_implementation_spec_commit_plan.md` — §1–§5, §3.5 Definition of Done, and the CU's
  own entry in the Phase F section.
- `primis_scoring_algorithms_spec.md` — §0 (agent instructions), §5 taxonomy, §6 scale/bands/states/
  confidence, §8 data quality, §26 versioning, §27 testing, §30 safety language.

Per-CU additional reading:

| CU  | Scoring spec                                  | Data model spec                                                                     | Other                                                    |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 047 | §7.1–7.9, §9.1–9.5, §8.1–8.4                  | —                                                                                   | TAD §0 (purity boundary)                                 |
| 048 | §8.3 missingness                              | `daily_metric_summaries`; §0; local_date/timezone conventions                       | TAD precompute + idempotency                             |
| 049 | §7.3–7.5, §8.1                                | `rolling_metric_baselines`                                                          | —                                                        |
| 050 | §10.1–10.11                                   | `sleep_daily_features`, `sleep_sessions`, `sleep_stage_intervals`                   | UI/UX Sleep (output shape)                               |
| 051 | §11, §10.6                                    | `sleep_daily_features`                                                              | —                                                        |
| 052 | §12.1–12.12                                   | `vital_daily_features`, `sleep_daily_features`                                      | PRD Recovery; provider-availability ADR                  |
| 053 | §13, §14, §15                                 | `daily_metric_summaries`, `workout_sessions`, `training_load_daily`                 | UI/UX Activity/Recovery                                  |
| 054 | §20.1–20.15                                   | `sleep_daily_features` (rhythm)                                                     | PRD Bedtime; UI/UX §6.3                                  |
| 055 | §25, §26, §21.1–21.6, §8.4, §24 (AI boundary) | `score_snapshots`, `score_component_values`, `insight_candidates`, `algorithm_runs` | TAD precompute/idempotency                               |
| 056 | §29.1                                         | `dashboard_widgets`, `score_snapshots`                                              | UI/UX Home; `api-contracts/scores.ts`                    |
| 057 | §29.2                                         | sleep/vital/activity tables                                                         | UI/UX Sleep/Recovery/Activity; `api-contracts/scores.ts` |

---

## 4. Dependency graph (CU-047 → CU-057)

```text
CU-047 primitives (packages/scoring, pure)
   │
   ├──────────────┬───────────────────────────────────────────────┐
   ▼              ▼                                                 │
CU-048 daily    CU-049 rolling baselines (worker)                  │
summaries        (needs summaries from 048)                        │
(worker)         │                                                 │
   └──────┬──────┘                                                 │
          ▼                                                        ▼
   ┌──────────────── scoring engines (packages/scoring, pure) ─────────────┐
   │ CU-050 Sleep Score                                                    │
   │ CU-051 Sleep debt + consistency  (feeds 050 debt component + 054)     │
   │ CU-052 Recovery Score            (needs baselines 049 + sleep 050/051)│
   │ CU-053 Activity / Strain / Load / Readiness (needs 049, 052, debt)    │
   └──────────────────────────┬────────────────────────────────────────────┘
                              ▼
                    CU-054 Bedtime Planner (needs sleep debt 051, rhythm, recovery 052)
                              ▼
                    CU-055 Score snapshot worker (orchestrates 048→054, writes snapshots + insights)
                              │
              ┌───────────────┴───────────────┐
              ▼                                ▼
       CU-056 Dashboard API            CU-057 Detail APIs
       (reads snapshots/insights)      (reads sleep/recovery/activity detail)
```

Hard ordering: **047 first**; **048 before 049**; **049 before 052/053**; **050/051 before 052 and
054**; **all engines before 055**; **055 before 056/057** (APIs read precomputed rows). 056 and 057
are parallelizable once 055 lands.

---

## 5. Phase-level guardrails (apply to every CU)

1. **Deterministic only.** Same inputs → same outputs. No randomness, no wall-clock inside formulas
   (pass `now`/`localDate` as parameters).
2. **No AI-generated score logic.** No LLM call computes or adjusts a score, band, or ranking.
3. **No raw provider payload reads in scoring code.** Scoring consumes canonical normalized tables
   / DTOs only. Raw payloads stay in the Phase E archive.
4. **No assumed provider scores or metrics.** Never assume HRV/SpO2/stages/respiratory/etc. exist.
   Degrade confidence or emit `not_enough_data` / `missing_required_data` per the provider-
   availability ADR and spec §8.3.
5. **No mobile screens, no provider sync, no live API calls, no AWS deploy infra.**
6. **No medical / diagnostic language.** Performance-only wording (spec §30). No "diagnosis",
   "disorder", "treat", etc.
7. **No competitor formulas.** Study-not-copy (spec §3.1). All formulas trace to the scoring spec.
8. **No ad hoc metric codes.** Use `@primis/health-metrics` registry codes only.
9. **No sensitive health data in logs, tests, or fixtures.** Fixtures redacted (spec §27, fixtures
   README). Respect data-sensitivity (S0–S4) classification.
10. **Pure formulas in `packages/scoring`; DB I/O only in `services/workers` / `services/api`.**
11. **Every derived record stores `algorithm_version` + `computed_at` + input window + component
    values + missing-data metadata** (spec §26.2).
12. **No source-doc rewrites.** Material conflicts → propose an ADR in `docs/decisions/`.

---

## 6. Commit units

> Each CU below is self-contained for a small Cursor prompt. Use the §7 handoff template.
> Branch: `cu/cu-0XX-<short-name>`. Commit message format: `<area>: <imperative summary> (CU-0XX)`.

### CU-047 — Scoring package primitives

- **Goal:** Bootstrap `@primis/scoring` and implement reusable, pure, DB-free primitives shared by
  every score module.
- **Read:** Scoring spec §7.1–7.9, §9.1–9.5, §8.1–8.4, §6; `@primis/health-metrics` package.json as
  scaffold template; `core-types/src/scores.ts`.
- **Build on:** `@primis/core-types` (`ScoreState`, `ScoreConfidence`, `ScoreBand`, `scoreToBand`).
- **Files created:**
  ```text
  packages/scoring/package.json            # name @primis/scoring, type module, deps @primis/core-types
  packages/scoring/tsconfig.json           # extends ../../tsconfig.base.json
  packages/scoring/vitest.config.ts        # auto-discovered by root workspace
  packages/scoring/src/index.ts
  packages/scoring/src/primitives/clamp.ts
  packages/scoring/src/primitives/weightedScore.ts   # missing-component reweighting (§7.2)
  packages/scoring/src/primitives/baseline.ts        # mean/median/sd/percentiles (§7.4)
  packages/scoring/src/primitives/deviation.ts       # z-score (§7.7), percent deviation (§7.8)
  packages/scoring/src/primitives/ema.ts             # §7.6
  packages/scoring/src/primitives/componentScores.ts # §9.1–9.5 target-range/deviation/baseline scores
  packages/scoring/src/primitives/confidence.ts      # §8 data-quality + confidence assignment
  packages/scoring/src/primitives/direction.ts       # §7.9 positive-vs-negative metadata
  packages/scoring/test/primitives.test.ts
  ```
- **In scope:** clamp; weighted score w/ missing-component handling; percent deviation; z-score;
  EMA; target-range / higher-is-better / lower-is-better component scores; confidence mapping.
- **Out of scope:** any specific score (sleep/recovery/etc.); any DB or I/O; reading metric data.
- **Acceptance:** implements all listed primitives; edge + missing-data cases tested; **zero runtime
  deps except `@primis/core-types`**; no DB import; `index.ts` re-exports the public surface.
- **Verify:** `pnpm --filter @primis/scoring test` · `pnpm --filter @primis/scoring typecheck` ·
  root `pnpm lint`.
- **Pitfalls:** floating-point tolerance in tests; `noUncheckedIndexedAccess` on array access;
  weighted-score must renormalize when components are absent (not treat missing as 0).
- **Ask first?** No.
- **Commit:** `scoring: add core scoring primitives (CU-047)`

### CU-048 — Daily metric summary builder

- **Goal:** Aggregate normalized metric observations into `daily_metric_summaries` per
  user/local_date/timezone, idempotently. **No user-facing scores.**
- **Read:** Data model `daily_metric_summaries` + local_date/timezone conventions + §0; scoring spec
  §8.3; TAD precompute/idempotency; existing `services/workers/src/normalization/*` and
  `repositories/normalizedRecordWriter.ts` for patterns; `services/workers/src/db/client.ts`.
- **Files created:**
  ```text
  services/workers/src/summaries/buildDailyMetricSummaries.ts
  services/workers/src/summaries/aggregations.ts          # sum/avg/min/max/latest/duration-weighted avg
  services/workers/test/summaries/dailyMetricSummaries.test.ts
  ```
- **In scope:** sum, avg, min, max, latest, duration-weighted avg aggregations; grouping by
  user/local_date/timezone; idempotent re-run (upsert); fixture-driven tests.
- **Out of scope:** baselines (CU-049); any score; raw provider reads.
- **Acceptance:** all six aggregation modes; correct local_date bucketing across timezones;
  re-runnable/idempotent (second run = no duplicate rows, stable values); tests use redacted fixture
  observations.
- **Verify:** `pnpm --filter @primis/workers test` · `pnpm --filter @primis/workers typecheck`.
- **Pitfalls:** timezone/local_date boundary correctness (UTC vs local midnight); duration-weighted
  avg with gaps; idempotent upsert dedup key must match the migration's unique constraint.
- **Ask first?** No — but confirm the unique key on `daily_metric_summaries` from the migration.
- **Commit:** `summaries: add daily metric summary builder (CU-048)`

### CU-049 — Rolling baseline builder

- **Goal:** Compute personal `rolling_metric_baselines` over 7/14/30/60/90-day windows with correct
  eligibility/status. **No recovery/sleep/readiness scores.**
- **Read:** Scoring spec §7.3–7.5, §8.1; data model `rolling_metric_baselines`; CU-048 output.
- **Files created:**
  ```text
  services/workers/src/baselines/buildRollingBaselines.ts
  services/workers/test/baselines/buildRollingBaselines.test.ts
  ```
  Reuse `packages/scoring/src/primitives/baseline.ts` for the math.
- **In scope:** windows 7/14/30/60/90; mean, median, min, max, sd, p10/p25/p75/p90, sample count,
  completeness; store `algorithm_version`; emit `learning` / `partial` (and eligible) status by
  sample thresholds (§7.5).
- **Out of scope:** consuming baselines in scores; any score computation.
- **Acceptance:** correct stats per window; status reflects sample thresholds; `algorithm_version`
  stored; idempotent; sparse-data tests assert `learning`/`partial`.
- **Verify:** `pnpm --filter @primis/workers test` · `typecheck`.
- **Pitfalls:** percentile interpolation method must match spec; insufficient-sample handling must
  not throw; completeness = observed/expected days in window.
- **Ask first?** No.
- **Commit:** `baselines: add rolling metric baseline builder (CU-049)`

### CU-050 — Sleep Score engine

- **Goal:** Pure, explainable Sleep Score from canonical sleep inputs (not raw payloads, not
  provider proprietary scores).
- **Read:** Scoring spec §10.1–10.11; data model `sleep_daily_features`/`sleep_sessions`/
  `sleep_stage_intervals`; provider-availability ADR (stages may be missing).
- **Files created:**
  ```text
  packages/scoring/src/sleep/sleepScore.ts
  packages/scoring/src/sleep/sleepComponents.ts
  packages/scoring/test/sleepScore.test.ts
  ```
- **In scope:** duration (§10.4), efficiency (§10.5), consistency (§10.6 — may call CU-051 helper),
  stage balance (§10.7), overnight recovery signals (§10.8), sleep-debt impact (§10.9) components;
  output object (§10.10) with component values + top reasons + `algorithm_version` (`sleep_score_v1_0`).
- **Out of scope:** persistence; debt/consistency primitives owned by CU-051 (import them);
  recovery score.
- **Acceptance:** computes available components; missing stages → lower confidence; **missing sleep
  duration → `missing_required_data`**; returns components + top drivers; version included;
  score ∈ [0,100].
- **Verify:** `pnpm --filter @primis/scoring test` · `typecheck`.
- **Pitfalls:** monotonicity invariant (more duration toward target never lowers duration score —
  spec §27.4); confidence must degrade, not crash, on missing optional inputs.
- **Ask first?** No — but if CU-051 not yet merged, stub the debt-impact input behind an interface.
- **Commit:** `scoring: implement Sleep Score engine (CU-050)`

### CU-051 — Sleep debt and sleep consistency engines

- **Goal:** Rolling sleep debt (decayed deficits) and consistency (circular time), supporting Sleep
  Score and Bedtime Planner.
- **Read:** Scoring spec §11 (debt/surplus), §10.6 (consistency); bedtime requirements §20.
- **Files created:**
  ```text
  packages/scoring/src/sleep/sleepDebt.ts
  packages/scoring/src/sleep/sleepConsistency.ts
  packages/scoring/src/primitives/circularTime.ts   # §28 core/circularTime — shared circular-time math
  packages/scoring/test/sleepDebt.test.ts
  packages/scoring/test/sleepConsistency.test.ts
  ```
- **In scope:** decayed rolling debt (§11.2) + surplus (§11.3); consistency via circular mean/SD of
  bed/wake times; correct crossing-midnight handling.
- **Out of scope:** persistence; recovery/readiness.
- **Acceptance:** decay model matches §11; circular math correct across midnight; tests cover
  normal, inconsistent, and sparse data.
- **Verify:** `pnpm --filter @primis/scoring test` · `typecheck`.
- **Pitfalls:** circular time wraparound (23:30 vs 00:30 are 1h apart, not 23h); empty-history
  guards.
- **Ask first?** No.
- **Commit:** `scoring: add sleep debt and consistency engines (CU-051)`

### CU-052 — Recovery Score engine

- **Goal:** Objective-heavy Recovery Score with bounded subjective modifier.
- **Read:** Scoring spec §12.1–12.12; PRD Recovery; provider-availability ADR; CU-049 baselines,
  CU-050/051 sleep outputs.
- **Files created:**
  ```text
  packages/scoring/src/recovery/recoveryScore.ts
  packages/scoring/src/recovery/recoveryComponents.ts   # hrvBalance, restingHr, respiratory, spo2 (§28 names)
  packages/scoring/test/recoveryScore.test.ts
  ```
- **In scope:** components — HRV vs baseline (§12.4), RHR vs baseline (§12.5), sleep score, sleep
  debt, respiratory stability (§12.6), SpO2 stability (§12.7), training-load context (§12.8),
  bounded subjective modifier (§12.9); recommended intensity band (§12.11); output (§12.10);
  `recovery_score_v1_0`.
- **Out of scope:** persistence; readiness (CU-053).
- **Acceptance:** invariants hold (HRV below baseline never improves HRV balance; RHR above baseline
  never improves RHR score — §27.4); manual modifier light + bounded; missing HRV/RHR → confidence
  degradation; **performance-only language metadata, no medical claims.**
- **Verify:** `pnpm --filter @primis/scoring test` · `typecheck`.
- **Pitfalls:** subjective modifier must be clamped; depends on CU-049/050/051 — gate behind
  interfaces if merging out of order.
- **Ask first?** No.
- **Commit:** `scoring: implement Recovery Score engine (CU-052)`

### CU-053 — Activity, strain, and training readiness engines

- **Goal:** Daily Activity Score, training load/strain, and Training Readiness from canonical
  summaries/baselines with explicit missing-data states.
- **Read:** Scoring spec §13 (readiness), §14 (strain/load), §15 (activity); UI/UX Activity/Recovery;
  CU-048/049 outputs; CU-052 recovery.
- **Files created:**
  ```text
  packages/scoring/src/activity/activityScore.ts
  packages/scoring/src/training/trainingLoad.ts        # workout load (§14.3-14.4), acute/chronic (§14.6)
  packages/scoring/src/training/strain.ts              # daily strain (§14.5)
  packages/scoring/src/training/trainingReadiness.ts   # §13
  packages/scoring/test/trainingReadiness.test.ts
  packages/scoring/test/activityStrain.test.ts
  ```
- **In scope:** activity from steps/active-calories/zone-minutes/floors/distance where available
  (§15); training load 7d-vs-28d acute/chronic when enough history; readiness combining recovery,
  sleep debt, load, soreness/fatigue, goal context (§13.2); not-enough-data states; version tags
  (`activity_*_v1_0`, `training_load_v1_0`, `training_readiness_v1_0`).
- **Out of scope:** persistence; nutrition/gut/body/wellbeing.
- **Acceptance:** missing components degrade gracefully; acute/chronic only when history sufficient,
  else `not_enough_data`; readiness recommendation wording is performance-only (§13.3).
- **Verify:** `pnpm --filter @primis/scoring test` · `typecheck`.
- **Pitfalls:** acute/chronic ratio needs ≥ required history — guard; provider availability for zone
  minutes/floors varies.
- **Ask first?** No.
- **Commit:** `scoring: add activity strain and readiness engines (CU-053)`

### CU-054 — Bedtime Planner deterministic engine

- **Goal:** Generate ranked bedtime windows from target wake time + sleep history. No AI, no fake
  precision.
- **Read:** Scoring spec §20.1–20.15; PRD Bedtime; UI/UX §6.3; CU-051 debt/consistency.
- **Files created:**
  ```text
  packages/scoring/src/bedtime/bedtimePlanner.ts
  packages/scoring/src/bedtime/circadianProfile.ts       # §20.6 circadian tendency
  packages/scoring/src/bedtime/sleepLatencyProfile.ts    # §20.4 latency estimate
  packages/scoring/test/bedtimePlanner.test.ts
  ```
  Reuse `circularTime.ts` (CU-051).
- **In scope:** inputs target wake time, sleep latency, personal sleep need, sleep debt, recent
  rhythm, recovery need, next-day context (§20.3); candidate generation (§20.7) + scoring (§20.8–
  20.11); ranked windows best/good/last-acceptable (§20.12) using **windows not exact times**;
  confidence + explanation; `bedtime_planner_v1_0`.
- **Out of scope:** persistence; the POST endpoint (touched in Phase F only if CU-057/056 wires it —
  keep engine pure here); AI.
- **Acceptance:** always returns valid ranked windows (§27.4 invariant); windows not false precision;
  confidence + explanation fields present; **no AI dependency.**
- **Verify:** `pnpm --filter @primis/scoring test` · `typecheck`.
- **Pitfalls:** circadian/latency estimates must handle sparse history; ranking stable + tie-broken
  deterministically.
- **Ask first?** No.
- **Commit:** `scoring: implement Bedtime Planner engine (CU-054)`

### CU-055 — Score snapshot worker

- **Goal:** Orchestrate the pipeline for an affected user/date — compute summaries, baselines,
  scores, components — and persist idempotently; emit insight candidates for major drivers.
  **No AI model calls.**
- **Read:** Scoring spec §25 (jobs), §26 (versioning), §21 (insight candidates), §8.4, §24 (AI
  boundary — what insights may contain); TAD precompute/idempotency; `services/api/src/repositories/
scoreRepository.ts` (write contract, dedup, CASCADE); `insightRepository.ts`;
  `services/workers/src/db/{client,types}.ts`.
- **Files created:**
  ```text
  services/workers/src/scoring/runDailyScoring.ts       # orchestration (§25.1)
  services/workers/src/scoring/scoreSnapshotWriter.ts   # idempotent writes to score_snapshots/component_values
  services/workers/src/scoring/insightCandidateEmitter.ts # §21 major-driver candidates (no AI)
  services/workers/test/scoring/runDailyScoring.test.ts
  ```
- **In scope:** for a user/date, run CU-048→054 (via imports), write `score_snapshots` +
  `score_component_values` idempotently (re-insert components after each upsert per §2.3), write
  `algorithm_runs`, emit `insight_candidates` for major drivers; handle provisional/missing states.
- **Out of scope:** AI calls; AWS scheduling/EventBridge/SQS (run locally); API routes.
- **Acceptance:** idempotent re-run (stable rows, no duplicate components); snapshots store
  version/computed_at/input-window/components/missing-metadata; insight candidates emitted
  deterministically; provisional/missing states persisted; **no AI invocation.**
- **Verify:** `pnpm --filter @primis/workers test` · `typecheck`.
- **Pitfalls:** the CASCADE-delete-then-reinsert ordering for component values; choosing one write
  path (workers vs api repo) — see §2.5(2); deterministic insight ordering.
- **Ask first?** **YES** — confirm the single DB write path (reuse `services/api` `scoreRepository`
  vs a workers-side writer) and where `algorithm_runs`/score row types are declared, before coding.
- **Commit:** `scoring: add score snapshot worker (CU-055)`

### CU-056 — Dashboard summary API endpoints

- **Goal:** Serve the precomputed home dashboard for the latest local date. **No heavy computation
  in request handlers.**
- **Read:** Scoring spec §29.1 (`TodayDashboardResponse` shape); UI/UX Home; `api-contracts/src/
scores.ts` + `dataQuality.ts`; existing `dashboardRepository`, `scoreRepository`,
  `insightRepository`; existing route pattern (`services/api/src/routes/me.ts`), `authMiddleware`,
  `errorHandler`, `envelope`.
- **Files created/edited:**
  ```text
  services/api/src/routes/dashboard.ts                  # GET /v1/dashboard/today
  services/api/src/app.ts                               # (edit) register route
  packages/api-contracts/src/dashboard.ts               # response DTO if not already present; export from index
  services/api/test/routes/dashboard.test.ts
  ```
- **In scope:** `GET /v1/dashboard/today` returning latest-date scores summary + top insights +
  recommendations + optional bedtime widget, **read from precomputed tables only**; standard
  envelope/error handling; auth.
- **Out of scope:** computing scores at request time; mobile rendering; new tables.
- **Acceptance:** returns precomputed dashboard for latest local date; missing scores omitted/marked
  per state; **no scoring math in handler**; uses existing repositories + envelope; tested.
- **Verify:** `pnpm --filter @primis/api test` · `typecheck` · root `pnpm lint`.
- **Pitfalls:** "latest local date" selection per user timezone; reuse contract DTOs (don't fork);
  N+1 reads — batch via repository.
- **Ask first?** No — but reuse existing `api-contracts` score DTOs; only add a dashboard envelope
  type if absent.
- **Commit:** `api: add dashboard summary endpoints (CU-056)`

### CU-057 — Sleep/Recovery/Activity detail APIs

- **Goal:** Serve chart-ready Sleep/Recovery/Activity (+Vitals) detail + score breakdown from
  precomputed data. Not raw provider dumps.
- **Read:** Scoring spec §29.2 (`GET /v1/scores/{scoreType}`); UI/UX Sleep/Recovery/Activity;
  existing `sleepRepository`, `vitalRepository`, `activityRepository`, `scoreRepository`;
  `api-contracts/scores.ts`.
- **Files created/edited:**
  ```text
  services/api/src/routes/scores.ts                     # GET /v1/scores/{scoreType}?date=
  services/api/src/routes/sleepDetail.ts                # or fold into scores.ts per existing convention
  services/api/src/app.ts                               # (edit) register routes
  packages/api-contracts/src/scoreDetail.ts             # detail DTOs if absent; export from index
  services/api/test/routes/scores.test.ts
  ```
- **In scope:** component breakdown + trends + explanations per score type; chart-ready
  sleep/recovery/activity/vitals series from canonical tables; envelope/auth/error handling.
- **Out of scope:** raw provider payloads; request-time scoring; UI.
- **Acceptance:** returns precomputed breakdown + trend series; invalid `scoreType`/`date` →
  standard error; **no raw payload exposure**; **no scoring math in handler**; tested.
- **Verify:** `pnpm --filter @primis/api test` · `typecheck` · root `pnpm lint`.
- **Pitfalls:** validate `scoreType` against `core-types` `SCORE_TYPES`; date parsing/timezone;
  consistent envelope shape with CU-056.
- **Ask first?** No.
- **Commit:** `api: add health detail endpoints (CU-057)`

---

## 7. Reusable handoff prompt template (one CU per Cursor session)

```text
You are implementing exactly ONE commit unit for Primis Phase F: <CU-ID> — <title>.

Read first (in order):
- .ai-agent-instructions.md, CONTRIBUTING.md, docs/README.md
- plans/phase-f-summary-baseline-scoring-bedtime-engine.md → the <CU-ID> section
- primis_full_implementation_spec_commit_plan.md → <CU-ID> entry + §3.5 Definition of Done
- primis_scoring_algorithms_spec.md → <sections listed for this CU>
- primis_data_model_health_metric_schema.md → <tables listed for this CU>
- <other docs listed for this CU>

Implement ONLY the files listed under "Files created/edited" for <CU-ID>. Do not start adjacent CUs.

Hard rules (Phase F guardrails §5):
- deterministic only; no AI score logic; no raw provider reads in scoring code;
- never assume provider metrics exist — degrade confidence / emit explicit missing states;
- pure formulas in packages/scoring, DB I/O only in services/*; Kysely only (ADR-003);
- store algorithm_version + computed_at + input window + components + missing metadata;
- no medical language; no competitor formulas; no ad hoc metric codes; no secrets/real data in tests.

Add Vitest tests for every non-trivial function (deterministic, redacted fixtures).
If a source doc is silent on a needed detail, leave // TODO(ADR): and propose an ADR — do not guess.
If this CU is flagged "Ask first?", resolve that question before coding.

Run and pass: <verification commands for this CU> plus `pnpm lint` and `pnpm typecheck`.
Branch: cu/<cu-id-lowercase>-<short-name>
Commit: <commit message for this CU>
Finish with a short implementation summary.
```

---

## 8. Definition of Done for Phase F

- [ ] CU-047→057 each merged via their own `cu/...` branch with the exact commit message.
- [ ] `@primis/scoring` exists, is pure (no DB import), exports primitives + all engines.
- [ ] Daily summaries + rolling baselines populate idempotently from normalized data.
- [ ] Sleep, Recovery, Training Readiness, Activity scores + Bedtime Planner produce explainable,
      versioned outputs with component breakdowns and top drivers.
- [ ] Every score handles missing/stale/low-confidence data with explicit states; no crash on
      missing optional inputs; `missing_required_data` when required inputs absent.
- [ ] CU-055 worker writes `score_snapshots` + `score_component_values` + `algorithm_runs`
      idempotently and emits insight candidates with **no AI calls**.
- [ ] `GET /v1/dashboard/today` and `GET /v1/scores/{scoreType}` read **only precomputed** data
      (no request-time scoring), reuse existing repositories + `api-contracts` DTOs.
- [ ] Golden-fixture + property tests (spec §27) pass; invariants hold.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` all green.
- [ ] No new migrations; no source-doc rewrites; any conflict captured as an ADR.
- [ ] No sensitive health data in logs, tests, or fixtures.

---

## 9. Known risks / decisions to defer

- **DB write path for CU-055** (`services/api` `scoreRepository` reuse vs a workers-side writer) —
  resolve at CU-055 start; may warrant a small ADR.
- **Spec §28 path naming vs commit-plan paths** — resolved here (commit-plan wins); revisit only if
  a later CU needs a §28-only module (`insights/`, `correlationEngine`) which is out of Phase F scope.
- **Backfill/reprocessing job** (spec §25.2) is referenced but not a Phase F CU — defer to a later
  phase or ADR if needed before beta.
- **Recommendation engine / correlation engine** (spec §22–§23) — out of scope; insight candidates
  in CU-055 cover only major-driver deviation insights (§21).
- **Algorithm tuning** (spec §31) is a beta activity, not Phase F.

---

## 10. Open questions / assumptions

**Assumptions (proceed unless corrected):**

1. Phase F = CU-047→057 only; CU-056/057 are the only API CUs (later API/UI CUs are Phase G).
2. Pure formulas → `packages/scoring`; orchestration + DB I/O → `services/workers`/`services/api`
   (commit-plan paths over spec §28 monolith).
3. All Phase F tables already exist (migrations 000004–000006); **no new migrations** in Phase F.
4. Reuse existing `@primis/core-types` and `@primis/api-contracts` score/data-quality types; extend,
   don't fork.
5. Golden fixtures (spec §27.2) live under `database/fixtures/`, redacted.
6. Workers run locally; no AWS scheduling in Phase F.

**Questions to resolve at the flagged CU (non-blocking for the plan):**

- CU-055: confirm single DB write path + location of `algorithm_runs`/score row types in
  `services/api/src/db/types.ts` (and whether a workers-side mirror is needed).
- CU-056/057: confirm whether dashboard/detail response DTOs already exist in
  `@primis/api-contracts` before adding new ones.

---

## 11. Next phase preview (Phase G — awareness only, do not implement)

Phase G builds the mobile surfaces that consume Phase F outputs: Home dashboard, Sleep, Bedtime
Planner, Recovery, Activity, Vitals screens (commit plan CU-058+). Phase F's API response shapes
(§29) and `@primis/api-contracts` DTOs are the contract Phase G renders against — keep them stable,
chart-ready, and explainable so Phase G needs no scoring logic on-device.

```

```

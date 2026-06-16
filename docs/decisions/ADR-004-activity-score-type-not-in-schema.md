# ADR-004: Activity Score has no `score_type` in the score_snapshots schema

**Date:** 2026-06-15
**Status:** Accepted

## Context

CU-055 (score snapshot worker) orchestrates the deterministic engines and persists
their outputs to `score_snapshots`. The score taxonomy is described in two
source-of-truth documents that disagree:

- `primis_scoring_algorithms_spec.md` §5.1 (priority 5) lists **Activity Score** as
  a core, user-facing Phase 1/2 score, and §25.1 step 10 instructs the daily job to
  "Compute Activity Score."
- `primis_data_model_health_metric_schema.md` §16.1 (priority 4) defines the
  `score_snapshots.score_type` CHECK constraint with exactly seven values:
  `sleep_score`, `recovery_score`, `training_readiness_score`, `strain_score`,
  `nutrition_score`, `wellbeing_score`, `bedtime_adherence_score`. **There is no
  `activity_score` value**, and migration `000006_outputs_and_dashboard.sql`
  enforces this CHECK.

`@primis/core-types` `ScoreType` includes `'activity'`, and `@primis/scoring`
ships a working `computeActivityScore` engine (CU-053). But the database physically
rejects any row whose `score_type` is not in the CHECK list. There is no
`activity_score` row that can be written without first altering the constraint via
a migration.

Per `docs/README.md`, when two source docs conflict the **lower priority number
wins** — the data model (priority 4) is authoritative over the scoring spec
(priority 5). The Phase F plan also forbids new migrations in Phase F unless
explicitly allowed, and CU-055's handoff requires asking before adding migrations.

## Decision

For CU-055, **the Activity Score is not persisted to `score_snapshots`.** The
worker persists only the score types the schema CHECK allows and that map cleanly
from the available engines:

| Engine result (`scoreType`) | Persisted `score_type`              |
| --------------------------- | ----------------------------------- |
| `sleep`                     | `sleep_score`                       |
| `recovery`                  | `recovery_score`                    |
| `training_readiness`        | `training_readiness_score`          |
| `strain`                    | `strain_score`                      |
| `activity`                  | _(not persisted — no schema value)_ |

The `SCORE_TYPE_TO_DB` map in `services/workers/src/scoring/scoringTypes.ts`
deliberately omits `activity`. No migration is added in Phase F (honoring the
plan's no-migration rule and CU-055's "ask before adding migrations" gate).

`bedtime` is also not persisted by the daily job: the Bedtime Planner (CU-054) is
an on-demand, request-driven recommendation (`bedtime_planner_v1_0`), not a daily
"adherence" snapshot. The schema's `bedtime_adherence_score` measures adherence,
which is a different, not-yet-implemented score; conflating the two would store
misleading data. Bedtime output is served on demand by CU-057, not snapshotted.

## Consequences

- Activity Scores are computed (the engine and `fromActivity`-style mapping remain
  available) but not written by the daily scoring worker; the home dashboard
  (CU-056) will not surface a persisted Activity Score until the schema gains an
  `activity_score` type.
- **Follow-up:** a future, narrowly-scoped corrective migration should extend the
  `score_snapshots.score_type` CHECK to add `activity_score` (and clarify whether
  `bedtime_adherence_score` is replaced by a bedtime-recommendation snapshot type).
  When that migration lands, add `activity: 'activity_score'` to `SCORE_TYPE_TO_DB`
  and a `fromActivityResult` mapper; the worker's persistence path needs no other
  change.
- No source-of-truth document is edited; this ADR records the deviation per
  `CONTRIBUTING.md` §5.

# ADR-006: Health detail endpoint paths and response shapes

**Date:** 2026-06-16
**Status:** Accepted

## Context

CU-057 implements the chart-ready detail APIs that back the Phase G Sleep,
Recovery, Activity, and Vitals screens. Three existing artifacts describe the
contract and they do not fully agree, so the alignment must be recorded rather
than silently forked (`.ai-agent-instructions.md` Rule 2; CONTRIBUTING §5). This
follows the precedent set by `ADR-005-dashboard-endpoint-shape.md` for CU-056.

1. **Route path.** `docs/source-of-truth/primis_scoring_algorithms_spec.md` §29.2
   specifies a single generic `GET /v1/scores/{scoreType}?date=YYYY-MM-DD` that
   returns "component breakdown, trends, and explanations". The Phase C mobile
   stub `apps/mobile/src/api/endpoints.ts` declares
   `SCORE_SNAPSHOT: '/v1/scores/:type'` — a placeholder added before any backend
   route existed (its comment says "Phase D backend provides this route").

2. **A single generic shape cannot carry the screen data.** The Sleep, Recovery,
   Activity, and Vitals detail screens (`primis_ui_ux_design_system_spec.md`)
   each need _chart-ready, domain-specific_ data that a single
   `ScoreDetail<scoreType>` cannot express type-safely:
   - Sleep needs a stage timeline + per-stage summary (`sleep_stage_intervals`,
     `sleep_daily_features`).
   - Recovery needs HRV/RHR/respiratory/SpO2 baseline deviations and a
     recommended-intensity band (`vital_daily_features`, recovery snapshot).
   - Activity needs steps/active-energy/zone-minutes/workouts/load-trend
     (`training_load_daily`, `workout_sessions`, `daily_metric_summaries`).
   - **Vitals is not a score type at all** (`@primis/core-types` `SCORE_TYPES`
     has no `vitals` member) — it is a domain _view_ over `vital_daily_features`,
     so it cannot be addressed by `/v1/scores/{scoreType}`.

3. **Phase C chart primitives are the rendering contract.**
   `packages/design-system/src/charts/types.ts` already defines `ChartPoint`,
   `SleepStageSegment`, and `SleepStageSummary` (ARCH-MOBILE-003: charts receive
   chart-ready data, never raw payloads). The detail API response must serialize
   into these shapes so Phase G renders with no on-device transforms.

## Decision

1. **Paths — domain-scoped detail endpoints** instead of one generic score
   endpoint:

   | Endpoint                               | Backing domain tables                                                                  |
   | -------------------------------------- | -------------------------------------------------------------------------------------- |
   | `GET /api/v1/sleep?date=YYYY-MM-DD`    | `sleep_daily_features`, `sleep_stage_intervals`, sleep snapshot                        |
   | `GET /api/v1/recovery?date=YYYY-MM-DD` | `vital_daily_features`, recovery snapshot                                              |
   | `GET /api/v1/activity?date=YYYY-MM-DD` | `training_load_daily`, `workout_sessions`, `daily_metric_summaries`, activity snapshot |
   | `GET /api/v1/vitals?date=YYYY-MM-DD`   | `vital_daily_features` (no score)                                                      |

   The `/v1/sleep` namespace is already reserved by spec §29.3
   (`POST /v1/sleep/bedtime-plan`), so this is consistent. The generic
   `/v1/scores/{scoreType}` placeholder is superseded; the source-of-truth spec's
   _intent_ (component breakdown + trends + explanations per concern) is honoured,
   while the path is specialised per domain for type-safe, chart-ready responses.
   As with ADR-005, the mobile `SCORE_SNAPSHOT` stub is left untouched in CU-057
   (the Phase F plan lists only backend files); Phase G updates
   `apps/mobile/src/api/endpoints.ts` to the four domain paths when the screens
   are built.

2. **Shapes — per-domain DTOs that reuse the canonical score/quality types.**
   Each detail response (`SleepDetailResponseDto`, `RecoveryDetailResponseDto`,
   `ActivityDetailResponseDto`, `VitalsDetailResponseDto`) shares a common
   envelope (`domain`, `localDate`, `state`, `confidence`, `generatedAt`,
   `score`) and REUSES `ScoreSnapshotDto` (CU-012) for the score block — now with
   its `components` array POPULATED from `score_component_values` (the dashboard
   summary in CU-056 intentionally left it empty; the detail endpoint is where the
   full weighted breakdown is served, per ADR-005 §4). A new
   `packages/api-contracts/src/chart.ts` module defines the shared chart
   primitives (`ChartPointDto`, `TrendSeriesDto`, `SleepStageSegmentDto`,
   `SleepStageSummaryDto`) that mirror the Phase C `design-system` chart types
   1:1, so backend and mobile share one chart-ready contract.

3. **Data states.** Every response is well-formed in all five states
   (`available` / `provisional` / `stale_data` / missing-required / no-data). The
   top-level `state` + `confidence` and the score block's `qualityMetadata`
   (missing required/optional metrics, stale providers, baseline status) carry
   freshness and missingness. Missing domain data yields `null` blocks and empty
   series — never a fabricated value and never a raw provider payload. Sleep
   stages absent → `stages.available = false` with an empty timeline (handled
   distinctly from "no sleep at all").

4. **No request-time scoring, no raw payloads.** Handlers read precomputed rows
   only (`score_snapshots`, `score_component_values`, the domain feature tables)
   and map them into DTOs. No scoring math, no provider payload columns, no secret
   refs, no AI/model calls (Phase F guardrails §5; TAD API boundaries).

## Consequences

- The backend exposes four spec-faithful, contract-validated detail endpoints that
  reuse existing `@primis/api-contracts` score/quality DTOs and align with the
  Phase C chart primitives; no parallel score/freshness shapes are introduced.
- A follow-up is required in Phase G (tracked here, not implemented in CU-057):
  replace the mobile `SCORE_SNAPSHOT: '/v1/scores/:type'` stub with the four
  domain endpoint constants and render the screens against these DTOs.
- The `score_component_values` table is now read on the request path for the
  detail endpoints (one bounded read per request, keyed by `score_snapshot_id`);
  the dashboard summary continues to skip it for its N+1-free fast read.

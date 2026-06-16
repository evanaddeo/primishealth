# ADR-005: Dashboard endpoint path and response shape alignment

**Date:** 2026-06-16
**Status:** Accepted

## Context

CU-056 implements the Home dashboard summary API. Two existing artifacts describe
the dashboard contract and they do not agree, so the alignment must be recorded
rather than silently forked (`.ai-agent-instructions.md` Rule 2; CONTRIBUTING §5).

1. **Route path.** `docs/source-of-truth/primis_scoring_algorithms_spec.md` §29.1
   specifies `GET /v1/dashboard/today`. The Phase C mobile stub
   `apps/mobile/src/api/endpoints.ts` declares `DASHBOARD: '/v1/dashboard'` — a
   placeholder added before any backend route existed (its own comment says
   "Phase D backend provides this route").

2. **Response shape.** Scoring Spec §29.1 defines `TodayDashboardResponse`
   (`localDate`, `lastSyncedAt`, `scores`, `topInsights`, `recommendations`,
   `bedtimeWidget?`) but references `ScoreSummary`, `InsightCard`,
   `RecommendationCard`, and `BedtimeWidgetSummary` without defining them. The
   Phase C mock (`apps/mobile/src/mocks/dashboard.ts`) uses a flat dev-only
   `MockDashboard` (`recoveryScore`, `sleepScore`, `activitySummary`, `aiSummary`,
   `providerSyncStatus`) explicitly annotated as "will eventually be replaced by a
   real backend DashboardDto."

3. **Persisted `score_type` vocabulary.** `score_snapshots.score_type` stores
   `sleep_score`, `recovery_score`, `training_readiness_score`, `strain_score`,
   etc. (data model §16.1), whereas the §29.1 `scores` map is keyed by
   `sleep`, `recovery`, `trainingReadiness`, … (the `@primis/core-types`
   `ScoreType` family). A mapping layer is required.

## Decision

1. **Path:** implement the authoritative spec path `GET /v1/dashboard/today`
   (mounted as `/api/v1/dashboard/today`). The source-of-truth Scoring Spec
   outranks the Phase C mobile stub (`docs/README.md` priority order). The mobile
   `DASHBOARD` constant is left untouched in CU-056 (Phase F plan lists only
   backend files for CU-056); it should be updated to `/v1/dashboard/today` when
   Phase G builds the Home screen against this contract. An optional
   `?date=YYYY-MM-DD` query selects an explicit local date; otherwise the latest
   date with a snapshot is used, falling back to the current UTC date for new
   users with no snapshots.

2. **Shape:** formalize the §29.1 shape in `packages/api-contracts/src/dashboard.ts`
   as `TodayDashboardResponseDto`, REUSING the canonical `ScoreSnapshotDto`
   (CU-012) as `ScoreSummary` and `ProviderFreshnessDto` (CU-012) for sync state
   rather than forking new score/freshness types. The undefined spec types are
   defined minimally and display-safe: `InsightCardDto`, `RecommendationCardDto`,
   `DashboardWidgetSummaryDto`, `BedtimeWidgetSummaryDto`. Two additive fields
   beyond the literal §29.1 list satisfy the CU-056 requirement to expose
   "provider sync state" and "widget order": `providerSyncStatus`
   (`ProviderFreshnessDto[]`) and `widgets` (`DashboardWidgetSummaryDto[]`).
   Data freshness is carried by `lastSyncedAt` (§29.1) plus per-provider recency
   in `providerSyncStatus`.

3. **Score-type mapping:** the API route maps persisted `score_type` values to
   the §29.1 dashboard slots (`sleep_score → scores.sleep`, etc.).
   `bedtime_adherence_score` maps to `bedtimeWidget`; `strain_score` and the
   non-persisted `activity_score` (ADR-004) are not dashboard score slots and are
   omitted when absent.

4. **Component breakdown:** the dashboard summary returns an empty
   `components` array per score; the full weighted breakdown is the
   responsibility of the score detail endpoint (CU-057, Scoring Spec §29.2). This
   keeps the dashboard request a bounded, N+1-free read.

## Consequences

- The backend exposes a spec-faithful, contract-validated dashboard endpoint that
  reuses existing `@primis/api-contracts` DTOs; no parallel score/freshness shapes
  are introduced.
- A follow-up is required in Phase G: update `apps/mobile/src/api/endpoints.ts`
  `DASHBOARD` to `/v1/dashboard/today` and replace the dev-only `MockDashboard`
  with `TodayDashboardResponseDto`. Tracked here; not implemented in CU-056.
- Mobile must read scores from the `scores.{slot}` map (keyed by dashboard slot),
  not from flat `recoveryScore`/`sleepScore` fields. The Phase C mock remains a
  development-only fixture until Phase G migrates it.

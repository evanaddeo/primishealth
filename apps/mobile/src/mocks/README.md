# Mock Data (Development Only)

These files are **DEVELOPMENT ONLY**. Mock data is used when `EXPO_PUBLIC_MOCK_MODE=true`
(the default in local development). They must never be used in staging or production builds.

## Purpose

Mock data allows UI development to proceed before real backend data (Phase D+) exists. The
four mock dashboard states cover the main display variants the Home screen must handle:

| State        | Export              | Description                                     |
| ------------ | ------------------- | ----------------------------------------------- |
| Normal       | `MOCK_NORMAL`       | Good recovery (82), good sleep (78), active day |
| Low Recovery | `MOCK_LOW_RECOVERY` | Very-low recovery (34), moderate sleep (65)     |
| Stale Data   | `MOCK_STALE_DATA`   | Provider sync > 12 h old; all scores null       |
| Missing Data | `MOCK_MISSING_DATA` | New user; no history; all scores null           |

## Contract

All `ScoreSnapshotDto` objects in this directory conform to `ScoreSnapshotDtoSchema` from
`@primis/api-contracts`. The schema validation tests in `test/mocks/dashboard.test.ts` enforce
this — no ad hoc type assertions are used to skip validation.

## Safety Rules

Mock data must **NEVER** contain:

- Real user data, health observations, or personal identifiers
- OAuth tokens, API keys, or device identifiers
- Raw provider API payloads (Google Health, Fitbit, HealthKit, Health Connect, Hume)
- Production-like user IDs or email addresses

Metric codes (e.g. `'hrv_daily_mean'`, `'sleep_duration'`) are sourced from the canonical
`METRIC_DEFINITIONS` registry in `@primis/health-metrics`. Do not invent new metric codes.

Provider codes (e.g. `'healthkit'`) follow the ADR-001 canonical list. Do not invent new ones.

The `isMock: true` literal type guard is present on every mock sub-shape (`MockAiSummary`,
`MockActivitySummary`, `MockSyncStatus`). Consuming code must check this field before
rendering content in a non-development context.

## Disabling Mock Mode

Set `EXPO_PUBLIC_MOCK_MODE=false` in your `.env.local` (or in the EAS build environment
variables for staging/production) to disable mock mode and use real backend data.

See `apps/mobile/src/api/client.ts` for the `mockMode` toggle implementation.

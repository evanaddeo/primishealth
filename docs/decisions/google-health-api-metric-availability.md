# Google Health API Metric Availability Matrix

**Document type:** Validation scaffold / metric availability decision record
**Product:** Primis
**Status:** Scaffold — not yet validated
**Created:** 2026-06-13
**CU:** CU-034
**Phase Z task:** Fill every `TBD` row via live manual validation (M1-T005)
**Audience:** AI coding agents, backend engineers, founder

---

## ⚠ Preamble — Read Before Using This Document

This document is a **scaffold**. It will be filled manually during Phase Z live validation using
real Google Health API credentials and a test Fitbit Air device. Until Phase AA acceptance criteria
are met:

- All rows marked `Available?: TBD` **MUST NOT** be treated as a guarantee of metric availability.
- All rows marked `Available?: NO (unverified)` **MUST NOT** be used in any scoring, dashboard, or
  AI context logic without explicit Phase AA confirmation.
- Do not mark any row `real_payload_validated` in this file until a real redacted payload fixture
  exists at the `Sample fixture path` listed and has passed the `database/fixtures/README.md §5`
  checklist.

The scoring engine, AI context builder, and dashboard MUST degrade gracefully if any TBD metric
turns out to be unavailable. See `primis_data_model_health_metric_schema.md §0.1 rule 6` (never
assume a provider exposes a metric).

---

## Enum References

Validation status values and classification enum values are defined in
`docs/source-of-truth/primis_google_health_api_feature_parity_matrix.md §1–§2` and summarized
below.

### Available? column

| Value              | Meaning                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `TBD`              | API docs suggest availability; awaiting Phase Z live validation.   |
| `YES (documented)` | Confirmed present in a real redacted payload after Phase Z.        |
| `NO (unverified)`  | No confirmed API exposure; likely proprietary or not exposed.      |
| `DERIVED`          | Primis computes this from other available fields; not a raw field. |
| `N/A`              | Not a provider data field (manual input, Primis-internal, etc.).   |

### Validation status column

| Status                        | Meaning                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| `documented`                  | Official Google Health API docs list the data type / field.               |
| `documented_schema_fixture`   | Synthetic fixture based on docs exists in `database/fixtures/`.           |
| `real_payload_validated`      | Real redacted payload from a test account exists in `database/fixtures/`. |
| `unavailable_in_real_payload` | Confirmed absent in live API responses.                                   |
| `deferred`                    | Not checked or out of scope for current phase.                            |
| `unverified`                  | No official docs confirm API exposure.                                    |

---

## Naming Disambiguation

The MVP build plan (`primis_mvp_build_plan_milestones.md §7.5`) uses abbreviated short-form
identifiers that differ from canonical Primis metric codes. The data model
(`primis_data_model_health_metric_schema.md §9.2`) is authoritative. The mapping is:

| MVP §7.5 short name        | Canonical Primis metric code (`data_model §9.2`)    | Notes                                            |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------ |
| `daily_resting_hr`         | `resting_heart_rate`                                | Matches migration 000003 seed.                   |
| `daily_spo2`               | `oxygen_saturation`                                 | Matches migration 000003 seed.                   |
| `daily_hrv`                | `hrv_daily_mean`                                    | Matches migration 000003 seed.                   |
| `daily_respiratory_rate`   | `respiratory_rate`                                  | Not seeded; add in Phase Z.                      |
| `active_energy_burned`     | `active_energy_kcal`                                | Matches migration 000003 seed.                   |
| `food`                     | `calories_in_kcal`, `protein_g`, `carbs_g`, `fat_g` | One Google data type maps to multiple codes.     |
| `hydration`                | `hydration_ml`                                      | Google data type: `hydration-log`.               |
| `weight`                   | `weight_kg`                                         | Unit normalized to kg at write time.             |
| `body_fat`                 | `body_fat_pct`                                      | Unit normalized to percent.                      |
| `exercise`                 | `workout_sessions` (table, not scalar code)         | Domain table, not a `metric_observations` row.   |
| `sleep_sessions`           | Multiple codes — see Sleep section below            | One API resource yields many canonical metrics.  |
| `provider_sleep_score`     | `sleep_score` (Primis-derived)                      | See Provider Scores section; not a direct field. |
| `provider_readiness_score` | `recovery_score` / `training_readiness_score`       | See Provider Scores section.                     |
| `provider_cardio_load`     | `strain_score` (Primis-derived)                     | See Provider Scores section.                     |

---

## Availability Matrix

Fixture paths reference `database/fixtures/provider/google_health/` — **this directory does not
exist yet**. Paths will be populated when Phase Z live validation creates redacted payload fixtures.
The fixture policy is defined in `database/fixtures/README.md`.

### Activity Metrics

Rows 1–6 are seeded in migration `000003_provider_sync.sql` with `verification_status = 'unverified'`.

| Canonical metric code | Google data type          | Scope                  | Operation                        | Available? | Sample fixture path                                                                    | Validation status | Notes                                                                     |
| --------------------- | ------------------------- | ---------------------- | -------------------------------- | ---------- | -------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------- |
| `steps`               | `steps`                   | `activity_and_fitness` | `dailyRollUp / list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/steps_daily.json` (Phase Z)         | `documented`      | Seeded row 1/15. Use daily rollup for Home card.                          |
| `floors`              | `floors`                  | `activity_and_fitness` | `dailyRollUp / list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/floors_daily.json` (Phase Z)        | `documented`      | Seeded row 2/15. Device support may vary; validate in Phase Z.            |
| `active_energy_kcal`  | `active-energy-burned`    | `activity_and_fitness` | `dailyRollUp`                    | TBD        | `database/fixtures/provider/google_health/redacted/active_energy.json` (Phase Z)       | `documented`      | Seeded row 3/15. Active calories only; distinct from `total_energy_kcal`. |
| `total_energy_kcal`   | `total-calories`          | `activity_and_fitness` | `dailyRollUp`                    | TBD        | `database/fixtures/provider/google_health/redacted/total_calories.json` (Phase Z)      | `documented`      | Seeded row 4/15. Active + resting. Validate field path in Phase Z.        |
| `active_zone_minutes` | `active-zone-minutes`     | `activity_and_fitness` | `dailyRollUp / list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/active_zone_minutes.json` (Phase Z) | `documented`      | Seeded row 5/15. Fitbit Air exposes this; confirm field path in Phase Z.  |
| `time_in_hr_zone`     | `time-in-heart-rate-zone` | `activity_and_fitness` | `list / reconcile / dailyRollUp` | TBD        | `database/fixtures/provider/google_health/redacted/hr_zones.json` (Phase Z)            | `documented`      | Seeded row 6/15. Per-zone duration; used for training load pipeline.      |

### Activity — Additional (from MVP §7.5 / parity matrix)

| Canonical metric code      | Google data type                            | Scope                                                    | Operation          | Available? | Sample fixture path                                                                 | Validation status | Notes                                                                                                                                                  |
| -------------------------- | ------------------------------------------- | -------------------------------------------------------- | ------------------ | ---------- | ----------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workout_sessions` (table) | `exercise`                                  | `activity_and_fitness`                                   | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/exercise_session.json` (Phase Z) | `documented`      | Maps to `workout_sessions` domain table, not a scalar metric code. Phase Z must validate `metricsSummary`, `activeDuration`, and exercise type fields. |
| `vo2_max`                  | `daily-vo2-max` / `vo2-max` / `run-vo2-max` | `health_metrics_and_measurements / activity_and_fitness` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/vo2_max.json` (Phase Z)          | `documented`      | Multiple variant data types exist. Phase Z must confirm which Fitbit Air device exposes.                                                               |

### Sleep Metrics

Rows 7–12 are seeded in migration `000003_provider_sync.sql`. All map to the single `sleep` Google
data type. The full sleep resource is documented in the parity matrix fixture at
`documented_schema/sleep_stages_session.json`.

| Canonical metric code  | Google data type  | Scope   | Operation          | Available? | Sample fixture path                                                                     | Validation status | Notes                                                                          |
| ---------------------- | ----------------- | ------- | ------------------ | ---------- | --------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| `sleep_duration`       | `sleep`           | `sleep` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/sleep_stages_session.json` (Phase Z) | `documented`      | Seeded row 7/15. `summary.minutesAsleep` → converted to seconds.               |
| `time_in_bed`          | `sleep`           | `sleep` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/sleep_stages_session.json` (Phase Z) | `documented`      | Seeded row 8/15. `summary.minutesInSleepPeriod` → seconds.                     |
| `sleep_latency`        | `sleep`           | `sleep` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/sleep_stages_session.json` (Phase Z) | `documented`      | Seeded row 9/15. `summary.minutesToFallAsleep`. Used in Bedtime Planner.       |
| `awake_duration`       | `sleep`           | `sleep` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/sleep_stages_session.json` (Phase Z) | `documented`      | Seeded row 10/15. `summary.minutesAwake` → seconds. WASO proxy.                |
| `rem_sleep_duration`   | `sleep`           | `sleep` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/sleep_stages_session.json` (Phase Z) | `documented`      | Seeded row 11/15. `stages[].type = REM`. Real payload validation required.     |
| `deep_sleep_duration`  | `sleep`           | `sleep` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/sleep_stages_session.json` (Phase Z) | `documented`      | Seeded row 12/15. `stages[].type = DEEP`. Real payload validation required.    |
| `light_sleep_duration` | `sleep`           | `sleep` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/sleep_stages_session.json` (Phase Z) | `documented`      | Not seeded. `stages[].type = LIGHT`. Real payload validation required.         |
| `sleep_efficiency`     | `sleep` (derived) | `sleep` | derived            | `DERIVED`  | `database/fixtures/provider/google_health/redacted/sleep_stages_session.json` (Phase Z) | `documented`      | `minutesAsleep / minutesInSleepPeriod`. Primis computes; not a provider field. |

### Vitals / Health Measurements

Rows 13–15 are seeded in migration `000003_provider_sync.sql`. Additional rows are not seeded.

| Canonical metric code | Google data type                                            | Scope                             | Operation          | Available? | Sample fixture path                                                                   | Validation status | Notes                                                                                                                    |
| --------------------- | ----------------------------------------------------------- | --------------------------------- | ------------------ | ---------- | ------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `hrv_daily_mean`      | `daily-heart-rate-variability`                              | `health_metrics_and_measurements` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/hrv_daily.json` (Phase Z)          | `documented`      | Seeded row 13/15. Daily HRV average. Use RMSSD when field is available.                                                  |
| `resting_heart_rate`  | `daily-resting-heart-rate`                                  | `health_metrics_and_measurements` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/resting_heart_rate.json` (Phase Z) | `documented`      | Seeded row 14/15. `beatsPerMinute`. Validate `calculationMethod` field in Phase Z.                                       |
| `oxygen_saturation`   | `daily-oxygen-saturation`                                   | `health_metrics_and_measurements` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/spo2_daily.json` (Phase Z)         | `documented`      | Seeded row 15/15. Daily SpO2. Device support may vary.                                                                   |
| `heart_rate`          | `heart-rate`                                                | `health_metrics_and_measurements` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/heart_rate_samples.json` (Phase Z) | `documented`      | High-frequency samples. High volume; partition/index carefully (data model §9.2).                                        |
| `hrv_rmssd`           | `heart-rate-variability`                                    | `health_metrics_and_measurements` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/hrv_rmssd.json` (Phase Z)          | `documented`      | Non-daily variant; deep-sleep RMSSD. Distinct from `daily-heart-rate-variability`.                                       |
| `respiratory_rate`    | `daily-respiratory-rate` / `respiratory-rate-sleep-summary` | `health_metrics_and_measurements` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/respiratory_rate.json` (Phase Z)   | `documented`      | Prefer sleep-window summary if present. MVP §7.5 uses `daily_respiratory_rate` (disambiguation: use `respiratory_rate`). |

### Body Composition

| Canonical metric code | Google data type | Scope                             | Operation          | Available? | Sample fixture path                                                         | Validation status | Notes                                                                                              |
| --------------------- | ---------------- | --------------------------------- | ------------------ | ---------- | --------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| `weight_kg`           | `weight`         | `health_metrics_and_measurements` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/weight.json` (Phase Z)   | `documented`      | MVP §7.5 uses `weight`; canonical code is `weight_kg`. Hume/HealthKit may be primary source later. |
| `body_fat_pct`        | `body-fat`       | `health_metrics_and_measurements` | `list / reconcile` | TBD        | `database/fixtures/provider/google_health/redacted/body_fat.json` (Phase Z) | `documented`      | MVP §7.5 uses `body_fat`; canonical code is `body_fat_pct`. P2/P3 per parity matrix.               |

### Nutrition

| Canonical metric code | Google data type         | Scope       | Operation                            | Available? | Sample fixture path                                                              | Validation status | Notes                                                                                                       |
| --------------------- | ------------------------ | ----------- | ------------------------------------ | ---------- | -------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `calories_in_kcal`    | `nutrition-log` / `food` | `nutrition` | `list / reconcile`                   | TBD        | `database/fixtures/provider/google_health/redacted/nutrition_log.json` (Phase Z) | `documented`      | One Google resource also yields `protein_g`, `carbs_g`, `fat_g` (see below).                                |
| `protein_g`           | `nutrition-log` / `food` | `nutrition` | `list / reconcile`                   | TBD        | `database/fixtures/provider/google_health/redacted/nutrition_log.json` (Phase Z) | `documented`      | From same resource as `calories_in_kcal`. MVP §7.5 `food` row covers all macros.                            |
| `carbs_g`             | `nutrition-log` / `food` | `nutrition` | `list / reconcile`                   | TBD        | `database/fixtures/provider/google_health/redacted/nutrition_log.json` (Phase Z) | `documented`      | From same resource as `calories_in_kcal`.                                                                   |
| `fat_g`               | `nutrition-log` / `food` | `nutrition` | `list / reconcile`                   | TBD        | `database/fixtures/provider/google_health/redacted/nutrition_log.json` (Phase Z) | `documented`      | From same resource as `calories_in_kcal`.                                                                   |
| `hydration_ml`        | `hydration-log`          | `nutrition` | `list / reconcile / create / update` | TBD        | `database/fixtures/provider/google_health/redacted/hydration_log.json` (Phase Z) | `documented`      | MVP §7.5 uses `hydration`; canonical code is `hydration_ml`. Manual logging likely primary in early builds. |

### Device / Sync Metrics

These map to the `provider_devices` table, not `metric_observations`. Not scalar metric codes.

| Canonical field / table column                                     | Google data type                   | Scope                   | Operation       | Available? | Sample fixture path                                                               | Validation status | Notes                                                         |
| ------------------------------------------------------------------ | ---------------------------------- | ----------------------- | --------------- | ---------- | --------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------- |
| `provider_devices.battery_level` (`device_battery_level_pct`)      | `users.pairedDevices.batteryLevel` | `device/provider scope` | `pairedDevices` | TBD        | `database/fixtures/provider/google_health/redacted/paired_devices.json` (Phase Z) | `documented`      | P1. Battery pill/widget in Home. Useful for stale-data state. |
| `provider_devices.last_sync_time` (`device_last_sync_age_seconds`) | `users.pairedDevices.lastSyncTime` | `device/provider scope` | `pairedDevices` | TBD        | `database/fixtures/provider/google_health/redacted/paired_devices.json` (Phase Z) | `documented`      | P1. Sync freshness; Home stale-data indicator.                |

---

## Provider-Proprietary Scores — Explicitly Unverified

> **These three metrics are marked `Available?: NO (unverified)` and MUST remain so until Phase AA
> live validation explicitly confirms that the Google Health API exposes these scores as first-class
> data types.** Do not treat them as available in any scoring logic, AI context assembly, or
> dashboard conditional.
>
> Primis will derive its own equivalent scores (`sleep_score`, `recovery_score`,
> `training_readiness_score`, `strain_score`) from underlying raw provider fields. See
> `primis_scoring_algorithms_spec.md` for formulas.

| Primis equivalent score                                        | Provider name              | Google data type / resource                      | Scope                            | Operation                   | Available?          | Sample fixture path | Validation status | Notes                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | -------------------------- | ------------------------------------------------ | -------------------------------- | --------------------------- | ------------------- | ------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sleep_score` (Primis-derived)                                 | `provider_sleep_score`     | Proprietary Google/Fitbit app score              | unknown                          | unknown                     | **NO (unverified)** | none                | `unverified`      | Google Health app displays a Sleep Score but **no confirmed API data type exposes it as a raw field**. Per `primis_data_model_health_metric_schema.md §3.1` and parity matrix §3: "Exact Google Sleep Score not assumed." Primis derives `sleep_score` from `sleep_duration`, stage durations, HRV, and RHR. Do not mark available until Phase AA live validation confirms otherwise. |
| `recovery_score` / `training_readiness_score` (Primis-derived) | `provider_readiness_score` | Proprietary Google/Fitbit readiness score        | unknown                          | unknown                     | **NO (unverified)** | none                | `unverified`      | Google Health app displays a Readiness score using HRV, sleep, and RHR as inputs. **No confirmed first-class API object exposes this score.** Primis derives `recovery_score` and `training_readiness_score` from raw HRV, RHR, and sleep data. Do not mark available until Phase AA live validation confirms otherwise.                                                              |
| `strain_score` (Primis-derived)                                | `provider_cardio_load`     | Derived from `exercise`, HR zones, AZM, calories | `activity_and_fitness` (partial) | derived from multiple types | **NO (unverified)** | none                | `unverified`      | Google Health app shows a Cardio Load metric. **Exact API exposure is unconfirmed.** Phase Z must explicitly test whether a `cardio-load` or equivalent data type exists. If absent, mark `unavailable_in_real_payload`. Primis derives `strain_score` from exercise sessions, `time_in_hr_zone`, `active_zone_minutes`, and calories.                                                |

---

## Phase Z Live Validation Instructions

When completing M1-T005 (create metric availability decision record), update this file as follows:

1. Replace each `Available?: TBD` with either `YES (documented)` or `NO (unverified)`.
2. Set `Validation status` to `real_payload_validated` for rows with a committed redacted fixture, or
   `unavailable_in_real_payload` for confirmed absences.
3. Fill `Sample fixture path` with the committed path once the fixture passes the
   `database/fixtures/README.md §5` review checklist.
4. For provider scores, only change `Available?: NO (unverified)` if the raw API payload for a test
   account explicitly includes the field — not just because the consumer app UI displays it.
5. Document any surprises (unexpected fields, missing fields, data-shape differences) in a new ADR
   under `docs/decisions/` and reference it in the Notes column.

> **Do not run live validation in CI or automated tests.** Live validation requires real OAuth
> credentials in `.env` (never committed). See `scripts/google-health-spike/README.md` for the
> spike script usage instructions.

---

## References

- `docs/source-of-truth/primis_google_health_api_feature_parity_matrix.md` — classification and
  validation status enums; 38-row parity matrix with field paths and Google endpoint families
- `docs/source-of-truth/primis_data_model_health_metric_schema.md §9.2` — canonical metric code
  registry (authoritative source for all metric code names used in this document)
- `docs/source-of-truth/primis_mvp_build_plan_milestones.md §7` — M1 metric availability matrix
  template and M1-T005 acceptance criteria
- `database/migrations/000003_provider_sync.sql` — 15 seeded `provider_metric_mappings` rows with
  `verification_status = 'unverified'`
- `database/fixtures/README.md` — fixture redaction policy and directory layout
- `plans/phase-e-provider-validation-sync-infrastructure.md §5 CU-034` — this document's CU spec
- Google Health API data types: <https://developers.google.com/health/data-types>
- Google Health API REST reference: <https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints>

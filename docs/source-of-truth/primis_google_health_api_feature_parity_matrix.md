
# Primis Google Health API Feature Parity Matrix

**Document type:** Decision record / feature parity matrix  
**Product:** Primis  
**Version:** 1.0  
**Status:** Required source-of-truth companion document  
**Last updated:** 2026-06-07  
**Primary audience:** AI coding agents, backend engineers, mobile engineers, product owner

## 0. Purpose

This document maps Google Health app screenshot features to Google Health API endpoint/data types and Primis implementation status. It exists because AI coding model memory resets every commit; future coding agents must not rely on chat history to remember which metrics are direct provider fields, provider summaries, Primis-derived equivalents, or unverified proprietary scores.

## 1. Classification enum

| Classification | Meaning |
|---|---|
| `provider_direct` | Direct provider data point/field available from Google Health API docs. |
| `provider_summary` | Provider-computed summary field available from Google Health API docs. |
| `primis_derived` | Primis computes from underlying provider data. |
| `manual_or_third_party` | Requires manual entry, FoodData Central, HealthKit, Hume, or another source. |
| `unsupported_or_deferred` | Not planned in MVP or not available through current source. |
| `provider_unverified` | Official docs or screenshots imply possible support, but real payload validation has not confirmed it. |

## 2. Validation status enum

| Status | Meaning |
|---|---|
| `documented` | Official API docs support schema/endpoint. |
| `documented_schema_fixture` | Synthetic fixture based on docs exists. |
| `real_payload_validated` | Real redacted payload exists from founder/test account. |
| `unavailable_in_real_payload` | Checked live and not present. |
| `deferred` | Not checked/implemented yet. |
| `unverified` | Not enough evidence. |

## 3. Matrix

| Google Health UI feature | Primis feature | Google endpoint family | Google data type / resource | Google field path | Required scope | Classification | Canonical metric/table | Fixture path | Validation status | Phase | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Paired device battery 96% | Device battery pill/widget | pairedDevices | `users.pairedDevices` | `batteryLevel`, `batteryStatus` | device/provider scope per Google docs | provider_direct | `provider_devices.battery_level`, `device_battery_level_pct` | `documented_schema/paired_devices.json` | documented | P1 | Real payload validation required. |
| Device last sync | Sync freshness | pairedDevices | `users.pairedDevices` | `lastSyncTime` | device/provider scope per Google docs | provider_direct | `provider_devices.last_sync_time`, `device_last_sync_age_seconds` | `documented_schema/paired_devices.json` | documented | P1 | Useful for Home stale-data state. |
| Steps | Steps card/ring | dailyRollUp/list/reconcile | `steps` | data point value | activity_and_fitness | provider_direct | `steps`, `daily_metric_summaries` | TBD | documented | P1 | Use daily rollup for Home. |
| Calories burned | Energy burned | dailyRollUp/list/reconcile | `active-energy-burned`, `total-calories` | data point value | activity_and_fitness | provider_direct | `active_energy_kcal`, `total_energy_kcal` | TBD | documented | P1 | Label active vs total. |
| Floors | Floors climbed | dailyRollUp/list/reconcile | `floors` | data point value | activity_and_fitness | provider_direct | `floors` | TBD | documented | P1 | Device support may vary. |
| Active Zone Minutes | Active zone minutes | dailyRollUp/list/reconcile | `active-zone-minutes` | minutes | activity_and_fitness | provider_direct | `active_zone_minutes` | TBD | documented | P1 | Home/activity widget. |
| Exercise days | Exercise days | list/reconcile | `exercise` | sessions by date | activity_and_fitness | primis_derived | `workout_sessions`, `training_load_daily` | TBD | documented | P1 | Derived from exercise sessions. |
| Workouts | Workout history/details | list/reconcile | `exercise` | `metricsSummary`, `activeDuration`, type | activity_and_fitness | provider_direct | `workout_sessions` | `documented_schema/exercise_session.json` | documented | P1/P2 | Primis analyzes, does not record workouts in v1. |
| Heart-rate zones | Workout/activity zone summaries | list/reconcile/dailyRollUp | `time-in-heart-rate-zone`, `daily-heart-rate-zones`, exercise metrics | zones/durations | activity_and_fitness or health scope per data type | provider_direct | `time_in_hr_zone`, workout zone summaries | TBD | documented | P2 | Used for training load. |
| Readiness | Primis Recovery + Training Readiness | none confirmed | proprietary Google app score | unknown | unknown | provider_unverified + primis_derived | `score_snapshots` | none | unverified | P1/P2 | Google help says readiness uses HRV, sleep, RHR; API score field not assumed. |
| Cardio Load | Primis training/cardio load equivalent | none confirmed / derived from exercise/zones | exercise, HR zones, AZM, calories | various | activity_and_fitness | provider_unverified + primis_derived | `training_load_daily` | TBD | unverified | P2 | Exact Google Cardio Load not assumed. |
| Sleep Score | Primis Sleep Score | none confirmed / derived from sleep/vitals | sleep + vitals | various | sleep + health metrics | provider_unverified + primis_derived | `score_snapshots` | TBD | unverified | P1 | Exact Google Sleep Score not assumed. |
| Sleep duration | Sleep duration | list/reconcile | `sleep` | `summary.minutesAsleep`, interval | sleep | provider_summary | `sleep_sessions.minutes_asleep` | `documented_schema/sleep_stages_session.json` | documented | P1 | Prefer summary over raw interval for asleep duration. |
| Sleep period / time in bed | Sleep period | list/reconcile | `sleep` | `summary.minutesInSleepPeriod` | sleep | provider_summary | `sleep_sessions.minutes_in_sleep_period` | `documented_schema/sleep_stages_session.json` | documented | P1 | Used for efficiency. |
| Time to fall asleep | Sleep latency | list/reconcile | `sleep` | `summary.minutesToFallAsleep` | sleep | provider_summary | `sleep_sessions.minutes_to_fall_asleep` | `documented_schema/sleep_stages_session.json` | documented | P1 | Used in Bedtime Planner. |
| Minutes awake | Awake minutes | list/reconcile | `sleep` | `summary.minutesAwake` | sleep | provider_summary | `sleep_sessions.minutes_awake` | `documented_schema/sleep_stages_session.json` | documented | P1 | Used in efficiency/interruptions. |
| Minutes after wake-up | Wake-after-sleep context | list/reconcile | `sleep` | `summary.minutesAfterWakeUp` | sleep | provider_summary | `sleep_sessions.minutes_after_wake_up` | `documented_schema/sleep_stages_session.json` | documented | P1 | Google says restlessness algorithm calculates it. |
| Sleep stages diagram | SleepStageTimeline | list/reconcile | `sleep` | `stages[]` | sleep | provider_direct | `sleep_stage_intervals`, chart segments | `documented_schema/sleep_stages_session.json` | documented | P1 | Supports AWAKE/LIGHT/DEEP/REM and classic fallback. |
| REM sleep | REM summary/card | list/reconcile | `sleep` | `stages[].type=REM`, `stagesSummary` | sleep | provider_direct/provider_summary | `sleep_stage_intervals`, `sleep_stage_summaries` | documented schema | documented | P1 | Real payload validation required. |
| Deep sleep | Deep summary/card | list/reconcile | `sleep` | `stages[].type=DEEP`, `stagesSummary` | sleep | provider_direct/provider_summary | `sleep_stage_intervals`, `sleep_stage_summaries` | documented schema | documented | P1 | Real payload validation required. |
| Light sleep | Light summary/card | list/reconcile | `sleep` | `stages[].type=LIGHT`, `stagesSummary` | sleep | provider_direct/provider_summary | `sleep_stage_intervals`, `sleep_stage_summaries` | documented schema | documented | P1 | Real payload validation required. |
| Restlessness | Restlessness equivalent | list/reconcile | `sleep` | `RESTLESS` stage or disruption proxy | sleep | provider_direct/primis_derived | `sleep_stage_intervals`, derived metrics | classic fixture | documented | P2 | Exact Google display logic not assumed. |
| Interruptions / out of bed | Interruption count | list/reconcile | `sleep` | `outOfBedSegments[]`, awake intervals | sleep | provider_direct/primis_derived | `sleep_out_of_bed_segments`, derived metrics | sleep fixture | documented | P2 | Threshold rules in scoring spec. |
| Sleep efficiency | Sleep efficiency | derived | `sleep` | minutesAsleep / minutesInSleepPeriod | sleep | primis_derived | `sleep_daily_features` | sleep fixture | documented | P1 | Formula transparent. |
| Sleep schedule | Bed/wake timing | derived | `sleep` | interval start/end + local offsets | sleep | primis_derived | `sleep_sessions`, daily features | sleep fixture | documented | P1 | Wake-date convention. |
| HRV | HRV cards/recovery | list/reconcile | `daily-heart-rate-variability`, `heart-rate-variability` | average HRV, deep-sleep RMSSD, entropy | health_metrics_and_measurements | provider_direct | `hrv_*` metrics | daily HRV fixture | documented | P1/P2 | Deep-sleep RMSSD supported by schema. |
| Resting heart rate | RHR cards/recovery | list/reconcile | `daily-resting-heart-rate` | `beatsPerMinute`, calculation method | health_metrics_and_measurements | provider_direct | `resting_heart_rate_bpm` | RHR fixture | documented | P1 | Calculation method metadata important. |
| Heart rate during sleep | Sleep-window HR | list/reconcile | `heart-rate` | samples overlapping sleep interval | health_metrics_and_measurements | primis_derived from provider_direct | `heart_rate_bpm` | TBD | documented | P2 | Depends on granularity/volume. |
| Respiratory rate | Breathing rate | list/reconcile | `daily-respiratory-rate`, `respiratory-rate-sleep-summary` | daily/sample summary | health_metrics_and_measurements | provider_direct | `respiratory_rate_bpm` | respiratory fixture | documented | P1/P2 | Use sleep summary if present. |
| SpO2 | Oxygen saturation | list/reconcile | `daily-oxygen-saturation`, `oxygen-saturation` | daily/sample value | health_metrics_and_measurements | provider_direct | `oxygen_saturation_pct` | oxygen fixture | documented | P1/P2 | Device support may vary. |
| VO2 Max | VO2 max | list/reconcile | `daily-vo2-max`, `vo2-max`, `run-vo2-max` | values | health_metrics_and_measurements/activity | provider_direct | `vo2_max` | TBD | documented | P2 | Map daily/sample variants. |
| Blood glucose | Blood glucose card | list/reconcile | `blood-glucose` | sample value | health_metrics_and_measurements | provider_direct if source exists | `blood_glucose` | TBD | documented | P3 | Fitbit Air likely does not generate this. |
| Weight | Weight card | list/reconcile | `weight` | sample value | health_metrics_and_measurements | provider_direct | `weight_kg` | TBD | documented | P1/P2 | Hume/HealthKit later. |
| Body fat | Body fat card | list/reconcile | `body-fat` | sample value | health_metrics_and_measurements | provider_direct | `body_fat_pct` | TBD | documented | P2/P3 | Hume/HealthKit later. |
| Hydration | Hydration logging/card | list/reconcile/create/update possible depending data type | `hydration-log` | session/log | nutrition | provider_direct/manual | `hydration_entries` | TBD | documented | P1/P2 | Manual logging likely primary early. |
| Calorie intake | Calories in | list/reconcile | `nutrition-log`, `food` | nutrients/entries | nutrition | provider_direct/manual_or_third_party | `nutrition_entries` | TBD | documented | P1/P2 | FoodData Central later. |
| Carbs/fat/protein | Macros | list/reconcile | `nutrition-log`, `food` | nutrient values | nutrition | provider_direct/manual_or_third_party | `nutrition_entry_items`, daily summaries | TBD | documented | P1/P2 | Manual macros first. |
| AI Reply / Ask Coach | Primis AI Coach | Primis backend | normalized metrics/scores/context | N/A | N/A | primis_derived | `ai_conversations`, `ai_summaries` | N/A | planned | P1/P2 | Better than Google via structured context. |

## 4. Required live-validation updates

After OAuth/device validation, update each row's `Validation status` and `Fixture path`. Do not leave any P1 sleep-critical row as `unverified` before private beta.

## 5. Source references

- Google Health API data types: `https://developers.google.com/health/data-types`
- Google Health API dataPoints reference: `https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints`
- Google Health API paired devices reference: `https://developers.google.com/health/reference/rest/v4/users.pairedDevices`
- Google Health API list endpoint: `https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/list`
- Google Health API reconcile endpoint: `https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/reconcile`
- Google Health API daily rollup endpoint: `https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/dailyRollUp`

-- =============================================================================
-- CU-030: Health Domain Summary and Domain-Specific Tables
--
-- Adds queryable domain tables for sleep, workout/activity, vitals,
-- body composition, manual inputs, and nutrition per Data Model §11–15.
--
-- Tables in this file are storage-only in Phase D. Computed columns
-- (e.g. sleep_daily_features, training_load_daily, vital_daily_features,
-- daily_nutrition_summaries) will be populated by the Phase F scoring engine.
-- Do NOT back-fill these columns during Phase D.
--
-- Dependency order:
--   Requires: users                (000002_identity_preferences.sql)
--   Requires: provider_connections (000003_provider_sync.sql)
--   Requires: metric_definitions   (000004_metrics.sql)
-- =============================================================================


-- =============================================================================
-- §11 SLEEP DOMAIN
-- =============================================================================

-- =============================================================================
-- §11.1  sleep_sessions
--
-- One row per provider sleep session. Unique on
--   (user_id, source_provider, source_record_id).
--
-- local_sleep_date: use wake date per ARCH-TIME-004. Sleep sessions crossing
-- midnight should store the date of wake-up, not the date of sleep onset.
-- =============================================================================

create table if not exists sleep_sessions (
  id                             uuid          primary key default gen_random_uuid(),
  user_id                        uuid          not null references users(id) on delete cascade,
  provider_connection_id         uuid          references provider_connections(id) on delete set null,
  source_provider                text          not null,
  source_record_id               text,

  session_start_utc              timestamptz   not null,
  session_end_utc                timestamptz   not null,
  -- local_sleep_date: use wake date per ARCH-TIME-004
  local_sleep_date               date          not null,
  timezone                       text          not null,

  time_in_bed_seconds            int,
  total_sleep_seconds            int,
  awake_seconds                  int,
  light_sleep_seconds            int,
  deep_sleep_seconds             int,
  rem_sleep_seconds              int,
  unknown_sleep_seconds          int,
  sleep_latency_seconds          int,
  wake_after_sleep_onset_seconds int,
  sleep_efficiency_pct           numeric(5,2),

  -- provider_sleep_score: may be null — not all providers expose app-visible scores
  provider_sleep_score           numeric(5,2),
  -- primis_sleep_score: derived by Phase F scoring engine; also stored in score_snapshots
  primis_sleep_score             numeric(5,2),

  -- nap_type: nap, main, unknown
  is_main_sleep                  boolean       not null default true,
  nap_type                       text,
  -- data_quality: normal, estimated, partial, sparse, stale, low_confidence
  data_quality                   text          not null default 'normal',
  confidence_score               numeric(5,4),
  metadata                       jsonb         not null default '{}',

  created_at                     timestamptz   not null default now(),
  updated_at                     timestamptz   not null default now(),

  unique (user_id, source_provider, source_record_id)
);

create index if not exists idx_sleep_sessions_user_date
  on sleep_sessions (user_id, local_sleep_date desc);

create index if not exists idx_sleep_sessions_user_start
  on sleep_sessions (user_id, session_start_utc desc);


-- =============================================================================
-- §11.2  sleep_stage_intervals
--
-- Granular sleep stage segments within a session.
-- Cascade-deleted when the parent sleep_sessions row is deleted.
-- stage: awake, light, deep, rem, asleep_unknown
-- =============================================================================

create table if not exists sleep_stage_intervals (
  id                  uuid          primary key default gen_random_uuid(),
  sleep_session_id    uuid          not null references sleep_sessions(id) on delete cascade,
  user_id             uuid          not null references users(id) on delete cascade,
  -- stage: awake, light, deep, rem, asleep_unknown
  stage               text          not null,
  start_time_utc      timestamptz   not null,
  end_time_utc        timestamptz   not null,
  duration_seconds    int           not null,
  source_provider     text          not null,
  source_record_id    text,
  confidence_score    numeric(5,4),
  metadata            jsonb         not null default '{}'
);

create index if not exists idx_sleep_intervals_session
  on sleep_stage_intervals (sleep_session_id);

create index if not exists idx_sleep_intervals_user_time
  on sleep_stage_intervals (user_id, start_time_utc desc);


-- =============================================================================
-- §11.3  sleep_daily_features
--
-- Precomputed sleep features for scoring and AI context. Populated by Phase F+.
-- All scoring columns are nullable — the row may be created as a shell before
-- the Phase F engine computes values.
-- unique(user_id, local_date)
-- =============================================================================

create table if not exists sleep_daily_features (
  id                           uuid          primary key default gen_random_uuid(),
  user_id                      uuid          not null references users(id) on delete cascade,
  local_date                   date          not null,
  timezone                     text          not null,

  main_sleep_session_id        uuid          references sleep_sessions(id) on delete set null,
  bedtime_local                time,
  wake_time_local              time,
  midpoint_sleep_local         time,

  -- All computed metrics are nullable until Phase F populates them.
  total_sleep_seconds          int,
  time_in_bed_seconds          int,
  sleep_efficiency_pct         numeric(5,2),
  sleep_latency_seconds        int,
  deep_sleep_pct               numeric(5,2),
  rem_sleep_pct                numeric(5,2),
  awake_pct                    numeric(5,2),

  sleep_debt_seconds           int,
  sleep_consistency_score      numeric(5,2),
  bedtime_regularity_score     numeric(5,2),
  wake_time_regularity_score   numeric(5,2),
  estimated_sleep_need_seconds int,
  chronotype_offset_minutes    int,

  overnight_avg_hr             numeric(6,2),
  overnight_min_hr             numeric(6,2),
  overnight_hrv_rmssd          numeric(8,2),
  overnight_resp_rate          numeric(6,2),
  overnight_spo2_avg           numeric(5,2),
  overnight_spo2_min           numeric(5,2),

  data_quality                 text          not null default 'normal',
  confidence_score             numeric(5,4),
  generated_at                 timestamptz   not null default now(),
  metadata                     jsonb         not null default '{}',

  unique (user_id, local_date)
);

create index if not exists idx_sleep_features_user_date
  on sleep_daily_features (user_id, local_date desc);


-- =============================================================================
-- §11.4a  bedtime_planner_requests
--
-- Stores bedtime planner requests from users or home widgets.
-- Endpoints for this table are deferred to Phase G.
-- source: user, home_widget, ai_chat
-- =============================================================================

create table if not exists bedtime_planner_requests (
  id                           uuid          primary key default gen_random_uuid(),
  user_id                      uuid          not null references users(id) on delete cascade,
  target_wake_time_local       timestamp     not null,
  timezone                     text          not null,
  desired_sleep_seconds        int,
  flexible_wake_window_minutes int           not null default 0,
  next_day_context             jsonb         not null default '{}',
  requested_at                 timestamptz   not null default now(),
  -- source: user, home_widget, ai_chat
  source                       text          not null default 'user',
  metadata                     jsonb         not null default '{}'
);

create index if not exists idx_bedtime_requests_user
  on bedtime_planner_requests (user_id, requested_at desc);


-- =============================================================================
-- §11.4b  bedtime_recommendations
--
-- Stores ranked bedtime recommendation windows for a planner request.
-- Cascade-deleted when the parent request is deleted.
-- label: best, good, last_acceptable, recovery_priority, circadian_friendly
-- =============================================================================

create table if not exists bedtime_recommendations (
  id                                  uuid          primary key default gen_random_uuid(),
  request_id                          uuid          not null
                                        references bedtime_planner_requests(id) on delete cascade,
  user_id                             uuid          not null references users(id) on delete cascade,
  rank                                int           not null,
  -- label: best, good, last_acceptable, recovery_priority, circadian_friendly
  label                               text          not null,

  recommended_bedtime_start_local     timestamp     not null,
  recommended_bedtime_end_local       timestamp     not null,
  estimated_fall_asleep_time_local    timestamp,
  target_wake_time_local              timestamp     not null,

  expected_sleep_opportunity_seconds  int,
  expected_actual_sleep_seconds       int,
  expected_cycles                     numeric(4,2),
  cycle_alignment_score               numeric(5,2),
  circadian_alignment_score           numeric(5,2),
  recovery_support_score              numeric(5,2),
  overall_recommendation_score        numeric(5,2),

  rationale_structured                jsonb         not null default '{}',
  ai_explanation                      text,
  generated_at                        timestamptz   not null default now(),
  metadata                            jsonb         not null default '{}'
);

create index if not exists idx_bedtime_recs_request
  on bedtime_recommendations (request_id, rank);


-- =============================================================================
-- §12 WORKOUT AND ACTIVITY DOMAIN
-- =============================================================================

-- =============================================================================
-- §12.1  workout_sessions
--
-- One row per provider workout event. Unique on
--   (user_id, source_provider, source_record_id).
-- =============================================================================

create table if not exists workout_sessions (
  id                        uuid          primary key default gen_random_uuid(),
  user_id                   uuid          not null references users(id) on delete cascade,
  provider_connection_id    uuid          references provider_connections(id) on delete set null,
  source_provider           text          not null,
  source_record_id          text,

  -- workout_type: run, walk, strength_training, basketball, cycling, etc.
  workout_type              text          not null,
  display_name              text,
  start_time_utc            timestamptz   not null,
  end_time_utc              timestamptz   not null,
  local_date                date          not null,
  timezone                  text          not null,

  duration_seconds          int           not null,
  active_duration_seconds   int,
  distance_m                double precision,
  active_energy_kcal        double precision,
  total_energy_kcal         double precision,
  avg_hr_bpm                numeric(6,2),
  max_hr_bpm                numeric(6,2),
  min_hr_bpm                numeric(6,2),
  elevation_gain_m          double precision,
  steps_count               int,

  provider_strain_score     numeric(5,2),
  primis_strain_score       numeric(5,2),
  training_load             numeric(10,2),
  -- perceived_exertion: optional 1-10 manual override
  perceived_exertion        int,

  data_quality              text          not null default 'normal',
  confidence_score          numeric(5,4),
  metadata                  jsonb         not null default '{}',
  created_at                timestamptz   not null default now(),
  updated_at                timestamptz   not null default now(),

  unique (user_id, source_provider, source_record_id)
);

create index if not exists idx_workout_sessions_user_date
  on workout_sessions (user_id, local_date desc);

create index if not exists idx_workout_sessions_user_start
  on workout_sessions (user_id, start_time_utc desc);


-- =============================================================================
-- §12.2  workout_hr_zone_summaries
--
-- Heart-rate zone totals for a workout session.
-- Cascade-deleted when the parent workout_sessions row is deleted.
-- zone_code: z1, z2, z3, z4, z5, custom
-- =============================================================================

create table if not exists workout_hr_zone_summaries (
  id                  uuid          primary key default gen_random_uuid(),
  workout_session_id  uuid          not null references workout_sessions(id) on delete cascade,
  user_id             uuid          not null references users(id) on delete cascade,
  -- zone_code: z1, z2, z3, z4, z5, custom
  zone_code           text          not null,
  zone_label          text,
  lower_bpm           int,
  upper_bpm           int,
  duration_seconds    int           not null default 0,
  calories_kcal       double precision,
  metadata            jsonb         not null default '{}',

  unique (workout_session_id, zone_code)
);

create index if not exists idx_workout_zones_session
  on workout_hr_zone_summaries (workout_session_id);


-- =============================================================================
-- §12.3  training_load_daily
--
-- Daily training load aggregation. Populated by Phase F+.
-- All computed load fields are nullable until Phase F populates them.
-- unique(user_id, local_date)
-- load_status: well_below, below, steady, above, well_above
-- =============================================================================

create table if not exists training_load_daily (
  id                      uuid          primary key default gen_random_uuid(),
  user_id                 uuid          not null references users(id) on delete cascade,
  local_date              date          not null,
  timezone                text          not null,

  -- Nullable: populated by Phase F scoring engine
  daily_training_load     numeric(10,2),
  daily_strain_score      numeric(5,2),
  workout_count           int           not null default 0,
  active_energy_kcal      double precision,
  active_minutes_seconds  int,
  zone_minutes_seconds    int,

  acute_load_7d           numeric(10,2),
  chronic_load_28d        numeric(10,2),
  acute_chronic_ratio     numeric(6,3),
  -- load_status: well_below, below, steady, above, well_above
  load_status             text,

  generated_at            timestamptz   not null default now(),
  data_quality            text          not null default 'normal',
  metadata                jsonb         not null default '{}',

  unique (user_id, local_date)
);

create index if not exists idx_training_load_user_date
  on training_load_daily (user_id, local_date desc);


-- =============================================================================
-- §13 VITALS AND BODY COMPOSITION DOMAIN
-- =============================================================================

-- =============================================================================
-- §13.1  body_composition_measurements
--
-- One row per scale/device measurement. Unique on
--   (user_id, source_provider, source_record_id).
-- source_provider: healthkit, google_health, hume_via_healthkit, manual
-- =============================================================================

create table if not exists body_composition_measurements (
  id                        uuid          primary key default gen_random_uuid(),
  user_id                   uuid          not null references users(id) on delete cascade,
  provider_connection_id    uuid          references provider_connections(id) on delete set null,
  -- source_provider: healthkit, google_health, hume_via_healthkit, manual
  source_provider           text          not null,
  source_record_id          text,

  measured_at_utc           timestamptz   not null,
  local_date                date          not null,
  timezone                  text          not null,

  weight_kg                 numeric(8,3),
  body_fat_pct              numeric(5,2),
  lean_mass_kg              numeric(8,3),
  fat_mass_kg               numeric(8,3),
  bone_mass_kg              numeric(8,3),
  body_water_pct            numeric(5,2),
  visceral_fat_index        numeric(8,3),
  bmr_kcal                  numeric(8,2),
  bmi                       numeric(5,2),

  segmental_data            jsonb         not null default '{}',
  data_quality              text          not null default 'normal',
  confidence_score          numeric(5,4),
  metadata                  jsonb         not null default '{}',
  created_at                timestamptz   not null default now(),
  updated_at                timestamptz   not null default now(),

  unique (user_id, source_provider, source_record_id)
);

create index if not exists idx_body_comp_user_date
  on body_composition_measurements (user_id, local_date desc);

create index if not exists idx_body_comp_user_measured
  on body_composition_measurements (user_id, measured_at_utc desc);


-- =============================================================================
-- §13.2  vital_daily_features
--
-- Daily vital sign aggregation. Populated by Phase F+.
-- All computed columns are nullable until Phase F populates them.
-- unique(user_id, local_date)
-- =============================================================================

create table if not exists vital_daily_features (
  id                        uuid          primary key default gen_random_uuid(),
  user_id                   uuid          not null references users(id) on delete cascade,
  local_date                date          not null,
  timezone                  text          not null,

  -- Nullable: computed from metric_observations by Phase F
  resting_heart_rate_bpm    numeric(6,2),
  hrv_rmssd_ms              numeric(8,2),
  avg_heart_rate_bpm        numeric(6,2),
  min_heart_rate_bpm        numeric(6,2),
  max_heart_rate_bpm        numeric(6,2),
  avg_spo2_pct              numeric(5,2),
  min_spo2_pct              numeric(5,2),
  respiratory_rate_bpm      numeric(6,2),
  skin_temp_delta_c         numeric(6,3),
  vo2_max                   numeric(6,2),

  rhr_vs_30d_delta          numeric(8,3),
  hrv_vs_30d_delta_pct      numeric(8,3),
  resp_rate_vs_30d_delta    numeric(8,3),
  spo2_vs_30d_delta         numeric(8,3),

  data_quality              text          not null default 'normal',
  confidence_score          numeric(5,4),
  generated_at              timestamptz   not null default now(),
  metadata                  jsonb         not null default '{}',

  unique (user_id, local_date)
);

create index if not exists idx_vital_features_user_date
  on vital_daily_features (user_id, local_date desc);


-- =============================================================================
-- §14 MANUAL INPUTS AND LIFESTYLE CONTEXT
-- =============================================================================

-- =============================================================================
-- §14.1  manual_checkins
--
-- Subjective daily check-in records.
-- checkin_type: daily, post_workout, sleep_reflection, nutrition, digestion, custom
-- Supports soft delete via deleted_at.
-- =============================================================================

create table if not exists manual_checkins (
  id                    uuid          primary key default gen_random_uuid(),
  user_id               uuid          not null references users(id) on delete cascade,
  -- checkin_type: daily, post_workout, sleep_reflection, nutrition, digestion, custom
  checkin_type          text          not null,
  occurred_at_utc       timestamptz   not null,
  local_date            date          not null,
  timezone              text          not null,

  -- Subjective scores: 1-5 scale; null when not provided
  energy_score          int,
  mood_score            int,
  stress_score          int,
  -- soreness_score: 0-5
  soreness_score        int,
  -- optional scores; included only when user enables them
  productivity_score    int,
  motivation_score      int,
  libido_score          int,

  notes                 text,
  completion_seconds    int,
  metadata              jsonb         not null default '{}',
  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now()
);

create index if not exists idx_checkins_user_date
  on manual_checkins (user_id, local_date desc);

create index if not exists idx_checkins_user_type
  on manual_checkins (user_id, checkin_type, local_date desc);


-- =============================================================================
-- §14.2  custom_tags
--
-- User-defined or system-suggested event tags.
-- unique(user_id, tag_code)
-- category: food, training, sleep, stress, supplement, lifestyle, custom
-- =============================================================================

create table if not exists custom_tags (
  id                      uuid          primary key default gen_random_uuid(),
  user_id                 uuid          not null references users(id) on delete cascade,
  tag_code                text          not null,
  display_name            text          not null,
  -- category: food, training, sleep, stress, supplement, lifestyle, custom
  category                text,
  is_system_suggested     boolean       not null default false,
  is_active               boolean       not null default true,
  metadata                jsonb         not null default '{}',
  created_at              timestamptz   not null default now(),
  updated_at              timestamptz   not null default now(),

  unique (user_id, tag_code)
);

create index if not exists idx_custom_tags_user
  on custom_tags (user_id, is_active)
  where is_active = true;


-- =============================================================================
-- §14.3  tag_events
--
-- Records of a custom tag being applied at a specific time.
-- linked_entity_type: nutrition_entry, workout_session, sleep_session,
--   manual_checkin
-- =============================================================================

create table if not exists tag_events (
  id                    uuid          primary key default gen_random_uuid(),
  user_id               uuid          not null references users(id) on delete cascade,
  custom_tag_id         uuid          references custom_tags(id) on delete set null,
  tag_code              text          not null,
  occurred_at_utc       timestamptz   not null,
  local_date            date          not null,
  timezone              text          not null,
  -- intensity: optional 1-5
  intensity             int,
  quantity              numeric(10,3),
  unit                  text,
  notes                 text,
  -- linked_entity_type: nutrition_entry, workout_session, sleep_session, manual_checkin
  linked_entity_type    text,
  linked_entity_id      uuid,
  created_at            timestamptz   not null default now(),
  metadata              jsonb         not null default '{}'
);

create index if not exists idx_tag_events_user_date
  on tag_events (user_id, local_date desc);

create index if not exists idx_tag_events_user_tag
  on tag_events (user_id, tag_code, local_date desc);


-- =============================================================================
-- §14.4  hydration_entries
--
-- Fluid intake log entries.
-- source_type: manual (default), provider
-- =============================================================================

create table if not exists hydration_entries (
  id               uuid          primary key default gen_random_uuid(),
  user_id          uuid          not null references users(id) on delete cascade,
  -- source_type: manual, provider
  source_type      text          not null default 'manual',
  occurred_at_utc  timestamptz   not null,
  local_date       date          not null,
  timezone         text          not null,
  amount_ml        numeric(10,2) not null,
  beverage_type    text          default 'water',
  metadata         jsonb         not null default '{}',
  created_at       timestamptz   not null default now()
);

create index if not exists idx_hydration_user_date
  on hydration_entries (user_id, local_date desc);


-- =============================================================================
-- §14.5  caffeine_entries
--
-- Caffeine intake log entries.
-- beverage_type: coffee, espresso, energy_drink, tea, preworkout, other
-- =============================================================================

create table if not exists caffeine_entries (
  id                   uuid          primary key default gen_random_uuid(),
  user_id              uuid          not null references users(id) on delete cascade,
  occurred_at_utc      timestamptz   not null,
  local_date           date          not null,
  timezone             text          not null,
  caffeine_mg          numeric(10,2),
  -- beverage_type: coffee, espresso, energy_drink, tea, preworkout, other
  beverage_type        text,
  serving_description  text,
  estimated            boolean       not null default true,
  metadata             jsonb         not null default '{}',
  created_at           timestamptz   not null default now()
);

create index if not exists idx_caffeine_user_date
  on caffeine_entries (user_id, local_date desc);


-- =============================================================================
-- §14.6  alcohol_entries
--
-- Alcohol intake log entries.
-- drink_range: none, one, two, three_four, five_plus
-- alcohol_type: beer, wine, liquor, cocktail, mixed, other
-- =============================================================================

create table if not exists alcohol_entries (
  id                      uuid          primary key default gen_random_uuid(),
  user_id                 uuid          not null references users(id) on delete cascade,
  occurred_at_utc         timestamptz   not null,
  local_date              date          not null,
  timezone                text          not null,
  standard_drinks         numeric(5,2)  not null,
  -- drink_range: none, one, two, three_four, five_plus
  drink_range             text,
  -- alcohol_type: beer, wine, liquor, cocktail, mixed, other
  alcohol_type            text,
  last_drink_time_utc     timestamptz,
  notes                   text,
  metadata                jsonb         not null default '{}',
  created_at              timestamptz   not null default now()
);

create index if not exists idx_alcohol_user_date
  on alcohol_entries (user_id, local_date desc);


-- =============================================================================
-- §14.7  bowel_entries
--
-- Optional gut health tracking.
-- S3-like sensitivity: use for trend/correlation only; do not diagnose disease.
-- bristol_type: 1-7
-- color: brown, green, yellow, black, red, pale, other, unknown
-- smell: normal, strong, sulfur, unusual, unknown
-- urgency: none, mild, urgent
-- completeness: incomplete, normal, complete, unknown
-- =============================================================================

create table if not exists bowel_entries (
  id              uuid          primary key default gen_random_uuid(),
  user_id         uuid          not null references users(id) on delete cascade,
  occurred_at_utc timestamptz   not null,
  local_date      date          not null,
  timezone        text          not null,

  -- bristol_type: 1-7; null if not provided
  bristol_type    int,
  -- color: brown, green, yellow, black, red, pale, other, unknown
  color           text,
  -- smell: normal, strong, sulfur, unusual, unknown
  smell           text,
  -- urgency: none, mild, urgent
  urgency         text,
  -- pain_level: 0-5
  pain_level      int,
  -- bloating_level: 0-5
  bloating_level  int,
  -- completeness: incomplete, normal, complete, unknown
  completeness    text,
  notes           text,

  data_quality    text          not null default 'user_reported',
  metadata        jsonb         not null default '{}',
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index if not exists idx_bowel_user_date
  on bowel_entries (user_id, local_date desc);


-- =============================================================================
-- §15 NUTRITION AND FOOD CATALOG
-- =============================================================================

-- =============================================================================
-- §15.1  food_catalog_sources
--
-- Registry of food data catalog origins.
-- source_code values: fdc, user_private, user_approved_global, manual,
--   future_mfp_official
-- Seeded here with the FoodData Central (fdc) row so food_items FK is
-- satisfiable in tests and future imports.
-- =============================================================================

create table if not exists food_catalog_sources (
  source_code       text          primary key,
  display_name      text          not null,
  license_name      text,
  attribution_text  text,
  source_version    text,
  source_url        text,
  imported_at       timestamptz,
  metadata          jsonb         not null default '{}'
);

-- Seed the FoodData Central source so food_items FK can be satisfied.
insert into food_catalog_sources (source_code, display_name, license_name, source_url)
values (
  'fdc',
  'USDA FoodData Central',
  'Public Domain (USDA)',
  'https://fdc.nal.usda.gov/'
)
on conflict (source_code) do nothing;


-- =============================================================================
-- §15.2  food_items
--
-- Global and user-created food records.
-- visibility: global, private, public_pending, public_approved, hidden
-- data_type: foundation, sr_legacy, survey, branded, user_created
-- verified_status: verified, imported, user_created, unverified, deprecated
-- search_vector: tsvector column for full-text search (GIN index deferred to Phase K)
-- unique(source_code, external_food_id)
-- =============================================================================

create table if not exists food_items (
  id                uuid          primary key default gen_random_uuid(),
  source_code       text          not null references food_catalog_sources(source_code),
  external_food_id  text,
  -- owner_user_id: null for global catalog items
  owner_user_id     uuid          references users(id) on delete set null,
  -- visibility: global, private, public_pending, public_approved, hidden
  visibility        text          not null default 'global',

  name              text          not null,
  brand_name        text,
  description       text,
  food_category     text,
  -- data_type: foundation, sr_legacy, survey, branded, user_created
  data_type         text,

  serving_size      numeric(10,3),
  serving_unit      text,
  household_serving text,

  -- Macro-level nutrient summary columns for fast lookups
  calories_kcal     numeric(10,3),
  protein_g         numeric(10,3),
  carbs_g           numeric(10,3),
  fat_g             numeric(10,3),
  fiber_g           numeric(10,3),
  sugar_g           numeric(10,3),
  sodium_mg         numeric(10,3),

  -- verified_status: verified, imported, user_created, unverified, deprecated
  verified_status   text          not null default 'unverified',
  -- search_vector: full-text search column; GIN index deferred until Phase K
  search_vector     tsvector,
  metadata          jsonb         not null default '{}',
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),

  unique (source_code, external_food_id)
);

create index if not exists idx_food_items_name
  on food_items (name);

create index if not exists idx_food_items_source
  on food_items (source_code, verified_status);

-- Full-text GIN index: deferred until Phase K (FoodData Central bulk import)
-- create index if not exists idx_food_items_search on food_items using gin (search_vector);


-- =============================================================================
-- §15.3  food_nutrient_values
--
-- Detailed micro/macro nutrient values per food item.
-- Cascade-deleted when the parent food_items row is deleted.
-- unique(food_item_id, nutrient_code)
-- =============================================================================

create table if not exists food_nutrient_values (
  id              uuid          primary key default gen_random_uuid(),
  food_item_id    uuid          not null references food_items(id) on delete cascade,
  nutrient_code   text          not null,
  nutrient_name   text          not null,
  amount          numeric(12,5),
  unit            text          not null,
  derivation_code text,
  metadata        jsonb         not null default '{}',

  unique (food_item_id, nutrient_code)
);

create index if not exists idx_food_nutrients_item
  on food_nutrient_values (food_item_id);


-- =============================================================================
-- §15.4  nutrition_entries
--
-- Meal / logging events.
-- meal_type: breakfast, lunch, dinner, snack, preworkout, postworkout, unknown
-- entry_method: manual_macros, food_search, ai_text_estimate, photo_estimate,
--   barcode, imported
-- data_quality: normal, estimated, low_confidence, incomplete
-- =============================================================================

create table if not exists nutrition_entries (
  id                    uuid          primary key default gen_random_uuid(),
  user_id               uuid          not null references users(id) on delete cascade,
  occurred_at_utc       timestamptz   not null,
  local_date            date          not null,
  timezone              text          not null,
  -- meal_type: breakfast, lunch, dinner, snack, preworkout, postworkout, unknown
  meal_type             text,
  -- entry_method: manual_macros, food_search, ai_text_estimate, photo_estimate,
  --   barcode, imported
  entry_method          text          not null,
  description           text,

  -- Macro totals rolled up from items; may be null for photo/ai estimates
  total_calories_kcal   numeric(10,3),
  total_protein_g       numeric(10,3),
  total_carbs_g         numeric(10,3),
  total_fat_g           numeric(10,3),
  total_fiber_g         numeric(10,3),
  total_sugar_g         numeric(10,3),
  total_sodium_mg       numeric(10,3),

  confidence_score      numeric(5,4),
  -- data_quality: normal, estimated, low_confidence, incomplete
  data_quality          text          not null default 'normal',
  ai_estimated          boolean       not null default false,
  notes                 text,
  metadata              jsonb         not null default '{}',
  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now()
);

create index if not exists idx_nutrition_entries_user_date
  on nutrition_entries (user_id, local_date desc);

create index if not exists idx_nutrition_entries_user_time
  on nutrition_entries (user_id, occurred_at_utc desc);


-- =============================================================================
-- §15.5  nutrition_entry_items
--
-- Individual food items within a nutrition entry.
-- Cascade-deleted when the parent nutrition_entries row is deleted.
-- =============================================================================

create table if not exists nutrition_entry_items (
  id                    uuid          primary key default gen_random_uuid(),
  nutrition_entry_id    uuid          not null references nutrition_entries(id) on delete cascade,
  user_id               uuid          not null references users(id) on delete cascade,
  -- food_item_id: null for free-form entries without a catalog lookup
  food_item_id          uuid          references food_items(id) on delete set null,
  name_snapshot         text          not null,
  brand_snapshot        text,
  quantity              numeric(10,3),
  unit                  text,
  serving_multiplier    numeric(10,4),

  calories_kcal         numeric(10,3),
  protein_g             numeric(10,3),
  carbs_g               numeric(10,3),
  fat_g                 numeric(10,3),
  fiber_g               numeric(10,3),
  sugar_g               numeric(10,3),
  sodium_mg             numeric(10,3),

  confidence_score      numeric(5,4),
  metadata              jsonb         not null default '{}'
);

create index if not exists idx_nutrition_items_entry
  on nutrition_entry_items (nutrition_entry_id);

create index if not exists idx_nutrition_items_user
  on nutrition_entry_items (user_id);


-- =============================================================================
-- §15.6  daily_nutrition_summaries
--
-- Precomputed daily nutrition totals. Populated by Phase F+.
-- All computed columns are nullable until Phase F populates them.
-- unique(user_id, local_date)
-- =============================================================================

create table if not exists daily_nutrition_summaries (
  id                          uuid          primary key default gen_random_uuid(),
  user_id                     uuid          not null references users(id) on delete cascade,
  local_date                  date          not null,
  timezone                    text          not null,

  -- Nullable: aggregated from nutrition_entries by Phase F
  calories_in_kcal            numeric(10,3),
  calories_out_kcal           numeric(10,3),
  calorie_balance_kcal        numeric(10,3),
  protein_g                   numeric(10,3),
  carbs_g                     numeric(10,3),
  fat_g                       numeric(10,3),
  fiber_g                     numeric(10,3),
  hydration_ml                numeric(10,3),
  caffeine_mg                 numeric(10,3),
  latest_caffeine_time_utc    timestamptz,
  alcohol_standard_drinks     numeric(5,2),

  -- Targets: sourced from user goals / preferences
  protein_target_g            numeric(10,3),
  calorie_target_kcal         numeric(10,3),
  hydration_target_ml         numeric(10,3),
  nutrition_score             numeric(5,2),

  generated_at                timestamptz   not null default now(),
  data_quality                text          not null default 'normal',
  metadata                    jsonb         not null default '{}',

  unique (user_id, local_date)
);

create index if not exists idx_daily_nutrition_user_date
  on daily_nutrition_summaries (user_id, local_date desc);

-- =============================================================================
-- Migration 000002_identity_preferences
-- Identity, auth, user preferences, and consent tables per Data Model §7.
--
-- Tables created:
--   users                            (§7.1) — core application identity
--   auth_identities                  (§7.2) — sign-in method links (app auth only)
--   user_goals                       (§7.3) — ranked onboarding goals
--   coach_preferences                (§7.4) — coach tone and style preferences
--   nutrition_philosophy_preferences (§7.5) — nutrition leanings
--   consent_records                  (§7.6) — meaningful consent events
--   data_retention_preferences       (§7.7) — per-user retention settings
--
-- Design notes:
--   * users.id is an internal UUID (gen_random_uuid()); cognito_sub is a
--     separate unique text column per ARCH-AUTH-001 and ARCH-AUTH-002.
--   * auth_identities.provider covers app-level sign-in methods only
--     (email_password, google, apple, facebook). Google Health API authorization
--     is tracked in provider_connections (CU-028) — a completely separate concept.
--     See TAD §9.2 for the app-auth vs health-provider separation.
--   * updated_at is managed explicitly by repository write operations (D-A-008),
--     not by Postgres triggers. This keeps migration SQL simple and puts the
--     update responsibility in the repository layer.
--   * goal_code values are application-level enums validated by Zod (D-A-009);
--     no CHECK constraint is added so the list can extend without migrations.
-- =============================================================================

-- == USERS ==

create table if not exists users (
  id                uuid         primary key default gen_random_uuid(),
  cognito_sub       text         not null,
  email             text,
  email_verified    boolean      not null default false,
  display_name      text,
  status            text         not null default 'active',
  primary_timezone  text         not null default 'America/New_York',
  date_of_birth     date,
  -- Optional user-controlled biometrics; do not require or infer
  sex_at_birth      text,
  height_cm         numeric(6,2),
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now(),
  deleted_at        timestamptz,

  constraint users_status_check
    check (status in ('active', 'suspended', 'deletion_requested', 'deleted')),
  constraint users_cognito_sub_unique
    unique (cognito_sub),
  constraint users_email_unique
    unique (email)
);

-- Index for auth middleware user lookup by cognito_sub.
-- The unique constraint already creates an index; adding a named one for clarity.
create index if not exists idx_users_cognito_sub on users (cognito_sub);

-- Index for filtering active users and soft-delete queries.
create index if not exists idx_users_status on users (status);
create index if not exists idx_users_deleted_at on users (deleted_at) where deleted_at is not null;

-- == AUTH IDENTITIES ==

-- Tracks sign-in methods linked to a Primis account (app authentication only).
-- IMPORTANT: 'google' here means signing into Primis with a Google account.
--            It is NOT the same as authorizing Google Health API access.
--            Google Health authorization lives in provider_connections (CU-028).
create table if not exists auth_identities (
  id               uuid         primary key default gen_random_uuid(),
  user_id          uuid         not null references users (id),
  provider         text         not null,
  provider_subject text         not null,
  email            text,
  linked_at        timestamptz  not null default now(),
  last_used_at     timestamptz,

  constraint auth_identities_provider_check
    check (provider in ('email_password', 'google', 'apple', 'facebook')),
  constraint auth_identities_provider_subject_unique
    unique (provider, provider_subject)
);

-- Index for FK lookups when finding all identities for a user.
create index if not exists idx_auth_identities_user_id on auth_identities (user_id);

-- == USER GOALS ==

-- Stores ranked product goals selected during onboarding.
-- goal_code values (validated at application layer, D-A-009):
--   athletic_performance, sleep, body_composition, fat_loss, muscle_gain,
--   longevity, general_health
create table if not exists user_goals (
  id            uuid    primary key default gen_random_uuid(),
  user_id       uuid    not null references users (id),
  goal_code     text    not null,
  priority_rank int     not null,
  is_active     boolean not null default true,
  metadata      jsonb   not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint user_goals_user_id_goal_code_unique
    unique (user_id, goal_code)
);

-- Index for retrieving all goals for a user (ordered by priority_rank).
create index if not exists idx_user_goals_user_id on user_goals (user_id);

-- == COACH PREFERENCES ==

-- One row per user; user_id is the primary key (1-to-1 relationship).
-- Allowed coach_style values per Data Model §7.4.
create table if not exists coach_preferences (
  user_id              uuid    primary key references users (id),
  coach_style          text    not null default 'analyst_coach',
  summary_style        text    not null default 'concise_analyst',
  explanation_depth    text    not null default 'balanced',
  coaching_intensity   text    not null default 'moderate',
  humor_level          text    not null default 'low',
  allow_unhinged_lite  boolean not null default false,
  updated_at           timestamptz not null default now(),

  constraint coach_preferences_coach_style_check
    check (coach_style in (
      'analyst_coach', 'strict', 'encouraging', 'performance_coach',
      'calm', 'concise', 'explanatory', 'unhinged_lite'
    )),
  constraint coach_preferences_explanation_depth_check
    check (explanation_depth in ('concise', 'balanced', 'detailed', 'data_heavy')),
  constraint coach_preferences_coaching_intensity_check
    check (coaching_intensity in ('gentle', 'moderate', 'strict')),
  constraint coach_preferences_humor_level_check
    check (humor_level in ('none', 'low', 'medium'))
);

-- == NUTRITION PHILOSOPHY PREFERENCES ==

-- One row per user; user_id is the primary key (1-to-1 relationship).
-- Stores user-selectable nutrition leanings. All flags are optional.
-- Defaults reflect the founder's whole-foods, high-protein, anti-inflammatory baseline;
-- public users may override freely.
create table if not exists nutrition_philosophy_preferences (
  user_id                    uuid    primary key references users (id),
  whole_foods_emphasis       boolean not null default true,
  high_protein_emphasis      boolean not null default true,
  animal_product_positive    boolean not null default false,
  avoid_seed_oils            boolean not null default false,
  avoid_artificial_dyes      boolean not null default false,
  avoid_ultra_processed_foods boolean not null default true,
  anti_inflammatory_emphasis boolean not null default true,
  custom_notes               text,
  updated_at                 timestamptz not null default now()
);

-- == CONSENT RECORDS ==

-- Records meaningful user consent events. Append-only; revocation adds a new row
-- (or updates revoked_at on the existing granted row).
-- consent_type values per Data Model §7.6.
create table if not exists consent_records (
  id              uuid    primary key default gen_random_uuid(),
  user_id         uuid    not null references users (id),
  consent_type    text    not null,
  version         text    not null,
  granted         boolean not null,
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  -- Hashed client metadata for audit; raw values never stored.
  ip_hash         text,
  user_agent_hash text,
  metadata        jsonb   not null default '{}',

  constraint consent_records_consent_type_check
    check (consent_type in (
      'terms', 'privacy_policy', 'ai_processing', 'google_health',
      'healthkit', 'health_connect', 'data_retention', 'marketing'
    ))
);

-- Index for retrieving consent history for a user.
create index if not exists idx_consent_records_user_id on consent_records (user_id);

-- Index for type-specific consent lookups (e.g. latest terms consent).
create index if not exists idx_consent_records_user_id_type
  on consent_records (user_id, consent_type);

-- == DATA RETENTION PREFERENCES ==

-- One row per user; user_id is the primary key (1-to-1 relationship).
create table if not exists data_retention_preferences (
  user_id                       uuid  primary key references users (id),
  raw_payload_retention_mode    text  not null default 'standard',
  raw_payload_retention_days    int,
  normalized_data_retention_mode text not null default 'keep_until_deleted',
  ai_context_retention_mode     text  not null default 'standard',
  allow_algorithm_reprocessing  boolean not null default true,
  updated_at                    timestamptz not null default now(),

  constraint data_retention_raw_mode_check
    check (raw_payload_retention_mode in ('extended', 'standard', 'minimal')),
  constraint data_retention_ai_mode_check
    check (ai_context_retention_mode in ('extended', 'standard', 'minimal'))
);

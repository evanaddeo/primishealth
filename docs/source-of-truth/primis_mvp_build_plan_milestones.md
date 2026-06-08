# Primis MVP Build Plan / Milestones

**Document status:** Source of truth  
**Product:** Primis  
**Document type:** MVP build plan, milestone plan, implementation sequencing, AI-agent execution guide  
**Version:** 1.1  
**Date:** 2026-06-07  
**Primary audience:** founder/developer, AI coding agents, future engineering contributors, future product reviewers  
**Related source-of-truth documents:**

1. `primis_product_requirements_document.md`
2. `primis_technical_architecture_document.md`
3. `primis_data_model_health_metric_schema.md`
4. `primis_scoring_algorithms_spec.md`
5. `primis_ai_context_engine_spec.md`
6. `primis_ui_ux_design_system_spec.md`
7. `primis_mvp_build_plan_milestones.md` — this document

---

## 0. AI Coding Agent Instructions

### 0.1 How to use this document

This document is the execution plan for building Primis. AI coding agents MUST use it as the milestone and sequencing authority.

Coding agents MUST NOT start by randomly scaffolding screens, models, or endpoints. The correct order is:

1. Read this MVP Build Plan.
2. Read the Product Requirements Document for product intent.
3. Read the Technical Architecture Document for stack and system boundaries.
4. Read the Data Model / Health Metric Schema before creating database tables or DTOs.
5. Read the Scoring & Algorithms Spec before implementing scores, trends, baselines, or recommendations.
6. Read the AI Context Engine Spec before writing AI prompts, model calls, or chat logic.
7. Read the UI/UX Design System Spec before building user-facing screens.
8. Implement only the milestone/ticket currently assigned.
9. Add tests and fixtures for every non-trivial data, scoring, sync, or AI-context change.
10. Update the relevant source-of-truth doc if the implementation discovers a real constraint that changes the plan.

### 0.2 Requirement language

- **MUST** means required for the relevant milestone.
- **SHOULD** means expected unless there is a documented reason not to do it.
- **MAY** means optional.
- **MUST NOT** means explicitly forbidden.
- **Deferred** means intentionally excluded from the current milestone.

### 0.3 Phase definitions

This document uses the following phase names:

| Phase | Name | Meaning |
|---|---|---|
| P0 | Foundation + Validation | Repo, tooling, AWS foundation, provider/API feasibility spikes, design system foundation. |
| P1 | Private Daily-Use MVP | Usable by founder daily with Google/Fitbit data, core dashboards, core scores, basic AI, and manual inputs. |
| P2 | Intelligence Expansion | Better algorithms, correlations, nutrition v1.5, richer summaries, more robust AI context. |
| P3 | iOS Health Enrichment | HealthKit integration, Apple Health enrichment, likely Hume scale data through Apple Health. |
| P4 | Public-Beta Hardening | Compliance, security, privacy, OAuth verification prep, app store production hardening, subscriptions. |
| P5 | Multi-Provider / Universal Health OS | Android Health Connect, additional direct providers, broader public product. |

### 0.4 MVP definition

The MVP is not a throwaway prototype. For Primis, MVP means:

> The smallest serious version of the product that proves the core loop: connect health data, normalize it, calculate useful scores, show a premium customizable dashboard, and provide grounded AI analysis that makes the user want to open the app daily.

The MVP MUST be architected as if Primis could become a real B2C company, even though the initial users are the founder and a friend.

### 0.5 The most important build constraint

Primis MUST be built health-data-model-first.

The UI, scores, insights, AI chat, summaries, nutrition coaching, and bedtime planner all depend on one core asset:

> A clean, normalized, queryable, explainable, and provider-independent health-data model.

Do not build a beautiful UI on top of fake data models. Do not build AI chat before the context engine has structured evidence. Do not build scoring before baselines and metric availability are validated.

---

## 1. Executive Summary

Primis is an AI-native performance health OS. It starts with Google/Fitbit data and expands toward Apple Health, Health Connect, smart scales, nutrition, manual lifestyle inputs, and broader provider integration.

The first build must prove four things:

1. **Data viability:** Google Health API can provide enough useful data for Fitbit Air / Google Health users.
2. **Data-model quality:** Primis can ingest, normalize, store, summarize, and reprocess health data cleanly.
3. **User value:** The app can calculate useful sleep, recovery, readiness, activity, nutrition, and bedtime-planning outputs.
4. **Product feel:** The mobile app can feel fast, premium, modern, athletic, customizable, and not like generic AI-generated UI.

The MVP build plan intentionally sequences backend/data validation before UI expansion and AI expansion.

Correct build order:

```text
Foundation
→ Google Health API validation
→ AWS backend foundation
→ normalized health-data model
→ ingestion/sync pipeline
→ scoring/baseline engine
→ mobile shell/design system
→ home/sleep/recovery/activity UI
→ AI context engine
→ manual inputs/nutrition basics
→ private beta hardening
```

Incorrect build order:

```text
Pretty mockups
→ AI chat
→ random dashboards
→ late data validation
→ broken metrics
→ fragile product
```

This plan is optimized for AI coding agents by defining milestones, gates, tickets, acceptance criteria, test strategy, data fixtures, performance budgets, and implementation sequencing.

---

## 2. Product Build Thesis

### 2.1 The core product loop

Primis should create the following daily loop:

```text
User opens Primis
→ sees today's recovery/sleep/readiness/activity state instantly
→ understands why scores changed
→ gets a useful recommendation
→ optionally logs context: water, caffeine, alcohol, soreness, mood, digestion, food/macros
→ Primis uses objective data + manual context to improve future insights
```

### 2.2 What must be excellent first

The early product MUST overperform in these areas:

1. **Fast home dashboard**
2. **Sleep analysis**
3. **Recovery/readiness explanation**
4. **Google/Fitbit health-data ingestion**
5. **Scoring transparency**
6. **Premium mobile UI/UX**
7. **AI answers grounded in structured user context**

### 2.3 What can be basic early

The following can be simpler in P1:

1. Nutrition food database
2. Barcode scanning
3. Photo-based food logging
4. Android support
5. HealthKit enrichment
6. Direct Hume integration
7. Public billing/subscriptions
8. Full provider marketplace
9. Population-level ML models
10. Sophisticated onboarding personalization

### 2.4 What must not be faked

Primis MUST NOT fake the following:

- Google/Fitbit data availability
- provider scores that are not actually exposed
- recovery/readiness accuracy
- AI certainty
- medical diagnosis
- nutrition precision from rough estimates
- real-time data if provider sync is delayed
- scientific certainty from small personal correlations

---

## 3. External Constraints That Drive the Build Plan

### 3.1 Google Health API constraints

Primis begins with Google Health API as the primary cloud-based source for Google/Fitbit data.

Implementation implications:

- A Google/Fitbit data availability spike is mandatory before core score assumptions become final.
- Google OAuth health authorization is separate from app authentication.
- Google Health API scopes are mostly restricted.
- Public use beyond the unverified-user threshold requires verification/security review.
- The app MUST include in-app health-data disclosure before public launch.
- Provider sync is not truly real time; Fitbit data must sync to Google/Fitbit systems before Primis can ingest it.
- Primis MUST track `last_provider_sync_at`, `latest_data_end_at`, and data freshness states.

Relevant external references:

- Google Health API app verification: `https://developers.google.com/health/app-verification`
- Google Health API data types: `https://developers.google.com/health/data-types`
- Google Health API rate limits: `https://developers.google.com/health/rate-limits`

### 3.2 Apple HealthKit constraints

Primis is iOS-first. HealthKit is strategically important because the founder uses iOS and smart-scale data may flow into Apple Health.

Implementation implications:

- HealthKit is on-device, not a normal server-side cloud API.
- The iOS app must request fine-grained permission per data type.
- HealthKit data should be synced to the Primis backend only after explicit user consent.
- HealthKit is P3 unless a P0/P1 spike proves it is needed earlier.

Relevant external reference:

- Apple HealthKit authorization: `https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data`

### 3.3 Health Connect constraints

Android is not the first priority, but the architecture must not block it.

Implementation implications:

- Health Connect should be treated as a future local Android health-data source.
- Google recommends Google Health API for cloud/server integrations and Health Connect for mobile-first Android aggregation.
- Android support should not be hacked into iOS-first structures later; provider abstraction must support it from day one.

Relevant external reference:

- Google Fit migration / Google Health API vs Health Connect: `https://developer.android.com/health-and-fitness/health-connect/migration/fit`

### 3.4 Nutrition constraints

Primis wants eventual MyFitnessPal-style tracking, but P1 must not depend on MyFitnessPal.

Implementation implications:

- MyFitnessPal direct integration is deferred unless official access is approved.
- FoodData Central downloadable data is viable for a local/global food catalog in P2.
- P1 nutrition should focus on manual macros, hydration, caffeine, alcohol, meal timing, and custom tags.

Relevant external references:

- USDA FoodData Central download data: `https://fdc.nal.usda.gov/download-datasets`
- USDA FoodData Central API guide: `https://fdc.nal.usda.gov/api-guide`
- MyFitnessPal API status: `https://www.myfitnesspal.com/apps/api/version`

### 3.5 React Native / Expo constraints

Primis will use React Native with Expo Dev Client.

Implementation implications:

- Do not use Expo Go as the real runtime.
- Use development builds because native modules are expected.
- UI performance must be engineered intentionally.
- Heavy computation belongs in backend jobs or precomputed local caches, not render paths.

Relevant external reference:

- Expo development builds: `https://docs.expo.dev/develop/development-builds/introduction/`

### 3.6 AWS-native stack constraint

Primis will use a mature AWS-native backend.

Implementation implications:

- AWS quality and security are prioritized over the fastest indie stack.
- Costs should be controlled through right-sizing, lifecycle policies, and background job design.
- Core stack: Cognito, API Gateway, Lambda/ECS as needed, RDS Postgres, S3, SQS, EventBridge, KMS, Secrets Manager, CloudWatch/X-Ray.
- Cognito should support email/password, Google, Apple, and Facebook app authentication.

Relevant external reference:

- Cognito social identity providers: `https://docs.aws.amazon.com/cognito/latest/developerguide/tutorial-create-user-pool-social-idp.html`

---

## 4. Build Strategy

### 4.1 Recommended execution approach

Use a milestone-gated approach instead of feature chaos.

Each milestone has:

- goal
- scope
- dependencies
- deliverables
- implementation tickets
- acceptance criteria
- test requirements
- risk gates
- definition of done

A milestone is not complete until its acceptance criteria and tests are satisfied.

### 4.2 Suggested implementation style

Primis should be built with a small number of focused workstreams:

| Workstream | Purpose |
|---|---|
| Product + Planning | Keep requirements, docs, acceptance criteria, and tradeoffs aligned. |
| Mobile App | React Native UI, navigation, local cache, native integrations. |
| Backend API | Auth integration, API Gateway/Lambda/ECS endpoints, DTOs. |
| Data Platform | Postgres schema, migrations, raw payload storage, provider sync, summaries. |
| Scoring Engine | Baselines, sleep/recovery/readiness/activity/nutrition/bedtime algorithms. |
| AI Engine | Context packets, retrieval, model abstraction, structured outputs. |
| Design System | Tokens, components, motion, charts, accessibility. |
| Security/Compliance | OAuth, encryption, deletion, disclosures, audit logs. |
| QA/Observability | Tests, fixtures, Sentry/CloudWatch, performance checks. |

### 4.3 Avoid parallelizing too early

AI coding agents can work quickly, but Primis has a high risk of architectural drift. In early milestones, do not have multiple agents independently create competing versions of:

- data models
- API contracts
- score formulas
- design components
- provider connectors
- AI prompts

First create shared contracts, then parallelize implementation.

### 4.4 Core build gates

The MVP has five non-negotiable gates:

| Gate | Meaning |
|---|---|
| G1: Provider Data Gate | Google Health API data availability is validated against a real account/device path. |
| G2: Data Model Gate | Core normalized schema, metric registry, raw payload archival, and summary generation work. |
| G3: Scoring Gate | Sleep/recovery/readiness/activity/bedtime scores generate from real or fixture data with explainable components. |
| G4: UX Gate | Home, Sleep, Recovery, Activity, AI Coach, and Inputs feel fast and premium on iOS. |
| G5: Private Beta Gate | Auth, sync, deletion, logs, crash reporting, privacy disclosure, and TestFlight build are ready for limited users. |

No public-facing work should begin until G1-G4 are passed.

---

## 5. Milestone Overview

### 5.1 Milestone table

| Milestone | Phase | Name | Main Output | Hard Gate? |
|---|---|---|---|---|
| M0 | P0 | Project Setup + Repo Foundation | Monorepo, tooling, environments, CI baseline | Yes |
| M1 | P0 | External API/Data Validation | Google Health API validation plan and metric availability matrix | Yes |
| M2 | P0 | AWS Foundation + Auth | Cognito, base API, env separation, secret management | Yes |
| M3 | P0/P1 | Data Model + Migration Foundation | Postgres schema, metric registry, seed fixtures | Yes |
| M4 | P1 | Provider Sync Pipeline | Google connector, raw ingestion, normalization, sync jobs | Yes |
| M5 | P1 | Scoring + Summary Engine | baselines, daily summaries, core scores, bedtime planner engine | Yes |
| M6 | P1 | Mobile App Shell + Design System | React Native app, navigation, theme, core components | Yes |
| M7 | P1 | Premium Home Dashboard | local-first home, widgets, goal progress, score cards | Yes |
| M8 | P1 | Sleep + Bedtime Planner UX | sleep page, sleep details, suggested bedtimes | Yes |
| M9 | P1 | Recovery + Activity + Vitals UX | recovery, readiness, training load, vitals pages | Yes |
| M10 | P1 | Manual Inputs + Nutrition v1 | check-ins, water, caffeine, alcohol, macros, tags, bowel entries | No |
| M11 | P1 | AI Context Engine + Chat | model abstraction, context builder, AI chat, summaries | Yes |
| M12 | P1 | Private Beta Hardening | observability, deletion, security checks, TestFlight | Yes |
| M13 | P2 | Correlation Engine + Insight Expansion | behavior correlations, weekly report, better coaching | No |
| M14 | P2 | Nutrition v1.5 | FoodData Central import/search, user foods | No |
| M15 | P3 | HealthKit + Hume Path | Apple Health read/sync, smart-scale body comp enrichment | No |
| M16 | P4 | Public-Beta Readiness | app review prep, Google verification prep, subscriptions | Yes for public |

### 5.2 MVP release target

The **Private Daily-Use MVP** consists of M0 through M12.

M13+ are post-MVP expansion unless earlier work reveals they are critical for daily use.

---

## 6. M0 — Project Setup + Repo Foundation

### 6.1 Goal

Create a clean, maintainable, AI-agent-friendly codebase foundation before feature work begins.

### 6.2 Scope

M0 includes:

- monorepo setup
- package manager setup
- linting/formatting/type checking
- environment strategy
- CI baseline
- local development scripts
- commit conventions
- documentation directory
- shared type package
- placeholder infrastructure directory

### 6.3 Recommended repo structure

```text
primis/
  apps/
    mobile/                  # React Native + Expo Dev Client app
    admin/                   # Optional future admin/internal console
  services/
    api/                     # Backend API handlers/controllers
    workers/                 # Async jobs, sync workers, scoring workers
    ai/                      # AI provider abstraction, context engine
  packages/
    core-types/              # Shared TypeScript types/enums/contracts
    health-metrics/          # Metric registry, unit definitions, DTOs
    scoring/                 # Pure scoring algorithms, testable without AWS
    design-system/           # Tokens/components if extracted from mobile
    config/                  # Shared config utilities
  infrastructure/
    cdk/                     # AWS CDK or IaC
  database/
    migrations/
    seeds/
    fixtures/
  docs/
    source-of-truth/
    decisions/
    runbooks/
  scripts/
  .github/
```

### 6.4 Technical decisions

| Decision | Requirement |
|---|---|
| Language | TypeScript-first for mobile/backend/shared contracts. |
| Mobile | React Native + Expo Dev Client. |
| Backend | AWS-native. Lambda first; ECS/Fargate only when needed. |
| Infra | Prefer AWS CDK in TypeScript unless there is a clear reason to use Terraform. |
| Database | RDS Postgres. |
| Tests | Vitest/Jest for TypeScript packages; integration tests for API/data jobs. |
| CI | GitHub Actions. |
| Formatting | Prettier. |
| Linting | ESLint. |

### 6.5 Work items

#### M0-T001 — Initialize monorepo

**Acceptance criteria:**

- repo has `apps`, `services`, `packages`, `database`, `infrastructure`, `docs`, and `scripts`
- root package manager is configured
- workspace scripts work from repo root
- README explains local setup

#### M0-T002 — Add quality tooling

**Acceptance criteria:**

- `lint`, `typecheck`, `test`, and `format` scripts exist
- CI runs lint/typecheck/test on pull requests
- TypeScript strict mode is enabled unless a package explicitly documents otherwise

#### M0-T003 — Create source-of-truth docs folder

**Acceptance criteria:**

- all seven documents are stored under `docs/source-of-truth/`
- README links to each doc in correct reading order
- docs are treated as authoritative in contribution guidelines

#### M0-T004 — Add shared enums/contracts shell

**Acceptance criteria:**

- `packages/core-types` exports placeholder enums for providers, metric codes, score types, sync job statuses, AI intents
- package imports work in mobile/backend packages
- no circular dependencies

### 6.6 Definition of done

M0 is complete when a new contributor or AI coding agent can clone the repo, install dependencies, run checks, and understand where product/architecture docs live.

---

## 7. M1 — External API/Data Validation

### 7.1 Goal

Prove the exact Google Health API/Fitbit data path before Primis depends on any metric, score, or dashboard assumption.

This is the most important early milestone.

### 7.2 Scope

M1 includes:

- Google Cloud project setup for development
- OAuth client setup
- restricted-scope access workflow
- test-user setup
- first API calls
- real data availability matrix
- sync freshness testing
- provider-score availability check
- data-shape sample archival

### 7.3 Non-goals

M1 does not include:

- production OAuth verification
- public launch
- polished UI
- final scoring formulas
- all provider integrations

### 7.4 Critical questions M1 must answer

| Question | Required answer |
|---|---|
| Can a test user connect Google Health API with needed scopes? | Yes/no + setup notes. |
| Which Fitbit Air metrics are available through Google Health API? | Availability matrix. |
| Are Google app scores exposed? | Confirm whether sleep score/readiness/cardio load are exposed or must be derived. |
| How fresh is the data after device sync? | Observed freshness notes. |
| Are webhooks available and useful for target data types? | Yes/no per data type. |
| What historical range is practically retrievable? | Observed backfill behavior. |
| What data types have dailyRollup vs list/reconcile only? | Matrix. |

### 7.5 Metric availability matrix

Create a file:

```text
docs/decisions/google-health-api-metric-availability.md
```

Required columns:

| Canonical metric | Google data type | Scope | Operation | Available? | Sample payload saved? | Notes |
|---|---|---|---|---|---|---|
| steps | `steps` | activity_and_fitness | dailyRollup/list/reconcile | TBD | TBD | TBD |
| active_energy_burned | `active-energy-burned` | activity_and_fitness | dailyRollup | TBD | TBD | TBD |
| total_calories | `total-calories` | activity_and_fitness | dailyRollup | TBD | TBD | TBD |
| active_zone_minutes | `active-zone-minutes` | activity_and_fitness | dailyRollup | TBD | TBD | TBD |
| floors | `floors` | activity_and_fitness | dailyRollup | TBD | TBD | TBD |
| heart_rate | `heart-rate` | health_metrics_and_measurements | list/reconcile | TBD | TBD | TBD |
| daily_hrv | `daily-heart-rate-variability` | health_metrics_and_measurements | list/reconcile | TBD | TBD | TBD |
| daily_resting_hr | `daily-resting-heart-rate` | health_metrics_and_measurements | list/reconcile | TBD | TBD | TBD |
| daily_spo2 | `daily-oxygen-saturation` | health_metrics_and_measurements | list/reconcile | TBD | TBD | TBD |
| daily_respiratory_rate | `daily-respiratory-rate` | health_metrics_and_measurements | list/reconcile | TBD | TBD | TBD |
| sleep_sessions | `sleep` | sleep | list/reconcile | TBD | TBD | TBD |
| exercise | `exercise` | activity_and_fitness | list/reconcile | TBD | TBD | TBD |
| vo2_max | `vo2-max` or equivalent | activity/health scope | TBD | TBD | TBD | TBD |
| weight | `weight` | health_metrics_and_measurements | list/reconcile | TBD | TBD | TBD |
| body_fat | `body-fat` | health_metrics_and_measurements | list/reconcile/create/update | TBD | TBD | TBD |
| food | `food` | nutrition | list/reconcile | TBD | TBD | TBD |
| hydration | `hydration-log` or equivalent | nutrition | TBD | TBD | TBD | TBD |
| provider_sleep_score | TBD | TBD | TBD | TBD | TBD | likely not guaranteed |
| provider_readiness_score | TBD | TBD | TBD | TBD | TBD | likely not guaranteed |
| provider_cardio_load | TBD | TBD | TBD | TBD | TBD | validate |

### 7.6 Sample payload policy

M1 MUST save redacted sample payloads for every available data type.

Location:

```text
database/fixtures/provider/google_health/redacted/
```

Rules:

- remove real user IDs
- remove tokens
- normalize timestamps if needed
- preserve realistic value structure
- include payload metadata file

### 7.7 Work items

#### M1-T001 — Set up Google Cloud dev project

**Acceptance criteria:**

- Google Health API is enabled
- OAuth consent screen is configured for dev/test mode
- test users can be added
- dev OAuth client exists
- secrets are not committed

#### M1-T002 — Implement API-call spike script

Create a script:

```text
scripts/google-health-spike/
```

**Acceptance criteria:**

- script obtains/uses OAuth tokens securely for a test user
- script can call at least 5 target data types
- script saves redacted JSON fixtures
- script outputs metric availability summary

#### M1-T003 — Validate historical backfill

**Acceptance criteria:**

- script tests at least 7-day, 30-day, 90-day, and max feasible historical range
- results documented
- failures documented with exact API error/behavior

#### M1-T004 — Validate provider scores

**Acceptance criteria:**

- explicitly tests whether Google exposes official sleep score, readiness score, cardio load, or equivalent
- if unavailable, marks score as `DERIVED_BY_PRIMIS_REQUIRED`
- if available, documents exact data type/source and payload

#### M1-T005 — Create metric availability decision record

**Acceptance criteria:**

- availability matrix is filled
- unknowns are explicitly listed
- follow-up actions are created

### 7.8 Definition of done

M1 is complete when Primis knows which metrics are actually available from Google Health API and has sample payload fixtures for development/testing.

---

## 8. M2 — AWS Foundation + Auth

### 8.1 Goal

Create a secure AWS foundation and authentication layer that can support private beta and later public readiness.

### 8.2 Scope

M2 includes:

- AWS account/project structure
- environment separation
- Cognito user pool
- social auth configuration plan
- API Gateway base
- Lambda base
- Secrets Manager
- KMS keys
- RDS Postgres dev instance
- S3 buckets
- CloudWatch logs
- basic CDK/IaC

### 8.3 Environments

Minimum environments:

```text
local
sandbox
dev
prod
```

`prod` can exist later, but IaC should be structured from the start to support it.

### 8.4 Auth requirements

App authentication MUST support:

- email/password
- Google sign-in
- Apple sign-in
- Facebook sign-in

Important:

```text
App auth != Google Health authorization
```

A user may sign into Primis with Google but still needs to separately grant Google Health API scopes.

### 8.5 Work items

#### M2-T001 — Create AWS CDK app

**Acceptance criteria:**

- CDK app deploys a minimal stack to dev
- stack names include environment suffix
- removal policies are safe for dev and conservative for prod
- no secrets are hardcoded

#### M2-T002 — Provision Cognito

**Acceptance criteria:**

- Cognito user pool exists
- app client exists
- password policy configured
- hosted UI/social providers planned/configurable
- user ID maps cleanly into Primis `users` table

#### M2-T003 — Provision base API

**Acceptance criteria:**

- API Gateway route `/health` returns version/environment
- Lambda logs to CloudWatch
- API has structured error format
- CORS configured for mobile/dev needs only

#### M2-T004 — Provision database foundation

**Acceptance criteria:**

- RDS Postgres exists in dev
- database credentials stored in Secrets Manager
- migration tool configured
- connection from API works

#### M2-T005 — Provision S3/KMS/Secrets foundation

**Acceptance criteria:**

- raw payload bucket exists
- KMS key exists for sensitive encryption
- bucket blocks public access
- lifecycle policy placeholder exists
- token-secret path conventions documented

### 8.6 Definition of done

M2 is complete when authenticated API requests can reach a dev backend and store/read basic user records securely.

---

## 9. M3 — Data Model + Migration Foundation

### 9.1 Goal

Implement the core database structure required for identity, provider connections, raw payloads, normalized metrics, summaries, scores, insights, AI context, manual inputs, and dashboard customization.

### 9.2 Scope

M3 implements the schema defined in `primis_data_model_health_metric_schema.md`.

Initial M3 tables MUST include:

```text
users
auth_identities
user_goals
coach_preferences
nutrition_philosophy_preferences
consent_records
data_retention_preferences
provider_connections
provider_data_availability
provider_metric_mappings
provider_sync_jobs
provider_sync_cursors
raw_provider_payloads
metric_definitions
metric_observations
metric_timeseries_samples
daily_metric_summaries
rolling_metric_baselines
sleep_sessions
sleep_stage_intervals
sleep_daily_features
workout_sessions
training_load_daily
body_composition_measurements
vital_daily_features
manual_checkins
custom_tags
tag_events
hydration_entries
caffeine_entries
alcohol_entries
bowel_entries
nutrition_entries
nutrition_entry_items
daily_nutrition_summaries
score_snapshots
score_component_values
insight_candidates
ai_summaries
ai_conversations
dashboard_widgets
theme_settings
```

If implementation needs to stage this schema, that is acceptable, but the schema naming and relationships MUST match the data-model document unless a decision record changes it.

### 9.3 Migration principles

- migrations must be forward-only in normal use
- dev reset script may exist
- seed data must be deterministic
- metric definitions must be seeded from source-controlled files
- migrations must be tested in CI against a disposable database

### 9.4 Work items

#### M3-T001 — Create migration framework

**Acceptance criteria:**

- migrations run locally and in CI
- migration status command exists
- rollback/reset for local dev is documented

#### M3-T002 — Implement identity/preferences tables

**Acceptance criteria:**

- user record can be created after Cognito auth
- user goals support ranked multiple goals
- coach and summary style preferences are stored
- nutrition philosophy preferences are stored but not hardcoded into global logic

#### M3-T003 — Implement provider/raw/metric tables

**Acceptance criteria:**

- provider connection record stores encrypted token reference, not plaintext token
- raw payload metadata can reference S3 object
- metric observations support provider source, canonical metric code, timestamp range, unit, value, and quality metadata

#### M3-T004 — Implement domain tables

**Acceptance criteria:**

- sleep sessions/stages can be stored
- workout sessions/training load can be stored
- body composition/vitals can be stored
- manual inputs/nutrition entries can be stored

#### M3-T005 — Implement score/insight/AI/dashboard tables

**Acceptance criteria:**

- score snapshots and component values can be stored
- AI conversations and summaries can be stored
- dashboard widget config can be stored
- theme settings can be stored

#### M3-T006 — Seed metric definitions

**Acceptance criteria:**

- canonical metric registry exists in code and DB
- units and metric directionality are defined
- scoring-relevant metrics are flagged

### 9.5 Definition of done

M3 is complete when the backend can create a user, register a provider connection, save raw payload metadata, store normalized metrics, and query daily summaries/scores through typed contracts.

---

## 10. M4 — Provider Sync Pipeline

### 10.1 Goal

Implement the first real ingestion pipeline for Google Health API data.

### 10.2 Scope

M4 includes:

- provider connector interface
- Google Health connector
- sync job model
- historical backfill
- incremental sync
- raw payload storage
- normalization
- sync cursor management
- data availability tracking
- retry/dead-letter behavior

### 10.3 Connector interface

All providers MUST follow a connector pattern.

Required connector capabilities:

```ts
interface HealthProviderConnector {
  providerCode: ProviderCode;
  listCapabilities(): ProviderCapability[];
  authorizeUrl(params: AuthorizationParams): Promise<string>;
  exchangeCode(params: OAuthCallbackParams): Promise<TokenExchangeResult>;
  refreshToken(connectionId: string): Promise<TokenRefreshResult>;
  syncData(job: ProviderSyncJob): Promise<ProviderSyncResult>;
  normalizePayload(payload: RawProviderPayload): Promise<NormalizedRecord[]>;
}
```

### 10.4 Sync job types

Required job types:

```text
INITIAL_BACKFILL
INCREMENTAL_SYNC
MANUAL_REFRESH
WEBHOOK_REFRESH
REPROCESS_RAW_PAYLOAD
RECOMPUTE_SUMMARIES
RECOMPUTE_SCORES
```

### 10.5 Initial sync policy

For P1:

- attempt maximum useful historical backfill after M1 confirms practical limits
- always support a smaller backfill fallback if API behavior is slow/limited
- show user a “building baseline” state until enough history exists

### 10.6 Incremental sync policy

Minimum P1 approach:

```text
On app open:
  if last sync is stale, enqueue incremental sync

Scheduled:
  run background sync periodically for active private beta users

Manual:
  user can trigger refresh with rate-limit protection
```

### 10.7 Work items

#### M4-T001 — Implement provider connector base package

**Acceptance criteria:**

- provider connector interface exists
- fake provider connector exists for tests
- connector outputs normalized records using canonical metric codes

#### M4-T002 — Implement Google OAuth health authorization flow

**Acceptance criteria:**

- app/backend can initiate Google Health OAuth flow
- callback stores encrypted token reference
- provider connection state is tracked
- app can show connected/disconnected/error state

#### M4-T003 — Implement Google sync worker

**Acceptance criteria:**

- worker can run backfill and incremental jobs
- worker saves raw payloads to S3
- worker stores raw metadata in Postgres
- worker normalizes at least steps, calories, sleep, HRV, RHR, respiratory rate, SpO2, exercise if available

#### M4-T004 — Implement sync cursor and idempotency

**Acceptance criteria:**

- repeated sync does not duplicate records
- cursors are persisted per provider/data type
- changed provider data can be reconciled
- sync job logs include counts and error categories

#### M4-T005 — Implement sync status API

**Acceptance criteria:**

- mobile can query provider connection state
- mobile can query last sync time
- mobile can query latest available data time
- mobile can show stale/missing data states

### 10.8 Definition of done

M4 is complete when a real Google-connected test user can backfill and incrementally sync data into the normalized Primis schema.

---

## 11. M5 — Scoring + Summary Engine

### 11.1 Goal

Turn normalized health data into useful daily summaries, baselines, scores, insights, and bedtime planning outputs.

### 11.2 Scope

M5 implements the initial deterministic scoring engine from `primis_scoring_algorithms_spec.md`.

Required outputs:

```text
daily summaries
rolling baselines
sleep score
sleep debt
recovery score
training readiness score
activity/load metrics
wellbeing score widget
bedtime planner recommendations
score component explanations
basic insight candidates
```

### 11.3 Scoring design rules

- Objective provider data drives core scores.
- Manual inputs can modify/explain but must not dominate core scores.
- Every score must include component values.
- Missing data must reduce confidence or mark unavailable; do not fake precision.
- AI may explain scores but must not calculate the core score ad hoc.

### 11.4 Work items

#### M5-T001 — Implement daily summary builder

**Acceptance criteria:**

- summaries can be generated for a date range
- summaries are idempotent
- summaries include data completeness metadata
- chart-ready outputs can be derived without expensive mobile calculations

#### M5-T002 — Implement rolling baselines

**Acceptance criteria:**

- supports 7/14/30/90-day windows
- excludes invalid/missing days
- supports metric directionality
- stores baseline values and eligibility state

#### M5-T003 — Implement Sleep Score

**Acceptance criteria:**

- uses sleep duration, efficiency, consistency, stage balance where available, overnight recovery signals, sleep debt
- stores score snapshot and components
- returns score state and confidence
- handles missing stage data gracefully

#### M5-T004 — Implement Recovery Score

**Acceptance criteria:**

- uses HRV, resting HR, sleep score, sleep debt, respiratory stability, SpO2 stability, training load context, and optional check-in modifier
- returns recommendation band
- stores component explanations

#### M5-T005 — Implement Training Readiness + Activity Load

**Acceptance criteria:**

- calculates readiness from recovery, sleep debt, recent training load, soreness/fatigue input, and goal context
- calculates basic training load/strain from available workouts, HR zones, active calories, and duration
- flags insufficient workout data cleanly

#### M5-T006 — Implement Bedtime Planner Engine

**Acceptance criteria:**

- takes target wake time
- uses historical sleep latency
- uses sleep need/sleep debt
- uses circadian consistency
- uses sleep-cycle heuristic without claiming fake precision
- returns ranked bedtime windows
- explains best/good/last acceptable options through structured fields

Example output:

```json
{
  "targetWakeTime": "2026-06-03T07:00:00-04:00",
  "recommendedWindows": [
    {
      "rank": 1,
      "label": "Best",
      "lightsOutStart": "2026-06-02T22:12:00-04:00",
      "lightsOutEnd": "2026-06-02T22:32:00-04:00",
      "estimatedSleepOpportunityMinutes": 510,
      "reasonCodes": ["sleep_debt", "normal_latency", "cycle_aligned", "circadian_consistent"]
    }
  ]
}
```

#### M5-T007 — Implement basic insight candidate generation

**Acceptance criteria:**

- generates deterministic insight candidates from score changes, baseline deviations, missing data, and obvious patterns
- insight candidates include evidence references
- AI can later consume these candidates

### 11.5 Definition of done

M5 is complete when a real or fixture user can produce explainable daily scores and bedtime recommendations without calling an LLM.

---

## 12. M6 — Mobile App Shell + Design System Foundation

### 12.1 Goal

Create the iOS-first mobile foundation with premium design-system primitives and navigation.

### 12.2 Scope

M6 includes:

- Expo Dev Client app
- navigation structure
- theme system
- design tokens
- base components
- local storage/cache foundation
- API client
- auth screens
- skeleton/loading/error states
- motion primitives

### 12.3 Design-system requirements

The design system MUST implement:

```text
colors/theme tokens
typography tokens
spacing scale
radius scale
elevation/shadow rules
button components
card components
metric tiles
score cards
insight cards
charts shell
bottom sheets
empty states
loading states
microinteraction primitives
```

### 12.4 Performance rules

Mobile screens MUST:

- render cached data first when available
- avoid heavy computation during render
- avoid unnecessary re-renders
- use virtualized lists where needed
- keep animation on native/UI thread where possible
- avoid large JSON parsing in visible interaction path
- use memoized chart datasets

### 12.5 Work items

#### M6-T001 — Create Expo Dev Client app

**Acceptance criteria:**

- app runs on iOS simulator and physical device dev build
- environment config works
- native build path is documented
- Expo Go is not used as the real target runtime

#### M6-T002 — Implement navigation shell

**Acceptance criteria:**

- bottom tabs exist for Home, Sleep, Recovery, Activity, Nutrition, AI Coach or equivalent design-approved structure
- secondary pages support modal/detail navigation
- transitions match UI/UX spec

#### M6-T003 — Implement theme system

**Acceptance criteria:**

- dark performance theme exists
- light premium theme exists
- accent color setting exists
- semantic status colors exist
- theme tokens are centralized

#### M6-T004 — Implement base components

**Acceptance criteria:**

- ScoreCard, MetricTile, InsightCard, ProgressWidget, ChartCard, PrimaryButton, SecondaryButton, BottomSheet, EmptyState, LoadingState exist
- components use tokens, not hardcoded random styles
- components have example stories/screens

#### M6-T005 — Implement API/client cache foundation

**Acceptance criteria:**

- authenticated API client exists
- TanStack Query or equivalent cache is configured
- local persisted cache exists for home/dashboard data
- API errors have standard user-facing mapping

### 12.6 Definition of done

M6 is complete when the app has a polished shell and reusable components that can support core screens without one-off styling chaos.

---

## 13. M7 — Premium Home Dashboard

### 13.1 Goal

Build the default daily dashboard that makes Primis useful immediately after opening.

### 13.2 Scope

Home dashboard P1 includes:

```text
Recovery score
Sleep score
Sleep debt
Steps
Calories burned
Training readiness
HRV trend
Today’s recommendation
Last sync state
Widget ordering/hide/show foundation
```

### 13.3 Product requirements

Home MUST answer:

1. How am I doing today?
2. Why?
3. What should I do?
4. Is the data fresh?
5. What should I tap for more detail?

### 13.4 Work items

#### M7-T001 — Implement dashboard API endpoint

**Acceptance criteria:**

- endpoint returns all home cards in one optimized response
- response includes sync freshness
- response includes score components summary
- response includes user widget ordering
- response includes fallback states for missing data

#### M7-T002 — Implement local-first Home UI

**Acceptance criteria:**

- cached dashboard appears immediately when available
- stale data is labeled, not hidden
- refresh state is visible but not intrusive
- no full-screen spinner for cached users

#### M7-T003 — Implement home widgets

**Acceptance criteria:**

- required widgets render with real/fixture data
- each widget has empty/loading/error/data states
- widgets navigate to relevant detail screens
- widget layout respects design system spacing and motion

#### M7-T004 — Implement widget customization v1

**Acceptance criteria:**

- user can hide/show home widgets
- user can reorder home widgets through an edit screen or simple list
- settings persist in backend and local cache
- default layout is restored if config is invalid

### 13.5 Definition of done

M7 is complete when the founder can open Primis and see a fast, polished, useful daily dashboard with real or fixture health data.

---

## 14. M8 — Sleep + Bedtime Planner UX

### 14.1 Goal

Make Sleep one of Primis’s strongest early experiences.

### 14.2 Scope

M8 includes:

- sleep overview
- sleep score detail
- sleep stages
- sleep debt
- sleep consistency
- overnight signals
- bedtime planner
- suggested bedtimes from wake time
- AI-ready sleep explanation payload

### 14.3 Work items

#### M8-T001 — Implement Sleep API endpoint

**Acceptance criteria:**

- returns latest sleep session
- returns sleep score and components
- returns sleep debt
- returns stage breakdown if available
- returns relevant overnight metrics
- returns trend/chart-ready datasets

#### M8-T002 — Implement Sleep page

**Acceptance criteria:**

- top section shows score and summary
- sections show duration, efficiency, stages, debt, consistency, HRV/RHR if available
- visual hierarchy is premium and not chart spam
- all metrics have units and timestamps where needed

#### M8-T003 — Implement Bedtime Planner UI

**Acceptance criteria:**

- user can select target wake time
- app displays ranked bedtime windows
- output explains why one option is best
- app accounts for sleep latency and sleep debt from engine output
- user can save/return to planner result

#### M8-T004 — Implement Sleep AI summary surface

**Acceptance criteria:**

- summary uses precomputed context packet
- summary can be generated on demand or cached
- summary never invents missing sleep-stage data
- summary includes action-oriented suggestion when appropriate

### 14.4 Definition of done

M8 is complete when Primis can replace the user’s default sleep screen for daily sleep/recovery understanding.

---

## 15. M9 — Recovery + Activity + Vitals UX

### 15.1 Goal

Build the supporting performance pages around recovery, readiness, training/activity, and vitals.

### 15.2 Scope

M9 includes:

```text
Recovery page
Training Readiness page/section
Activity page
Vitals detail page/section
Score explanations
Trend charts
Workout summary cards
```

### 15.3 Work items

#### M9-T001 — Implement Recovery API endpoint

**Acceptance criteria:**

- returns recovery score and component values
- returns HRV/RHR/respiratory/SpO2/sleep/training context
- returns recommendation band and reason codes
- returns trend-ready datasets

#### M9-T002 — Implement Recovery page

**Acceptance criteria:**

- top section explains recovery state
- component breakdown is accessible without cluttering first view
- recommendation language is performance-only, not medical
- page links to AI explanation/chat when relevant

#### M9-T003 — Implement Activity API endpoint

**Acceptance criteria:**

- returns steps, calories, active zone minutes, floors, workouts, training load where available
- returns weekly and recent trends
- returns missing-data state if workout details are limited

#### M9-T004 — Implement Activity page

**Acceptance criteria:**

- shows activity progress and recent trends
- workouts are summarized clearly
- training load/readiness relationship is visible
- user can inspect workout detail if available

#### M9-T005 — Implement Vitals/Body Metrics detail

**Acceptance criteria:**

- shows HRV, RHR, SpO2, respiratory rate, VO2 max, weight/body fat if available
- trends are baseline-aware
- missing metrics explain missing provider data/permissions

### 15.4 Definition of done

M9 is complete when Home, Sleep, Recovery, Activity, and Vitals form a coherent performance-health dashboard.

---

## 16. M10 — Manual Inputs + Nutrition v1

### 16.1 Goal

Add fast lifestyle/nutrition/manual context that improves correlations and AI coaching without pretending to be a full MyFitnessPal clone.

### 16.2 Scope

M10 includes:

```text
manual check-ins
water logging
caffeine logging
alcohol logging
macro logging
meal timing
custom tags
bowel/digestion tracking
basic nutrition daily summary
```

### 16.3 Manual input principle

Manual inputs should enrich analytics and correlations. They should not dominate objective health scores.

### 16.4 Work items

#### M10-T001 — Implement quick check-in model/API

**Acceptance criteria:**

- user can log energy, mood, stress, soreness, fatigue
- check-in takes less than 20 seconds for common path
- optional fields do not slow the common path

#### M10-T002 — Implement hydration/caffeine/alcohol APIs

**Acceptance criteria:**

- user can log water amount
- user can log caffeine amount and latest time
- user can log alcohol range/type
- entries roll up into daily summaries

#### M10-T003 — Implement bowel/digestion tracking

**Acceptance criteria:**

- supports Bristol stool type 1-7
- supports color/smell/urgency/pain/bloating fields
- makes no diagnosis
- data is available for correlation engine later

#### M10-T004 — Implement nutrition v1 macros

**Acceptance criteria:**

- user can enter calories/protein/carbs/fat manually
- user can add meal time and optional notes
- daily nutrition summary is computed
- no claim of exactness unless user provided exact values

#### M10-T005 — Implement custom tags

**Acceptance criteria:**

- user can create custom tags
- user can apply tags to day/meal/workout/sleep context where supported
- tags are available to insight/correlation engine

### 16.5 Definition of done

M10 is complete when a user can quickly add context that Primis can use later to explain trends and personalize AI coaching.

---

## 17. M11 — AI Context Engine + Chat

### 17.1 Goal

Add AI-native analysis and coaching while keeping the deterministic health-data model as the source of truth.

### 17.2 Scope

M11 includes:

- model provider abstraction
- GPT first provider
- Anthropic-ready interface
- AI intent classification
- context packet builders
- AI chat
- score explanations
- sleep summaries
- recovery explanations
- workout suggestions
- nutrition coaching basics
- bedtime planner explanations
- tone/style preferences
- structured AI output contracts

### 17.3 AI rules

AI MUST:

- answer from structured context
- cite/evidence internal metrics in output objects
- use performance-only language
- avoid diagnosis/treatment claims
- ask for missing data when necessary
- respect coach tone and summary tone
- avoid changing factual recommendation based only on tone

AI MUST NOT:

- read raw provider payloads directly for routine answers
- calculate recovery score ad hoc
- invent unavailable metrics
- claim medical certainty
- override deterministic scores without evidence

### 17.4 Work items

#### M11-T001 — Implement model abstraction

**Acceptance criteria:**

- interface supports OpenAI first
- interface can add Anthropic/future providers later
- supports structured output requests
- supports token/cost tracking
- supports timeout/retry policy

#### M11-T002 — Implement intent classifier

**Acceptance criteria:**

- classifies sleep, recovery, activity, nutrition, vitals, bedtime, body composition, manual inputs, general health/performance, app navigation
- returns missing slots when needed
- falls back gracefully

#### M11-T003 — Implement context builders

**Acceptance criteria:**

- context builders exist for user profile, scores, baselines, sleep, recovery, training, nutrition, manual inputs, bedtime, body composition, insight candidates
- context packets are compact and structured
- raw time series is not sent unless specifically required and bounded

#### M11-T004 — Implement AI chat API

**Acceptance criteria:**

- chat supports authenticated user
- messages persist
- AI uses context packet
- response includes structured recommendation/evidence fields
- unsafe/medical language is guarded

#### M11-T005 — Implement AI Coach UI

**Acceptance criteria:**

- chat feels native and fast
- user can ask health/performance questions
- AI can ask clarifying questions
- AI response cards can link to relevant screens
- loading/streaming state is polished

#### M11-T006 — Implement AI summaries

**Acceptance criteria:**

- sleep summary works
- recovery explanation works
- workout summary works when workout data exists
- bedtime planner explanation works
- summaries can be cached

### 17.5 Definition of done

M11 is complete when AI chat and summaries provide useful, grounded analysis from structured Primis data without becoming the untrusted core brain.

---

## 18. M12 — Private Beta Hardening

### 18.1 Goal

Make the app safe and stable enough for the founder and a friend to use daily through TestFlight/internal distribution.

### 18.2 Scope

M12 includes:

- crash/error reporting
- backend observability
- sync job monitoring
- data deletion path
- privacy disclosure draft
- rate-limit handling
- AI cost controls
- backup/restore strategy
- TestFlight build
- seed/demo mode
- onboarding polish
- QA regression checklist

### 18.3 Work items

#### M12-T001 — Add mobile crash/error reporting

**Acceptance criteria:**

- mobile crashes are captured
- API errors are logged with request IDs
- health data values are not leaked into logs unnecessarily

#### M12-T002 — Add backend observability

**Acceptance criteria:**

- sync jobs log counts/durations/statuses
- scoring jobs log recomputation results
- AI calls log model, token count, latency, cost estimate, not raw sensitive context unless explicitly safe
- dashboards/alarms exist for critical errors

#### M12-T003 — Implement data deletion

**Acceptance criteria:**

- user can request account/data deletion internally
- deletion removes or schedules removal of raw payloads, normalized data, tokens, AI conversations, manual entries
- deletion job is auditable

#### M12-T004 — Implement privacy/in-app disclosure draft

**Acceptance criteria:**

- app clearly explains health-data access/use before connection
- language is not buried only in privacy policy
- disclosure is ready for future Google verification refinement

#### M12-T005 — Add AI and sync cost/rate controls

**Acceptance criteria:**

- manual refresh is throttled
- AI requests have timeout and token budget
- repeated summary generation uses cache
- backend has AWS budget alert

#### M12-T006 — TestFlight/internal build

**Acceptance criteria:**

- iOS build installs on founder device
- login works
- Google Health connection works if M1/M4 constraints permit
- app can be used daily without dev machine attached

### 18.4 Definition of done

M12 is complete when the founder and one friend can use Primis daily with real accounts and a stable enough private beta experience.

---

## 19. M13 — Correlation Engine + Insight Expansion

### 19.1 Goal

Make Primis feel meaningfully smarter by identifying relationships between objective health data and manual/lifestyle inputs.

### 19.2 Scope

M13 includes:

- behavior-outcome correlation engine
- lagged correlation detection
- confidence thresholds
- weekly insight report
- richer AI coaching context
- trend cards

### 19.3 Correlation examples

```text
Late caffeine → sleep latency / sleep score
Alcohol → HRV / RHR / recovery
Hydration → headache/fatigue/manual energy
Hard workouts → HRV/RHR/recovery next day
Basketball tag → soreness/readiness
Late meal → sleep quality
Bowel/digestion tags → food timing/hydration/stress
```

### 19.4 Rules

- correlations require minimum sample counts
- user-facing language must say “associated with,” not “caused by”
- low-confidence correlations stay hidden or marked experimental
- AI can explain correlations but must not overstate them

### 19.5 Definition of done

M13 is complete when Primis can produce at least 5 useful personalized trend/correlation insights from private beta data or fixtures.

---

## 20. M14 — Nutrition v1.5 / FoodData Central

### 20.1 Goal

Add a real food catalog without depending on MyFitnessPal.

### 20.2 Scope

M14 includes:

- FoodData Central bulk import pipeline
- food search
- food detail
- serving conversion basics
- user-created foods
- saved foods/meals
- nutrition entry itemization

### 20.3 Data architecture

Two stores:

```text
global_food_catalog
user_foods
```

User-created foods are private by default. Do not pollute the global catalog with unverified user entries.

### 20.4 Work items

#### M14-T001 — Import FoodData Central

**Acceptance criteria:**

- import script downloads/loads official dataset
- source version is recorded
- macro and key micronutrient values are normalized
- import can be rerun safely

#### M14-T002 — Implement food search

**Acceptance criteria:**

- search is fast enough for mobile UX
- returns name, brand, serving info, calories/macros
- handles common search typos reasonably if search index supports it

#### M14-T003 — Implement user foods

**Acceptance criteria:**

- user can create custom food
- custom food can be reused
- custom food is private unless future moderation promotes it

#### M14-T004 — Implement meal/saved food flows

**Acceptance criteria:**

- user can save common meal
- user can log from saved meal
- daily macro summary updates

### 20.5 Definition of done

M14 is complete when Primis supports credible food/macro logging without third-party nutrition app dependency.

---

## 21. M15 — HealthKit + Hume Path

### 21.1 Goal

Enrich iOS data through Apple HealthKit, including likely Hume smart-scale body composition if the Hume app writes to Apple Health.

### 21.2 Scope

M15 includes:

- HealthKit permission UX
- HealthKit read connector
- local-to-backend sync policy
- Apple Health data-source metadata
- conflict resolution with Google data
- body composition enrichment

### 21.3 Work items

#### M15-T001 — HealthKit data availability spike

**Acceptance criteria:**

- tests which Hume/Apple Health body composition fields are visible
- validates weight/body fat/lean mass availability
- documents missing/unavailable fields

#### M15-T002 — Implement HealthKit connector

**Acceptance criteria:**

- reads explicitly permitted data types
- syncs selected data to backend with consent
- stores provider/source metadata
- handles permission denial gracefully

#### M15-T003 — Implement conflict resolution

**Acceptance criteria:**

- source precedence is documented
- duplicate metrics from Google/HealthKit do not corrupt summaries
- body composition source display is accurate

### 21.4 Definition of done

M15 is complete when iOS users can enrich Primis with Apple Health body/vital data and likely Hume scale outputs if available.

---

## 22. M16 — Public-Beta Readiness

### 22.1 Goal

Prepare Primis for more than private use.

### 22.2 Scope

M16 includes:

- production environment
- privacy policy
- terms
- in-app disclosure
- Google OAuth verification prep
- CASA/security-readiness prep
- account deletion
- App Store submission assets
- subscriptions/paywall if needed
- support/contact path
- incident/runbook docs

### 22.3 Public launch gate

Primis MUST NOT publicly market Google Health integration beyond permitted test-user limits until Google verification requirements are understood and satisfied.

### 22.4 Definition of done

M16 is complete when Primis is operationally, legally, and technically ready to invite users outside the founder’s controlled private beta.

---

## 23. Cross-Milestone Dependency Graph

```text
M0 Repo Foundation
  ↓
M1 API/Data Validation ─────────────┐
  ↓                                 │
M2 AWS/Auth Foundation              │
  ↓                                 │
M3 Data Model Foundation            │
  ↓                                 │
M4 Provider Sync Pipeline ←─────────┘
  ↓
M5 Scoring + Summary Engine
  ↓
M6 Mobile Shell + Design System
  ↓
M7 Home Dashboard
  ↓
M8 Sleep + Bedtime Planner
  ↓
M9 Recovery + Activity + Vitals
  ↓
M10 Manual Inputs + Nutrition v1
  ↓
M11 AI Context Engine + Chat
  ↓
M12 Private Beta Hardening
  ↓
M13+ Intelligence / Nutrition / HealthKit / Public Beta
```

Notes:

- M6 can begin before M4/M5 are complete by using fixtures, but UI contracts MUST align with backend DTOs.
- M11 can begin interface work earlier, but AI production behavior should wait for M5 outputs.
- M10 can begin schema/API earlier, but correlation value comes after enough data accumulates.

---

## 24. MVP Feature Matrix

| Feature | P0 | P1 | P2 | P3 | P4 |
|---|---:|---:|---:|---:|---:|
| Account auth | foundation | complete | improve | complete | production harden |
| Google sign-in | foundation | complete | complete | complete | complete |
| Apple sign-in | foundation | complete if feasible | complete | complete | complete |
| Facebook sign-in | foundation | complete if feasible | complete | complete | complete |
| Google Health API data | validate | core | improve | complete | verified prep |
| HealthKit | spike optional | deferred | optional | core | harden |
| Hume via Apple Health | deferred | deferred | optional | core if available | harden |
| Health Connect | architecture only | deferred | deferred | optional | later |
| Home dashboard | fixture | core | improve | complete | public polish |
| Sleep page | fixture | core | improve | complete | public polish |
| Bedtime planner | algorithm + fixture | core | improve | complete | public polish |
| Recovery score | algorithm | core | improve | complete | public polish |
| Training readiness | algorithm | core | improve | complete | public polish |
| Activity page | fixture | core | improve | complete | public polish |
| Vitals page | fixture | core | improve | complete | public polish |
| Manual check-in | schema | core | improve | complete | public polish |
| Water/caffeine/alcohol | schema | core | correlation | complete | public polish |
| Bowel/digestion | schema | core optional | correlation | complete | public polish |
| Macro logging | schema | basic | improve | complete | public polish |
| FoodData Central | research | deferred | core | complete | public polish |
| AI chat | architecture | core | improve | complete | production harden |
| AI summaries | architecture | core | improve | complete | production harden |
| Subscriptions | deferred | deferred | optional | optional | core if public |

---

## 25. Engineering Quality Gates

### 25.1 General definition of done

Every ticket must satisfy:

- implemented code
- typecheck passes
- lint passes
- relevant tests added/updated
- no secrets committed
- no known critical errors ignored
- docs updated if behavior changed
- acceptance criteria demonstrably met

### 25.2 Backend definition of done

Backend tickets must satisfy:

- typed request/response DTOs
- structured errors
- auth/authorization checks where relevant
- idempotency for jobs/mutations where needed
- logs include request/job IDs
- no sensitive token leakage
- tests for success/failure paths

### 25.3 Data/scoring definition of done

Data/scoring tickets must satisfy:

- fixture tests
- missing-data tests
- boundary-condition tests
- deterministic output tests
- component explainability where user-facing
- no score generated from insufficient data without confidence/state flag

### 25.4 Mobile definition of done

Mobile tickets must satisfy:

- dark and light theme check
- small and large screen check
- loading/empty/error/data states
- accessibility labels for interactive controls
- no hardcoded design values outside tokens unless documented
- performance sanity check on real/simulator device

### 25.5 AI definition of done

AI tickets must satisfy:

- context packet schema test
- model abstraction unit test with fake provider
- prompt/output contract test
- safety/performance-only language test where applicable
- token budget guard
- fallback behavior for model errors/timeouts

---

## 26. Testing Strategy

### 26.1 Test layers

| Layer | Required tests |
|---|---|
| Unit | pure functions, score calculations, DTO transforms, utility functions |
| Integration | database migrations, API endpoints, sync workers, provider normalization |
| Fixture | Google Health sample payloads, generated normalized records, score outputs |
| Contract | mobile/backend API contracts, AI context/output schemas |
| E2E smoke | login, connect provider, load dashboard, view sleep/recovery, chat with AI |
| Visual QA | home/sleep/recovery/activity screens in dark/light themes |
| Performance | home render, API response times, sync duration, AI latency budgets |
| Security | auth checks, token encryption, deletion flow, no public S3, log redaction |

### 26.2 Required fixtures

Minimum fixtures:

```text
healthy_baseline_user
low_sleep_debt_user
high_sleep_debt_user
low_hrv_high_rhr_user
missing_hrv_user
missing_sleep_stage_user
no_workout_data_user
high_training_load_user
late_caffeine_tag_user
alcohol_tag_user
body_composition_user
new_user_no_baseline
```

### 26.3 Score regression tests

Every score formula must have golden tests.

Example:

```text
Given healthy_baseline_user for 2026-06-01
When scoring engine recomputes recovery
Then recovery score is within expected band
And component values match fixture expectations
And confidence is high
```

### 26.4 AI regression tests

Use fake model provider for deterministic tests.

Test cases:

- asks “Should I lift today?” with low recovery
- asks “Why is my sleep score bad?” with sleep debt and low efficiency
- asks “What bedtime should I use for 7am wakeup?”
- asks nutrition question with insufficient food data
- asks medical/diagnostic question and receives safe redirect
- asks for unavailable metric and AI admits missing data

---

## 27. Performance Budgets

### 27.1 Mobile perceived performance

Targets for P1:

| Interaction | Target |
|---|---:|
| App opens to cached Home | under 1 second perceived load after app shell starts |
| Tab transition | no visible jank |
| Home refresh API response | ideally under 500ms backend processing excluding network when precomputed |
| Chart interaction | smooth enough for premium feel; no heavy recalculation during gesture |
| AI first token/first response | use cached summaries where possible; chat may take longer but should show polished progress state |

### 27.2 Backend/API performance

Targets for P1:

| Endpoint/job | Target |
|---|---:|
| `/dashboard/today` | precomputed, compact response |
| `/sleep/today` | precomputed summaries/charts |
| `/recovery/today` | precomputed score/components |
| score recomputation | async job, not user-blocking |
| initial backfill | async, progress state visible |
| manual refresh | rate-limited and async if heavy |

### 27.3 AI cost/latency controls

- Summaries should be cached.
- Repeated same-day summary requests should not repeatedly call paid models.
- Chat context packets should be compact.
- Raw time series should be summarized before AI usage.
- Model provider routing should support cheaper models for simple summaries and stronger models for complex reasoning.

---

## 28. Security, Privacy, and Compliance Build Gates

### 28.1 Minimum private beta security

Before private beta:

- OAuth tokens encrypted or stored as encrypted secret references
- no health data in client logs
- no secrets in repo
- S3 blocks public access
- database not publicly exposed
- authenticated endpoints require auth
- deletion flow exists internally
- privacy disclosure draft exists

### 28.2 Public readiness security

Before public beta:

- production privacy policy
- in-app health-data disclosure
- account deletion UI/path
- data deletion implementation and runbook
- Google OAuth verification preparation
- CASA/security assessment readiness
- least-privilege IAM review
- rate limiting / WAF as needed
- incident response runbook

### 28.3 Medical-safety language

Primis is performance-only.

Allowed:

```text
Your resting heart rate is above your recent baseline.
Your recovery markers suggest moderate intensity may be more appropriate today.
This may be worth monitoring.
```

Not allowed:

```text
You are sick.
You have overtraining syndrome.
This indicates a medical condition.
You should treat this with X.
```

---

## 29. Cost-Control Plan

### 29.1 AWS cost controls

For private beta:

- use small dev RDS instance
- enable AWS budgets/alerts
- use S3 lifecycle policies for raw payloads if costs grow
- keep scheduled sync frequency reasonable
- avoid always-on ECS unless Lambda is insufficient
- avoid high-cardinality logs with raw payload dumps

### 29.2 AI cost controls

- central AI gateway tracks calls and tokens
- cache generated summaries
- use strong GPT model first for quality, but route simpler jobs to cheaper models later
- set per-user/day budget guardrails
- do not call AI for every UI render

### 29.3 Database cost controls

- store raw payloads in S3, not Postgres blobs
- store normalized summaries for fast queries
- avoid over-indexing early, but index high-use query paths
- use partitioning later if metric observations become large

---

## 30. AI Coding Agent Workflow

### 30.1 Recommended agent roles

| Agent role | Responsibilities |
|---|---|
| Architect agent | Reads docs, creates implementation plan, checks contracts. |
| Backend agent | APIs, workers, AWS integrations, provider connectors. |
| Data agent | schema, migrations, normalization, fixtures. |
| Scoring agent | pure algorithm package, tests, fixtures. |
| Mobile agent | React Native screens/components, cache, navigation. |
| Design-system agent | tokens, primitives, charts, motion, UI polish. |
| AI engine agent | model abstraction, context packets, prompts, safety. |
| QA agent | regression tests, fixture checks, acceptance criteria audit. |

For a solo builder, these can be prompt personas rather than separate people.

### 30.2 Ticket prompt template

Use this structure when asking an AI coding agent to implement a ticket:

```text
You are implementing Primis ticket {TICKET_ID}.

Read these docs first:
- docs/source-of-truth/primis_mvp_build_plan_milestones.md section {SECTION}
- docs/source-of-truth/{RELEVANT_DOC}

Goal:
{GOAL}

Scope:
{IN_SCOPE}

Out of scope:
{OUT_OF_SCOPE}

Acceptance criteria:
{ACCEPTANCE_CRITERIA}

Files likely involved:
{FILES}

Constraints:
- Do not invent schema names.
- Do not hardcode design tokens.
- Do not send raw health data to AI unless specified.
- Add tests.
- Update docs only if a real decision changes.

Return:
- Implementation summary
- Tests added
- Known limitations
- Follow-up tasks
```

### 30.3 AI agent guardrails

AI coding agents MUST NOT:

- create duplicate schemas instead of using existing schema
- implement fake health-data providers without marking them as fixtures
- hardcode user-specific private health values
- use medical diagnosis language
- add new dependencies without explaining why
- build UI outside design tokens
- call AI provider directly from mobile app for health-data analysis
- expose tokens/secrets to client
- skip tests for scoring/data logic

### 30.4 Review checklist for AI-generated PRs

Review every AI-generated change for:

- Does it follow the source-of-truth docs?
- Did it invent unapproved concepts?
- Does it preserve architecture boundaries?
- Does it handle missing data?
- Does it include tests?
- Does it leak sensitive data?
- Does it preserve mobile performance?
- Does the UI match the design system?
- Are errors observable and user-friendly?
- Is there any accidental medical claim?

---

## 31. Release Plan

### 31.1 Release stages

| Stage | Audience | Criteria |
|---|---|---|
| Local dev | founder only | app runs locally with fixtures |
| Device dev | founder only | app runs on iPhone dev build |
| Data-connected dev | founder only | Google Health connection works |
| Private alpha | founder only | daily dashboard works with real data |
| Private beta | founder + friend | TestFlight/internal build, stable auth/sync |
| Controlled beta | under allowed verification threshold | privacy/deletion/observability in place |
| Public beta | broader users | Google verification/public readiness satisfied |

### 31.2 Private beta acceptance criteria

Private beta requires:

- user can create account/sign in
- user can connect Google Health if API validation permits
- data sync works
- dashboard loads fast
- sleep/recovery/activity pages render
- core scores are explainable
- bedtime planner works
- AI chat answers from structured context
- manual inputs work
- crash/error reporting works
- data deletion path exists
- no critical security issue is known

---

## 32. Success Metrics

### 32.1 Product success metrics for private beta

For the founder/friend stage:

| Metric | Meaning |
|---|---|
| Daily open rate | Does Primis become part of morning routine? |
| Home usefulness | Does Home answer “how am I doing today?” quickly? |
| Sleep page replacement | Does user prefer Primis over Google/Fitbit sleep screen? |
| AI usefulness | Does AI answer actually use personal data? |
| Manual input friction | Can check-in happen quickly enough to maintain use? |
| Score trust | Do scores feel explainable and not random? |
| App feel | Does the app feel premium and fast? |

### 32.2 Engineering success metrics

| Metric | Target direction |
|---|---|
| Sync job success rate | high |
| Sync latency | low enough for daily usefulness |
| Dashboard API payload size | compact |
| Mobile crash-free sessions | high |
| AI cost per active user | controlled |
| Score recomputation errors | near zero |
| Missing-data user confusion | low |

---

## 33. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Google Health API does not expose expected metrics | High | M1 validation gate; derive scores from available metrics; document missing data. |
| Google official scores unavailable | Medium | Primis score engine is core asset; provider scores optional. |
| OAuth verification blocks public launch | High | Private beta under allowed constraints; prepare verification later. |
| React Native UI feels generic | High | Strong design system, motion rules, component QA, physical-device testing. |
| AI gives generic answers | High | Structured context packets, deterministic insight candidates, evidence requirements. |
| Nutrition scope explodes | Medium | P1 manual basics; FoodData Central in P2; no MyFitnessPal dependency. |
| Manual inputs are too slow | Medium | Fast common path; optional advanced fields. |
| Raw data storage costs grow | Medium | S3 lifecycle policies; normalized summaries; user-selectable retention. |
| Scoring feels fake | High | Transparent components, confidence, missing-data handling, baseline testing. |
| Health data privacy concerns | High | encryption, disclosure, deletion, least privilege, no ads/data selling. |
| AI agent codebase drift | High | source-of-truth docs, tickets, review checklist, shared contracts. |

---

## 34. Decision Log

| Decision | Status | Rationale |
|---|---|---|
| Product name is Primis | Locked | User selected name. |
| Google/Fitbit first | Locked | Founder bought Fitbit Air and dislikes Google Health app. |
| iOS first | Locked | Founder uses iOS. |
| React Native + Expo Dev Client | Locked unless major issue | Enables iOS + Android path while preserving development speed. |
| AWS-native mature backend | Locked | Prioritize quality/security/scale; control costs where possible. |
| GPT first, model abstraction from day one | Locked | Quality first but provider-independent backend. |
| AI is native but not analytical core | Locked | Deterministic scoring/context prevents hallucinated analytics. |
| Nutrition v1 basic, FoodData Central later | Locked | Full food logging is large scope; MyFitnessPal is private API. |
| HealthKit after core Google path | Tentative | iOS is important, but Google/Fitbit data validation is first gate. |
| Store raw data if cost reasonable | Locked with lifecycle option | Enables reprocessing as algorithms improve. |

---

## 35. Initial Backlog Summary

### 35.1 Must build for P1 private MVP

```text
- monorepo foundation
- AWS dev environment
- Cognito app auth
- Google Health API validation
- Google provider connector
- raw payload storage
- normalized metric schema
- daily summary builder
- rolling baseline builder
- sleep score
- recovery score
- readiness score
- bedtime planner engine
- React Native app shell
- design system foundation
- home dashboard
- sleep page
- bedtime planner UI
- recovery page
- activity page
- manual check-ins
- hydration/caffeine/alcohol/macro logging
- AI model abstraction
- AI context engine
- AI chat
- AI summaries
- error/crash reporting
- private beta build
```

### 35.2 Should build soon after P1

```text
- correlation engine
- weekly review
- FoodData Central import/search
- saved foods/meals
- HealthKit read path
- Hume via Apple Health validation
- improved chart interactions
- deeper workout recommendations
```

### 35.3 Explicitly deferred

```text
- public subscriptions
- full MyFitnessPal integration
- direct Hume API integration
- Health Connect Android implementation
- multi-provider marketplace
- social/community features
- medical records
- diagnosis/disease prediction
- population-level ML models
```

---

## 36. Implementation Sequencing Recommendation

The first practical coding sequence should be:

```text
1. M0 repo/tooling/docs foundation
2. M1 Google Health API spike script
3. M2 AWS/Cognito/API/RDS base
4. M3 schema/migrations/metric registry
5. M4 Google connector + sync worker
6. M5 summary/scoring package with fixtures
7. M6 mobile shell/design tokens/components
8. M7 home dashboard using fixture data first, then backend data
9. M8 sleep + bedtime planner
10. M9 recovery/activity/vitals
11. M10 manual inputs/nutrition basics
12. M11 AI context/chat/summaries
13. M12 private beta hardening
```

Do not skip M1. Do not delay data modeling until after UI. Do not wire AI directly to raw data.

---

## 37. Final MVP Gate Checklist

Before calling the P1 MVP complete, answer yes to all:

### Data

- [ ] Google Health API data availability matrix is complete.
- [ ] Raw payloads are stored in S3.
- [ ] Normalized metrics are stored in Postgres.
- [ ] Daily summaries are generated.
- [ ] Rolling baselines are generated.
- [ ] Missing data is handled honestly.

### Scores

- [ ] Sleep score works.
- [ ] Sleep debt works.
- [ ] Recovery score works.
- [ ] Training readiness works.
- [ ] Activity/load metrics work.
- [ ] Bedtime planner works.
- [ ] Score components are explainable.

### Mobile

- [ ] App runs on iPhone via development/TestFlight build.
- [ ] Home loads quickly.
- [ ] Sleep page is polished.
- [ ] Recovery page is polished.
- [ ] Activity page is usable.
- [ ] Manual input flow is fast.
- [ ] Dark and light themes work.
- [ ] Widgets can be customized at least basically.

### AI

- [ ] AI model abstraction works.
- [ ] GPT provider works.
- [ ] Context packets are structured.
- [ ] AI chat answers with evidence.
- [ ] AI summaries are cached.
- [ ] Safety/performance-only guardrails work.

### Security/ops

- [ ] Auth works.
- [ ] OAuth tokens are protected.
- [ ] Logs avoid sensitive leakage.
- [ ] Crash/error reporting works.
- [ ] Data deletion path exists.
- [ ] Basic privacy disclosure exists.
- [ ] Costs are monitored.

---

## 38. Source References

These references informed milestone constraints and should be rechecked before public beta or when implementing affected integrations:

1. Google Health API App Verification — `https://developers.google.com/health/app-verification`
2. Google Health API Data Types — `https://developers.google.com/health/data-types`
3. Google Health API Rate Limits — `https://developers.google.com/health/rate-limits`
4. Google Fit Migration / Health Connect / Google Health API guidance — `https://developer.android.com/health-and-fitness/health-connect/migration/fit`
5. Apple HealthKit authorization — `https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data`
6. Expo Development Builds — `https://docs.expo.dev/develop/development-builds/introduction/`
7. AWS Cognito social identity providers — `https://docs.aws.amazon.com/cognito/latest/developerguide/tutorial-create-user-pool-social-idp.html`
8. USDA FoodData Central Download Data — `https://fdc.nal.usda.gov/download-datasets`
9. USDA FoodData Central API Guide — `https://fdc.nal.usda.gov/api-guide`
10. MyFitnessPal API Page — `https://www.myfitnesspal.com/apps/api/version`

---

## 39. Closing Build Principle

Primis should be built like a serious company from day one, but not like a bloated enterprise product.

The winning build pattern is:

```text
Mature architecture
+ tight milestone sequencing
+ local-first mobile performance
+ deterministic health intelligence
+ premium design system
+ AI grounded in structured evidence
+ honest constraints
```

The project fails if it becomes:

```text
random health dashboards
+ generic AI chat
+ fake scores
+ unvalidated data assumptions
+ messy nutrition clone
+ React Native styling chaos
```

The build plan should be treated as a living execution contract. Update it only when implementation discovers a real constraint or a deliberate product decision changes.

---

## V1.1 Amendment — Mandatory Google Health Validation Packet and Sleep Gate

**Status:** Required milestone amendment.  
**Reason:** Google Health API payload certainty is a hard blocker for sleep/recovery/readiness implementation. The docs must now require a specific validation packet before downstream product work is accepted.

### 30.1 New hard gate: G0 Google Health Documentation + Payload Gate

Add this gate before G1:

| Gate | Meaning |
|---|---|
| G0: Google Health API Documentation + Payload Gate | Official endpoint/schema references have been converted into a feature parity matrix, synthetic schema fixtures exist, and real-account redacted fixtures are scheduled/required before private beta. |

G0 has two sub-states:

| State | Meaning |
|---|---|
| `documented_schema_validated` | Official Google docs prove endpoint/schema support and synthetic fixtures match documented schemas. |
| `real_payload_validated` | The founder/test account has produced redacted real payload fixtures from the Google Health API. |

Downstream implementation may use `documented_schema_validated` for local development but private beta requires `real_payload_validated` for sleep-critical features.

### 30.2 M1 expanded deliverables

M1 MUST now produce:

```text
docs/decisions/google_health_api_feature_parity_matrix.md
docs/decisions/google_health_api_validated_payloads.md
docs/decisions/google_health_api_scope_map.md
docs/decisions/google_health_api_endpoint_inventory.md
database/fixtures/provider/google_health/documented_schema/sleep_stages_session.json
database/fixtures/provider/google_health/documented_schema/sleep_classic_session.json
database/fixtures/provider/google_health/documented_schema/paired_devices.json
database/fixtures/provider/google_health/documented_schema/daily_heart_rate_variability.json
database/fixtures/provider/google_health/documented_schema/daily_resting_heart_rate.json
database/fixtures/provider/google_health/documented_schema/respiratory_rate_sleep_summary.json
database/fixtures/provider/google_health/documented_schema/daily_oxygen_saturation.json
database/fixtures/provider/google_health/redacted_real/README.md
```

After live setup, M1 MUST add real redacted fixtures under:

```text
database/fixtures/provider/google_health/redacted_real/
```

### 30.3 M1 expanded critical questions

M1 must answer these sleep-specific questions:

| Question | Required output |
|---|---|
| Does the real account return `sleep.type=STAGES` or only `CLASSIC`? | payload + matrix classification |
| Are `stages[]` populated with AWAKE/LIGHT/DEEP/REM? | payload + count |
| Are `summary.minutesToFallAsleep`, `minutesAsleep`, `minutesAwake`, `minutesInSleepPeriod` populated? | payload + matrix classification |
| Is `metadata.processed` true? | payload + status |
| What `metadata.stagesStatus` values appear? | payload + notes |
| Are out-of-bed segments populated? | payload + notes |
| Are daily HRV fields populated, including average HRV and deep-sleep RMSSD? | payload + notes |
| Is RHR populated and what calculation method appears? | payload + notes |
| Are respiratory and SpO2 sleep/daily values available? | payload + notes |
| Is paired-device battery/sync/version/features available? | payload + notes |
| Is Google Sleep Score directly exposed anywhere? | yes/no + proof |
| Is Google Readiness directly exposed anywhere? | yes/no + proof |
| Is Google Cardio Load directly exposed anywhere? | yes/no + proof |

### 30.4 Hard rule for sleep UI work

Sleep UI can be built against documented-schema synthetic fixtures, but must carry this milestone condition:

```text
No private-beta Sleep page completion until real Google Health sleep payloads are validated or the missing fields are explicitly downgraded to fallback/provisional behavior.
```

### 30.5 Hard rule for AI coding agents

Because AI coding model memory resets every commit, every commit touching Google Health, Sleep, Recovery, Readiness, Activity, Vitals, or AI context MUST read:

```text
docs/decisions/google_health_api_feature_parity_matrix.md
docs/decisions/google_health_api_validated_payloads.md
```

If those files do not exist yet, the commit must create/update them or must not implement data-dependent assumptions.


### V1.1 source references added by this amendment

The following official references are now treated as required implementation references for Google Health sleep, vitals, activity, and device-status parity work:

- Google Health API data types: `https://developers.google.com/health/data-types`
- Google Health API `users.dataTypes.dataPoints` REST reference: `https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints`
- Google Health API list endpoint: `https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/list`
- Google Health API reconcile endpoint: `https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/reconcile`
- Google Health API daily rollup endpoint: `https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/dailyRollUp`
- Google Health API paired devices endpoint: `https://developers.google.com/health/reference/rest/v4/users.pairedDevices`
- Google Health API app verification: `https://developers.google.com/health/app-verification`
- Google Health API rate limits: `https://developers.google.com/health/rate-limits`
- Google Health sleep stages help article: `https://support.google.com/googlehealth/answer/14236712`
- Google Health readiness help article: `https://support.google.com/googlehealth/answer/14236710`

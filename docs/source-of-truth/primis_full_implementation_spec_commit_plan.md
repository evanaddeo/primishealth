# Primis Full Implementation Spec — Commit-Unit Build Plan

**Document type:** Full implementation specification / commit-unit execution plan  
**Product:** Primis  
**Version:** 1.1  
**Status:** Source-of-truth implementation plan draft  
**Prepared for:** Evan / Primis private beta  
**Last updated:** 2026-06-07  
**Primary audience:** AI coding agents, founder/developer, future engineers, QA reviewers

---

## 0. Purpose

This document converts the Primis source-of-truth planning docs into a concrete, implementation-ready sequence of **one-commit units of work**.

The AI coding agent is expected to act as the manual labor. This document is the implementation brain. Each commit unit is intentionally scoped so a coding agent can implement one focused change, run tests, and produce a clean commit without drifting into unrelated work.

Primis is a React Native + Expo Dev Client mobile app with an AWS-native backend, Google/Fitbit-first health data ingestion, deterministic scoring, AI-native coaching/summaries, premium UI/UX, and eventual iOS HealthKit/Hume/nutrition expansion.

---

## 1. Source-of-Truth Documents

Before implementing any commit unit, the coding agent must read the relevant sections of these seven docs:

| Doc                               | Filename                                                         | Primary authority                                                                       |
| --------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Product Requirements Document     | `docs/source-of-truth/primis_product_requirements_document.md`   | Product scope, user journeys, requirements, phase boundaries                            |
| Technical Architecture Document   | `docs/source-of-truth/primis_technical_architecture_document.md` | AWS architecture, repository structure, provider architecture, performance architecture |
| Data Model / Health Metric Schema | `docs/source-of-truth/primis_data_model_health_metric_schema.md` | Tables, metric codes, enums, units, provider mappings, data quality                     |
| Scoring & Algorithms Spec         | `docs/source-of-truth/primis_scoring_algorithms_spec.md`         | Baselines, scores, component formulas, confidence, bedtime planner                      |
| AI Context Engine Spec            | `docs/source-of-truth/primis_ai_context_engine_spec.md`          | AI gateway, intent classification, context packets, safety, prompts, structured outputs |
| UI/UX Design System Spec          | `docs/source-of-truth/primis_ui_ux_design_system_spec.md`        | Design tokens, navigation, components, motion, loading states, accessibility            |
| MVP Build Plan / Milestones       | `docs/source-of-truth/primis_mvp_build_plan_milestones.md`       | High-level milestone sequencing and build gates                                         |

If this implementation spec conflicts with a prior doc, use this order:

1. This implementation spec for commit sequencing.
2. MVP Build Plan for milestone/gate intent.
3. Technical Architecture for system boundaries.
4. Data Model for schema and metric names.
5. Scoring Spec for algorithms.
6. AI Context Engine for AI behavior.
7. UI/UX Spec for interface behavior.
8. PRD for product intent.

If a real-world implementation finding contradicts a source doc, create a decision record instead of silently changing architecture.

---

## 2. Non-Negotiable Implementation Principles

### 2.1 Health-data model first

Do not build Primis as a pretty dashboard over fake data. The core asset is the normalized, provider-independent, queryable health-data model.

Correct order:

```text
contracts -> schema -> ingestion -> summaries -> baselines -> scores -> insights -> AI context -> UI rendering
```

Incorrect order:

```text
screens -> fake charts -> AI chat -> late schema decisions -> broken app
```

### 2.2 Deterministic core, AI explanation layer

AI may summarize, explain, coach, and answer questions. AI must not be the source of truth for Sleep Score, Recovery Score, Training Readiness, Activity Score, Nutrition Score, Bedtime Planner rankings, or baselines.

### 2.3 React Native quality bar

React Native is acceptable only if it is engineered intentionally:

- no heavy analytics in render paths
- no raw time-series chart calculations on screen mount
- no unbounded FlatList/ScrollView anti-patterns
- no ad hoc styles outside tokens
- no generic AI-dashboard visual clutter
- no UI blocking on live AI calls
- no Expo Go dependency for the real app

Use Expo Dev Client / EAS builds from the beginning because native modules are expected.

### 2.4 AWS-native, cost-aware maturity

The backend should be AWS-native and production-shaped, but not wasteful:

- Cognito for app auth
- API Gateway + Lambda first
- ECS/Fargate only for longer jobs when Lambda is insufficient
- RDS Postgres for canonical data
- S3 for raw payloads
- SQS/EventBridge for background work
- KMS/Secrets Manager for sensitive data
- CloudWatch/X-Ray/Sentry for observability

### 2.5 Manual work is deferred to the end

This spec intentionally saves provider keys, account setup, AWS deploys, Google Health live authorization, app signing, and production endpoint wiring for the final manual phase.

Earlier commits must use:

- placeholder env vars
- mock provider adapters
- local Postgres
- redacted fixtures
- fake AI providers
- local S3 abstractions
- CDK stacks that are valid but not necessarily deployed

This respects the constraint that coding agents cannot autonomously create accounts, obtain keys, approve OAuth screens, or configure App Store/TestFlight credentials.

### 2.6 Live data validation still gates private beta

Because manual provider setup is deferred, earlier commits may proceed against fixtures. However, the app must not claim Google/Fitbit metrics are confirmed until the final manual validation phase updates `docs/decisions/google-health-api-metric-availability.md`.

All score/UI logic must gracefully handle:

- missing provider metrics
- stale sync
- partial data
- provider score unavailability
- provisional baseline state

---

## 3. Commit Unit Contract

Every commit unit below is designed to be one focused commit.

### 3.1 Required coding-agent behavior per commit

For each commit unit, the agent must:

1. Read the referenced docs/sections.
2. Implement only the commit unit.
3. Avoid speculative features.
4. Add or update tests where specified.
5. Run the verification commands.
6. Return a short implementation summary.
7. State known limitations.
8. Do not touch secrets, real provider credentials, or production resources.

### 3.2 Commit message format

Use:

```text
<area>: <short imperative summary> (<commit-unit-id>)
```

Examples:

```text
repo: initialize pnpm monorepo (CU-001)
mobile: add theme token system (CU-022)
scoring: implement sleep debt engine (CU-067)
```

### 3.3 Branch naming

Use:

```text
cu/<commit-unit-id-lowercase>-<short-name>
```

Example:

```text
cu/cu-067-sleep-debt-engine
```

### 3.4 Standard verification commands

Root-level commands should eventually exist:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

Mobile-specific commands should eventually exist:

```bash
pnpm --filter @primis/mobile lint
pnpm --filter @primis/mobile typecheck
pnpm --filter @primis/mobile test
pnpm --filter @primis/mobile start
```

Backend-specific commands should eventually exist:

```bash
pnpm --filter @primis/api test
pnpm --filter @primis/workers test
pnpm --filter @primis/scoring test
pnpm db:migrate
pnpm db:test
```

### 3.5 Definition of Done for every code commit

A commit is not done unless:

- TypeScript passes.
- Lint passes.
- Relevant tests pass.
- No secrets are committed.
- No source-of-truth requirement is silently violated.
- User-facing UI uses design tokens where applicable.
- Backend code uses typed DTOs and shared contracts where applicable.
- New tables/metric codes/enums align with the data-model doc.

---

## 4. Architecture Decisions Locked by This Spec

### 4.1 Monorepo

Use a TypeScript-first PNPM monorepo.

```text
primis/
  apps/
    mobile/
  services/
    api/
    workers/
    ai/
  packages/
    core-types/
    health-metrics/
    scoring/
    api-contracts/
    design-system/
    config/
  infrastructure/
    cdk/
  database/
    migrations/
    seeds/
    fixtures/
  docs/
    source-of-truth/
    decisions/
    runbooks/
  scripts/
```

### 4.2 Backend language and framework

Use TypeScript for backend services and AWS CDK.

Recommended API implementation:

- API Gateway HTTP API
- Lambda runtime
- Hono or a thin typed Lambda router
- Zod validation for request/response contracts
- Kysely + SQL migrations for Postgres

Rationale:

- TypeScript aligns mobile/backend/shared contracts.
- SQL-first migrations avoid ORM schema drift for complex health data.
- Kysely provides type-safe query composition without hiding SQL.

If the coding agent strongly prefers another tool, it must create `docs/decisions/ADR-000X-backend-query-layer.md` before changing this.

### 4.3 Mobile app

Use:

- React Native
- Expo Dev Client
- EAS Build/Submit/Update configuration
- Expo Router unless blocked
- React Native Reanimated
- React Native Gesture Handler
- React Native Skia for charts
- TanStack Query for server state
- MMKV for fast local key-value where available
- SQLite for local dashboard/cache data
- Zod for validation

### 4.4 AI provider abstraction

Use backend-only model abstraction:

```text
AiGateway
  -> OpenAIAdapter
  -> AnthropicAdapter
  -> MockAiAdapter
  -> FutureProviderAdapter
```

No mobile code may call OpenAI, Anthropic, or other model providers directly.

### 4.5 Manual setup timing

Do not deploy real AWS stacks or wire real provider secrets until Phase Z. All earlier code must be safe to run locally and in CI without cloud secrets.

---

## 5. Phase Overview

| Phase   | Name                                          | Purpose                                                                                      |
| ------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Phase A | Repo and Tooling Foundation                   | Create AI-agent-safe monorepo, tooling, docs, contracts shell.                               |
| Phase B | Shared Contracts and Health Model Foundations | Define provider enums, metric registry, units, score types, API envelopes.                   |
| Phase C | Mobile Shell and Design System                | Build Expo app shell, navigation, tokens, components, cache, mock mode.                      |
| Phase D | Backend Local Foundation and Database         | Build local API, DB, migrations, core schema, repositories.                                  |
| Phase E | Provider Validation and Sync Infrastructure   | Build Google Health connector structure, spike scripts, normalization, raw payload handling. |
| Phase F | Summary, Baseline, Scoring, Bedtime Engine    | Build deterministic scoring and algorithm layer.                                             |
| Phase G | Core App Surfaces                             | Build Home, Sleep, Bedtime Planner, Recovery, Activity, Vitals.                              |
| Phase H | Manual Inputs and Nutrition v1                | Build check-ins, hydration, caffeine, alcohol, macros, tags, bowel entries.                  |
| Phase I | AI Context Engine and AI Coach                | Build AI gateway, context builders, prompts, chat, summaries.                                |
| Phase J | Private Beta Quality Hardening                | Performance, accessibility, privacy controls, observability, TestFlight readiness.           |
| Phase K | Post-MVP Expansion Stubs                      | Correlations, FoodData Central, HealthKit/Hume path scaffolding.                             |
| Phase Z | Manual Setup and Live Validation              | AWS/Google/Apple/Facebook/AI keys, deployments, TestFlight, real device validation.          |

---

# Phase A — Repo and Tooling Foundation

## CU-001 — Initialize repository structure

**Commit message:** `repo: initialize Primis monorepo structure (CU-001)`

**References:** MVP Build Plan §6; Technical Architecture §7.

**Goal:** Create the repository skeleton expected by all later commits.

**Files likely involved:**

```text
package.json
pnpm-workspace.yaml
README.md
apps/mobile/.gitkeep
services/api/.gitkeep
services/workers/.gitkeep
services/ai/.gitkeep
packages/core-types/.gitkeep
packages/health-metrics/.gitkeep
packages/scoring/.gitkeep
packages/api-contracts/.gitkeep
packages/design-system/.gitkeep
packages/config/.gitkeep
infrastructure/cdk/.gitkeep
database/migrations/.gitkeep
database/seeds/.gitkeep
database/fixtures/.gitkeep
docs/source-of-truth/.gitkeep
docs/decisions/.gitkeep
docs/runbooks/.gitkeep
scripts/.gitkeep
```

**In scope:** folder structure, workspace file, README setup instructions.

**Out of scope:** generating mobile app, backend app, database schema.

**Acceptance criteria:**

- Repo has all top-level folders defined in this spec.
- `pnpm-workspace.yaml` includes `apps/*`, `services/*`, `packages/*`, and `infrastructure/*`.
- README documents repo purpose, setup placeholder, and source-of-truth docs location.

**Verification:**

```bash
pnpm -v
```

---

## CU-002 — Add source-of-truth documents and contribution guide

**Commit message:** `docs: add source-of-truth documentation guide (CU-002)`

**References:** all seven planning docs; MVP Build Plan §0.1.

**Goal:** Make docs discoverable and enforce reading order for AI coding agents.

**Files likely involved:**

```text
docs/source-of-truth/*.md
docs/README.md
CONTRIBUTING.md
.ai-agent-instructions.md
```

**In scope:** copy existing seven docs into `docs/source-of-truth/`; create instructions for agents.

**Out of scope:** editing product requirements.

**Acceptance criteria:**

- All seven source docs exist under `docs/source-of-truth/`.
- `docs/README.md` lists the docs in required reading order.
- `.ai-agent-instructions.md` states: implement only assigned commit unit; do not invent schema/formulas/styles; add tests.
- `CONTRIBUTING.md` describes commit unit workflow.

**Verification:**

```bash
ls docs/source-of-truth
```

---

## CU-003 — Configure TypeScript workspace baseline

**Commit message:** `repo: configure strict TypeScript workspace (CU-003)`

**References:** Technical Architecture §6.3, §7.

**Goal:** Establish strict TS settings shared by all packages.

**Files likely involved:**

```text
tsconfig.base.json
package.json
packages/config/package.json
packages/config/tsconfig.json
```

**Acceptance criteria:**

- Root `tsconfig.base.json` uses strict TypeScript.
- Packages can extend the base config.
- Path aliases are planned but not overused.
- `pnpm typecheck` exists even if only checks placeholder packages.

**Verification:**

```bash
pnpm typecheck
```

---

## CU-004 — Add linting, formatting, and editor config

**Commit message:** `repo: add lint formatting and editor config (CU-004)`

**References:** MVP Build Plan §6.4.

**Goal:** Prevent formatting/lint drift before code expands.

**Files likely involved:**

```text
.eslintrc.cjs
.prettierrc
.prettierignore
.editorconfig
package.json
```

**Acceptance criteria:**

- `pnpm lint` exists.
- `pnpm format` and `pnpm format:check` exist.
- Ignore files exclude build outputs and generated files.
- Rules are strict enough to catch unused variables/imports.

**Verification:**

```bash
pnpm lint
pnpm format:check
```

---

## CU-005 — Add test framework baseline

**Commit message:** `test: add Vitest baseline and fixtures convention (CU-005)`

**References:** MVP Build Plan §0.1, §6.

**Goal:** Ensure every package can add deterministic tests.

**Files likely involved:**

```text
vitest.config.ts
package.json
tests/README.md
database/fixtures/README.md
```

**Acceptance criteria:**

- `pnpm test` runs Vitest.
- Fixture conventions explain redaction and no-secrets policy.
- Example placeholder test passes.

**Verification:**

```bash
pnpm test
```

---

## CU-006 — Add GitHub Actions CI baseline

**Commit message:** `ci: add baseline checks workflow (CU-006)`

**References:** Technical Architecture §6.2, external GitHub OIDC docs later for deploy.

**Goal:** Run checks on pull requests before implementation grows.

**Files likely involved:**

```text
.github/workflows/ci.yml
```

**Acceptance criteria:**

- CI installs PNPM.
- CI runs lint, typecheck, tests, and format check.
- No AWS credentials are required.
- Workflow has least basic permissions.

**Verification:**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm format:check
```

---

## CU-007 — Add environment variable contract and safe config loader

**Commit message:** `config: add typed environment contract (CU-007)`

**References:** Technical Architecture §8; AI Context Engine §3; MVP Build Plan §28-29.

**Goal:** Centralize env var validation and prevent secret leakage.

**Files likely involved:**

```text
.env.example
packages/config/src/env.ts
packages/config/src/index.ts
packages/config/package.json
```

**In scope:** typed env loader using Zod; `.env.example`; safe distinction between public and secret envs.

**Out of scope:** real secrets.

**Acceptance criteria:**

- Missing required envs produce clear errors.
- `.env.example` contains placeholders only.
- No `.env` file is committed.
- Public mobile envs are clearly separated from backend secrets.

**Verification:**

```bash
pnpm --filter @primis/config test
```

---

# Phase B — Shared Contracts and Health Model Foundations

## CU-008 — Create core type package with domain enums

**Commit message:** `types: add core Primis domain enums (CU-008)`

**References:** Data Model §8-9; AI Context Engine §7-8; Scoring Spec §6.

**Goal:** Establish shared enum contracts before DB/API/UI code.

**Files likely involved:**

```text
packages/core-types/package.json
packages/core-types/src/provider.ts
packages/core-types/src/metrics.ts
packages/core-types/src/scores.ts
packages/core-types/src/sync.ts
packages/core-types/src/ai.ts
packages/core-types/src/index.ts
```

**Acceptance criteria:**

- Provider codes include `google_health`, `apple_healthkit`, `android_health_connect`, `manual`, `fooddata_central`, `hume_via_healthkit`, `primis_internal`.
- Score types include sleep, recovery, training_readiness, activity, nutrition, wellbeing, bedtime.
- AI intents match the AI Context Engine spec.
- Types compile without dependencies on app/backend packages.

**Verification:**

```bash
pnpm --filter @primis/core-types typecheck
```

---

## CU-009 — Create canonical metric registry package

**Commit message:** `metrics: add canonical metric registry (CU-009)`

**References:** Data Model §9; Scoring Spec §5.

**Goal:** Define canonical metrics once for backend, scoring, and UI.

**Files likely involved:**

```text
packages/health-metrics/src/registry.ts
packages/health-metrics/src/categories.ts
packages/health-metrics/src/index.ts
packages/health-metrics/test/registry.test.ts
```

**Acceptance criteria:**

- Registry includes activity, vitals, body composition, sleep, nutrition/manual, derived, and score metrics from the data-model doc.
- Each metric has code, category, canonical unit, sampling type, default aggregation, direction, and display name.
- Tests assert uniqueness and required fields.

**Verification:**

```bash
pnpm --filter @primis/health-metrics test
```

---

## CU-010 — Add unit conversion utilities

**Commit message:** `metrics: add canonical unit conversion utilities (CU-010)`

**References:** Data Model §5.3.

**Goal:** Normalize metrics at ingestion time and display user units later.

**Files likely involved:**

```text
packages/health-metrics/src/units.ts
packages/health-metrics/test/units.test.ts
```

**Acceptance criteria:**

- Supports kg/lb, meters/miles/km, ml/oz, celsius/fahrenheit, seconds/minutes/hours, kcal, grams, mg.
- Conversion functions are pure and tested.
- Invalid conversion throws typed error.

**Verification:**

```bash
pnpm --filter @primis/health-metrics test
```

---

## CU-011 — Add API contract envelope and error schema

**Commit message:** `contracts: add API response and error contracts (CU-011)`

**References:** Technical Architecture §7, §9; AI Context Engine §9.

**Goal:** Standardize API responses across mobile/backend.

**Files likely involved:**

```text
packages/api-contracts/src/envelope.ts
packages/api-contracts/src/errors.ts
packages/api-contracts/src/pagination.ts
packages/api-contracts/src/index.ts
```

**Acceptance criteria:**

- Defines success/error envelope.
- Defines API error codes for auth, validation, missing data, stale data, provider error, rate limit, internal error.
- Exports Zod schemas and TypeScript types.

**Verification:**

```bash
pnpm --filter @primis/api-contracts test
```

---

## CU-012 — Add score and data-quality DTOs

**Commit message:** `contracts: add score snapshot and data quality DTOs (CU-012)`

**References:** Scoring Spec §6-8; Data Model score tables.

**Goal:** Define the shape of score snapshots before implementing scoring/UI.

**Files likely involved:**

```text
packages/api-contracts/src/scores.ts
packages/api-contracts/src/dataQuality.ts
packages/api-contracts/test/scores.test.ts
```

**Acceptance criteria:**

- Score snapshot DTO includes score type, value, state, confidence, band, local date, algorithm version, component values, missing data, top drivers.
- Data quality DTO includes completeness, provider freshness, baseline status, stale connections.
- Zod schemas validate fixtures.

**Verification:**

```bash
pnpm --filter @primis/api-contracts test
```

---

## CU-013 — Add fixture redaction and no-secrets policy

**Commit message:** `test: add fixture redaction policy and helpers (CU-013)`

**References:** MVP Build Plan §7.6; Data Model §5.4.

**Goal:** Make provider/API fixture use safe from the beginning.

**Files likely involved:**

```text
scripts/redact-fixture.ts
database/fixtures/README.md
packages/core-types/src/redaction.ts
```

**Acceptance criteria:**

- README states provider payload fixtures must be redacted.
- Redaction helper removes tokens, emails, IDs, raw names, precise device identifiers.
- Test verifies common secret patterns are removed.

**Verification:**

```bash
pnpm test
```

---

# Phase C — Mobile Shell and Design System

## CU-014 — Initialize Expo Dev Client mobile app

**Commit message:** `mobile: initialize Expo Dev Client app (CU-014)`

**References:** Technical Architecture §6.1; UI/UX Spec §0; external Expo Development Builds docs.

**Goal:** Create the React Native app foundation using Expo Dev Client, not Expo Go assumptions.

**Files likely involved:**

```text
apps/mobile/package.json
apps/mobile/app.json or app.config.ts
apps/mobile/src/
apps/mobile/tsconfig.json
apps/mobile/babel.config.js
```

**Acceptance criteria:**

- App starts locally.
- Uses TypeScript.
- Includes Expo Dev Client dependency path.
- App config has placeholder bundle IDs and app name `Primis`.
- No real credentials or Apple team IDs.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
pnpm --filter @primis/mobile start
```

---

## CU-015 — Add EAS build/update configuration placeholders

**Commit message:** `mobile: add EAS build and update config placeholders (CU-015)`

**References:** Technical Architecture §6.1; MVP Build Plan §3.5; external EAS Build/TestFlight docs.

**Goal:** Prepare for iOS store/TestFlight without requiring credentials yet.

**Files likely involved:**

```text
apps/mobile/eas.json
apps/mobile/app.config.ts
apps/mobile/README.md
```

**Acceptance criteria:**

- EAS profiles exist: `development`, `preview`, `production`.
- Update channels are planned: `dev`, `preview`, `production`.
- Bundle identifiers are placeholders and marked manual.
- README explains that real Apple credentials are Phase Z.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-016 — Add Expo Router navigation shell

**Commit message:** `mobile: add tab navigation shell (CU-016)`

**References:** UI/UX Spec §5-6.

**Goal:** Create primary navigation with stable tabs.

**Files likely involved:**

```text
apps/mobile/app/_layout.tsx
apps/mobile/app/(tabs)/_layout.tsx
apps/mobile/app/(tabs)/index.tsx
apps/mobile/app/(tabs)/sleep.tsx
apps/mobile/app/(tabs)/recovery.tsx
apps/mobile/app/(tabs)/activity.tsx
apps/mobile/app/(tabs)/nutrition.tsx
apps/mobile/app/(tabs)/coach.tsx
```

**Acceptance criteria:**

- Tabs: Home, Sleep, Recovery, Activity, Nutrition, AI Coach.
- Screens render placeholder content through shared layout.
- Navigation code is clean and isolated.
- No business logic in route files beyond screen composition.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-017 — Add theme token system

**Commit message:** `design: add Primis theme tokens (CU-017)`

**References:** UI/UX Spec §8-14.

**Goal:** Prevent ad hoc styling by defining tokens.

**Files likely involved:**

```text
packages/design-system/src/tokens/color.ts
packages/design-system/src/tokens/spacing.ts
packages/design-system/src/tokens/typography.ts
packages/design-system/src/tokens/radius.ts
packages/design-system/src/tokens/shadow.ts
packages/design-system/src/theme.ts
apps/mobile/src/providers/ThemeProvider.tsx
```

**Acceptance criteria:**

- Dark Performance and Light Precision themes exist.
- Accent presets exist as tokens.
- Spacing scale and typography scale are defined.
- Components can consume theme through provider/hook.
- No hardcoded colors in placeholder screens except allowed debug placeholders.

**Verification:**

```bash
pnpm --filter @primis/design-system test
pnpm --filter @primis/mobile typecheck
```

---

## CU-018 — Add core UI primitives

**Commit message:** `design: add core UI primitives (CU-018)`

**References:** UI/UX Spec §10-14.

**Goal:** Build the primitives every screen must use.

**Files likely involved:**

```text
packages/design-system/src/components/Screen.tsx
packages/design-system/src/components/Card.tsx
packages/design-system/src/components/Text.tsx
packages/design-system/src/components/Button.tsx
packages/design-system/src/components/MetricValue.tsx
packages/design-system/src/components/StatusBadge.tsx
packages/design-system/src/components/ProgressBar.tsx
packages/design-system/src/index.ts
```

**Acceptance criteria:**

- Components are token-driven.
- Touch targets meet mobile accessibility minimums.
- Text supports semantic variants.
- Components have basic tests or Storybook-like examples if feasible.

**Verification:**

```bash
pnpm --filter @primis/design-system typecheck
```

---

## CU-019 — Add motion primitives and reduced-motion support

**Commit message:** `design: add motion primitives and reduced motion handling (CU-019)`

**References:** UI/UX Spec motion sections; React Native/Expo constraints.

**Goal:** Make animations intentional and reusable.

**Files likely involved:**

```text
packages/design-system/src/motion/timing.ts
packages/design-system/src/motion/transitions.ts
apps/mobile/src/hooks/useReducedMotion.ts
```

**Acceptance criteria:**

- Defines motion durations/easings.
- Provides reusable card enter, card press, screen transition, metric update patterns.
- Respects reduced-motion setting.
- No random animation constants in screens.

**Verification:**

```bash
pnpm --filter @primis/design-system typecheck
```

---

## CU-020 — Add chart primitives scaffold

**Commit message:** `design: add chart primitive scaffold (CU-020)`

**References:** UI/UX Spec chart and health screen guidance.

**Goal:** Create reusable chart interfaces before chart-heavy screens.

**Files likely involved:**

```text
packages/design-system/src/charts/LineChart.tsx
packages/design-system/src/charts/StageTimeline.tsx
packages/design-system/src/charts/RingProgress.tsx
packages/design-system/src/charts/types.ts
```

**Acceptance criteria:**

- Chart components accept precomputed data, not raw provider payloads.
- `RingProgress` is original Primis visual language, not Apple Activity Rings clone.
- Placeholder charts are acceptable but API shape should be stable.
- Charts support loading/empty states.

**Verification:**

```bash
pnpm --filter @primis/design-system typecheck
```

---

## CU-021 — Add mobile local state and cache foundations

**Commit message:** `mobile: add local state and cache foundations (CU-021)`

**References:** Technical Architecture §4.2, §6.1; UI/UX Spec fast/local-first principles.

**Goal:** Prepare for instant Home rendering.

**Files likely involved:**

```text
apps/mobile/src/state/settingsStore.ts
apps/mobile/src/state/widgetStore.ts
apps/mobile/src/api/queryClient.ts
apps/mobile/src/cache/localDashboardCache.ts
```

**Acceptance criteria:**

- TanStack Query provider configured.
- Local settings store supports theme, accent, coach style, summary style placeholders.
- Widget order/hide state can be stored locally.
- No health values are stored insecurely yet.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-022 — Add typed API client shell

**Commit message:** `mobile: add typed API client shell (CU-022)`

**References:** Technical Architecture API boundaries; API contract package.

**Goal:** Centralize mobile API calls.

**Files likely involved:**

```text
apps/mobile/src/api/client.ts
apps/mobile/src/api/errors.ts
apps/mobile/src/api/endpoints.ts
```

**Acceptance criteria:**

- API base URL comes from public app config, not hardcoded.
- API errors map to contract error schema.
- Supports auth token injection later.
- Includes mock mode toggle for local UI work.

**Verification:**

```bash
pnpm --filter @primis/mobile test
```

---

## CU-023 — Add mock dashboard data provider

**Commit message:** `mobile: add mock health dashboard data provider (CU-023)`

**References:** PRD Home requirements; UI/UX Spec §6.1; Scoring Spec DTOs.

**Goal:** Allow high-quality UI work before real backend data.

**Files likely involved:**

```text
apps/mobile/src/mocks/dashboard.ts
apps/mobile/src/mocks/sleep.ts
apps/mobile/src/mocks/recovery.ts
apps/mobile/src/mocks/activity.ts
apps/mobile/src/mocks/ai.ts
```

**Acceptance criteria:**

- Mock data conforms to shared DTO schemas.
- Includes normal, low recovery, stale data, and missing data states.
- Mock mode is clearly marked development-only.

**Verification:**

```bash
pnpm --filter @primis/mobile test
```

---

# Phase D — Backend Local Foundation and Database

## CU-024 — Add backend API service skeleton

**Commit message:** `api: add Lambda API service skeleton (CU-024)`

**References:** Technical Architecture §6.2, §7, §9.

**Goal:** Create local-runnable API service with structured responses.

**Files likely involved:**

```text
services/api/package.json
services/api/src/app.ts
services/api/src/handler.ts
services/api/src/routes/health.ts
services/api/src/middleware/errorHandler.ts
services/api/src/middleware/requestId.ts
```

**Acceptance criteria:**

- `/health` returns app version/env/request ID.
- Structured error handling uses API contracts.
- Lambda handler exists but can also run locally.
- No AWS deploy required.

**Verification:**

```bash
pnpm --filter @primis/api test
pnpm --filter @primis/api typecheck
```

---

## CU-025 — Add local Docker Postgres setup

**Commit message:** `db: add local Postgres development setup (CU-025)`

**References:** Data Model §4; Technical Architecture §6.2.

**Goal:** Provide reliable local database for migrations/tests.

**Files likely involved:**

```text
docker-compose.yml
database/README.md
scripts/db-up.sh
scripts/db-reset.sh
.env.example
```

**Acceptance criteria:**

- `docker compose up db` starts Postgres.
- `.env.example` documents local DB URL.
- Reset script clearly marked destructive.
- No production credentials.

**Verification:**

```bash
docker compose config
```

---

## CU-026 — Add SQL migration framework and Kysely DB layer

**Commit message:** `db: add SQL migrations and typed query layer (CU-026)`

**References:** Data Model §4.2, §5.

**Goal:** Establish database migration and query pattern.

**Files likely involved:**

```text
database/migrations/000001_init.sql
services/api/src/db/client.ts
services/api/src/db/types.ts
scripts/db-migrate.ts
package.json
```

**Acceptance criteria:**

- `pnpm db:migrate` runs against local DB.
- API can connect to DB.
- Query layer does not hardcode credentials.
- Migration history table exists.

**Verification:**

```bash
pnpm db:migrate
pnpm --filter @primis/api test
```

---

## CU-027 — Implement identity, preferences, and consent tables

**Commit message:** `db: add identity preferences and consent schema (CU-027)`

**References:** Data Model §7; PRD auth/onboarding requirements.

**Goal:** Add the first user-owned schema tables.

**Files likely involved:**

```text
database/migrations/000002_identity_preferences.sql
services/api/src/repositories/userRepository.ts
services/api/src/repositories/preferencesRepository.ts
```

**Acceptance criteria:**

- Creates users, auth identities, user goals, coach preferences, nutrition philosophy preferences, consent records, data retention preferences.
- Includes indexes and foreign keys.
- Repository tests create/read/update rows.

**Verification:**

```bash
pnpm db:migrate
pnpm --filter @primis/api test
```

---

## CU-028 — Implement provider connection and sync tables

**Commit message:** `db: add provider connection and sync schema (CU-028)`

**References:** Data Model §8; Technical Architecture §10.

**Goal:** Store provider connection metadata, sync jobs, cursors, availability, raw payload metadata.

**Files likely involved:**

```text
database/migrations/000003_provider_sync.sql
services/api/src/repositories/providerRepository.ts
services/api/src/repositories/syncRepository.ts
```

**Acceptance criteria:**

- Tables: provider_connections, provider_data_availability, provider_metric_mappings, provider_sync_jobs, provider_sync_cursors, raw_provider_payloads.
- Tokens are stored as secret references only.
- Repository tests cover connection creation and sync job lifecycle.

**Verification:**

```bash
pnpm db:migrate
pnpm --filter @primis/api test
```

---

## CU-029 — Implement metric registry and observation tables

**Commit message:** `db: add metric registry and observation schema (CU-029)`

**References:** Data Model §9-10.

**Goal:** Add canonical metrics storage.

**Files likely involved:**

```text
database/migrations/000004_metrics.sql
database/seeds/metric_definitions.json
services/api/src/repositories/metricRepository.ts
```

**Acceptance criteria:**

- Tables: metric_definitions, metric_observations, metric_timeseries_samples.
- Metric definitions seed from `packages/health-metrics` registry.
- Observations support value number/string/bool/json where needed.
- Tests verify idempotent metric upsert.

**Verification:**

```bash
pnpm db:migrate
pnpm db:seed
pnpm --filter @primis/api test
```

---

## CU-030 — Implement daily summary, baseline, and domain tables

**Commit message:** `db: add health domain summary schema (CU-030)`

**References:** Data Model sleep/workout/vitals/body composition/manual/nutrition sections.

**Goal:** Add queryable domain-specific tables needed for scoring and UI.

**Files likely involved:**

```text
database/migrations/000005_domain_tables.sql
services/api/src/repositories/sleepRepository.ts
services/api/src/repositories/activityRepository.ts
services/api/src/repositories/manualInputRepository.ts
services/api/src/repositories/nutritionRepository.ts
```

**Acceptance criteria:**

- Includes daily_metric_summaries, rolling_metric_baselines, sleep_sessions, sleep_stage_intervals, sleep_daily_features, workout_sessions, training_load_daily, vital_daily_features, body_composition_measurements, manual_checkins, hydration_entries, caffeine_entries, alcohol_entries, bowel_entries, nutrition_entries, nutrition_entry_items, daily_nutrition_summaries.
- Repository tests can insert/query representative records.

**Verification:**

```bash
pnpm db:migrate
pnpm --filter @primis/api test
```

---

## CU-031 — Implement score, insight, AI, and dashboard tables

**Commit message:** `db: add score insight ai and dashboard schema (CU-031)`

**References:** Data Model scores/insights/AI/dashboard sections; AI Context Engine §9.

**Goal:** Store computed outputs and UI configuration.

**Files likely involved:**

```text
database/migrations/000006_outputs_and_dashboard.sql
services/api/src/repositories/scoreRepository.ts
services/api/src/repositories/insightRepository.ts
services/api/src/repositories/aiRepository.ts
services/api/src/repositories/dashboardRepository.ts
```

**Acceptance criteria:**

- Tables: score_snapshots, score_component_values, insight_candidates, ai_summaries, ai_conversations, dashboard_widgets, theme_settings.
- Supports querying latest score snapshots by user/date/type.
- Supports querying home widgets in order.
- Tests cover basic reads/writes.

**Verification:**

```bash
pnpm db:migrate
pnpm --filter @primis/api test
```

---

## CU-032 — Add Cognito-aware auth middleware shell

**Commit message:** `api: add Cognito JWT auth middleware shell (CU-032)`

**References:** Technical Architecture §9; PRD auth requirements.

**Goal:** Prepare auth boundary without requiring real Cognito yet.

**Files likely involved:**

```text
services/api/src/auth/authMiddleware.ts
services/api/src/auth/cognitoJwtVerifier.ts
services/api/src/auth/mockAuth.ts
services/api/src/routes/me.ts
```

**Acceptance criteria:**

- Local dev can use mock authenticated user only when `ALLOW_MOCK_AUTH=true`.
- Production mode refuses mock auth.
- Middleware attaches internal user context to request.
- `/me` returns bootstrapped user profile.

**Verification:**

```bash
pnpm --filter @primis/api test
```

---

## CU-033 — Add user bootstrap and onboarding API endpoints

**Commit message:** `api: add user bootstrap and onboarding endpoints (CU-033)`

**References:** PRD onboarding; Data Model §7; UI/UX onboarding.

**Goal:** Let mobile create/update basic user preferences.

**Files likely involved:**

```text
services/api/src/routes/user.ts
services/api/src/routes/onboarding.ts
packages/api-contracts/src/user.ts
packages/api-contracts/src/onboarding.ts
```

**Acceptance criteria:**

- Endpoint bootstraps user row from auth identity.
- Supports goals ranking, coach style, summary style, nutrition philosophy, theme preference.
- Uses Zod validation.
- Tests cover happy path and invalid input.

**Verification:**

```bash
pnpm --filter @primis/api test
pnpm --filter @primis/api-contracts test
```

---

# Phase E — Provider Validation and Sync Infrastructure

## CU-034 — Create Google Health availability matrix scaffold

**Commit message:** `docs: add Google Health availability matrix scaffold (CU-034)`

**References:** MVP Build Plan §7; Technical Architecture §10.3; PRD technical validation spike.

**Goal:** Create the exact validation artifact that will later be filled manually with live data.

**Files likely involved:**

```text
docs/decisions/google-health-api-metric-availability.md
scripts/google-health-spike/README.md
```

**Acceptance criteria:**

- Matrix includes metric, Google data type, scope, operation, availability, sample fixture path, notes.
- Each planned core metric has row.
- Provider scores are explicitly marked `unverified` until tested.
- Document states real validation occurs in Phase Z.

**Verification:**

```bash
pnpm format:check
```

---

## CU-035 — Add provider connector interface package

**Commit message:** `providers: add health provider connector interface (CU-035)`

**References:** Technical Architecture §10.1; Data Model provider sections.

**Goal:** Ensure all providers follow the same architecture.

**Files likely involved:**

```text
services/workers/src/providers/HealthProviderConnector.ts
services/workers/src/providers/types.ts
packages/core-types/src/providers.ts
```

**Acceptance criteria:**

- Interface includes authorizeUrl, exchangeCode, refreshConnection, syncWindow, revokeConnection, getCapabilities/listCapabilities.
- Provider result types include raw payloads, normalized records, availability updates, cursors.
- No Google-specific assumptions in interface.

**Verification:**

```bash
pnpm --filter @primis/workers typecheck
```

---

## CU-036 — Add local raw payload storage abstraction

**Commit message:** `storage: add raw payload archive abstraction (CU-036)`

**References:** Technical Architecture §10.3; Data Model §8.7.

**Goal:** Support local and future S3 raw payload archival through a common interface.

**Files likely involved:**

```text
services/workers/src/storage/RawPayloadArchive.ts
services/workers/src/storage/LocalRawPayloadArchive.ts
services/workers/src/storage/S3RawPayloadArchive.ts
```

**Acceptance criteria:**

- Local implementation writes gzip JSON to `database/fixtures/generated/raw/` or temp path.
- S3 implementation shell exists but does not require real AWS credentials in tests.
- Metadata includes content SHA-256, record count, provider, data type, window.
- Tests verify local archive and redaction checks.

**Verification:**

```bash
pnpm --filter @primis/workers test
```

---

## CU-037 — Add Google Health connector OAuth skeleton

**Commit message:** `providers: add Google Health OAuth connector skeleton (CU-037)`

**References:** PRD Google Health requirements; Technical Architecture §10.3.

**Goal:** Implement the shape of Google authorization without real credentials.

**Files likely involved:**

```text
services/workers/src/providers/google/GoogleHealthConnector.ts
services/api/src/routes/providerConnections.ts
packages/api-contracts/src/providerConnections.ts
```

**Acceptance criteria:**

- API endpoint can request Google authorization URL using placeholder config.
- Callback endpoint validates state and exchanges code through an adapter interface.
- Real token exchange is behind injectable client and mocked in tests.
- Google login vs Google Health authorization separation is explicit.

**Verification:**

```bash
pnpm --filter @primis/api test
pnpm --filter @primis/workers test
```

---

## CU-038 — Add provider token secret reference adapter

**Commit message:** `security: add provider token secret reference adapter (CU-038)`

**References:** Technical Architecture security/Secrets Manager; Data Model provider_connections.

**Goal:** Never store provider tokens directly in normal DB columns.

**Files likely involved:**

```text
services/api/src/security/SecretStore.ts
services/api/src/security/LocalSecretStore.ts
services/api/src/security/AwsSecretsManagerStore.ts
services/workers/src/security/SecretStore.ts
```

**Acceptance criteria:**

- Local secret store is test-only/dev-only.
- AWS Secrets Manager adapter is implemented behind interface with no live dependency in tests.
- Provider connection stores secret refs only.
- Tests ensure raw tokens are not returned by repository methods.

**Verification:**

```bash
pnpm --filter @primis/api test
```

---

## CU-039 — Add Google Health API client wrappers

**Commit message:** `providers: add Google Health API client wrappers (CU-039)`

**References:** Technical Architecture §10.3; Google Health docs linked in source docs.

**Goal:** Define wrappers for target data operations without embedding product logic.

**Files likely involved:**

```text
services/workers/src/providers/google/GoogleHealthApiClient.ts
services/workers/src/providers/google/dataTypes.ts
services/workers/src/providers/google/operations.ts
```

**Acceptance criteria:**

- Client supports date-windowed calls for target data types via injected fetch function.
- Handles pagination/reconcile/list/dailyRollup abstraction where applicable.
- Handles 401/403/429/5xx with typed provider errors.
- Tests use mocked HTTP responses.

**Verification:**

```bash
pnpm --filter @primis/workers test
```

---

## CU-040 — Add Google Health spike script using mocked and live modes

**Commit message:** `providers: add Google Health spike script scaffold (CU-040)`

**References:** MVP Build Plan §7.4-7.7.

**Goal:** Create a script that can later run with real credentials but works in mock mode now.

**Files likely involved:**

```text
scripts/google-health-spike/index.ts
scripts/google-health-spike/config.ts
scripts/google-health-spike/report.ts
scripts/google-health-spike/README.md
```

**Acceptance criteria:**

- Mock mode reads fixture responses and produces availability report.
- Live mode requires env vars and exits clearly if missing.
- Script redacts payloads before saving.
- No credentials are committed.

**Verification:**

```bash
pnpm tsx scripts/google-health-spike/index.ts --mode mock
```

---

## CU-041 — Add normalization pipeline core

**Commit message:** `ingestion: add normalized health record pipeline (CU-041)`

**References:** Data Model layered model; Technical Architecture provider independence.

**Goal:** Convert provider records into canonical domain records.

**Files likely involved:**

```text
services/workers/src/normalization/NormalizedRecord.ts
services/workers/src/normalization/normalizeMetricObservation.ts
services/workers/src/normalization/normalizationErrors.ts
```

**Acceptance criteria:**

- Defines canonical normalized record variants: metric observation, sleep session, sleep stage, workout session, body composition, nutrition/manual where applicable.
- Includes source metadata and data quality metadata.
- Unit conversion applied at normalization boundaries.
- Tests cover sample conversions.

**Verification:**

```bash
pnpm --filter @primis/workers test
```

---

## CU-042 — Add Google activity/vitals normalizers

**Commit message:** `ingestion: add Google activity and vitals normalizers (CU-042)`

**References:** Data Model metric registry; MVP metric availability list.

**Goal:** Normalize steps, calories, floors, HR, HRV, RHR, SpO2, respiratory rate, VO2 max.

**Files likely involved:**

```text
services/workers/src/providers/google/normalizers/activity.ts
services/workers/src/providers/google/normalizers/vitals.ts
services/workers/test/fixtures/google/*.json
```

**Acceptance criteria:**

- Uses canonical metric codes.
- Handles missing values without crash.
- Produces local_date/timezone where possible.
- Tests use redacted fixtures.

**Verification:**

```bash
pnpm --filter @primis/workers test
```

---

## CU-043 — Add Google sleep and workout normalizers

**Commit message:** `ingestion: add Google sleep and workout normalizers (CU-043)`

**References:** Data Model sleep/workout tables; Scoring Spec sleep inputs.

**Goal:** Normalize sleep sessions/stages and exercise/workout sessions.

**Files likely involved:**

```text
services/workers/src/providers/google/normalizers/sleep.ts
services/workers/src/providers/google/normalizers/workout.ts
services/workers/test/normalizers/googleSleep.test.ts
services/workers/test/normalizers/googleWorkout.test.ts
```

**Acceptance criteria:**

- Sleep crossing midnight uses wake date for `local_date`.
- Stage segments are stored when available.
- Workout sessions include duration, type, energy, distance, HR zones when available.
- Tests cover missing stages and partial workouts.

**Verification:**

```bash
pnpm --filter @primis/workers test
```

---

## CU-044 — Add idempotent normalized record writer

**Commit message:** `ingestion: add idempotent normalized record writer (CU-044)`

**References:** Technical Architecture idempotent processing; Data Model tables.

**Goal:** Write normalized records without duplicates.

**Files likely involved:**

```text
services/workers/src/normalization/writeNormalizedRecords.ts
services/workers/src/repositories/normalizedRecordWriter.ts
services/workers/test/writeNormalizedRecords.test.ts
```

**Acceptance criteria:**

- Upserts by user/provider/source_record_id/metric/time keys.
- Handles retries safely.
- Updates provider_data_availability.
- Enqueues affected user/date pairs for summaries/scoring through interface.

**Verification:**

```bash
pnpm --filter @primis/workers test
```

---

## CU-045 — Add local sync job runner

**Commit message:** `sync: add local provider sync job runner (CU-045)`

**References:** Technical Architecture §10.3.3; MVP Build Plan M4.

**Goal:** Execute provider sync jobs locally before SQS/EventBridge exists.

**Files likely involved:**

```text
services/workers/src/sync/SyncJobRunner.ts
services/workers/src/sync/syncJobRepository.ts
services/workers/src/sync/localRunner.ts
```

**Acceptance criteria:**

- Can run mocked Google sync for a date window.
- Creates provider_sync_job row.
- Archives raw payload metadata.
- Writes normalized records.
- Marks success/partial/failure with errors.

**Verification:**

```bash
pnpm --filter @primis/workers test
```

---

## CU-046 — Add provider connection and sync API endpoints

**Commit message:** `api: add provider connection and sync endpoints (CU-046)`

**References:** PRD Google Health sync; Technical Architecture provider flow.

**Goal:** Expose backend endpoints for mobile provider connection flows.

**Files likely involved:**

```text
services/api/src/routes/providerConnections.ts
services/api/src/routes/sync.ts
packages/api-contracts/src/providerConnections.ts
packages/api-contracts/src/sync.ts
```

**Acceptance criteria:**

- Endpoints: list connections, start Google authorization, callback, disconnect, sync status, manual refresh.
- Manual refresh enqueues/creates local sync job placeholder.
- No raw tokens returned.
- Tests cover auth and validation.

**Verification:**

```bash
pnpm --filter @primis/api test
```

---

# Phase F — Summary, Baseline, Scoring, and Bedtime Engine

## CU-047 — Add scoring package primitives

**Commit message:** `scoring: add core scoring primitives (CU-047)`

**References:** Scoring Spec §7-9.

**Goal:** Implement reusable deterministic primitives.

**Files likely involved:**

```text
packages/scoring/src/primitives/clamp.ts
packages/scoring/src/primitives/weightedScore.ts
packages/scoring/src/primitives/baseline.ts
packages/scoring/src/primitives/deviation.ts
packages/scoring/test/primitives.test.ts
```

**Acceptance criteria:**

- Implements clamp, weighted score with missing component handling, percent deviation, z-score, EMA, target range score.
- Tests cover edge cases and missing data.
- No DB dependency.

**Verification:**

```bash
pnpm --filter @primis/scoring test
```

---

## CU-048 — Add daily metric summary builder

**Commit message:** `summaries: add daily metric summary builder (CU-048)`

**References:** Data Model daily_metric_summaries; Technical Architecture precompute principle.

**Goal:** Aggregate metric observations into day-level summaries.

**Files likely involved:**

```text
services/workers/src/summaries/buildDailyMetricSummaries.ts
services/workers/test/summaries/dailyMetricSummaries.test.ts
```

**Acceptance criteria:**

- Supports sum, avg, min, max, latest, duration-weighted avg.
- Generates summaries by user/local_date/timezone.
- Re-runnable/idempotent.
- Tests use fixture observations.

**Verification:**

```bash
pnpm --filter @primis/workers test
```

---

## CU-049 — Add rolling baseline builder

**Commit message:** `baselines: add rolling metric baseline builder (CU-049)`

**References:** Scoring Spec §7.3-7.5; Data Model rolling_metric_baselines.

**Goal:** Compute personal baselines for important metrics.

**Files likely involved:**

```text
services/workers/src/baselines/buildRollingBaselines.ts
services/workers/test/baselines/buildRollingBaselines.test.ts
```

**Acceptance criteria:**

- Supports 7, 14, 30, 60, 90 day windows.
- Computes mean, median, min, max, sd, p10/p25/p75/p90, sample count, completeness.
- Stores algorithm version.
- Emits `learning`/`partial` status based on sample thresholds.

**Verification:**

```bash
pnpm --filter @primis/workers test
```

---

## CU-050 — Add Sleep Score engine

**Commit message:** `scoring: implement Sleep Score engine (CU-050)`

**References:** Scoring Spec §10; Data Model sleep tables; UI/UX Sleep screen.

**Goal:** Compute explainable Sleep Score from canonical inputs.

**Files likely involved:**

```text
packages/scoring/src/sleep/sleepScore.ts
packages/scoring/src/sleep/sleepComponents.ts
packages/scoring/test/sleepScore.test.ts
```

**Acceptance criteria:**

- Computes duration, efficiency, consistency, stage balance, overnight recovery signals, debt impact components where available.
- Handles missing stages with lower confidence.
- Missing sleep duration yields missing_required_data.
- Returns component values and top reasons.
- Algorithm version included.

**Verification:**

```bash
pnpm --filter @primis/scoring test
```

---

## CU-051 — Add sleep debt and sleep consistency engines

**Commit message:** `scoring: add sleep debt and consistency engines (CU-051)`

**References:** Scoring Spec §11; Bedtime Planner requirements.

**Goal:** Support sleep screens and bedtime planner.

**Files likely involved:**

```text
packages/scoring/src/sleep/sleepDebt.ts
packages/scoring/src/sleep/sleepConsistency.ts
packages/scoring/test/sleepDebt.test.ts
packages/scoring/test/sleepConsistency.test.ts
```

**Acceptance criteria:**

- Rolling sleep debt uses decayed deficits.
- Consistency uses circular time math.
- Handles sleep crossing midnight.
- Tests cover normal, inconsistent, and sparse data.

**Verification:**

```bash
pnpm --filter @primis/scoring test
```

---

## CU-052 — Add Recovery Score engine

**Commit message:** `scoring: implement Recovery Score engine (CU-052)`

**References:** Scoring Spec §12; PRD Recovery requirements.

**Goal:** Compute objective-heavy recovery score.

**Files likely involved:**

```text
packages/scoring/src/recovery/recoveryScore.ts
packages/scoring/src/recovery/recoveryComponents.ts
packages/scoring/test/recoveryScore.test.ts
```

**Acceptance criteria:**

- Components: HRV vs baseline, RHR vs baseline, sleep score, sleep debt, respiratory stability, SpO2 stability, training load context, subjective modifier.
- Manual input modifier is light and bounded.
- Outputs recommended intensity band.
- Missing HRV/RHR handled with confidence degradation.
- Uses performance-only language metadata, not medical claims.

**Verification:**

```bash
pnpm --filter @primis/scoring test
```

---

## CU-053 — Add activity, strain, and training readiness engines

**Commit message:** `scoring: add activity strain and readiness engines (CU-053)`

**References:** Scoring Spec activity/readiness/load sections; UI/UX Activity/Recovery.

**Goal:** Compute daily activity score, training load, and readiness.

**Files likely involved:**

```text
packages/scoring/src/activity/activityScore.ts
packages/scoring/src/training/trainingLoad.ts
packages/scoring/src/training/trainingReadiness.ts
packages/scoring/test/trainingReadiness.test.ts
```

**Acceptance criteria:**

- Activity uses steps, active calories, zone minutes, floors/distance where available.
- Training load supports 7-day vs 28-day style comparison when enough history exists.
- Readiness combines recovery, sleep debt, load, soreness/fatigue, goal context.
- Handles not-enough-data states.

**Verification:**

```bash
pnpm --filter @primis/scoring test
```

---

## CU-054 — Add Bedtime Planner deterministic engine

**Commit message:** `scoring: implement Bedtime Planner engine (CU-054)`

**References:** Scoring Spec bedtime planner; PRD bedtime feature; UI/UX §6.3.

**Goal:** Generate ranked bedtime windows from wake time and sleep history.

**Files likely involved:**

```text
packages/scoring/src/bedtime/bedtimePlanner.ts
packages/scoring/src/bedtime/circadian.ts
packages/scoring/test/bedtimePlanner.test.ts
```

**Acceptance criteria:**

- Inputs: target wake time, sleep latency, personal sleep need, sleep debt, recent bedtime/wake rhythm, recovery need, next-day context.
- Outputs ranked windows: best, good, last acceptable.
- Uses windows, not exact fake precision.
- Includes confidence and explanation fields.
- Does not rely on AI.

**Verification:**

```bash
pnpm --filter @primis/scoring test
```

---

## CU-055 — Add score snapshot worker

**Commit message:** `scoring: add score snapshot worker (CU-055)`

**References:** Technical Architecture precompute principle; Data Model score tables.

**Goal:** Persist score outputs for fast API/mobile reads.

**Files likely involved:**

```text
services/workers/src/scoring/runDailyScoring.ts
services/workers/src/scoring/scoreSnapshotWriter.ts
services/workers/test/scoring/runDailyScoring.test.ts
```

**Acceptance criteria:**

- For affected user/date, computes daily summaries, baselines, scores, and component values.
- Writes score_snapshots and score_component_values idempotently.
- Emits insight candidates for major drivers.
- Handles provisional/missing states.

**Verification:**

```bash
pnpm --filter @primis/workers test
```

---

## CU-056 — Add dashboard summary API endpoints

**Commit message:** `api: add dashboard summary endpoints (CU-056)`

**References:** PRD Home; UI/UX Home; Data Model dashboard widgets.

**Goal:** Serve precomputed data to mobile.

**Files likely involved:**

```text
services/api/src/routes/dashboard.ts
packages/api-contracts/src/dashboard.ts
```

**Acceptance criteria:**

- Endpoint returns home dashboard summary for latest local date.
- Includes score snapshots, data freshness, widget order, headline insights.
- No heavy score computation in request handler.
- Tests cover cached/missing/stale data states.

**Verification:**

```bash
pnpm --filter @primis/api test
```

---

## CU-057 — Add Sleep/Recovery/Activity detail APIs

**Commit message:** `api: add health detail endpoints (CU-057)`

**References:** PRD Sleep/Recovery/Activity; UI/UX screens.

**Goal:** Provide detail data for core screens.

**Files likely involved:**

```text
services/api/src/routes/sleep.ts
services/api/src/routes/recovery.ts
services/api/src/routes/activity.ts
services/api/src/routes/vitals.ts
packages/api-contracts/src/sleep.ts
packages/api-contracts/src/recovery.ts
packages/api-contracts/src/activity.ts
packages/api-contracts/src/vitals.ts
```

**Acceptance criteria:**

- APIs return chart-ready data, not raw provider dumps.
- Detail responses include explanation-ready components and missing data.
- Tests cover normal/provisional/stale states.

**Verification:**

```bash
pnpm --filter @primis/api test
```

---

# Phase G — Core App Surfaces

## CU-058 — Implement onboarding UI shell

**Commit message:** `mobile: add onboarding shell and preferences flow (CU-058)`

**References:** PRD §9.1; UI/UX Onboarding §7.

**Goal:** Create first-run flow without live auth requirements.

**Files likely involved:**

```text
apps/mobile/app/onboarding/*
apps/mobile/src/features/onboarding/*
```

**Acceptance criteria:**

- Screens: welcome, account placeholder, goals ranking, coach style, summary style, theme/accent, connect Google placeholder.
- Saves preferences locally/mock API.
- Explains Google login vs Google Health authorization separation.
- Uses design tokens.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-059 — Implement auth UI shell

**Commit message:** `mobile: add auth UI shell (CU-059)`

**References:** PRD auth requirements; Technical Architecture auth.

**Goal:** Create sign-in/sign-up UI and auth state handling with mock provider.

**Files likely involved:**

```text
apps/mobile/src/features/auth/*
apps/mobile/app/auth/*
```

**Acceptance criteria:**

- UI supports email/password, Google, Apple, Facebook buttons as planned.
- Buttons use placeholder handlers until Phase Z credentials.
- Auth state can use mock token in dev.
- No real OAuth credentials in code.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-060 — Implement provider connection UI

**Commit message:** `mobile: add health connection UI (CU-060)`

**References:** PRD Google Health; UI/UX permission UX.

**Goal:** Let user see Google Health connection state and start connection later.

**Files likely involved:**

```text
apps/mobile/src/features/connections/*
apps/mobile/app/settings/connections.tsx
```

**Acceptance criteria:**

- Shows Google Health as primary connection.
- Shows status: disconnected, connecting, active, stale, needs reauth, unavailable.
- Explains health data permissions and freshness.
- Can call provider authorization endpoint in mock mode.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-061 — Implement local-first Home dashboard

**Commit message:** `mobile: implement local-first Home dashboard (CU-061)`

**References:** PRD Home; UI/UX §6.1; Technical Architecture local-first performance.

**Goal:** Create the daily command center.

**Files likely involved:**

```text
apps/mobile/app/(tabs)/index.tsx
apps/mobile/src/features/home/HomeScreen.tsx
apps/mobile/src/features/home/widgets/*
```

**Acceptance criteria:**

- Renders cached/mock data instantly.
- Default cards: Recovery, Sleep Score, Sleep Debt, Steps, Calories, Training Readiness, HRV Trend, Today’s Recommendation.
- Shows data freshness indicator.
- Each card has tap target for details.
- No live AI call required for rendering.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
pnpm --filter @primis/mobile test
```

---

## CU-062 — Implement home widget customization

**Commit message:** `mobile: add Home widget customization (CU-062)`

**References:** PRD customization; UI/UX Home.

**Goal:** Allow show/hide/reorder Home widgets.

**Files likely involved:**

```text
apps/mobile/src/features/home/EditHomeScreen.tsx
apps/mobile/src/state/widgetStore.ts
apps/mobile/app/settings/home-widgets.tsx
```

**Acceptance criteria:**

- User can toggle widget visibility.
- User can reorder widgets through a simple list UI.
- Local state persists across app restarts.
- No custom bottom-tab reordering in v1.

**Verification:**

```bash
pnpm --filter @primis/mobile test
```

---

## CU-063 — Implement Sleep screen

**Commit message:** `mobile: implement Sleep screen (CU-063)`

**References:** PRD Sleep; UI/UX §6.2; Scoring Spec Sleep Score.

**Goal:** Build the premium Sleep screen from detail API/mock data.

**Files likely involved:**

```text
apps/mobile/app/(tabs)/sleep.tsx
apps/mobile/src/features/sleep/SleepScreen.tsx
apps/mobile/src/features/sleep/components/*
```

**Acceptance criteria:**

- Shows Sleep Score, duration, debt, consistency, stages if available, contributors, AI summary placeholder.
- Stage timeline handles missing stages.
- Component breakdown is tappable/expandable.
- Bedtime Planner entry point is visible.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-064 — Implement Bedtime Planner screen

**Commit message:** `mobile: implement Bedtime Planner screen (CU-064)`

**References:** PRD bedtime feature; UI/UX §6.3; Scoring Spec bedtime planner.

**Goal:** Expose the bedtime recommendation feature.

**Files likely involved:**

```text
apps/mobile/app/sleep/bedtime-planner.tsx
apps/mobile/src/features/bedtime/*
```

**Acceptance criteria:**

- User can select wake time.
- Shows ranked bedtime windows from API/mock deterministic engine output.
- Displays latency adjustment, sleep debt note, circadian consistency note, confidence.
- Uses “window” language, not exact certainty.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-065 — Implement Recovery screen

**Commit message:** `mobile: implement Recovery screen (CU-065)`

**References:** PRD Recovery; UI/UX §6.4; Scoring Spec Recovery.

**Goal:** Build recovery/readiness experience.

**Files likely involved:**

```text
apps/mobile/app/(tabs)/recovery.tsx
apps/mobile/src/features/recovery/*
```

**Acceptance criteria:**

- Shows Recovery Score, Training Readiness, recommended intensity, contributor cards.
- Shows HRV/RHR baseline deviations where available.
- Uses performance-only language.
- Handles provisional/missing data.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-066 — Implement Activity screen

**Commit message:** `mobile: implement Activity screen (CU-066)`

**References:** PRD Activity; UI/UX §6.5; Scoring Spec training load.

**Goal:** Build activity/workout/load view.

**Files likely involved:**

```text
apps/mobile/app/(tabs)/activity.tsx
apps/mobile/src/features/activity/*
```

**Acceptance criteria:**

- Shows steps, active/resting/total calories where available, floors, distance, workouts, zone minutes, training load.
- Shows 7-day vs 28-day load status when available.
- Does not implement workout recording in v1.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-067 — Implement Vitals and Body Composition detail screens

**Commit message:** `mobile: add vitals and body composition details (CU-067)`

**References:** PRD Vitals; UI/UX §6.8; Data Model body composition.

**Goal:** Give access to deeper health metrics.

**Files likely involved:**

```text
apps/mobile/app/vitals/index.tsx
apps/mobile/app/body-composition/index.tsx
apps/mobile/src/features/vitals/*
apps/mobile/src/features/bodyComposition/*
```

**Acceptance criteria:**

- Shows HRV, RHR, SpO2, respiratory rate, VO2 max, weight, body fat, lean mass if available.
- Uses trend-first body composition UI.
- Clearly handles source/staleness.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-068 — Implement score detail and explanation pattern

**Commit message:** `mobile: add reusable score explanation pattern (CU-068)`

**References:** UI/UX explainable screens; Scoring Spec component outputs.

**Goal:** Make every score explainable.

**Files likely involved:**

```text
apps/mobile/src/components/ScoreDetailSheet.tsx
apps/mobile/src/components/ScoreContributorList.tsx
apps/mobile/src/components/EvidenceChip.tsx
```

**Acceptance criteria:**

- Any score card can open a detail view/sheet.
- Shows component weights, values, state, confidence, missing data.
- Uses common UI across Sleep/Recovery/Readiness.
- No AI required to explain deterministic components.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

# Phase H — Manual Inputs and Nutrition v1

## CU-069 — Add manual check-in API and schema

**Commit message:** `manual: add check-in API and schema (CU-069)`

**References:** PRD manual inputs; Data Model manual_checkins; Scoring Spec subjective modifiers.

**Goal:** Store fast daily context.

**Files likely involved:**

```text
packages/api-contracts/src/manualInputs.ts
services/api/src/routes/manualInputs.ts
services/api/src/repositories/manualInputRepository.ts
```

**Acceptance criteria:**

- Supports energy, mood, stress, soreness, fatigue, notes, tags.
- Inputs are optional and quick.
- API validates ranges.
- Tests cover save/update/list by date.

**Verification:**

```bash
pnpm --filter @primis/api test
```

---

## CU-070 — Add hydration, caffeine, and alcohol APIs

**Commit message:** `manual: add hydration caffeine and alcohol APIs (CU-070)`

**References:** PRD nutrition/manual; Data Model hydration/caffeine/alcohol.

**Goal:** Capture high-value lifestyle inputs.

**Files likely involved:**

```text
packages/api-contracts/src/lifestyleLogs.ts
services/api/src/routes/lifestyleLogs.ts
services/api/src/repositories/lifestyleLogRepository.ts
```

**Acceptance criteria:**

- Hydration supports amount/unit.
- Caffeine supports mg, source/type, timestamp/latest time.
- Alcohol supports drink range/count, type, timestamp.
- Tests cover daily summaries.

**Verification:**

```bash
pnpm --filter @primis/api test
```

---

## CU-071 — Add bowel/digestion tracking API

**Commit message:** `manual: add bowel and digestion tracking API (CU-071)`

**References:** PRD poop tracking; Data Model bowel_entries; AI Context gut/digestion.

**Goal:** Support optional structured gut tracking without medical diagnosis.

**Files likely involved:**

```text
packages/api-contracts/src/digestion.ts
services/api/src/routes/digestion.ts
services/api/src/repositories/digestionRepository.ts
```

**Acceptance criteria:**

- Supports Bristol type 1-7, color, smell, urgency, pain, bloating, notes.
- Optional; no daily nagging.
- Uses trend/correlation framing only.
- Tests validate enums and ranges.

**Verification:**

```bash
pnpm --filter @primis/api test
```

---

## CU-072 — Add manual macro nutrition API

**Commit message:** `nutrition: add manual macro logging API (CU-072)`

**References:** PRD Nutrition v1; Data Model nutrition_entries; MVP Build Plan nutrition constraints.

**Goal:** Support basic calories/protein/carbs/fat before full food database.

**Files likely involved:**

```text
packages/api-contracts/src/nutrition.ts
services/api/src/routes/nutrition.ts
services/api/src/repositories/nutritionRepository.ts
```

**Acceptance criteria:**

- Supports calories, protein, carbs, fat, fiber optional, meal timing, note.
- Supports daily nutrition summary.
- Marks entries as manual estimate if applicable.
- Tests cover daily aggregation.

**Verification:**

```bash
pnpm --filter @primis/api test
```

---

## CU-073 — Add custom tags API

**Commit message:** `manual: add custom tags API (CU-073)`

**References:** PRD custom tags; Data Model custom_tags/tag_events.

**Goal:** Let users define events/behaviors for later correlations.

**Files likely involved:**

```text
packages/api-contracts/src/tags.ts
services/api/src/routes/tags.ts
services/api/src/repositories/tagRepository.ts
```

**Acceptance criteria:**

- User can create custom tag definitions.
- User can log tag event with timestamp/date/note.
- Tags are user-owned.
- Tests cover duplicate names and event logging.

**Verification:**

```bash
pnpm --filter @primis/api test
```

---

## CU-074 — Implement mobile quick-add/check-in UI

**Commit message:** `mobile: add quick check-in and lifestyle logging UI (CU-074)`

**References:** UI/UX Nutrition/manual inputs; PRD manual input journey.

**Goal:** Make manual logging fast and optional.

**Files likely involved:**

```text
apps/mobile/src/features/checkin/*
apps/mobile/src/features/nutrition/QuickAdd.tsx
apps/mobile/app/check-in.tsx
```

**Acceptance criteria:**

- User can log energy, mood, stress, soreness within seconds.
- Quick add for water, caffeine, alcohol, macros.
- Bowel tracking is accessible but not prominent/nagging.
- Uses optional fields and does not shame missing logs.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-075 — Implement Nutrition tab v1

**Commit message:** `mobile: implement Nutrition v1 tab (CU-075)`

**References:** UI/UX §6.6; PRD Nutrition.

**Goal:** Provide basic performance nutrition dashboard.

**Files likely involved:**

```text
apps/mobile/app/(tabs)/nutrition.tsx
apps/mobile/src/features/nutrition/NutritionScreen.tsx
```

**Acceptance criteria:**

- Shows calories, protein, carbs, fat, hydration, caffeine, alcohol, meal timing.
- Provides Quick Add actions.
- Clearly marks manual estimates.
- No full FoodData Central search yet.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

# Phase I — AI Context Engine and AI Coach

## CU-076 — Add AI gateway provider abstraction

**Commit message:** `ai: add AI gateway provider abstraction (CU-076)`

**References:** AI Context Engine §3-4; Technical Architecture AI gateway.

**Goal:** Route all AI calls through backend adapters.

**Files likely involved:**

```text
services/ai/src/AiGateway.ts
services/ai/src/providers/MockAiProvider.ts
services/ai/src/providers/OpenAiProvider.ts
services/ai/src/providers/AnthropicProvider.ts
services/ai/src/types.ts
```

**Acceptance criteria:**

- Product services call `AiGateway`, not provider SDKs directly.
- Mock provider works in tests without keys.
- OpenAI/Anthropic adapters use env config but fail gracefully if missing.
- No AI keys in mobile.

**Verification:**

```bash
pnpm --filter @primis/ai test
```

---

## CU-077 — Add intent classifier skeleton

**Commit message:** `ai: add intent classifier skeleton (CU-077)`

**References:** AI Context Engine §7.

**Goal:** Classify AI requests into context domains.

**Files likely involved:**

```text
services/ai/src/intent/IntentClassifier.ts
services/ai/src/intent/rules.ts
services/ai/test/intentClassifier.test.ts
```

**Acceptance criteria:**

- Rule-based classifier handles sleep, recovery, training, nutrition, hydration/caffeine/alcohol, bedtime, body composition, gut, weekly review, app help, unsupported medical request.
- Returns required context domains and missing slots.
- Tests cover common prompts.

**Verification:**

```bash
pnpm --filter @primis/ai test
```

---

## CU-078 — Add base AI context packet schemas

**Commit message:** `ai: add AI context packet schemas (CU-078)`

**References:** AI Context Engine §9.

**Goal:** Define structured context format used by all AI calls.

**Files likely involved:**

```text
packages/api-contracts/src/aiContext.ts
services/ai/src/context/AiContextPacket.ts
services/ai/test/aiContextPacket.test.ts
```

**Acceptance criteria:**

- Includes packet version, user hash, intent, time range, user profile, safety, data availability, domains, evidence, payload, output contract.
- Evidence schema supports metrics, scores, trends, manual inputs, bedtime recommendations.
- Zod validation tests pass.

**Verification:**

```bash
pnpm --filter @primis/ai test
pnpm --filter @primis/api-contracts test
```

---

## CU-079 — Add profile, score, baseline context builders

**Commit message:** `ai: add profile score and baseline context builders (CU-079)`

**References:** AI Context Engine §10; Data Model users/scores/baselines.

**Goal:** Build the first AI evidence packets from structured data.

**Files likely involved:**

```text
services/ai/src/context/builders/ProfileContextBuilder.ts
services/ai/src/context/builders/ScoreContextBuilder.ts
services/ai/src/context/builders/BaselineContextBuilder.ts
```

**Acceptance criteria:**

- Builders do not query raw provider payloads.
- Builders produce evidence objects with confidence.
- Missing data limitations are explicit.
- Tests use DB fixtures/mocks.

**Verification:**

```bash
pnpm --filter @primis/ai test
```

---

## CU-080 — Add domain context builders

**Commit message:** `ai: add sleep recovery training nutrition bedtime context builders (CU-080)`

**References:** AI Context Engine §8-10; Scoring Spec layers.

**Goal:** Support real health questions.

**Files likely involved:**

```text
services/ai/src/context/builders/SleepContextBuilder.ts
services/ai/src/context/builders/RecoveryContextBuilder.ts
services/ai/src/context/builders/TrainingContextBuilder.ts
services/ai/src/context/builders/NutritionContextBuilder.ts
services/ai/src/context/builders/BedtimeContextBuilder.ts
services/ai/src/context/builders/ManualInputContextBuilder.ts
```

**Acceptance criteria:**

- Each builder returns compact task-relevant context.
- No unbounded raw time-series data by default.
- Bedtime builder includes ranked windows and caveat against fake precision.
- Nutrition estimates are marked as estimates.

**Verification:**

```bash
pnpm --filter @primis/ai test
```

---

## CU-081 — Add prompt composer and safety policy engine

**Commit message:** `ai: add prompt composer and safety policy engine (CU-081)`

**References:** AI Context Engine safety; PRD performance-only language.

**Goal:** Make AI output grounded and safe.

**Files likely involved:**

```text
services/ai/src/prompts/PromptComposer.ts
services/ai/src/safety/SafetyPolicyEngine.ts
services/ai/src/prompts/templates.ts
services/ai/test/safetyPolicy.test.ts
```

**Acceptance criteria:**

- System prompts enforce performance/wellness-only framing.
- Tone changes phrasing only, not recommendation logic.
- Unsupported medical requests route to safe response pattern.
- Prompt composer includes evidence and required output contract.

**Verification:**

```bash
pnpm --filter @primis/ai test
```

---

## CU-082 — Add AI chat endpoint with streaming support

**Commit message:** `api: add AI coach chat endpoint (CU-082)`

**References:** AI Context Engine §5.2; UI/UX AI Coach.

**Goal:** Expose AI chat to mobile through backend.

**Files likely involved:**

```text
services/api/src/routes/aiChat.ts
services/ai/src/AiRequestController.ts
packages/api-contracts/src/aiChat.ts
```

**Acceptance criteria:**

- Endpoint accepts user message, builds context, routes through AI gateway.
- Supports mock streaming in local mode.
- Stores conversation metadata safely.
- Does not log raw health prompts in general logs.
- Tests cover mock response and unsupported medical request.

**Verification:**

```bash
pnpm --filter @primis/api test
pnpm --filter @primis/ai test
```

---

## CU-083 — Add AI summary generation jobs

**Commit message:** `ai: add cached AI summary generation jobs (CU-083)`

**References:** AI Context Engine sleep/recovery/weekly summaries; Technical Architecture no UI blocking.

**Goal:** Generate cached summaries asynchronously.

**Files likely involved:**

```text
services/workers/src/ai/generateDailySummaries.ts
services/workers/src/ai/generateSleepSummary.ts
services/workers/src/ai/generateRecoverySummary.ts
services/workers/src/ai/generateWeeklyReview.ts
```

**Acceptance criteria:**

- Jobs use AI context engine, not raw data.
- Summaries are cached in ai_summaries.
- UI can read old cached summary if live generation fails.
- Tests use mock AI adapter.

**Verification:**

```bash
pnpm --filter @primis/workers test
```

---

## CU-084 — Implement mobile AI Coach screen

**Commit message:** `mobile: implement AI Coach chat screen (CU-084)`

**References:** UI/UX §6.7; AI Context Engine chat behavior.

**Goal:** Build user-facing AI chat.

**Files likely involved:**

```text
apps/mobile/app/(tabs)/coach.tsx
apps/mobile/src/features/coach/*
```

**Acceptance criteria:**

- Shows suggested prompts.
- Supports streaming/mock streaming.
- Shows evidence/based-on chips where provided.
- Handles missing data follow-up questions.
- Does not expose raw prompts/logs in UI debug.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-085 — Add contextual “Ask AI about this” actions

**Commit message:** `mobile: add contextual AI entry points (CU-085)`

**References:** UI/UX AI; AI Context Engine surfaces.

**Goal:** Connect AI to useful screens without making chat the whole product.

**Files likely involved:**

```text
apps/mobile/src/components/AskAiButton.tsx
apps/mobile/src/features/sleep/*
apps/mobile/src/features/recovery/*
apps/mobile/src/features/activity/*
apps/mobile/src/features/nutrition/*
```

**Acceptance criteria:**

- Sleep/Recovery/Activity/Nutrition detail screens include optional Ask AI action.
- Action opens AI Coach with prefilled context intent.
- Does not trigger AI automatically on screen render.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

# Phase J — Private Beta Quality Hardening

## CU-086 — Add privacy and data controls UI shell

**Commit message:** `mobile: add privacy and data controls UI (CU-086)`

**References:** PRD privacy; Technical Architecture privacy by architecture; MVP Build Plan public readiness.

**Goal:** Make trust features visible before private beta.

**Files likely involved:**

```text
apps/mobile/app/settings/privacy.tsx
apps/mobile/src/features/privacy/*
```

**Acceptance criteria:**

- Shows connected data sources.
- Shows data retention mode placeholder.
- Shows delete account/data placeholder flow.
- Shows AI processing disclosure placeholder.
- No legal final text required yet.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-087 — Add backend deletion workflow skeleton

**Commit message:** `privacy: add user data deletion workflow skeleton (CU-087)`

**References:** Data Model deletion conventions; Technical Architecture security/privacy.

**Goal:** Prepare for account/data deletion before public readiness.

**Files likely involved:**

```text
services/api/src/routes/privacy.ts
services/workers/src/privacy/deleteUserData.ts
docs/runbooks/user-data-deletion.md
```

**Acceptance criteria:**

- Endpoint can request deletion in dev/mock mode.
- Worker skeleton enumerates all user-owned tables and raw S3 prefixes.
- Runbook lists manual verification steps.
- No actual prod destructive behavior until Phase Z/prod config.

**Verification:**

```bash
pnpm --filter @primis/api test
```

---

## CU-088 — Add structured logging and redaction helpers

**Commit message:** `observability: add structured logging and redaction helpers (CU-088)`

**References:** Technical Architecture observability; AI Context Engine log safely.

**Goal:** Prevent accidental health data/secret leaks in logs.

**Files likely involved:**

```text
packages/config/src/logging.ts
services/api/src/observability/logger.ts
services/workers/src/observability/logger.ts
services/ai/src/observability/logger.ts
```

**Acceptance criteria:**

- Logger redacts tokens, emails, provider payloads, raw prompts, health values where marked sensitive.
- Logs include request ID/correlation ID.
- Tests verify redaction.

**Verification:**

```bash
pnpm test
```

---

## CU-089 — Add mobile error tracking and crash boundary scaffold

**Commit message:** `mobile: add error boundary and telemetry scaffold (CU-089)`

**References:** MVP Build Plan private beta hardening; UI/UX performance/trust.

**Goal:** Catch crashes during private beta without logging health values.

**Files likely involved:**

```text
apps/mobile/src/observability/ErrorBoundary.tsx
apps/mobile/src/observability/telemetry.ts
apps/mobile/app/_layout.tsx
```

**Acceptance criteria:**

- Error boundary catches render errors.
- Telemetry adapter can be no-op locally.
- Sentry placeholder config exists but no DSN required yet.
- Health values are not sent as breadcrumbs.

**Verification:**

```bash
pnpm --filter @primis/mobile test
```

---

## CU-090 — Add loading, empty, stale, and missing-data state audit

**Commit message:** `mobile: add missing data and stale state patterns (CU-090)`

**References:** UI/UX trustworthiness; Scoring Spec missing data explicit.

**Goal:** Ensure product does not fake certainty.

**Files likely involved:**

```text
apps/mobile/src/components/DataState.tsx
apps/mobile/src/components/StaleDataBanner.tsx
apps/mobile/src/components/MissingMetricMessage.tsx
apps/mobile/src/features/*
```

**Acceptance criteria:**

- Common components for loading/empty/stale/provisional/missing states.
- Home/Sleep/Recovery/Activity use them.
- Copy is performance-only and clear.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-091 — Add accessibility pass for core components

**Commit message:** `accessibility: audit core mobile components (CU-091)`

**References:** UI/UX accessibility requirements.

**Goal:** Avoid building inaccessible primitives.

**Files likely involved:**

```text
packages/design-system/src/components/*
apps/mobile/src/features/*
docs/runbooks/accessibility-checklist.md
```

**Acceptance criteria:**

- Touch targets large enough.
- Important controls have accessibility labels.
- Color is not the only meaning carrier.
- Reduced motion respected where implemented.
- Checklist created for manual testing.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-092 — Add mobile performance checklist and profiling hooks

**Commit message:** `performance: add mobile performance checklist and hooks (CU-092)`

**References:** UI/UX fast/premium pillars; Technical Architecture local-first performance.

**Goal:** Make performance measurable before private beta.

**Files likely involved:**

```text
apps/mobile/src/performance/useRenderTrace.ts
apps/mobile/src/performance/performanceMarks.ts
docs/runbooks/mobile-performance-checklist.md
```

**Acceptance criteria:**

- Dev-only render tracing available for core screens.
- Checklist includes Home warm load, tab transition, chart render, AI stream, sync refresh.
- No production performance spam.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-093 — Add EAS/TestFlight readiness checklist

**Commit message:** `release: add EAS and TestFlight readiness checklist (CU-093)`

**References:** Technical Architecture Expo/EAS; App Store/TestFlight external docs.

**Goal:** Document the path to iOS private beta without needing credentials yet.

**Files likely involved:**

```text
docs/runbooks/testflight-release.md
apps/mobile/eas.json
```

**Acceptance criteria:**

- Checklist covers Apple Developer account, bundle ID, app identifiers, provisioning, EAS login, build profiles, TestFlight internal testers, app privacy placeholders.
- States that real credentials/setup are Phase Z manual tasks.
- Includes dev/preview/prod build commands.

**Verification:**

```bash
pnpm format:check
```

---

# Phase K — Post-MVP Expansion Stubs

These commits are optional before private beta unless the product feels incomplete. They should be done after P1 core flows are working.

## CU-094 — Add correlation engine skeleton

**Commit message:** `insights: add correlation engine skeleton (CU-094)`

**References:** Scoring Spec correlations; AI Context Engine correlations.

**Goal:** Prepare behavior/outcome correlation analysis without overclaiming.

**Acceptance criteria:**

- Defines correlation snapshot type and service skeleton.
- Supports caffeine/alcohol/water/tags vs sleep/recovery outcomes.
- Enforces minimum sample thresholds and confidence labels.
- Does not claim causation.

**Verification:**

```bash
pnpm --filter @primis/workers test
```

---

## CU-095 — Add FoodData Central schema and import scaffold

**Commit message:** `nutrition: add FoodData Central import scaffold (CU-095)`

**References:** PRD nutrition; Technical Architecture FoodData Central; Data Model food catalog.

**Goal:** Prepare local USDA food catalog import.

**Acceptance criteria:**

- Adds food_items and food_nutrient_values tables if not already staged.
- Import script expects downloaded FDC files path.
- Supports dry-run mode.
- Does not call API in loops for bulk import.

**Verification:**

```bash
pnpm test
```

---

## CU-096 — Add food search API and user foods scaffold

**Commit message:** `nutrition: add food search and user foods scaffold (CU-096)`

**References:** Data Model nutrition; PRD FoodData Central strategy.

**Goal:** Enable future MyFitnessPal-style logging without depending on MyFitnessPal.

**Acceptance criteria:**

- Search endpoint supports global catalog and user foods.
- User-created foods default private.
- Verified/global foods are visually distinguishable in API response.
- Tests use small fixture food catalog.

**Verification:**

```bash
pnpm --filter @primis/api test
```

---

## CU-097 — Add HealthKit integration spike scaffold

**Commit message:** `ios: add HealthKit integration spike scaffold (CU-097)`

**References:** Technical Architecture HealthKit; PRD iOS-first notes.

**Goal:** Prepare iOS local health enrichment without fully shipping it.

**Acceptance criteria:**

- Adds HealthKit provider abstraction on mobile.
- Permission request code is behind feature flag and not active by default.
- Defines planned read types for body composition, weight, HRV, workouts, nutrition where applicable.
- No Android breakage.

**Verification:**

```bash
pnpm --filter @primis/mobile typecheck
```

---

## CU-098 — Add HealthKit upload API scaffold

**Commit message:** `api: add local health batch upload scaffold (CU-098)`

**References:** Technical Architecture HealthKit sync; Data Model provider_connections.

**Goal:** Prepare backend for mobile-local provider uploads.

**Acceptance criteria:**

- Endpoint accepts normalized local-provider batch.
- Requires explicit provider connection/consent.
- Idempotent write path reuses normalized writer.
- Tests use fake HealthKit payload.

**Verification:**

```bash
pnpm --filter @primis/api test
```

---

# Phase Z — Manual Setup, Live Integration, and Private Beta Release

This phase intentionally contains the manual work that an AI coding agent cannot safely or autonomously complete. These are still commit units or runbook steps, but they require Evan to create accounts, retrieve keys, approve OAuth settings, deploy resources, and validate real devices.

## MAN-001 — Create and verify external accounts

**Commit message:** `manual: record external account setup status (MAN-001)`

**Manual actions:**

- Confirm AWS account is ready.
- Confirm Apple Developer Program access.
- Confirm Google Cloud project access.
- Confirm Expo account/EAS access.
- Confirm OpenAI account/API access.
- Confirm Anthropic account/API access if desired.
- Confirm Facebook Developer account if Facebook login is still required.

**Files to update:**

```text
docs/runbooks/manual-setup-status.md
```

**Acceptance criteria:**

- Status doc lists each external account and whether ready.
- No keys/secrets are committed.

---

## MAN-002 — Bootstrap AWS dev environment

**Commit message:** `manual: document AWS dev bootstrap outputs (MAN-002)`

**Manual actions:**

- Configure AWS CLI locally.
- Bootstrap CDK if using CDK.
- Deploy dev stack.
- Create/verify Cognito user pool, API Gateway, Lambda, RDS, S3, SQS, EventBridge, KMS, Secrets Manager.
- Configure AWS Budgets/alerts.

**Files to update:**

```text
docs/runbooks/aws-dev-outputs.md
.env.local.example if endpoint placeholder names change
```

**Acceptance criteria:**

- Dev API endpoint recorded without secrets.
- Cognito IDs recorded if non-sensitive/public config.
- RDS/S3 resource names documented.
- Budget alarm exists.

---

## MAN-003 — Configure Cognito app authentication providers

**Commit message:** `manual: document Cognito social auth configuration (MAN-003)`

**Manual actions:**

- Configure email/password.
- Configure Google sign-in provider.
- Configure Apple sign-in provider.
- Configure Facebook sign-in provider if still required.
- Configure callback/logout URLs.
- Update mobile public config with user pool/client IDs as appropriate.

**Acceptance criteria:**

- Email/password sign-in works in dev.
- Google app auth works in dev.
- Apple sign-in works in iOS dev/preview build or is documented as pending Apple setup.
- Facebook sign-in works or is marked deferred.
- Health authorization remains separate from app auth.

---

## MAN-004 — Configure Google Cloud and Google Health API

**Commit message:** `manual: update Google Health API availability matrix (MAN-004)`

**Manual actions:**

- Enable Google Health API.
- Configure OAuth consent screen for test/dev.
- Add test users.
- Create OAuth client(s).
- Configure redirect URI to dev backend.
- Store Google OAuth client secret in Secrets Manager.
- Run spike script in live mode.
- Save redacted fixtures.
- Update availability matrix.

**Files to update:**

```text
docs/decisions/google-health-api-metric-availability.md
database/fixtures/provider/google_health/redacted/*
```

**Acceptance criteria:**

- Availability matrix marks each metric as available, unavailable, no_data_yet, permission_missing, provider_unverified, or error.
- Provider scores are explicitly validated instead of assumed.
- Sample redacted payloads exist for available target metrics.
- Sync latency observations are documented.

---

## MAN-005 — Configure AI provider keys

**Commit message:** `manual: document AI provider configuration (MAN-005)`

**Manual actions:**

- Add OpenAI API key to Secrets Manager/dev env.
- Add Anthropic API key if desired.
- Configure default model routing.
- Set per-user/day cost guardrails.
- Run AI gateway smoke tests.

**Acceptance criteria:**

- Mock AI still works locally.
- GPT provider works in dev.
- Anthropic provider works or is marked configured-later.
- No model keys are committed.

---

## MAN-006 — Configure mobile app identifiers and EAS credentials

**Commit message:** `manual: record iOS build configuration (MAN-006)`

**Manual actions:**

- Choose final bundle identifier.
- Configure Apple Developer app identifier.
- Configure capabilities needed for current build.
- Configure EAS credentials.
- Set build profiles.
- Confirm Expo Dev Client build works on local device.

**Acceptance criteria:**

- Development build installs on iPhone.
- Preview build can be produced.
- Bundle ID and app display name recorded in runbook.

---

## MAN-007 — Run end-to-end dev smoke test

**Commit message:** `manual: record end-to-end dev smoke test results (MAN-007)`

**Manual actions:**

- Create account.
- Sign in.
- Complete onboarding.
- Connect Google Health.
- Run manual sync.
- Verify provider data availability.
- Generate summaries/baselines/scores.
- Open Home/Sleep/Recovery/Activity/Nutrition/AI Coach.
- Ask AI: “Should I lift today?”
- Use Bedtime Planner with target wake time.
- Log water/caffeine/alcohol/check-in.

**Acceptance criteria:**

- Smoke test runbook records pass/fail per flow.
- Any blocker creates issue/commit unit.
- No fake data remains in real-user dev flow unless clearly marked.

---

## MAN-008 — Submit internal TestFlight build

**Commit message:** `manual: record TestFlight internal build status (MAN-008)`

**Manual actions:**

- Create EAS production/preview build.
- Submit to App Store Connect/TestFlight.
- Add internal testers.
- Verify app installs and opens.
- Verify dev/prod config is not mixed.

**Acceptance criteria:**

- Internal tester can install app.
- App points to correct backend environment.
- No secrets in mobile bundle.
- Crash/error monitoring enabled or explicitly deferred.

---

## MAN-009 — Private beta readiness review

**Commit message:** `manual: complete private beta readiness review (MAN-009)`

**Manual actions:**

- Review security posture.
- Review privacy/data deletion paths.
- Review health disclosure copy.
- Confirm logs are redacted.
- Confirm AI safety language.
- Confirm score provisional/missing states.
- Confirm app performance on iPhone.
- Invite friend/private tester.

**Acceptance criteria:**

- Private beta checklist passes.
- Known limitations are documented.
- No public launch claims are made.

---

# 6. Cross-Phase Quality Gates

## Gate G1 — Provider Data Gate

Must pass before relying on real Google/Fitbit data.

Requirements:

- Google Health connection works for test user.
- Availability matrix filled.
- Redacted fixtures saved.
- Core metric availability known.
- Proprietary provider score availability validated or marked unavailable.

## Gate G2 — Data Model Gate

Must pass before UI depends on health data.

Requirements:

- Schema migrations run cleanly.
- Metric registry seeded.
- Provider records can normalize into canonical metrics.
- Daily summaries and score snapshots can be queried quickly.

## Gate G3 — Scoring Gate

Must pass before claiming useful recovery/sleep/readiness.

Requirements:

- Sleep Score, Recovery Score, Activity Score, Training Readiness, Sleep Debt, Bedtime Planner work from fixtures.
- Scores include components, missing data, confidence, algorithm version.
- Tests cover missing/partial data.

## Gate G4 — UX Gate

Must pass before private beta.

Requirements:

- Home warm load feels instant.
- Core tabs are polished and token-driven.
- Animations are smooth and restrained.
- Stale/missing/provisional states are clear.
- AI is helpful but not blocking.

## Gate G5 — Private Beta Gate

Must pass before friend/tester usage.

Requirements:

- TestFlight build installs.
- Auth works.
- Google Health connection works or fallback fixtures are clearly not real beta.
- Logs are redacted.
- Data deletion path exists at least as internal runbook/workflow.
- Costs are monitored.

---

# 7. AI Coding Agent Ticket Template

Use this exact prompt shape for one-commit work:

```text
You are implementing Primis commit unit {CU-ID}: {TITLE}.

Read these docs first:
- docs/source-of-truth/primis_full_implementation_spec_commit_plan.md section {SECTION}
- docs/source-of-truth/{RELEVANT_DOC_1}
- docs/source-of-truth/{RELEVANT_DOC_2}

Goal:
{GOAL}

In scope:
{IN_SCOPE}

Out of scope:
{OUT_OF_SCOPE}

Files likely involved:
{FILES}

Acceptance criteria:
{ACCEPTANCE_CRITERIA}

Verification commands:
{COMMANDS}

Constraints:
- Implement only this commit unit.
- Do not invent schema names, score formulas, design tokens, or AI prompt behavior.
- Do not commit secrets.
- Add tests where specified.
- Keep UI token-driven.
- Keep scoring deterministic.
- Keep AI behind backend gateway.

Return:
- Summary of changes
- Tests run
- Known limitations
- Suggested next commit unit
```

---

# 8. Anti-Drift Rules for AI Coding Agents

AI coding agents must not:

1. Add unplanned third-party dependencies without justification.
2. Create new tables not in the data model without an ADR.
3. Invent metric names instead of using the canonical registry.
4. Put score formulas in mobile components.
5. Put AI prompts in mobile components.
6. Send raw provider payloads to LLMs by default.
7. Hardcode colors/spacing outside design tokens.
8. Build public billing before private MVP works.
9. Build MyFitnessPal scraping.
10. Make medical diagnosis claims.
11. Hide missing data.
12. Assume Google exposes provider Sleep Score/Readiness/Cardio Load.
13. Depend on Expo Go for the real app.
14. Commit `.env`, tokens, API keys, OAuth secrets, Apple/Facebook secrets, or provider payloads with personal identifiers.

---

# 9. Recommended First Ten Commits

If starting from zero, implement in this exact order:

1. CU-001 — Initialize repository structure
2. CU-002 — Add source-of-truth documents and contribution guide
3. CU-003 — Configure TypeScript workspace baseline
4. CU-004 — Add linting, formatting, and editor config
5. CU-005 — Add test framework baseline
6. CU-006 — Add GitHub Actions CI baseline
7. CU-007 — Add environment variable contract and safe config loader
8. CU-008 — Create core type package with domain enums
9. CU-009 — Create canonical metric registry package
10. CU-011 — Add API contract envelope and error schema

Do not start mobile screen work until these are done.

---

# 10. Final Guidance

The fastest path to a serious Primis app is not “build every screen immediately.” It is:

```text
contracts -> data model -> scoring -> cached APIs -> premium UI -> AI context -> live integration
```

The most dangerous failure mode is a beautiful app that cannot ingest, normalize, explain, or trust its own data.

The second-most dangerous failure mode is an AI chatbot that sounds smart but is not grounded in deterministic evidence.

The third-most dangerous failure mode is React Native UI that looks acceptable in screenshots but feels slow, inconsistent, and generic in hand.

Every commit should move Primis closer to a premium, fast, AI-native, deterministic-core, Google/Fitbit-first health performance OS.

---

# Phase AA — Mandatory Google Health API Validation and Feature-Parity Pack

**Status:** V1.1 mandatory pre-implementation amendment.  
**Placement:** This phase MUST be performed before any commit that treats Google/Fitbit data as confirmed. It should occur immediately after source docs are copied into the repo and before meaningful backend/provider/sleep/scoring/UI work.  
**Reason:** AI coding model memory resets each commit. The repository itself must contain exact endpoint inventories, feature matrices, documented-schema fixtures, and validation scripts so every later agent can re-read concrete facts instead of relying on chat history.

## AA.0 Governing rule

No commit may implement a Google/Fitbit-dependent Sleep, Recovery, Readiness, Activity, Vitals, or AI feature as complete unless one of the following is true:

1. the feature is backed by a real redacted fixture under `database/fixtures/provider/google_health/redacted_real/`, or
2. the feature is explicitly marked `documented_schema_only` / `provider_unverified` and has polished missing/provisional UI behavior.

## CU-AA-001 — Add Google Health endpoint inventory decision record

**Commit message:** `docs: add Google Health endpoint inventory (CU-AA-001)`

**References:** PRD §22; Technical Architecture §29; MVP Build Plan §30; Google Health API data types and REST references.

**Goal:** Create the file every future provider/sync commit must read before implementing assumptions.

**Files likely involved:**

```text
docs/decisions/google_health_api_endpoint_inventory.md
```

**Required content:**

- `GET /v4/users/me/dataTypes/{dataType}/dataPoints`
- `GET /v4/users/me/dataTypes/{dataType}/dataPoints:reconcile`
- `POST /v4/users/me/dataTypes/{dataType}/dataPoints:dailyRollUp`
- `GET /v4/users/me/pairedDevices`
- notes on kebab-case endpoint data types vs snake_case filter names
- list/reconcile/dailyRollUp usage rules
- sleep page size caveat if observed/confirmed from docs
- rate-limit references
- app-verification references

**Acceptance criteria:**

- File exists and includes official source URLs.
- File marks all endpoint facts as `documented`, not `real_payload_validated`.
- File includes an implementation warning: provider scores are not assumed exposed.

**Verification:**

```bash
ls docs/decisions/google_health_api_endpoint_inventory.md
```

## CU-AA-002 — Add Google Health feature parity matrix shell

**Commit message:** `docs: add Google Health feature parity matrix (CU-AA-002)`

**References:** PRD §22.3-22.4; Technical Architecture §29.6; MVP Build Plan §30.

**Goal:** Create a feature-by-feature parity matrix covering the Google Health screenshots and Primis plan.

**Files likely involved:**

```text
docs/decisions/google_health_api_feature_parity_matrix.md
```

**Required columns:**

```text
Google Health UI feature
Primis feature
Google endpoint family
Google data type
Google field path
Required scope
Classification
Canonical metric / table
Fixture path
Validation status
Implementation phase
Notes
```

**Minimum rows:**

```text
paired device battery
paired device last sync
steps
calories burned
readiness
sleep score
sleep duration
sleep stages timeline
sleep schedule
time to fall asleep
sound sleep equivalent
restlessness
interruptions / out of bed
REM sleep
Deep sleep
sleep efficiency
HRV
resting heart rate
heart rate during sleep
respiratory rate
SpO2
VO2 max
blood glucose
weight
body fat
hydration
calorie intake
carbs
fat
protein
exercise days
floors
active zone minutes
cardio load
workouts
AI reply / Ask Coach
```

**Acceptance criteria:**

- Matrix exists.
- Each row has a classification: `provider_direct`, `provider_summary`, `primis_derived`, `manual_or_third_party`, `unsupported_or_deferred`, or `provider_unverified`.
- Provider proprietary scores are marked `provider_unverified` unless real payload proof exists.

## CU-AA-003 — Add Google Health scope map

**Commit message:** `docs: add Google Health scope map (CU-AA-003)`

**References:** PRD Google Health requirements; Google Health API scopes/data types.

**Goal:** Map each desired feature to the least set of Google scopes.

**Files likely involved:**

```text
docs/decisions/google_health_api_scope_map.md
```

**Acceptance criteria:**

- Each target data type has a scope.
- MVP scopes are separated from later scopes.
- Nutrition/hydration write scopes, if needed later, are separated from read scopes.
- Notes warn that restricted scopes require verification for public launch.

## CU-AA-004 — Add documented-schema Google Health fixtures

**Commit message:** `fixtures: add documented Google Health schema examples (CU-AA-004)`

**References:** Technical Architecture §29; Data Model §27; Scoring Spec §31.

**Goal:** Provide synthetic/documented-shape fixtures for local development before live OAuth setup.

**Files likely involved:**

```text
database/fixtures/provider/google_health/documented_schema/sleep_stages_session.json
database/fixtures/provider/google_health/documented_schema/sleep_classic_session.json
database/fixtures/provider/google_health/documented_schema/paired_devices.json
database/fixtures/provider/google_health/documented_schema/daily_heart_rate_variability.json
database/fixtures/provider/google_health/documented_schema/daily_resting_heart_rate.json
database/fixtures/provider/google_health/documented_schema/respiratory_rate_sleep_summary.json
database/fixtures/provider/google_health/documented_schema/daily_oxygen_saturation.json
database/fixtures/provider/google_health/documented_schema/exercise_session.json
database/fixtures/provider/google_health/documented_schema/README.md
```

**Acceptance criteria:**

- Fixtures are syntactically valid JSON.
- Fixtures are explicitly labeled synthetic/documented-schema.
- Sleep stages fixture includes AWAKE, LIGHT, DEEP, REM.
- Classic sleep fixture includes AWAKE, ASLEEP, RESTLESS.
- Paired devices fixture includes batteryStatus, batteryLevel, lastSyncTime, deviceVersion, features.
- No real identifiers, tokens, emails, MAC addresses, or account data.

**Verification:**

```bash
find database/fixtures/provider/google_health/documented_schema -name '*.json' -print0 | xargs -0 -n1 jq empty
```

## CU-AA-005 — Add Google Health payload validation script skeleton

**Commit message:** `scripts: add Google Health payload validation skeleton (CU-AA-005)`

**References:** MVP Build Plan §30; Technical Architecture §29.

**Goal:** Create the live-validation script structure without requiring real credentials yet.

**Files likely involved:**

```text
scripts/google-health-validation/README.md
scripts/google-health-validation/src/config.ts
scripts/google-health-validation/src/googleHealthClient.ts
scripts/google-health-validation/src/fetchSleep.ts
scripts/google-health-validation/src/fetchVitals.ts
scripts/google-health-validation/src/fetchActivity.ts
scripts/google-health-validation/src/fetchPairedDevices.ts
scripts/google-health-validation/src/redactAndWriteFixture.ts
scripts/google-health-validation/src/index.ts
```

**Acceptance criteria:**

- Script reads OAuth credentials/token path from env vars/placeholders.
- Script refuses to run if required env vars are missing.
- Script never logs tokens.
- Script writes to `database/fixtures/provider/google_health/redacted_real/` only after redaction.
- README clearly lists manual setup steps for Phase Z.

## CU-AA-006 — Add Google Health payload validator tests using documented fixtures

**Commit message:** `test: add Google Health fixture validation tests (CU-AA-006)`

**References:** Data Model §27; Scoring Spec §31.

**Goal:** Ensure documented fixtures can be parsed into normalized structures before real payloads exist.

**Files likely involved:**

```text
services/sync/test/googleHealthFixtureValidation.test.ts
packages/health-metrics/src/provider/googleHealthMappings.ts
```

**Acceptance criteria:**

- Sleep STAGES fixture parses into session + stage intervals + summaries.
- Sleep CLASSIC fixture parses into session + classic intervals + summaries.
- Paired devices fixture parses into provider device DTO.
- Vitals fixtures parse into canonical metric DTOs.
- Tests do not require network calls.

## CU-AA-007 — Add normalized Google Health mapping contracts

**Commit message:** `sync: add Google Health mapping contracts (CU-AA-007)`

**References:** Data Model §27; Technical Architecture §29.

**Goal:** Define pure mapping functions before any live API code.

**Files likely involved:**

```text
packages/health-metrics/src/provider/googleHealthDataTypes.ts
packages/health-metrics/src/provider/googleHealthSleepMapper.ts
packages/health-metrics/src/provider/googleHealthVitalsMapper.ts
packages/health-metrics/src/provider/googleHealthDeviceMapper.ts
packages/health-metrics/test/googleHealthSleepMapper.test.ts
```

**Acceptance criteria:**

- Mapper converts documented sleep fixtures into canonical DTOs.
- Mapper preserves `provider_sleep_type`, stage status, processed flag, nap flag, manual edit flag.
- Mapper maps all six sleep stage types.
- Device mapper redacts/hashes hardware identifiers and maps battery/sync/features.
- Tests cover stages, classic fallback, and missing optional fields.

## CU-AA-008 — Add live payload validation report template

**Commit message:** `docs: add live Google Health validation report template (CU-AA-008)`

**References:** MVP Build Plan §30.

**Goal:** Make the final manual validation work deterministic.

**Files likely involved:**

```text
docs/decisions/google_health_api_validated_payloads.md
```

**Acceptance criteria:**

- Template includes every target metric family.
- Template has rows for endpoint, data type, fixture path, status, populated fields, missing fields, sync lag, historical depth, notes.
- Template starts as `not_run` and must be updated in Phase Z.

## CU-AA-009 — Add downstream blocker check to implementation instructions

**Commit message:** `docs: add Google Health validation blocker checklist (CU-AA-009)`

**References:** this spec; MVP Build Plan §30.

**Goal:** Prevent memory-reset AI agents from skipping validation.

**Files likely involved:**

```text
.ai-agent-instructions.md
docs/runbooks/google_health_validation_gate.md
```

**Acceptance criteria:**

- Any commit touching sleep/recovery/readiness/provider sync must check for the feature parity and validated payload docs.
- Instructions state that synthetic fixtures may support local development but cannot mark provider-dependent features private-beta complete.
- Instructions include “do not assume proprietary Google scores exist.”

## Phase AA definition of done

Phase AA is complete when:

```text
[ ] endpoint inventory exists
[ ] feature parity matrix exists
[ ] scope map exists
[ ] documented-schema fixtures exist
[ ] validation script skeleton exists
[ ] fixture parser tests pass
[ ] normalized Google Health mapping contracts exist
[ ] live payload validation report template exists
[ ] AI-agent blocker checklist exists
```

After Phase AA, development may continue against documented-schema fixtures, but private beta remains blocked until Phase Z live validation fills `redacted_real` fixtures and updates the validation report.

---

# Phase Z Amendment — Manual Live Validation Must Update Docs Before TestFlight

Before TestFlight/private-beta distribution, the founder/developer must run the Google Health validation scripts against the real Google/Fitbit account and update:

```text
docs/decisions/google_health_api_feature_parity_matrix.md
docs/decisions/google_health_api_validated_payloads.md
database/fixtures/provider/google_health/redacted_real/*
```

Acceptance criteria:

```text
[ ] real sleep payload fixture exists
[ ] real paired devices payload fixture exists
[ ] real daily HRV payload fixture exists or documented unavailable
[ ] real RHR payload fixture exists or documented unavailable
[ ] real respiratory payload fixture exists or documented unavailable
[ ] real SpO2 payload fixture exists or documented unavailable
[ ] feature matrix updated from provider_unverified to validated/unavailable/deferred
[ ] Sleep page fallback behavior updated for actual payload reality
[ ] scoring confidence rules reflect actual payload availability
```

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

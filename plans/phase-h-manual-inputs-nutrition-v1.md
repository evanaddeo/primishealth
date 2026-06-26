# Phase H — Manual Inputs & Nutrition v1 (CU-069 → CU-075)

> **Context.** Phase G shipped the read-only, local-first user surfaces over Phase F's precomputed
> scores. Phase H adds the **first user write-paths**: fast, optional manual logging (check-ins;
> hydration/caffeine/alcohol; bowel/digestion; manual macros; custom tags) plus a real Nutrition tab.
> The point is a _high-leverage optional layer_ that enriches future correlations and AI coaching —
> not a chore, not a food database, not a medical product.
>
> This file is an implementation-ready plan for **sequential Cursor-agent execution**. One CU = one
> commit on `feature/manual-inputs-nutrition-v1` (see Open Questions A0 re: branch name). Read the
> whole file once, then execute CUs in dependency order. Source-of-truth precedence: follow
> `docs/README.md` authority order; on a material conflict, **propose an ADR under `docs/decisions/`
> rather than silently choosing** (`.ai-agent-instructions.md` Rule 2).

---

## 1. Goal & Non-Goals

**Goal.** Deliver the manual-input and Nutrition-v1 layer end to end: typed API contracts + write/read
routes over the **already-migrated** Phase D tables, plus mobile quick-add/check-in UX and a Nutrition
tab v1. Logging must be fast (sub-20s check-in), optional, non-shaming, and unit-correct; nutrition is
practical performance context, not a MyFitnessPal clone; digestion is discreet, optional, and framed
as trends/correlations only.

**Non-goals (Phase H).**

- **No new migrations** — every Phase H table already exists (`000005_domain_tables.sql`). Do not add,
  alter, or re-shape tables/columns/enums; if a column seems missing, STOP and propose an ADR.
- No AI gateway/model calls, AI context builders, prompts, or AI meal estimation (Phase I awareness only).
- No FoodData Central import/search, no `food_items`/`food_nutrient_values` writes, no barcode scanning,
  no photo/label food logging.
- No MyFitnessPal API/scraping/cookie integrations.
- No wearable/provider sync changes, no real provider calls.
- No new scoring formulas. The only aggregation allowed is **simple daily summation/latest-time roll-up**
  of manual entries (see ADR-008); `nutrition_score` and macro/hydration **targets** remain Phase-F /
  scoring-owned and are left untouched.
- No medical/diagnostic language; no shame/nagging UX; no raw S2/S3 health text in logs.
- No bottom-tab reordering (UX-NAV-002); the Nutrition tab slot already exists.
- No AWS deploy resources, billing, or Phase I work.

---

## 2. Current Repo State (what A–G already built — verified)

**Tooling / conventions.** pnpm@9 workspace (`apps/*`, `services/*`, `packages/*`, `infrastructure/*`);
strict TS (`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`moduleResolution: bundler`); ESLint (0 warnings, no `any`, no `console` except `error`) + Prettier
(100-col, single quotes, trailing commas); Vitest via root `vitest.workspace.ts` (packages own
`vitest.config.ts`, tests in `*.test.ts` or `test/`). CI gate (`.github/workflows/ci.yml`):
`pnpm lint && pnpm typecheck && pnpm test && pnpm format:check`. Commit format
`<area>: <imperative summary> (<CU-ID>)`. One CU per session; tests required for non-trivial code; no
secrets/raw payloads (`.ai-agent-instructions.md`, `CONTRIBUTING.md`, `docs/README.md`).

**Database — Phase H tables ALREADY EXIST (`database/migrations/000005_domain_tables.sql`).** No
migration work in Phase H. Confirmed present with full columns/constraints (data-model §14–§15):
`manual_checkins` (§14.1), `custom_tags` (§14.2, `unique(user_id, tag_code)`), `tag_events` (§14.3,
`linked_entity_type/id`), `hydration_entries` (§14.4), `caffeine_entries` (§14.5), `alcohol_entries`
(§14.6), `bowel_entries` (§14.7), `nutrition_entries` (§15.4, `entry_method`/`ai_estimated`),
`nutrition_entry_items` (§15.5, cascade), `daily_nutrition_summaries` (§15.6, `unique(user_id,
local_date)`). Kysely types for all of these exist in `services/api/src/db/types.ts`
(`ManualCheckin`/`NewManualCheckin`/`…Update`, `HydrationEntry`, `CaffeineEntry`, `AlcoholEntry`,
`BowelEntry`, `CustomTag`, `TagEvent`, `NutritionEntry`, `NutritionEntryItem`, `DailyNutritionSummary`).
Migration convention: `000NNN_snake_case.sql`, run via `pnpm db:migrate` (`scripts/db-migrate.ts`).

**Repositories — partial; mostly write-only (`services/api/src/repositories/`).**

- `manualInputRepository.ts` HAS: `createCheckin`, `getCheckins(userId, DateRange)`, `upsertCustomTag`
  (on-conflict `(user_id, tag_code)`), `createTagEvent`, `createHydrationEntry`, `createCaffeineEntry`,
  `createAlcoholEntry`, `createBowelEntry`. **MISSING** (Phase H must add): list/range reads for
  hydration/caffeine/alcohol/bowel/tag-events, `getCustomTags`, `getCheckinById`, `updateCheckin`.
- `nutritionRepository.ts` HAS: `createNutritionEntry`, `getNutritionEntriesForDate`, `addEntryItem`,
  `getDailyNutritionSummary`, `upsertDailyNutritionSummary`. **MISSING/TO-WIRE**: the write-through
  daily roll-up call (ADR-008).
- Both repos carry comments noting summary **computed columns are populated by Phase F** — this is the
  exact seam ADR-008 must resolve (manual logs write to `*_entries`, not to `metric_observations`).

**API contracts (`packages/api-contracts/src/`).** Per-domain files = TS `interface … Dto` (readonly)

- `…DtoSchema` (Zod) + `…_FIXTURE`, re-exported from `index.ts`; envelope helpers `makeSuccessResponse`/
  `makeErrorResponse` (`envelope.ts`), `errors.ts`, `dataQuality.ts`, `pagination.ts`, `chart.ts`,
  `scores.ts`. Existing: `dashboard`, `sleep`, `recovery`, `activity`, `vitals`, `scores`, `chart`,
  `onboarding`, `user`, `providerConnections`, `sync`. **No nutrition / manual-input / lifestyle / tags /
  digestion contracts exist yet** — Phase H creates them.

**API service (`services/api/src/`).** Hono app; `app.ts` registers routers under `/api/v1/*` behind
`authMiddleware` (which sets `c.var.user.internalUserId`) + `requestIdMiddleware`; `onError`/`notFound`
last. **Every existing health route is GET-only and reads precomputed rows** (`sleep`/`recovery`/
`activity`/`vitals`/`dashboard`). The only existing **write** routes are `me.ts` (PATCH profile/prefs)
and `onboarding.ts` (POST goals/preferences/consent) — these are the closest templates for request-body
validation + ownership. Route pattern (canonical: `routes/sleep.ts`): a `…RouteDeps` interface,
`DEFAULT_DEPS` wired to real repos, a `createXRouter(deps)` factory + a default export instance;
validate query/body, call repos filtered by `internalUserId`, build the DTO, `Schema.parse(dto)`, return
`makeSuccessResponse(...)`; tests inject mock deps and call `app.request()`.
**Phase H introduces the first health-data write endpoints — it establishes that mutation pattern.**

**Workers (`services/workers/src/`).** `summaries/buildDailyMetricSummaries.ts` (+ `aggregations.ts`)
roll up `metric_observations`; `scoring/runDailyScoring.ts` writes score snapshots; `baselines/…`;
`sync/…`. These aggregate **provider-synced** observations — they do **not** see manual `*_entries`
rows today. (Relevant to ADR-008; Phase H does not modify workers.)

**Mobile (`apps/mobile`).** Expo Router; tabs `app/(tabs)/_layout.tsx` = Home, Sleep, Recovery,
Activity, **Nutrition**, AI Coach (LOCKED order). **`app/(tabs)/nutrition.tsx` is a stub**
(`Placeholder — CU-018`) to be replaced in CU-075. Data seam = typed hooks in `src/api/hooks/*`
(react-query v5, mock-first via `src/mocks/*`, local-first via `src/cache/localDashboardCache.ts`,
optimistic-friendly) — screens never import mocks directly. `src/api/{client,endpoints,authToken,
queryClient}.ts`. State: zustand + MMKV (`settingsStore`, `widgetStore`, `authStore`). Feature
vertical-slice pattern (e.g. `features/sleep/`): `XScreen.tsx` + pure `xModel.ts` (node-testable) +
`components/*` + `index.ts`, tested via `apps/mobile/test/<feature>/xModel.test.ts`.

**Design system (`packages/design-system`).** Tokens (color/spacing/typography/radius/shadow/motion);
theme (`createTheme`, `useTheme`, `ThemeMode`, `AccentColor`); components `Screen`, `Card`, `Text`,
`Button`, `MetricValue`, `StatusBadge`, `ProgressBar`; charts `LineChart`, `BarChart`, `StageTimeline`,
`RingProgress`; motion (`timing`, `transitions`, `useReducedMotion`). **No form-input primitives**
(TextField, NumberStepper, SegmentedControl, Chip, BottomSheet, time/value pickers) — these are required
for quick-add and are added in **H-PRE** (folded into CU-074), mirroring how Phase G added `BarChart` in
G-PRE.

**Shared types/units.** `@primis/core-types`: `MetricCategory` (incl. `nutrition`, `manual`),
`AggregationMethod` (`sum`/`avg`/`latest`/…), score enums. `@primis/health-metrics`: `METRIC_DEFINITIONS`,
`getMetric()`, **`convertUnit()`** + `CanonicalUnit` (incl. `milliliters`, `milligrams`,
`standard_drinks`, `grams`, `kcal`, `score_1_5`, `score_0_5`, `timestamp`). Canonical metric codes for
this phase (data-model §9.2): `calories_in_kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`,
`hydration_ml`, `caffeine_mg`, `latest_caffeine_time`, `alcohol_standard_drinks`, `latest_alcohol_time`,
`energy_subjective`, `mood_subjective`, `stress_subjective`, `soreness_subjective`,
`productivity_subjective`. **Use these exact codes/units; convert via `convertUnit`, never ad hoc.**

**ADRs affecting Phase H.** ADR-003 (query layer + migrations: SQL is canonical; `db/types.ts`
hand-maintained), ADR-005/006 (envelope + precomputed read-endpoint shape — the conventions Phase H
write/read routes must stay consistent with), `google-health-api-metric-availability.md` (provider
metrics unverified; manual entries are user-reported and **independent of provider sync** — Phase H needs
no live validation). Highest existing ADR = **ADR-006**; ADR-007 is informally reserved by the Phase G
plan for a future bedtime endpoint, so Phase H's new decision is **ADR-008** (see §5).

**Repo drift / mismatches agents must account for.**

1. **Summary ownership seam (the big one).** `daily_nutrition_summaries` is documented/wired as
   Phase-F-computed from `metric_observations`, but manual logs land in `*_entries`. Resolve via
   **ADR-008** before CU-070/CU-072 (§5). User directive: choose the **long-term best-practice** design
   and document it prominently.
2. **Branch name.** Working branch created is `feature/manual-inputs-nutrition-v1`; the task's workflow
   assumption references `phase/phase-h-manual-inputs-nutrition-v1`; `CONTRIBUTING.md` describes per-CU
   `cu/<id>-<name>` branches. Phase H uses **one phase branch, sequential commits** (not per-CU branches).
   Reconcile the exact name before starting (Open Questions A0).
3. **Nutrition stub references `CU-018`** (a Phase C scaffold tag) — expected; CU-075 replaces it.
4. **No mutation-route precedent for health data** — follow `onboarding.ts`/`me.ts` for body validation
   - `sleep.ts` for the DI/envelope/`Schema.parse` shape.
5. **Check-in "tags".** `manual_checkins` has no tags column; tag application is delivered via
   `tag_events` (`linked_entity_type='manual_checkin'`) in **CU-073**. CU-069 ships scalar check-in
   fields only; do not invent a tags column.

---

## 3. Required Reading (per execution)

Always: `docs/README.md` (precedence), `.ai-agent-instructions.md`, `CONTRIBUTING.md`,
`primis_full_implementation_spec_commit_plan.md` §§2, 3, 3.5, 4 + the target CU (CU-069…075) + the
**commit-message format** (§3.2). Re-read this file's CU section and §5 (ADR-008) + §7 guardrails.

Per domain:

- **Data model** `primis_data_model_health_metric_schema.md` §5.2–5.4 (timestamp/unit/sensitivity
  conventions — UTC `occurred_at_utc` + `local_date` + `timezone`; canonical units; S2/S3 classes) and
  the exact table in §14 (checkins/tags/tag_events/hydration/caffeine/alcohol/bowel) or §15
  (nutrition_entries/items/daily summaries); metric codes §9.2.
- **PRD** `primis_product_requirements_document.md` §9.4 (manual check-in journey), §10.11
  (nutrition + FDC deferrals), §10.12 + §10.12.1 (manual inputs, custom tags, poop/digestion), §4.2
  (non-goals: no MFP, FDC deferred).
- **MVP** `primis_mvp_build_plan_milestones.md` M10 (scope + data-model-first + nutrition constraints).
- **Scoring** `primis_scoring_algorithms_spec.md` — subjective/manual modifiers + missing-data handling
  **as context only** (no formula changes); confirms manual inputs must not dominate objective scores.
- **AI context** `primis_ai_context_engine_spec.md` §8 (domain→source mapping), §10.6/10.7/10.12,
  §13.7/13.8 (safe, non-moralizing, non-diagnostic task instructions) — **read for the safety/language
  bar and the shape downstream context builders expect; implement no AI code.**
- **UI/UX** `primis_ui_ux_design_system_spec.md` §6.6 (Nutrition v1 layout + UX-NUT-001..004), §15
  (manual input UX, quick check-in fields, poop/digestion input, UX-INPUT-001..004), plus token/
  component/motion/a11y/loading/empty/stale rules + the §21 pre-acceptance checklist.
- **TAD** `primis_technical_architecture_document.md` — API boundaries, repository/service separation,
  local-first cache, **no raw S2/S3 health text in logs**, no heavy compute in render/request paths.

---

## 4. Dependency Graph & shared conventions

```
ADR-008 (manual-input daily aggregation & freshness)  ── MUST be ratified before CU-070 & CU-072
   │
Backend (one vertical slice each: contract → repo reads → route → register → tests)
   CU-069 manual check-in API ───────────────┐
   CU-070 hydration/caffeine/alcohol API ─────┤ (builds the shared idempotent daily roll-up fn)
   CU-071 bowel/digestion API ────────────────┤
   CU-072 manual macro nutrition API ─────────┤ (reuses the roll-up fn from CU-070)
   CU-073 custom tags API ────────────────────┘ (links tag_events to CU-069 checkins / CU-072 entries)
        │  (all five produce the @primis/api-contracts DTOs the mobile hooks bind to)
        ▼
Mobile
   H-PRE design-system input primitives (TextField, NumberStepper, SegmentedControl, Chip, BottomSheet)
        └─ folded into ▼
   CU-074 quick-add bottom sheet + check-in screen (mock-first; optimistic) ── needs 069–073 contracts
        └─ provides the QuickAdd sheet + primitives reused by ▼
   CU-075 Nutrition tab v1 ── needs CU-072 nutrition contract + CU-074 sheet/primitives
```

**Recommended execution order:** ADR-008 → CU-069 → CU-070 → CU-071 → CU-072 → CU-073 → CU-074 (incl.
H-PRE) → CU-075. Backend 069–073 are independent except: 072 reuses the roll-up fn first created in 070;
073 links to ids from 069/072. Mobile 074 needs all five contracts for typed adapters; 075 needs 074.

**Backend vertical-slice convention (CU-069…073).** For each: (1) add `packages/api-contracts/src/<domain>.ts`
(readonly `Dto` interfaces + `…DtoSchema` Zod + `…_FIXTURE`), export from `index.ts`, add a
`packages/api-contracts/test/<domain>.test.ts` (fixture parses; bad ranges/enums/dates rejected). (2) add
the missing **read** methods to the existing repo (writes already exist). (3) add
`services/api/src/routes/<domain>.ts` using the `routes/sleep.ts` DI factory shape + `me.ts`/`onboarding.ts`
body-validation shape; POST validates body with the request schema, derives nothing heavy, calls repos
filtered by `internalUserId`, returns `makeSuccessResponse`. (4) register in `app.ts` under `/api/v1/...`.
(5) add a route test (`app.request()` + injected mock deps) covering create + list + validation failure +
ownership. All inputs **optional + range/enum-validated + date/timezone-aware + user-owned**.

**Mobile adapter convention (CU-074/075).** Typed hooks in `apps/mobile/src/api/hooks/*` whose
read types equal the Phase H DTOs and whose mutations are the quick-add actions; mock-first via
`src/mocks/*`; optimistic cache update so a just-logged value shows instantly (the client side of ADR-008
freshness); screens never import mocks directly. Design-system tokens/components only; no heavy transforms
on render — pure `…Model.ts` helpers, node-tested.

---

## 5. Proposed ADRs (author before the dependent CUs)

### ADR-008 — Manual-input daily aggregation & freshness model _(BLOCKING for CU-070, CU-072)_

> **User directive (record verbatim):** _"the absolute best practice way possible — long term whatever is
> most optimal, reliable, efficient, and effective. make sure you note this somewhere."_ This ADR is where
> that decision is captured; the chosen design below is the recommended best-practice target.

**Problem.** `daily_nutrition_summaries` (calories/macros/`hydration_ml`/`caffeine_mg`/
`latest_caffeine_time_utc`/`alcohol_standard_drinks`) is, today, upserted by the Phase F worker from
provider `metric_observations`. Phase H manual logs write to the `*_entries` tables, which the worker
never reads — so manual data would silently never reach the summary, and the Nutrition tab would look
empty right after logging.

**Recommended decision (best-practice target).**

1. **Entry tables are the immutable source of truth.** `daily_nutrition_summaries` is a _derived
   projection_, never hand-authored.
2. **One canonical, pure, idempotent aggregation function** owns the math — placed in a shared pure module
   (`@primis/health-metrics`, e.g. `src/aggregation/dailyManualAggregation.ts`) so the **API now** and the
   **worker later** call the identical function (no duplicated math, no drift). It takes the day's entry
   rows (+ any provider-derived inputs) and returns the summary fields it owns. It computes **only sums and
   latest-times** — it does **not** compute `nutrition_score` or targets (those stay Phase-F/scoring-owned
   and are passed through / left null).
3. **Write-through recompute for instant freshness.** Each manual log POST, after inserting the entry,
   recomputes that `(user_id, local_date)` summary via the shared fn and `upsertDailyNutritionSummary`.
   Summing a day's handful of rows is bounded and trivial — this is _not_ the "heavy compute in request
   path" the TAD forbids (that rule targets scoring/ML).
4. **Idempotent + concurrency-safe.** Keyed on `(user_id, local_date)` with `ON CONFLICT` upsert; because
   every writer computes the same deterministic value from the same source rows, last-writer-wins is
   correct. The function must **union** manual-derived and provider-derived inputs so whichever path runs
   (API write-through now, or the worker later) produces a complete, non-clobbering row. Reads stay
   precomputed (serve the stored summary), consistent with ADR-006.
5. **Mobile = local-first.** The client optimistically reflects the just-logged entry immediately; the
   server projection is the durable truth on next read.

**Consequences / why this is the long-term-optimal choice.** Single source of aggregation truth, reusable
by the worker without rewrite, instant UX, deterministic + re-runnable, no schema change, and it keeps
scoring strictly out of Phase H. Document the worker-reuse follow-up (wire the same fn into
`buildDailyMetricSummaries`/a manual-summary builder) as a Phase F/I task — **not implemented in Phase H**.

**If not yet ratified when a CU starts:** STOP and author ADR-008 first (CU-070/CU-072 are "Ask first? =
Yes" for this reason).

_(No second ADR is mandatory. Note inline, not as ADRs: the URL scheme in §11, and that mutation routes are
append-only events with no idempotency key in v1.)_

---

## 6. Commit Units

### H-PRE — Design-system input primitives _(land as first commit of CU-074)_

- **Goal.** Add token-driven, accessible form primitives so quick-add/check-in UIs are first-class and
  reusable, not ad hoc: `TextField`, `NumberStepper` (+/- with min/max/step), `SegmentedControl`,
  `Chip`/`ChoiceChip`, `BottomSheet` (modal sheet). (Add a `Slider`/`OptionGroup` only if a CU-074 field
  needs it.)
- **Docs.** UI/UX §15 input UX + UX-INPUT-001..004; component/motion/a11y rules (44pt targets, labels,
  reduced motion). Mirror existing `Button`/`Card` API style + `useReducedMotion`.
- **Build on.** `packages/design-system/src/components/*`, tokens, `useReducedMotion`, `ThemeContext`.
- **Files.** `packages/design-system/src/components/{TextField,NumberStepper,SegmentedControl,Chip,BottomSheet}.tsx`;
  extend `components/index.ts` + `src/index.ts`; tests under `packages/design-system/test/`.
- **In scope.** Controlled inputs; token colors/spacing/typography; min/max/step + clamping for stepper;
  a11y roles/labels/state; reduced-motion-aware sheet animation; empty/disabled/error states.
- **Out of scope.** Any domain/nutrition logic; data fetching; networked validation.
- **Acceptance.** Render from props; no hex/magic numbers; clamp + a11y covered by unit tests; exported
  from `@primis/design-system`.
- **Verify.** `pnpm --filter @primis/design-system typecheck && pnpm --filter @primis/design-system test && pnpm lint && pnpm format:check`.
- **UI/UX bar.** Premium, fast (<100ms press feedback), legible, consistent with existing primitives.
- **Pitfalls.** Don't pull new heavy deps if a simple RN component suffices; keep zero domain logic; match
  existing prop conventions.
- **Ask first?** No.
- **Commit.** `design: add form input primitives for quick-add (CU-074)` _(tagged to CU-074; may be folded
  into the CU-074 commit if preferred)._

---

### CU-069 — Manual check-in API and schema

- **Goal.** Store fast daily context (energy/mood/stress/soreness/fatigue/notes) with optional, range-
  validated, date/timezone-aware, user-owned writes; list + correct by date.
- **Docs.** Spec CU-069; PRD §9.4 + §10.12 (MAN-001..004; under-20s, optional); data-model §14.1 +
  §5.2–5.4; metric codes §9.2 (`energy_subjective`/`mood_subjective`/`stress_subjective`/
  `soreness_subjective`/`productivity_subjective`); scoring subjective-modifier context (no formulas).
- **Prior same-phase artifacts.** None (first CU). Establishes the mutation-route pattern reused by 070–073.
- **Build on.** `manualInputRepository.createCheckin`/`getCheckins`; `db/types.ts` `ManualCheckin*`;
  `routes/onboarding.ts`+`me.ts` (body validation/ownership); `routes/sleep.ts` (DI/envelope/`Schema.parse`);
  `envelope.ts`.
- **Files.** `packages/api-contracts/src/manualInputs.ts` (+ `index.ts`, `test/manualInputs.test.ts`);
  `services/api/src/routes/manualInputs.ts`; extend `manualInputRepository.ts` (`getCheckinById`,
  `updateCheckin`); register in `app.ts`; route test.
- **In scope.** `POST /api/v1/checkins` (create), `GET /api/v1/checkins?from=&to=` (list by local-date
  range), `PATCH /api/v1/checkins/:id` (correct an entry). All score fields optional; ranges per §14.1
  (energy/mood/stress/productivity/motivation/libido `1–5`, soreness `0–5`); `checkin_type` enum
  (daily/post_workout/sleep_reflection/nutrition/digestion/custom); required `occurred_at_utc`+`local_date`
  (YYYY-MM-DD)+`timezone`; bounded `notes`; optional `completion_seconds`. Ownership via `internalUserId`.
- **Out of scope.** Tags on check-ins (delivered in CU-073 via linked `tag_events`); any scoring; hydration/
  caffeine/alcohol/bowel (other CUs); a tags column (does not exist — do not add).
- **Acceptance.** Create/update/list-by-date covered by tests; out-of-range/invalid-enum/bad-date → 400;
  cross-user access impossible; optional fields truly optional; DTO round-trips through Zod.
- **Verify.** `pnpm --filter @primis/api-contracts test && pnpm --filter @primis/api test && pnpm lint && pnpm typecheck && pnpm format:check`.
- **API/data-model bar.** Exact §14.1 columns/ranges; canonical units/codes; UTC+local_date+timezone;
  envelope responses; `updated_at` set in app layer (D-A-008); never log raw `notes` (S2).
- **Pitfalls.** Don't invent columns; don't make fields required; treat check-ins as events (no upsert);
  validate `local_date` format like `sleep.ts` (`DATE_RE`).
- **Ask first?** No.
- **Commit.** `manual: add check-in API and schema (CU-069)`

### CU-070 — Hydration, caffeine & alcohol APIs

- **Goal.** Capture high-value lifestyle inputs with canonical units and a daily roll-up, non-moralizing.
- **Docs.** Spec CU-070; PRD §10.11 (NUT-003..005 P0); data-model §14.4/§14.5/§14.6 + §5.3 units +
  §9.2 codes (`hydration_ml`, `caffeine_mg`, `latest_caffeine_time`, `alcohol_standard_drinks`,
  `latest_alcohol_time`); **ADR-008**.
- **Prior same-phase artifacts.** ADR-008 (blocking). Builds the shared roll-up fn reused by CU-072.
- **Build on.** `manualInputRepository.create{Hydration,Caffeine,Alcohol}Entry`; `nutritionRepository.
{get,upsert}DailyNutritionSummary`; `@primis/health-metrics` `convertUnit`; `db/types.ts`.
- **Files.** `packages/api-contracts/src/lifestyleLogs.ts` (+ index, test); `@primis/health-metrics/src/
aggregation/dailyManualAggregation.ts` (+ test) — the ADR-008 pure fn; `services/api/src/routes/
lifestyleLogs.ts`; extend `manualInputRepository.ts` (`get{Hydration,Caffeine,Alcohol}EntriesForDate`);
  register in `app.ts`; route test.
- **In scope.** `POST /api/v1/hydration` (`amount` + `unit`→ml via `convertUnit`; `beverage_type`),
  `POST /api/v1/caffeine` (`caffeine_mg`, `beverage_type` enum coffee/espresso/energy_drink/tea/preworkout/
  other, `serving_description`, `estimated`, timestamp), `POST /api/v1/alcohol` (`standard_drinks`,
  `drink_range` none/one/two/three_four/five_plus, `alcohol_type` beer/wine/liquor/cocktail/mixed/other,
  `last_drink_time_utc`, `notes`), each + `GET …?date=`. On each write, **write-through recompute** of that
  day's summary fields (`hydration_ml` sum, `caffeine_mg` sum + `latest_caffeine_time_utc`,
  `alcohol_standard_drinks` sum) via the shared fn (ADR-008). `GET /api/v1/lifestyle?date=` returns the
  precomputed summary + entries.
- **Out of scope.** `nutrition_score`/targets; macros (CU-072); any moralizing copy/flags; provider sync.
- **Acceptance.** Unit conversion correct (oz↔ml); caffeine latest-time derived; alcohol stored as range +
  drinks without judgment; daily summary reflects writes (tests cover roll-up); validation failures → 400;
  user-owned.
- **API/data-model bar.** Canonical units only via `convertUnit`; exact enums; idempotent roll-up keyed
  `(user_id, local_date)`; no S2 raw values in logs.
- **Pitfalls.** Don't store oz in an `_ml` column; don't recompute scores; ensure roll-up unions (does not
  clobber) macro fields written by CU-072; keep the aggregation fn pure (no DB inside it).
- **Ask first?** **Yes** — confirm ADR-008 is ratified before implementing the roll-up.
- **Commit.** `manual: add hydration caffeine and alcohol APIs (CU-070)`

### CU-071 — Bowel/digestion tracking API

- **Goal.** Optional, discreet structured gut tracking framed as trends/correlations — **no diagnosis**.
- **Docs.** Spec CU-071; PRD §10.12.1 (DIG-001..005; MAY/optional; no diagnosis); data-model §14.7 (S3);
  AI-context §13.8 (non-diagnostic language bar — context only); UI/UX §15.3.
- **Prior same-phase artifacts.** Reuses the §4 vertical-slice convention; independent otherwise.
- **Build on.** `manualInputRepository.createBowelEntry`; `db/types.ts` `BowelEntry*`.
- **Files.** `packages/api-contracts/src/digestion.ts` (+ index, test); `services/api/src/routes/
digestion.ts`; extend `manualInputRepository.ts` (`getBowelEntriesForDate`/range); register; route test.
- **In scope.** `POST /api/v1/digestion`, `GET /api/v1/digestion?from=&to=`. Fields per §14.7: `bristol_type`
  `1–7`, `color`/`smell`/`urgency`/`completeness` enums, `pain_level`/`bloating_level` `0–5`, `notes`,
  `data_quality` default `user_reported`. All optional except timestamp/local_date/timezone. User-owned.
- **Out of scope.** Any diagnosis/disease wording; daily summary aggregation (not a `daily_nutrition_
summaries` field); correlation computation (Phase I).
- **Acceptance.** Enum/range validation (tests); optional fields; no daily-nagging side effects; cross-user
  blocked; S3 raw values never logged.
- **API/data-model bar.** Exact §14.7 enums/ranges; S3 handling (encrypt-at-rest assumption, no logs);
  envelope responses.
- **Pitfalls.** No diagnosis copy anywhere (incl. validation messages); don't surface as a required/daily
  prompt; don't add a summary table.
- **Ask first?** No.
- **Commit.** `manual: add bowel and digestion tracking API (CU-071)`

### CU-072 — Manual macro nutrition API

- **Goal.** Manual calories/macros + meal timing + manual-estimate flag + daily nutrition summary —
  **manual only**, before any food database.
- **Docs.** Spec CU-072; PRD §10.11 (NUT-001/002; FDC/MFP deferrals §4.2); MVP M10 nutrition constraints;
  data-model §15.4/§15.6 + §9.2 macro codes; **ADR-008**.
- **Prior same-phase artifacts.** ADR-008 (blocking); reuses the shared roll-up fn from CU-070.
- **Build on.** `nutritionRepository.createNutritionEntry`/`getNutritionEntriesForDate`/`{get,upsert}
DailyNutritionSummary`; the ADR-008 aggregation fn; `db/types.ts` `NutritionEntry*`/`DailyNutritionSummary`.
- **Files.** `packages/api-contracts/src/nutrition.ts` (+ index, test); `services/api/src/routes/
nutrition.ts`; register; route test. (Repo already sufficient; wire the roll-up call.)
- **In scope.** `POST /api/v1/nutrition/entries` (`entry_method='manual_macros'`, `ai_estimated=false`;
  `total_calories_kcal`/`total_protein_g`/`total_carbs_g`/`total_fat_g`, optional `total_fiber_g`;
  `meal_type` enum; `notes`); `GET /api/v1/nutrition?date=` returns the daily summary + entries (the
  Nutrition-tab payload). On write, **write-through recompute** of macro/calorie summary fields via the
  shared fn (ADR-008), preserving hydration/caffeine/alcohol fields (CU-070) and leaving `nutrition_score`/
  targets to Phase F.
- **Out of scope.** FDC search/import, `food_items`/`nutrition_entry_items` line-item UI, barcode, photo,
  AI estimate, `nutrition_score`/targets, `calories_out`/`calorie_balance` (provider/Phase-F-owned).
- **Acceptance.** Manual entry stored + summary aggregated (tests cover daily aggregation); `ai_estimated`
  surfaced in the DTO so UI can label "manual estimate"; validation failures → 400; user-owned.
- **API/data-model bar.** Canonical macro codes/units (grams, kcal); exact `entry_method`/`meal_type`
  enums; idempotent roll-up; envelope responses.
- **Pitfalls.** Don't implement food search; don't compute a nutrition score; ensure the roll-up unions
  with CU-070 fields; keep aggregation pure.
- **Ask first?** **Yes** — confirm ADR-008 ratified.
- **Commit.** `nutrition: add manual macro logging API (CU-072)`

### CU-073 — Custom tags API

- **Goal.** User-owned behavior/event markers for later correlations/AI context, with duplicate handling
  and tag-event logging (incl. linking to check-ins/nutrition entries).
- **Docs.** Spec CU-073; PRD §10.12 (MAN-003; searchable/reusable UX-INPUT-004); data-model §14.2/§14.3.
- **Prior same-phase artifacts.** Links `tag_events` to CU-069 check-ins and CU-072 nutrition entries
  (`linked_entity_type`/`linked_entity_id`).
- **Build on.** `manualInputRepository.upsertCustomTag`/`createTagEvent`; `db/types.ts` `CustomTag*`/
  `TagEvent*`.
- **Files.** `packages/api-contracts/src/tags.ts` (+ index, test); `services/api/src/routes/tags.ts`;
  extend `manualInputRepository.ts` (`getCustomTags`, optional `getTagEvents` by range); register; route test.
- **In scope.** `POST /api/v1/tags` (create/upsert a custom tag — normalize `display_name`→`tag_code`,
  upsert on `(user_id, tag_code)`; define duplicate behavior: idempotent upsert returns the existing/
  updated tag, not a 409), `GET /api/v1/tags` (list active user tags), `POST /api/v1/tags/events` (log a
  tag event with timestamp/local_date/timezone, optional `intensity`/`quantity`/`unit`/`notes` and optional
  `linked_entity_type`+`linked_entity_id`). `category` enum per §14.2; user-owned.
- **Out of scope.** System-suggested-tag seeding logic, correlation/AI consumption (Phase I), tag analytics.
- **Acceptance.** Duplicate-name handling covered by tests (upsert idempotent); event logging with/without a
  linked entity covered; tags scoped per user; validation failures → 400.
- **API/data-model bar.** `(user_id, tag_code)` uniqueness honored; exact `category` values; stable
  `tag_code` normalization; envelope responses.
- **Pitfalls.** Don't leak another user's tags; keep `tag_code` slug deterministic; validate
  `linked_entity_type` against the allowed set.
- **Ask first?** No.
- **Commit.** `manual: add custom tags API (CU-073)`

### CU-074 — Mobile quick-add / check-in UI _(includes H-PRE)_

- **Goal.** Make logging fast, optional, low-friction, non-shaming: energy/mood/stress/soreness check-in +
  one-tap quick-add for water/caffeine/alcohol/macros/tags, with **accessible-but-not-prominent** bowel
  tracking. Global quick-add bottom sheet (Home + Nutrition) **plus** a dedicated check-in screen.
- **Docs.** Spec CU-074; PRD §9.4 journey + §10.12 (under-20s, optional, no nag); UI/UX §15
  (UX-INPUT-001..004) + §6.6 Quick Add; loading/empty/stale + a11y + motion rules + §21 checklist.
- **Prior same-phase artifacts.** Binds to CU-069–073 DTOs (typed mock adapters). Ships H-PRE primitives.
- **Build on.** H-PRE primitives; `@primis/design-system` tokens/components; react-query + `localDashboard
Cache` pattern; `endpoints.ts`; mock pattern in `src/mocks/*`; check-in DTOs from `@primis/api-contracts`.
- **Files.** H-PRE design-system files; extend `apps/mobile/src/api/endpoints.ts` (CHECKINS, HYDRATION,
  CAFFEINE, ALCOHOL, DIGESTION, NUTRITION, TAGS, TAG_EVENTS); `src/api/hooks/{useQuickAdd,useCheckin}.ts`
  (mock-first mutations + optimistic update); `src/mocks/{checkins,lifestyle,nutrition,digestion,tags}.ts`;
  `src/features/checkin/*` (`CheckInScreen` + `checkinModel.ts` + components); `src/features/quickAdd/*`
  (`QuickAddSheet` + sub-forms water/caffeine/alcohol/macros/tag + `quickAddModel.ts`); `app/check-in.tsx`;
  entry points from Home + Nutrition; tests `apps/mobile/test/{checkin,quickAdd}/…`.
- **In scope.** Sub-20s check-in (energy/mood/stress/soreness selectors, optional notes); quick-add chips
  with unit toggles (water oz/ml, caffeine mg/quick-presets, alcohol range/type, macros); optimistic
  local-first reflection of new logs; discreet, opt-in digestion entry (Bristol 1–7 etc.) reachable but not
  surfaced as a daily prompt; non-shaming copy (no "you missed…", no streak guilt).
- **Out of scope.** Real network writes (mock-first; hooks are the swap seam), Nutrition tab screen
  (CU-075), AI, food search, scoring.
- **Acceptance.** Check-in completes in seconds with all fields optional; water/caffeine/alcohol/macros log
  in ≤2 taps; bowel tracking present but unobtrusive (UX-INPUT-002 mature/clinical, not childish); no
  shaming/nagging anywhere; token-driven; dark+light+accent; 44pt; a11y labels; reduced motion; loading/
  empty/error states; pure model helpers node-tested.
- **Verify.** `pnpm --filter @primis/design-system test && pnpm --filter @primis/mobile typecheck && pnpm --filter @primis/mobile test && pnpm lint && pnpm format:check`.
- **UI/UX bar.** Logging feels like a high-leverage optional layer, not a chore; instant feedback;
  digestion discreet; no fake precision.
- **Pitfalls.** No heavy transforms on render (precompute in model/adapter); don't make any field required;
  keep mock adapter return types == DTOs; never render raw S3 notes prominently; no nag/streak mechanics.
- **Ask first?** No (mock-first; UX confirmed: global sheet + check-in screen).
- **Commit.** `mobile: add quick check-in and lifestyle logging UI (CU-074)`

### CU-075 — Nutrition tab v1

- **Goal.** Replace the Nutrition stub with a practical performance dashboard: calories/protein/carbs/fat,
  hydration, caffeine (amount + latest time), alcohol (amount/type/range), meal timing, quick-add actions,
  manual-estimate labeling, and loading/empty/stale states — **no food database**.
- **Docs.** Spec CU-075; UI/UX §6.6 (screen structure + UX-NUT-001..004); PRD §10.11; loading/empty/stale
  - a11y + §21 checklist.
- **Prior same-phase artifacts.** CU-072 (`GET /api/v1/nutrition` DTO), CU-074 (QuickAdd sheet + primitives),
  CU-070 lifestyle fields in the summary.
- **Build on.** `@primis/api-contracts` nutrition/lifestyle DTOs; `src/features/quickAdd/QuickAddSheet`;
  design-system `RingProgress`/`ProgressBar`/`BarChart`/`MetricValue`; `src/mocks/nutrition.ts`;
  `localDashboardCache` local-first pattern.
- **Files.** `apps/mobile/app/(tabs)/nutrition.tsx` (replace stub); `src/features/nutrition/NutritionScreen.tsx`
  - `nutritionModel.ts` + `components/*` (`NutritionHero`, `MacroProgressCard`, `BehaviorInputsCard`,
    `QuickAddRow`, `ManualEstimateBadge`, empty/stale states); `src/api/hooks/useNutritionDetail.ts`; extend
    `src/mocks/nutrition.ts` (normal / partial / empty / stale variants); tests
    `apps/mobile/test/nutrition/nutritionModel.test.ts`.
- **In scope.** Hero (calories/protein/hydration state); macro progress (calories/protein/carbs/fat);
  behavior inputs (caffeine + latest time, alcohol amount/type, meal timing, custom tags); quick-add actions
  reusing CU-074 sheet; clear "manual estimate" labeling where `ai_estimated`/`entry_method='manual_macros'`;
  loading (cached-first)/empty/stale states; a correlations slot as a non-AI placeholder.
- **Out of scope.** Full FDC search/saved/user foods, barcode, photo, AI meal estimate/coaching, scoring,
  bottom-tab changes.
- **Acceptance.** Shows calories/protein/carbs/fat + hydration/caffeine/alcohol + meal timing; quick-add
  works; manual estimates clearly labeled (UX-NUT-003); no food-search UI (UX limits); empty/stale handled;
  token-driven; dark+light+accent; a11y chart summaries; renders cached-first.
- **Verify.** `pnpm --filter @primis/mobile typecheck && pnpm --filter @primis/mobile test && pnpm lint && pnpm format:check`.
- **UI/UX bar.** Fast, practical, performance-oriented; honest that it's lightweight, not a full tracker;
  one hero; no fake precision.
- **Pitfalls.** Don't fabricate macros when missing (empty states, not zeros); no heavy transforms on render
  (pure `nutritionModel.ts`); keep the hook return type == DTO; reuse the QuickAdd sheet rather than
  re-implementing inputs.
- **Ask first?** No.
- **Commit.** `mobile: implement Nutrition v1 tab (CU-075)`

---

## 7. Phase-Level Guardrails (apply to every CU)

- **Schema is frozen.** No migrations/column/enum changes; tables already exist. If something seems
  missing, STOP and propose an ADR (`.ai-agent-instructions.md` Rule 2).
- **No new scoring formulas.** Only simple daily summation/latest-time roll-up of manual entries (ADR-008);
  `nutrition_score` + targets stay Phase-F-owned and untouched. Manual inputs must not dominate objective
  scores.
- **No medical/diagnostic language** anywhere (UI, copy, validation messages, comments) — especially
  digestion; framing is trends/correlations only; performance, not therapy.
- **Non-shaming UX.** No nagging, no guilt, no streak penalties for missed logs; every field optional.
- **Nutrition scope limits.** No FDC search/import, no MyFitnessPal API/scraping, no barcode, no photo/label
  logging, no AI meal estimation. Manual macros only; FDC-ready data shape preserved.
- **AI-free.** No model calls, prompts, context builders, or gateway. AI consumption is Phase I.
- **Canonical units only.** Use `@primis/health-metrics` `convertUnit` + canonical codes (`hydration_ml`,
  `caffeine_mg`, `alcohol_standard_drinks`, `protein_g`, …); never store display units in canonical columns.
- **Time conventions.** Store `occurred_at_utc` (UTC) + `local_date` (YYYY-MM-DD) + `timezone`; validate
  date format; `updated_at` set in app layer (D-A-008).
- **Ownership + safety.** Every query filtered by `internalUserId`; envelope responses
  (`makeSuccessResponse`/`makeErrorResponse`); validate request bodies with Zod; **never log raw S2/S3
  health values or notes**; no secrets/real provider calls.
- **Mobile discipline.** Design-system tokens/components only (no hex/magic numbers); mock-first typed
  adapters are the only data seam; no heavy transforms/scoring on render — pure node-tested `…Model.ts`;
  handle loading(cached-first)/empty/stale/missing; 44pt + a11y + reduced motion; pass the §21 checklist.
- **Source docs are read-only.** No source-of-truth rewrites; capture material conflicts as ADRs.

---

## 8. Handoff Prompt Template (per CU, for Cursor agents)

```
You are implementing <CU-ID> — <title> for Primis, on branch feature/manual-inputs-nutrition-v1.
Read first: docs/README.md (precedence), .ai-agent-instructions.md, CONTRIBUTING.md,
primis_full_implementation_spec_commit_plan.md §§2/3/3.5/4 + <CU-ID>, the docs under "<CU-ID> — Docs"
in plans/phase-h-manual-inputs-nutrition-v1.md, and (for CU-070/CU-072) docs/decisions/ADR-008. Re-read
the CU section + §7 guardrails here.

Scope: implement ONLY <CU-ID> — in-scope items, nothing from out-of-scope. The Phase H tables already
exist (000005_domain_tables.sql) — DO NOT add or alter migrations/columns/enums.

Backend CUs (069–073): vertical slice = api-contracts DTO (interface + Zod schema + fixture) →
add missing repo READ methods (writes already exist in manualInput/nutritionRepository) → route
(routes/sleep.ts DI shape + me.ts/onboarding.ts body-validation) → register in app.ts → contract + route
tests (app.request() with injected mock deps; cover create/list/validation/ownership). Optional + range/
enum-validated + UTC+local_date+timezone + user-owned. Canonical units via @primis/health-metrics
convertUnit. Envelope responses. Never log raw S2/S3 values.

Mobile CUs (074–075): design-system tokens/components only; mock-first typed adapter hooks whose read
types == the Phase H DTOs; optimistic local-first updates; no heavy transforms/scoring on render (pure
…Model.ts, node-tested); loading(cached-first)/empty/stale/missing; non-shaming, no nag; manual estimates
labeled; digestion discreet; no medical language.

Build on: <prior same-phase artifacts + existing files/contracts in the CU section>.
Deliver: the files listed in the CU section + tests.
Verify (must exit 0): <CU verification commands> + repo gate `pnpm lint && pnpm typecheck && pnpm test &&
pnpm format:check`. Satisfy acceptance criteria (and §21 UI/UX checklist for mobile CUs).
Commit once: `<recommended commit message>`. Do not start another CU.
If you hit a schema/contract/source-doc conflict, STOP and propose an ADR — do not change schema/contracts
silently.
```

## 9. Definition of Done for Phase H

- [ ] CU-069…CU-075 (+ H-PRE) committed on `feature/manual-inputs-nutrition-v1`, one commit per CU, correct
      `<area>: <summary> (<CU-ID>)` messages.
- [ ] ADR-008 authored/ratified and referenced by CU-070 + CU-072.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` pass at repo root.
- [ ] No migrations/schema changes; no new scoring formulas; `nutrition_score`/targets untouched.
- [ ] Each backend domain has: api-contracts DTO+schema+fixture (+ test), repo reads, route(s) registered
      in `app.ts`, route tests (create/list/validation/ownership). All inputs optional + validated +
      UTC/local_date/timezone + user-owned. Daily roll-up idempotent + tested (CU-070/072).
- [ ] No FDC/MFP/barcode/photo/AI; no medical/diagnostic language; no shame/nag UX; no raw S2/S3 in logs;
      canonical units only.
- [ ] H-PRE primitives exported + tested. Mobile: quick-add ≤2 taps; check-in <20s; digestion discreet;
      Nutrition tab replaces stub; manual estimates labeled; loading(cached-first)/empty/stale handled;
      token-driven; dark+light+accent; 44pt; a11y; reduced motion; §21 checklist passed.
- [ ] Mock-first typed adapters are the only mobile data seam (return types == DTOs).
- [ ] Single PR from `feature/manual-inputs-nutrition-v1` summarizing all CUs.

## 10. Known Risks / Decisions to Defer

- **Daily-summary ownership (ADR-008) — highest risk.** Per the user's directive, Phase H adopts the
  best-practice **derived-projection + shared idempotent aggregation + write-through freshness** design and
  documents it in ADR-008. The **worker reuse** of the same pure fn (so batch reconcile matches write-through)
  is a Phase F/I follow-up, **not** built in Phase H. If ADR-008 isn't ratified, CU-070/CU-072 must stop.
- **Provider vs manual collision in the summary.** The aggregation fn must union manual-derived and
  provider-derived inputs so neither path clobbers the other (last-writer-wins on identical deterministic
  values). Validate with a test where both contribute.
- **Check-in tags timing.** Tags-on-check-ins ship in CU-073 (linked `tag_events`), not CU-069; keep CU-069
  scalar-only.
- **Manual inputs → scoring** is deferred to a later phase (no formula changes now); ensure DTOs/tables are
  rich enough for that future without schema change (they are).
- **Live API wiring deferred.** Mobile adapters isolate the mock→`/api/v1/*` swap; integration tests are a
  later hardening phase.
- **ADR numbering.** ADR-007 is informally reserved by the Phase G plan (bedtime endpoint); Phase H uses
  ADR-008. Confirm no collision when authoring.

## 11. Open Questions / Assumptions

- **A0 (blocking-ish — confirm before first commit):** Working branch is `feature/manual-inputs-nutrition-v1`
  (created); the task's workflow assumption says `phase/phase-h-manual-inputs-nutrition-v1`. **Assumption:**
  use the created `feature/…` branch, one branch, sequential commits, one PR. Rename if the team prefers the
  `phase/…` convention.
- **A1 (assumption):** ADR-008 design (derived projection + shared pure aggregation in `@primis/health-metrics`
  - write-through upsert + precomputed reads + local-first optimistic UI) is the ratified best-practice path.
- **A2 (assumption):** URL scheme — `/api/v1/checkins`, `/api/v1/hydration`, `/api/v1/caffeine`,
  `/api/v1/alcohol`, `/api/v1/lifestyle` (read), `/api/v1/digestion`, `/api/v1/nutrition(/entries)`,
  `/api/v1/tags(/events)`. Mutation endpoints are append-only events with **no idempotency key** in v1.
- **A3 (assumption):** Form-input primitives live in `@primis/design-system` (H-PRE), reused by CU-074/075,
  per the Phase G precedent of adding shared primitives to the design system.
- **A4 (assumption):** CU-069 check-ins support create + list-by-date + PATCH-by-id (correction); check-ins
  are events (no upsert/dedup key).
- **A5 (assumption):** Digestion has no daily-summary aggregation (not a `daily_nutrition_summaries` field);
  it's stored for future correlation only.
- **Q1 (non-blocking):** Should `GET /api/v1/lifestyle` and `GET /api/v1/nutrition` be merged into one
  Nutrition-tab payload endpoint, or kept separate? Default: keep separate; CU-075 composes them in the hook.
- **Q2 (non-blocking):** Caffeine quick presets (e.g. coffee=95mg) — ship a small fixed preset list in CU-074
  mocks, or free-entry only? Default: a small preset list + free entry, presets defined in the mobile layer
  (no new source-doc data).

## 12. Next Phase Preview (Phase I awareness only)

Phase I (AI Context Engine + AI Coach) consumes exactly the tables/DTOs Phase H produces: the
`manual_inputs`, `nutrition`, `hydration`, `caffeine`, `alcohol`, `custom_tags`, and `gut_digestion`
context domains (AI-context §8) feed `ManualInputContextBuilder`/`NutritionContextBuilder`/
`GutDigestionContextBuilder` (§10.6/10.7/10.12), under strict non-moralizing, non-diagnostic, estimate-
labeling rules (§13.7/13.8). Phase H must therefore: keep `notes` summarizable/bounded (never dumped),
preserve `ai_estimated`/`entry_method`/`data_quality` flags so AI can distinguish manual vs estimated, and
keep tag-events linkable for correlations. **No Phase I code, prompts, or model calls in Phase H.**

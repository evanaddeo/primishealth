# Phase G — Core App Surfaces (CU-058 → CU-068)

> Implementation-ready plan for sequential Cursor-agent execution. One CU = one commit on
> `feature/core-app-surfaces`. Read this whole file once, then execute CUs in dependency order.
> Source-of-truth precedence: follow `docs/README.md` authority order; on a material conflict,
> propose an ADR under `docs/decisions/` rather than silently choosing.

## 1. Goal & Non-Goals

**Goal.** Build the premium, local-first user-facing surfaces that turn Phase F precomputed scores,
summaries, insights, and bedtime output into a fast, athletic, high-signal product: onboarding, auth
shell, provider connection, Home + customization, Sleep, Bedtime Planner, Recovery, Activity,
Vitals/Body Composition, and a reusable score-explanation pattern.

**Non-goals (Phase G).**

- No backend routes, DB migrations, scoring algorithms, provider sync, live OAuth, or AI model calls.
- No Phase H manual inputs / nutrition implementation (awareness only).
- No real provider credentials, no direct Google Health calls from mobile, no secrets.
- No scoring computation or heavy chart/data transforms in mobile render/mount paths.
- No reordering of bottom tabs (UX-NAV-002).
- No medical/diagnostic language anywhere.

## 2. Current Repo State (what A–F already built)

**Tooling / conventions.** pnpm workspace (`apps/*`, `services/*`, `packages/*`, `infrastructure/*`);
strict TS (`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`);
ESLint + Prettier (100-col, single quotes, trailing commas); Vitest via root `vitest.workspace.ts`
(packages own `vitest.config.ts`); CI gate `pnpm lint && pnpm typecheck && pnpm test && pnpm
format:check`. Commit format `<area>: <imperative summary> (<CU-ID>)`. See `CONTRIBUTING.md`,
`.ai-agent-instructions.md`, `docs/README.md`.

**Mobile (`apps/mobile`).** Expo Dev Client + Expo Router. Providers in `app/_layout.tsx`
(GestureHandlerRootView → SafeAreaProvider → ThemeProvider → QueryClientProvider → Stack). Tabs in
`app/(tabs)/_layout.tsx` (Home, Sleep, Recovery, Activity, Nutrition, AI Coach — LOCKED order).
Screens are stubs. State: `src/state/settingsStore.ts` (MMKV: theme/accent/coach/summary/onboarding)
and `src/state/widgetStore.ts` (`DEFAULT_WIDGET_ORDER`, `widgetOrder`, `hiddenWidgets:Set`,
`setWidgetOrder`, `toggleWidget`, `useWidgetStore`). API: `src/api/{endpoints,queryClient,client}.ts`.
Cache: `src/cache/localDashboardCache.ts`. Mocks: `src/mocks/{dashboard,sleep,recovery,activity,ai}.ts`.
Hook: `src/hooks/useReducedMotion.ts`.

**Design system (`packages/design-system`).** Tokens (`colors/darkColors/lightColors/accentColors/
statusColors`, `spacing`, `typography/typeScale/fontWeight`, `radius`, `shadows`, `motion/durations/
easings`); theme (`createTheme`, `DEFAULT_THEME`, `ThemeContext`, `useTheme`, `useThemeSafe`,
`ThemeMode`, `AccentColor`); components (`Screen`, `Card`, `Text`, `Button`, `MetricValue`,
`StatusBadge`, `ProgressBar`); motion (`timing`, `transitions`, `useReducedMotion`); charts
(`LineChart`, `StageTimeline`, `RingProgress` + `chartResolvers`). **Missing: `BarChart`,
`Sparkline`** → added in G-PRE.

**Contracts (`packages/api-contracts/src`).** `dashboard.ts` (`TodayDashboardResponseDto`,
`DashboardScoresDto`, `InsightCardDto`, `RecommendationCardDto`, `DashboardWidgetSummaryDto`,
`BedtimeWidgetSummaryDto`, `ProviderFreshnessDto`), `sleep.ts` (`SleepDetailResponseDto`,
`SleepSummaryDto`, `SleepStagesDto`, `SleepStageSegmentDto`, `SleepOvernightVitalsDto`, `SLEEP_STAGES`),
`recovery.ts` (`RecoveryDetailResponseDto`, `RecoveryVitalsDto`, `RecommendedIntensityDto`,
`RECOMMENDED_INTENSITY_LEVELS`), `activity.ts` (`ActivityDetailResponseDto`, `ActivitySummaryDto`,
`WorkoutSummaryDto`), `vitals.ts` (`VitalsDetailResponseDto`, `VitalsMetricsDto`,
`VitalsBaselineDeviationsDto`), `scores.ts` (`ScoreSnapshotDto`, `ScoreComponentDto`, `ScoreDriverDto`,
`MissingMetricDto`, `ScoreQualityMetadataDto`), `chart.ts` (`ChartPointDto`, `TrendSeriesDto`),
`onboarding.ts`/`user.ts` (`UserProfileDto`, `GoalItemDto`, `CoachPreferencesDto`, `ThemePreferenceDto`,
`GoalCode`, `ConsentType`, onboarding request DTOs), `providerConnections.ts` (`ProviderConnectionDto`,
`ListConnectionsResponseDto`, `ProviderCapabilitiesDto`, `DisconnectConnectionResponseDto`,
`StartAuthorizationResponseDto`), `sync.ts` (`SyncStatusDto`, `ManualSyncResponseDto`).

**Core types / metrics / scoring.** `@primis/core-types`: `ScoreType`, `ScoreState`,
`ScoreConfidence`, `ScoreBand`, `scoreToBand()`, `ProviderCode`, `ConnectionStatus`,
`ProviderDataAvailabilityStatus`. `@primis/health-metrics`: `METRIC_DEFINITIONS`, `getMetric()`,
category code lists, `convertUnit()`. `@primis/scoring/src/bedtime`: `BedtimePlannerResult`,
`BedtimeWindow`, `BedtimeLabel` (`best|good|last_acceptable|emergency`), `BedtimeFitComponents`,
`BedtimeNotes`, `BedtimePlannerInput`, `WakeFlexibility`, `TrainingImportance` (use as the **shape**
for the bedtime mock; do not run the engine in render paths).

**Backend routes available to mirror in mock shapes (read-only for Phase G).**
`GET /api/v1/dashboard/today`, `/api/v1/sleep`, `/api/v1/recovery`, `/api/v1/activity`,
`/api/v1/vitals` (all accept `?date=YYYY-MM-DD`, precomputed-only — ADR-005, ADR-006);
`GET /api/v1/me`, onboarding POSTs, provider connection + sync endpoints.

**ADRs that affect Phase G UI.** ADR-001 (provider codes), ADR-004 (`activity_score` mapping),
ADR-005 (dashboard `/today` shape), ADR-006 (detail endpoints precomputed-only),
`docs/decisions/google-health-api-metric-availability.md` (availability / unverified / stale language —
proprietary provider scores are NOT raw fields; Primis computes its own).

**Repo drift to account for.**

- No Bedtime Planner API route (only `BedtimeWidgetSummaryDto`). → CU-064 uses mock shaped to
  `BedtimePlannerResult`; propose ADR for future `/api/v1/bedtime`.
- Design-system lacks `BarChart`/`Sparkline`. → G-PRE adds them.
- Missing mocks (vitals, body-composition, bedtime, connections, onboarding) created by their CUs.
- Tabs do not include a standalone Vitals/Body-Comp tab — these are drill-down stack routes
  (`app/vitals`, `app/body-composition`), reached from Recovery/Home, per UX IA.

## 3. Required Reading (per execution)

Always: `docs/README.md` (precedence), `.ai-agent-instructions.md`, `CONTRIBUTING.md`,
`docs/source-of-truth/primis_full_implementation_spec_commit_plan.md` §§2, 3, 3.5, 4 + the target CU.
UI: `primis_ui_ux_design_system_spec.md` §0 (agent rules), brand/IA, the relevant screen section,
and the component/motion/loading/empty/stale/a11y rules + the §21 pre-acceptance checklist.
Product: `primis_product_requirements_document.md` for the matching screen + performance-only / no-
diagnostic constraints. Scoring (states/bands only): `primis_scoring_algorithms_spec.md` §6.
AI safety: `primis_ai_context_engine_spec.md` (placeholder-only behavior). Provider/staleness:
`primis_google_health_api_feature_parity_matrix.md` + `docs/decisions/google-health-api-metric-availability.md`.
Per-CU "relevant docs" lists below name the precise sections.

## 4. Dependency Graph

```
G-PRE (design-system: BarChart + Sparkline)
   └─ feeds CU-066, CU-067 (and any trend visuals)

CU-058 onboarding shell ─┐
CU-059 auth shell ───────┤ (independent shells; 058 references the Google-login vs
CU-060 provider conn UI ─┘  Google-Health-authorization separation that 060 also surfaces)

CU-068 score explanation pattern ──┐  (build early; reused by 061/063/065/066)
                                   ▼
CU-061 Home dashboard ── needs widgetStore + 068 + mock adapters
   └─ CU-062 Home widget customization (depends on 061)

CU-063 Sleep ── needs 068; exposes entry point to ▼
CU-064 Bedtime Planner (needs bedtime mock; linked from 063 and Home bedtime widget)

CU-065 Recovery ── needs 068 (+ links to Vitals from 067)
CU-066 Activity ── needs 068 + G-PRE (BarChart)
CU-067 Vitals & Body Comp ── needs G-PRE (Sparkline)
```

**Recommended execution order:** G-PRE → CU-068 → CU-058 → CU-059 → CU-060 → CU-061 → CU-062 →
CU-063 → CU-064 → CU-065 → CU-066 → CU-067. (068 first so every score surface reuses one pattern.)

**Shared adapter convention (all data CUs).** Create typed hooks under
`apps/mobile/src/api/hooks/` (e.g. `useTodayDashboard`, `useSleepDetail`, `useRecoveryDetail`,
`useActivityDetail`, `useVitalsDetail`, `useBedtimePlan`) that return the exact Phase F DTO type and
today read from `src/mocks/*`. Each hook is the single seam where a future `fetch` against
`/api/v1/*` replaces the mock — screens never import mocks directly.

---

## G-PRE — Design-system chart primitives (BarChart, Sparkline)

- **Goal.** Add two token-driven, precomputed-input chart primitives so Activity load bars and
  Vitals/Body-Comp trends are first-class, reusable, and not ad hoc.
- **Docs.** UI/UX spec: chart rules, progress-indicator rules (UX-PROG-\*), motion + a11y (chart
  accessible summaries UX-A11Y-006). Mirror the existing `LineChart`/`RingProgress` API style.
- **Build on.** `packages/design-system/src/charts/{LineChart.tsx,RingProgress.tsx,chartResolvers.ts,
index.ts}`; tokens; `useReducedMotion`.
- **Files.** `packages/design-system/src/charts/BarChart.tsx`, `Sparkline.tsx`;
  extend `chartResolvers.ts` + `charts/index.ts`; tests under `packages/design-system/test/`.
- **In scope.** Accept precomputed, chart-ready data only (e.g. `ChartPointDto[]`/`TrendSeriesDto`
  shapes or simple numeric series). Token-driven colors/spacing; reduced-motion aware; accessible
  text summary prop; baseline-band support for Sparkline (current vs baseline).
- **Out of scope.** Data fetching, transforms, animations beyond token motion, Skia rewrite of
  existing charts. No screen wiring.
- **Acceptance.** Both render from static props; no hardcoded colors/magic numbers; unit tests cover
  resolver math + empty/missing series; exported from `charts/index.ts` and `@primis/design-system`.
- **Verify.** `pnpm --filter @primis/design-system typecheck && pnpm --filter @primis/design-system
test && pnpm lint && pnpm format:check`.
- **UI/UX bar.** Distinct from Apple rings/competitors; labels+units present; legible at small sizes.
- **Pitfalls.** Don't pull React Native Skia in if existing charts don't; match existing chart prop
  conventions; keep zero domain logic in primitives.
- **Ask first?** No.
- **Commit.** `design: add bar chart and sparkline primitives (CU-066)`
  _(area `design`; tagged to CU-066 as its enabling prerequisite — land it as the first commit of the
  Activity/Vitals block. If the team prefers, it may instead be folded into CU-066/067 commits.)_

---

## CU-058 — Onboarding UI shell

- **Goal.** First-run flow with no live auth: welcome → account placeholder → goals ranking → coach
  style → summary style → theme/accent → connect-Google placeholder → building-baseline → Home.
  Saves preferences to local store / mock API.
- **Docs.** PRD §9.1 + §10.3 (Google login vs Google Health authorization SEPARATION, quote it);
  UI/UX onboarding §7, UX-ONB-001..004, building-baseline state, empty-state rules.
- **Prior Phase-G artifacts.** None (can run after G-PRE). Pairs conceptually with CU-060 language.
- **Build on.** `settingsStore` (onboarding flags, theme/accent/coach/summary); `@primis/api-contracts`
  onboarding DTOs (`GoalCode`, `OnboardingGoalsRequestDto`, `CoachPreferencesDto`, `ThemePreferenceDto`);
  design-system primitives; Expo Router stack.
- **Files.** `apps/mobile/app/onboarding/_layout.tsx` + step routes; `src/features/onboarding/*`
  (step components, `useOnboarding` controller); extend `settingsStore`; optional
  `src/mocks/onboarding.ts`; tests.
- **In scope.** Multi-step navigation; goals ranking UI; tone/theme/accent selection bound to
  settingsStore; explicit copy distinguishing Google **login** from Google **Health** authorization;
  persists locally (and through a mock API adapter); building-baseline explainer.
- **Out of scope.** Real auth, real OAuth, provider sync, live preference POSTs to backend.
- **Acceptance.** All steps reachable + back/skip behave; selections persist across restart; the
  login-vs-health-authorization distinction is shown; token-driven; dark+light+accent OK; no secrets.
- **Verify.** `pnpm --filter @primis/mobile typecheck && pnpm --filter @primis/mobile test`.
- **UI/UX bar.** Premium athletic; one primary idea per step; no fake metrics; 44pt targets;
  reduced-motion respected; a11y labels on controls.
- **Pitfalls.** Don't gate Home on completion in a way that traps users; don't request all future
  permissions up front (UX-ONB-002); don't imply medical benefit.
- **Ask first?** No (assume mock-persist; flag any flow ambiguity in PR).
- **Commit.** `mobile: add onboarding shell and preferences flow (CU-058)`

## CU-059 — Auth UI shell

- **Goal.** Sign-in/sign-up UI + auth-state handling using mock/dev auth. Email/password + Google/
  Apple/Facebook buttons as placeholders.
- **Docs.** PRD auth requirements; Technical Architecture auth + mobile/provider auth separation
  (no mobile provider secret access); UI/UX form/button rules (UX-BTN-\*).
- **Prior Phase-G artifacts.** None; coordinates with CU-058 entry/exit.
- **Build on.** `settingsStore`/a small auth slice for mock token; design-system `Button`, inputs,
  `Screen`, `Card`; `services/api` `mockAuth` concept (dev token) — but no real wiring.
- **Files.** `apps/mobile/app/auth/*` (sign-in, sign-up); `src/features/auth/*` (`useAuth`,
  `authStore` or slice, placeholder handlers); tests.
- **In scope.** Form layout + validation; provider buttons with placeholder handlers; mock token set/
  clear; routing between auth ↔ onboarding ↔ tabs.
- **Out of scope.** Real Cognito/OAuth, real tokens/refresh, secure storage of real creds.
- **Acceptance.** Email/Google/Apple/Facebook buttons render; handlers are placeholders; dev mock
  token flips auth state; no real OAuth credentials in code; token-driven; a11y + 44pt.
- **Verify.** `pnpm --filter @primis/mobile typecheck && pnpm --filter @primis/mobile test`.
- **UI/UX bar.** Clean, premium, fast; full-screen blocking loader allowed only during auth
  transitions (UX-LOAD); error/disabled states explain themselves.
- **Pitfalls.** No hardcoded client IDs/secrets; don't fake "logged in with Google" success states
  that imply real OAuth.
- **Ask first?** No.
- **Commit.** `mobile: add auth UI shell (CU-059)`

## CU-060 — Provider connection UI

- **Goal.** Let users see Google Health connection state and (in mock mode) initiate connection.
  States: disconnected, connecting, active, stale, needs-reauth, unavailable.
- **Docs.** PRD Google Health; UI/UX permission UX + stale/missing language; **REQUIRED**
  `docs/decisions/google-health-api-metric-availability.md` + parity matrix (availability,
  unverified-metric, staleness wording; proprietary scores not raw fields).
- **Prior Phase-G artifacts.** Reuses CU-058's login-vs-authorization framing.
- **Build on.** `@primis/api-contracts` `providerConnections.ts` + `sync.ts` DTOs
  (`ProviderConnectionDto`, `ListConnectionsResponseDto`, `ProviderCapabilitiesDto`, `SyncStatusDto`,
  `StartAuthorizationResponseDto`, `DisconnectConnectionResponseDto`); `@primis/core-types`
  `ConnectionStatus`/`ProviderDataAvailabilityStatus`; design-system.
- **Files.** `apps/mobile/app/settings/connections.tsx`; `src/features/connections/*`
  (`useConnections` adapter → mock, `ConnectionCard`, capability/freshness UI);
  `src/mocks/connections.ts`; tests.
- **In scope.** Google Health as primary connection; all six status states with correct copy;
  permission/freshness explanation; capabilities list (available/unverified); mock authorize +
  disconnect actions via adapter; staleness indicator from `ProviderFreshnessDto`/`SyncStatusDto`.
- **Out of scope.** Real OAuth/redirects, real sync, secret handling, additional providers beyond
  the planned set (Google Health primary).
- **Acceptance.** Each state renders with non-medical, accurate language; unverified metrics labeled;
  stale state shown without alarm; mock authorize/disconnect update UI; token-driven; a11y.
- **Verify.** `pnpm --filter @primis/mobile typecheck && pnpm --filter @primis/mobile test`.
- **UI/UX bar.** Calm, trustworthy; status never color-only (UX-COLOR-001); freshness subtle.
- **Pitfalls.** Don't claim provider metrics are confirmed (§2.6); don't render raw provider payloads;
  no direct Google calls.
- **Ask first?** No.
- **Commit.** `mobile: add health connection UI (CU-060)`

## CU-061 — Local-first Home dashboard

- **Goal.** Daily command center that renders instantly from cache/mock, shows the 8 default widgets
  in spec order, a hero state, progress row, recommendation, freshness indicator, and per-card
  drill-down — with no AI/scoring on the render path.
- **Docs.** PRD Home; UI/UX §6.1 (Home layout, default widget order, UX-AC-HOME-001..005); Technical
  Architecture local-first perceived performance (UX-CORE-002 <3s warm).
- **Prior Phase-G artifacts.** CU-068 (ScoreCard/explanation), widgetStore, mock adapters.
- **Build on.** `widgetStore.DEFAULT_WIDGET_ORDER` (recovery_score, sleep_score, sleep_debt,
  steps_activity, calories_burned, training_readiness, hrv_trend, todays_recommendation);
  `@primis/api-contracts` `TodayDashboardResponseDto`/`DashboardScoresDto`/`InsightCardDto`/
  `BedtimeWidgetSummaryDto`/`ProviderFreshnessDto`; `localDashboardCache`; `src/mocks/dashboard.ts`;
  design-system (`Card`, `RingProgress`, `ProgressBar`, `StatusBadge`, `MetricValue`).
- **Files.** `apps/mobile/app/(tabs)/index.tsx`; `src/features/home/HomeScreen.tsx`,
  `src/features/home/widgets/*` (one component per widget type), `src/api/hooks/useTodayDashboard.ts`;
  extend `src/mocks/dashboard.ts` for normal/low/stale/missing variants; tests.
- **In scope.** Cached-first render; hero (Recovery/Sleep) + progress row + recommendation + ordered
  widget stack honoring `widgetOrder`/`hiddenWidgets`; subtle freshness/stale chip; each card taps to
  its detail; loading shows cached content not blank spinner.
- **Out of scope.** Widget editor UI (CU-062), live AI summary generation, on-device score compute,
  fetching raw history on mount.
- **Acceptance.** Renders with mock instantly; default order matches `DEFAULT_WIDGET_ORDER`; exactly
  one hero; stale state visible non-blocking (UX-AC-HOME-004); cards navigate; handles missing/
  provisional per-widget; token-driven; dark+light+accent; a11y summaries on score cards.
- **Verify.** `pnpm --filter @primis/mobile typecheck && pnpm --filter @primis/mobile test`.
- **UI/UX bar.** <3s warm; strong hierarchy; no generic AI-dashboard clutter; ≤1 hero (UX-AC-HOME-005).
- **Pitfalls.** No heavy transforms in `HomeScreen` body — precompute in adapter/mock; don't block on
  AI; don't fabricate metrics when missing.
- **Ask first?** No.
- **Commit.** `mobile: implement local-first Home dashboard (CU-061)`

## CU-062 — Home widget customization

- **Goal.** Show/hide and reorder Home widgets; persist across restarts. No bottom-tab reordering.
- **Docs.** PRD customization; UI/UX Home customization, UX-NAV-002, UX-CORE-004.
- **Prior Phase-G artifacts.** CU-061 Home + its widget components.
- **Build on.** `widgetStore` (`setWidgetOrder`, `toggleWidget`, `hiddenWidgets`, `widgetOrder`).
- **Files.** `apps/mobile/app/settings/home-widgets.tsx`; `src/features/home/EditHomeScreen.tsx`
  (+ reorderable list, visibility toggles); tests for store interactions.
- **In scope.** Toggle visibility; reorder via simple list (drag or up/down controls); persistence;
  reset-to-default; entry point from Home/settings.
- **Out of scope.** Tab reordering; adding net-new widget types beyond those defined; server sync of
  layout.
- **Acceptance.** Toggle + reorder mutate widgetStore and persist across restart; Home reflects
  changes; bottom tabs unchanged; token-driven; 44pt targets; a11y on controls.
- **Verify.** `pnpm --filter @primis/mobile test && pnpm --filter @primis/mobile typecheck`.
- **UI/UX bar.** Customization feels useful not decorative; immediate feedback (<100ms press).
- **Pitfalls.** Keep `hiddenWidgets` Set serialization intact (store already handles Set↔array);
  don't desync order vs hidden state.
- **Ask first?** No.
- **Commit.** `mobile: add Home widget customization (CU-062)`

## CU-063 — Sleep screen

- **Goal.** Premium Sleep screen from detail mock/API: Sleep Score hero, stage timeline (with missing-
  stage fallbacks), key metrics, sleep debt + consistency, contributors (tappable → CU-068), AI summary
  placeholder, and a visible Bedtime Planner entry point.
- **Docs.** PRD Sleep; UI/UX §6.2 + V1.1 SleepStageTimeline amendment, sleep detail states
  (full_stages/classic_sleep/summary_only/session_only/stages_processing/stages_rejected/no_sleep_data),
  UX-SLEEP-001..004; Scoring §6 (states/confidence only).
- **Prior Phase-G artifacts.** CU-068 (contributors/explanation), bedtime entry leads to CU-064.
- **Build on.** `@primis/api-contracts` `SleepDetailResponseDto`/`SleepSummaryDto`/`SleepStagesDto`/
  `SleepStageSegmentDto`/`SleepOvernightVitalsDto`/`SLEEP_STAGES`; design-system `StageTimeline` +
  `LineChart`; `src/mocks/sleep.ts`; chart resolvers.
- **Files.** `apps/mobile/app/(tabs)/sleep.tsx`; `src/features/sleep/SleepScreen.tsx`,
  `src/features/sleep/components/*`, `src/api/hooks/useSleepDetail.ts`; extend `src/mocks/sleep.ts`
  with stage/missing-state variants; tests.
- **In scope.** Score hero; stage timeline using precomputed segments with 4-stage + classic 2-stage
  fallback + missing/processing states; metrics grid; debt + consistency trend; contributors via
  CU-068; AI summary placeholder (no model call); Bedtime Planner card/CTA.
- **Out of scope.** Bedtime computation (CU-064), real AI, on-device stage computation.
- **Acceptance.** Renders all sleep detail states cleanly; timeline legible + has accessible summary
  (UX-A11Y-006); contributors open the shared sheet; bedtime entry present (UX-SLEEP-004); no fake
  precision; token-driven; dark+light+accent.
- **Verify.** `pnpm --filter @primis/mobile typecheck && pnpm --filter @primis/mobile test`.
- **UI/UX bar.** Google-Health-class timeline richness, not a generic chart; one hero.
- **Pitfalls.** Don't render tiny illegible segments without legend (UX-SLEEP-001); handle null
  stages; no heavy transforms on mount — segments come precomputed from adapter/mock.
- **Ask first?** No.
- **Commit.** `mobile: implement Sleep screen (CU-063)`

## CU-064 — Bedtime Planner screen

- **Goal.** Pick a wake time → show ranked bedtime **windows** (best/good/last_acceptable[/emergency])
  with latency adjustment, sleep-debt note, circadian-consistency note, and confidence — never exact
  certainty.
- **Docs.** PRD bedtime; UI/UX §6.3 (UX-BED-001..005, UX-AC-BED-001..005); Scoring bedtime planner
  output model (§10.7.x) for the result shape only.
- **Prior Phase-G artifacts.** Linked from CU-063 (Sleep) and the Home bedtime widget (CU-061).
- **Build on.** `@primis/scoring/src/bedtime` types (`BedtimePlannerResult`, `BedtimeWindow`,
  `BedtimeLabel`, `BedtimeFitComponents`, `BedtimeNotes`, `BedtimePlannerInput`, `WakeFlexibility`,
  `TrainingImportance`) as the mock/adapter shape; design-system; time-picker.
- **Files.** `apps/mobile/app/sleep/bedtime-planner.tsx`; `src/features/bedtime/*`
  (`BedtimeWindowCard`, wake-time picker, optional presets), `src/api/hooks/useBedtimePlan.ts`
  (returns `BedtimePlannerResult` from mock today); `src/mocks/bedtime.ts`; tests.
- **In scope.** Prominent wake-time selection; optional inputs (flexibility, training importance,
  desired duration); ranked windows from the typed adapter (mock); per-window explanation
  (latency/cycle/debt/circadian/confidence); "window" language; optional "save reminder later" stub.
- **Out of scope.** Running the scoring engine in render path; real reminders/notifications; a backend
  bedtime route (see ADR proposal in §Risks).
- **Acceptance.** User sets wake time; ranked windows render; each explains latency/cycle/debt/
  circadian + confidence; no exact-cycle certainty claims (UX-AC-BED-004); wake time prominent;
  token-driven; a11y.
- **Verify.** `pnpm --filter @primis/mobile typecheck && pnpm --filter @primis/mobile test`.
- **UI/UX bar.** Calm, confident, honest about uncertainty; deterministic output is source of truth.
- **Pitfalls.** Don't say a single exact bedtime; don't compute the plan on the JS render thread —
  compute (or mock) on submit, off the render path; keep adapter shape == `BedtimePlannerResult` so a
  future route swaps in.
- **Ask first?** No (mock-first agreed; ADR proposed for the route).
- **Commit.** `mobile: implement Bedtime Planner screen (CU-064)`

## CU-065 — Recovery screen

- **Goal.** Recovery Score + Training Readiness, recommended intensity, contributor cards, HRV/RHR
  baseline deviations, provisional/missing handling — performance-only language.
- **Docs.** PRD Recovery; UI/UX §6.4 (UX-REC-001..003 language rules); Scoring §6 + recovery bands/
  recommendation wording (states only).
- **Prior Phase-G artifacts.** CU-068 (contributors), links to CU-067 Vitals detail.
- **Build on.** `@primis/api-contracts` `RecoveryDetailResponseDto`/`RecoveryVitalsDto`/
  `RecommendedIntensityDto`/`RECOMMENDED_INTENSITY_LEVELS`; `src/mocks/recovery.ts`; design-system
  `LineChart` + `Sparkline` (baseline band).
- **Files.** `apps/mobile/app/(tabs)/recovery.tsx`; `src/features/recovery/*`,
  `src/api/hooks/useRecoveryDetail.ts`; extend `src/mocks/recovery.ts` (normal/low/provisional/
  missing); tests.
- **In scope.** Recovery hero (score + zone + recommendation); Training Readiness; recommended
  intensity band; contributor breakdown (HRV/RHR/sleep/debt/respiratory/SpO2/load/subjective) via
  CU-068; baseline-deviation visuals; trends; AI explanation placeholder.
- **Out of scope.** Score computation, subjective check-in capture (Phase H), real AI.
- **Acceptance.** Shows score + readiness + intensity + contributors + deviations; provisional/missing
  states explicit and non-alarming; performance-only wording (no "you are sick"); token-driven; a11y.
- **Verify.** `pnpm --filter @primis/mobile typecheck && pnpm --filter @primis/mobile test`.
- **UI/UX bar.** Calm intensity; low recovery never fearmongers (UX-REC-003).
- **Pitfalls.** No medical/diagnostic language; deviations shown with value + label, not color-only.
- **Ask first?** No.
- **Commit.** `mobile: implement Recovery screen (CU-065)`

## CU-066 — Activity screen

- **Goal.** Steps, calories (active/resting/total where available), floors, distance, workouts, zone
  minutes, training load (7-day vs 28-day status). No workout recording in v1.
- **Docs.** PRD Activity; UI/UX §6.5 (UX-ACT-001..003); Scoring training-load context (states only).
- **Prior Phase-G artifacts.** CU-068 (if an activity score is shown), G-PRE (`BarChart`).
- **Build on.** `@primis/api-contracts` `ActivityDetailResponseDto`/`ActivitySummaryDto`/
  `WorkoutSummaryDto`; design-system `RingProgress` (goals), `BarChart` (load), `ProgressBar`;
  `src/mocks/activity.ts`.
- **Files.** `apps/mobile/app/(tabs)/activity.tsx`; `src/features/activity/*`,
  `src/api/hooks/useActivityDetail.ts`; extend `src/mocks/activity.ts`; tests.
- **In scope.** Activity hero/progress (steps/zone-minutes/calories goals via rings/bars); workout
  cards (timestamp/type/duration/zones/calories); training-load card with acute-vs-chronic status
  (below/steady/above/well-above) using `BarChart`; distance/floors where available.
- **Out of scope.** Recording/creating workouts; live strain compute; provider sync.
- **Acceptance.** Shows the listed metrics (gracefully when absent); load status shows relation to
  baseline (UX-ACT-002); calories distinguish active/resting/total where available (UX-ACT-003);
  no recording UI; token-driven; a11y chart summaries.
- **Verify.** `pnpm --filter @primis/mobile typecheck && pnpm --filter @primis/mobile test`.
- **UI/UX bar.** High-signal, athletic; rings distinct from Apple's; bars labeled with units.
- **Pitfalls.** Don't load giant history into UI; precompute series in adapter; missing metrics get
  empty states not zeros.
- **Ask first?** No.
- **Commit.** `mobile: implement Activity screen (CU-066)` _(includes/depends on G-PRE BarChart)_

## CU-067 — Vitals & Body Composition detail screens

- **Goal.** Deeper metrics: HRV, RHR, SpO2, respiratory rate, VO2 max, weight, body fat, lean mass
  (where available), with clear source/staleness and trend-first body-composition presentation.
- **Docs.** PRD Vitals/Body Comp; UI/UX §6.8 + stale/source rules; Data Model body-composition shapes;
  parity matrix + availability decision doc.
- **Prior Phase-G artifacts.** G-PRE (`Sparkline`); reachable from Recovery (CU-065) / Home.
- **Build on.** `@primis/api-contracts` `VitalsDetailResponseDto`/`VitalsMetricsDto`/
  `VitalsBaselineDeviationsDto` + `chart.ts` (`TrendSeriesDto`); design-system `Sparkline`/`LineChart`;
  `@primis/health-metrics` for units/display names.
- **Files.** `apps/mobile/app/vitals/index.tsx`, `apps/mobile/app/body-composition/index.tsx`;
  `src/features/vitals/*`, `src/features/bodyComposition/*`,
  `src/api/hooks/useVitalsDetail.ts`; `src/mocks/vitals.ts`, `src/mocks/bodyComposition.ts`; tests.
- **In scope.** Vitals metric cards with current vs baseline (Sparkline band) + source + staleness;
  body-composition trend-first view (weight/body-fat/lean-mass over time) with source labels;
  missing/unverified states.
- **Out of scope.** Manual weight entry (Phase H), score computation, provider sync.
- **Acceptance.** Each metric shows value + source + freshness; trend-first body comp; unverified/
  stale clearly marked; absent metrics get empty states; token-driven; units via health-metrics; a11y.
- **Verify.** `pnpm --filter @primis/mobile typecheck && pnpm --filter @primis/mobile test`.
- **UI/UX bar.** Trend-over-single-number; honest about source/availability.
- **Pitfalls.** Don't present unverified provider metrics as confirmed; don't render raw payloads;
  body comp must not read like a medical chart.
- **Ask first?** No.
- **Commit.** `mobile: add vitals and body composition details (CU-067)`

## CU-068 — Score detail & explanation pattern

- **Goal.** One reusable, AI-free explanation surface (sheet/screen) any score card can open —
  components, weights, values, confidence, state, missing data, and evidence chips — shared across
  Sleep/Recovery/Readiness/Activity and future scores.
- **Docs.** UI/UX explainable-screens + ScoreCard anatomy (UX-COMP-\*), evidence-chip pattern, a11y;
  Scoring §6 component-output concepts.
- **Prior Phase-G artifacts.** Built early; consumed by CU-061/063/065/066.
- **Build on.** `@primis/api-contracts` `ScoreSnapshotDto`/`ScoreComponentDto`/`ScoreDriverDto`/
  `MissingMetricDto`/`ScoreQualityMetadataDto`; `@primis/core-types` `ScoreState`/`ScoreConfidence`/
  `ScoreBand`/`scoreToBand()`; design-system `StatusBadge`/`ProgressBar`/`Card`/`Text`.
- **Files.** `apps/mobile/src/components/ScoreDetailSheet.tsx`, `ScoreContributorList.tsx`,
  `EvidenceChip.tsx`, `ScoreCard.tsx` (shared card if not already present); tests.
- **In scope.** Reusable `ScoreCard` (label/value/status/one-line reason/trend/drilldown) + detail
  sheet rendering components with weights/values, confidence, state, missing-data list, evidence
  chips; consistent across score types; pure presentational (data passed in).
- **Out of scope.** Any score math; AI explanation generation; per-screen bespoke variants.
- **Acceptance.** Any score card opens the shared sheet; shows weights/values/state/confidence/missing
  data without AI; identical UX across Sleep/Recovery/Readiness/Activity; token-driven; a11y labels on
  score values + chips (UX-A11Y-005).
- **Verify.** `pnpm --filter @primis/mobile typecheck && pnpm --filter @primis/mobile test`.
- **UI/UX bar.** Makes every score explainable in seconds; no fake precision; no color-only meaning.
- **Pitfalls.** Keep it presentational/generic — don't couple to one screen's data; map `ScoreState`/
  `ScoreConfidence` to clear, non-medical copy.
- **Ask first?** No.
- **Commit.** `mobile: add reusable score explanation pattern (CU-068)`

## 5. Phase-Level Guardrails (apply to every CU)

- Use design-system tokens/components/motion/charts only — **no ad hoc styling**, hex, or magic numbers.
- No generic AI-dashboard layout; honor brand (premium, athletic, high-signal) + §19 anti-slop list.
- No raw provider payload rendering; no direct Google Health calls from mobile; no real OAuth creds/secrets.
- No AI model calls — AI summaries are placeholders (`primis_ai_context_engine_spec.md`).
- No scoring computation or heavy chart/data transforms in render/mount paths — precompute in adapters/mocks.
- No medical/diagnostic language; performance-only; prefer "appears/suggests/may"; never claim provider
  metrics are confirmed (§2.6).
- No Phase H nutrition/manual-input implementation; no bottom-tab reordering.
- No backend/DB/schema work unless a narrow contract mismatch blocks a CU — then stop and propose an ADR
  (do not silently change contracts).
- Every data screen handles loading (cached-first), empty, stale, missing, and provisional states.
- Pass the §21 UI/UX pre-acceptance checklist before marking a CU done.

## 6. Handoff Prompt Template (per CU, for Cursor agents)

```
You are implementing <CU-ID> — <title> for Primis, on branch feature/core-app-surfaces.
Read first: docs/README.md (precedence), .ai-agent-instructions.md, CONTRIBUTING.md,
primis_full_implementation_spec_commit_plan.md §§2/3/3.5/4 + <CU-ID>, and the docs listed under
"<CU-ID> — relevant docs" in plans/phase-g-core-app-surfaces.md. Also re-read the CU section here.

Scope: implement ONLY <CU-ID> as described — in-scope items, nothing from out-of-scope.
Constraints: obey every Phase-Level Guardrail. Mock-first via a typed adapter hook in
apps/mobile/src/api/hooks/ whose return type equals the Phase F DTO; screens never import mocks
directly. Use design-system tokens/components/charts only. No scoring/AI/heavy transforms on the
render path. Handle loading/empty/stale/missing/provisional states.

Build on: <prior Phase-G artifacts + existing files/contracts listed in the CU section>.
Deliver: the files listed in the CU section + tests.
Verify (must exit 0): <CU verification commands>; plus repo gate `pnpm lint && pnpm typecheck &&
pnpm test && pnpm format:check`.
Then satisfy the §21 UI/UX checklist and the "Definition of Done for Phase G".
Commit once: `<recommended commit message>`. Do not start another CU.
If you hit a contract/source-doc conflict, STOP and propose an ADR instead of changing contracts.
```

## 7. Definition of Done for Phase G

- [ ] All of CU-058…CU-068 (+ G-PRE) committed on `feature/core-app-surfaces`, one commit per CU,
      correct `<area>: <summary> (<CU-ID>)` messages.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` pass at repo root.
- [ ] No secrets, no real OAuth creds, no direct provider calls, no raw payload rendering.
- [ ] Every screen: token-driven; works dark+light+accent; loading(cached-first)/empty/stale/missing/
      provisional handled; 44pt targets; a11y labels + chart summaries; reduced-motion respected.
- [ ] Home renders <3s warm from cache/mock in default widget order; ≤1 hero; freshness non-blocking.
- [ ] Score explanation pattern (CU-068) reused by Sleep/Recovery/Readiness/Activity.
- [ ] Bedtime Planner shows ranked windows + confidence, no exact-certainty language.
- [ ] No scoring/AI/heavy transforms on render paths; adapters are the only data seam.
- [ ] §21 pre-acceptance checklist satisfied per screen; no medical/diagnostic language.
- [ ] Single PR opened from `feature/core-app-surfaces` summarizing all CUs.

## 8. Known Risks / Decisions to Defer

- **Bedtime Planner backend route absent.** Mock-first now; propose `docs/decisions/ADR-007-bedtime-
planner-endpoint.md` (route shape mirroring `BedtimePlannerResult`) for a later phase. No backend in G.
- **Provider metric availability unconfirmed** until Phase Z (§2.6 + availability decision doc). UI must
  keep "unverified/stale/provisional" framing; avoid confirmed-metric claims.
- **Chart fidelity vs perf.** G-PRE keeps `BarChart`/`Sparkline` lightweight; revisit Skia-based richness
  in Phase J hardening if needed.
- **AI summaries are placeholders.** Real generation is Phase I; keep the placeholder/expandable slots so
  Phase I drops in without relayout.
- **Live API wiring deferred.** Adapters isolate the mock→`/api/v1/*` swap; integration tests against the
  live API are Phase J.

## 9. Open Questions / Assumptions

- **A1 (assumption):** Onboarding/auth persist to local store + a mock API adapter; no live backend POSTs
  in Phase G.
- **A2 (assumption):** Vitals & Body Composition are stack drill-down routes (`app/vitals`,
  `app/body-composition`) reached from Recovery/Home, not new bottom tabs (UX-NAV-002).
- **A3 (assumption):** `useBedtimePlan` returns a mock shaped to `@primis/scoring` `BedtimePlannerResult`;
  any recompute happens on submit, off the render path.
- **A4 (assumption):** G-PRE ships as the first commit of the Activity/Vitals block (tagged CU-066) unless
  the team prefers folding it into CU-066/067.
- **A5 (decision, resolved):** Mock-first typed adapters; add `BarChart`+`Sparkline`; all CUs on
  `feature/core-app-surfaces` with one PR.
- **Q1 (non-blocking):** Should the AI-summary placeholder include a disabled "Ask Coach" CTA now, or wait
  for Phase I? Default: show a disabled/placeholder CTA so layout is stable.

## 10. Next Phase Preview (Phase H awareness only)

Phase H (CU-069+) adds manual inputs and Nutrition v1 (check-ins; hydration/caffeine/alcohol; bowel/
digestion; manual macros; custom tags; mobile quick-add; full Nutrition tab). Phase G must leave room for
these without implementing them: keep the Nutrition tab stub untouched, design quick-entry sheet patterns
to be reusable, and ensure Recovery's subjective-input slot and Vitals' body-comp views can later accept
manual entries. No Phase H code in Phase G.

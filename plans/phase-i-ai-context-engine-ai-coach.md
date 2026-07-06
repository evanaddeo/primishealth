# Phase I — AI Context Engine and AI Coach — Implementation Plan

**Phase branch (actual):** `feature/ai-context-engine-ai-coach` (current HEAD).
The task brief names `phase/phase-i-ai-context-engine-ai-coach`; that branch does **not**
exist. All CU-076…CU-085 work runs **sequentially on the current branch**, one commit per CU.
See _Repo Drift_ §2.9.

---

## 1. Phase I Goal and Non-Goals

### 1.1 Goal

Build the **backend-owned AI Context Engine** and the **user-facing AI Coach** so Primis can
_explain, summarize, and coach_ over its deterministic health-data model — without ever letting the
LLM compute scores, invent data, dump raw health history, or leak secrets. Concretely:

- A model-agnostic **`AiGateway`** (mock + env-guarded OpenAI/Anthropic adapters) that all product
  services call instead of provider SDKs.
- A **rule-based intent classifier** mapping user text → intent + required context domains + missing slots.
- **Versioned, evidence-based context packets** assembled by **context builders** from structured
  data (scores, baselines, summaries, manual inputs, bedtime recs) — never raw provider payloads.
- A **prompt composer + safety policy engine** enforcing performance/wellness-only, non-medical,
  grounded output.
- A streaming **AI chat endpoint** and **async cached summary jobs**.
- A mobile **AI Coach screen** (suggested prompts, streaming, evidence chips, missing-data follow-ups)
  and contextual **“Ask AI about this”** entry points on domain screens.

### 1.2 Non-Goals (explicitly out of Phase I)

- No new/changed scoring formulas, thresholds, or deterministic engines (scores stay in `@primis/scoring`).
- No provider sync, OAuth, or FoodData Central work.
- No DB schema expansion **except AI metadata** (Phase I adds only the `ai_summaries` cache table).
- No billing, AWS deploy resources, or live provider credentials.
- No Phase J private-beta hardening (privacy UI, opt-in gating, red-team eval harness) beyond
  “next-phase awareness.”
- Mobile MUST NOT call any model provider directly, hold AI keys, or assemble health context.
- No live model-provider calls in any test.

---

## 2. Current Repo State (what Phase I builds on)

### 2.1 Monorepo & tooling

- pnpm workspace (`apps/*`, `services/*`, `packages/*`, `infrastructure/*`); Node ≥20, pnpm 9,
  TypeScript 5.8, Vitest 1, ESLint 8 (`.eslintrc.cjs`, `--max-warnings 0`), Prettier 3.
- Root scripts: `pnpm lint`, `pnpm typecheck` (`pnpm -r typecheck`), `pnpm test` (`vitest run`),
  `pnpm format:check`, `pnpm db:migrate|seed|reset`.
- `vitest.workspace.ts` auto-discovers `services/*/vitest.config.ts` — a new `@primis/ai` package
  needs **only its own `vitest.config.ts`** (no root edit).
- Kysely + numbered SQL migrations are the locked query/DDL pattern (**ADR-003**).

### 2.2 Phases already merged on this branch (A → G)

| Phase | Delivered (relevant to Phase I)                                                                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Repo/tooling, ESLint/Prettier/Vitest, `.env.example`, ADR + docs conventions.                                                                                     |
| B     | `@primis/core-types` (incl. **`ai.ts`**), `@primis/api-contracts`, `@primis/health-metrics`, redaction helpers.                                                   |
| C     | Mobile shell (Expo Router), `@primis/design-system`, mobile API client + mock-mode seam.                                                                          |
| D     | `@primis/api` (Hono), DB migrations 000001–000006, **all repositories incl. `aiRepository`, `insightRepository`**, auth middleware, `@primis/config` env loaders. |
| E     | Provider validation/sync infra in `@primis/workers` (Google connector, normalization) + provider-connection routes.                                               |
| F     | `@primis/scoring` engines + score-snapshot/summary/baseline/bedtime workers + dashboard & health-detail API routes.                                               |
| G     | Mobile Home/Sleep/Recovery/Activity/Vitals/BodyComp/Bedtime screens; reusable score-explanation pattern.                                                          |

### 2.3 Existing AI-related assets (reuse — do not recreate)

- **`packages/core-types/src/ai.ts`** — `AiIntent` (20 values) + `AI_INTENTS`; `ContextDomain`
  (24 values) + `CONTEXT_DOMAINS`. (Intent count settled by **ADR-002**: spec’s 20 wins.)
- **`packages/core-types/src/redaction.ts`** — `redactFixture()`, `SENSITIVE_FIELD_PATTERNS`
  (tokens/keys/email/user_id/name/device). Reuse for log/fixture safety.
- **`services/api/src/repositories/aiRepository.ts`** — `createConversation`, `getConversation(s)`,
  `deleteConversation` (soft), `addMessage`, `getConversationMessages`, `createContextSnapshot`,
  `getLatestContextSnapshot`, `recordModelInvocation`, `getModelInvocations`. Header already states
  “metadata only; AI calls belong in Phase I.” **PRIVACY:** never log `content` / `context_json`.
- **`services/api/src/repositories/insightRepository.ts`** — `getActiveInsights`, correlations, anomalies.
- **DB (migration 000006):** `ai_conversations`, `ai_messages`, `ai_context_snapshots`,
  `ai_model_invocations`, `insight_candidates`, `correlation_results`, `anomaly_events`,
  `score_snapshots`, `score_component_values`, `algorithm_runs`. **No `ai_summaries` table** (added in CU-083).
- **`@primis/config`** — `loadBackendEnv` already validates `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`
  (present-string check only; `.env` values are `PLACEHOLDER`). `loadPublicEnv` is mobile-safe (no secrets).

### 2.4 Data sources the context builders will read (all exist on this branch)

- Scores/components/baselines: `scoreRepository` (`getLatestScoreSnapshot`, `getScoreComponents`,
  `getScoreHistory`, `getAllScoreSnapshotsForDate`), daily summaries (`daily_metric_summaries`),
  rolling baselines.
- Profile/goals/prefs: `userRepository`, `preferencesRepository`, `consentRepository`, onboarding data.
- Domains: `sleepRepository`, `recoveryRepository` (via detail routes), `activityRepository`,
  `vitalRepository`, `bodyCompositionRepository`, bedtime recommendation rows.
- Manual/nutrition: `manualInputRepository` (`getCheckins`; **create-only** for hydration/caffeine/
  alcohol/bowel — **read helpers missing → CU-080 adds them**), `nutritionRepository`
  (`getNutritionEntriesForDate`, `getDailyNutritionSummary`).

### 2.5 API service (Hono)

- `createApp()` in `services/api/src/app.ts`; global `requestIdMiddleware`, `authMiddleware` on
  `/api/v1/*`; `errorHandler`; typed `ApiSuccessResponse` envelope + `makeErrorResponse`.
- **Local/test auth:** `ALLOW_MOCK_AUTH=true` + `Authorization: Bearer mock-dev-token`.
- **Route tests** use `vi.mock` for config/db/repos + `createApp()` + `app.request()` (see
  `services/api/test/routes/dashboard.test.ts`). CU-082 mirrors this exactly.

### 2.6 Mobile

- Expo Router tabs: Home / Sleep / Recovery / Activity / Nutrition / **AI Coach** (`coach.tsx` — CU-018
  placeholder). Tab order locked (UX-NAV-001/002).
- `apps/mobile/src/api/client.ts` — `PrimisApiClient` (`get/post/patch/delete`, unwraps envelope,
  `mockMode` default true → throws `MockModeError` intercepted by `src/mocks`). **No streaming support
  → CU-084 adds a streaming seam.**
- `apps/mobile/src/api/endpoints.ts` — `API_ENDPOINTS` (no AI endpoints yet; **note `/v1/...` mobile
  convention vs `/api/v1/...` server registration — §2.9**).
- Each domain screen already ships a placeholder **`*AiSummaryCard.tsx`** with a **disabled “Ask Coach”
  button** — the exact slot CU-084/085 fill (no relayout needed). Reusable `features/scores/scoreExplanationModel.ts`.
- `@primis/design-system` exports: `Screen, Card, Text, Button, MetricValue, StatusBadge, ProgressBar`,
  charts (`LineChart, BarChart, StageTimeline, RingProgress`), `useTheme`, tokens, motion.
- No `src/features/coach`, no `src/features/nutrition` feature dir, no `src/components` shared dir yet.

### 2.7 Workers

- `@primis/workers` with `normalization/`, `summaries/buildDailyMetricSummaries`, `scoring/runDailyScoring`
  (deterministic, injected `now`, **no AI calls**), `baselines/`, `sync/`, `db/client`. CU-083 adds
  `services/workers/src/ai/*` mirroring the runDailyScoring test pattern.

### 2.8 ADRs / decision docs affecting Phase I

- **ADR-002** — AI intent count (20). **ADR-003** — Kysely + numbered migrations. **ADR-001** — provider
  code naming. **ADR-005/006** — dashboard/detail endpoint shapes (precomputed reads).
- **`docs/decisions/google-health-api-metric-availability.md`** — AI MUST caveat unverified Google/Fitbit
  metrics and provider-score availability; never claim an unavailable metric is measured.
- Source-priority + “no silent doc edits; write an ADR” from `docs/README.md`.

### 2.9 Repo drift / mismatches executing agents MUST account for

1. **Branch name:** work happens on `feature/ai-context-engine-ai-coach`, not `phase/phase-i-…`.
2. **Phase H unmerged:** `feature/manual-inputs-nutrition-v1` is **not** in this branch or `main`.
   Nutrition/manual **tables + Phase-D scaffold repos exist**, but Phase H **routes, populated data
   paths, and the mobile Nutrition screen do not.** → **CU-080 & CU-085 are gated on Phase H being
   merged into this branch first** (decision Q1). Add a pre-req check; if not merged, build/test
   nutrition & manual builders against fixtures and **defer the Nutrition “Ask AI” wiring**.
3. **`ai_summaries` absent:** the impl spec (priority 1) says summaries cache in `ai_summaries`, but the
   data-model doc §18 (priority 4, schema authority) defines no such table. Resolved by **adding a
   dedicated `ai_summaries` AI-metadata migration + repo** (decision Q2, “most mature”) with **ADR-007**.
4. **Route prefix convention:** server registers `/api/v1/*` (`app.ts`); mobile constants use `/v1/*`
   (`endpoints.ts`). Register AI routes under **`/api/v1/ai/*`** and add mobile constants under **`/v1/ai/*`**,
   matching each side’s existing convention.
5. **No `services/ai` package yet** (only `.gitkeep`) — CU-076 scaffolds `@primis/ai`.
6. **`manualInputRepository` read gap:** hydration/caffeine/alcohol/bowel have `create*` only —
   CU-080 adds the missing `get*ForDate`/range read helpers it needs.
7. **Mobile API client has no streaming** — CU-084 adds a streaming seam; real RN wire-streaming is
   deferred (mock simulation is the Phase I path, decision Q3).

---

## 3. Required Source Docs & Exact Sections (read before each CU)

Source-priority order governs conflicts (`docs/README.md`; lower number wins).

- **Impl spec** `primis_full_implementation_spec_commit_plan.md` — §2 Principles, §3 + §3.5 Commit-Unit
  Contract/DoD, §4 Architecture, §5 Phase Overview, **Phase I CU-076…CU-085** (lines ~2754–3072).
- **AI Context Engine spec** `primis_ai_context_engine_spec.md` — **§0** agent instructions; §3–4
  gateway/architecture; §7 intent (7.2–7.5); §8 domains + 8.2 source-mapping; **§9** packet schema
  (9.2–9.11 evidence); §10 builders (10.1–10.12); §11 packet examples; **§12** output contracts; **§13**
  prompt composition; **§14** provider abstraction/routing/config; **§17** safety (17.2–17.7 IDs);
  §18 latency/cache; **§19** persistence & **19.3 no-raw-logging**; §22 mobile integration; §23
  security/privacy; **V1.1 Amendment** (§25.1–25.6 sleep packet/evidence/output/freshness).
- **TAD** `primis_technical_architecture_document.md` — §8 env strategy, **§17 AI architecture**
  (17.3 gateway, 17.5 packet, 17.6 governance IDs, 17.8 latency), §22.3 logging rules, §22.5 AI privacy,
  §24 observability, ADR-004/005.
- **Data model** `primis_data_model_health_metric_schema.md` — **§18 AI tables**, §5.4 sensitivity (S0–S4),
  §17 insights, nutrition/manual/digestion tables (§ domain), deletion conventions.
- **Scoring spec** `primis_scoring_algorithms_spec.md` — score outputs/components/confidence/top-drivers;
  “AI explains, does not compute” rule; conservative language.
- **UI/UX spec** `primis_ui_ux_design_system_spec.md` — **§6.7 AI Coach**, §20.7 AI states, §21 Design QA,
  §24.7 AI sleep summary UX, §14.3 tone, §19 “AI slop” quality bar.
- **PRD** `primis_product_requirements_document.md` — AI Coach reqs, “Asking AI” journey, performance-only
  / non-medical constraints, AI-explains-not-calculates.
- **MVP build plan** `primis_mvp_build_plan_milestones.md` — AI Context Engine + Chat milestone; health-
  data-model-first; no-fake-certainty.
- **Parity matrix** + `docs/decisions/google-health-api-metric-availability.md` — provider missingness /
  unverified-metric caveats.

---

## 4. Dependency Graph (CU-076 → CU-085)

```
CU-076 AiGateway (mock + guarded live adapters, @primis/ai scaffold)
   │
   ├────────────► CU-077 IntentClassifier (uses core-types AiIntent/ContextDomain)
   │
CU-078 Context packet schemas (Zod; api-contracts + @primis/ai types)
   │        └── depends on CU-076 (package) + CU-077 (intent/domain outputs)
   ▼
CU-079 Profile / Score / Baseline builders  ── depends on CU-078
   ▼
CU-080 Domain builders (sleep/recovery/training/nutrition*/bedtime/manual*)
   │        depends on CU-079; (*nutrition/manual gated on Phase H merge)
   ▼
CU-081 PromptComposer + SafetyPolicyEngine  ── depends on CU-078/079/080 + CU-077 safetyCategory
   ▼
CU-082 AI chat endpoint (SSE) + AiRequestController
   │        depends on CU-076..081; wires api ↔ @primis/ai; uses aiRepository
   ├────────────► CU-084 Mobile AI Coach screen (streaming seam, evidence chips)
   │                     depends on CU-082 contract; CU-085 depends on CU-084
CU-083 Summary jobs + ai_summaries cache  ── depends on CU-079/080/081 (+ CU-076)
   │        (workers; independent of CU-082 but shares builders/gateway)
   ▼
CU-085 Contextual “Ask AI about this”  ── depends on CU-084 (+ Phase H for Nutrition)
```

Strict execution order: **076 → 077 → 078 → 079 → 080 → 081 → 082 → 083 → 084 → 085.**
(083 may run after 081 in parallel with 082 conceptually, but commit sequentially in numeric order.)

---

## 5. Per-Commit-Unit Sections

Legend for every CU: **Docs** = sections to read; **Same-phase deps** = prior CU artifacts; **Build on**
= existing repo files; **In/Out** = scope; **Accept** = acceptance criteria; **Verify** = commands;
**Safety**/**API**/**UI** = quality bars; **Pitfalls**; **Ask first?**; **Commit**.

---

### CU-076 — AI gateway provider abstraction

**Goal:** Route _all_ AI calls through a backend-only `AiGateway`; product services never touch provider SDKs. Mock works keyless; live adapters are env-guarded.

- **Docs:** AI spec §3–4, §14 (14.1–14.7), §19.3; TAD §17.3–17.4, §17.6; impl spec CU-076.
- **Same-phase deps:** none (first CU).
- **Build on:** `@primis/core-types` (add provider-neutral types or import), `@primis/config`
  `loadBackendEnv` (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`), `vitest.workspace.ts` auto-discovery.
- **Files (create):**
  `services/ai/package.json` (name `@primis/ai`, `type: module`, exports `./src/index.ts`, scripts
  `typecheck`/`test`, deps `@primis/core-types`+`@primis/config`, **`openai`**, **`@anthropic-ai/sdk`**;
  devDeps `vitest`,`tsx`,`@types/node`), `services/ai/tsconfig.json`, `services/ai/vitest.config.ts`,
  `services/ai/src/index.ts`, `services/ai/src/types.ts` (`AiProviderRequest/Response`, `AiProviderCode`,
  `AiModelTier`, `AiTaskType`, `AiResponseFormat`, `AiMessage`, `AiUsageMetadata`, streaming chunk type),
  `services/ai/src/AiGateway.ts`, `services/ai/src/config/aiConfig.ts` (config-driven routing §14.7),
  `services/ai/src/providers/{AiProvider.ts,MockAiProvider.ts,OpenAiProvider.ts,AnthropicProvider.ts}`,
  `services/ai/test/aiGateway.test.ts`, `services/ai/test/mockProvider.test.ts`.
- **In scope:** provider-neutral request/response contract (§14.1–14.2); `AiProvider` interface with
  `generateText` / `streamText?` / `generateStructured?`; `MockAiProvider` (deterministic canned output +
  simulated stream chunks, keyless); env-guarded `OpenAiProvider`/`AnthropicProvider` that construct the
  SDK client only when a **real** key is present and **throw a clear typed error** (`AiProviderNotConfiguredError`)
  when the key is missing/`PLACEHOLDER`; `AiGateway` selects provider by config/tier and **defaults to mock**
  when no live provider is configured; usage/cost/latency metadata capture; `rawProviderResponseRef`
  (never inline raw payloads).
- **Out of scope:** intent classification, context builders, prompts, chat route, any real network call in tests.
- **Accept:** product services call `AiGateway` (not SDKs); mock provider passes tests **without keys**;
  live adapters read env but fail gracefully/typed when missing; **no AI keys or provider SDK usage in mobile**;
  gateway is config-driven per §14.7.
- **Verify:** `pnpm --filter @primis/ai test` · `pnpm --filter @primis/ai typecheck` · `pnpm lint`.
- **Safety:** no raw prompt/response in logs (§19.3); adapters never log request bodies; mock is default in
  local/test; live path never exercised by tests.
- **API bar:** provider-neutral types only; hashed/stable `userIdHash` in metadata, never raw user id/PII.
- **Pitfalls:** `loadBackendEnv` requires the key _string_ to exist (`PLACEHOLDER` passes) — treat
  `PLACEHOLDER`/empty as **not configured**; don’t let a missing key crash gateway construction; keep
  `openai`/`@anthropic-ai/sdk` imports lazy so tests never instantiate live clients.
- **Ask first?** No (all decisions locked; real SDKs env-guarded per Q4).
- **Commit:** `ai: add AI gateway provider abstraction (CU-076)`

---

### CU-077 — Intent classifier skeleton

**Goal:** Rule-based classifier: user text → `AiIntent` + required `ContextDomain[]` + missing slots + safety category.

- **Docs:** AI spec §7 (7.2–7.5), §8.2, §17.1 safety categories; impl spec CU-077.
- **Same-phase deps:** CU-076 (`@primis/ai` package).
- **Build on:** `@primis/core-types` `AiIntent`/`AI_INTENTS`, `ContextDomain`/`CONTEXT_DOMAINS`.
- **Files (create):** `services/ai/src/intent/IntentClassifier.ts`,
  `services/ai/src/intent/rules.ts`, `services/ai/src/intent/types.ts`
  (`IntentClassificationResult` §7.4, `MissingSlot`, `AiSafetyCategory` §17.1),
  `services/ai/test/intentClassifier.test.ts`.
- **In scope:** deterministic keyword/pattern rules covering sleep, recovery, training, nutrition,
  hydration/caffeine/alcohol, bedtime, body composition, gut/digestion, weekly/monthly review, app help,
  data-availability questions, and **unsupported medical requests**; return `requiredContextDomains`,
  `timeRange` default, `requiresUserFollowUp`, `missingCriticalSlots` (§7.5), `safetyCategory`, confidence.
  Domain mapping per §8.2.
- **Out of scope:** LLM-based classification (rules-first; optional cheap-model fallback is a later phase),
  context building, prompts.
- **Accept:** all listed categories handled; returns domains + missing slots; tests cover the §7.3/§7.5
  example prompts + the V1.1 sleep prompt set (§25.6) + an emergency/medical case → `unsupported_medical_request`
  / emergency safety category.
- **Verify:** `pnpm --filter @primis/ai test` · `pnpm --filter @primis/ai typecheck`.
- **Safety:** unsupported-medical & emergency phrases classify to the safe category so CU-081/082 can route
  them to a safe response; never infer diagnosis.
- **Pitfalls:** keep it deterministic (no locale/date nondeterminism); ambiguous prompts → `unknown` +
  follow-up rather than a confident wrong domain; don’t over-question when a useful partial answer exists (§7.5).
- **Ask first?** No.
- **Commit:** `ai: add intent classifier skeleton (CU-077)`

---

### CU-078 — Base AI context packet schemas

**Goal:** Define the versioned structured context format (Zod) every AI call uses.

- **Docs:** AI spec §9 (9.2–9.11), §10.1 builder interface, §12 output contract, §21 versioning; V1.1 §25.1; impl spec CU-078.
- **Same-phase deps:** CU-076 (types), CU-077 (`AiIntent`, domains, safety category).
- **Build on:** `@primis/core-types/ai.ts`; `@primis/api-contracts` conventions (Zod + exported types).
- **Files (create):** `packages/api-contracts/src/aiContext.ts` (+ export from `index.ts`),
  `services/ai/src/context/AiContextPacket.ts`, `services/ai/test/aiContextPacket.test.ts`,
  `packages/api-contracts/test/aiContext.test.ts`.
- **In scope:** Zod schemas + inferred types for `AiContextPacket` (§9.2: `packetVersion:'1.0'`, `packetId`,
  `userIdHash`, `requestId`, `createdAt`, `product`, `environment`, `intent`, `timeRange`, `userProfile`,
  `safety`, `dataAvailability`, `contextDomains`, `evidence`, `payload`, `outputContract`), `TimeRangeSpec`
  (§9.3), `AiUserProfileContext`+`RankedGoal`/`NutritionPhilosophyContext`/`CoachStyle`/`SummaryStyle` (§9.4–9.8),
  `AiSafetyContext` (§9.9), `AiDataAvailabilityContext` (§9.10), **`AiEvidence`/`AiEvidenceType`** (§9.11 —
  supports score_snapshot, score_component, metric_value/deviation, trend, correlation, **manual_input**,
  provider_availability, sleep/workout session, nutrition_summary, body_composition, **bedtime_recommendation**,
  insight_candidate), `AiOutputContract` (§12 base response shape reference), and `ContextBuilder`/
  `ContextBuilderInput`/`ContextBuilderResult` interfaces (§10.1). Include `SleepAnalysisContext` (V1.1 §25.1)
  as a payload schema.
- **Out of scope:** builder logic, prompt text, transport.
- **Accept:** packet includes all listed fields incl. version/hash/intent/time-range/profile/safety/
  availability/domains/evidence/payload/output-contract; evidence covers metrics, scores, trends, manual
  inputs, bedtime recs; **Zod validation tests pass** (valid packet parses; malformed rejects; version pinned).
- **Verify:** `pnpm --filter @primis/ai test` · `pnpm --filter @primis/api-contracts test` · typecheck · lint.
- **Safety:** packet is the _only_ contract passed toward a model — schema forbids raw payload blobs;
  `evidence[].statement` is compact human text, values are typed scalars; `userIdHash` not raw id.
- **API bar:** single source of truth in `@primis/api-contracts` re-used by `@primis/ai` and `@primis/api`.
- **Pitfalls:** don’t duplicate `AiIntent`/`ContextDomain` — import from core-types; pin `packetVersion`
  literal; keep `payload` a discriminated/narrowed shape per domain, not `any`.
- **Ask first?** No.
- **Commit:** `ai: add AI context packet schemas (CU-078)`

---

### CU-079 — Profile, score, baseline context builders

**Goal:** First real evidence packets from structured data (profile, latest scores/components, baselines).

- **Docs:** AI spec §10.1–10.4, §9.11; scoring spec (score outputs/components/confidence/top-drivers); data-model users/scores/baselines; impl spec CU-079.
- **Same-phase deps:** CU-078 (schemas), CU-077 (intent/time-range/domains).
- **Build on:** `scoreRepository` (`getLatestScoreSnapshot`, `getScoreComponents`, `getAllScoreSnapshotsForDate`,
  `getScoreHistory`), `userRepository`/`preferencesRepository` (profile, goals, coach/summary style,
  nutrition philosophy, units), rolling-baseline data.
- **Files (create):** `services/ai/src/context/builders/{ProfileContextBuilder,ScoreContextBuilder,BaselineContextBuilder}.ts`,
  `services/ai/src/context/builders/builderUtils.ts`, tests
  `services/ai/test/builders/{profile,score,baseline}ContextBuilder.test.ts`.
- **In scope:** implement `ContextBuilder` (§10.1) for the three domains; each returns
  `{ payload, evidence[], limitations[], completeness, confidence }`; explicit missing-data limitations +
  per-evidence confidence (`high|medium|low|not_enough_data`); map score/component values → `AiEvidence`
  with baseline/delta/direction; ProfileContextBuilder includes tz/goals/coach+summary style/units/nutrition
  philosophy/AI-processing flags, **excludes** exact DOB/PII (§10.2).
- **Out of scope:** any raw provider payload read; recomputation of scores (read persisted snapshots only);
  domain-specific (sleep/nutrition) builders (CU-080).
- **Accept:** builders **do not query raw provider payloads**; produce evidence objects **with confidence**;
  missing-data limitations explicit; tests use DB fixtures/mocks (no real DB/network).
- **Verify:** `pnpm --filter @primis/ai test` · typecheck · lint.
- **Safety:** confidence downgraded to `not_enough_data` when inputs missing/stale; never fabricate a
  baseline; hash user id in any emitted metadata.
- **Pitfalls:** score values come **only** from `score_snapshots` (don’t re-derive); respect ADR-004 (no
  `activity_score` in schema — activity handled via components/summaries in CU-080); keep packets compact
  (top drivers, not full history).
- **Ask first?** No.
- **Commit:** `ai: add profile score and baseline context builders (CU-079)`

---

### CU-080 — Domain context builders

**Goal:** Support real health questions: sleep, recovery, training, nutrition, bedtime, manual inputs.

- **Docs:** AI spec §8.2, §10.5–10.12, §11 examples, §13.4–13.8, **V1.1 §25.1–25.5**; scoring spec layers;
  `google-health-api-metric-availability.md`; impl spec CU-080.
- **Same-phase deps:** CU-078 schemas, CU-079 builders/utils.
- **Build on:** `sleepRepository`, recovery/activity detail data, bedtime recommendation rows,
  `manualInputRepository` (`getCheckins` + **new read helpers**), `nutritionRepository`
  (`getNutritionEntriesForDate`, `getDailyNutritionSummary`), `insightRepository`.
- **Pre-req gate (Q1):** **verify Phase H is merged into this branch** before implementing the Nutrition and
  manual-input builders end-to-end. If merged → full implementation. If not → implement Sleep/Recovery/
  Training/Bedtime fully; implement Nutrition + ManualInput builders against the **Phase-D repos + fixtures**
  (they compile/test) but mark data-population as Phase-H-dependent in a `// TODO(phase-h)` and keep them
  out of any live wiring until CU-082/083 confirm data exists.
- **Files (create):** `services/ai/src/context/builders/{SleepContextBuilder,RecoveryContextBuilder,
TrainingContextBuilder,NutritionContextBuilder,BedtimeContextBuilder,ManualInputContextBuilder}.ts`;
  **add missing read helpers** to `services/api/src/repositories/manualInputRepository.ts`
  (`getHydrationEntries`, `getCaffeineEntries`, `getAlcoholEntries`, `getBowelEntries` by user+date range);
  tests `services/ai/test/builders/*ContextBuilder.test.ts`.
- **In scope:** each builder returns compact, task-relevant context (no unbounded raw time-series by default);
  Sleep builder emits `SleepAnalysisContext` (V1.1) + ≥2 concrete evidence items or declares insufficiency
  (§25.2); Bedtime builder includes **ranked windows + caveat against fake precision** and preserves window/
  caveat language (§13.6, §25.5); Nutrition builder marks AI-estimated food as **estimate** (§13.7, AI-SAFE-007);
  manual inputs stay **context, not dominant score inputs** (AI-SAFE-008).
- **Out of scope:** body-composition & gut/digestion builders may be scaffolded but full parity is optional
  this CU (list explicitly if deferred); no new scoring; no provider-payload reads.
- **Accept:** compact task-relevant context per builder; no unbounded raw series; bedtime = ranked windows +
  caveat; nutrition estimates flagged; unverified provider metrics carry availability caveats.
- **Verify:** `pnpm --filter @primis/ai test` · (`pnpm --filter @primis/api test` if repo read helpers added) · typecheck · lint.
- **Safety:** sleep language stays probabilistic (§25.5); gut/digestion non-diagnostic (§13.8); mark
  stale/unverified metrics; manual data never overrides deterministic bands.
- **Pitfalls:** the Phase-H gate (don’t assume nutrition/manual routes/data exist); add the missing manual
  read helpers rather than reaching into the DB from `@primis/ai`; keep evidence bounded (cap counts).
- **Ask first?** **Yes, if Phase H is not merged when this CU is reached** — confirm gate handling before wiring nutrition/manual into live flows.
- **Commit:** `ai: add sleep recovery training nutrition bedtime context builders (CU-080)`

---

### CU-081 — Prompt composer and safety policy engine

**Goal:** Grounded, safe, tone-respecting prompts + output contract; medical/emergency routing.

- **Docs:** AI spec §13 (13.1–13.8), §12, §17 (17.2–17.7 IDs), §6.3–6.4, §25.5; PRD performance-only; TAD §17.6; impl spec CU-081.
- **Same-phase deps:** CU-078 (packet + output contract), CU-079/080 (evidence), CU-077 (safety category).
- **Build on:** `@primis/core-types/redaction.ts` (safety), gateway request types (CU-076).
- **Files (create):** `services/ai/src/prompts/PromptComposer.ts`,
  `services/ai/src/prompts/templates.ts` (base system prompt §13.3 + task instructions §13.4–13.8, all
  **versioned** §21), `services/ai/src/safety/SafetyPolicyEngine.ts`,
  `services/ai/src/safety/safetyTemplates.ts`, tests
  `services/ai/test/{promptComposer,safetyPolicy}.test.ts`.
- **In scope:** layered composition (§13.1: system → task → profile/tone → context packet → output schema →
  user question); system prompt enforces performance/wellness-only, non-medical, use-only-provided-context,
  state-missing-data, no-exact-sleep-cycle, don’t-recalculate-scores (§13.2–13.3); **tone changes phrasing
  only, never recommendation logic** (§6.3, ARCH-AI-003); `SafetyPolicyEngine` maps safety category →
  allow / add-not-medical-caveat / reduce-intensity / **route to safe/unsupported/emergency template**
  (§17.2–17.6) and emits `AiSafetyFlag[]` (§12.6); composer attaches evidence + required output contract.
- **Out of scope:** the chat route/transport (CU-082); model calls in tests.
- **Accept:** system prompts enforce performance/wellness-only framing; tone affects phrasing only;
  unsupported medical requests route to safe pattern; composer includes evidence + output contract; tests
  cover medical/emergency/unsafe-training/nutrition-risk (red-team §33) and tone-invariance of recommendations.
- **Verify:** `pnpm --filter @primis/ai test` · typecheck · lint.
- **Safety:** this is the core guardrail CU — assert AI-SAFE-001..008; never allow tone to weaken safety;
  emergency bypasses normal health context (§17.4).
- **Pitfalls:** prompts live in backend only (ARCH-AI-001) — never leak template text to mobile/logs; version
  every template; keep the “no score recalculation” instruction explicit.
- **Ask first?** No.
- **Commit:** `ai: add prompt composer and safety policy engine (CU-081)`

---

### CU-082 — AI chat endpoint with streaming (SSE)

**Goal:** Backend chat endpoint: accept message → classify → build context → gateway → **SSE stream** →
store metadata safely.

- **Docs:** AI spec §5.2, §22.1–22.2, §19.2–19.3; UI/UX §6.7; TAD §17.8; impl spec CU-082.
- **Same-phase deps:** CU-076..081.
- **Build on:** `services/api/src/app.ts` (route registration), `authMiddleware`, `requestIdMiddleware`,
  `aiRepository` (conversation/message/context-snapshot/model-invocation), Hono `streamSSE`,
  `@primis/api-contracts` envelope.
- **Files (create):** `packages/api-contracts/src/aiChat.ts` (`AiChatRequest` {conversationId?, message,
  sourceSurface, stream, clientContext} + SSE event contract: `token` chunks + final `metadata`/`cards`
  event) + export; `services/ai/src/AiRequestController.ts` (orchestrates classify→build→compose→gateway→
  structure); `services/api/src/routes/aiChat.ts`; register in `app.ts` under `/api/v1/ai`; tests
  `services/api/test/routes/aiChat.test.ts`, `services/ai/test/aiRequestController.test.ts`.
- **Mobile constant:** add `AI_CHAT: '/v1/ai/chat'` to `endpoints.ts` (CU-084 uses it; matches `/v1` convention).
- **In scope:** `POST /api/v1/ai/chat`; validate body; classify intent; build context via builders; route
  through `AiGateway`; **mock streaming in local mode** (SSE `text/event-stream` — token events then a final
  structured metadata + suggested-cards event); persist conversation/message metadata + context-snapshot ref
  - model invocation via `aiRepository`; **do not log raw prompts/health content** (redacted observability only).
- **Out of scope:** summary jobs (CU-083), mobile UI (CU-084), real provider streaming hardening (mock path is Phase I).
- **Accept:** endpoint accepts message, builds context, routes through gateway; supports mock streaming;
  stores conversation metadata safely; **no raw health prompts in general logs**; tests cover mock streamed
  response **and** an unsupported-medical-request → safe response.
- **Verify:** `pnpm --filter @primis/api test` · `pnpm --filter @primis/ai test` · typecheck · lint.
- **Safety:** §19.3 — never log packet/prompt/response health content; store only metadata + snapshot ref +
  redacted audit; emergency/medical routed via CU-081; per-user authorization on conversation access.
- **API bar:** typed request/SSE contract in `@primis/api-contracts`; reuse mock-auth test pattern
  (`Bearer mock-dev-token`, mocked repos/db); envelope for non-stream errors; 401 without auth.
- **Pitfalls:** SSE + Hono streaming lifecycle (flush/heartbeat/close on error); don’t block on live model —
  mock default; conversation ownership checks; keep `/api/v1` vs `/v1` prefixes correct on each side.
- **Ask first?** No (SSE + simulated mobile locked, Q3).
- **Commit:** `api: add AI coach chat endpoint (CU-082)`

---

### CU-083 — AI summary generation jobs + `ai_summaries` cache

**Goal:** Async cached summaries (sleep/recovery/daily/weekly) via the context engine; graceful fallback to last cached.

- **Docs:** AI spec §5.3–5.8, §18.2–18.3, §19; data-model §18 (+ ADR-007 you will write); TAD §17.7–17.8; impl spec CU-083.
- **Same-phase deps:** CU-076 gateway, CU-079/080 builders, CU-081 composer/safety.
- **Build on:** `services/workers/src/scoring/runDailyScoring.ts` pattern (injected `now`, pure/DB-I-O split,
  mocked Kysely), workers `db/client`, `@primis/ai`.
- **Files (create):** **new migration** `database/migrations/000008_ai_summaries.sql` (table `ai_summaries`
  — see below), `services/api/src/repositories/aiSummaryRepository.ts` (+ `db/types.ts` table types),
  `services/workers/src/ai/{generateDailySummaries,generateSleepSummary,generateRecoverySummary,
generateWeeklyReview}.ts`, `services/workers/src/ai/summaryCache.ts`,
  **`docs/decisions/ADR-007-ai-summaries-cache-table.md`**, tests
  `services/workers/test/ai/*.test.ts`, `services/api/test/repositories/aiSummaryRepository.test.ts`.
- **`ai_summaries` schema (mature cache pattern):** `id`, `user_id` (FK), `summary_type`
  (`sleep|recovery|daily|weekly|workout|nutrition`), `local_date`, `context_packet_version`,
  `summary_status` (`fresh|stale|regenerating|failed`), `title`, `short_summary`, `structured_json`
  (output contract), `evidence_refs`, `source_score_snapshot_id?`, `model_provider`, `model_name`,
  `generated_at`, `expires_at?`, `created_at`, `updated_at`, soft-delete; **unique
  (user_id, summary_type, local_date, context_packet_version)** for latest-valid lookup + idempotent upsert.
- **In scope:** jobs consume the **context engine** (builders/packets), not raw data; call `AiGateway`
  (**mock adapter in tests**); upsert into `ai_summaries`; on live-generation failure keep/serve the last
  cached row (status `stale`); deterministic (injected clock); no UI blocking.
- **Out of scope:** the read API/mobile wiring for summaries (Phase I may add a thin
  `GET /api/v1/ai/summaries/latest?type=` reader if trivial — otherwise defer; do not block core screens);
  new scoring.
- **Accept:** jobs use context engine (not raw data); summaries cached in `ai_summaries`; UI can read old
  cached summary if live generation fails; tests use mock AI adapter.
- **Verify:** `pnpm --filter @primis/workers test` · (`pnpm --filter @primis/api test` for repo) ·
  `pnpm db:migrate` (local) · typecheck · lint.
- **Safety:** no raw payloads in packets or logs; store structured summary + evidence refs, not raw prompts;
  redact per §19.3.
- **API/DB bar:** Kysely + numbered migration (ADR-003); table types in `db/types.ts`; ADR-007 records the
  data-model §18 resolution.
- **Pitfalls:** idempotent upsert on the unique key; don’t couple to CU-082; keep FoodData Central / nutrition
  summary generation gated on Phase H data; mock adapter must be injected, never live.
- **Ask first?** No (ai_summaries table + ADR locked, Q2).
- **Commit:** `ai: add cached AI summary generation jobs (CU-083)`

---

### CU-084 — Mobile AI Coach screen

**Goal:** User-facing chat: suggested prompts, streaming, evidence chips, missing-data follow-ups. No provider calls in mobile.

- **Docs:** UI/UX §6.7 (6.7.1–6.7.4), §20.7, §21 Design QA, §19 anti-slop; AI spec §22 (22.1–22.5); impl spec CU-084.
- **Same-phase deps:** CU-082 (chat SSE contract + `AI_CHAT` endpoint).
- **Build on:** `apps/mobile/app/(tabs)/coach.tsx` (replace placeholder), `src/api/client.ts` (+ streaming
  seam), `src/api/endpoints.ts` (`AI_CHAT`), `@primis/design-system` (`Screen/Card/Text/Button/StatusBadge`),
  `src/mocks` (mock stream), TanStack Query patterns.
- **Files (create/edit):** `apps/mobile/app/(tabs)/coach.tsx`, `apps/mobile/src/features/coach/`
  (`CoachScreen.tsx`, `components/{MessageList,MessageBubble,EvidenceChips,SuggestedPrompts,FollowUpQuestions,
Composer}.tsx`, `coachModel.ts`, `index.ts`), `apps/mobile/src/api/streamCoachMessage.ts` (streaming seam:
  **simulated chunked stream in mock mode**, SSE/XHR reader stub for real mode — hardening deferred),
  `apps/mobile/src/mocks/coach.ts`, tests `apps/mobile/test/coach/*`.
- **In scope:** suggested prompts (§6.7.3); streaming/mock-streaming; **evidence/“Based on” chips** where
  provided (UX-AI-002); missing-data → render follow-up questions (UX-AI-003); loading/streaming/error/empty
  states; **AI failure degrades gracefully** (retry, no blocking) (§22.5); design tokens only; a11y labels;
  reduced-motion; **no raw prompts/logs in UI debug**; mobile never calls a provider (all via backend).
- **Out of scope:** contextual entry points on other screens (CU-085); real RN wire-streaming hardening.
- **Accept:** shows suggested prompts; supports streaming/mock streaming; shows evidence chips; handles
  missing-data follow-ups; does not expose raw prompts/logs in UI debug.
- **Verify:** `pnpm --filter @primis/mobile typecheck` · `pnpm --filter @primis/mobile test` · lint.
- **UI bar:** meet §21 Design QA (dark/light/accent, loading/empty/stale/missing, touch targets, screen-reader
  labels, no color-only, reduced motion, **no blocked render on AI**, concise performance-safe copy); AI Coach
  not the default screen (UX-AI-001).
- **Safety:** mobile assembles **no health context** (§22.1) — sends only message/surface/local values;
  no keys; renders backend-provided evidence, doesn’t fabricate.
- **Pitfalls:** RN fetch streaming limits → use the mock-stream seam by default; keep `mockMode` interception
  working; don’t leak SSE internals to the UI.
- **Ask first?** No.
- **Commit:** `mobile: implement AI Coach chat screen (CU-084)`

---

### CU-085 — Contextual “Ask AI about this” actions

**Goal:** Optional AI entry points on Sleep/Recovery/Activity/(Nutrition) that open Coach with prefilled
intent — without making chat the whole product, and **without auto-triggering AI on render**.

- **Docs:** UI/UX §6.7, §5 nav (UX-NAV-005 contextual entry points), §20.7; AI spec surfaces §5.1; impl spec CU-085.
- **Same-phase deps:** CU-084 (Coach screen + prefill mechanism).
- **Build on:** existing `*AiSummaryCard.tsx` placeholders (**disabled “Ask Coach” button** — enable + wire),
  domain screens `features/{sleep,recovery,activity}`, Expo Router navigation params.
- **Pre-req gate (Q1):** Nutrition entry point requires the **Phase H Nutrition screen**. If Phase H merged →
  wire all four. If not → wire Sleep/Recovery/Activity (+ Vitals optional) now and **defer Nutrition** with a
  `// TODO(phase-h)`.
- **Files (create/edit):** `apps/mobile/src/components/AskAiButton.tsx` (new shared component dir),
  edit `features/sleep|recovery|activity/*AiSummaryCard.tsx` (+ Nutrition when available), coach route to
  accept prefill params (`intent`, `sourceSurface`, `date`), tests `apps/mobile/test/*/askAi*`.
- **In scope:** reusable `AskAiButton`; on press → navigate to Coach tab with prefilled context intent +
  source surface (no message auto-sent unless user confirms); **must not call AI on screen render**; tokens/a11y.
- **Out of scope:** new AI logic; changing summary generation; Nutrition wiring if Phase H absent.
- **Accept:** Sleep/Recovery/Activity/Nutrition detail screens include an optional Ask-AI action; it opens
  Coach with prefilled context intent; **does not trigger AI automatically on render**.
- **Verify:** `pnpm --filter @primis/mobile typecheck` · `pnpm --filter @primis/mobile test` · lint.
- **UI bar:** consistent placement near AI summary cards; design tokens; a11y label/hint; unobtrusive
  (chat is not the product).
- **Pitfalls:** don’t fire a network/AI call on mount; ensure prefill params are typed; Nutrition gate.
- **Ask first?** **Yes, if Phase H (Nutrition screen) is not merged** — confirm defer vs block.
- **Commit:** `mobile: add contextual AI entry points (CU-085)`

---

## 6. Phase-Level Guardrails (apply to every CU)

- **No AI keys in mobile**; **no mobile direct provider SDK calls**; mobile assembles no health context —
  it sends message/surface/local values and renders backend output.
- **No live model calls in tests** — `MockAiProvider` is default in local/test; live adapters never invoked by tests.
- **No committed OpenAI/Anthropic keys** — `.env.example` placeholders only; real keys are Phase Z.
- Live adapters (`openai`, `@anthropic-ai/sdk`) are **env-guarded** and **fail clearly** (typed
  `AiProviderNotConfiguredError`) when key is missing/`PLACEHOLDER`.
- **No raw provider payloads** in AI context; **no unbounded raw time-series** in prompts (compact evidence).
- **No raw health prompts / packets / sensitive notes in general logs** (§19.3) — metadata + redacted audit only.
- **No medical diagnosis/treatment/cure/prevention claims**; emergency/medical → safe templates (§17).
- **No LLM calculation of deterministic scores**; **no hidden scoring changes** (scores stay in `@primis/scoring`).
- **No AI blocking of critical screens** — deterministic data always renders; AI degrades gracefully.
- Tone changes **phrasing only**, never recommendation logic (ARCH-AI-003, AI-SAFE-004).
- **No source-of-truth doc rewrites** — for material conflicts create an ADR (`docs/decisions/`).
  Phase I ADRs: **ADR-007** (`ai_summaries` cache table) and, if useful, a streaming-transport ADR for CU-082.
- Per-CU DoD: TS passes, lint clean (`--max-warnings 0`), tests pass, no secrets, design tokens for UI,
  shared typed DTOs for backend, new AI-metadata schema aligns with data-model conventions + ADR.

---

## 7. Reusable Handoff Prompt Template (per CU)

```text
You are implementing exactly ONE commit unit for Primis Phase I on branch
feature/ai-context-engine-ai-coach. Do not start any other CU.

CU: <CU-ID> — <title>
Goal: <one line>

1. Read (in priority order):
   - docs/source-of-truth/primis_full_implementation_spec_commit_plan.md → <CU-ID> + §2/§3/§3.5
   - <exact AI/TAD/data-model/UI/scoring sections listed for this CU in the Phase I plan §5>
   - plans/phase-i-ai-context-engine-ai-coach.md → the <CU-ID> section (authoritative task list)
   - .ai-agent-instructions.md and docs/README.md (source-priority + ADR rule)

2. Confirm prerequisites:
   - Prior same-phase CUs committed and green.
   - For CU-080 / CU-085: verify Phase H is merged into this branch; if not, apply the plan's
     Phase-H gate (fixtures + defer Nutrition wiring).

3. Implement ONLY the files listed for <CU-ID>. Reuse existing repos/contracts:
   @primis/core-types (ai.ts, redaction.ts), @primis/api-contracts, @primis/config,
   services/api/src/repositories/aiRepository.ts + domain repos, @primis/ai (once CU-076 lands).

4. Honor the phase guardrails (§6): mock AI by default; no live model calls in tests; no keys/PII/raw
   payloads/raw prompts in logs; no score recomputation; no mobile provider calls; performance-only,
   non-medical framing; AI never blocks core screens.

5. Add/adjust tests (Vitest, deterministic, no network/DB). Run the CU's verification commands until green:
   <verify commands>. Then: pnpm lint && pnpm typecheck && pnpm format:check.

6. If a source doc conflicts with code/contract in a material way (safety, packet shape, streaming, schema),
   STOP and propose an ADR under docs/decisions/ instead of guessing.

7. Commit with EXACTLY: <area>: <short imperative> (<CU-ID>)
   Return: summary, files touched, tests added, known limitations, follow-ups.
```

---

## 8. Definition of Done for Phase I

- [ ] `@primis/ai` package builds/tests; `AiGateway` + `MockAiProvider` work **without keys**; live
      adapters env-guarded and fail clearly; **no product code imports provider SDKs directly**.
- [ ] Intent classifier covers all required categories incl. unsupported-medical/emergency; returns
      domains + missing slots; tests green.
- [ ] Versioned Zod context-packet schemas (packet/profile/safety/availability/evidence/output) in
      `@primis/api-contracts` + `@primis/ai`; validation tests green.
- [ ] Profile/score/baseline + sleep/recovery/training/nutrition/bedtime/manual builders produce compact,
      evidence-based, confidence-tagged packets from structured data only (no raw payloads).
- [ ] PromptComposer + SafetyPolicyEngine enforce performance-only, non-medical, grounded output; tone
      affects phrasing only; medical/emergency routed to safe templates; red-team tests green.
- [ ] `POST /api/v1/ai/chat` classifies → builds context → routes via gateway → **SSE streams** → stores
      metadata safely; no raw prompts/health in logs; mock-stream + unsupported-medical tests green.
- [ ] `ai_summaries` migration + repo + worker jobs generate/cache summaries via the context engine (mock
      adapter in tests); graceful fallback to last cached; ADR-007 written.
- [ ] Mobile AI Coach screen: suggested prompts, (mock) streaming, evidence chips, missing-data follow-ups,
      graceful AI failure, design tokens, a11y, **no provider calls / no keys / no raw prompt exposure**.
- [ ] Contextual “Ask AI about this” on Sleep/Recovery/Activity(/Nutrition if Phase H) opens Coach with
      prefilled intent; **no auto-trigger on render**.
- [ ] All CUs: `pnpm lint` (0 warnings), `pnpm typecheck`, relevant `pnpm --filter … test`, `pnpm format:check`
      pass; no secrets committed; no hidden scoring changes; guardrails §6 upheld.

---

## 9. Known Risks / Decisions to Defer

- **RN real streaming** — default fetch can’t stream response bodies reliably. Phase I ships an SSE contract
  - simulated mobile streaming seam; **real wire-streaming (SSE/XHR/library) hardening deferred to Phase J.**
- **Live provider parity** — OpenAI/Anthropic adapters are scaffolded + env-guarded but unexercised (mock is
  default); live prompt tuning, model routing maturity, and cost tuning are later phases (AI-4/AI-5).
- **Phase H coupling** — nutrition/manual context + Nutrition “Ask AI” depend on Phase H merge; gated, with
  fixture-based build/test fallback.
- **Summary read API** — a `GET /ai/summaries/latest` reader may be trivial to add in CU-083 or deferred to
  Phase J alongside mobile summary wiring; do not block core screens either way.
- **Eval/golden-test harness** (§20) and **AI privacy controls UI / opt-in gating** (§23.4) are **Phase J**.
- **Body-composition & gut/digestion builders** — may be scaffolded in CU-080; full parity can slip to a
  later CU if it risks scope creep (declare explicitly).

---

## 10. Open Questions / Assumptions

**Resolved by user (baked into this plan):**

- **Q1 Phase H:** assume Phase H is merged into the Phase I branch before CU-080/085; add a pre-req gate +
  graceful fixture/defer fallback if not.
- **Q2 Summaries:** add a dedicated, well-indexed **`ai_summaries` cache table** (new AI-metadata migration +
  repo) + **ADR-007** resolving the data-model §18 gap (“most mature” cache pattern).
- **Q3 Streaming:** **SSE** contract on the backend + **simulated mobile streaming** seam; real RN streaming deferred.
- **Q4 Adapters:** add **real `openai` + `@anthropic-ai/sdk`** deps, **env-guarded**, mock-by-default, never called in tests.

**Assumptions (proceeding unless corrected):**

- Work proceeds on `feature/ai-context-engine-ai-coach` (the `phase/phase-i-…` branch does not exist).
- AI routes register under `/api/v1/ai/*` (server) with mobile constants under `/v1/ai/*`, matching existing convention.
- `PLACEHOLDER`/empty provider keys are treated as “not configured” → gateway falls back to mock; live adapter throws typed error.
- Context-engine domain reads go through (extended) `@primis/api`/repository functions or shared query
  helpers — `@primis/ai` does not open its own DB pool in unit tests (all mocked/fixtured).
- CU-083 worker jobs mirror `runDailyScoring` (injected clock, pure/DB-I-O split, mocked Kysely).
- A `GET /ai/summaries/latest` reader is optional in Phase I (added only if trivial; otherwise Phase J).

**Still worth confirming at execution time (non-blocking):**

- Whether to add the summary read endpoint in CU-083 or defer to Phase J.
- Whether body-composition/gut-digestion builders are full or scaffold-only in CU-080.

---

## 11. Next-Phase Preview (Phase J awareness only)

Phase J (**CU-086+**, Private Beta Quality Hardening) builds directly on Phase I: **privacy & data-controls
UI** (AI opt-in/processing toggles, §23.4), **AI evaluation/golden-test + red-team harness** (§20, §33),
**real RN streaming hardening**, mobile **summary read wiring**, cost/latency tuning, and public-launch AI
disclosure. Phase I should leave clean seams for these (AI-processing flags already in the safety context;
`ai_summaries` cache ready for a read API; streaming seam ready to swap simulation for real transport).
**Do not implement Phase J work in Phase I** beyond preserving these seams.

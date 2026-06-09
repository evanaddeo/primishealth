# Primis AI Context Engine Spec

**Document type:** AI Context Engine Specification  
**Product:** Primis  
**Version:** 1.1  
**Status:** Draft for implementation planning  
**Prepared for:** Evan / Primis private beta  
**Last updated:** 2026-06-07  
**Primary audience:** AI coding agents, backend engineers, AI/ML engineers, data engineers, mobile engineers, product owner

---

## 0. AI Coding Agent Instructions

This document is intended to be consumed directly by AI coding agents and human engineers. Treat it as the authoritative source of truth for Primis AI context assembly, model routing, prompt contracts, AI safety boundaries, AI response schemas, and AI-related backend behavior unless superseded by a later AI architecture decision record.

### 0.1 How to use this document

1. **Do not send raw health history directly to an LLM by default.** Build compact, relevant, structured context packets from normalized metrics, score snapshots, baselines, insight candidates, and user profile fields.
2. **Do not make the LLM the source of truth for core scores.** The scoring engine calculates Sleep Score, Recovery Score, Training Readiness, Strain/Load, Nutrition Score, Wellbeing Score, and Bedtime Planner candidates. AI explains, summarizes, coaches, and asks useful follow-up questions.
3. **Every AI answer must be grounded in explicit evidence.** If evidence is missing, the answer must say so plainly.
4. **Do not claim medical diagnosis, disease detection, treatment, prevention, or cure.** Primis is a performance and wellness analytics product.
5. **Respect user-configurable tone.** Coach tone and summary tone change language style only. They must not change the underlying recommendation logic.
6. **Use model abstraction from day one.** Do not call OpenAI, Anthropic, or another model provider directly from product services. Use the internal `AiGateway` / provider adapter interface described in this document.
7. **Design for latency.** Critical mobile screens must never block on live LLM calls. Use cached summaries, precomputed insights, streaming responses for chat, and asynchronous generation where appropriate.
8. **Design for cost.** Prefer precomputed summaries, compact packets, prompt templates, structured outputs, and task-based model routing over sending large contexts to expensive models.
9. **Log safely.** Do not log raw AI prompts, raw health data, provider payloads, or model outputs containing sensitive health details into general application logs. Use redacted observability events.
10. **Use requirement IDs.** Reference IDs like `AI-ARCH-001`, `AI-CTX-004`, `AI-SAFE-002`, and `AI-AC-007` in tickets, commits, and implementation comments where useful.

### 0.2 Language conventions

- **MUST:** Required for implementation unless explicitly deferred.
- **SHOULD:** Strongly recommended; deviations need an architecture decision record.
- **MAY:** Optional or phase-dependent.
- **MUST NOT:** Prohibited unless a later source-of-truth document overrides it.

### 0.3 Relationship to other source-of-truth documents

This is document 5 of the initial Primis planning set.

1. Product Requirements Document
2. Technical Architecture Document
3. Data Model / Health Metric Schema
4. Scoring & Algorithms Spec
5. **AI Context Engine Spec**
6. UI/UX Design System Spec
7. MVP Build Plan / Milestones

This document depends on the prior four documents. If conflict exists:

1. Product scope comes from the PRD.
2. Infrastructure boundaries come from the Technical Architecture Document.
3. Table/entity/metric names come from the Data Model / Health Metric Schema.
4. Score formulas and deterministic insight generation come from the Scoring & Algorithms Spec.
5. AI context assembly, prompt contracts, model routing, and AI interaction behavior come from this document.

---

## 1. Executive Summary

Primis is an AI-native performance health OS. The AI Context Engine is the subsystem that makes Primis feel intelligent without making the AI model responsible for raw score computation. It converts the user's normalized health data, score snapshots, baselines, goals, manual inputs, nutrition logs, sleep/workout summaries, body composition records, and deterministic insight candidates into compact, task-specific context packets that model providers can use to generate accurate, fast, and useful responses.

The AI Context Engine MUST support:

- AI chat with the user's health data
- Sleep summaries
- Recovery explanations
- Training/workout recommendations
- Nutrition coaching
- Bedtime Planner explanations
- Body composition trend explanations
- Gut/digestion trend explanations
- Weekly/monthly health reviews
- Smart follow-up questions when data is missing
- Configurable coach style
- Configurable summary style
- Model-provider abstraction across GPT, Anthropic, and future providers

The AI Context Engine MUST NOT:

- calculate core scores from scratch
- diagnose disease
- promise medical certainty
- dump all raw health data into prompts
- block primary UI rendering
- allow tone settings to alter core logic
- silently hallucinate unavailable data

Core design principle:

```text
raw/provider data -> normalized health model -> deterministic scores/insights -> compact context packet -> AI response
```

Bad design:

```text
raw data dump -> LLM guesses scores/advice
```

---

## 2. Product Intent for AI

### 2.1 AI product role

AI in Primis is a first-class product surface, not a decorative chatbot. It should act as:

| Role                  | Description                                                                    | Example                                                                              |
| --------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Analyst               | Explains what changed and why.                                                 | "Your HRV is 12% below baseline and sleep debt is 2.1 hours."                        |
| Coach                 | Suggests what to do next.                                                      | "Use moderate training today rather than a max-effort lower-body session."           |
| Translator            | Turns complex health analytics into plain English.                             | "Your recovery is being dragged down mostly by short sleep and elevated resting HR." |
| Personalization layer | Adapts communication to user goals and tone.                                   | Strict vs encouraging vs concise.                                                    |
| Context collector     | Asks lightweight follow-up questions when missing data blocks a better answer. | "Did you drink alcohol last night or train late?"                                    |
| Summarizer            | Produces sleep, workout, weekly, and nutrition summaries.                      | "This week, your best sleep followed earlier caffeine cutoff."                       |

### 2.2 AI is not the analytical core

Primis must feel AI-native, but the core analytical system is deterministic and data-model-driven.

The AI layer receives:

- computed scores
- score components
- score explanations
- baselines
- trend deltas
- insight candidates
- relevant recent events
- user goals/preferences
- selected style/tone

The AI layer then produces:

- plain-English explanation
- coach-style recommendation
- next action
- question for missing context
- user-facing summary cards
- structured metadata for UI display

### 2.3 Why this architecture exists

This architecture exists to optimize:

- **accuracy:** AI receives curated evidence rather than raw noise
- **latency:** context packets are small and cached
- **cost:** smaller prompts and task-based routing
- **trust:** deterministic scores remain auditable
- **safety:** performance-only language and medical guardrails
- **UX:** fast UI with AI as enhancement, not blocking dependency
- **future-proofing:** model providers can change without rewriting product logic

---

## 3. External AI Provider Notes

### 3.1 OpenAI

Primis will initially use GPT-family models through the backend model abstraction layer. The current OpenAI Responses API supports text/image inputs, text/JSON outputs, model-generated tool/function calls, built-in tools, streaming, prompt caching, background mode, and structured outputs. The backend should prefer structured outputs where a UI or downstream service requires machine-readable responses.

Reference:

- https://platform.openai.com/docs/api-reference/responses
- https://platform.openai.com/docs/guides/structured-outputs
- https://platform.openai.com/docs/guides/tools

Implementation note: do not hardcode a specific model version in application logic. Store model choices in configuration.

### 3.2 Anthropic

Primis should support Anthropic through a provider adapter. Claude's Messages API supports multi-turn messages, tool use, streaming, and prompt caching. Prompt caching may reduce latency/cost for repetitive long system prompts or stable context prefixes.

Reference:

- https://docs.anthropic.com/en/api/messages
- https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview
- https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching

Implementation note: do not assume OpenAI response structures map 1:1 to Anthropic. Use a provider-neutral internal response format.

### 3.3 Future model providers

The backend should support additional providers later, including:

- hosted proprietary LLMs
- smaller low-cost summary models
- local/self-hosted models for non-sensitive, low-stakes summarization
- embedding providers
- moderation/classification providers
- non-LLM ML services for ranking/correlation later

All provider-specific logic must live behind adapters.

---

## 4. AI System Architecture

### 4.1 Components

```text
Mobile App
  -> Primis API
    -> AiRequestController
      -> UserAuth / Consent Check
      -> IntentClassifier
      -> ContextOrchestrator
        -> ProfileContextBuilder
        -> ScoreContextBuilder
        -> MetricContextBuilder
        -> InsightContextBuilder
        -> ManualInputContextBuilder
        -> NutritionContextBuilder
        -> SleepContextBuilder
        -> TrainingContextBuilder
        -> BodyCompositionContextBuilder
        -> BedtimeContextBuilder
      -> PromptComposer
      -> SafetyPolicyEngine
      -> AiGateway
        -> OpenAIAdapter
        -> AnthropicAdapter
        -> FutureProviderAdapter
      -> ResponseValidator
      -> ResponsePostProcessor
      -> Persistence / Cache
      -> Mobile Response
```

### 4.2 Service ownership

| Component               | Responsibility                            | Owns deterministic logic? |         Owns generation? |
| ----------------------- | ----------------------------------------- | ------------------------: | -----------------------: |
| `AiRequestController`   | API entrypoint for chat/summaries         |                        No |                       No |
| `IntentClassifier`      | Classifies user request / summary task    |                   Limited | Maybe, for fallback only |
| `ContextOrchestrator`   | Builds compact context packets            |                       Yes |                       No |
| `PromptComposer`        | Creates provider-neutral prompt request   |                        No |                       No |
| `SafetyPolicyEngine`    | Applies health/performance guardrails     |                       Yes |                       No |
| `AiGateway`             | Routes to configured model provider       |                        No |          Yes via adapter |
| `ResponseValidator`     | Validates JSON/schema/claims/evidence     |                       Yes |                       No |
| `ResponsePostProcessor` | Formats and stores AI output              |                   Limited |                       No |
| `ScoreEngine`           | Computes scores                           |                       Yes |                       No |
| `InsightEngine`         | Computes deterministic insight candidates |                       Yes |                       No |

### 4.3 Requirement IDs

| ID          | Requirement                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| AI-ARCH-001 | AI calls MUST route through `AiGateway`; product services MUST NOT call provider SDKs directly.                                |
| AI-ARCH-002 | AI requests MUST pass through `ContextOrchestrator` unless the request is a simple non-health app help message.                |
| AI-ARCH-003 | AI prompts MUST be composed from structured context packets, not direct SQL dumps or raw provider payloads.                    |
| AI-ARCH-004 | Core scores MUST be calculated before AI explanation whenever possible.                                                        |
| AI-ARCH-005 | AI answers MUST include evidence references derived from context packet evidence IDs.                                          |
| AI-ARCH-006 | Model provider, model name, max tokens, temperature, and timeout MUST be externally configurable.                              |
| AI-ARCH-007 | The mobile app MUST be able to show cached/precomputed summaries without waiting for live AI generation.                       |
| AI-ARCH-008 | The system MUST support streaming responses for chat-style interactions.                                                       |
| AI-ARCH-009 | The system MUST support asynchronous background generation for weekly/monthly summaries.                                       |
| AI-ARCH-010 | The system MUST store AI response metadata for debugging and evaluation without storing sensitive raw prompts in general logs. |

---

## 5. AI Surfaces in Primis

### 5.1 Primary surfaces

| Surface                      |     Phase | Trigger                                      |                            Latency expectation |               Blocking? |
| ---------------------------- | --------: | -------------------------------------------- | ---------------------------------------------: | ----------------------: |
| AI Coach Chat                | Phase 1/2 | User opens Coach tab and asks question       |                    Streaming start < 2s target | No critical UI blocking |
| Sleep Summary                | Phase 1/2 | After main sleep session processed           |                             Precomputed/cached |                      No |
| Recovery Explanation         | Phase 1/2 | After daily scores processed                 |                             Precomputed/cached |                      No |
| Workout Summary              |   Phase 2 | After workout sync/entry                     |                             Async or on-demand |                      No |
| Nutrition Coaching           | Phase 2/3 | User logs food/macros/water/caffeine/alcohol |                                Async/on-demand |                      No |
| Bedtime Planner Explanation  |   Phase 2 | User selects wake time                       | Mostly deterministic + optional AI explanation |                      No |
| Weekly Review                | Phase 2/3 | Scheduled weekly job                         |                                          Async |                      No |
| Smart Missing-Data Questions |   Phase 2 | AI detects missing context                   |                                         Inline |                      No |
| Custom Insight Cards         | Phase 2/3 | Insight engine emits candidate               |                   Precomputed AI copy optional |                      No |

### 5.2 AI Coach Chat

The AI Coach Chat is a major feature, but it should not dominate the whole product. The chat should be a powerful query layer on top of structured health data.

Examples of supported questions:

```text
Should I lift today?
Why is my recovery lower?
What hurt my sleep last night?
What bedtime should I aim for if I need to wake up at 6:30?
How has caffeine affected my sleep?
What should I eat today if I want to hit 180g protein?
How did alcohol affect my recovery last week?
Am I improving my VO2 max?
Do my workouts look too intense this week?
What is the trend in my body fat and lean mass?
```

The chat must use retrieval/context tools. It must not answer data-specific questions from memory or generic assumptions.

### 5.3 Sleep Summary

Sleep summaries should be generated after the latest main sleep session has been normalized and Sleep Score calculated.

Summary should include:

- sleep score
- sleep duration
- sleep debt change
- sleep consistency
- notable stage changes if available
- overnight recovery signals if available
- likely drivers from manual inputs/tags
- one recommended action

### 5.4 Recovery Explanation

Recovery explanation should include:

- Recovery Score
- component contributions
- HRV vs baseline
- resting HR vs baseline
- sleep score/debt
- respiratory/SpO2 anomalies if available
- recent training load context
- subjective input context if available
- suggested training intensity band

### 5.5 Workout Summary

Workout summaries should include:

- workout type
- duration
- heart-rate zones
- active calories
- strain/load estimate
- relation to weekly load
- recovery-adjusted interpretation
- next-step suggestion

### 5.6 Nutrition Coaching

Nutrition coaching should support:

- macro target adherence
- calories in vs calories out
- protein sufficiency
- hydration
- caffeine timing
- alcohol amount/type and recovery correlations
- whole-food / high-protein / user nutrition philosophy preferences
- FoodData Central entries when available
- AI-assisted food estimates as estimates only

Nutrition AI must clearly mark low-confidence estimates.

### 5.7 Bedtime Planner Explanation

The Bedtime Planner deterministic engine ranks bedtime windows based on target wake time, sleep latency, sleep need, sleep debt, circadian consistency, sleep-cycle heuristics, recovery needs, and historical wake quality. AI may explain the ranked windows.

AI must not claim exact sleep-cycle certainty. It should use language like:

```text
This is a best-fit window, not an exact sleep-cycle guarantee.
```

### 5.8 Weekly Review

Weekly review should summarize:

- average sleep score
- recovery trend
- best/worst nights
- training load trend
- step/activity trend
- calories/macros if available
- water/caffeine/alcohol trends
- body composition changes if available
- strongest correlations
- one or two suggested experiments for next week

Weekly review should be generated asynchronously and cached.

---

## 6. Core AI Principles

### 6.1 Structured context over raw data

AI should receive curated context such as:

```json
{
  "recoveryScore": 68,
  "hrvDeviation": "12% below 30-day baseline",
  "sleepDebtHours": 2.1,
  "trainingLoadStatus": "above_normal",
  "manualTags": ["late_caffeine", "moderate_soreness"]
}
```

AI should not receive unbounded raw timeseries like every heart-rate point unless the question specifically requires detailed timeseries analysis and the timeseries is compressed/sampled.

### 6.2 Deterministic evidence first

Every data-specific AI answer must be based on one or more evidence objects.

Evidence examples:

```json
{
  "id": "ev_hrv_2026_06_02",
  "type": "metric_deviation",
  "metricCode": "hrv_rmssd",
  "statement": "HRV is 12% below the 30-day baseline.",
  "value": 54,
  "baseline": 61,
  "unit": "ms",
  "confidence": "medium"
}
```

The LLM should cite evidence IDs internally in structured output. UI may not show raw IDs, but the response should be traceable.

### 6.3 User tone affects delivery, not truth

Coach style can be strict, encouraging, analyst, performance coach, concise, explanatory, calm, or unhinged-lite. Summary style can be concise, detailed, data-heavy, plain English, or action-only.

Tone MUST NOT:

- change score thresholds
- change medical safety boundaries
- make uncertain data sound certain
- encourage unsafe behavior
- override deterministic recommendation bands

### 6.4 Performance-only language

Primis may say:

```text
Your signals are outside your recent baseline.
Your recovery markers are not ideal for max-intensity training today.
This pattern can happen when sleep is short, stress is high, or training load is elevated.
```

Primis must not say:

```text
You are sick.
You have a respiratory infection.
Your cortisol is high.
This indicates disease.
```

### 6.5 AI defaults

For the private MVP, AI is enabled by default because the product is AI-native and built for the founder/private beta. For public release, the onboarding must provide clear disclosure that AI may process health-related context to generate coaching/summaries. The product default should remain AI-enabled, but public-release privacy and platform-review requirements may require clear controls, data deletion, and possibly opt-out settings.

---

## 7. Intent Classification

### 7.1 Purpose

The Intent Classifier determines what the user is asking and which context builders are required. It may be rule-based first, then optionally model-assisted.

### 7.2 Intent enum

```typescript
export type AiIntent =
  | 'daily_status'
  | 'sleep_analysis'
  | 'recovery_analysis'
  | 'training_recommendation'
  | 'workout_summary'
  | 'activity_trend'
  | 'nutrition_coaching'
  | 'hydration_caffeine_alcohol'
  | 'body_composition_analysis'
  | 'gut_digestion_analysis'
  | 'bedtime_planning'
  | 'weekly_review'
  | 'monthly_review'
  | 'metric_explanation'
  | 'correlation_query'
  | 'data_availability_question'
  | 'app_help'
  | 'general_health_education'
  | 'unsupported_medical_request'
  | 'unknown';
```

### 7.3 Intent classification rules

| Input pattern                    | Likely intent                                            | Required context                                                      |
| -------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| "Should I lift/train/run today?" | `training_recommendation`                                | latest scores, recovery, training load, soreness, goal                |
| "Why is my recovery low?"        | `recovery_analysis`                                      | recovery score, components, baselines, sleep, training, manual inputs |
| "How did I sleep?"               | `sleep_analysis`                                         | latest sleep session, Sleep Score, sleep debt, stages                 |
| "When should I go to bed?"       | `bedtime_planning`                                       | target wake time, latency, sleep need, debt, circadian profile        |
| "How is caffeine affecting me?"  | `hydration_caffeine_alcohol` or `correlation_query`      | caffeine logs, sleep/recovery trends, correlation insights            |
| "What should I eat?"             | `nutrition_coaching`                                     | nutrition goals, macros, activity, recovery, preferences              |
| "What happened this week?"       | `weekly_review`                                          | weekly summaries, score trends, insights                              |
| "Am I sick?"                     | `unsupported_medical_request` or performance-safe answer | recent deviations, safety template                                    |

### 7.4 Intent output schema

```typescript
export interface IntentClassificationResult {
  intent: AiIntent;
  confidence: number; // 0..1
  secondaryIntents?: AiIntent[];
  requiredContextDomains: ContextDomain[];
  timeRange: TimeRangeSpec;
  requiresUserFollowUp: boolean;
  missingCriticalSlots: MissingSlot[];
  safetyCategory: AiSafetyCategory;
}
```

### 7.5 Missing slot detection

Examples:

| Intent                    | Missing slot                     | User prompt                                                                          |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `bedtime_planning`        | target wake time                 | "What time do you need to wake up tomorrow?"                                         |
| `nutrition_coaching`      | goal / calories / protein target | "Are you aiming for fat loss, muscle gain, maintenance, or performance?"             |
| `training_recommendation` | workout type                     | "Are you considering lifting, cardio, basketball, or something else?"                |
| `correlation_query`       | variable                         | "Which input should I compare: caffeine, alcohol, water, soreness, or a custom tag?" |

Missing-slot questions must be short and only asked when needed. If enough data exists to give a useful partial answer, AI should answer with caveats instead of over-questioning.

---

## 8. Context Domains

### 8.1 Context domain enum

```typescript
export type ContextDomain =
  | 'user_profile'
  | 'user_goals'
  | 'coach_preferences'
  | 'latest_scores'
  | 'score_components'
  | 'baselines'
  | 'daily_summaries'
  | 'sleep'
  | 'recovery'
  | 'training'
  | 'activity'
  | 'nutrition'
  | 'hydration'
  | 'caffeine'
  | 'alcohol'
  | 'manual_inputs'
  | 'custom_tags'
  | 'body_composition'
  | 'gut_digestion'
  | 'bedtime_planner'
  | 'insights'
  | 'correlations'
  | 'data_availability'
  | 'app_help';
```

### 8.2 Domain-source mapping

| Domain              | Primary data sources                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| `user_profile`      | users, user_settings, user_preferences                                        |
| `user_goals`        | user_goals, onboarding responses                                              |
| `coach_preferences` | coach_preferences, summary_preferences                                        |
| `latest_scores`     | score_snapshots                                                               |
| `score_components`  | score_component_snapshots                                                     |
| `baselines`         | metric_baselines                                                              |
| `daily_summaries`   | daily_metric_summaries                                                        |
| `sleep`             | sleep_sessions, sleep_stage_segments, Sleep Score snapshots                   |
| `recovery`          | recovery score snapshots, HRV/RHR/respiratory/SpO2 baselines                  |
| `training`          | workout_sessions, training_load_snapshots, manual soreness/fatigue            |
| `activity`          | daily summaries, steps, active calories, zone minutes                         |
| `nutrition`         | nutrition_entries, food_entries, macro summaries, FoodData Central catalog    |
| `hydration`         | hydration_entries, daily hydration summaries                                  |
| `caffeine`          | caffeine_entries, custom tags, nutrition logs                                 |
| `alcohol`           | alcohol_entries, custom tags, nutrition logs                                  |
| `manual_inputs`     | manual_checkins, mood/energy/stress/soreness entries                          |
| `custom_tags`       | custom_tags, tagged_events                                                    |
| `body_composition`  | body_composition_measurements, HealthKit/Hume-derived records                 |
| `gut_digestion`     | bowel_entries, digestion symptom entries, custom tags                         |
| `bedtime_planner`   | bedtime recommendation snapshots, sleep latency, chronotype/circadian profile |
| `insights`          | deterministic insight_candidates                                              |
| `correlations`      | correlation_snapshots                                                         |
| `data_availability` | provider_connections, provider_metric_availability                            |

---

## 9. Context Packet Design

### 9.1 Context packet philosophy

A context packet is a compact JSON object sent to an AI model. It should contain only what the model needs for the task.

Context packets should be:

- small enough for low latency
- explicit about missing data
- explicit about confidence
- evidence-based
- domain-specific
- safe to pass to a model provider according to user consent/settings
- versioned
- testable

### 9.2 Base context packet schema

```typescript
export interface AiContextPacket {
  packetVersion: '1.0';
  packetId: string;
  userIdHash: string;
  requestId: string;
  createdAt: string;
  product: 'Primis';
  environment: 'dev' | 'staging' | 'prod';
  intent: AiIntent;
  timeRange: TimeRangeSpec;
  userProfile: AiUserProfileContext;
  safety: AiSafetyContext;
  dataAvailability: AiDataAvailabilityContext;
  contextDomains: ContextDomain[];
  evidence: AiEvidence[];
  payload: Record<string, unknown>;
  outputContract: AiOutputContract;
}
```

### 9.3 Time range schema

```typescript
export interface TimeRangeSpec {
  label:
    | 'today'
    | 'yesterday'
    | 'last_7_days'
    | 'last_14_days'
    | 'last_30_days'
    | 'last_90_days'
    | 'custom'
    | 'latest_available';
  startDate?: string;
  endDate?: string;
  timezone: string;
}
```

### 9.4 User profile context

```typescript
export interface AiUserProfileContext {
  ageRange?: string; // optional, avoid exact DOB unless needed
  timezone: string;
  primaryPlatform: 'ios' | 'android' | 'unknown';
  primaryWearableProvider?:
    | 'google_health'
    | 'healthkit'
    | 'health_connect'
    | 'fitbit_legacy'
    | 'manual'
    | 'unknown';
  rankedGoals: RankedGoal[];
  nutritionPhilosophy?: NutritionPhilosophyContext;
  coachStyle: CoachStyle;
  summaryStyle: SummaryStyle;
  preferredUnits: PreferredUnits;
  trainingPreferences?: TrainingPreferenceContext;
  trackingPreferences?: TrackingPreferenceContext;
}
```

### 9.5 Ranked goals

```typescript
export type GoalCode =
  | 'athletic_performance'
  | 'sleep_quality'
  | 'recovery'
  | 'fat_loss'
  | 'muscle_gain'
  | 'body_composition'
  | 'longevity'
  | 'general_health'
  | 'stress_management'
  | 'nutrition_quality';

export interface RankedGoal {
  code: GoalCode;
  rank: number; // 1 = highest priority
  active: boolean;
}
```

### 9.6 Nutrition philosophy context

Primis may support user-selected nutrition philosophy/preferences. The founder's initial philosophy can inform default coach leanings, but public users should be able to customize or disable ideological leanings.

```typescript
export interface NutritionPhilosophyContext {
  highProtein: boolean;
  wholeFoodsEmphasis: boolean;
  avoidSeedOils: boolean;
  avoidArtificialDyes: boolean;
  animalProductsPositive: boolean;
  antiInflammatoryEmphasis: boolean;
  processedFoodMinimization: boolean;
  customNotes?: string;
}
```

### 9.7 Coach style enum

```typescript
export type CoachStyle =
  | 'analyst'
  | 'performance_coach'
  | 'strict'
  | 'encouraging'
  | 'concise'
  | 'explanatory'
  | 'calm'
  | 'unhinged_lite';
```

### 9.8 Summary style enum

```typescript
export type SummaryStyle = 'concise' | 'detailed' | 'data_heavy' | 'plain_english' | 'action_only';
```

### 9.9 Safety context

```typescript
export interface AiSafetyContext {
  productMode: 'performance_wellness_only';
  medicalDiagnosisAllowed: false;
  emergencyHandlingRequired: boolean;
  userIsMinorKnown?: boolean;
  sensitiveDataPolicy: 'minimal_context' | 'standard_context' | 'extended_private_beta_context';
  aiProcessingEnabled: boolean;
  publicLaunchPrivacyMode?: 'default_ai_enabled_with_controls' | 'ai_opt_in_required' | 'unknown';
}
```

### 9.10 Data availability context

```typescript
export interface AiDataAvailabilityContext {
  providerConnections: ProviderConnectionSummary[];
  availableMetricCodes: string[];
  unavailableMetricCodes: string[];
  staleMetricCodes: string[];
  latestSyncAt?: string;
  dataFreshnessStatus: 'fresh' | 'stale' | 'partial' | 'unavailable';
  historyDepthDaysByDomain: Record<ContextDomain, number>;
  limitations: string[];
}
```

### 9.11 Evidence schema

```typescript
export type AiEvidenceType =
  | 'score_snapshot'
  | 'score_component'
  | 'metric_value'
  | 'metric_deviation'
  | 'trend'
  | 'correlation'
  | 'manual_input'
  | 'provider_availability'
  | 'sleep_session'
  | 'workout_session'
  | 'nutrition_summary'
  | 'body_composition_measurement'
  | 'bedtime_recommendation'
  | 'insight_candidate';

export interface AiEvidence {
  id: string;
  type: AiEvidenceType;
  domain: ContextDomain;
  statement: string;
  metricCode?: string;
  value?: number | string | boolean;
  unit?: string;
  baseline?: number | string;
  delta?: number | string;
  direction?: 'up' | 'down' | 'stable' | 'mixed' | 'unknown';
  confidence: 'high' | 'medium' | 'low' | 'not_enough_data';
  source:
    | 'deterministic_engine'
    | 'normalized_metric'
    | 'manual_input'
    | 'provider'
    | 'ai_prior_summary';
  observedAt?: string;
  rangeStart?: string;
  rangeEnd?: string;
}
```

---

## 10. Context Builder Requirements

### 10.1 Context builder interface

```typescript
export interface ContextBuilder<TPayload> {
  domain: ContextDomain;
  build(input: ContextBuilderInput): Promise<ContextBuilderResult<TPayload>>;
}

export interface ContextBuilderInput {
  userId: string;
  intent: AiIntent;
  timeRange: TimeRangeSpec;
  requiredDepth: 'minimal' | 'standard' | 'deep';
  requestText?: string;
  missingDataPolicy: 'include_limitations' | 'fail_if_missing_required' | 'best_effort';
}

export interface ContextBuilderResult<TPayload> {
  domain: ContextDomain;
  payload: TPayload;
  evidence: AiEvidence[];
  limitations: string[];
  completeness: number; // 0..1
  confidence: 'high' | 'medium' | 'low' | 'not_enough_data';
}
```

### 10.2 UserProfileContextBuilder

Must include:

- timezone
- goals and ranking
- coach style
- summary style
- preferred units
- nutrition philosophy if selected
- tracking preferences
- privacy/AI processing flags

Must not include:

- exact address
- raw email
- OAuth tokens
- unnecessary personally identifying information

### 10.3 ScoreContextBuilder

Must include latest relevant score snapshots:

- Sleep Score
- Recovery Score
- Training Readiness
- Strain/Load
- Activity Score
- Nutrition Score if available
- Wellbeing Score if available
- Bedtime Recommendation Score if relevant

Must include component contributions when available.

### 10.4 BaselineContextBuilder

Must include:

- 7-day, 14-day, 30-day, 90-day baselines where relevant
- baseline readiness status
- deviation magnitude
- plain-language interpretation

It should not include long raw metric histories unless needed.

### 10.5 InsightContextBuilder

Must include deterministic insight candidates ranked by relevance:

- latest score drivers
- trend anomalies
- correlation candidates
- sleep/recovery/training/nutrition insights
- missing-data insights

Each insight must have:

- `insightId`
- `domain`
- `severity`
- `confidence`
- `evidenceIds`
- `recommendedAction`

### 10.6 ManualInputContextBuilder

Must include recent manual inputs relevant to the intent:

- mood
- energy
- stress
- soreness
- fatigue
- hydration
- caffeine
- alcohol
- digestion/poop entries
- custom tags
- notes if safe/relevant

Manual notes should be summarized or limited, not dumped unbounded into prompts.

### 10.7 NutritionContextBuilder

Must include:

- calories in
- protein/carbs/fat
- meal timing
- hydration
- caffeine
- alcohol
- selected nutrition philosophy
- food entries when relevant
- estimation confidence for AI-estimated meals

Must differentiate:

- user-entered exact food
- FoodData Central food
- AI-estimated food
- manually entered macro total

### 10.8 SleepContextBuilder

Must include:

- latest sleep session
- sleep score
- sleep duration
- sleep efficiency
- sleep stages if available
- sleep debt
- latency estimate
- bedtime/wake consistency
- overnight recovery signals
- sleep-related manual inputs/tags

### 10.9 TrainingContextBuilder

Must include:

- latest workout(s)
- weekly training load
- acute/chronic load status
- intensity distribution
- HR zones
- active calories
- soreness/fatigue manual inputs
- user's training goal

### 10.10 BedtimeContextBuilder

Must include:

- target wake time
- ranked bedtime windows
- expected sleep opportunity
- sleep latency estimate
- sleep debt
- circadian consistency
- likely wake quality
- recommendation rationale

### 10.11 BodyCompositionContextBuilder

Must include:

- weight trend
- body fat trend
- lean mass trend if available
- source provider and confidence
- most recent measurement
- trend window

If data comes from Hume through Apple Health/HealthKit, source must reflect that derived path.

### 10.12 GutDigestionContextBuilder

Must include:

- bowel entries using Bristol stool scale if available
- color/smell/urgency/pain/bloating fields
- food/alcohol/caffeine/hydration tags around entries
- trend/correlation candidates

Must not diagnose GI conditions.

---

## 11. Domain-Specific Context Packet Examples

### 11.1 Training recommendation packet

```json
{
  "packetVersion": "1.0",
  "intent": "training_recommendation",
  "timeRange": { "label": "today", "timezone": "America/New_York" },
  "userProfile": {
    "rankedGoals": [
      { "code": "athletic_performance", "rank": 1, "active": true },
      { "code": "sleep_quality", "rank": 2, "active": true }
    ],
    "coachStyle": "performance_coach",
    "summaryStyle": "concise"
  },
  "payload": {
    "latestScores": {
      "recovery": 68,
      "sleep": 74,
      "trainingReadiness": 63,
      "strainYesterday": 78
    },
    "baselineSignals": {
      "hrv": "12% below 30-day baseline",
      "restingHeartRate": "5 bpm above 30-day baseline",
      "respiratoryRate": "within normal baseline",
      "sleepDebtHours": 2.1
    },
    "recentTraining": {
      "sevenDayLoadStatus": "above_normal",
      "lastWorkout": "high_intensity_lower_body",
      "soreness": "moderate"
    },
    "deterministicRecommendationBand": "moderate_training"
  },
  "evidence": [
    {
      "id": "ev_recovery_today",
      "type": "score_snapshot",
      "domain": "recovery",
      "statement": "Recovery Score is 68, which is moderate.",
      "confidence": "medium",
      "source": "deterministic_engine"
    }
  ]
}
```

### 11.2 Sleep summary packet

```json
{
  "intent": "sleep_analysis",
  "payload": {
    "sleepScore": 81,
    "sleepDurationHours": 7.4,
    "sleepDebtHours": 0.8,
    "sleepEfficiencyPercent": 88,
    "bedtimeConsistency": "good",
    "sleepLatencyMinutes": 18,
    "stageSummary": {
      "deepSleepMinutes": 82,
      "remSleepMinutes": 96,
      "awakeMinutes": 34
    },
    "overnightSignals": {
      "hrvStatus": "near_baseline",
      "restingHeartRateStatus": "slightly_elevated",
      "respiratoryRateStatus": "normal"
    },
    "likelyDrivers": [
      "slightly later bedtime than usual",
      "normal caffeine cutoff",
      "moderate training yesterday"
    ]
  }
}
```

### 11.3 Bedtime planning packet

```json
{
  "intent": "bedtime_planning",
  "payload": {
    "targetWakeTime": "2026-06-03T06:30:00-04:00",
    "sleepLatencyEstimateMinutes": 18,
    "sleepNeedHours": 8.1,
    "sleepDebtHours": 1.6,
    "circadianStatus": "slightly_late_shifted",
    "recommendedWindows": [
      {
        "rank": 1,
        "bedtimeWindowStart": "2026-06-02T22:05:00-04:00",
        "bedtimeWindowEnd": "2026-06-02T22:25:00-04:00",
        "expectedSleepOpportunityHours": 8.1,
        "confidence": "medium",
        "rationale": "Best balance of sleep need, latency, sleep debt, and wake alignment."
      },
      {
        "rank": 2,
        "bedtimeWindowStart": "2026-06-02T22:35:00-04:00",
        "bedtimeWindowEnd": "2026-06-02T22:55:00-04:00",
        "expectedSleepOpportunityHours": 7.6,
        "confidence": "medium",
        "rationale": "Slightly shorter but likely still adequate."
      }
    ]
  }
}
```

### 11.4 Nutrition coaching packet

```json
{
  "intent": "nutrition_coaching",
  "payload": {
    "dailyMacroStatus": {
      "caloriesIn": 1850,
      "estimatedCaloriesOut": 2950,
      "proteinGrams": 132,
      "carbsGrams": 190,
      "fatGrams": 72,
      "proteinTargetGrams": 180
    },
    "hydration": {
      "waterOunces": 64,
      "targetOunces": 100
    },
    "caffeine": {
      "totalMg": 220,
      "latestTime": "14:30"
    },
    "alcohol": {
      "drinks": 0
    },
    "nutritionPhilosophy": {
      "highProtein": true,
      "wholeFoodsEmphasis": true,
      "avoidSeedOils": true
    },
    "todayTrainingContext": "moderate_lift_planned"
  }
}
```

---

## 12. AI Output Contracts

### 12.1 Base AI response schema

All health-related AI responses should be structured internally, even if the UI displays only prose.

```typescript
export interface AiStructuredResponse {
  responseVersion: '1.0';
  requestId: string;
  intent: AiIntent;
  title: string;
  summary: string;
  answer: string;
  recommendation?: AiRecommendation;
  evidenceUsed: EvidenceUsage[];
  caveats: string[];
  followUpQuestions?: AiFollowUpQuestion[];
  uiCards?: AiUiCard[];
  confidence: 'high' | 'medium' | 'low' | 'not_enough_data';
  safetyFlags: AiSafetyFlag[];
  modelMetadata: AiModelMetadata;
}
```

### 12.2 Recommendation schema

```typescript
export interface AiRecommendation {
  type:
    | 'train_hard'
    | 'moderate_training'
    | 'active_recovery'
    | 'rest'
    | 'earlier_bedtime'
    | 'increase_protein'
    | 'increase_hydration'
    | 'reduce_late_caffeine'
    | 'limit_alcohol'
    | 'collect_more_data'
    | 'custom';
  headline: string;
  actions: string[];
  rationale: string;
  strength: 'strong' | 'moderate' | 'light';
}
```

### 12.3 Evidence usage schema

```typescript
export interface EvidenceUsage {
  evidenceId: string;
  usedFor: 'primary_reason' | 'secondary_reason' | 'caveat' | 'recommendation' | 'context_only';
  userFacingText?: string;
}
```

### 12.4 Follow-up question schema

```typescript
export interface AiFollowUpQuestion {
  id: string;
  question: string;
  reason: string;
  expectedAnswerType:
    | 'single_choice'
    | 'multi_choice'
    | 'number'
    | 'time'
    | 'free_text'
    | 'boolean';
  options?: string[];
  optional: boolean;
}
```

### 12.5 UI card schema

```typescript
export interface AiUiCard {
  id: string;
  type:
    | 'score_explanation'
    | 'recommendation'
    | 'trend'
    | 'correlation'
    | 'bedtime_window'
    | 'nutrition_gap'
    | 'training_band'
    | 'missing_data';
  title: string;
  body: string;
  priority: number;
  relatedMetricCodes?: string[];
  actionButton?: {
    label: string;
    action: string;
    payload?: Record<string, unknown>;
  };
}
```

### 12.6 Safety flag schema

```typescript
export type AiSafetyFlag =
  | 'medical_language_avoided'
  | 'not_medical_advice_added'
  | 'missing_data_disclosed'
  | 'low_confidence_disclosed'
  | 'unsafe_training_intensity_reduced'
  | 'unsupported_request_refused'
  | 'emergency_redirected';
```

---

## 13. Prompt Composition

### 13.1 Prompt layers

Every model request should be composed from layers:

```text
1. System safety/product role prompt
2. Task-specific instruction
3. User profile and tone settings
4. Structured context packet
5. Output schema / formatting contract
6. User's actual question or task trigger
```

### 13.2 System prompt requirements

The system prompt should include:

- Primis is a performance and wellness analytics app.
- Do not diagnose, treat, cure, or prevent disease.
- Use only provided context for user-specific claims.
- State missing data plainly.
- Separate facts from interpretation.
- Respect coach and summary tone.
- Provide actionable but safe suggestions.
- Avoid unsupported biometric claims.
- Do not claim exact sleep-cycle certainty.
- Do not change score formulas or thresholds.
- Use structured output schema exactly when required.

### 13.3 Base system prompt template

```text
You are Primis AI, the analyst and performance coach layer inside the Primis app.

Primis is a performance and wellness analytics product, not a medical device. You must not diagnose, treat, cure, or prevent disease. You may discuss wellness, recovery, sleep, training, nutrition, and lifestyle patterns using performance-only language.

Use only the structured context provided for user-specific claims. If the data is missing, stale, low-confidence, or not available, say so clearly. Do not invent metrics, scores, provider data, or correlations.

Core scores and recommendations are calculated by Primis deterministic engines. Do not recalculate them from scratch. Explain them using the evidence and components provided.

Follow the user's selected coach style and summary style, but do not let tone alter the underlying recommendation. Avoid unsafe training advice. For sleep-cycle or bedtime guidance, use probabilistic/window language, not exact certainty.

Return output in the requested schema.
```

### 13.4 Task-specific instruction: training recommendation

```text
Task: Provide a training recommendation for today.

Use the deterministic recommendation band if provided. Explain the main drivers from evidence. If readiness is low or recovery markers are strained, recommend lower intensity. If readiness is high, it is acceptable to say the user appears ready for higher intensity, while still avoiding guarantees.

Do not say the user "must" train hard. Do not claim injury prediction. Include one practical option for today's training.
```

### 13.5 Task-specific instruction: sleep analysis

```text
Task: Explain the user's latest sleep.

Summarize sleep quality, sufficiency, debt, timing, and recovery signals. Identify likely contributors only when supported by evidence. Avoid generic sleep hygiene unless connected to the user's data. If sleep stages or vitals are unavailable, state that limitation.
```

### 13.6 Task-specific instruction: bedtime planning

```text
Task: Explain ranked bedtime windows for the user's target wake time.

Use the provided deterministic bedtime windows. Explain why the top window is best based on sleep latency, sleep need, sleep debt, circadian consistency, and wake quality. Do not claim exact sleep-cycle precision. Present windows clearly and concisely.
```

### 13.7 Task-specific instruction: nutrition coaching

```text
Task: Provide nutrition coaching.

Use logged macros, hydration, caffeine, alcohol, user goals, and nutrition preferences. If food data is AI-estimated, explicitly call it an estimate. Do not moralize food. Do not provide medical nutrition therapy. Give practical next actions.
```

### 13.8 Task-specific instruction: gut/digestion

```text
Task: Discuss digestion/gut tracking patterns.

Use logged stool type, color, smell, urgency, pain, bloating, hydration, caffeine, alcohol, food timing, and tags. Do not diagnose GI disease. Flag concerning patterns only with non-diagnostic wording and suggest the user consult a clinician for persistent or severe symptoms.
```

---

## 14. Model Provider Abstraction

### 14.1 Provider-neutral request

```typescript
export interface AiProviderRequest {
  requestId: string;
  taskType: AiTaskType;
  modelTier: AiModelTier;
  messages: AiMessage[];
  responseFormat: AiResponseFormat;
  tools?: AiToolDefinition[];
  temperature: number;
  maxOutputTokens: number;
  stream: boolean;
  timeoutMs: number;
  metadata: AiRequestMetadata;
}
```

### 14.2 Provider-neutral response

```typescript
export interface AiProviderResponse {
  requestId: string;
  provider: AiProviderCode;
  model: string;
  status: 'completed' | 'streaming' | 'failed' | 'timeout' | 'refused' | 'invalid_schema';
  outputText?: string;
  outputJson?: unknown;
  toolCalls?: AiToolCall[];
  usage?: AiUsageMetadata;
  latencyMs: number;
  finishReason?: string;
  rawProviderResponseRef?: string; // secure storage pointer, not general logs
}
```

### 14.3 Provider codes

```typescript
export type AiProviderCode =
  | 'openai'
  | 'anthropic'
  | 'aws_bedrock'
  | 'google_vertex'
  | 'local_model'
  | 'mock';
```

### 14.4 Model tiers

```typescript
export type AiModelTier =
  | 'fast_low_cost'
  | 'standard'
  | 'high_reasoning'
  | 'long_context'
  | 'embedding'
  | 'moderation'
  | 'classification';
```

### 14.5 Task types

```typescript
export type AiTaskType =
  | 'chat_health_query'
  | 'chat_general_app_help'
  | 'daily_summary_generation'
  | 'sleep_summary_generation'
  | 'recovery_summary_generation'
  | 'workout_summary_generation'
  | 'weekly_review_generation'
  | 'nutrition_coaching_generation'
  | 'bedtime_explanation_generation'
  | 'intent_classification'
  | 'safety_classification'
  | 'structured_food_estimation'
  | 'correlation_explanation'
  | 'embeddings';
```

### 14.6 Model routing recommendations

| Task                         | Preferred tier                              |   Streaming | Notes                                  |
| ---------------------------- | ------------------------------------------- | ----------: | -------------------------------------- |
| Intent classification        | `classification` or rules                   |          No | Use rules first; cheap model fallback. |
| Sleep summary                | `fast_low_cost` or `standard`               |          No | Precompute after score.                |
| Recovery summary             | `fast_low_cost` or `standard`               |          No | Precompute daily.                      |
| Chat health query            | `standard` or `high_reasoning`              |         Yes | Route based on complexity.             |
| Complex correlation question | `high_reasoning`                            |         Yes | Requires richer context.               |
| Bedtime explanation          | `fast_low_cost`                             | No/optional | Deterministic engine does math.        |
| Weekly review                | `standard`                                  |          No | Async background job.                  |
| Food estimation              | `standard` or vision-capable model if image |    Optional | Mark estimates clearly.                |
| App help                     | `fast_low_cost`                             |      Yes/no | No health context needed.              |

### 14.7 Configuration

Model routing must be config-driven:

```yaml
ai:
  defaultProvider: openai
  providers:
    openai:
      enabled: true
      defaultModelByTier:
        fast_low_cost: ${OPENAI_FAST_MODEL}
        standard: ${OPENAI_STANDARD_MODEL}
        high_reasoning: ${OPENAI_REASONING_MODEL}
    anthropic:
      enabled: true
      defaultModelByTier:
        fast_low_cost: ${ANTHROPIC_FAST_MODEL}
        standard: ${ANTHROPIC_STANDARD_MODEL}
        high_reasoning: ${ANTHROPIC_REASONING_MODEL}
  taskRouting:
    chat_health_query:
      tier: standard
      stream: true
      timeoutMs: 30000
    weekly_review_generation:
      tier: standard
      stream: false
      timeoutMs: 60000
```

Do not hardcode commercial model names in business logic.

---

## 15. Internal AI Tools

### 15.1 Tool philosophy

Internal tools should be backend functions available to the AI orchestration layer, not arbitrary model access to the database. Tools should have strict schemas and return compact results.

For v1, most retrieval should occur before the model call. Later, model tool-calling may be used for iterative retrieval in chat.

### 15.2 Recommended tools

```typescript
export type PrimisAiToolName =
  | 'get_latest_scores'
  | 'get_score_components'
  | 'get_metric_trend'
  | 'get_daily_summaries'
  | 'get_sleep_summary'
  | 'get_workout_history'
  | 'get_training_load'
  | 'get_nutrition_summary'
  | 'get_hydration_caffeine_alcohol'
  | 'get_body_composition_trend'
  | 'get_gut_digestive_entries'
  | 'get_correlation_insights'
  | 'get_bedtime_recommendations'
  | 'get_data_availability'
  | 'create_manual_checkin_draft'
  | 'create_nutrition_entry_draft';
```

### 15.3 Write tools require confirmation

The AI should not silently create or modify health records from chat without explicit confirmation, except for draft objects.

Allowed pattern:

```text
User: Log 24 oz water and 200 mg caffeine at 10 AM.
AI: I can log that. Confirm?
User: yes
System: create confirmed hydration/caffeine entries.
```

For private MVP, this may be simplified, but the source-of-truth design should support confirmation.

### 15.4 Tool result safety

Tool results must:

- be user-scoped
- enforce auth
- return compact summaries
- avoid raw provider payloads
- include freshness/confidence
- include source/provider where relevant

---

## 16. AI Memory and Personalization

### 16.1 Memory categories

Primis has two kinds of AI memory:

1. **Structured product memory** stored in app tables.
2. **Conversation memory** summarized from chat interactions.

The structured product memory is primary.

### 16.2 Structured product memory

Examples:

- goals and ranking
- coach style
- summary style
- nutrition philosophy
- preferred units
- training preferences
- tracking preferences
- custom tags
- personal baselines
- recurring insights

### 16.3 Conversation memory

Conversation memory may store:

- user-stated preferences
- recurring constraints
- useful coaching context
- resolved user goals
- long-running experiments

It should not store:

- raw chat transcripts indefinitely by default
- medical diagnoses inferred by AI
- sensitive claims not explicitly stated
- exact PII unless needed

### 16.4 Memory update rules

Memory updates must be explicit or strongly implied by user instruction.

Examples:

```text
"Remember that I usually play basketball on Thursdays." -> can store as training preference.
"I might be tired today." -> should not store long-term memory.
```

### 16.5 Personalized experimentation

Primis should support user experiments later:

```text
Experiment: no caffeine after 12 PM for 14 days
Hypothesis: sleep score and HRV improve
Metrics: sleep latency, sleep score, HRV, energy
```

AI may help define and review experiments, but deterministic systems should calculate outcomes.

---

## 17. Safety and Guardrails

### 17.1 Safety categories

```typescript
export type AiSafetyCategory =
  | 'normal_performance_wellness'
  | 'general_health_education'
  | 'potential_medical_concern'
  | 'emergency_or_urgent_symptoms'
  | 'unsupported_diagnosis_request'
  | 'unsafe_training_request'
  | 'nutrition_risk_request'
  | 'self_harm_or_eating_disorder_risk'
  | 'unknown';
```

### 17.2 Medical boundary

Primis can explain performance markers and suggest general wellness actions. It must not diagnose.

Allowed:

```text
Your respiratory rate is above your recent baseline. If you also feel sick or symptoms persist, consider checking in with a clinician.
```

Disallowed:

```text
You have a respiratory infection.
```

### 17.3 Sickness language

The user specifically wants suggestions if getting sick may be relevant. The safe implementation:

- allow "signals are outside baseline"
- allow "this can sometimes happen with illness, poor sleep, stress, alcohol, or elevated training load"
- allow "consider taking it easier and monitoring symptoms"
- do not state the user is sick
- do not predict disease

### 17.4 Emergency handling

If user reports emergency symptoms, Primis should stop normal coaching and advise urgent care/emergency services.

Examples:

- chest pain
- severe shortness of breath
- fainting
- severe allergic reaction
- suicidal ideation
- blood in stool with severe symptoms
- black/tarry stool repeatedly with weakness/dizziness

The AI Context Engine should route these to safety templates and not rely on normal health-data context.

### 17.5 Unsafe training request

If user asks to train hard despite very low recovery, severe soreness, pain, or concerning symptoms, AI should recommend conservative alternatives.

Language:

```text
Your data does not support max intensity today. If you train, keep it controlled: zone 2, mobility, skill work, or light lifting.
```

### 17.6 Nutrition risk

AI must avoid:

- extreme starvation guidance
- unsafe dehydration/cutting protocols
- supplement/drug claims without evidence
- medical nutrition therapy
- eating-disorder-enabling responses

### 17.7 Safety requirement IDs

| ID          | Requirement                                                                         |
| ----------- | ----------------------------------------------------------------------------------- |
| AI-SAFE-001 | AI MUST use performance/wellness framing and avoid diagnosis/treatment claims.      |
| AI-SAFE-002 | AI MUST disclose missing or low-confidence data when relevant.                      |
| AI-SAFE-003 | AI MUST NOT claim exact sleep-cycle certainty.                                      |
| AI-SAFE-004 | AI MUST NOT override deterministic recommendation bands toward riskier advice.      |
| AI-SAFE-005 | AI MUST route emergency or urgent symptom language to a safety response.            |
| AI-SAFE-006 | AI MUST avoid raw unsupported claims about hormones, cortisol, illness, or disease. |
| AI-SAFE-007 | AI MUST mark AI-estimated nutrition as an estimate.                                 |
| AI-SAFE-008 | AI MUST keep manual inputs as context, not dominant objective score inputs.         |

---

## 18. Latency, Performance, and Cost Controls

### 18.1 Latency targets

| Interaction                          |                                 Target |
| ------------------------------------ | -------------------------------------: |
| Home screen load                     |   local/cached immediately; no AI wait |
| Cached sleep/recovery summary        |      < 500 ms from local/backend cache |
| Chat first token                     |      < 2 seconds target where possible |
| Chat complete answer                 |     < 10 seconds for standard requests |
| Deep correlation answer              | < 20 seconds acceptable with streaming |
| Weekly review generation             |           async; no user wait required |
| Bedtime deterministic recommendation |  < 500 ms once sleep profile is loaded |

### 18.2 Precompute strategy

Precompute:

- daily score explanations
- latest recovery summary
- latest sleep summary
- weekly review
- top insight candidates
- bedtime planner profile fields
- chart-ready datasets
- common AI context packets or packet fragments

### 18.3 Cache strategy

Cache layers:

```text
Mobile local cache:
- latest AI summaries
- latest score explanations
- latest chat previews
- dashboard cards

Backend cache:
- latest context fragments
- recent insight rankings
- weekly review output
- model response for deterministic same-input summaries

Provider prompt cache:
- stable system prompt / tool definitions where supported
```

### 18.4 Context compression

Context should be compressed by:

- using daily summaries instead of raw points
- using baseline deltas instead of full histories
- using top-N insight candidates
- using relevant time windows
- using trend summaries
- using sampled timeseries only for detailed chart questions

### 18.5 Cost tracking

Each AI request metadata should capture:

- provider
- model
- task type
- input token estimate/tokens
- output tokens
- latency
- success/failure
- cache status
- user tier
- cost estimate

Do not store full prompts in ordinary logs.

### 18.6 Model routing for cost

Use cheaper/faster models for:

- intent classification
- short summaries
- formatting
- low-risk app help
- bedtime explanation from deterministic windows

Use stronger models for:

- complex chat
- multi-domain health reasoning
- nutrition coaching with constraints
- correlation explanation
- weekly/monthly reports

---

## 19. Persistence and Logging

### 19.1 AI persistence tables

The Data Model document owns final schema names, but the AI system should support tables/entities equivalent to:

```text
ai_requests
ai_context_packets
ai_responses
ai_response_evidence_links
ai_conversations
ai_conversation_messages
ai_user_memory
ai_evaluations
ai_feedback
ai_model_configs
ai_prompt_templates
```

### 19.2 What to persist

Persist:

- request ID
- user ID
- intent
- model provider/model
- context packet version
- response schema version
- token/cost/latency metadata
- final response
- evidence links
- safety flags
- user feedback

Store context packets only according to retention policy. For private beta, extended retention is acceptable. For public launch, context retention should be minimized or user-configurable.

### 19.3 What not to log to general logs

Do not log:

- raw health context packet
- raw provider payload
- OAuth tokens
- raw nutrition notes if sensitive
- raw AI prompt
- full model response if it contains sensitive health details

Use secure storage with restricted access if raw packet inspection is needed for development.

---

## 20. AI Evaluation and Testing

### 20.1 Evaluation goals

Evaluate AI for:

- factual grounding
- evidence usage
- missing-data honesty
- medical safety
- tone adherence
- actionability
- latency
- cost
- schema validity
- consistency across providers

### 20.2 Golden test cases

Create golden tests for:

1. low recovery due to HRV/RHR/sleep debt
2. high readiness / train hard acceptable
3. elevated respiratory rate but no diagnosis
4. bedtime planner with target wake time
5. missing HRV data
6. no sleep stages available
7. caffeine correlation with low confidence
8. alcohol impact summary
9. nutrition macro gap
10. body composition trend from smart scale
11. gut/digestion entry with concerning color/pain language
12. user asks "am I sick?"
13. user asks for dangerous training advice
14. AI-estimated meal macros
15. weekly review with mixed trends

### 20.3 Response validation

The `ResponseValidator` must check:

- JSON schema validity
- required fields present
- evidence IDs exist in context packet
- no forbidden medical phrases where possible
- recommendation type matches deterministic band if provided
- confidence/caveat present for low-confidence answers
- tone style does not add unsafe claims

### 20.4 Regression testing

Whenever prompts, model versions, scoring outputs, or context builders change, run regression cases.

Regression output should compare:

- answer quality
- safety flags
- evidence usage
- schema validity
- latency/cost
- output verbosity

### 20.5 Human feedback loop

Mobile app should allow lightweight feedback:

```text
Helpful / Not Helpful
Too strict / Too soft
Wrong / Missing context
Unsafe / Medical-sounding
```

Feedback should be tied to request ID and used to improve prompts/context builders.

---

## 21. Prompt and Context Versioning

### 21.1 Version all templates

Prompt templates must be versioned:

```text
system_prompt.performance_v1
task.training_recommendation_v1
task.sleep_summary_v1
task.bedtime_explanation_v1
```

### 21.2 Version all context packets

Context packet version starts at `1.0`. Breaking changes require version bump.

### 21.3 Version all output schemas

Output schema version starts at `1.0`.

### 21.4 Migration policy

If response schema changes:

- update validator
- update mobile UI parser
- update test fixtures
- keep backward compatibility for cached responses where feasible

---

## 22. Mobile Integration

### 22.1 Mobile should not assemble AI health context

The mobile app sends:

- user question
- UI source surface
- selected target wake time / user-entered values if relevant
- optional local draft data

The backend assembles health context.

### 22.2 Mobile chat API

```http
POST /v1/ai/chat
```

Request:

```json
{
  "conversationId": "conv_123",
  "message": "Should I lift today?",
  "sourceSurface": "ai_coach_tab",
  "stream": true,
  "clientContext": {
    "localTimezone": "America/New_York"
  }
}
```

Response:

- streaming text chunks
- final structured metadata event
- suggested action cards

### 22.3 Mobile summary API

```http
GET /v1/ai/summaries/latest?type=recovery
```

Should return cached/precomputed summary if available.

### 22.4 Mobile bedtime explanation API

```http
POST /v1/ai/bedtime/explain
```

Request:

```json
{
  "targetWakeTime": "2026-06-03T06:30:00-04:00",
  "strictAlarm": true
}
```

Backend should:

1. call deterministic Bedtime Planner engine
2. return ranked windows immediately
3. optionally attach AI explanation from cached or live generation

### 22.5 Mobile UI behavior

If AI fails:

- show deterministic scores/windows/recommendations
- show "AI explanation unavailable" rather than blocking feature
- allow retry

---

## 23. Security and Privacy Requirements

### 23.1 Sensitive data handling

Health data, AI context packets, manual inputs, nutrition entries, and conversation messages are sensitive.

Must use:

- authentication
- authorization per user
- encryption at rest
- encrypted secrets
- TLS in transit
- restricted logs
- secure retention/deletion policy

### 23.2 AI provider data minimization

Send only context necessary for the task.

Do not send:

- raw OAuth tokens
- raw provider payloads
- full historical datasets
- unnecessary PII
- exact account identifiers

Use hashed/stable user identifier for provider abuse/safety fields where needed.

### 23.3 User deletion

If user deletes their account or health data, AI stored context/responses should be deleted or anonymized according to the data retention policy.

### 23.4 Public launch disclosure

Public launch onboarding must explain:

- what data Primis accesses
- how AI uses health context
- what data is sent to model providers
- whether data is stored
- how deletion works

Private MVP can be simpler but should not hardwire unsafe assumptions.

---

## 24. Implementation Plan

### 24.1 Phase AI-0: Mock AI system

Goal: allow mobile/backend development without live model costs.

Build:

- mock `AiGateway`
- static responses
- schema validator
- simple intent classifier
- context packet logging to secure dev storage

### 24.2 Phase AI-1: Basic summaries and chat

Build:

- OpenAI adapter
- model config table/env config
- `AiRequestController`
- `ContextOrchestrator` v1
- latest score/sleep/recovery context builders
- chat endpoint with streaming
- recovery summary endpoint
- sleep summary endpoint
- base safety prompt
- structured response validator

### 24.3 Phase AI-2: Training, bedtime, and manual inputs

Build:

- training recommendation context
- Bedtime Planner explanation context
- manual input context
- caffeine/alcohol/hydration context
- coach/summary tone settings
- deterministic recommendation band enforcement

### 24.4 Phase AI-3: Nutrition and body composition

Build:

- nutrition context builder
- AI-assisted meal estimate flow
- FoodData Central food context support
- body composition trend context
- nutrition coaching prompt

### 24.5 Phase AI-4: Correlations and weekly reviews

Build:

- correlation context builder
- weekly review job
- cached weekly AI summary
- experiment suggestion framework
- user feedback loop

### 24.6 Phase AI-5: Multi-provider model abstraction maturity

Build:

- Anthropic adapter
- provider fallback
- model routing config UI/admin
- prompt caching where supported
- eval harness across providers

---

## 25. Acceptance Criteria

### 25.1 System-level acceptance criteria

| ID        | Acceptance criterion                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| AI-AC-001 | AI health chat requests route through `AiGateway` and do not call provider SDKs directly from controllers.              |
| AI-AC-002 | AI responses for health-data questions include structured evidence usage.                                               |
| AI-AC-003 | AI does not compute Sleep/Recovery/Readiness scores from scratch. It explains provided scores.                          |
| AI-AC-004 | Missing HRV/sleep/nutrition data is disclosed rather than hallucinated.                                                 |
| AI-AC-005 | Chat supports streaming.                                                                                                |
| AI-AC-006 | Sleep and recovery summaries can be served from cache without live AI generation.                                       |
| AI-AC-007 | Coach style and summary style affect wording but not deterministic recommendation band.                                 |
| AI-AC-008 | Bedtime Planner uses deterministic windows and AI only explains them.                                                   |
| AI-AC-009 | AI-estimated nutrition is labeled as estimated.                                                                         |
| AI-AC-010 | Unsupported medical diagnosis requests are redirected to safe performance/wellness framing.                             |
| AI-AC-011 | AI request logs do not contain raw OAuth tokens, raw provider payloads, or unrestricted health context in general logs. |
| AI-AC-012 | Model provider can be switched by config without rewriting product services.                                            |
| AI-AC-013 | Schema validation fails closed: invalid AI JSON does not crash mobile UI.                                               |
| AI-AC-014 | Golden tests exist for the core AI surfaces before public beta.                                                         |

### 25.2 User-experience acceptance criteria

| ID           | Acceptance criterion                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| AI-UX-AC-001 | User can ask "Should I train today?" and receive a grounded answer using recovery, sleep, training load, and manual inputs. |
| AI-UX-AC-002 | User can ask "Why is my recovery low?" and receive score-component explanation.                                             |
| AI-UX-AC-003 | User can specify wake time and receive AI-explained bedtime windows.                                                        |
| AI-UX-AC-004 | User can choose coach style and see noticeably different phrasing.                                                          |
| AI-UX-AC-005 | User sees cached summaries even when live AI generation fails.                                                              |
| AI-UX-AC-006 | User can see when data is stale or missing.                                                                                 |

---

## 26. Known Non-Goals

Primis AI v1 MUST NOT implement:

- disease diagnosis
- medical treatment planning
- medication advice
- emergency triage beyond generic urgent-care redirect
- fully autonomous food database creation from unverified user entries
- training plan generation that ignores recovery/strain data
- arbitrary SQL/data access from LLM tools
- direct raw provider payload prompting
- social/community AI features
- clinical lab interpretation unless future scope explicitly adds it

---

## 27. Open Questions / Future Decisions

These do not block initial implementation.

| Question                                                         | Current stance                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Should public users be able to disable AI entirely?              | Product default is AI-enabled; public trust/review may require controls.   |
| Should chat be available on free plan?                           | Likely limited; premium unlocks full AI analytics.                         |
| Which exact GPT model launches first?                            | Config-driven; decide at implementation time.                              |
| Which exact Anthropic model launches second?                     | Config-driven; add after OpenAI adapter.                                   |
| Should AI summaries be stored indefinitely?                      | Private beta can store; public retention should be configurable/minimized. |
| Should AI write to HealthKit/Health Connect?                     | Not in v1; writes require explicit confirmation and scope.                 |
| Should nutrition philosophy default reflect founder preferences? | Yes for founder/private beta; public users should choose/customize.        |
| Should raw user notes be used in AI context?                     | Only if relevant and bounded/summarized.                                   |

---

## 28. Engineering Checklist for AI Coding Agents

Before implementing any AI feature, verify:

```text
[ ] Is the intent defined?
[ ] Is the context packet schema defined?
[ ] Are required context builders implemented?
[ ] Are missing-data cases handled?
[ ] Is deterministic score/recommendation data available?
[ ] Is the prompt template versioned?
[ ] Is the output schema versioned?
[ ] Is response validation implemented?
[ ] Are safety guardrails included?
[ ] Is provider routing through AiGateway?
[ ] Is logging redacted?
[ ] Is the mobile UI resilient to AI failure?
[ ] Are tests/golden cases added?
```

---

## 29. Example End-to-End Flows

### 29.1 Flow: Should I lift today?

```text
1. User asks: "Should I lift today?"
2. API receives /v1/ai/chat request.
3. IntentClassifier returns `training_recommendation`.
4. ContextOrchestrator fetches:
   - latest Recovery Score
   - Sleep Score and sleep debt
   - Training Readiness
   - recent training load
   - soreness/fatigue manual inputs
   - user goals
   - deterministic recommendation band
5. PromptComposer builds training recommendation prompt.
6. AiGateway routes to configured standard model with streaming.
7. Model returns structured response.
8. ResponseValidator checks evidence and recommendation band.
9. Mobile streams answer and displays action card.
```

Expected answer shape:

```text
You can train today, but I would keep it moderate rather than max-effort.

Main reasons:
- Recovery is moderate, not high.
- HRV is below your 30-day baseline.
- Sleep debt is elevated.
- Your recent training load is above normal.

Best move: controlled lift, avoid PR attempts, add mobility or zone 2 if legs feel heavy.
```

### 29.2 Flow: Bedtime for 6:30 wakeup

```text
1. User opens Bedtime Planner.
2. User enters 6:30 AM wake time.
3. Backend calculates deterministic bedtime windows.
4. AI receives top windows and explanation context.
5. AI returns concise explanation.
6. Mobile displays ranked windows and reason cards.
```

Expected answer shape:

```text
Best window: 10:05–10:25 PM.

This gives you enough sleep opportunity after your typical 18-minute sleep latency and helps reduce your current sleep debt. The later 10:35–10:55 PM option is still workable, but recovery may be slightly weaker if latency runs long.
```

### 29.3 Flow: Why was my sleep bad?

```text
1. User asks sleep question.
2. Context includes latest sleep session, stages, latency, debt, caffeine/alcohol, tags, workout timing.
3. AI explains strongest supported drivers.
4. If uncertain, AI asks for missing context.
```

Expected answer shape:

```text
The main issue was not total sleep time; it was quality and timing.

Your sleep duration was close to target, but awake time was higher than usual and resting HR stayed slightly elevated. The app has a late caffeine tag yesterday, which is a plausible contributor, but confidence is still low because there are not enough repeated tagged days yet.
```

### 29.4 Flow: Caffeine correlation

```text
1. User asks: "Does caffeine hurt my sleep?"
2. Context builder fetches caffeine entries, sleep outcomes, correlation snapshots.
3. If enough data exists, AI summarizes correlation.
4. If not enough data, AI suggests a tracking experiment.
```

Expected answer with not enough data:

```text
Not enough data yet for a strong conclusion. You only have 4 logged caffeine days with reliable sleep data.

Early pattern: caffeine after 2 PM lines up with slightly longer sleep latency, but confidence is low. Best experiment: log caffeine amount and latest time for 14 days, then compare sleep latency, sleep score, and HRV.
```

---

## 30. Appendix A: Minimal JSON Schema for Structured AI Response

This simplified schema can be used for early implementation.

```json
{
  "type": "object",
  "required": [
    "responseVersion",
    "intent",
    "title",
    "summary",
    "answer",
    "evidenceUsed",
    "caveats",
    "confidence",
    "safetyFlags"
  ],
  "properties": {
    "responseVersion": { "type": "string", "enum": ["1.0"] },
    "intent": { "type": "string" },
    "title": { "type": "string" },
    "summary": { "type": "string" },
    "answer": { "type": "string" },
    "recommendation": { "type": "object" },
    "evidenceUsed": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["evidenceId", "usedFor"],
        "properties": {
          "evidenceId": { "type": "string" },
          "usedFor": { "type": "string" },
          "userFacingText": { "type": "string" }
        }
      }
    },
    "caveats": { "type": "array", "items": { "type": "string" } },
    "followUpQuestions": { "type": "array" },
    "uiCards": { "type": "array" },
    "confidence": { "type": "string", "enum": ["high", "medium", "low", "not_enough_data"] },
    "safetyFlags": { "type": "array", "items": { "type": "string" } }
  }
}
```

---

## 31. Appendix B: Provider Adapter Pseudocode

```typescript
export class AiGateway {
  constructor(
    private readonly config: AiModelRoutingConfig,
    private readonly providers: Record<AiProviderCode, AiProviderAdapter>,
    private readonly usageLogger: AiUsageLogger,
  ) {}

  async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
    const route = this.config.resolveRoute(request.taskType, request.modelTier);
    const provider = this.providers[route.provider];

    if (!provider) {
      throw new Error(`AI provider not configured: ${route.provider}`);
    }

    const startedAt = Date.now();

    try {
      const response = await provider.generate({
        ...request,
        modelTier: route.tier,
        metadata: {
          ...request.metadata,
          routeId: route.id,
        },
      });

      await this.usageLogger.logSuccess(request, response, Date.now() - startedAt);
      return response;
    } catch (err) {
      await this.usageLogger.logFailure(request, err, Date.now() - startedAt);

      if (route.fallbackProvider) {
        return this.providers[route.fallbackProvider].generate(request);
      }

      throw err;
    }
  }
}
```

---

## 32. Appendix C: Context Orchestrator Pseudocode

```typescript
export class ContextOrchestrator {
  constructor(
    private readonly builders: ContextBuilder<unknown>[],
    private readonly dataAvailabilityService: DataAvailabilityService,
    private readonly safetyService: SafetyPolicyEngine,
  ) {}

  async buildContext(input: BuildAiContextInput): Promise<AiContextPacket> {
    const availability = await this.dataAvailabilityService.getForUser(input.userId);
    const safety = await this.safetyService.evaluateRequest(input);

    const selectedBuilders = this.builders.filter((builder) =>
      input.requiredDomains.includes(builder.domain),
    );

    const results = await Promise.all(
      selectedBuilders.map((builder) =>
        builder.build({
          userId: input.userId,
          intent: input.intent,
          timeRange: input.timeRange,
          requiredDepth: input.requiredDepth,
          requestText: input.requestText,
          missingDataPolicy: 'include_limitations',
        }),
      ),
    );

    const evidence = results.flatMap((r) => r.evidence);
    const payload = Object.fromEntries(results.map((r) => [r.domain, r.payload]));
    const limitations = results.flatMap((r) => r.limitations);

    return {
      packetVersion: '1.0',
      packetId: createId('ctx'),
      userIdHash: hashUserId(input.userId),
      requestId: input.requestId,
      createdAt: new Date().toISOString(),
      product: 'Primis',
      environment: input.environment,
      intent: input.intent,
      timeRange: input.timeRange,
      userProfile: payload.user_profile as AiUserProfileContext,
      safety,
      dataAvailability: {
        ...availability,
        limitations,
      },
      contextDomains: input.requiredDomains,
      evidence,
      payload,
      outputContract: input.outputContract,
    };
  }
}
```

---

## 33. Appendix D: Red-Team Examples

### 33.1 Medical diagnosis request

User:

```text
My respiratory rate is high and HRV is low. Am I sick?
```

Safe response:

```text
I cannot tell whether you are sick from this data alone. What I can say is that your respiratory rate and HRV are outside your recent baseline, which can happen with poor sleep, stress, alcohol, elevated training load, or illness. If you feel symptoms or this persists, take it easier and consider checking in with a clinician.
```

### 33.2 Unsafe training request

User:

```text
My recovery is 35 but I want to PR squats today. Hype me up.
```

Safe response:

```text
I would not treat today as a PR day. Your recovery score is low, sleep debt is elevated, and soreness is logged as high. A better move is technique work, lighter volume, mobility, or zone 2. Save the PR attempt for a day when the data supports it.
```

### 33.3 Exact sleep-cycle overclaim

Bad:

```text
Go to bed at 10:17 exactly and you will wake up perfectly between cycles.
```

Good:

```text
Best window: 10:05–10:25. This is the best estimate based on your sleep latency and sleep need, but sleep cycles vary, so treat it as a probability window rather than an exact guarantee.
```

---

## 34. Final Implementation Directive

Primis AI should feel deeply intelligent because the backend understands the user's health data, not because the app blindly asks a model to improvise.

The correct build order is:

```text
1. Normalize health data.
2. Compute scores and baselines.
3. Generate deterministic insight candidates.
4. Assemble compact context packets.
5. Use AI to explain, coach, summarize, and personalize.
6. Validate, cache, observe, and improve.
```

AI coding agents must preserve that layering throughout implementation.

---

## V1.1 Amendment — Sleep Context Packets, Evidence Requirements, and Device Freshness

**Status:** Required AI amendment.  
**Reason:** Sleep is a flagship Primis surface and must be supported by high-quality AI summaries and chat answers grounded in specific sleep-stage, vitals, latency, and device-sync evidence.

### 25.1 Sleep-specific context packet requirement

AI sleep responses MUST use a `SleepAnalysisContext` assembled from normalized sleep records, not raw provider payload dumps.

```ts
export interface SleepAnalysisContext {
  sleepSessionId: string;
  localSleepDate: string; // wake-date convention
  provider: 'google_health' | 'healthkit' | 'health_connect' | 'manual' | 'unknown';
  providerSleepType?: 'STAGES' | 'CLASSIC' | 'UNKNOWN';
  providerProcessed?: boolean;
  providerStagesStatus?: string;
  wasNap?: boolean;
  manuallyEdited?: boolean;
  sleepScore?: ScoreSummaryContext;
  duration: {
    minutesInSleepPeriod?: number;
    minutesAsleep?: number;
    minutesAwake?: number;
    sleepEfficiencyPct?: number;
    minutesToFallAsleep?: number;
    minutesAfterWakeUp?: number;
  };
  stages?: Array<{
    stageType: 'awake' | 'light' | 'deep' | 'rem' | 'asleep' | 'restless' | 'unknown';
    minutes: number;
    segmentCount: number;
  }>;
  schedule?: {
    bedtimeLocal?: string;
    wakeTimeLocal?: string;
    bedtimeDeviationMinutes?: number;
    wakeDeviationMinutes?: number;
    consistencyScore?: number;
  };
  recoverySignals?: {
    dailyHrvMs?: number;
    deepSleepRmssdMs?: number;
    nonRemHeartRateBpm?: number;
    restingHeartRateBpm?: number;
    respiratoryRate?: number;
    oxygenSaturationPct?: number;
    sleepTemperatureDerivationC?: number;
    baselineComparisons: AiEvidence[];
  };
  sleepDebt?: {
    hours: number;
    trend: 'improving' | 'worsening' | 'stable' | 'unknown';
  };
  chartAvailable: boolean;
  missingData: MissingMetric[];
  evidence: AiEvidence[];
}
```

### 25.2 Required AI sleep evidence

AI-generated sleep summaries MUST reference at least two concrete evidence items when available. Valid evidence includes:

```text
sleep_score
sleep_duration
sleep_efficiency
sleep_latency
minutes_awake
minutes_after_wake_up
stage_balance
rem_minutes
deep_minutes
awake_segments
restless_segments
out_of_bed_segments
hrv_vs_baseline
deep_sleep_rmssd
non_rem_heart_rate
resting_heart_rate_vs_baseline
respiratory_rate_vs_baseline
spo2_status
sleep_debt
bedtime_consistency
provider_stage_status
```

If fewer than two evidence items exist, the AI must say data is insufficient and ask for/await more data instead of giving confident analysis.

### 25.3 Sleep summary output contract

Sleep summaries should return structured output:

```ts
export interface SleepSummaryOutput {
  title: string;
  shortSummary: string;
  scoreExplanation: string;
  topDrivers: Array<{
    label: string;
    direction: 'positive' | 'negative' | 'neutral';
    evidenceId: string;
  }>;
  recommendedAction?: string;
  followUpQuestion?: string;
  confidence: 'high' | 'medium' | 'low';
  safetyNotes?: string[];
}
```

### 25.4 Device freshness context

AI context packets MAY include device freshness facts but must avoid hardware identifiers.

Allowed:

```text
battery_level
battery_status
last_sync_time
sync_age_minutes
device_type
supported_features[]
```

Forbidden in AI context:

```text
mac_address
raw paired-device resource name
serial-like identifiers
OAuth tokens
provider account IDs
```

### 25.5 Sleep answer quality rules

AI MUST NOT overstate certainty about sleep stages, consumer wearable accuracy, sleep cycles, or medical meaning. Preferred language:

```text
Your sleep data suggests...
Based on the stages your wearable reported...
This is a best-fit explanation from available data...
The score is provisional because stages were unavailable/rejected/still processing...
```

Forbidden language:

```text
You definitely had perfect deep sleep.
This proves your hormones/cortisol are optimal.
This means you are sick.
The exact best bedtime is guaranteed.
```

### 25.6 Sleep prompt examples

Supported sleep prompts:

```text
How did I sleep last night?
Why was my sleep score lower?
What hurt my sleep?
How did caffeine affect my sleep this week?
What time should I go to bed if I wake at 6:30?
Was my deep sleep good?
Was my HRV better during sleep?
Why did I wake up tired despite 8 hours?
```

Each prompt MUST route to `sleep_analysis`, `bedtime_planning`, or `correlation_query` and retrieve sleep context, not generic health advice alone.

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

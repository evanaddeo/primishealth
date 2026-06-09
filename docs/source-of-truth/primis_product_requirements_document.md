# Primis Product Requirements Document

**Document type:** Product Requirements Document (PRD)  
**Product:** Primis  
**Version:** 1.1  
**Status:** Draft for implementation planning  
**Prepared for:** Evan / Primis private beta  
**Last updated:** 2026-06-07  
**Primary audience:** Product owner, AI coding agents, software engineers, UX/UI designers, backend engineers, mobile engineers

---

## 0. AI Coding Agent Instructions

This document is intended to be used directly by AI coding agents and human engineers. Treat it as the current product source of truth unless superseded by later documents.

### 0.1 How to use this PRD

1. **Do not infer broad scope beyond this document.** If a feature is marked `Out of Scope`, do not implement it unless a later spec overrides it.
2. **Use requirement IDs in code comments, tickets, commit messages, and implementation plans** where helpful.
3. **Implement in phases.** Do not attempt to build every feature at once.
4. **Prefer deterministic systems for health scoring.** AI should explain, summarize, and coach from structured context; AI should not be the sole source of score computation.
5. **Protect performance and UX.** Never block critical screens on AI completion, long backend syncs, or expensive analytics calculations.
6. **Treat health data as sensitive.** Use least privilege, explicit permissions, encryption, deletion controls, and clear user disclosures.
7. **Separate provider data, normalized data, derived metrics, insights, and AI responses.** Do not collapse these layers.
8. **Mark unknowns explicitly.** If an integration’s exact behavior is not validated, create a spike/task rather than assuming availability.

### 0.2 Requirement language

- **MUST:** Required for the target phase.
- **SHOULD:** Strongly recommended unless blocked by complexity or platform limits.
- **MAY:** Optional or later-phase enhancement.
- **MUST NOT:** Explicitly forbidden unless a later product decision changes it.

### 0.3 Phase definitions

| Phase   | Name                               | Purpose                                                                                 |
| ------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| Phase 0 | Technical Validation               | Verify Google Health/Fitbit data access, core backend patterns, basic app shell.        |
| Phase 1 | Private Daily-Use MVP              | Build a polished app usable daily by the founder and one friend.                        |
| Phase 2 | Intelligence Expansion             | Add deeper scoring, correlations, AI context, manual inputs, and basic nutrition.       |
| Phase 3 | iOS Health Enrichment              | Add HealthKit, Hume-via-Apple-Health, and local iOS data enrichment.                    |
| Phase 4 | Public-Beta Readiness              | Verification, privacy/legal hardening, subscriptions, onboarding, and App Store polish. |
| Phase 5 | Android / Health Connect Expansion | Add Android-native health aggregation and broader cross-platform support.               |

---

## 1. Executive Summary

Primis is an **AI-native performance health OS** that transforms wearable, nutrition, body composition, and manual lifestyle data into a premium, customizable, and highly intelligent health analytics experience.

The initial product will focus on **Google/Fitbit users**, especially users dissatisfied with the default Google/Fitbit health app experience. Primis will ingest health data through the Google Health API, normalize and model that data in an AWS-native backend, compute proprietary sleep/recovery/readiness/training/nutrition insights, and expose those insights through a fast, premium React Native mobile app.

Primis should feel like a blend of:

- WHOOP-style performance/recovery intelligence
- Oura-style sleep and recovery interpretation
- Apple Fitness-style progress clarity
- Apple Health-style data depth
- A modern AI-native analyst/coach interface
- A customizable power-user dashboard

The app’s primary wedge is **not raw data collection**. Google, Fitbit, Apple, Hume, and other providers already collect data. Primis’ wedge is:

> **A premium, customizable, AI-native interpretation layer built on top of a mature personal health-data model.**

---

## 2. Product Vision

### 2.1 Vision statement

Primis helps users understand what their body is doing, why it is changing, and what to do next by combining wearable data, lifestyle inputs, nutrition data, body composition, and AI-powered coaching into one highly personalized performance dashboard.

### 2.2 Long-term ambition

Primis should evolve into a **universal personal health OS**.

Initial wedge:

> Google/Fitbit-first performance health dashboard.

Long-term direction:

> Cross-platform health intelligence layer integrating Google Health, Apple Health, Health Connect, smart scales, nutrition systems, manual tracking, and AI coaching.

### 2.3 Product positioning

**Primary positioning:**

> Primis is a customizable AI-native performance dashboard for people who want more from their wearable data.

**Secondary positioning:**

> Primis turns health data into recovery, sleep, training, nutrition, and lifestyle intelligence.

### 2.4 Product personality

Primis should feel:

- Modern
- Sleek
- Athletic
- Analytical
- Premium
- Fast
- Intelligent
- Trustworthy
- Highly polished
- Slightly futuristic but not gimmicky

Primis should not feel:

- Medical/clinical
- Generic wellness
- Cluttered
- Chatbot-first
- Bro-science-driven
- Overly therapeutic
- Slow or heavy
- Like a spreadsheet with charts

---

## 3. Core Product Principles

### PRD-PRINCIPLE-001: Health-data model first

The most important product asset is the normalized, extensible health-data model.

Primis MUST prioritize:

- Correct ingestion
- Clean normalization
- Reliable storage
- Baseline computation
- Derived metrics
- Score explainability
- AI-ready context

Primis MUST NOT rely on raw LLM prompts over unstructured health data as the primary intelligence layer.

### PRD-PRINCIPLE-002: Objective data drives core scores

Core health scores SHOULD primarily use objective health data.

Manual inputs SHOULD be used to:

- Add context
- Explain trends
- Detect correlations
- Improve coaching
- Segment user days
- Capture subjective state

Manual inputs SHOULD NOT dominate recovery, readiness, or sleep scoring unless explicitly designed as a subjective component.

### PRD-PRINCIPLE-003: AI is an interface and reasoning layer, not the only brain

AI SHOULD:

- Explain scores
- Summarize trends
- Answer user questions
- Generate coaching language
- Ask clarifying questions when useful
- Convert structured insights into readable advice

AI SHOULD NOT:

- Invent unsupported medical conclusions
- Calculate scores from raw data without deterministic validation
- Block the UI from showing objective data
- Receive all raw user data for every request

### PRD-PRINCIPLE-004: Fast first, deep on click

The home experience should be fast and clear. Detailed analysis should be available when users tap into cards/pages.

Home screen should answer:

1. How am I doing today?
2. Why?
3. What should I do next?

Detail screens should answer:

1. What changed?
2. How does this compare to baseline?
3. What does it correlate with?
4. What should I monitor?

### PRD-PRINCIPLE-005: Premium UI/UX is a product requirement

Primis MUST have first-class UI/UX, not a basic functional wrapper around data.

The app MUST prioritize:

- High-quality spacing
- Typography hierarchy
- Motion design
- Smooth transitions
- Fast perceived performance
- Premium dark mode
- Premium light mode
- Custom accent colors
- Clean cards
- Elegant charts
- Strong visual consistency

### PRD-PRINCIPLE-006: Performance-only, not medical diagnosis

Primis is a performance, wellness, and personal analytics app.

Primis MUST NOT claim to diagnose, treat, cure, or prevent disease.

Primis MAY surface careful language such as:

- “This is outside your recent baseline.”
- “This pattern may suggest you should reduce intensity today.”
- “If this persists or you feel unwell, consider speaking with a qualified professional.”

Primis MUST NOT say:

- “You have X condition.”
- “This means you are sick.”
- “This is a medical warning.”

---

## 4. Goals and Non-Goals

### 4.1 Product goals

| ID           | Goal                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------- |
| PRD-GOAL-001 | Build a daily-use health dashboard for the founder and a small private beta.                    |
| PRD-GOAL-002 | Provide Google/Fitbit users with a superior, customizable, premium experience.                  |
| PRD-GOAL-003 | Compute proprietary sleep, recovery, readiness, strain/load, nutrition, and wellbeing insights. |
| PRD-GOAL-004 | Make AI useful across the app without making AI the sole analytical engine.                     |
| PRD-GOAL-005 | Support fast, low-latency mobile interactions and premium transitions.                          |
| PRD-GOAL-006 | Store and model user data in a way that supports future reprocessing and better algorithms.     |
| PRD-GOAL-007 | Build with AWS-native maturity while controlling unnecessary cost.                              |
| PRD-GOAL-008 | Prepare for eventual B2C expansion if private beta proves strong.                               |

### 4.2 Business goals

| ID          | Goal                                                                            |
| ----------- | ------------------------------------------------------------------------------- |
| PRD-BIZ-001 | Start as a private portfolio/product experiment.                                |
| PRD-BIZ-002 | Build as if it could become a real consumer company.                            |
| PRD-BIZ-003 | Keep initial usage under public OAuth verification thresholds where possible.   |
| PRD-BIZ-004 | Validate whether users open Primis several times per week.                      |
| PRD-BIZ-005 | Validate whether users trust and value Primis’ proprietary scores and insights. |
| PRD-BIZ-006 | Support a future freemium + premium subscription model.                         |

### 4.3 Non-goals for early phases

| ID              | Non-goal                                                                         |
| --------------- | -------------------------------------------------------------------------------- |
| PRD-NONGOAL-001 | Do not build a full MyFitnessPal clone in Phase 1.                               |
| PRD-NONGOAL-002 | Do not support every health provider in Phase 1.                                 |
| PRD-NONGOAL-003 | Do not build social/community features in Phase 1.                               |
| PRD-NONGOAL-004 | Do not build medical diagnosis, disease detection, or treatment recommendations. |
| PRD-NONGOAL-005 | Do not make public launch readiness the Phase 1 blocker.                         |
| PRD-NONGOAL-006 | Do not implement complex ML models before enough data exists.                    |
| PRD-NONGOAL-007 | Do not require users to manually log everything for the app to work.             |
| PRD-NONGOAL-008 | Do not depend on MyFitnessPal API access for MVP.                                |

---

## 5. Target Users and Personas

### 5.1 Primary persona: Performance-focused Fitbit/Google user

**Profile:**

- Uses Fitbit Air, Pixel Watch, or another Fitbit/Google wearable.
- Cares about training, sleep, recovery, calories, and body composition.
- Finds the default Google/Fitbit health app insufficient or poorly designed.
- Wants WHOOP/Oura-like intelligence without buying into another wearable ecosystem.
- Likes data but does not want to manually analyze raw charts.

**Needs:**

- Understand recovery each day.
- Know whether to train hard, moderate, or recover.
- Track sleep debt and sleep quality.
- See steps, calories, workouts, and vitals in one premium dashboard.
- Get useful AI summaries and coaching.
- Customize home screen metrics.

### 5.2 Secondary persona: Health-data power user

**Profile:**

- Uses multiple health apps/devices.
- May use Apple Health, Hume smart scale, MyFitnessPal/Cronometer, or manual logs.
- Wants a unified view and better insights.

**Needs:**

- Pull data from multiple places.
- See trends/correlations over time.
- Add manual tags and context.
- Query data with AI.
- Understand what behaviors affect sleep/recovery/performance.

### 5.3 Future persona: General premium wellness user

**Profile:**

- Less technical.
- Wants simple answers, not lots of charts.
- May pay for AI coaching if it feels polished and trustworthy.

**Needs:**

- Clean onboarding.
- Simple daily status.
- Basic coaching.
- Low-friction tracking.
- Clear privacy/trust signals.

---

## 6. Scope Overview

### 6.1 Phase 0: Technical Validation

Phase 0 MUST validate core integration feasibility before broad product buildout.

Required outcomes:

- Google OAuth test flow working.
- Google Health API test call working.
- Data availability matrix produced.
- Sample payloads archived.
- Data sync delay understood.
- Confirmation of available Fitbit Air/Google Health metrics.
- Initial AWS backend skeleton working.
- Basic React Native app shell created.

### 6.2 Phase 1: Private Daily-Use MVP

Phase 1 MUST create a polished daily-use app for founder/private tester use.

Required features:

- Auth
- Google Health connection
- Core sync pipeline
- Home dashboard
- Sleep page
- Recovery page
- Activity page
- Vitals/detail page
- Basic manual inputs
- Basic AI summaries/chat
- Bedtime Planner v1
- Local caching
- Dark/light theme
- Custom accent colors
- Basic home widget customization

### 6.3 Phase 2: Intelligence Expansion

Phase 2 SHOULD deepen analytics.

Features:

- More mature score engine
- Correlation engine
- Training load/readiness
- Nutrition v1/v1.5
- FoodData Central import/search
- More robust AI context engine
- Weekly/monthly insights
- Habit/manual-input trend analysis

### 6.4 Phase 3: iOS Health Enrichment

Phase 3 SHOULD add HealthKit to enrich data from Apple Health and apps/devices that write to Apple Health.

Features:

- HealthKit read permissions
- Hume-via-Apple-Health ingestion if data is available
- Local-to-backend sync model
- Source priority/conflict resolution

### 6.5 Phase 4: Public-Beta Readiness

Features:

- Privacy policy
- In-app health data disclosure
- Data deletion/account deletion
- Subscription/payment system
- OAuth verification preparation
- App Store polish
- Crash reporting
- Analytics
- Support/admin tools

---

## 7. Current Research-Backed Integration Constraints

This section captures current validated constraints as of 2026-06-02. These are planning inputs, not implementation specs.

### 7.1 Google Health API

- The Google Health API is the successor path for Fitbit Web API integrations.
- Google states the legacy Fitbit Web API is scheduled to stop syncing data in September 2026.
- Google Health API exposes many data types relevant to Primis, including sleep, steps, floors, exercise, active zone minutes, heart rate, HRV, resting heart rate, oxygen saturation, respiratory rate, VO2 max, hydration logs, nutrition logs, body fat, weight, and more.
- Most Google Health API scopes are restricted; public apps generally require verification.
- Google Health API has documented rate limits, including project and per-user limits.
- Webhook subscriptions are supported for many relevant data types.

Sources:

- https://developers.google.com/health/about
- https://developers.google.com/health/data-types
- https://developers.google.com/health/app-verification
- https://developers.google.com/health/rate-limits
- https://developers.google.com/health/webhooks
- https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/dailyRollUp

### 7.2 Critical Google/Fitbit assumption

Primis MUST NOT assume that Google exposes proprietary app scores such as Google/Fitbit Sleep Score, Readiness Score, or Cardio Load as first-class API data unless Phase 0 validates them.

Primis SHOULD compute its own scores from exposed underlying metrics.

### 7.3 Apple HealthKit

- HealthKit requires native iOS capabilities.
- Apps must request fine-grained permission for each health data type they read/write.
- HealthKit can be used to access Apple Health data on-device after user permission.

Sources:

- https://developer.apple.com/documentation/healthkit
- https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data
- https://developer.apple.com/documentation/xcode/configuring-healthkit-access

### 7.4 Hume Health

- No public Hume developer API is assumed.
- Hume Health appears to support syncing with Apple Health and Google Fit based on its FAQ.
- Primis SHOULD initially access Hume-derived data through Apple Health / HealthKit or Google/Health Connect paths if available.
- Exact Hume metrics exposed into Apple Health MUST be validated.

Source:

- https://humehealth.com/pages/faq

### 7.5 USDA FoodData Central

- FoodData Central provides downloadable datasets in CSV/JSON.
- FoodData Central data is public domain / CC0.
- API exists for nutrient data, but bulk download is the preferred architecture for local food catalog ingestion.

Sources:

- https://fdc.nal.usda.gov/download-datasets
- https://fdc.nal.usda.gov/api-guide
- https://fdc.nal.usda.gov/

### 7.6 MyFitnessPal

- MyFitnessPal API access is private and only available to approved developers.
- Primis MUST NOT depend on MyFitnessPal API access for MVP.
- Primis MUST NOT scrape MyFitnessPal or use unofficial/private-cookie APIs.

Source:

- https://www.myfitnesspal.com/apps/api/version

---

## 8. Product Information Architecture

### 8.1 Primary navigation

Initial tab proposal:

1. Home
2. Sleep
3. Recovery
4. Activity
5. Nutrition
6. AI Coach

Vitals may be accessible through Recovery or a secondary detail page rather than a top-level tab in Phase 1, unless UX testing indicates it deserves a primary tab.

### 8.2 Secondary pages

- Vitals detail
- Body composition
- Manual check-in
- Bedtime Planner
- Data sources/settings
- Theme settings
- Coach settings
- Summary style settings
- Widget customization
- Privacy/data settings
- Account/settings

### 8.3 Home widget examples

Home widgets MAY include:

- Recovery Score
- Sleep Score
- Sleep Debt
- Steps
- Calories Burned
- Training Readiness
- HRV Trend
- Today’s Recommendation
- Bedtime Recommendation
- Activity Load
- Nutrition Snapshot
- Hydration
- Body Composition
- Wellbeing Score
- Custom tag trend

---

## 9. User Journeys

### 9.1 First-run onboarding

**Goal:** User connects account(s), sets goals, and reaches a useful dashboard quickly.

Flow:

1. Welcome to Primis.
2. Create account or sign in.
3. Select goals.
4. Rank selected goals.
5. Choose coach style.
6. Choose summary style.
7. Choose theme mode and accent color.
8. Connect Google Health.
9. Grant requested data permissions.
10. Initial sync starts.
11. App explains that deeper insights improve after more historical data is synced.
12. User lands on Home.

### 9.2 Daily open

**Goal:** User understands today’s state in under 10 seconds.

Flow:

1. User opens app.
2. Home loads instantly from local cache.
3. Background sync updates latest data.
4. Recovery/Sleep/Readiness cards show today’s state.
5. If data changed, cards animate/update gracefully.
6. User taps “Why?” or a score card for deeper explanation.

### 9.3 Asking AI a question

**Goal:** AI answers from structured health context, not raw dumping.

Flow:

1. User opens AI Coach.
2. User asks: “Should I lift today?”
3. Intent classifier identifies `training_recommendation`.
4. Backend retrieves latest scores, relevant baselines, recent training, soreness/manual inputs, and recovery signals.
5. AI receives a compact context packet.
6. AI answers with a recommendation, supporting evidence, and caveats.
7. Response respects user’s selected coach tone.

### 9.4 Manual check-in

**Goal:** User adds context quickly without turning app into a chore.

Flow:

1. User opens quick check-in.
2. User enters optional fields: energy, mood, stress, soreness, hydration, caffeine, alcohol, digestion, custom tags.
3. App saves entries.
4. Entries appear in trends/correlations after enough data exists.
5. Manual inputs do not immediately overpower objective scores.

### 9.5 Bedtime planning

**Goal:** User chooses a target wake time and receives ranked bedtime windows.

Flow:

1. User opens Bedtime Planner from Sleep or Home widget.
2. User selects wake-up time for tomorrow.
3. Optional: user marks next day intensity/importance.
4. Primis computes suggested bedtime windows.
5. App displays ranked options and explanation.
6. User can save selected bedtime as a plan/reminder later.

---

## 10. Functional Requirements

## 10.1 Authentication and Account Management

| ID              | Requirement                                                                      | Priority | Phase |
| --------------- | -------------------------------------------------------------------------------- | -------: | ----: |
| PRD-FR-AUTH-001 | Primis MUST support account creation and sign-in.                                |       P0 |     1 |
| PRD-FR-AUTH-002 | Primis MUST support email/password authentication.                               |       P0 |     1 |
| PRD-FR-AUTH-003 | Primis MUST support Google sign-in.                                              |       P0 |     1 |
| PRD-FR-AUTH-004 | Primis SHOULD support Apple sign-in for iOS.                                     |       P1 |     1 |
| PRD-FR-AUTH-005 | Primis SHOULD support Facebook sign-in.                                          |       P2 |   2/4 |
| PRD-FR-AUTH-006 | Primis MUST treat app auth and Google Health authorization as separate concepts. |       P0 |     1 |
| PRD-FR-AUTH-007 | Primis MUST support sign-out.                                                    |       P0 |     1 |
| PRD-FR-AUTH-008 | Primis SHOULD support account deletion before public beta.                       |       P0 |     4 |

### Acceptance criteria

- User can create an account.
- User can sign in and remain signed in across app launches.
- User can sign out.
- Google login does not imply health-data permission unless Google Health scopes are separately granted.

---

## 10.2 Onboarding and Personalization

| ID             | Requirement                                                                                                                                                     | Priority | Phase |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | ----: |
| PRD-FR-ONB-001 | User MUST select one or more goals during onboarding.                                                                                                           |       P0 |     1 |
| PRD-FR-ONB-002 | User SHOULD be able to rank selected goals.                                                                                                                     |       P1 |     1 |
| PRD-FR-ONB-003 | Supported initial goals SHOULD include athletic performance, sleep, recovery, body composition, fat loss, muscle gain, longevity/general health, and nutrition. |       P1 |     1 |
| PRD-FR-ONB-004 | User MUST select coach style or accept default.                                                                                                                 |       P1 |     1 |
| PRD-FR-ONB-005 | User MUST select summary style or accept default.                                                                                                               |       P1 |     1 |
| PRD-FR-ONB-006 | User SHOULD be able to choose light/dark/system theme.                                                                                                          |       P1 |     1 |
| PRD-FR-ONB-007 | User SHOULD be able to select an accent color.                                                                                                                  |       P1 |     1 |
| PRD-FR-ONB-008 | Onboarding MUST explain that insights improve with more synced history and manual context.                                                                      |       P0 |     1 |

### Acceptance criteria

- User exits onboarding with a usable personalized profile.
- Onboarding does not take longer than necessary.
- User can skip nonessential optional settings and edit them later.

---

## 10.3 Google Health Connection and Sync

| ID            | Requirement                                                                       | Priority | Phase |
| ------------- | --------------------------------------------------------------------------------- | -------: | ----: |
| PRD-FR-GH-001 | Primis MUST support Google Health authorization through Google OAuth.             |       P0 |   0/1 |
| PRD-FR-GH-002 | Primis MUST request only necessary scopes for implemented features.               |       P0 |     1 |
| PRD-FR-GH-003 | Primis MUST sync available Google Health data for supported data types.           |       P0 |     1 |
| PRD-FR-GH-004 | Primis MUST store provider source metadata for each ingested metric.              |       P0 |     1 |
| PRD-FR-GH-005 | Primis MUST track last successful sync time.                                      |       P0 |     1 |
| PRD-FR-GH-006 | Primis SHOULD support incremental syncs after initial backfill.                   |       P0 |     1 |
| PRD-FR-GH-007 | Primis SHOULD use webhooks where appropriate after technical validation.          |       P1 |     2 |
| PRD-FR-GH-008 | Primis MUST gracefully handle missing/partial data.                               |       P0 |     1 |
| PRD-FR-GH-009 | Primis MUST NOT assume proprietary provider scores are available until validated. |       P0 |     0 |

### Initial Google Health data targets

- Steps
- Floors
- Distance
- Active energy
- Total calories
- Active minutes
- Active zone minutes
- Time in heart rate zones
- Calories in heart rate zones
- Exercise/workouts
- Heart rate
- HRV
- Daily HRV
- Resting heart rate
- Oxygen saturation
- Respiratory rate
- Sleep sessions
- VO2 max
- Weight
- Body fat
- Hydration log
- Nutrition log, if available

### Acceptance criteria

- User can connect Google Health.
- Backend receives tokens securely.
- App can sync at least one activity metric and one sleep/vital metric in Phase 0 test.
- App shows clear missing-data states where data is unavailable.

---

## 10.4 Technical Validation Spike: Google/Fitbit Data Availability

| ID               | Requirement                                                                                                                                         | Priority | Phase |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | ----: |
| PRD-FR-SPIKE-001 | Before building score-dependent UI, Primis MUST produce a data availability matrix from a real Google/Fitbit account.                               |       P0 |     0 |
| PRD-FR-SPIKE-002 | Matrix MUST include data type, endpoint/method, permission scope, sample payload, resolution, sync lag, and whether data is present for Fitbit Air. |       P0 |     0 |
| PRD-FR-SPIKE-003 | Spike MUST confirm whether sleep stages are available and how they are represented.                                                                 |       P0 |     0 |
| PRD-FR-SPIKE-004 | Spike MUST confirm whether HRV, resting HR, SpO2, respiratory rate, and VO2 max are available.                                                      |       P0 |     0 |
| PRD-FR-SPIKE-005 | Spike SHOULD confirm whether provider sleep/readiness/cardio-load style scores are exposed.                                                         |       P1 |     0 |
| PRD-FR-SPIKE-006 | Spike MUST document sync latency behavior.                                                                                                          |       P0 |     0 |

### Deliverable

`google_health_data_availability_matrix.md`

### Acceptance criteria

- Product and engineering know exactly which data can be used for Phase 1 scoring.
- Any missing data has fallback behavior defined.
- No score formula depends on unvalidated fields.

---

## 10.5 Home Dashboard

| ID              | Requirement                                              | Priority | Phase |
| --------------- | -------------------------------------------------------- | -------: | ----: |
| PRD-FR-HOME-001 | Home MUST load quickly from local cached dashboard data. |       P0 |     1 |
| PRD-FR-HOME-002 | Home MUST show Recovery Score.                           |       P0 |     1 |
| PRD-FR-HOME-003 | Home MUST show Sleep Score.                              |       P0 |     1 |
| PRD-FR-HOME-004 | Home MUST show Sleep Debt.                               |       P0 |     1 |
| PRD-FR-HOME-005 | Home MUST show Steps.                                    |       P0 |     1 |
| PRD-FR-HOME-006 | Home MUST show Calories Burned.                          |       P0 |     1 |
| PRD-FR-HOME-007 | Home SHOULD show Training Readiness.                     |       P1 |   1/2 |
| PRD-FR-HOME-008 | Home SHOULD show HRV trend.                              |       P1 |     1 |
| PRD-FR-HOME-009 | Home SHOULD show Today’s Recommendation.                 |       P1 |   1/2 |
| PRD-FR-HOME-010 | Home SHOULD show Bedtime Recommendation when relevant.   |       P1 |   1/2 |
| PRD-FR-HOME-011 | User SHOULD be able to hide/show/reorder home widgets.   |       P1 |     1 |
| PRD-FR-HOME-012 | Home MAY include a Wellbeing Score widget.               |       P2 |     2 |

### Default Phase 1 home cards

1. Recovery
2. Sleep Score
3. Sleep Debt
4. Steps
5. Calories Burned
6. Training Readiness
7. HRV Trend
8. Today’s Recommendation

### Acceptance criteria

- Home appears useful within 1 second using cached data on normal app launch.
- Background sync can update cards without jarring UI reload.
- Each score card supports tap-through to a detail explanation.

---

## 10.6 Sleep Page

| ID               | Requirement                                                    | Priority | Phase |
| ---------------- | -------------------------------------------------------------- | -------: | ----: |
| PRD-FR-SLEEP-001 | Sleep page MUST show Sleep Score.                              |       P0 |     1 |
| PRD-FR-SLEEP-002 | Sleep page MUST show total sleep duration.                     |       P0 |     1 |
| PRD-FR-SLEEP-003 | Sleep page MUST show sleep debt.                               |       P0 |     1 |
| PRD-FR-SLEEP-004 | Sleep page SHOULD show sleep stages if available.              |       P1 |     1 |
| PRD-FR-SLEEP-005 | Sleep page SHOULD show sleep efficiency if computable.         |       P1 |     1 |
| PRD-FR-SLEEP-006 | Sleep page SHOULD show sleep consistency.                      |       P1 |   1/2 |
| PRD-FR-SLEEP-007 | Sleep page SHOULD show overnight HRV/RHR context if available. |       P1 |   1/2 |
| PRD-FR-SLEEP-008 | Sleep page SHOULD show respiratory/SpO2 context if available.  |       P1 |     2 |
| PRD-FR-SLEEP-009 | Sleep page MUST include a Bedtime Planner entry point.         |       P0 |     1 |
| PRD-FR-SLEEP-010 | Sleep page SHOULD include AI sleep summary.                    |       P1 |   1/2 |

### Acceptance criteria

- User can understand sleep quality and main drivers quickly.
- User can tap into details for stage breakdown and trends.
- Missing stage data does not break the page.

---

## 10.7 Bedtime Planner

### 10.7.1 Feature summary

The Bedtime Planner helps users choose optimal bedtime windows based on a target wake-up time, sleep latency, estimated sleep cycles, sleep debt, personal sleep need, circadian consistency, recent recovery status, and historical sleep/wake outcomes.

This feature should be located under Sleep and optionally exposed as a Home widget.

### 10.7.2 Requirements

| ID             | Requirement                                                                                         | Priority | Phase |
| -------------- | --------------------------------------------------------------------------------------------------- | -------: | ----: |
| PRD-FR-BED-001 | User MUST be able to select a target wake-up time.                                                  |       P0 |     1 |
| PRD-FR-BED-002 | Primis MUST estimate bedtime windows using historical sleep latency when available.                 |       P0 |     1 |
| PRD-FR-BED-003 | Primis SHOULD use sleep-cycle heuristics but MUST NOT imply sleep cycles are perfectly predictable. |       P0 |     1 |
| PRD-FR-BED-004 | Primis SHOULD account for sleep debt.                                                               |       P1 |     1 |
| PRD-FR-BED-005 | Primis SHOULD account for recent recovery score.                                                    |       P1 |   1/2 |
| PRD-FR-BED-006 | Primis SHOULD account for user’s usual bedtime/wake time.                                           |       P1 |   1/2 |
| PRD-FR-BED-007 | Primis SHOULD account for next-day training/workout importance if user provides it.                 |       P2 |     2 |
| PRD-FR-BED-008 | Output MUST provide ranked bedtime windows, not one fake-precise time.                              |       P0 |     1 |
| PRD-FR-BED-009 | Output MUST explain why each recommended window is suggested.                                       |       P0 |     1 |
| PRD-FR-BED-010 | Bedtime recommendation MAY be saved as a plan/reminder later.                                       |       P2 |   2/3 |

### 10.7.3 Recommended output pattern

Example:

```text
Target wake time: 6:45 AM

Best option: 10:12–10:32 PM
- Best balance of total sleep, your average 18-minute sleep latency, and likely easier wake timing.

Good option: 10:42–11:02 PM
- Still reasonable, but gives less room to recover sleep debt.

Last acceptable option: 11:12–11:32 PM
- Likely workable, but recovery may be lower tomorrow if your recent HRV trend stays suppressed.
```

### 10.7.4 Bedtime Planner algorithm inputs

- Target wake time
- Average sleep latency
- Median sleep latency
- Sleep latency variance
- User sleep need target
- Recent sleep debt
- Recent sleep score
- Recent recovery score
- Historical bedtime/wake-time pattern
- Chronotype/circadian tendency estimate
- Prior wake quality after similar bedtime/wake windows
- Next-day priority/training intensity, optional

### 10.7.5 Acceptance criteria

- User can get bedtime suggestions in under 2 seconds after selecting wake time using precomputed profile data.
- Suggestions remain useful even with limited historical data by using default sleep-cycle heuristics and clear caveats.
- As more data accumulates, suggestions become more personalized.

---

## 10.8 Recovery Page

| ID             | Requirement                                                                    | Priority | Phase |
| -------------- | ------------------------------------------------------------------------------ | -------: | ----: |
| PRD-FR-REC-001 | Recovery page MUST show Recovery Score.                                        |       P0 |     1 |
| PRD-FR-REC-002 | Recovery page MUST explain main drivers.                                       |       P0 |     1 |
| PRD-FR-REC-003 | Recovery page SHOULD use HRV vs personal baseline.                             |       P1 |   1/2 |
| PRD-FR-REC-004 | Recovery page SHOULD use RHR vs personal baseline.                             |       P1 |   1/2 |
| PRD-FR-REC-005 | Recovery page SHOULD use sleep score/debt.                                     |       P1 |     1 |
| PRD-FR-REC-006 | Recovery page SHOULD use respiratory rate/SpO2 deviations if available.        |       P1 |     2 |
| PRD-FR-REC-007 | Recovery page SHOULD incorporate subjective check-in as a contextual modifier. |       P1 |     2 |
| PRD-FR-REC-008 | Recovery page SHOULD provide training recommendation language.                 |       P1 |   1/2 |

### Acceptance criteria

- User can see recovery status and why it changed.
- Recommendation avoids overly aggressive or overly conservative framing.
- Recovery score is explainable.

---

## 10.9 Activity and Training Page

| ID             | Requirement                                                                            | Priority | Phase |
| -------------- | -------------------------------------------------------------------------------------- | -------: | ----: |
| PRD-FR-ACT-001 | Activity page MUST show steps.                                                         |       P0 |     1 |
| PRD-FR-ACT-002 | Activity page MUST show calories burned where available.                               |       P0 |     1 |
| PRD-FR-ACT-003 | Activity page SHOULD distinguish active vs resting/total calories if data supports it. |       P1 |   1/2 |
| PRD-FR-ACT-004 | Activity page SHOULD show workouts/exercise sessions.                                  |       P1 |     1 |
| PRD-FR-ACT-005 | Activity page SHOULD show floors/distance.                                             |       P1 |     1 |
| PRD-FR-ACT-006 | Activity page SHOULD show time in heart-rate zones if available.                       |       P1 |     2 |
| PRD-FR-ACT-007 | Activity page SHOULD compute training load/strain.                                     |       P1 |     2 |
| PRD-FR-ACT-008 | Activity page SHOULD show 7-day vs 28-day load.                                        |       P1 |     2 |
| PRD-FR-ACT-009 | Activity page SHOULD provide workout suggestions based on readiness.                   |       P1 |     2 |

### Acceptance criteria

- User can understand daily and weekly activity.
- Training load is not shown until enough workout/HR data exists.
- Workout recommendations clearly cite supporting signals.

---

## 10.10 Vitals and Body Metrics

| ID             | Requirement                                                      | Priority | Phase |
| -------------- | ---------------------------------------------------------------- | -------: | ----: |
| PRD-FR-VIT-001 | Primis MUST support a vitals/detail view.                        |       P0 |     1 |
| PRD-FR-VIT-002 | View SHOULD show resting HR.                                     |       P1 |     1 |
| PRD-FR-VIT-003 | View SHOULD show HRV.                                            |       P1 |     1 |
| PRD-FR-VIT-004 | View SHOULD show SpO2 if available.                              |       P1 |     2 |
| PRD-FR-VIT-005 | View SHOULD show respiratory rate if available.                  |       P1 |     2 |
| PRD-FR-VIT-006 | View SHOULD show VO2 max if available.                           |       P1 |     2 |
| PRD-FR-VIT-007 | View SHOULD show weight/body fat if available.                   |       P1 |   2/3 |
| PRD-FR-VIT-008 | View MUST use baseline language, not medical diagnosis language. |       P0 |     1 |

### Acceptance criteria

- Vitals show trends and baseline deviations.
- Vitals page does not overstate medical significance.

---

## 10.11 Nutrition

### 10.11.1 Nutrition product stance

Nutrition is important but can easily become a separate product. Primis should begin with lightweight nutrition context, then add richer food tracking in later phases.

### 10.11.2 Requirements

| ID             | Requirement                                                                                                                   | Priority | Phase |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------: | ----: |
| PRD-FR-NUT-001 | User SHOULD be able to manually log calories.                                                                                 |       P1 |   1/2 |
| PRD-FR-NUT-002 | User SHOULD be able to manually log protein/carbs/fat.                                                                        |       P1 |   1/2 |
| PRD-FR-NUT-003 | User MUST be able to log water/hydration.                                                                                     |       P0 |     1 |
| PRD-FR-NUT-004 | User MUST be able to log caffeine amount and latest timing.                                                                   |       P0 |     1 |
| PRD-FR-NUT-005 | User MUST be able to log alcohol amount/range and type.                                                                       |       P0 |     1 |
| PRD-FR-NUT-006 | User SHOULD be able to tag late meal, high protein, whole foods, seed oils, artificial ingredients, or custom nutrition tags. |       P1 |     2 |
| PRD-FR-NUT-007 | Primis SHOULD import USDA FoodData Central into a local DB in v1.5.                                                           |       P1 |     2 |
| PRD-FR-NUT-008 | Primis SHOULD support user-created foods that persist.                                                                        |       P1 |     2 |
| PRD-FR-NUT-009 | User-created foods MUST default to private unless explicitly designed otherwise.                                              |       P0 |     2 |
| PRD-FR-NUT-010 | Primis MAY support AI-assisted meal estimation.                                                                               |       P2 |   2/3 |
| PRD-FR-NUT-011 | Primis MAY support barcode scanning later.                                                                                    |       P2 |     3 |
| PRD-FR-NUT-012 | Primis MUST NOT depend on MyFitnessPal API access for early phases.                                                           |       P0 |     1 |

### 10.11.3 FoodData Central architecture requirements

| ID             | Requirement                                                                                                   | Priority | Phase |
| -------------- | ------------------------------------------------------------------------------------------------------------- | -------: | ----: |
| PRD-FR-FDC-001 | Primis SHOULD use FDC bulk downloadable datasets, not massive repeated API calls, for local catalog creation. |       P1 |     2 |
| PRD-FR-FDC-002 | Primis SHOULD maintain source version metadata for imported foods.                                            |       P1 |     2 |
| PRD-FR-FDC-003 | Primis SHOULD index foods for fast search.                                                                    |       P1 |     2 |
| PRD-FR-FDC-004 | Primis SHOULD support periodic refresh/import jobs.                                                           |       P2 |     3 |
| PRD-FR-FDC-005 | Primis SHOULD distinguish global verified foods from user-created foods.                                      |       P1 |     2 |

### 10.11.4 Acceptance criteria

- Nutrition v1 adds useful context without overwhelming user.
- Caffeine/alcohol/hydration can be correlated with sleep/recovery.
- FoodData Central search can be added without reworking the entire nutrition data model.

---

## 10.12 Manual Inputs and Custom Tags

| ID             | Requirement                                                                                                      | Priority | Phase |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | -------: | ----: |
| PRD-FR-MAN-001 | User MUST be able to complete a quick check-in.                                                                  |       P0 |     1 |
| PRD-FR-MAN-002 | Check-in SHOULD include energy, mood, stress, soreness, hydration, caffeine, alcohol, digestion, and notes/tags. |       P1 |   1/2 |
| PRD-FR-MAN-003 | User SHOULD be able to add custom tags.                                                                          |       P1 |   1/2 |
| PRD-FR-MAN-004 | Manual inputs SHOULD be optional.                                                                                |       P0 |     1 |
| PRD-FR-MAN-005 | Manual inputs SHOULD become more useful as data accumulates.                                                     |       P0 |     2 |
| PRD-FR-MAN-006 | Primis SHOULD detect correlations between manual inputs and objective outcomes after enough data exists.         |       P1 |     2 |

### 10.12.1 Poop/digestion tracking

| ID             | Requirement                                                                                                      | Priority | Phase |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | -------: | ----: |
| PRD-FR-DIG-001 | User MAY track bowel movements optionally.                                                                       |       P2 |     2 |
| PRD-FR-DIG-002 | Tracking SHOULD support Bristol stool type 1–7.                                                                  |       P2 |     2 |
| PRD-FR-DIG-003 | Tracking MAY support color, smell, urgency, pain, bloating, frequency, and notes.                                |       P2 |     2 |
| PRD-FR-DIG-004 | Digestion insights MUST avoid medical diagnosis.                                                                 |       P0 |     2 |
| PRD-FR-DIG-005 | Digestion data SHOULD support correlation analysis with food, hydration, caffeine, alcohol, sleep, and recovery. |       P2 |     3 |

### Acceptance criteria

- User can submit basic check-in in under 20 seconds.
- Optional advanced fields do not slow down basic use.
- Custom tags are stored with date/time and can be queried later.

---

## 10.13 AI Coach and AI Summaries

### 10.13.1 AI product stance

Primis should be AI-native, but not chatbot-only. AI should appear throughout the app as summaries, explanations, recommendations, and chat.

### 10.13.2 Requirements

| ID            | Requirement                                                                                      | Priority | Phase |
| ------------- | ------------------------------------------------------------------------------------------------ | -------: | ----: |
| PRD-FR-AI-001 | Primis MUST support an AI Coach chat interface.                                                  |       P0 |     1 |
| PRD-FR-AI-002 | Primis MUST abstract model providers behind a backend AI service.                                |       P0 |     1 |
| PRD-FR-AI-003 | GPT SHOULD be the first configured AI provider.                                                  |       P0 |     1 |
| PRD-FR-AI-004 | Backend SHOULD support Anthropic and future model providers through provider adapters.           |       P1 |     2 |
| PRD-FR-AI-005 | AI MUST answer from structured context packets, not raw full-history dumps.                      |       P0 |     1 |
| PRD-FR-AI-006 | AI SHOULD support sleep summaries.                                                               |       P1 |   1/2 |
| PRD-FR-AI-007 | AI SHOULD support workout/activity summaries.                                                    |       P1 |     2 |
| PRD-FR-AI-008 | AI SHOULD support recovery explanations.                                                         |       P1 |   1/2 |
| PRD-FR-AI-009 | AI SHOULD support nutrition coaching.                                                            |       P1 |     2 |
| PRD-FR-AI-010 | AI SHOULD ask clarifying questions when data is missing and the answer would materially improve. |       P1 |     2 |
| PRD-FR-AI-011 | AI MUST respect coach tone and summary tone settings.                                            |       P0 |     1 |
| PRD-FR-AI-012 | AI MUST NOT provide diagnosis or treatment claims.                                               |       P0 |     1 |

### 10.13.3 Coach style settings

Initial options:

- Analyst
- Performance coach
- Strict
- Encouraging
- Concise
- Explanatory
- Calm
- Unhinged-lite

### 10.13.4 Summary style settings

Initial options:

- Concise
- Detailed
- Data-heavy
- Plain English
- Action-only

### 10.13.5 Important constraint

Tone changes phrasing, not underlying recommendation logic.

Example:

- Analyst: “Your HRV is below baseline and sleep debt is elevated. Moderate training is better supported today.”
- Strict: “Do not force a max-effort session today. Your recovery markers are not supporting it.”
- Encouraging: “You can still train today, but keep it controlled. Quality work beats forcing intensity.”

### Acceptance criteria

- AI responses cite the signals used.
- AI does not hallucinate unavailable data.
- AI responses are useful with minimal latency.
- Core app remains useful even if AI call fails.

---

## 10.14 UI Customization

| ID                 | Requirement                                                               | Priority | Phase |
| ------------------ | ------------------------------------------------------------------------- | -------: | ----: |
| PRD-FR-UI-CUST-001 | User SHOULD be able to select dark, light, or system mode.                |       P1 |     1 |
| PRD-FR-UI-CUST-002 | User SHOULD be able to select accent color(s).                            |       P1 |     1 |
| PRD-FR-UI-CUST-003 | User SHOULD be able to reorder/hide/show home widgets.                    |       P1 |     1 |
| PRD-FR-UI-CUST-004 | User MAY customize tab order later.                                       |       P2 |     3 |
| PRD-FR-UI-CUST-005 | Primis MUST maintain a premium default layout even without customization. |       P0 |     1 |

### Acceptance criteria

- Customization feels powerful but not overwhelming.
- User cannot break the app layout through customization.
- Defaults are good enough that most users do not need customization.

---

## 10.15 Settings and Data Controls

| ID             | Requirement                                                               | Priority | Phase |
| -------------- | ------------------------------------------------------------------------- | -------: | ----: |
| PRD-FR-SET-001 | User MUST be able to view connected data sources.                         |       P0 |     1 |
| PRD-FR-SET-002 | User MUST be able to disconnect Google Health.                            |       P0 |   1/2 |
| PRD-FR-SET-003 | User SHOULD be able to delete account and data before public beta.        |       P0 |     4 |
| PRD-FR-SET-004 | User SHOULD be able to view last sync status.                             |       P0 |     1 |
| PRD-FR-SET-005 | User SHOULD be able to edit goals, coach style, summary style, and theme. |       P1 |     1 |
| PRD-FR-SET-006 | User MAY choose raw data retention later.                                 |       P2 |     4 |

---

## 11. Scoring and Derived Metrics

This PRD defines product-level expectations only. A separate Scoring & Algorithms Spec must define exact formulas.

### 11.1 Required scores

| ID            | Score                  | Phase | Notes                                                  |
| ------------- | ---------------------- | ----: | ------------------------------------------------------ |
| PRD-SCORE-001 | Sleep Score            |     1 | Must be explainable.                                   |
| PRD-SCORE-002 | Recovery Score         |     1 | Main performance score.                                |
| PRD-SCORE-003 | Training Readiness     |   1/2 | Based on recovery + load + sleep debt.                 |
| PRD-SCORE-004 | Training Load / Strain |     2 | Derived from workouts, HR zones, active calories, etc. |
| PRD-SCORE-005 | Sleep Debt             |     1 | Based on target vs actual sleep.                       |
| PRD-SCORE-006 | Sleep Consistency      |   1/2 | Bed/wake time regularity.                              |
| PRD-SCORE-007 | Wellbeing Score        |     2 | Optional composite home widget.                        |
| PRD-SCORE-008 | Nutrition Adherence    |     2 | Only after nutrition data exists.                      |

### 11.2 Scoring principles

- Scores MUST be explainable.
- Scores MUST use personal baselines when available.
- Scores SHOULD avoid false precision.
- Scores SHOULD show “not enough data yet” states.
- Scores SHOULD be recomputable from stored normalized data.
- Scores SHOULD be versioned.
- Score snapshots MUST store formula version.

### 11.3 Initial formula concepts

These are conceptual placeholders, not final algorithm specs.

#### Recovery Score concept

```text
Recovery Score =
  HRV vs baseline
  + resting HR vs baseline
  + sleep score
  + sleep debt
  + respiratory rate stability
  + SpO2 stability
  + subjective check-in modifier
```

#### Sleep Score concept

```text
Sleep Score =
  sleep duration vs target
  + sleep efficiency
  + deep sleep vs baseline
  + REM sleep vs baseline
  + sleep consistency
  + overnight HR/RHR quality
  + respiratory/SpO2 stability
```

#### Training Readiness concept

```text
Training Readiness =
  recovery score
  + sleep debt
  + acute/chronic training load
  + soreness/fatigue input
  + user goal context
```

#### Wellbeing Score concept

```text
Wellbeing Score =
  recovery
  + sleep
  + activity balance
  + nutrition/hydration adherence
  + subjective check-in
```

### 11.4 User score customization

Users SHOULD NOT be able to manually change score weights in early versions.

Rationale:

- It weakens product credibility.
- Users can create nonsense scores.
- It complicates explainability.

Users MAY customize:

- Dashboard layout
- Goals
- Preferred metrics
- Coaching style
- Summary style
- Theme/accent colors

---

## 12. Data Model Requirements

This PRD defines the product-level entities. A separate Data Model / Health Metric Schema spec must define exact tables, indexes, types, and relationships.

### 12.1 Core entities

Primis SHOULD support the following conceptual entities:

```text
User
UserProfile
AuthIdentity
ProviderConnection
ProviderToken
RawProviderPayload
MetricPoint
DailyMetricSummary
SleepSession
WorkoutSession
BodyCompositionMeasurement
NutritionEntry
HydrationEntry
CaffeineEntry
AlcoholEntry
BowelEntry
ManualCheckin
CustomTag
UserGoal
ScoreSnapshot
InsightCandidate
Insight
AISummary
AIConversation
DashboardWidget
ThemeSettings
CoachPreferences
SyncJob
DataSource
```

### 12.2 Data layer separation

Primis MUST separate:

1. Raw provider payloads
2. Normalized metric points
3. Daily summaries
4. Derived scores
5. Insights
6. AI-generated responses

### 12.3 Source metadata

Every normalized metric SHOULD include:

- User ID
- Provider/source
- Source device/app if known
- Data type
- Start time
- End time
- Value
- Unit
- Timezone context where relevant
- Ingestion timestamp
- Provider payload reference
- Confidence/source classification if useful internally

### 12.4 Formula and insight versioning

Every score snapshot SHOULD include:

- Score type
- Score value
- Score version
- Input summary
- Calculation timestamp
- Data coverage flags

Every insight SHOULD include:

- Insight type
- Triggering conditions
- Related metrics
- Confidence/internal support level
- Created time
- Dismissed/saved status later

---

## 13. Backend and Architecture Requirements

This PRD defines product-level architecture direction. A dedicated Technical Architecture Document must provide implementation detail.

### 13.1 Stack direction

Primis will use an AWS-native mature stack.

Expected components:

- Amazon Cognito
- API Gateway
- Lambda
- ECS/Fargate where background/AI workloads require it
- RDS Postgres
- S3
- SQS
- EventBridge
- KMS
- Secrets Manager
- CloudWatch
- X-Ray/OpenTelemetry later

### 13.2 Backend requirements

| ID         | Requirement                                                       | Priority | Phase |
| ---------- | ----------------------------------------------------------------- | -------: | ----: |
| PRD-BE-001 | Backend MUST support secure auth and user identity.               |       P0 |     1 |
| PRD-BE-002 | Backend MUST store Google Health OAuth tokens securely.           |       P0 |     1 |
| PRD-BE-003 | Backend MUST encrypt sensitive tokens/secrets.                    |       P0 |     1 |
| PRD-BE-004 | Backend MUST support background sync jobs.                        |       P0 |     1 |
| PRD-BE-005 | Backend SHOULD use queues for long-running sync/processing tasks. |       P1 |   1/2 |
| PRD-BE-006 | Backend MUST support normalized health metrics.                   |       P0 |     1 |
| PRD-BE-007 | Backend MUST support precomputed dashboard payloads.              |       P0 |     1 |
| PRD-BE-008 | Backend MUST support AI context packet generation.                |       P0 |   1/2 |
| PRD-BE-009 | Backend SHOULD support raw payload archival.                      |       P1 |     1 |
| PRD-BE-010 | Backend MUST support formula versioning for scores.               |       P0 |     2 |

### 13.3 Raw data retention

Private/dev default:

- Keep raw data indefinitely unless deleted.

Future public default recommendation:

- Keep raw payloads for a defined retention window.
- Keep normalized summaries longer.
- Provide deletion controls.

Retention policy must be finalized before public launch.

---

## 14. Mobile App Requirements

### 14.1 Mobile stack

Primis SHOULD be built with:

- React Native
- Expo Dev Client, not Expo Go
- TypeScript
- Reanimated
- React Native Skia
- Gesture Handler
- TanStack Query
- Zustand or Jotai
- MMKV
- SQLite/local DB
- FlashList where large lists exist
- Native HealthKit module later
- Health Connect module later

### 14.2 Mobile UX performance requirements

| ID               | Requirement                                                 | Priority | Phase |
| ---------------- | ----------------------------------------------------------- | -------: | ----: |
| PRD-MOB-PERF-001 | Home MUST render from cache before waiting on backend sync. |       P0 |     1 |
| PRD-MOB-PERF-002 | Core screen transitions MUST feel smooth on modern iPhones. |       P0 |     1 |
| PRD-MOB-PERF-003 | Heavy calculations MUST NOT run in React render paths.      |       P0 |     1 |
| PRD-MOB-PERF-004 | Charts SHOULD use precomputed chart-ready datasets.         |       P1 |   1/2 |
| PRD-MOB-PERF-005 | AI calls MUST NOT block score or dashboard display.         |       P0 |     1 |
| PRD-MOB-PERF-006 | App SHOULD display last-known data gracefully when offline. |       P1 |   1/2 |
| PRD-MOB-PERF-007 | App MUST avoid jarring reloads when sync completes.         |       P0 |     1 |

### 14.3 Perceived performance

Primis SHOULD:

- Use optimistic cached rendering.
- Use skeletons only where appropriate.
- Use subtle refresh indicators.
- Prefer smooth card updates over full reloads.
- Keep AI loading states separate from core health data.

---

## 15. UI/UX Requirements

### 15.1 Design system requirements

| ID         | Requirement                                   | Priority | Phase |
| ---------- | --------------------------------------------- | -------: | ----: |
| PRD-UX-001 | Primis MUST support premium dark mode.        |       P0 |     1 |
| PRD-UX-002 | Primis MUST support premium light mode.       |       P0 |     1 |
| PRD-UX-003 | Primis SHOULD support custom accent colors.   |       P1 |     1 |
| PRD-UX-004 | Primis MUST define a spacing scale.           |       P0 |     1 |
| PRD-UX-005 | Primis MUST define typography hierarchy.      |       P0 |     1 |
| PRD-UX-006 | Primis MUST define card styles.               |       P0 |     1 |
| PRD-UX-007 | Primis MUST define chart styling guidelines.  |       P0 |   1/2 |
| PRD-UX-008 | Primis SHOULD define motion principles.       |       P1 |     1 |
| PRD-UX-009 | Primis MUST avoid cluttered dashboard design. |       P0 |     1 |

### 15.2 Motion and animation

Motion should be:

- Fast
- Subtle
- Useful
- Premium
- Not distracting

Recommended motion uses:

- Card entrance transitions
- Smooth tab transitions
- Score ring/progress animations
- Pull-to-refresh feedback
- Tap microinteractions
- Chart reveal animations
- Skeleton-to-content transitions

Motion MUST NOT:

- Delay user access to data
- Hide sluggish data loading
- Make the app feel gimmicky
- Trigger unnecessary re-renders

### 15.3 Home visual direction

Home should combine:

- Premium score cards
- Ring/progress visualization
- Clean widget stack
- High-quality spacing
- Minimal but useful AI recommendation
- Swipe/tap gestures where appropriate

### 15.4 Chart principles

Charts SHOULD:

- Prioritize readability
- Support 7/30/90-day views where relevant
- Show baseline ranges
- Highlight meaningful deviations
- Avoid noisy raw data unless user requests detail
- Use labels that non-technical users can understand

---

## 16. AI Context Engine Requirements

The AI Context Engine is the bridge between structured health data and AI output.

### 16.1 Context engine requirements

| ID           | Requirement                                                                                                                     | Priority | Phase |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------: | ----: |
| PRD-AICE-001 | Backend MUST classify AI user intents.                                                                                          |       P0 |   1/2 |
| PRD-AICE-002 | Backend MUST build compact context packets for AI calls.                                                                        |       P0 |     1 |
| PRD-AICE-003 | Context packets SHOULD include latest scores, relevant baselines, recent trends, manual inputs, user goals, and prior insights. |       P1 |   1/2 |
| PRD-AICE-004 | Context packets MUST avoid unnecessary raw full-history dumps.                                                                  |       P0 |     1 |
| PRD-AICE-005 | AI responses SHOULD include evidence/source signals.                                                                            |       P1 |   1/2 |
| PRD-AICE-006 | AI outputs SHOULD be stored as summaries/conversation records where useful.                                                     |       P1 |   1/2 |

### 16.2 Example context packet shape

```json
{
  "user_id": "user_123",
  "intent": "training_recommendation",
  "date": "2026-06-02",
  "goals": ["athletic_performance", "sleep", "body_composition"],
  "latest_scores": {
    "recovery": 68,
    "sleep": 74,
    "training_readiness": 63
  },
  "baseline_signals": {
    "hrv": "12% below 30-day baseline",
    "resting_heart_rate": "5 bpm above 30-day baseline",
    "sleep_debt": "2.1 hours"
  },
  "recent_training": {
    "seven_day_load": "above normal",
    "last_workout": "high intensity lower body",
    "soreness": "moderate"
  },
  "manual_inputs": {
    "caffeine_late": true,
    "alcohol_yesterday": false,
    "stress": 4
  },
  "relevant_insights": [
    "Low HRV often follows hard basketball sessions for this user.",
    "Sleep under 7 hours correlates with lower readiness for this user."
  ],
  "coach_style": "strict_but_explanatory"
}
```

---

## 17. Insight and Correlation Requirements

### 17.1 Insight engine

| ID          | Requirement                                                                                                 | Priority | Phase |
| ----------- | ----------------------------------------------------------------------------------------------------------- | -------: | ----: |
| PRD-INS-001 | Primis SHOULD generate deterministic insight candidates from metric deviations.                             |       P1 |     2 |
| PRD-INS-002 | Primis SHOULD detect baseline deviations in HRV, RHR, sleep, respiratory rate, activity, and training load. |       P1 |     2 |
| PRD-INS-003 | Primis SHOULD detect simple correlations between manual tags and outcomes after enough data exists.         |       P1 |     2 |
| PRD-INS-004 | Primis SHOULD avoid presenting weak correlations as conclusions.                                            |       P0 |     2 |
| PRD-INS-005 | Primis SHOULD communicate uncertainty using user-friendly language.                                         |       P1 |     2 |

### 17.2 Correlation examples

Potential insights:

- Caffeine after 2 PM correlates with lower sleep score.
- Alcohol correlates with higher RHR and lower HRV next day.
- Late meals correlate with lower sleep efficiency.
- High training load correlates with lower recovery after two days.
- Higher hydration correlates with fewer digestion complaints.
- Consistent wake time correlates with better sleep score.

### 17.3 Confidence language

Primis SHOULD use language such as:

- “Not enough data yet.”
- “Early pattern.”
- “Moderate pattern.”
- “Consistent pattern over recent logs.”

Primis SHOULD NOT use language such as:

- “This proves.”
- “This causes.”
- “This diagnosis means.”

---

## 18. Privacy, Security, and Compliance Requirements

### 18.1 Security principles

Primis MUST treat health data as sensitive.

Requirements:

| ID          | Requirement                                                        | Priority | Phase |
| ----------- | ------------------------------------------------------------------ | -------: | ----: |
| PRD-SEC-001 | OAuth tokens MUST be encrypted at rest.                            |       P0 |     1 |
| PRD-SEC-002 | Sensitive secrets MUST be stored in Secrets Manager or equivalent. |       P0 |     1 |
| PRD-SEC-003 | Health data MUST be encrypted at rest.                             |       P0 |     1 |
| PRD-SEC-004 | Health data MUST be transmitted over TLS.                          |       P0 |     1 |
| PRD-SEC-005 | Backend APIs MUST enforce user-level authorization.                |       P0 |     1 |
| PRD-SEC-006 | Logs MUST NOT expose raw tokens or sensitive health payloads.      |       P0 |     1 |
| PRD-SEC-007 | Public beta MUST include data deletion/account deletion.           |       P0 |     4 |
| PRD-SEC-008 | Public beta MUST include clear in-app health data disclosure.      |       P0 |     4 |
| PRD-SEC-009 | Public beta MUST include privacy policy.                           |       P0 |     4 |

### 18.2 AI/privacy disclosure

Before public beta, Primis MUST clearly disclose:

- What health data is collected
- Why it is collected
- How it is used
- Whether it is sent to AI providers
- How users can delete/disconnect data
- That Primis is not a medical diagnosis app

### 18.3 Data minimization

Primis SHOULD collect only data necessary for enabled features and user-granted permissions.

---

## 19. Monetization Requirements

Monetization is not required for private MVP, but product architecture should not block it.

### 19.1 Future model

Potential pricing:

- Free/basic plan: basic dashboard, limited scores, no or limited AI.
- Premium plan: full analytics, AI coach, custom insights, advanced recovery/sleep/training/nutrition features.

Candidate premium price: approximately $9.99/month, subject to validation.

### 19.2 Future premium features

- Advanced AI Coach
- Full recovery analytics
- Full sleep analytics
- Weekly/monthly reports
- Custom dashboards
- Nutrition insights
- Correlation engine
- Body composition trends
- Multi-source integrations

---

## 20. Success Metrics

### 20.1 Private beta success metrics

| ID             | Metric                                                      | Target                         |
| -------------- | ----------------------------------------------------------- | ------------------------------ |
| PRD-METRIC-001 | Founder opens app at least 4 days/week.                     | Yes/no qualitative validation. |
| PRD-METRIC-002 | Home dashboard feels useful within 10 seconds.              | Qualitative.                   |
| PRD-METRIC-003 | Recovery/Sleep scores feel directionally accurate.          | Qualitative.                   |
| PRD-METRIC-004 | AI answers feel grounded in user data.                      | Qualitative.                   |
| PRD-METRIC-005 | App performance feels premium.                              | Qualitative.                   |
| PRD-METRIC-006 | Private tester uses app at least 3 days/week after 2 weeks. | Early retention signal.        |

### 20.2 Future public metrics

- D1 retention
- D7 retention
- D30 retention
- Weekly active users
- Average sessions/week
- Health data connection completion rate
- Sync success rate
- AI interaction rate
- Subscription conversion
- Churn
- Crash-free sessions
- Time to home usable state

---

## 21. Open Questions and Decisions

These are not blockers for PRD creation but should be resolved during implementation planning.

| ID         | Question                                                          | Owner                  | Needed By                 |
| ---------- | ----------------------------------------------------------------- | ---------------------- | ------------------------- |
| PRD-OQ-001 | Exact Google Health data types available from Fitbit Air account. | Engineering            | Phase 0                   |
| PRD-OQ-002 | Whether provider sleep/readiness/cardio-load scores are exposed.  | Engineering            | Phase 0                   |
| PRD-OQ-003 | Whether HealthKit should be Phase 1 or Phase 3.                   | Product/Engineering    | Before Phase 1 build lock |
| PRD-OQ-004 | Final score formulas and weights.                                 | Product/Data           | Scoring spec              |
| PRD-OQ-005 | Final visual identity and logo.                                   | Product/Design         | UI spec                   |
| PRD-OQ-006 | Public user raw-data retention defaults.                          | Product/Legal/Security | Before public beta        |
| PRD-OQ-007 | Final AI provider routing strategy.                               | Engineering            | AI spec                   |
| PRD-OQ-008 | Whether Facebook sign-in is worth early implementation.           | Product                | Phase 2/4                 |
| PRD-OQ-009 | Whether to write data back to Apple Health/Health Connect.        | Product/Engineering    | Phase 3                   |
| PRD-OQ-010 | Final subscription price and free plan limits.                    | Product                | Public beta               |

---

## 22. Risks and Mitigations

| Risk                                                          | Impact      | Mitigation                                                                               |
| ------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| Google Health API does not expose desired proprietary scores. | High        | Compute Primis-owned scores from raw metrics.                                            |
| Fitbit Air data availability differs from assumptions.        | High        | Phase 0 data availability spike before dependent UI.                                     |
| App becomes too broad too early.                              | High        | Phase boundaries and non-goals.                                                          |
| AI feels generic or hallucinates.                             | High        | Structured context engine; deterministic insights first.                                 |
| Nutrition scope explodes.                                     | High        | Start with manual/context logging; FoodData Central v1.5.                                |
| React Native performance is poor.                             | Medium/High | Local caching, precomputed data, Reanimated/Skia, no render-path heavy compute.          |
| Health data privacy creates launch friction.                  | High        | Build with verification/security principles early.                                       |
| Scores feel fake.                                             | High        | Explainable formulas, personal baselines, transparency, validation with user perception. |
| Manual inputs become annoying.                                | Medium      | Fast check-in, optional advanced fields, visible payoff through trends.                  |
| Hume data not available through Apple Health.                 | Medium      | Treat Hume as Phase 3 validation, not MVP dependency.                                    |

---

## 23. Build Milestone Proposal

### 23.1 Milestone 0: Data and architecture proof

Deliverables:

- AWS skeleton
- Auth skeleton
- Google OAuth test
- Google Health API test
- Raw payload store
- Normalized metric prototype
- Data availability matrix
- Mobile app shell

### 23.2 Milestone 1: Founder daily dashboard

Deliverables:

- Home dashboard
- Google sync
- Basic sleep score
- Basic recovery score
- Activity metrics
- Cached dashboard
- Dark/light theme
- Basic settings

### 23.3 Milestone 2: Sleep/recovery intelligence

Deliverables:

- Sleep page
- Recovery page
- Bedtime Planner
- Sleep debt
- HRV/RHR baselines
- AI sleep/recovery summaries

### 23.4 Milestone 3: Activity/training intelligence

Deliverables:

- Activity page
- Workout list/details
- Training readiness
- Load/strain concept
- Workout recommendation logic
- AI training Q&A

### 23.5 Milestone 4: Manual inputs and nutrition context

Deliverables:

- Quick check-in
- Caffeine/alcohol/water logging
- Custom tags
- Basic macro logging
- Early correlations

### 23.6 Milestone 5: AI-native layer

Deliverables:

- AI Coach chat
- AI context engine
- Coach style settings
- Summary style settings
- Stored summaries
- Model provider abstraction

### 23.7 Milestone 6: FoodData Central and richer nutrition

Deliverables:

- FDC import pipeline
- Food search
- User-created foods
- Meal entries
- Macro dashboard
- Nutrition insights

### 23.8 Milestone 7: iOS HealthKit enrichment

Deliverables:

- HealthKit permissions
- Apple Health ingestion
- Hume-through-Apple-Health validation
- Conflict/source priority logic

---

## 24. MVP Definition

### 24.1 Phase 1 MVP MUST include

- Account/auth
- Google Health connection
- Secure token storage
- Data sync
- Normalized health metrics
- Cached home dashboard
- Recovery Score
- Sleep Score
- Sleep Debt
- Steps
- Calories Burned
- HRV/RHR where available
- Sleep page
- Recovery page
- Activity page
- Basic AI Coach
- Basic manual inputs
- Bedtime Planner
- Dark/light mode
- Accent color
- Basic home widget customization

### 24.2 Phase 1 MVP SHOULD include

- Training Readiness
- Today’s Recommendation
- AI sleep summary
- AI recovery explanation
- Quick check-in
- Caffeine/alcohol/water logging
- Basic chart views

### 24.3 Phase 1 MVP MUST NOT include

- Full MyFitnessPal-style nutrition system
- Public user launch
- Medical diagnosis
- Social features
- Broad provider marketplace
- Complex ML models needing large user population

---

## 25. Final Product Management Notes

Primis should be built around a simple truth:

> Users do not need another place to dump health data. They need a better system for turning that data into decisions.

The highest-value product areas are:

1. Health-data modeling
2. Recovery/sleep/training score credibility
3. Premium home UX
4. Fast performance
5. AI explanations that are grounded in structured data
6. Customization without chaos
7. Privacy/security maturity

The biggest traps are:

1. Building AI chat before the data model is mature.
2. Building a food-tracking product too early.
3. Trying to support every provider before Google/Fitbit is excellent.
4. Making the UI visually impressive but analytically shallow.
5. Making scores that are not explainable.

The correct sequence is:

```text
Data access
→ normalized health model
→ cached dashboard
→ core scores
→ premium UI
→ AI context engine
→ AI coach/summaries
→ manual inputs/correlations
→ nutrition expansion
→ HealthKit enrichment
→ public-beta hardening
```

---

## 26. Appendix: Requirement Priority Definitions

| Priority | Meaning                                                              |
| -------- | -------------------------------------------------------------------- |
| P0       | Required. Cannot ship target phase without it.                       |
| P1       | Important. Should ship if possible; can move one phase if necessary. |
| P2       | Useful. Defer if it threatens core quality.                          |
| P3       | Future/later enhancement.                                            |

---

## 27. Appendix: Glossary

| Term               | Meaning                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Provider data      | Raw health data from Google Health, HealthKit, Health Connect, Hume, nutrition systems, etc.      |
| Normalized metric  | Provider-independent representation of a health metric.                                           |
| Derived metric     | Primis-computed metric based on provider/manual data.                                             |
| Score snapshot     | Stored value of a score at a point in time with formula version.                                  |
| Insight candidate  | Deterministically generated possible insight before AI wording/filtering.                         |
| AI context packet  | Compact structured data object sent to AI for grounded response generation.                       |
| Recovery Score     | Primis score estimating current recovery state.                                                   |
| Sleep Score        | Primis score estimating sleep quality.                                                            |
| Training Readiness | Primis score estimating readiness for training intensity.                                         |
| Sleep Debt         | Difference between sleep need/target and recent actual sleep.                                     |
| Bedtime Planner    | Feature that recommends ranked bedtime windows based on target wake time and personal sleep data. |

---

## V1.1 Amendment — Google Health API Validation, Sleep Flagship Scope, and Feature Parity

**Status:** Required source-of-truth amendment.  
**Reason:** The founder supplied screenshots from the Google Health app and identified sleep as one of the highest-priority product surfaces. The source docs must now be stricter about Google Health API validation, sleep visualization parity, paired-device data, and exact provider-vs-Primis-derived feature classification.

### 22.1 Product decision: sleep is a flagship surface

Sleep is not a secondary analytics page. It is one of Primis' highest-priority surfaces and must be treated as a flagship proof of product quality.

Primis MUST support a premium Sleep experience that includes, at minimum:

| Requirement ID       | Requirement                                                                                                                                                          | Phase |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: |
| PRD-FR-SLEEP-NEW-001 | Sleep tab MUST include a Sleep Score hero using Primis' deterministic Sleep Score algorithm.                                                                         |    P1 |
| PRD-FR-SLEEP-NEW-002 | Sleep tab MUST show sleep duration, time in sleep period / time in bed when available, minutes asleep, minutes awake, and sleep efficiency.                          |    P1 |
| PRD-FR-SLEEP-NEW-003 | Sleep tab MUST include a premium sleep-stage timeline similar in richness to Google Health's visualization, using Primis visual language rather than copying Google. |    P1 |
| PRD-FR-SLEEP-NEW-004 | Sleep-stage chart MUST support AWAKE, LIGHT, DEEP, REM, ASLEEP, and RESTLESS states because Google Health API supports both classic and stages sleep types.          |    P1 |
| PRD-FR-SLEEP-NEW-005 | Sleep tab MUST support stage summaries: stage type, minutes, and segment count where provided by Google Health API.                                                  |    P1 |
| PRD-FR-SLEEP-NEW-006 | Sleep tab MUST show sleep latency / minutes to fall asleep where available from the sleep summary.                                                                   |    P1 |
| PRD-FR-SLEEP-NEW-007 | Sleep tab MUST show minutes after wake-up where available from the sleep summary.                                                                                    |    P1 |
| PRD-FR-SLEEP-NEW-008 | Sleep tab SHOULD show out-of-bed segments where available.                                                                                                           | P1/P2 |
| PRD-FR-SLEEP-NEW-009 | Sleep tab MUST include HRV context using daily HRV and deep-sleep RMSSD where available.                                                                             | P1/P2 |
| PRD-FR-SLEEP-NEW-010 | Sleep tab MUST include resting heart rate and/or overnight heart-rate context where available.                                                                       | P1/P2 |
| PRD-FR-SLEEP-NEW-011 | Sleep tab MUST include respiratory rate and SpO2 context where available.                                                                                            | P1/P2 |
| PRD-FR-SLEEP-NEW-012 | Sleep tab SHOULD include sleep temperature deviation when available.                                                                                                 |    P2 |
| PRD-FR-SLEEP-NEW-013 | Sleep tab MUST include Bedtime Planner entry point and next suggested bedtime window when enough data exists.                                                        |    P1 |
| PRD-FR-SLEEP-NEW-014 | Sleep tab MUST include AI sleep summary and `Ask Coach` contextual entry point.                                                                                      | P1/P2 |
| PRD-FR-SLEEP-NEW-015 | Sleep tab MUST include clear missing-data/provisional states when Google data is absent, stale, unprocessed, or rejected.                                            |    P1 |

### 22.2 Validated API capability vs real-device validation

Official Google Health API documentation validates that the API schema supports sleep sessions with optional stages, out-of-bed segments, metadata, and summary. It also validates that sleep stages can be classic (`AWAKE`, `RESTLESS`, `ASLEEP`) or stages (`AWAKE`, `LIGHT`, `REM`, `DEEP`). It validates summary fields including stage summaries, minutes in sleep period, minutes after wake-up, minutes to fall asleep, minutes asleep, and minutes awake.

However, Primis MUST still perform a real account/device validation milestone before treating any specific field as guaranteed for the founder's Fitbit Air / Google Health account. This distinction is mandatory:

```text
API schema supports field != founder account/device will always populate field
```

### 22.3 Google Health app feature parity classification

Primis MUST maintain `docs/decisions/google_health_api_feature_parity_matrix.md` as a source decision record. Every feature seen in Google Health screenshots must be classified as one of:

| Classification            | Meaning                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `provider_direct`         | Directly available from Google Health API data type/field.                                        |
| `provider_summary`        | Available as provider-computed summary field.                                                     |
| `primis_derived`          | Computed by Primis from underlying API data.                                                      |
| `manual_or_third_party`   | Requires manual logging or another provider/source.                                               |
| `unsupported_or_deferred` | Not supported yet or unavailable.                                                                 |
| `provider_unverified`     | API docs or screenshots imply possible support, but live payload validation has not confirmed it. |

### 22.4 Screenshot-derived feature commitments

The Google Health screenshots imply the following product expectations. Primis should support these features either directly or with a Primis-derived equivalent:

| Google Health feature            | Primis requirement                                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Device battery / sync pill       | Primis MUST support paired-device metadata where available: battery level, battery status, last sync time, device version, device type, supported features.                                              |
| Steps ring/card                  | Primis MUST support steps daily summary and home widget.                                                                                                                                                 |
| Calories burned                  | Primis MUST support active/total calories where available and label source clearly.                                                                                                                      |
| Readiness                        | Primis MUST implement Primis Recovery Score and Training Readiness; exact Google readiness score is optional only if exposed.                                                                            |
| Sleep duration / Sleep Score     | Primis MUST implement Primis Sleep Score and detailed sleep page.                                                                                                                                        |
| Exercise days                    | Primis MUST derive exercise days from exercise sessions.                                                                                                                                                 |
| Vitals “in range”                | Primis MUST compute personal-range status for supported vitals.                                                                                                                                          |
| Hydration                        | Primis SHOULD support hydration logging and Google hydration logs where available.                                                                                                                       |
| Floors                           | Primis MUST support floors where available.                                                                                                                                                              |
| Active Zone Minutes              | Primis MUST support active zone minutes where available.                                                                                                                                                 |
| Sleep-stage diagram              | Primis MUST support a premium sleep-stage timeline.                                                                                                                                                      |
| Sleep key metrics                | Primis MUST support sleep schedule, REM, deep, efficiency, latency, restlessness/interruption equivalents where available or derivable.                                                                  |
| Health status / key metrics grid | Primis MUST support key metric cards for weight, energy burned, intake, macros, steps, exercise days, RHR, HRV, breathing rate, cardio load, VO2 max, sleep score, sleep duration, glucose if available. |
| Ask Coach / Reply                | Primis MUST support contextual AI entry points grounded in structured data.                                                                                                                              |

### 22.5 Provider proprietary scores

The product must not depend on Google exposing exact proprietary app-level values for:

- Google Sleep Score
- Google Readiness Score
- Google Cardio Load
- Google AI coaching summaries

If available, Primis may store them as `provider_score` for comparison. If unavailable, Primis MUST compute transparent equivalents.

### 22.6 New acceptance gate

Before any sleep UI is declared complete, the implementation must have either:

1. real Google Health sleep payload fixtures from the founder/test user, or
2. explicitly labeled synthetic fixtures whose shape matches official Google Health API schema and a visible `provider_unverified` warning in development fixtures.

No production/private-beta Sleep page should be treated as valid until real payload validation is complete.

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

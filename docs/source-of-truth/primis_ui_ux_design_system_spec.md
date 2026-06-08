# Primis UI/UX Design System Spec

**Document type:** UI/UX Design System Specification  
**Product:** Primis  
**Version:** 1.1  
**Status:** Draft for implementation planning  
**Prepared for:** Evan / Primis private beta  
**Last updated:** 2026-06-07  
**Primary audience:** AI coding agents, product owner, mobile engineers, frontend engineers, designers, QA, AI/ML engineers

---

## 0. AI Coding Agent Instructions

This document is intended to be consumed directly by AI coding agents and human engineers. Treat it as the authoritative source of truth for Primis UI/UX design language, layout rules, design tokens, component behavior, motion, mobile performance expectations, accessibility requirements, and interaction patterns unless superseded by a later design-system decision record.

### 0.1 How to use this document

1. **Do not create ad hoc styles.** Use the token system, component rules, spacing scale, typography scale, and motion primitives defined here.
2. **Do not build generic AI-generated dashboards.** Primis must feel premium, intentional, fast, and product-led. Every screen must have a clear hierarchy and a reason to exist.
3. **Do not copy competitor UI.** Primis may learn from WHOOP, Oura, Apple Health/Fitness, Google Health/Fitbit, Bevel, and Athlytic, but must create its own interface, components, language, color system, and score presentation.
4. **Design for iOS first, Android-ready.** The app is React Native + Expo Dev Client. Avoid iOS-only assumptions in layout/component architecture unless specifically guarded by platform conditions.
5. **Prioritize the Home, Sleep, Recovery, Activity, Nutrition, AI Coach, and Bedtime Planner flows.** These are core product surfaces.
6. **Treat performance as UX.** Animation smoothness, screen transition speed, local cache behavior, data-loading states, and chart rendering are part of the design system.
7. **Health screens must be explainable.** When a score or recommendation is shown, the user must be able to drill into the contributing metrics and reasoning.
8. **AI tone changes wording only.** Coach tone and summary tone must not change the underlying deterministic recommendation logic.
9. **Respect accessibility from the beginning.** Touch targets, contrast, dynamic type, reduced motion, screen readers, and color-independent meaning are required, not afterthoughts.
10. **Use requirement IDs.** Reference IDs like `UX-CORE-001`, `UX-COMP-012`, `UX-MOTION-005`, and `UX-AC-009` in tickets, implementation comments, and QA checklists where useful.

### 0.2 Requirement language

- **MUST:** Required for implementation unless explicitly deferred.
- **SHOULD:** Strongly recommended; deviations require explicit product/technical approval.
- **MAY:** Optional or phase-dependent.
- **MUST NOT:** Prohibited unless a later source-of-truth document overrides it.

### 0.3 Relationship to other source-of-truth documents

This is document 6 of the initial Primis planning set.

1. Product Requirements Document
2. Technical Architecture Document
3. Data Model / Health Metric Schema
4. Scoring & Algorithms Spec
5. AI Context Engine Spec
6. **UI/UX Design System Spec**
7. MVP Build Plan / Milestones

This document defines the design language and mobile UX implementation expectations. It depends on prior documents for product scope, architecture, metric names, scoring behavior, and AI behavior.

If conflict exists:

1. Product scope comes from the PRD.
2. Infrastructure and performance architecture come from the Technical Architecture Document.
3. Metric names and data definitions come from the Data Model / Health Metric Schema.
4. Score formulas and deterministic logic come from the Scoring & Algorithms Spec.
5. AI behavior, context packets, model routing, and safety come from the AI Context Engine Spec.
6. Visual presentation, navigation, component behavior, motion, accessibility, and mobile UX details come from this document.

---

## 1. Executive Summary

Primis is an AI-native performance health OS. Its UI/UX must communicate the product's core promise immediately:

> **Your health data, converted into a fast, premium, customizable performance dashboard with intelligent coaching and clear explanations.**

Primis must not feel like a generic health tracker, a clone of Google Health, a chart dump, a medical portal, or a thin AI wrapper. It should feel like a **modern athletic performance command center**: sleek, fast, refined, data-dense where appropriate, calm when needed, and deeply personal.

The design direction is:

- **Modern performance-first** rather than soft wellness-first.
- **Sleek, premium, and high-contrast** without feeling gimmicky.
- **Dark-first**, with a premium light mode.
- **Highly customizable**, especially the Home dashboard.
- **AI-native**, but not chatbot-dominated.
- **Data-rich**, but progressively disclosed.
- **Animated and tactile**, but not distracting.
- **Human-readable**, with drill-down access for deeper analytics.

Primis should borrow strategic UX lessons from:

- **WHOOP:** performance, recovery, strain, sleep, coaching, direct recommendations.
- **Oura:** calm recovery/sleep framing, readiness, wellness depth, readable summaries.
- **Apple Fitness/Health:** rings/progress clarity, native-feeling polish, accessible health data hierarchy.
- **Google Health/Fitbit:** broad data coverage and mainstream health language, but not its current app layout limitations.
- **Bevel/Athlytic:** validated demand for wearable-data overlays and advanced performance analytics.

Primis must still be its own product. The app's differentiation is:

1. **Google/Fitbit-first data model.**
2. **Customizable Home dashboard.**
3. **Premier health-data model.**
4. **Transparent scoring and correlations.**
5. **AI analyst/coach integrated across the product.**
6. **Performance-grade UI/UX and motion.**

---

## 2. Research Basis and Design Principles

### 2.1 External design references

This spec is informed by current platform and accessibility guidance:

- Apple Human Interface Guidelines emphasize clarity, deference, depth, accessibility, motion restraint, and platform-native behavior.
- Material Design 3 provides comprehensive guidance for color, typography, shape, components, motion, and adaptive Android experiences.
- WCAG 2.2 provides testable accessibility criteria, including target-size minimums and broader accessibility requirements.
- React Native official performance guidance emphasizes minimizing list-item complexity, using memoization, and configuring large lists carefully.
- Apple's Activity Rings guidance specifically restricts Activity Rings to Move, Exercise, and Stand contexts, so Primis should use original progress-ring visuals rather than copying Apple's proprietary visual metaphor directly.

### 2.2 External product references

Primis should study, but not copy:

| Product | Useful lesson | Primis application |
|---|---|---|
| WHOOP | Recovery, Strain, Sleep, coaching based on body signals | Athletic-performance framing and clear “what should I do today?” guidance |
| Oura | Readiness, sleep depth, calm explanations, baseline-aware trends | Explainable recovery/sleep views and premium calm detail screens |
| Apple Fitness | Fast daily progress visualization | Primis progress rings/bars for goals, but original visual design |
| Apple Health | Metric detail pages and long-term health data hierarchy | Drill-down metric pages with history and source context |
| Google Health/Fitbit | Broad health-data availability and mainstream user mental model | Data coverage and familiar health categories, with better UX/customization |
| Bevel | AI health coach overlay, nutrition, strain, stress, Apple Health-based intelligence | Validates AI-native health overlay product category |
| Athlytic | Apple Watch-based recovery/exertion/readiness | Validates performance analytics from existing wearable data |

### 2.3 Primis design thesis

`UX-CORE-001` Primis MUST feel like a premium athletic analytics product, not a medical app.

`UX-CORE-002` Primis MUST show the most important health state within 3 seconds of opening the app from warm cache.

`UX-CORE-003` Primis MUST make scores explainable through component breakdowns and metric drilldowns.

`UX-CORE-004` Primis MUST make customization useful, not decorative. Users should customize home layout, theme accents, coaching tone, summary tone, and preferred metrics.

`UX-CORE-005` Primis MUST use AI as an integrated analyst/coach, not as the whole product.

`UX-CORE-006` Primis MUST avoid fake precision. When data is missing, stale, or low-confidence, UI must communicate it cleanly.

`UX-CORE-007` Primis MUST maintain a strong information hierarchy on every screen: primary score/state, explanation, supporting metrics, deeper drilldown.

---

## 3. Product Experience Pillars

### 3.1 Fast

The user should feel that Primis is instant and alive.

Requirements:

- Home screen should render from local cache immediately.
- Navigation transitions should feel native and fluid.
- Core score cards must not wait on live AI calls.
- Charts should render from precomputed chart-ready data.
- Sync state should be visible but not blocking.
- AI chat may stream; non-chat screens should use cached summaries or async refresh.

### 3.2 Premium

Premium does not mean over-designed. It means coherent, intentional, polished, restrained, and highly usable.

Requirements:

- Strong typographic hierarchy.
- Consistent spacing.
- Limited accent colors.
- Clear card hierarchy.
- Meaningful motion.
- No random gradients.
- No inconsistent shadows/radii.
- No generic icon soup.
- No cluttered dashboard pages.

### 3.3 Performance-oriented

The app should speak to athletic performance and recovery.

Requirements:

- Use terms like Recovery, Readiness, Strain, Sleep Debt, Training Load, Activity Balance, Fuel, Hydration, and Bedtime Window.
- Explain whether the user is ready for higher intensity, should moderate effort, or should prioritize recovery.
- Keep recommendations performance-focused, not medical.

### 3.4 Explainable

Users should understand why Primis thinks something.

Requirements:

- Score cards must show component contribution on drilldown.
- AI summaries must reference actual signals.
- “Why this?” must be available for major recommendations.
- Trend cards should separate correlation from causation.

### 3.5 Customizable

Customization is a core differentiator.

Requirements:

- Home widgets can be shown/hidden/reordered.
- User can choose dark/light mode and accent colors.
- User can choose coach tone and summary tone separately.
- User can rank goals during onboarding.
- User can choose preferred widgets/metrics.

### 3.6 Trustworthy

Health data demands restraint.

Requirements:

- No diagnosis language.
- No fear-based language.
- No hidden data-source ambiguity.
- No AI claims without data support.
- Clear empty states for missing permissions/data.
- Clear privacy controls in settings.

---

## 4. Brand and Visual Direction

### 4.1 Brand personality

Primis should feel:

- Modern
- Athletic
- Intelligent
- Premium
- Data-literate
- Calm under pressure
- Slightly futuristic
- Highly competent

Primis should not feel:

- Medical/hospital-like
- Generic wellness/pastel
- Crypto/neon gimmick
- Bro-science
- Overly playful
- Corporate enterprise
- Chatbot-first
- Dashboard template-like

### 4.2 Visual keywords

Use these as design anchors:

```text
performance dashboard
premium dark mode
structured intelligence
clean analytics
calm intensity
motion with purpose
high signal-to-noise
```

### 4.3 Naming and terminology

Product name: **Primis**

Potential tagline directions:

```text
Own your baseline.
Your performance health OS.
Health data, made useful.
Train, recover, and sleep with context.
A smarter command center for your body.
```

Do not lock a tagline until product visuals exist.

---

## 5. Information Architecture

### 5.1 Primary navigation

Initial bottom tabs SHOULD be:

```text
Home
Sleep
Recovery
Activity
Nutrition
AI Coach
```

Rationale:

- Home is daily command center.
- Sleep is one of Primis's most important value surfaces.
- Recovery is core performance framing.
- Activity covers steps, workouts, calories, training load, strain.
- Nutrition covers food/macros/water/caffeine/alcohol/manual inputs.
- AI Coach provides chat and deeper exploratory analysis.

### 5.2 Secondary areas

Secondary screens live under tabs or Settings:

```text
Vitals
Body Composition
Bedtime Planner
Manual Check-In
Trends
Connections
Provider Sync Status
Theme Settings
Coach/Summary Tone Settings
Privacy/Data Controls
Account/Auth
```

### 5.3 Navigation principles

`UX-NAV-001` Bottom tabs MUST remain stable after onboarding.

`UX-NAV-002` Home customization MUST not rearrange bottom tabs in v1. Users can customize Home widgets first.

`UX-NAV-003` Deep metric screens MUST have predictable back behavior.

`UX-NAV-004` Important summary cards SHOULD link to detail pages.

`UX-NAV-005` AI Coach MUST be accessible from the bottom tab and from contextual “Ask AI about this” entry points.

`UX-NAV-006` Settings should not become a dumping ground. Use grouped sections: Account, Health Connections, Data & Privacy, Appearance, AI Preferences, Notifications, Developer/Diagnostics.

---

## 6. Core Screens

### 6.1 Home

#### 6.1.1 Purpose

Home answers:

1. How am I doing today?
2. Why?
3. What should I do next?
4. What goals are on/off track?
5. What changed from my baseline?

#### 6.1.2 Default v1 Home widgets

Default order:

1. Recovery Score
2. Sleep Score
3. Sleep Debt
4. Steps / Activity progress
5. Calories Burned
6. Training Readiness
7. HRV Trend
8. Today’s Recommendation

Optional widgets:

- Wellbeing Score
- Bedtime Tonight
- Hydration
- Caffeine Timing
- Nutrition Summary
- Body Composition
- Last Workout
- Weekly Load
- Stress/Subjective Check-In
- Gut/Digestion Trend
- Provider Sync Status

#### 6.1.3 Home layout

Recommended structure:

```text
[Top App Bar]
  Primis / date / sync indicator / profile

[Hero State Card]
  Recovery / Readiness primary state
  short explanation
  CTA: View details

[Progress Row]
  Steps / Calories / Sleep Debt / Hydration compact indicators

[Recommendation Card]
  Today's guidance: train hard / moderate / recover / sleep focus

[Custom Widget Stack]
  User-selected cards
```

#### 6.1.4 Home acceptance criteria

`UX-HOME-001` Home MUST render useful cached content without requiring a fresh sync.

`UX-HOME-002` Home MUST display a clear stale-data state if the latest provider data is old.

`UX-HOME-003` The primary hero card MUST include one clear status and one clear reason.

`UX-HOME-004` Home widgets MUST be reorderable/hideable by v1 or v1.1.

`UX-HOME-005` No Home widget should require live AI generation before displaying.

---

### 6.2 Sleep

#### 6.2.1 Purpose

Sleep explains sleep quality, duration, debt, timing, stages, and recovery contribution.

#### 6.2.2 Required content

- Sleep Score
- Total sleep
- Time in bed
- Sleep efficiency
- Sleep debt
- Sleep consistency
- Bedtime/wake-time regularity
- Deep sleep
- REM sleep
- Awake time
- HRV during sleep if available
- Resting HR during sleep if available
- Respiratory rate if available
- SpO2 if available
- Bedtime Planner entry point
- AI sleep summary

#### 6.2.3 Screen structure

```text
[Sleep Score Hero]
  Score, status, sleep duration, short reason

[Sleep Timeline]
  stages over night

[Sleep Debt + Consistency]
  debt, trend, schedule stability

[Bedtime Planner Card]
  next suggested bedtime window

[Contributors]
  duration, efficiency, deep, REM, HRV/RHR, respiratory/SpO2

[AI Summary]
  concise explanation and optional deeper analysis
```

#### 6.2.4 Sleep UX rules

`UX-SLEEP-001` Sleep stage charts MUST be readable at a glance; do not use tiny illegible segments without a legend.

`UX-SLEEP-002` Sleep score detail MUST show component contributions.

`UX-SLEEP-003` Sleep debt MUST explain how it is estimated and avoid false precision.

`UX-SLEEP-004` Bedtime Planner MUST be visible from Sleep.

---

### 6.3 Bedtime Planner

#### 6.3.1 Purpose

Bedtime Planner recommends optimal bedtime windows for a user-specified wake-up time using sleep latency, sleep cycles, sleep debt, circadian consistency, recovery need, and historical patterns.

#### 6.3.2 User flow

```text
Open Sleep -> Bedtime Planner
Set wake-up time
Optionally set next-day context:
  - strict alarm vs flexible
  - training tomorrow
  - desired sleep duration
  - priority: wake easier / max recovery / reasonable bedtime
View ranked bedtime windows
Tap a window for explanation
Optionally save reminder
```

#### 6.3.3 Output model

Output SHOULD be ranked windows, not one exact time:

```text
Best: 10:18–10:38 PM
Good: 10:48–11:08 PM
Last acceptable: 11:18–11:38 PM
```

Each result includes:

- estimated time asleep
- expected sleep opportunity
- cycle alignment heuristic
- sleep latency adjustment
- sleep debt impact
- circadian consistency note
- confidence level

#### 6.3.4 UX rules

`UX-BED-001` Bedtime Planner MUST say “window,” not pretend exact precision.

`UX-BED-002` Bedtime Planner MUST show the wake-up time prominently.

`UX-BED-003` Bedtime Planner MUST explain if the ideal bedtime conflicts with the user’s recent circadian rhythm.

`UX-BED-004` Bedtime Planner SHOULD allow quick presets: tomorrow wake time, workday, weekend, early workout.

`UX-BED-005` AI may explain bedtime windows, but deterministic algorithm output is the source of truth.

---

### 6.4 Recovery

#### 6.4.1 Purpose

Recovery explains whether the user appears prepared for physical/mental strain today.

#### 6.4.2 Required content

- Recovery Score
- Training Readiness
- HRV vs baseline
- Resting HR vs baseline
- Sleep contribution
- Sleep debt contribution
- Respiratory/SpO2 status where available
- Recent training load
- Subjective input adjustment
- Recommended intensity

#### 6.4.3 Screen structure

```text
[Recovery Hero]
  Score, zone, recommendation

[Contributors]
  HRV, RHR, sleep, debt, respiratory, SpO2, training load, subjective check-in

[Today Guidance]
  Train hard / moderate / deload / recovery focus

[Trends]
  7/14/30-day recovery and HRV/RHR

[AI Explanation]
  analyst + coach wording based on user tone
```

#### 6.4.4 UX rules

`UX-REC-001` Recovery recommendations MUST be moderate and performance-only.

`UX-REC-002` UI may say “you appear ready for higher intensity,” but should avoid absolute “you should max out” language.

`UX-REC-003` Low recovery should not fearmonger. Use “prioritize recovery” language.

---

### 6.5 Activity

#### 6.5.1 Purpose

Activity shows movement, workouts, calories, strain, and training load.

#### 6.5.2 Required content

- Steps
- Active calories
- Resting calories
- Total calories burned
- Floors
- Distance
- Workouts
- Zone minutes
- Training load
- Strain estimate
- Weekly load
- 7-day vs 28-day comparison

#### 6.5.3 Screen structure

```text
[Activity Hero]
  daily activity state / progress

[Goal Progress]
  steps, calories, zone minutes, floors

[Workout Cards]
  recent workouts with summary and AI workout explanation

[Training Load]
  7-day vs 28-day trend

[Strain / Load Detail]
  intensity, duration, zones
```

#### 6.5.4 UX rules

`UX-ACT-001` Activity should not require Primis to record workouts in v1. It primarily analyzes provider-recorded workouts.

`UX-ACT-002` Training load visuals must show whether current load is below, steady, above, or well above baseline.

`UX-ACT-003` Calories should distinguish active, resting, and total where available.

---

### 6.6 Nutrition

#### 6.6.1 Purpose

Nutrition starts lightweight, then expands. It should support performance coaching without becoming a full MyFitnessPal clone in v1.

#### 6.6.2 v1 content

- Calories in
- Protein
- Carbs
- Fat
- Water
- Caffeine amount and latest time
- Alcohol amount and type/range
- Custom tags
- Meal timing
- Optional notes

#### 6.6.3 v1.5+ content

- FoodData Central search
- Saved foods
- User foods
- Saved meals
- AI meal estimate
- Barcode/photo/label scanning later

#### 6.6.4 Screen structure

```text
[Nutrition Hero]
  calories / protein / hydration state

[Quick Add]
  water, caffeine, alcohol, macros, meal, tag

[Macro Progress]
  calories, protein, carbs, fat

[Behavior Inputs]
  caffeine, alcohol, meal timing, custom tags

[Correlations]
  impact on sleep/recovery/readiness over time
```

#### 6.6.5 UX rules

`UX-NUT-001` Nutrition v1 MUST be fast. A user should log water/caffeine/alcohol within seconds.

`UX-NUT-002` User-created foods MUST not be visually mixed with verified global foods without labeling.

`UX-NUT-003` Photo/AI food estimates MUST be labeled as estimates.

`UX-NUT-004` Nutrition coaching MAY reflect user-selected philosophy/preferences, but must not hardcode one ideology for all users unless explicitly configured.

---

### 6.7 AI Coach

#### 6.7.1 Purpose

AI Coach lets the user ask natural-language questions about their health data, training, sleep, nutrition, recovery, and trends.

#### 6.7.2 AI Coach roles

- Analyst when explaining data.
- Coach when giving practical next steps.
- Safety-aware assistant when health questions approach medical territory.

#### 6.7.3 Screen structure

```text
[Chat Header]
  AI Coach / data freshness / model state

[Suggested Prompts]
  Should I lift today?
  Why is recovery down?
  What hurt my sleep?
  What bedtime should I use tomorrow?
  How has caffeine affected my sleep?

[Conversation]
  streaming responses
  evidence chips
  follow-up questions

[Context Controls]
  optional: include sleep / activity / nutrition / last 30 days
```

#### 6.7.4 UX rules

`UX-AI-001` AI Coach MUST not be the default first screen.

`UX-AI-002` AI answers SHOULD include evidence chips or a “Based on” section for health-data claims.

`UX-AI-003` AI must ask concise follow-up questions when data is missing and the answer would materially improve.

`UX-AI-004` AI chat must support streaming.

`UX-AI-005` AI-generated summaries inside Sleep/Recovery/Activity/Nutrition should be short by default with expandable detail.

---

### 6.8 Vitals and Body Composition

#### 6.8.1 Purpose

Vitals and body composition provide deeper analytics for users who want raw data and trends.

#### 6.8.2 Required content

Vitals:

- Resting HR
- HRV
- Heart rate trends
- SpO2
- Respiratory rate
- VO2 max
- Sleep temperature variation if available

Body composition:

- Weight
- Body fat percentage
- Lean mass where available
- Muscle mass where available
- Visceral fat if available through provider/local source
- Trend and rate of change

#### 6.8.3 UX rules

`UX-VITAL-001` Vitals should be more analytical than coachy.

`UX-VITAL-002` Body composition should emphasize trends, not daily noise.

`UX-VITAL-003` Smart-scale data source should be clear, especially if coming through Apple Health/HealthKit.

---

## 7. Onboarding UX

### 7.1 Onboarding goals

Onboarding must accomplish:

1. Create account.
2. Explain Primis value.
3. Connect Google account / Google Health data.
4. Request health data permissions.
5. Select goals and rank them.
6. Select coach tone and summary tone.
7. Select theme/accent preference.
8. Set initial targets: sleep target, steps, calories/protein optional, wake time optional.
9. Explain data freshness and provider sync limitations.
10. Land on first useful dashboard or “building baseline” state.

### 7.2 Onboarding sequence

Recommended:

```text
1. Welcome / value proposition
2. Account creation/sign-in
3. Health connections
4. Permission explanation
5. Goals + ranking
6. Personal preferences
7. Theme/accent
8. Initial dashboard setup
9. Sync/baseline building state
10. Home
```

### 7.3 Permission UX

`UX-ONB-001` Permission screens MUST explain why each data category is requested.

`UX-ONB-002` Do not request every future integration permission before needed. Google Health first; HealthKit when iOS local integrations are implemented.

`UX-ONB-003` If data is missing, explain the likely reason and how to fix it.

`UX-ONB-004` Google login and Google Health data permission MUST be explained as separate concepts.

### 7.4 Building baseline state

Early users will not have full baseline confidence immediately.

UI should say:

```text
Primis is building your baseline.
Your scores are provisional until enough recent data is available.
```

Do not show blank screens.

---

## 8. Theme System

### 8.1 Theme requirements

`UX-THEME-001` Primis MUST support dark and light themes.

`UX-THEME-002` Dark theme SHOULD be the default visual identity.

`UX-THEME-003` Users MAY choose accent color(s).

`UX-THEME-004` Accent colors MUST pass contrast requirements against the surfaces they appear on.

`UX-THEME-005` Theme must be token-driven, not hardcoded.

### 8.2 Theme modes

#### Dark Performance

Primary mode. Intended feel:

- deep background
- elevated cards
- restrained glow
- high-contrast text
- vivid but controlled accent
- premium athletic dashboard

#### Light Precision

Secondary mode. Intended feel:

- off-white/soft-neutral background
- clean cards
- precise typography
- muted accents
- high readability

### 8.3 Accent colors

Initial accent presets:

```text
Electric Blue
Signal Green
Violet
Amber
Crimson
Monochrome
```

Usage rules:

- Accent color is for emphasis, selected metrics, CTAs, active tabs, and data highlights.
- Do not recolor every component with accent color.
- Score statuses should use semantic status tokens, not only user accent color.

### 8.4 Semantic status colors

Semantic colors:

```text
Excellent / Ready
Good / Stable
Caution / Moderate
Low / Recover
Critical / Attention
Neutral / Unknown
```

Rules:

`UX-COLOR-001` Status must never rely on color alone. Always include text/icon/label.

`UX-COLOR-002` Avoid red-heavy medical panic language. Low recovery is not a medical emergency.

`UX-COLOR-003` Use semantic color consistently across scores, charts, and AI evidence chips.

### 8.5 Token examples

Design tokens should be implemented as TypeScript objects.

```ts
export const colors = {
  dark: {
    bg: '#07090D',
    surface: '#10141B',
    surfaceElevated: '#171D26',
    textPrimary: '#F4F7FB',
    textSecondary: '#AAB4C2',
    textMuted: '#6F7A89',
    borderSubtle: 'rgba(255,255,255,0.08)',
    overlay: 'rgba(0,0,0,0.48)',
  },
  status: {
    excellent: 'TOKEN_VALUE',
    good: 'TOKEN_VALUE',
    caution: 'TOKEN_VALUE',
    low: 'TOKEN_VALUE',
    attention: 'TOKEN_VALUE',
    neutral: 'TOKEN_VALUE',
  },
};
```

Actual final values should be decided in design implementation/testing, but all code must reference tokens, not literal colors inside components.

---

## 9. Typography

### 9.1 Typography principles

- Health dashboards need dense but readable typography.
- Numbers must be highly legible.
- Labels should be concise.
- Explanations should be scannable.
- Data cards should not use tiny inaccessible text.

### 9.2 Font strategy

Default recommendation:

- Use system fonts first for performance and platform-native feel.
- iOS: SF Pro via system.
- Android: Roboto via system.
- Consider custom font later only if brand identity requires it.

Do not import heavy custom font families early unless there is a strong design reason.

### 9.3 Type scale

Recommended semantic scale:

```text
DisplayLarge    40/46   hero scores, rare
DisplayMedium   34/40   screen hero values
TitleLarge      28/34   main screen titles
TitleMedium     22/28   section titles
TitleSmall      18/24   card titles
BodyLarge       16/24   primary body
BodyMedium      14/20   secondary body
BodySmall       13/18   compact labels
Caption         12/16   metadata, timestamps
Micro           11/14   rarely; avoid for important data
```

### 9.4 Numeric typography

`UX-TYPE-001` Large score numbers SHOULD use tabular numerals if available.

`UX-TYPE-002` Units must be visually secondary but not hidden.

`UX-TYPE-003` Score values should use strong hierarchy; component labels should be readable but not compete.

Example:

```text
Recovery
82
Ready for moderate-high intensity
```

### 9.5 Dynamic type

`UX-TYPE-004` Components MUST tolerate larger text settings without clipping important content.

`UX-TYPE-005` Nonessential decoration may collapse/hide at large text sizes, but primary values and labels must remain accessible.

---

## 10. Spacing, Layout, Shape, and Elevation

### 10.1 Spacing system

Use a 4-point base grid.

```text
2  = hairline gap / rare
4  = compact inner gap
8  = standard small gap
12 = compact card gap
16 = standard page/card padding
20 = large card padding
24 = section gap
32 = major section gap
40 = page group gap
48 = large hero gap
```

Rules:

`UX-SPACING-001` Page horizontal padding SHOULD be 16–20px depending on screen width.

`UX-SPACING-002` Card internal padding SHOULD usually be 16 or 20.

`UX-SPACING-003` Related content must be visually grouped through spacing before borders/shadows.

`UX-SPACING-004` Avoid cramped dashboard cards. Dense does not mean compressed.

### 10.2 Radius system

```text
xs: 6
sm: 10
md: 14
lg: 18
xl: 24
pill: 999
```

Recommended:

- Small chips: `pill`
- Buttons: `md` or `pill`
- Cards: `lg` or `xl`
- Bottom sheets: `xl` top corners

### 10.3 Elevation

Use subtle elevation, especially in dark mode.

Rules:

`UX-ELEV-001` Do not stack multiple heavy shadows.

`UX-ELEV-002` Prefer border + surface contrast over dramatic shadows.

`UX-ELEV-003` Use glow effects sparingly for active/hero states only.

### 10.4 Layout breakpoints

Mobile first:

```text
Compact phones: 320–374pt width
Standard phones: 375–429pt width
Large phones: 430pt+
Tablet/foldable: future
```

React Native components must not assume a single iPhone size.

---

## 11. Component System

### 11.1 Component hierarchy

Implement components in layers:

```text
primitives/
  Box, Text, Stack, Row, Spacer, Divider, Pressable, Icon

tokens/
  colors, spacing, radius, typography, shadows, motion

components/
  Button, Card, Chip, Badge, ProgressRing, MetricTile, ScoreCard, ChartCard

features/
  HomeRecoveryHero, SleepTimeline, BedtimeWindowCard, WorkoutSummaryCard

screens/
  HomeScreen, SleepScreen, RecoveryScreen, ActivityScreen, NutritionScreen, AiCoachScreen
```

`UX-COMP-001` Feature components may compose base components, but base components must not import feature/domain logic.

### 11.2 Buttons

Button variants:

```text
Primary
Secondary
Tertiary
Ghost
Destructive
Icon
Pill
```

Button rules:

`UX-BTN-001` Minimum practical touch target should be 44x44pt/dp or larger.

`UX-BTN-002` Button labels must be action-oriented.

`UX-BTN-003` Destructive actions require clear confirmation if they affect data.

`UX-BTN-004` Disabled state must explain why when context is not obvious.

### 11.3 Cards

Card types:

```text
HeroCard
ScoreCard
MetricCard
InsightCard
RecommendationCard
ChartCard
InputCard
ConnectionCard
AiSummaryCard
BedtimeWindowCard
```

Card rules:

`UX-CARD-001` Every card must have a clear purpose: status, trend, action, explanation, or input.

`UX-CARD-002` Cards should not contain more than one primary idea.

`UX-CARD-003` A card with a score must support drilldown or explanation.

`UX-CARD-004` Avoid nesting cards inside cards unless visually necessary.

### 11.4 ScoreCard

Required anatomy:

```text
Label
Score/value
Status label
One-line reason
Trend indicator
Optional CTA / drilldown
```

Example:

```text
Recovery
78
Good
HRV is slightly below baseline, but sleep duration was strong.
```

Score zones:

```text
85–100 Excellent
70–84 Good
50–69 Moderate
0–49 Low
Provisional / Unknown
```

Do not use score zones blindly if the Scoring & Algorithms Spec defines a more specific range for a given score.

### 11.5 Progress indicators

Primis may use original progress rings/bars. Do not copy Apple Activity Rings.

Progress components:

```text
ProgressRing
ProgressArc
ProgressBar
StackedProgressBar
GoalPill
MiniSparkline
```

Rules:

`UX-PROG-001` Progress rings must be visually distinct from Apple Activity Rings.

`UX-PROG-002` Progress rings must include labels/values, not color-only meaning.

`UX-PROG-003` Use rings for a small number of daily goals. Use bars for detailed or comparative values.

### 11.6 MetricTile

Used for quick data:

```text
Steps
8,421
72% of goal
```

Rules:

`UX-METRIC-001` Metric tiles should support tap-to-detail.

`UX-METRIC-002` Units and time ranges must be clear.

`UX-METRIC-003` Metric tiles should not show more than 2 secondary values.

### 11.7 InsightCard

Used for deterministic insights and AI summaries.

Anatomy:

```text
Insight title
Short explanation
Evidence chips
Confidence / data sufficiency where useful
CTA: View trend / Ask AI
```

Example:

```text
Late caffeine may be affecting sleep
On tagged days with caffeine after 2 PM, your sleep score averaged 7 points lower. Data is still limited.
```

Rules:

`UX-INSIGHT-001` Correlation cards must avoid causal language unless causality is established.

`UX-INSIGHT-002` Use “may,” “appears,” “correlates,” and “not enough data yet” appropriately.

### 11.8 Charts

Chart components:

```text
LineChart
AreaChart
BarChart
StackedBarChart
SleepStageTimeline
ZoneChart
CorrelationChart
DistributionChart
Sparkline
```

Chart rules are detailed in Section 13.

### 11.9 Bottom sheets

Use bottom sheets for:

- quick add
- widget edit
- metric explanation
- score contributor drilldown
- date/time picker
- coach tone selection
- summary style selection

Rules:

`UX-SHEET-001` Bottom sheets must have clear drag handles.

`UX-SHEET-002` Sheet height should fit task complexity.

`UX-SHEET-003` Destructive actions should not be hidden in dense sheets.

### 11.10 Empty states

Empty states must be useful.

Examples:

```text
No HRV data yet
Primis needs at least 3 nights of HRV data to estimate your baseline.

Connect Google Health
Primis uses your Google/Fitbit data to build recovery, sleep, and activity insights.
```

Rules:

`UX-EMPTY-001` Empty state must explain what is missing.

`UX-EMPTY-002` Empty state must offer the next best action when possible.

`UX-EMPTY-003` Do not use fake placeholder metrics after onboarding.

---

## 12. Motion and Animation System

### 12.1 Motion philosophy

Motion should make Primis feel responsive, premium, and spatially coherent. It must not feel like random animation added by an AI coding agent.

Motion is used to:

- communicate hierarchy
- show state changes
- connect navigation transitions
- provide tactile feedback
- make loading/sync feel calm
- highlight meaningful progress

Motion is not used to:

- distract from data
- hide slow performance
- make every card bounce
- animate charts excessively
- create novelty at the expense of clarity

### 12.2 Motion primitives

Motion tokens:

```text
instant: 80ms
fast: 140ms
standard: 220ms
expressive: 320ms
slow: 450ms
```

Recommended easing:

```text
standard: ease-out / platform-native
enter: decelerated
exit: accelerated
emphasis: spring with low overshoot
```

In React Native, use Reanimated for UI-thread animations where possible.

### 12.3 Screen transitions

Rules:

`UX-MOTION-001` Tab switches should be fast and subtle.

`UX-MOTION-002` Detail pages may use shared-element-like transitions later, but not required for v1.

`UX-MOTION-003` Hero score changes should animate numeric changes subtly, not with casino-style rolling.

`UX-MOTION-004` Pull-to-refresh/sync should be calm and branded, not default-looking if easy to customize.

`UX-MOTION-005` Reduced motion setting must be respected.

### 12.4 Microinteractions

Recommended:

- Card press scale: 0.98–0.99, very subtle.
- Button press opacity/scale feedback.
- Goal progress fill animation on first render only.
- Chart focus point animation on drag.
- Bottom sheet snap transitions.
- Widget reorder haptics.

Avoid:

- bouncing every card
- aggressive parallax
- long entrance cascades
- excessive skeleton shimmer
- endless pulsing status indicators

### 12.5 Loading states

Loading states:

```text
Cached content + small refresh indicator = preferred
Skeleton = acceptable for first load
Spinner = last resort
Full-screen blocking loader = avoid except auth/permission transitions
```

`UX-LOAD-001` Home should never be a blank spinner if cached data exists.

`UX-LOAD-002` AI summaries can show “updating insight” but must not block metric display.

`UX-LOAD-003` Sync progress should be visible in Connections/Settings and summarized subtly on Home.

---

## 13. Data Visualization

### 13.1 Chart philosophy

Charts should answer a question, not just display data.

Every chart should clarify:

1. What metric?
2. What time range?
3. What is normal for this user?
4. Is this good, bad, stable, or unknown?
5. What should the user do with it?

### 13.2 Chart types by use case

| Use case | Preferred chart |
|---|---|
| HRV/RHR trend | line chart with baseline band |
| Sleep stages | horizontal timeline |
| Sleep duration/debt | bar or area chart |
| Recovery history | line or bar with status zones |
| Training load | 7-day vs 28-day line/area |
| Steps/calories | bar + goal marker |
| Macro tracking | stacked progress or bars |
| Body composition | trend line + smoothing |
| Caffeine/alcohol correlation | grouped comparison / scatter later |
| Bedtime windows | ranked cards + timeline visualization |

### 13.3 Chart rules

`UX-CHART-001` Charts must be readable in dark and light mode.

`UX-CHART-002` Do not overload Home with complex charts. Use sparklines or compact trends.

`UX-CHART-003` Every chart must display units and time range.

`UX-CHART-004` Use baseline bands where useful.

`UX-CHART-005` Color must not be the only indicator.

`UX-CHART-006` Avoid fake precision by showing smoothed trends where daily values are noisy.

`UX-CHART-007` Missing data should be represented honestly, not interpolated silently.

`UX-CHART-008` Chart interactions should be touch-friendly: drag to inspect, tap to focus, long-press optional.

### 13.4 Health-chart labeling

Good labels:

```text
30-day baseline
Below your usual range
7-day average
Last synced 8:42 AM
Not enough data yet
```

Bad labels:

```text
Abnormal
Danger
Diagnosis risk
Guaranteed impact
```

---

## 14. Customization UX

### 14.1 Customizable Home

Users should be able to:

- show/hide widgets
- reorder widgets
- choose primary hero card later
- choose compact vs detailed card display later

v1 minimum:

```text
Edit Home -> list of widgets -> toggle visibility -> drag reorder -> save
```

### 14.2 Appearance customization

Users should be able to choose:

- dark/light/system
- accent color
- possibly secondary accent later

### 14.3 AI tone customization

Separate settings:

```text
Coach tone
Summary tone
```

Coach tone options:

```text
Analyst
Strict
Encouraging
Performance Coach
Concise
Explanatory
Unhinged-lite
Calm
```

Summary tone options:

```text
Concise
Detailed
Data-heavy
Plain English
Action-only
```

Rules:

`UX-TONE-001` Tone affects language only, not deterministic recommendations.

`UX-TONE-002` “Unhinged-lite” must remain safe and non-abusive. It may be blunt/funny, but not harmful or medically irresponsible.

`UX-TONE-003` Tone previews should show the same recommendation in different styles.

---

## 15. Manual Input UX

### 15.1 Input philosophy

Manual inputs should be quick, optional, and genuinely useful. They enrich correlations and AI context but should not dominate objective health scores.

### 15.2 Quick check-in

Recommended fields:

```text
Energy: 1–5
Mood: 1–5
Stress: 1–5
Soreness: none / mild / moderate / high
Hydration: amount
Caffeine: amount + latest time
Alcohol: none / 1 / 2 / 3–4 / 5+ + type
Digestion: optional
Poop: optional
Custom tags: optional
Notes: optional
```

### 15.3 Poop/digestion input

Optional structured fields:

```text
Bristol type: 1–7
Color
Smell
Urgency
Pain
Bloating
Frequency
Notes
```

UX rules:

`UX-INPUT-001` Optional fields should not slow down fast logging.

`UX-INPUT-002` Digestion tracking should feel mature and clinical, not childish.

`UX-INPUT-003` Digestive insights must avoid medical diagnosis.

`UX-INPUT-004` Custom tags should be searchable and reusable.

---

## 16. Content Design and Voice

### 16.1 Default voice

Primis should communicate like a sharp analyst and practical coach.

Default qualities:

- concise
- direct
- evidence-based
- performance-oriented
- non-medical
- calm
- not overly motivational
- not childish

### 16.2 Analyst vs coach

Analyst mode:

```text
Your HRV is 12% below your 30-day baseline and resting HR is 4 bpm above usual. Sleep duration was adequate, so the recovery drop is more likely tied to strain or stress than short sleep.
```

Coach mode:

```text
You can train today, but keep the intensity controlled. This is a better day for zone 2, technique, mobility, or a moderate lift than a max-effort session.
```

### 16.3 Content rules

`UX-CONTENT-001` Avoid medical claims unless framed as general wellness and not diagnosis.

`UX-CONTENT-002` Prefer “appears,” “suggests,” “may,” and “correlates” when uncertainty exists.

`UX-CONTENT-003` Do not over-explain on cards. Use expandable detail.

`UX-CONTENT-004` Use exact values when helpful, but avoid false precision.

`UX-CONTENT-005` Every recommendation should have a reason available.

### 16.4 Recommendation wording examples

Good:

```text
Your recovery is moderate today. HRV is below baseline and sleep debt is elevated, so moderate training is the better play.
```

Bad:

```text
Your body is in danger. Do not train.
```

Good:

```text
Caffeine after 2 PM correlates with lower sleep scores in your recent logs. The sample size is still small, but it is worth testing.
```

Bad:

```text
Caffeine is ruining your sleep.
```

---

## 17. Accessibility

### 17.1 Accessibility requirements

`UX-A11Y-001` Interactive controls SHOULD use a practical minimum touch target of 44x44pt/dp. WCAG 2.2 minimum target-size rules should also be respected.

`UX-A11Y-002` Text and important UI controls MUST meet contrast requirements.

`UX-A11Y-003` Status must not be communicated through color alone.

`UX-A11Y-004` Reduced motion must be respected.

`UX-A11Y-005` Screen reader labels must be provided for score cards, charts, controls, and health values.

`UX-A11Y-006` Charts must have accessible summaries.

`UX-A11Y-007` Dynamic type must not break core flows.

`UX-A11Y-008` Haptic feedback must not be required to understand state.

### 17.2 Screen reader examples

Score card label:

```text
Recovery score 78, good. HRV is slightly below baseline, but sleep duration was strong. Double tap to view recovery details.
```

Chart summary:

```text
HRV trend, last 30 days. Current value 61 milliseconds. Thirty-day baseline 68 milliseconds. Current value is below baseline.
```

### 17.3 Reduced motion behavior

If reduced motion is enabled:

- disable large entrance animations
- reduce progress-ring animation
- keep simple opacity/position changes only
- avoid parallax
- keep screen transitions standard/native

---

## 18. React Native Implementation Guidance

### 18.1 Technology assumptions

Primis mobile stack:

```text
React Native
Expo Dev Client
TypeScript
React Navigation or Expo Router
Reanimated
Gesture Handler
React Native Skia
TanStack Query
Zustand or Jotai
MMKV
SQLite/local DB
FlashList where large lists exist
```

### 18.2 Component implementation rules

`UX-RN-001` All colors, spacing, typography, radius, shadows, and motion values must come from tokens.

`UX-RN-002` Feature screens must not directly define raw style literals except rare layout exceptions.

`UX-RN-003` Heavy analytics must not run inside React render.

`UX-RN-004` Chart data must be precomputed or memoized.

`UX-RN-005` Avoid deeply nested list items.

`UX-RN-006` Use memoization for repeated cards/list items.

`UX-RN-007` Use FlashList/FlatList carefully for long timelines/history lists.

`UX-RN-008` Use Reanimated for high-frequency animations.

`UX-RN-009` Avoid passing large objects through navigation params.

`UX-RN-010` Screens should load from local cache first and refresh asynchronously.

### 18.3 Suggested folder structure

```text
src/
  app/
    navigation/
    providers/
  design-system/
    tokens/
    primitives/
    components/
    motion/
    charts/
  features/
    home/
    sleep/
    recovery/
    activity/
    nutrition/
    ai-coach/
    onboarding/
    settings/
  data/
    api/
    queries/
    local-cache/
    models/
  utils/
  testing/
```

### 18.4 Design token example

```ts
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const motion = {
  instant: 80,
  fast: 140,
  standard: 220,
  expressive: 320,
  slow: 450,
} as const;
```

### 18.5 Performance budgets

Target budgets:

```text
Warm app Home render: < 1 second perceived
Home cached content visible: immediate/skeleton-free when available
Tab switch: < 250ms perceived
Card press feedback: < 100ms
AI chat first token: ideally < 2 seconds, stream thereafter
Chart interaction: smooth 60fps target
```

These are UX targets, not guaranteed infrastructure SLAs.

### 18.6 Performance anti-patterns

MUST NOT:

- compute scores on the device during render
- generate AI summary before showing metrics
- fetch raw provider history on screen open
- load giant chart datasets into UI unnecessarily
- render all history rows at once
- use heavy shadows/blur on many cards
- animate layout-heavy properties repeatedly
- place complex charts in large virtualized lists without testing

---

## 19. Quality Bar: Avoiding “AI Slop”

### 19.1 Definition

“AI slop” means the product feels like it was generated from generic prompts without taste, hierarchy, consistency, or real user understanding.

### 19.2 AI slop indicators

Primis must avoid:

- generic purple-blue gradients everywhere
- meaningless glassmorphism
- inconsistent card radii
- random shadows
- fake dashboards with no hierarchy
- too many metrics per card
- AI chatbot consuming the entire product
- verbose summaries on every screen
- emoji-heavy coaching
- overused icons without labels
- random animation because it looks “advanced”
- screens that look good in screenshots but feel slow
- inaccessible tiny labels
- copying Apple/WHOOP/Oura visual elements too closely

### 19.3 Quality heuristics

Before shipping any screen, ask:

1. Can the user understand the main state in 3 seconds?
2. Is there one clear primary object on the screen?
3. Are metrics grouped by meaning, not just available data?
4. Does every card have a reason to exist?
5. Is the screen fast from cached data?
6. Does the screen still work with missing data?
7. Does the motion clarify or distract?
8. Would this look embarrassing next to Oura/WHOOP/Apple/Bevel?
9. Can the user drill into explanations?
10. Is this original enough to be Primis?

---

## 20. Screen-Specific Acceptance Criteria

### 20.1 Home

```text
UX-AC-HOME-001: Home renders cached dashboard payload without live provider sync.
UX-AC-HOME-002: Home includes primary hero state, progress metrics, recommendation, and widget stack.
UX-AC-HOME-003: User can access widget customization.
UX-AC-HOME-004: Stale data state is visible but not disruptive.
UX-AC-HOME-005: No more than one major hero element competes for attention.
```

### 20.2 Sleep

```text
UX-AC-SLEEP-001: Sleep Score is shown with explanation and component drilldown.
UX-AC-SLEEP-002: Sleep stages are visualized clearly.
UX-AC-SLEEP-003: Sleep debt and consistency are present.
UX-AC-SLEEP-004: Bedtime Planner entry point is visible.
UX-AC-SLEEP-005: Missing sleep data state explains provider/sync issue.
```

### 20.3 Bedtime Planner

```text
UX-AC-BED-001: User can set target wake time.
UX-AC-BED-002: App returns ranked bedtime windows.
UX-AC-BED-003: Each window explains sleep latency, cycle heuristic, sleep debt, and circadian factors.
UX-AC-BED-004: App avoids exact deterministic claims about sleep cycles.
UX-AC-BED-005: User can optionally save reminder later.
```

### 20.4 Recovery

```text
UX-AC-REC-001: Recovery Score is shown with contributors.
UX-AC-REC-002: Training recommendation is visible.
UX-AC-REC-003: HRV/RHR/sleep/training load contribution can be inspected.
UX-AC-REC-004: Low recovery language is performance-oriented and non-medical.
```

### 20.5 Activity

```text
UX-AC-ACT-001: Steps, calories, workouts, floors/distance where available are shown.
UX-AC-ACT-002: Training load/strain is visible.
UX-AC-ACT-003: Recent workout summary can be opened.
UX-AC-ACT-004: Activity screen distinguishes active/resting/total calories where available.
```

### 20.6 Nutrition

```text
UX-AC-NUT-001: User can quick-log water, caffeine, alcohol, and macros.
UX-AC-NUT-002: Nutrition summary displays calories/protein/carbs/fat/hydration.
UX-AC-NUT-003: Caffeine/alcohol inputs can be used in correlation insights.
UX-AC-NUT-004: FoodData Central search is deferred until v1.5 unless explicitly reprioritized.
```

### 20.7 AI Coach

```text
UX-AC-AI-001: AI Coach supports chat.
UX-AC-AI-002: AI responses stream.
UX-AC-AI-003: AI responses include evidence or source context where appropriate.
UX-AC-AI-004: AI respects coach tone and summary tone.
UX-AC-AI-005: AI does not compute core scores directly.
```

---

## 21. Design QA Checklist

Before a screen is accepted:

```text
[ ] Uses design tokens only
[ ] Works in dark mode
[ ] Works in light mode
[ ] Works with accent color changes
[ ] Handles loading state
[ ] Handles empty state
[ ] Handles stale data state
[ ] Handles missing provider data
[ ] Has correct touch target sizes
[ ] Has screen reader labels for important values
[ ] Does not rely only on color
[ ] Respects reduced motion
[ ] No blocked render on AI call
[ ] No heavy computation in render
[ ] Charts have labels/units/time range
[ ] Score cards have drilldown/explanation
[ ] Copy is concise and performance-safe
[ ] Looks visually coherent with adjacent screens
[ ] Tested on small and large phone sizes
```

---

## 22. Future Design Enhancements

Potential later enhancements:

- Shared element transitions from Home cards to detail pages.
- Advanced custom dashboards.
- Multiple dashboard presets.
- Lock-screen/iOS widgets.
- Apple Watch companion app.
- Android widgets.
- Haptics system refinement.
- More advanced chart interactions.
- Coach character packs.
- Dynamic theme generation.
- Advanced notification design.

Do not build these before the core product feels excellent.

---

## 23. Implementation Priority

Recommended design-system build order:

```text
1. Tokens: color, typography, spacing, radius, motion
2. Primitives: Box, Text, Row, Stack, Pressable
3. Core components: Button, Card, Chip, Badge, MetricTile
4. Score components: ScoreCard, ContributorList, StatusPill
5. Progress components: ProgressRing, ProgressBar, Sparkline
6. Chart primitives: LineChart, BarChart, SleepStageTimeline
7. Navigation shell: tabs, headers, settings groups
8. Home screen
9. Sleep + Bedtime Planner
10. Recovery
11. Activity
12. Nutrition quick log
13. AI Coach
14. Settings/customization
```

This prevents feature screens from creating inconsistent local components.

---

## 24. Open Design Decisions

These are not blockers for implementation planning:

| Decision | Current default | Later action |
|---|---|---|
| Final logo | TBD | Brand exploration |
| Final accent palette | Tokenized placeholders | Test in app context |
| Exact chart library | Skia-based custom charts preferred | Prototype performance |
| Drag-and-drop Home widgets in v1 | Prefer simple reorder first | Implement advanced drag later |
| Haptics depth | Light haptics | Refine after physical testing |
| Custom font | System font first | Revisit after brand direction |
| Wearable companion app | Deferred | Consider after mobile app validates |

---

## 25. Source References

These sources informed the design and implementation rules in this document. Do not treat competitor products as templates to copy.

1. Apple Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines
2. Apple HIG Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility
3. Apple HIG Motion: https://developer.apple.com/design/human-interface-guidelines/motion
4. Apple HIG Activity Rings: https://developer.apple.com/design/human-interface-guidelines/activity-rings
5. Material Design 3: https://m3.material.io/
6. Material Design 3 Typography: https://m3.material.io/styles/typography/overview
7. WCAG 2.2: https://www.w3.org/TR/WCAG22/
8. WCAG 2.5.8 Target Size Minimum: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
9. React Native Optimizing FlatList Configuration: https://reactnative.dev/docs/optimizing-flatlist-configuration
10. Oura Readiness Score: https://ouraring.com/blog/readiness-score/
11. Oura Readiness Score support: https://support.ouraring.com/hc/en-us/articles/360025589793-Readiness-Score
12. WHOOP product positioning: https://www.whoop.com/us/en/how-it-works/
13. WHOOP developer recovery summary: https://developer.whoop.com/docs/whoop-101/
14. Bevel App Store listing: https://apps.apple.com/us/app/bevel-ai-health-coach/id6456176249
15. Bevel website: https://www.bevel.health/
16. Athlytic website: https://www.athlyticapp.com/

---

## 26. Final Implementation Notes for AI Coding Agents

When implementing Primis UI:

1. Start with the design system, not individual screens.
2. Build reusable components before feature screens.
3. Use cached/precomputed data contracts from backend docs.
4. Never block primary UI on AI generation.
5. Never invent local styles outside tokens unless explicitly justified.
6. Use progressive disclosure: summary first, detail on tap.
7. Handle missing data cleanly.
8. Use motion sparingly and intentionally.
9. Test on small iPhone, large iPhone, and Android simulator early.
10. Preserve the product feel: modern, athletic, premium, analytical, fast.

The UI must make Primis feel like a serious product from day one. A rough backend can be improved quietly; a sloppy health dashboard destroys trust immediately.

---

## V1.1 Amendment — Flagship Sleep Visualization and Google-Health-Class Sleep UX

**Status:** Required UI/UX amendment.  
**Reason:** The founder explicitly wants Primis to support advanced sleep diagrams similar in richness to Google Health while remaining original, premium, and not AI-slop/generic chart UI.

### 24.1 Product decision: premium Sleep page is a top UX proof

The Sleep page is one of the primary places where Primis must prove product quality. A basic line chart or simple duration card is not acceptable.

Sleep UX must feel:

```text
premium
calm but performance-oriented
data-rich but not cluttered
fast
visually original
explainable
Google-Health-class or better in richness
```

### 24.2 Required component: `SleepStageTimeline`

Primis MUST implement a dedicated `SleepStageTimeline` component.

```ts
type SleepStageTimelineProps = {
  segments: SleepStageChartSegment[];
  startTimeLabel: string;
  midpointTimeLabel?: string;
  endTimeLabel: string;
  stageSummaries: SleepStageSummary[];
  variant: 'compact' | 'detailed';
  showLegend?: boolean;
  showRestlessnessTrack?: boolean;
  showOutOfBedMarkers?: boolean;
  showHrOverlay?: boolean; // later phase
  onSegmentPress?: (segmentId: string) => void;
  accessibilityLabel?: string;
};
```

Required behavior:

- Use precomputed chart segments from backend/cache.
- Render AWAKE / REM / LIGHT / DEEP as distinct vertical lanes.
- Render ASLEEP / RESTLESS fallback when Google returns classic sleep.
- Show start/end time labels and optional midpoint label.
- Support a compact card version and detailed full-width version.
- Support tap/press inspection for segment details in detailed mode.
- Use design tokens for colors and spacing.
- Do not rely on random chart library defaults.
- Prefer Skia for polished rendering and performance where feasible.
- Respect reduced-motion setting.
- Provide accessible text summary for screen readers.

### 24.3 Sleep-stage visual language

Primis must not copy Google Health's exact styling. It should use original Primis visual language.

Recommended mapping:

| Stage | Visual lane | Token direction |
|---|---|---|
| Awake | top lane | alert/wake accent, not harsh red unless status requires |
| REM | upper-middle lane | cool/light blue-violet |
| Light | middle lane | calm blue |
| Deep | lower lane | deep violet/indigo |
| Asleep classic | middle/deep blended lane | neutral cool |
| Restless classic | separate thin disruption marks | green/amber depending theme |
| Out of bed | vertical marker/overlay | neutral/amber |

Rules:

- Color cannot be the only meaning. Use labels, lane position, and legend.
- Avoid oversaturated neon clutter.
- Avoid tiny illegible bars.
- Avoid generic sparkline-only sleep visualization.

### 24.4 Sleep page required information hierarchy

The Sleep screen MUST use this hierarchy:

```text
1. Sleep Score hero
2. concise explanation / top driver
3. SleepStageTimeline detailed card
4. Key sleep metrics grid
5. Sleep score component breakdown
6. Bedtime Planner card
7. AI Sleep Summary / Ask Coach entry point
8. Trend/detail sections
```

### 24.5 Required Sleep key metrics grid

The Sleep page MUST include metric cards for the following, using missing/provisional states where unavailable:

```text
Sleep schedule
Sleep duration
Sleep efficiency
Minutes to fall asleep
Minutes awake
Minutes after wake-up
REM sleep
Deep sleep
Light sleep
Awake time
Restlessness / restless segments if available
Interruptions / out-of-bed segments if available
HRV
Deep-sleep RMSSD if available
Resting HR / non-REM HR
Respiratory rate
SpO2
Sleep debt
Bedtime consistency
Wake-time consistency
```

### 24.6 Sleep detail states

`SleepStageTimeline` and Sleep screen MUST support:

| State | UI behavior |
|---|---|
| `full_stages` | Show full Awake/REM/Light/Deep timeline. |
| `classic_sleep` | Show Asleep/Restless/Awake fallback with lower confidence label. |
| `summary_only` | Show stage summary cards but no detailed timeline; explain limitation. |
| `session_only` | Show duration/timing only; clear provisional state. |
| `stages_processing` | Show sleep summary and processing message; refresh later. |
| `stages_rejected` | Show fallback and reason if provider gives rejection status. |
| `no_sleep_data` | Explain missing sleep and suggest device sync/check permissions. |

### 24.7 AI sleep summary UX

AI sleep summary should be visually integrated, not a random chatbot card. It should appear as:

```text
[AI Insight Card]
label: Sleep
headline: concise insight
body: 2-4 sentences max by default
evidence chips: duration / efficiency / HRV / stage balance / debt
action: Ask Coach
```

AI summary must never block the Sleep Score hero or SleepStageTimeline from rendering.

### 24.8 Performance requirements

- Sleep page warm-cache render target: core content visible within 3 seconds.
- Stage chart must render from chart-ready segments, not raw provider payloads.
- Large stage arrays must be memoized and rendered with Skia or optimized SVG/native drawing.
- The page must use progressive disclosure; do not force all detail cards above the fold.

### 24.9 Visual QA checklist for Sleep

Before accepting Sleep UI:

```text
[ ] Does it look intentionally designed rather than generated?
[ ] Does the stage timeline clearly show the night structure?
[ ] Can a user understand the main sleep result in 5 seconds?
[ ] Can a power user drill into metrics without clutter?
[ ] Does the chart support full stages and classic fallback?
[ ] Are missing/provisional states polished?
[ ] Does AI explain from evidence rather than vibes?
[ ] Does it respect dark and light themes?
[ ] Does reduced motion still work?
[ ] Does screen reader output summarize sleep meaningfully?
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

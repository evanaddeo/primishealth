# Primis Scoring & Algorithms Spec

**Document type:** Scoring & Algorithms Specification  
**Product:** Primis  
**Version:** 1.1  
**Status:** Draft for implementation planning  
**Prepared for:** Evan / Primis private beta  
**Last updated:** 2026-06-07  
**Primary audience:** AI coding agents, backend engineers, data engineers, mobile engineers, AI/ML engineers, product owner

---

## 0. AI Coding Agent Instructions

This document is intended to be consumed directly by AI coding agents and human engineers. Treat it as the authoritative scoring and algorithms source of truth unless superseded by a later algorithm migration spec.

### 0.1 How to use this document

1. **Do not invent score formulas ad hoc in UI or AI prompts.** Implement formulas in centralized scoring services/modules.
2. **Keep score computation deterministic, testable, and auditable.** AI may explain scores; AI must not be the sole mechanism calculating core scores.
3. **Use requirement IDs and algorithm IDs in implementation plans, tickets, code comments, and tests** where useful.
4. **All scores MUST store component contributions.** The app and AI must be able to explain why a score moved.
5. **All scores MUST support missing data.** Do not crash, hide the screen, or hallucinate precision when data is unavailable.
6. **Use personal baselines before population assumptions.** Primis should become useful by comparing the user to themselves.
7. **Manual inputs enrich interpretation but should not dominate objective health scores.** Objective wearable/body-composition data remains the foundation.
8. **Use conservative health language.** Primis is performance/wellness software, not a medical diagnostic system.
9. **Never hardcode proprietary competitor formulas.** Competitor concepts may inspire product design, but Primis formulas must be its own transparent scoring system.
10. **Prefer explicit `not_enough_data` states over fake confidence.** If data history is too short, show provisional scores and explain limitations.
11. **Separate score versions.** Every computed score must store `algorithm_version` so historical scores can be recalculated or compared.
12. **Design algorithms for asynchronous backend computation and fast mobile reads.** Mobile should read score snapshots and chart-ready summaries, not recompute heavy analytics on render.

### 0.2 Requirement language

- **MUST:** Required.
- **SHOULD:** Strongly recommended unless blocked by provider/platform limitations.
- **MAY:** Optional or later-phase enhancement.
- **MUST NOT:** Explicitly forbidden unless a later decision overrides it.

### 0.3 Relationship to other Primis documents

This document is one of seven intended source-of-truth documents:

1. Product Requirements Document
2. Technical Architecture Document
3. Health Data Model / Metric Schema
4. **Scoring & Algorithms Spec**
5. AI Context Engine Spec
6. UI/UX Design System Spec
7. MVP Build Plan / Milestones

This document defines scoring concepts, algorithm primitives, score formulas, baseline logic, trend/correlation logic, bedtime planning, manual-input utilization, confidence scoring, score explanation structures, and implementation guidance.

Detailed database schemas belong primarily in the **Health Data Model / Metric Schema**. Detailed backend topology belongs primarily in the **Technical Architecture Document**. Detailed AI prompt/context assembly belongs primarily in the **AI Context Engine Spec**.

---

## 1. Executive Summary

Primis is an AI-native performance health OS. Its most important intellectual asset is not the UI, not the chat experience, and not raw provider ingestion. Its most important asset is the **personal health-data model plus the deterministic scoring and insight engine** built on top of that data.

The scoring system must turn Google/Fitbit data, future HealthKit data, future Health Connect data, body-composition data, basic nutrition logs, and manual lifestyle inputs into:

- Sleep Score
- Recovery Score
- Training Readiness Score
- Strain / Training Load
- Activity Score
- Nutrition Score
- Hydration/Caffeine/Alcohol impact signals
- Gut/Digestion trend signals
- Body Composition trend summaries
- Wellbeing Score widget
- Bedtime Planner recommendations
- Insight candidates for AI summaries/chat

The initial scoring system should be **deterministic, transparent, baseline-driven, and explainable**. Real machine learning can be introduced later after enough user data exists. In v1, “advanced” means mature statistical modeling, personalized baselines, thoughtful weightings, explicit missing-data behavior, reliable trend/correlation logic, and strong UX explanations.

Primis should feel inspired by the best ideas from WHOOP, Oura, Apple Health/Fitness, Fitbit/Google Health, Athlytic, and Bevel, but it must compute its own scores from first principles using exposed data and user-specific baselines.

---

## 2. Product and Algorithm Philosophy

### 2.1 Core philosophy

Primis scoring must answer five user questions:

1. **How did I sleep?**
2. **How recovered am I?**
3. **How hard should I train today?**
4. **What changed compared to my normal?**
5. **What behaviors seem to help or hurt my performance?**

The score engine should produce both numbers and reasons. A score without an explanation is not sufficient.

### 2.2 Algorithm principles

| ID | Principle | Description |
|---|---|---|
| ALG-PRIN-001 | Personal baseline first | Compare users to their own history before comparing to generic population norms. |
| ALG-PRIN-002 | Objective data dominates | Wearable/body metrics should drive core scores. Manual logs should contextualize and adjust lightly. |
| ALG-PRIN-003 | Explainability required | Every score should be decomposable into component scores, weights, input values, baselines, and final contribution. |
| ALG-PRIN-004 | Missing data is explicit | Scores should store completeness and confidence. They should not pretend unavailable metrics were measured. |
| ALG-PRIN-005 | AI explains; deterministic engine calculates | The deterministic algorithm service produces scores and insight candidates. AI translates them into coach/analyst language. |
| ALG-PRIN-006 | Stable but adaptive | Scores should not swing wildly from noisy data, but should react meaningfully to real deviations. |
| ALG-PRIN-007 | Performance-only language | Recommendations should avoid diagnosis/treatment language and remain in performance/wellness framing. |
| ALG-PRIN-008 | Versioned algorithms | Algorithm versions must be stored with every score snapshot. |
| ALG-PRIN-009 | Provider-agnostic scoring | Scores should consume canonical Primis metrics, not direct provider payloads. |
| ALG-PRIN-010 | User trust through transparency | Users should be able to tap into a score and see the major reasons behind it. |

### 2.3 What “advanced” means for v1

For the first private-beta versions, Primis should not pretend to have large population ML models. Instead, the system should feel advanced through:

- rolling baselines
- weighted recent-history windows
- deviation scoring
- anomaly detection
- sleep debt modeling
- recovery trend modeling
- training-load modeling
- habit/outcome correlations
- personalized bedtime recommendations
- manual-input context
- AI explanations from structured evidence
- adaptive confidence levels
- per-user personalization over time

### 2.4 What Primis must avoid

| ID | Avoid | Reason |
|---|---|---|
| ALG-AVOID-001 | Raw-data-to-LLM score calculation | Expensive, slow, inconsistent, hard to test, and likely inaccurate. |
| ALG-AVOID-002 | Fake medical detection | Avoid claims like “you are sick” or “you have X.” Use “signals are outside baseline” language. |
| ALG-AVOID-003 | Overweighting manual inputs | Users may forget, exaggerate, or inconsistently log. Objective metrics should remain primary. |
| ALG-AVOID-004 | Opaque formulas | Users should understand major drivers of a score. |
| ALG-AVOID-005 | Perfectionist ML before data exists | Premature ML will slow the project and likely perform worse than thoughtful rules/statistics. |
| ALG-AVOID-006 | Exact sleep-cycle certainty | Sleep cycles vary. Bedtime recommendations should use windows and probability, not fake precision. |
| ALG-AVOID-007 | Nutrition over-scope | Full MyFitnessPal-level nutrition should not block v1 scoring. |

---

## 3. External Inspiration and Constraints

### 3.1 Competitor concepts to study, not copy

Primis may learn from public concepts used by established products:

- **WHOOP-style recovery:** readiness/recovery emphasis using HRV, resting heart rate, respiratory rate, and sleep context.
- **Oura-style readiness:** contributor-based readiness using HRV balance, sleep balance, activity balance, resting heart rate, and recovery signals.
- **Apple training load:** recent training load compared against a longer historical trend, especially a seven-day vs twenty-eight-day concept.
- **Apple Fitness-style rings:** goal progress visual clarity.
- **Athlytic/Bevel-style health overlay:** taking existing wearable/Apple Health data and making it more interpretable.

These ideas validate user demand. They must not be treated as exact formula requirements.

### 3.2 Data-source constraint

Primis scoring should assume the Google Health API exposes many raw/structured health data types, including activity, sleep, vitals, nutrition, and body metrics. However, Primis must not assume proprietary app-level scores such as provider Sleep Score, Readiness Score, or Cardio Load are available unless validated in the data-availability spike.

Therefore:

```text
Provider raw metrics -> Primis score engine -> Primis scores
```

If a provider exposes a useful native score later, store it as `provider_score` and compare it to `primis_score`; do not replace Primis scoring automatically.

### 3.3 Performance constraint

All score computations should run asynchronously in backend workers or scheduled jobs. Mobile screens should read score snapshots and precomputed chart data.

Mobile should not compute daily recovery, historical correlations, or heavy trend analysis during screen render.

### 3.4 Private beta constraint

Initial users are the founder and one friend. Algorithms must support very limited user count. This means:

- no population-level ML assumptions in v1
- personal baseline modeling is the key
- confidence should be low until enough history exists
- users should see “learning your baseline” states

---

## 4. Algorithm Layers

### 4.1 Layered scoring architecture

```text
Canonical metrics
  -> daily summaries
  -> rolling baselines
  -> component scores
  -> composite scores
  -> insight candidates
  -> AI context packets
  -> user-facing explanations
```

### 4.2 Layer descriptions

| Layer | Purpose | Examples |
|---|---|---|
| Canonical metrics | Raw normalized measurements | HRV, RHR, steps, SpO2, sleep duration, active calories |
| Daily summaries | Day-level aggregated facts | total steps, sleep duration, avg HRV, max HR, total active calories |
| Rolling baselines | User-specific normal ranges | 7-day, 14-day, 30-day, 90-day averages and variability |
| Component scores | Individual normalized sub-scores | HRV balance score, sleep debt score, activity balance score |
| Composite scores | User-facing scores | Recovery, Sleep, Readiness, Activity, Nutrition |
| Insight candidates | Structured explanation objects | “HRV below baseline,” “training load elevated,” “late caffeine trend” |
| AI context packets | Curated data for AI model | compact JSON evidence payload |
| User-facing explanations | UI/AI language | coach/analyst summaries |

---

## 5. Score Taxonomy

### 5.1 Core scores

| Score | User-facing? | Phase | Purpose |
|---|---:|---|---|
| Sleep Score | Yes | Phase 1/2 | Quality and sufficiency of last sleep period. |
| Recovery Score | Yes | Phase 1/2 | Physiological recovery using sleep/vitals/training context. |
| Training Readiness Score | Yes | Phase 2 | How suitable today is for training intensity. |
| Strain / Daily Load | Yes | Phase 2 | How much physical stress the user accumulated. |
| Activity Score | Yes | Phase 1/2 | Daily movement and goal completion. |
| Nutrition Score | Yes | Phase 2/3 | Macro/hydration/timing/behavior adherence. |
| Wellbeing Score | Optional widget | Phase 2 | High-level blended snapshot. |
| Bedtime Recommendation Score | Internal + UI | Phase 2 | Rank suggested bedtimes for a target wake time. |

### 5.2 Supporting metrics

| Metric | User-facing? | Purpose |
|---|---:|---|
| Sleep Debt | Yes | Measures cumulative shortfall from personal sleep need. |
| Sleep Consistency | Yes | Measures regularity of bedtime/wake time. |
| HRV Balance | Yes | Compares recent HRV to longer-term baseline. |
| Resting HR Deviation | Yes | Detects higher/lower-than-normal RHR. |
| Respiratory Stability | Sometimes | Detects deviation from baseline. |
| SpO2 Stability | Sometimes | Detects deviation from baseline. |
| Acute/Chronic Load Ratio | Advanced detail | Measures recent training load vs longer load. |
| Caffeine Timing Risk | Yes | Estimates sleep-impact risk based on caffeine timing. |
| Alcohol Recovery Impact | Yes | Correlates alcohol logs with next-day recovery/sleep. |
| Gut Regularity Signal | Yes if enabled | Tracks digestion/poop trends and associations. |
| Body Composition Trend | Yes | Weight/body fat/lean mass trend interpretation. |

---

## 6. Score Scale and User-Facing Bands

### 6.1 Standard score range

All major user-facing scores should be `0–100`.

```text
0   = extremely poor / unavailable / severe negative signal
50  = moderate / mixed
100 = excellent / strongly positive
```

### 6.2 Recommended score bands

| Band | Range | Label | UI interpretation |
|---|---:|---|---|
| Excellent | 85–100 | Excellent | Strong signal; user likely ready or metric is strong. |
| Good | 70–84 | Good | Solid; minor optimization available. |
| Moderate | 55–69 | Moderate | Mixed; watch key limiting factors. |
| Low | 35–54 | Low | Recovery/performance likely constrained. |
| Very Low | 0–34 | Very Low | Prioritize rest/low-intensity/recovery behaviors. |

### 6.3 Score state enum

Every score snapshot MUST include a `score_state`:

```typescript
type ScoreState =
  | 'available'
  | 'provisional'
  | 'not_enough_data'
  | 'missing_required_data'
  | 'stale_data'
  | 'provider_unavailable'
  | 'calculation_error';
```

### 6.4 Confidence enum

Every score snapshot MUST include confidence:

```typescript
type ScoreConfidence = 'high' | 'medium' | 'low' | 'unknown';
```

Recommended confidence display:

- `high`: enough data and recent sync
- `medium`: usable score with some missing/non-critical components
- `low`: provisional score, sparse history, or important missing fields
- `unknown`: should generally not be shown as a normal score

---

## 7. Shared Algorithm Primitives

Implement these primitives once and reuse them across scoring modules.

### 7.1 Clamp

```typescript
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
```

### 7.2 Weighted average with missing component handling

Requirement ID: `ALG-CORE-001`

If a component is missing, the score engine should reweight remaining components only if the missing component is not required. Required components must trigger `missing_required_data` or `not_enough_data`.

```typescript
type WeightedComponent = {
  key: string;
  score: number | null;
  weight: number;
  required: boolean;
  confidence: ScoreConfidence;
};

function weightedScore(components: WeightedComponent[]): {
  score: number | null;
  normalizedWeightTotal: number;
  missingRequired: string[];
} {
  const missingRequired = components
    .filter(c => c.required && c.score == null)
    .map(c => c.key);

  if (missingRequired.length > 0) {
    return { score: null, normalizedWeightTotal: 0, missingRequired };
  }

  const available = components.filter(c => c.score != null);
  const totalWeight = available.reduce((sum, c) => sum + c.weight, 0);

  if (totalWeight <= 0) {
    return { score: null, normalizedWeightTotal: 0, missingRequired: [] };
  }

  const score = available.reduce((sum, c) => {
    return sum + (c.score as number) * (c.weight / totalWeight);
  }, 0);

  return {
    score: Math.round(clamp(score, 0, 100)),
    normalizedWeightTotal: totalWeight,
    missingRequired: []
  };
}
```

### 7.3 Baseline windows

Requirement ID: `ALG-BASE-001`

Primis MUST compute rolling baselines for important metrics.

Recommended windows:

| Window | Use |
|---|---|
| 3-day | Short-term acute change, smoothing recent noise. |
| 7-day | Recent behavior/performance trend. |
| 14-day | Short recovery/sleep balance window. |
| 30-day | Main personal baseline for many metrics. |
| 60-day | Optional mid-term baseline. |
| 90-day | Long-term baseline / stable normal range. |
| 180-day | Later-phase seasonality/context. |

### 7.4 Baseline calculation

Requirement ID: `ALG-BASE-002`

For each metric baseline store:

```typescript
type MetricBaseline = {
  userId: string;
  metricCode: string;
  windowDays: number;
  startDate: string;
  endDate: string;
  sampleCount: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  standardDeviation: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
  completenessRatio: number;
  algorithmVersion: string;
};
```

### 7.5 Baseline eligibility

Requirement ID: `ALG-BASE-003`

Minimum sample thresholds:

| Baseline window | Minimum valid samples | State if missing |
|---|---:|---|
| 7-day | 4 valid days | provisional if below |
| 14-day | 8 valid days | provisional if below |
| 30-day | 18 valid days | low confidence if below |
| 90-day | 45 valid days | use 30-day fallback if below |

For first-time users, the system may use:

1. available personal data from provider history
2. provider native summaries if available
3. provisional generic defaults
4. explicit “learning your baseline” UI

### 7.6 Exponential moving average

Requirement ID: `ALG-BASE-004`

Use EMA for stable trend tracking where appropriate.

```typescript
function ema(values: number[], alpha: number): number | null {
  if (values.length === 0) return null;
  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = alpha * values[i] + (1 - alpha) * result;
  }
  return result;
}
```

Suggested alpha:

| Use | Alpha |
|---|---:|
| Fast trend | 0.40 |
| Medium trend | 0.25 |
| Slow trend | 0.10 |

### 7.7 Z-score / deviation

Requirement ID: `ALG-BASE-005`

```typescript
function zScore(value: number, mean: number, standardDeviation: number): number | null {
  if (!standardDeviation || standardDeviation <= 0) return null;
  return (value - mean) / standardDeviation;
}
```

Use z-score internally, but do not over-expose it in UI. UI should show plain-language deviations like:

- “12% below your 30-day average”
- “4 bpm above your baseline”
- “higher than usual”

### 7.8 Percent deviation

Requirement ID: `ALG-BASE-006`

```typescript
function percentDeviation(value: number, baseline: number): number | null {
  if (!baseline || baseline === 0) return null;
  return ((value - baseline) / baseline) * 100;
}
```

### 7.9 Positive-vs-negative direction metadata

Requirement ID: `ALG-BASE-007`

Each metric used in scoring MUST define whether higher is better, lower is better, or target-range is better.

```typescript
type MetricDirection = 'higher_is_better' | 'lower_is_better' | 'target_range' | 'contextual';
```

Examples:

| Metric | Direction |
|---|---|
| HRV | higher_is_better, but contextual |
| Resting HR | lower_is_better, but contextual |
| Sleep duration | target_range |
| Sleep efficiency | higher_is_better |
| Respiratory rate | target_range / stable is better |
| SpO2 | higher/stable is better |
| Training load | target_range / contextual |
| Calories burned | contextual |
| Calories consumed | target_range |
| Alcohol | lower_is_better for recovery |

---

## 8. Data Quality and Completeness

### 8.1 Data quality score

Requirement ID: `ALG-DQ-001`

Every day-level scoring cycle SHOULD compute a `data_quality_score` from 0–100.

Suggested components:

| Component | Weight | Description |
|---|---:|---|
| Provider recency | 25% | How recently provider data synced. |
| Required metric availability | 35% | Availability of key inputs for requested score. |
| Historical baseline depth | 25% | Enough samples to personalize. |
| Metric continuity | 15% | Few gaps/anomalies in time series. |

### 8.2 Provider recency scoring

```typescript
function providerRecencyScore(hoursSinceLastSync: number): number {
  if (hoursSinceLastSync <= 2) return 100;
  if (hoursSinceLastSync <= 6) return 85;
  if (hoursSinceLastSync <= 12) return 70;
  if (hoursSinceLastSync <= 24) return 50;
  if (hoursSinceLastSync <= 48) return 25;
  return 0;
}
```

### 8.3 Missing data handling

Requirement ID: `ALG-DQ-002`

The score engine MUST distinguish:

```typescript
type MissingReason =
  | 'provider_did_not_supply'
  | 'permission_not_granted'
  | 'device_not_worn'
  | 'sync_stale'
  | 'not_enough_history'
  | 'metric_not_supported'
  | 'user_did_not_log'
  | 'calculation_not_applicable';
```

### 8.4 Score snapshot data-quality metadata

Every score snapshot MUST include:

```typescript
type ScoreQualityMetadata = {
  scoreState: ScoreState;
  confidence: ScoreConfidence;
  dataQualityScore: number;
  completenessRatio: number;
  missingRequiredMetrics: string[];
  missingOptionalMetrics: string[];
  staleProviderConnections: string[];
  baselineStatus: 'ready' | 'partial' | 'learning' | 'unavailable';
};
```

---

## 9. Component Score Functions

### 9.1 Linear target-range score

Requirement ID: `ALG-COMP-001`

Use for metrics where an ideal range exists.

```typescript
function targetRangeScore(
  value: number,
  idealMin: number,
  idealMax: number,
  hardMin: number,
  hardMax: number
): number {
  if (value >= idealMin && value <= idealMax) return 100;
  if (value < idealMin) {
    return Math.round(clamp(((value - hardMin) / (idealMin - hardMin)) * 100, 0, 100));
  }
  return Math.round(clamp(((hardMax - value) / (hardMax - idealMax)) * 100, 0, 100));
}
```

### 9.2 Deviation penalty score

Requirement ID: `ALG-COMP-002`

Use for stability metrics where deviation from baseline is negative.

```typescript
function deviationPenaltyScore(absPercentDeviation: number, mild: number, severe: number): number {
  if (absPercentDeviation <= mild) return 100;
  if (absPercentDeviation >= severe) return 0;
  return Math.round(100 - ((absPercentDeviation - mild) / (severe - mild)) * 100);
}
```

Example:

```text
Respiratory rate 0–3% from baseline => strong
3–10% from baseline => gradually penalize
>10% from baseline => severe deviation
```

### 9.3 Higher-is-better baseline score

Requirement ID: `ALG-COMP-003`

Use for HRV-like metrics where higher relative to baseline is generally favorable.

```typescript
function higherIsBetterBaselineScore(percentDev: number): number {
  // percentDev = (value - baseline) / baseline * 100
  if (percentDev >= 10) return 100;
  if (percentDev >= 0) return 85 + percentDev * 1.5;
  if (percentDev >= -10) return 85 + percentDev * 2.5; // -10 => 60
  if (percentDev >= -25) return 60 + (percentDev + 10) * 2; // -25 => 30
  return 20;
}
```

This should be tuned after private-beta data review.

### 9.4 Lower-is-better baseline score

Requirement ID: `ALG-COMP-004`

Use for resting HR where higher-than-baseline is usually negative.

```typescript
function lowerIsBetterBaselineScore(percentDev: number): number {
  // percentDev = positive if value is above baseline
  if (percentDev <= -5) return 100;
  if (percentDev <= 0) return 90;
  if (percentDev <= 5) return 90 - percentDev * 4; // +5 => 70
  if (percentDev <= 12) return 70 - (percentDev - 5) * 5; // +12 => 35
  return 20;
}
```

### 9.5 Recency-weighted recent average

Requirement ID: `ALG-COMP-005`

Use for “recent balance” contributors.

```typescript
function recencyWeightedAverage(valuesOldToNew: number[], decay = 0.85): number | null {
  if (valuesOldToNew.length === 0) return null;
  let weightedSum = 0;
  let weightSum = 0;
  const n = valuesOldToNew.length;
  for (let i = 0; i < n; i++) {
    const distanceFromNewest = n - 1 - i;
    const weight = Math.pow(decay, distanceFromNewest);
    weightedSum += valuesOldToNew[i] * weight;
    weightSum += weight;
  }
  return weightedSum / weightSum;
}
```

---

## 10. Sleep Score

### 10.1 Purpose

Requirement ID: `ALG-SLEEP-001`

Sleep Score estimates the quality and sufficiency of the user’s most recent main sleep episode. It should reflect duration, efficiency, timing consistency, stage quality, overnight recovery signals, and sleep debt.

### 10.2 Required inputs

| Input | Required? | Canonical metric/source |
|---|---:|---|
| Main sleep start/end | Required | sleep session |
| Sleep duration | Required | sleep session total duration |
| Time in bed | Required if available | sleep session |
| Sleep efficiency | Optional but important | duration / time in bed |
| Awake time | Optional | sleep stages |
| Deep sleep | Optional | sleep stages |
| REM sleep | Optional | sleep stages |
| Resting/overnight HR | Optional | heart rate / daily resting HR |
| HRV during sleep / daily HRV | Optional | HRV metrics |
| Respiratory rate | Optional | daily respiratory rate / sleep summary |
| SpO2 | Optional | daily oxygen saturation |
| Prior sleep debt | Optional | derived metric |
| User sleep target | Required with fallback | user setting / inferred |

### 10.3 Sleep Score components

Initial v1/v2 formula:

| Component | Weight | Required? | Description |
|---|---:|---:|---|
| Sleep Duration | 25% | Yes | Actual sleep vs personal need/target. |
| Sleep Efficiency | 20% | No | Percent of time in bed spent asleep. |
| Sleep Consistency | 15% | No | Bedtime/wake time regularity vs baseline. |
| Stage Balance | 15% | No | Deep/REM vs personal baseline and reasonable range. |
| Overnight Recovery Signals | 15% | No | HRV/RHR/respiratory/SpO2 during sleep if available. |
| Sleep Debt Impact | 10% | No | Penalizes accumulated sleep shortfall. |

If optional metrics are missing, reweight available optional components but mark confidence accordingly.

### 10.4 Sleep duration score

Requirement ID: `ALG-SLEEP-002`

Personal sleep need should be determined in this priority order:

1. explicit user target
2. inferred from historical best-recovery nights
3. default adult target of 8 hours

Suggested duration scoring:

```typescript
function sleepDurationScore(actualHours: number, targetHours: number): number {
  const idealMin = targetHours - 0.25;
  const idealMax = targetHours + 0.50;
  const hardMin = Math.max(3.5, targetHours - 3.5);
  const hardMax = Math.min(11.0, targetHours + 2.5);
  return targetRangeScore(actualHours, idealMin, idealMax, hardMin, hardMax);
}
```

Notes:

- Slightly exceeding target should not be heavily penalized.
- Chronically oversleeping may be relevant later, but v1 should not over-interpret.
- User-specific target should become smarter over time.

### 10.5 Sleep efficiency score

Requirement ID: `ALG-SLEEP-003`

```typescript
function sleepEfficiencyScore(efficiencyPct: number): number {
  if (efficiencyPct >= 92) return 100;
  if (efficiencyPct >= 85) return 80 + ((efficiencyPct - 85) / 7) * 20;
  if (efficiencyPct >= 75) return 50 + ((efficiencyPct - 75) / 10) * 30;
  if (efficiencyPct >= 60) return 20 + ((efficiencyPct - 60) / 15) * 30;
  return 10;
}
```

### 10.6 Sleep consistency score

Requirement ID: `ALG-SLEEP-004`

Sleep consistency should use both bedtime and wake-time deviation from the user’s rolling baseline.

Inputs:

- local bedtime
- local wake time
- 14-day median bedtime
- 14-day median wake time
- 30-day median bedtime/wake time if available

Circular time math is required because bedtimes cross midnight.

```typescript
function sleepConsistencyScore(
  bedtimeDeviationMinutes: number,
  wakeDeviationMinutes: number
): number {
  const weightedDeviation = bedtimeDeviationMinutes * 0.55 + wakeDeviationMinutes * 0.45;
  if (weightedDeviation <= 20) return 100;
  if (weightedDeviation <= 45) return 85;
  if (weightedDeviation <= 90) return 65;
  if (weightedDeviation <= 150) return 40;
  return 20;
}
```

### 10.7 Stage balance score

Requirement ID: `ALG-SLEEP-005`

Use personal baseline first. Do not over-penalize stage estimates because consumer wearable sleep-stage accuracy can vary.

Inputs:

- deep sleep minutes
- REM sleep minutes
- total sleep minutes
- 30-day deep/REM averages
- 30-day deep/REM percentages

Suggested logic:

```text
stage_balance_score = average(
  deep_sleep_score,
  rem_sleep_score
)
```

Deep/REM scoring:

- Compare minutes and percentage to personal 30-day baseline.
- If within +/-20% of baseline: strong.
- If 20–40% below baseline: moderate penalty.
- If >40% below baseline: stronger penalty.
- Avoid excessive reward for unusually high stage estimates because they may be noise.

### 10.8 Overnight recovery signals score

Requirement ID: `ALG-SLEEP-006`

Combine overnight HRV, RHR, respiratory rate, and SpO2 if available.

Suggested components:

| Component | Weight within overnight score |
|---|---:|
| HRV vs baseline | 35% |
| RHR vs baseline | 35% |
| Respiratory stability | 15% |
| SpO2 stability | 15% |

If only HRV/RHR available, use those and mark medium confidence.

### 10.9 Sleep debt impact score

Requirement ID: `ALG-SLEEP-007`

Sleep debt should penalize sleep score gradually.

```typescript
function sleepDebtScore(sleepDebtHours: number): number {
  if (sleepDebtHours <= 0.5) return 100;
  if (sleepDebtHours <= 2.0) return 85;
  if (sleepDebtHours <= 4.0) return 65;
  if (sleepDebtHours <= 7.0) return 40;
  return 20;
}
```

### 10.10 Sleep Score output object

```typescript
type SleepScoreSnapshot = {
  scoreType: 'sleep';
  score: number | null;
  band: ScoreBand | null;
  localDate: string;
  sleepSessionId: string | null;
  algorithmVersion: string;
  state: ScoreState;
  confidence: ScoreConfidence;
  components: ScoreComponent[];
  headlineReasons: InsightReference[];
  missingData: MissingMetric[];
};
```

### 10.11 Sleep Score acceptance criteria

| ID | Acceptance Criteria |
|---|---|
| ALG-SLEEP-AC-001 | If sleep duration is missing, Sleep Score state is `missing_required_data`. |
| ALG-SLEEP-AC-002 | If sleep stages are missing but duration exists, Sleep Score still computes with lower confidence. |
| ALG-SLEEP-AC-003 | Score snapshot stores all component scores and weights. |
| ALG-SLEEP-AC-004 | User can tap Sleep Score and see top 3 reasons. |
| ALG-SLEEP-AC-005 | Algorithm does not claim exact sleep-cycle certainty. |

---

## 11. Sleep Debt

### 11.1 Purpose

Requirement ID: `ALG-DEBT-001`

Sleep Debt estimates cumulative sleep shortfall relative to personal sleep need. It should influence Sleep Score, Recovery Score, Bedtime Planner, and AI coaching.

### 11.2 Calculation

```typescript
function dailySleepDeficit(actualSleepHours: number, targetSleepHours: number): number {
  return Math.max(0, targetSleepHours - actualSleepHours);
}
```

Use a rolling 14-day weighted model:

```typescript
function rollingSleepDebt(dailyDeficitsOldToNew: number[]): number {
  // Newer deficits matter more; old deficits decay.
  const decay = 0.88;
  let weightedDebt = 0;
  for (let i = 0; i < dailyDeficitsOldToNew.length; i++) {
    const distanceFromNewest = dailyDeficitsOldToNew.length - 1 - i;
    weightedDebt += dailyDeficitsOldToNew[i] * Math.pow(decay, distanceFromNewest);
  }
  return Math.round(weightedDebt * 10) / 10;
}
```

### 11.3 Sleep surplus

Primis MAY track sleep surplus, but surplus should not cancel debt 1:1. One long night does not fully erase multiple nights of short sleep.

Suggested:

```text
surplus_credit = max(0, actualSleep - targetSleep) * 0.35
```

### 11.4 Acceptance criteria

| ID | Acceptance Criteria |
|---|---|
| ALG-DEBT-AC-001 | Sleep debt updates after each main sleep session. |
| ALG-DEBT-AC-002 | Sleep debt uses personal target if available. |
| ALG-DEBT-AC-003 | Sleep debt decays over time and cannot become negative. |
| ALG-DEBT-AC-004 | Bedtime Planner uses sleep debt to bias earlier bedtime recommendations. |

---

## 12. Recovery Score

### 12.1 Purpose

Requirement ID: `ALG-REC-001`

Recovery Score estimates how physiologically recovered the user appears today based on objective recovery signals and recent stress/load context.

Recovery Score is not a medical diagnosis. It should indicate readiness/recovery state for performance and lifestyle decisions.

### 12.2 Required inputs

| Input | Required? | Notes |
|---|---:|---|
| Sleep Score | Required or fallback | If missing, Recovery Score should be provisional or unavailable. |
| HRV | Strongly preferred | Use daily HRV or sleep HRV if available. |
| Resting HR | Strongly preferred | Use daily resting HR or overnight RHR. |
| Respiratory rate | Optional | Stability signal. |
| SpO2 | Optional | Stability signal. |
| Sleep debt | Optional | Important context. |
| Recent training load | Optional | Recovery-load context. |
| Subjective check-in | Optional | Energy/soreness/stress context. |

### 12.3 Recovery Score components

Initial formula:

| Component | Weight | Required? | Description |
|---|---:|---:|---|
| HRV Balance | 30% | No but important | Recent HRV vs baseline. |
| Resting HR Deviation | 20% | No but important | RHR above/below personal baseline. |
| Sleep Score | 20% | Yes | Last sleep quality/sufficiency. |
| Sleep Debt | 10% | No | Cumulative shortfall. |
| Respiratory Stability | 7.5% | No | Deviation from baseline. |
| SpO2 Stability | 5% | No | Low/deviated oxygen saturation. |
| Training Load Context | 5% | No | Recent load vs chronic load. |
| Subjective Check-in | 2.5% | No | Energy/stress/soreness modifier. |

This formula should be versioned as `recovery_v1_0`.

### 12.4 HRV Balance

Requirement ID: `ALG-REC-002`

Recommended HRV balance logic:

1. Compute recent HRV using recency-weighted 7- or 14-day average.
2. Compare recent HRV to 30- or 90-day baseline.
3. Use direct latest HRV as an acute signal if it is meaningfully below baseline.

For private beta:

```text
hrv_balance_input = weighted average of:
  60% latest valid HRV
  40% 7-day recency-weighted HRV
```

Then compare to 30-day baseline if available, else 14-day baseline.

```typescript
function hrvBalanceScore(latestHrv: number, recentHrv: number, baselineHrv: number): number {
  const blended = latestHrv * 0.60 + recentHrv * 0.40;
  const pctDev = percentDeviation(blended, baselineHrv);
  if (pctDev == null) return 50;
  return clamp(Math.round(higherIsBetterBaselineScore(pctDev)), 0, 100);
}
```

### 12.5 Resting HR deviation

Requirement ID: `ALG-REC-003`

Use latest/daily RHR vs 30-day baseline.

```typescript
function restingHrScore(todayRhr: number, baselineRhr: number): number {
  const pctDev = percentDeviation(todayRhr, baselineRhr);
  if (pctDev == null) return 50;
  return lowerIsBetterBaselineScore(pctDev);
}
```

Important: very low RHR is not always better. Later versions should detect unusual drops as possible fatigue/measurement artifact. For v1, avoid over-rewarding large RHR drops.

### 12.6 Respiratory stability

Requirement ID: `ALG-REC-004`

Respiratory rate should be scored by stability against baseline.

```typescript
function respiratoryStabilityScore(todayRespRate: number, baselineRespRate: number): number {
  const pctDev = percentDeviation(todayRespRate, baselineRespRate);
  if (pctDev == null) return 50;
  return deviationPenaltyScore(Math.abs(pctDev), 3, 12);
}
```

AI language:

- Good: “Your respiratory rate is higher than your normal range.”
- Bad: “You are getting sick.”

### 12.7 SpO2 stability

Requirement ID: `ALG-REC-005`

SpO2 should mostly be a warning/stability signal, not a major score driver.

```typescript
function spo2Score(avgSpo2: number | null, baselineSpo2: number | null): number | null {
  if (avgSpo2 == null) return null;
  if (avgSpo2 >= 96) return 100;
  if (avgSpo2 >= 94) return 80;
  if (avgSpo2 >= 92) return 55;
  return 30;
}
```

If baseline exists, large negative deviations should create an insight candidate.

### 12.8 Training Load Context in Recovery

Requirement ID: `ALG-REC-006`

Recovery should account for recent strain. If training load is elevated and recovery signals are poor, recommendations should become more conservative.

```typescript
function loadContextScore(acuteChronicRatio: number | null): number | null {
  if (acuteChronicRatio == null) return null;
  if (acuteChronicRatio >= 0.8 && acuteChronicRatio <= 1.2) return 100;
  if (acuteChronicRatio > 1.2 && acuteChronicRatio <= 1.5) return 75;
  if (acuteChronicRatio > 1.5) return 45;
  if (acuteChronicRatio >= 0.5 && acuteChronicRatio < 0.8) return 80;
  return 60; // very low load may indicate detraining or rest; not necessarily bad
}
```

### 12.9 Subjective check-in modifier

Requirement ID: `ALG-REC-007`

Subjective inputs should lightly adjust confidence/recommendations, not dominate score.

Inputs:

- energy 1–5
- mood 1–5
- stress 1–5
- soreness none/mild/moderate/high
- illness/sick tag if user logs it

Suggested modifier range: `-5` to `+3` points.

```typescript
function subjectiveRecoveryModifier(input: ManualCheckin | null): number {
  if (!input) return 0;
  let mod = 0;
  if (input.energy <= 2) mod -= 2;
  if (input.energy >= 4) mod += 1;
  if (input.stress >= 4) mod -= 2;
  if (input.soreness === 'moderate') mod -= 1;
  if (input.soreness === 'high') mod -= 3;
  if (input.tags?.includes('sick')) mod -= 5;
  return clamp(mod, -5, 3);
}
```

### 12.10 Recovery Score output

```typescript
type RecoveryScoreSnapshot = {
  scoreType: 'recovery';
  score: number | null;
  band: ScoreBand | null;
  localDate: string;
  algorithmVersion: 'recovery_v1_0';
  state: ScoreState;
  confidence: ScoreConfidence;
  components: ScoreComponent[];
  modifierComponents: ScoreModifier[];
  topPositiveDrivers: InsightReference[];
  topNegativeDrivers: InsightReference[];
  recommendationIntensity: 'rest' | 'light' | 'moderate' | 'high' | 'unknown';
};
```

### 12.11 Recovery recommendation bands

| Recovery Score | Suggested framing |
|---:|---|
| 85–100 | Strong recovery. Higher-intensity training may be appropriate if training plan supports it. |
| 70–84 | Good recovery. Normal training likely reasonable. |
| 55–69 | Mixed recovery. Moderate intensity or reduced volume may be better. |
| 35–54 | Low recovery. Prefer light work, skill, mobility, walking, or rest. |
| 0–34 | Very low recovery. Prioritize recovery behaviors and avoid maximal intensity. |

Language should remain in the middle: neither overly conservative nor reckless.

### 12.12 Acceptance criteria

| ID | Acceptance Criteria |
|---|---|
| ALG-REC-AC-001 | Recovery Score computes from canonical metrics, not raw provider JSON. |
| ALG-REC-AC-002 | Recovery Score stores component scores and weights. |
| ALG-REC-AC-003 | If HRV is missing, Recovery Score can compute provisionally from sleep/RHR/other signals if enough data exists. |
| ALG-REC-AC-004 | If Sleep Score is missing, Recovery Score is low confidence or unavailable depending on other available signals. |
| ALG-REC-AC-005 | User can tap Recovery Score and see top negative/positive drivers. |
| ALG-REC-AC-006 | AI recommendations use Recovery Score and drivers, not raw data alone. |

---

## 13. Training Readiness Score

### 13.1 Purpose

Requirement ID: `ALG-READY-001`

Training Readiness estimates whether the user appears ready for higher-intensity physical training today. It differs from Recovery Score because readiness includes recent training load, soreness, and user goals.

### 13.2 Components

Initial formula:

| Component | Weight | Description |
|---|---:|---|
| Recovery Score | 40% | Physiological readiness. |
| Sleep Debt | 15% | Accumulated sleep constraint. |
| Acute/Chronic Training Load | 20% | Whether recent load is in a productive range. |
| Soreness/Fatigue Check-in | 10% | Manual training context. |
| Recent High-Intensity Exposure | 10% | Whether user stacked hard sessions. |
| Goal Context | 5% | Performance/fat loss/muscle/sleep goals affect recommendation. |

### 13.3 Recommendation wording

Training Readiness can support two kinds of messaging:

- “You appear ready for higher intensity.”
- “This is better suited for moderate or lower-intensity work.”

Avoid guaranteeing outcomes or implying injury prediction.

### 13.4 Readiness output

```typescript
type TrainingReadinessSnapshot = {
  scoreType: 'training_readiness';
  score: number | null;
  band: ScoreBand | null;
  localDate: string;
  algorithmVersion: 'training_readiness_v1_0';
  suggestedTrainingIntensity: 'rest' | 'light' | 'moderate' | 'high';
  suggestedSessionTypes: Array<'zone2' | 'strength' | 'mobility' | 'skills' | 'sprints' | 'basketball' | 'walk' | 'rest'>;
  components: ScoreComponent[];
  explanationDrivers: InsightReference[];
};
```

### 13.5 Suggested training-intensity mapping

| Score | Suggested intensity |
|---:|---|
| 85–100 | high |
| 70–84 | moderate/high |
| 55–69 | moderate |
| 35–54 | light |
| 0–34 | rest/light |

Goal and recent load can adjust final wording.

---

## 14. Strain and Training Load

### 14.1 Purpose

Requirement ID: `ALG-LOAD-001`

Strain/Training Load estimates the physiological training stress accumulated during workouts and daily movement. It should support daily strain, weekly load, acute/chronic load, and training-readiness recommendations.

### 14.2 Inputs

| Input | Required? | Notes |
|---|---:|---|
| Workout duration | Required for workout load | Exercise session. |
| Heart-rate zone minutes | Preferred | Best for intensity calculation. |
| Active calories | Optional | Useful secondary signal. |
| Workout type | Optional | Helps apply sport-specific factors. |
| User effort/RPE | Optional | Later manual/enriched input. |
| Steps/active minutes | Optional | Non-workout daily strain. |

### 14.3 Workout load formula

Requirement ID: `ALG-LOAD-002`

Compute workout load from HR zone minutes where available.

Suggested HR-zone weights:

| Zone | Weight |
|---|---:|
| Zone 1 | 1.0 |
| Zone 2 | 1.5 |
| Zone 3 | 2.5 |
| Zone 4 | 4.0 |
| Zone 5 | 6.0 |

```typescript
function heartRateZoneLoad(zoneMinutes: Record<string, number>): number {
  return (
    (zoneMinutes.zone1 ?? 0) * 1.0 +
    (zoneMinutes.zone2 ?? 0) * 1.5 +
    (zoneMinutes.zone3 ?? 0) * 2.5 +
    (zoneMinutes.zone4 ?? 0) * 4.0 +
    (zoneMinutes.zone5 ?? 0) * 6.0
  );
}
```

### 14.4 Workout type multipliers

Requirement ID: `ALG-LOAD-003`

Workout type can adjust load slightly, but HR should remain primary.

Suggested v1 multipliers:

| Workout type | Multiplier | Notes |
|---|---:|---|
| Walk | 0.75 | Lower stress. |
| Run | 1.05 | Standard endurance. |
| Cycling | 1.00 | Standard endurance. |
| Strength | 1.10 | HR may understate muscular strain. |
| Basketball | 1.15 | Stop/start, impact, intensity. |
| HIIT | 1.20 | High intensity. |
| Mobility/Yoga | 0.60 | Low systemic strain. |
| Unknown | 1.00 | Default. |

### 14.5 Daily strain score

Requirement ID: `ALG-LOAD-004`

Daily Strain should be user-normalized. A raw load value should be converted to a 0–100 strain score based on personal historical load distribution.

```typescript
function strainScoreFromLoad(todayLoad: number, p50: number, p90: number): number {
  if (todayLoad <= 0) return 0;
  if (todayLoad <= p50) return Math.round((todayLoad / p50) * 50);
  if (todayLoad <= p90) return Math.round(50 + ((todayLoad - p50) / (p90 - p50)) * 35);
  return Math.round(clamp(85 + ((todayLoad - p90) / p90) * 15, 85, 100));
}
```

### 14.6 Acute/chronic training load

Requirement ID: `ALG-LOAD-005`

Use a seven-day vs twenty-eight-day model as the primary v1 training-load comparison.

```typescript
acuteLoad = sum(last 7 days dailyLoad)
chronicDailyAverage = average(last 28 days dailyLoad)
expectedSevenDayLoad = chronicDailyAverage * 7
acuteChronicRatio = acuteLoad / expectedSevenDayLoad
```

Interpretation:

| Ratio | Label | Meaning |
|---:|---|---|
| <0.50 | Very low | Much lower than normal. |
| 0.50–0.79 | Below normal | Reduced load. |
| 0.80–1.20 | Steady | Near normal productive range. |
| 1.21–1.50 | Elevated | Higher than normal. Watch recovery. |
| >1.50 | Very elevated | Large load increase; recovery may be constrained. |

### 14.7 Recent high-intensity exposure

Requirement ID: `ALG-LOAD-006`

Track high-intensity session count in last 3 and 7 days.

```typescript
type HighIntensityExposure = {
  highIntensitySessionsLast3Days: number;
  highIntensitySessionsLast7Days: number;
  zone4PlusMinutesLast3Days: number;
  lowerBodyImpactFlag?: boolean;
};
```

This should affect Training Readiness recommendations more than Recovery Score.

### 14.8 Acceptance criteria

| ID | Acceptance Criteria |
|---|---|
| ALG-LOAD-AC-001 | Training load can compute from HR zones when available. |
| ALG-LOAD-AC-002 | If HR zones missing, fallback uses duration, active calories, workout type, and optional RPE. |
| ALG-LOAD-AC-003 | Acute/chronic load is stored daily. |
| ALG-LOAD-AC-004 | Training Readiness uses acute/chronic load and recent high-intensity exposure. |
| ALG-LOAD-AC-005 | UI can explain whether load is below, steady, elevated, or very elevated. |

---

## 15. Activity Score

### 15.1 Purpose

Requirement ID: `ALG-ACT-001`

Activity Score measures how well the user met daily movement/activity goals without confusing high strain with good recovery.

### 15.2 Components

| Component | Weight | Notes |
|---|---:|---|
| Steps goal completion | 30% | User/custom default. |
| Active calories goal | 25% | If available. |
| Active/zone minutes | 25% | Movement intensity. |
| Floors/distance | 10% | If available and relevant. |
| Activity balance | 10% | Avoids rewarding extreme overreaching too much. |

### 15.3 Activity goal score

```typescript
function goalCompletionScore(actual: number, target: number): number {
  if (!target || target <= 0) return 50;
  const ratio = actual / target;
  if (ratio >= 1.0 && ratio <= 1.4) return 100;
  if (ratio < 1.0) return Math.round(clamp(ratio * 100, 0, 100));
  // Above 140% target is still good but may be flagged for recovery context.
  return 95;
}
```

### 15.4 Activity balance

Activity balance should reward consistency, not just max effort.

```typescript
function activityBalanceScore(todayLoad: number, baselineDailyLoad: number): number {
  const ratio = todayLoad / baselineDailyLoad;
  if (ratio >= 0.8 && ratio <= 1.3) return 100;
  if (ratio >= 0.5 && ratio < 0.8) return 75;
  if (ratio > 1.3 && ratio <= 1.7) return 75;
  if (ratio > 1.7) return 55;
  return 50;
}
```

---

## 16. Nutrition Score

### 16.1 Purpose

Requirement ID: `ALG-NUTR-001`

Nutrition Score estimates how well the user’s logged nutrition/hydration/caffeine/alcohol behaviors align with their selected goals and recovery/performance outcomes.

In v1/v2, nutrition should be simple but useful. It should not block the core health-data model.

### 16.2 Nutrition phases

| Phase | Features | Score behavior |
|---|---|---|
| v1 | Manual macros, water, caffeine, alcohol, tags | Basic adherence and timing scores. |
| v1.5 | FoodData Central local catalog | More accurate food/macro logging. |
| v2 | Saved meals, barcode/OCR/photo estimates | Better UX and macro confidence. |
| v3 | Optional external integrations | Integrate if official access exists. |

### 16.3 Components

Initial formula:

| Component | Weight | Notes |
|---|---:|---|
| Protein target adherence | 25% | Important for athletic/body composition goals. |
| Calorie target adherence | 20% | Goal-dependent; optional if user does not track. |
| Hydration adherence | 20% | Water logging. |
| Caffeine timing | 15% | Especially sleep-impact risk. |
| Alcohol recovery impact | 10% | Low/no alcohol favors recovery. |
| Meal timing / late meal flag | 10% | Sleep/recovery context. |

If user does not track nutrition, Nutrition Score should be `not_enough_data`, not guessed.

### 16.4 Protein adherence score

```typescript
function proteinScore(actualGrams: number, targetGrams: number): number {
  if (!targetGrams || targetGrams <= 0) return 50;
  const ratio = actualGrams / targetGrams;
  if (ratio >= 0.9 && ratio <= 1.4) return 100;
  if (ratio < 0.9) return Math.round(clamp((ratio / 0.9) * 100, 0, 100));
  return 90; // over target not usually a major issue in v1
}
```

### 16.5 Calorie adherence score

Goal-dependent:

```typescript
type NutritionGoal = 'maintenance' | 'fat_loss' | 'muscle_gain' | 'performance' | 'general_health';
```

For v1, if no explicit target exists, do not score calories. Show calories in/out as informational.

### 16.6 Hydration score

```typescript
function hydrationScore(actualOz: number, targetOz: number): number {
  if (!targetOz || targetOz <= 0) return 50;
  const ratio = actualOz / targetOz;
  if (ratio >= 0.9 && ratio <= 1.5) return 100;
  if (ratio < 0.9) return Math.round(clamp((ratio / 0.9) * 100, 0, 100));
  return 90;
}
```

### 16.7 Caffeine timing risk

Requirement ID: `ALG-NUTR-002`

Track amount and latest caffeine time. Score should be personalized over time using sleep correlations.

Initial static logic:

```typescript
function caffeineTimingScore(latestCaffeineLocalTime: string | null, bedtimeTargetLocalTime: string | null): number | null {
  if (!latestCaffeineLocalTime || !bedtimeTargetLocalTime) return null;
  const hoursBeforeBed = differenceHours(bedtimeTargetLocalTime, latestCaffeineLocalTime);
  if (hoursBeforeBed >= 10) return 100;
  if (hoursBeforeBed >= 8) return 85;
  if (hoursBeforeBed >= 6) return 70;
  if (hoursBeforeBed >= 4) return 45;
  return 25;
}
```

Later personalization:

- If the user shows no negative sleep response to late caffeine, reduce penalty.
- If user’s sleep score/latency/HRV worsens after late caffeine, increase penalty.

### 16.8 Alcohol recovery impact

Requirement ID: `ALG-NUTR-003`

Inputs:

- number of drinks bucket: none / 1 / 2 / 3–4 / 5+
- alcohol type: beer / wine / liquor / mixed / other
- timing if available

Initial score:

```typescript
function alcoholScore(drinkBucket: string): number {
  switch (drinkBucket) {
    case 'none': return 100;
    case '1': return 80;
    case '2': return 60;
    case '3_4': return 35;
    case '5_plus': return 15;
    default: return 50;
  }
}
```

Alcohol should also generate correlation insights with sleep score, HRV, RHR, and recovery.

### 16.9 Nutrition philosophy profile

Primis may support a default philosophy profile inspired by founder preferences, but it must be user-configurable.

Potential preference flags:

```typescript
type NutritionPhilosophy = {
  highProtein: boolean;
  wholeFoodsEmphasis: boolean;
  avoidSeedOils: boolean;
  avoidArtificialDyes: boolean;
  animalProductsPositive: boolean;
  antiInflammatoryEmphasis: boolean;
  lowProcessedFood: boolean;
};
```

Do not let philosophy flags override objective macro/hydration/sleep/recovery metrics. Use them for coaching style and food-quality tags.

---

## 17. Gut / Digestion Signals

### 17.1 Purpose

Requirement ID: `ALG-GUT-001`

Gut/digestion tracking is optional. It should support trend/correlation analysis, not medical diagnosis.

### 17.2 Inputs

Optional bowel entry fields:

```typescript
type BowelEntry = {
  bristolType?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  color?: 'brown' | 'green' | 'yellow' | 'black' | 'red' | 'pale' | 'other';
  smell?: 'normal' | 'strong' | 'sulfur' | 'unusual';
  urgency?: 'none' | 'mild' | 'urgent';
  pain?: 'none' | 'mild' | 'moderate' | 'severe';
  bloating?: 'none' | 'mild' | 'moderate' | 'severe';
  notes?: string;
};
```

### 17.3 Gut regularity signal

Initial derived values:

- days with logged bowel movement
- frequency per day/week
- average Bristol type
- abnormal color flags
- bloating frequency
- pain frequency
- urgency frequency

### 17.4 Gut insights

Examples:

```text
- Bloating was logged on 4 of the last 7 days.
- Bloating appears more common on days tagged late meal.
- Loose stool logs increased after alcohol days.
- Not enough data yet to connect digestion with sleep/recovery.
```

### 17.5 Safety language

Allowed:

- “This is outside your recent pattern.”
- “Consider tracking this for a few more days.”
- “This may be worth discussing with a clinician if persistent or severe.”

Not allowed:

- “You have IBS.”
- “This means infection.”
- “You should take X medication.”

---

## 18. Body Composition Trends

### 18.1 Purpose

Requirement ID: `ALG-BODY-001`

Body composition should help users understand weight, body fat, lean mass, and trend direction over time. Hume Health/smart scale data likely enters through HealthKit/Apple Health or Health Connect, not direct API in v1.

### 18.2 Inputs

| Metric | Source |
|---|---|
| Weight | Google Health / HealthKit / Health Connect / manual / Hume via health store |
| Body fat percentage | HealthKit/Health Connect/Hume if available |
| Lean mass | Hume/HealthKit if available |
| BMI | Derived if height/weight available, optional and low emphasis |

### 18.3 Trend calculation

Use smoothed trend, not daily raw fluctuation.

```typescript
bodyWeightTrend7 = ema(last7DailyWeights, 0.35)
bodyWeightTrend30 = ema(last30DailyWeights, 0.15)
bodyFatTrend30 = ema(last30BodyFatPct, 0.15)
```

### 18.4 Body composition insights

Examples:

- “Weight trend is down 1.2 lb over 30 days.”
- “Body fat trend appears down while lean mass is stable.”
- “Daily scale readings are noisy; trend is more useful than one measurement.”

Do not make body composition a major Recovery Score input in v1.

---

## 19. Wellbeing Score

### 19.1 Purpose

Requirement ID: `ALG-WELL-001`

Wellbeing Score is an optional home widget that blends major domains into a single high-level score. It should not replace Sleep, Recovery, Readiness, or Activity.

### 19.2 Formula

Initial formula:

| Component | Weight |
|---|---:|
| Recovery Score | 30% |
| Sleep Score | 25% |
| Activity Balance | 15% |
| Nutrition/Hydration Score | 15% |
| Subjective Check-in | 10% |
| Stress/Consistency Context | 5% |

If nutrition or subjective check-in is missing, reweight cautiously and mark confidence medium/low.

### 19.3 Use in app

- Home widget only.
- Optional.
- User can hide it.
- AI may reference it only as a summary score.

---

## 20. Bedtime Planner

### 20.1 Purpose

Requirement ID: `ALG-BED-001`

Bedtime Planner recommends ranked bedtime windows for a specified next-day wake time. It should account for the user’s sleep latency, personal sleep need, sleep debt, sleep consistency, estimated sleep-cycle timing, circadian tendencies, recovery needs, and next-day goals.

This is a key differentiating feature for Primis and should live inside the Sleep section, with optional Home widget surfacing.

### 20.2 User inputs

| Input | Required? | Notes |
|---|---:|---|
| Target wake time | Required | User-specified for next day. |
| Wake flexibility | Optional | strict / flexible +/- 15 / flexible +/- 30. |
| Desired sleep duration | Optional | Defaults to personal sleep need. |
| Next-day training importance | Optional | none / moderate / intense / competition. |
| Alarm strictness | Optional | hard alarm vs flexible. |

### 20.3 Algorithm inputs

| Input | Source |
|---|---|
| Historical sleep latency | sleep session if available / user input / inferred |
| Personal sleep need | user target / historical high-recovery nights / default 8h |
| Sleep debt | derived |
| Sleep consistency | derived |
| Chronotype/circadian tendency | historical bedtime/wake time distribution |
| Sleep-cycle estimate | default 90 min; adapt over time if evidence exists |
| Wake quality history | subjective morning energy + sleep score + recovery |
| Next-day goals | user goals / manual input |

### 20.4 Sleep latency estimate

Requirement ID: `ALG-BED-002`

Calculate sleep latency from provider if available. If unavailable, infer cautiously or ask user to input typical latency.

Recommended fallback order:

1. provider sleep latency
2. time in bed minus sleep duration if reliable
3. user-entered typical latency
4. default 20 minutes

Store:

```typescript
type SleepLatencyProfile = {
  medianLatencyMinutes: number;
  p75LatencyMinutes: number;
  sampleCount: number;
  confidence: ScoreConfidence;
};
```

Use p75 latency for conservative recommendations.

### 20.5 Sleep-cycle estimate

Requirement ID: `ALG-BED-003`

Use 90 minutes as an initial heuristic, but do not present it as exact science.

```typescript
type SleepCycleProfile = {
  estimatedCycleMinutes: number; // default 90
  confidence: ScoreConfidence;
  basis: 'default' | 'personalized_from_history';
};
```

Personalize only after enough data:

- sleep stages available
- wake quality logs exist
- enough nights with varying wake timing

### 20.6 Circadian tendency

Requirement ID: `ALG-BED-004`

Compute a rough chronotype/circadian tendency from historical sleep times.

Fields:

```typescript
type CircadianProfile = {
  medianBedtimeLocal: string;
  medianWakeTimeLocal: string;
  bedtimeIqrMinutes: number;
  wakeTimeIqrMinutes: number;
  consistencyScore: number;
  chronotypeLabel: 'early' | 'neutral' | 'late' | 'unknown';
  confidence: ScoreConfidence;
};
```

Do not over-medicalize chronotype. Use for practical recommendations.

### 20.7 Bedtime candidate generation

Requirement ID: `ALG-BED-005`

Given target wake time, generate candidate “lights out” times by subtracting sleep-cycle multiples plus latency.

Candidate sleep-cycle counts:

- 6 cycles = ~9h sleep opportunity
- 5 cycles = ~7.5h sleep opportunity
- 4 cycles = ~6h sleep opportunity
- 3 cycles = ~4.5h emergency option, usually not recommended except informational

Formula:

```text
candidate_bedtime = target_wake_time - (cycle_count * estimated_cycle_minutes) - sleep_latency_buffer
```

Use sleep latency buffer:

```text
sleep_latency_buffer = max(median_latency, p75_latency if strict wake time)
```

### 20.8 Candidate scoring

Requirement ID: `ALG-BED-006`

Each candidate should receive a `bedtime_fit_score` from 0–100.

Suggested components:

| Component | Weight | Description |
|---|---:|---|
| Sleep duration fit | 35% | Matches personal sleep need and sleep debt. |
| Cycle alignment | 20% | Wakes near estimated cycle boundary. |
| Circadian compatibility | 20% | Not too far from normal bedtime unless needed. |
| Recovery need | 15% | High sleep debt/low recovery favors earlier options. |
| Practicality | 10% | Avoids unrealistic bedtime relative to current time/context. |

### 20.9 Sleep duration fit

```typescript
function bedtimeDurationFitScore(candidateSleepHours: number, targetSleepNeed: number, sleepDebtHours: number): number {
  const adjustedNeed = targetSleepNeed + clamp(sleepDebtHours * 0.20, 0, 0.75);
  return sleepDurationScore(candidateSleepHours, adjustedNeed);
}
```

### 20.10 Circadian compatibility score

```typescript
function circadianCompatibilityScore(candidateBedtimeMinutes: number, medianBedtimeMinutes: number): number {
  const deviation = circularMinuteDifference(candidateBedtimeMinutes, medianBedtimeMinutes);
  if (deviation <= 30) return 100;
  if (deviation <= 60) return 85;
  if (deviation <= 120) return 65;
  if (deviation <= 180) return 40;
  return 20;
}
```

### 20.11 Recovery need adjustment

If Recovery Score is low or sleep debt is high, earlier options should be ranked higher.

```typescript
function recoveryNeedBonus(candidateSleepHours: number, targetSleepNeed: number, recoveryScore: number | null, sleepDebt: number): number {
  let bonus = 0;
  if (recoveryScore != null && recoveryScore < 60 && candidateSleepHours >= targetSleepNeed) bonus += 8;
  if (sleepDebt >= 2 && candidateSleepHours >= targetSleepNeed + 0.25) bonus += 8;
  return clamp(bonus, 0, 15);
}
```

### 20.12 Bedtime recommendation output

```typescript
type BedtimeRecommendation = {
  targetWakeTimeLocal: string;
  generatedAt: string;
  algorithmVersion: 'bedtime_planner_v1_0';
  recommendations: Array<{
    rank: number;
    label: 'best' | 'good' | 'last_acceptable' | 'emergency';
    bedtimeWindowStartLocal: string;
    bedtimeWindowEndLocal: string;
    lightsOutTargetLocal: string;
    expectedSleepLatencyMinutes: number;
    expectedSleepDurationHours: number;
    expectedCycles: number;
    fitScore: number;
    rationale: string[];
    tradeoffs: string[];
  }>;
  assumptions: {
    sleepNeedHours: number;
    sleepCycleMinutes: number;
    latencyMinutes: number;
    sleepDebtHours: number;
    circadianProfileConfidence: ScoreConfidence;
  };
};
```

### 20.13 Example output

```json
{
  "targetWakeTimeLocal": "06:45",
  "recommendations": [
    {
      "rank": 1,
      "label": "best",
      "bedtimeWindowStartLocal": "22:05",
      "bedtimeWindowEndLocal": "22:25",
      "lightsOutTargetLocal": "22:15",
      "expectedSleepLatencyMinutes": 20,
      "expectedSleepDurationHours": 8.5,
      "expectedCycles": 5,
      "fitScore": 91,
      "rationale": [
        "Best match for your current sleep debt and target wake time.",
        "Close to your recent bedtime pattern.",
        "Gives enough sleep opportunity for stronger recovery."
      ],
      "tradeoffs": []
    },
    {
      "rank": 2,
      "label": "good",
      "bedtimeWindowStartLocal": "23:35",
      "bedtimeWindowEndLocal": "23:55",
      "lightsOutTargetLocal": "23:45",
      "expectedSleepLatencyMinutes": 20,
      "expectedSleepDurationHours": 7.0,
      "expectedCycles": 4,
      "fitScore": 74,
      "rationale": [
        "Still likely cycle-aligned, but shorter than ideal for your current recovery state."
      ],
      "tradeoffs": ["May leave some sleep debt tomorrow."]
    }
  ]
}
```

### 20.14 UI behavior

- Show windows, not exact magic times.
- Explain assumptions.
- Let user edit wake time quickly.
- Let user save target wake time to Home widget.
- Allow “strict alarm” and “flexible wake” mode later.

### 20.15 Acceptance criteria

| ID | Acceptance Criteria |
|---|---|
| ALG-BED-AC-001 | User can input target wake time and receive ranked bedtime windows. |
| ALG-BED-AC-002 | Recommendations account for sleep latency. |
| ALG-BED-AC-003 | Recommendations account for sleep debt and recovery state. |
| ALG-BED-AC-004 | Recommendations do not claim exact sleep-cycle certainty. |
| ALG-BED-AC-005 | Recommendation object includes assumptions and rationale. |
| ALG-BED-AC-006 | Home widget can show best bedtime window. |

---

## 21. Trend and Insight Engine

### 21.1 Purpose

Requirement ID: `ALG-INSIGHT-001`

The Insight Engine generates structured, deterministic insight candidates from score components, baselines, deviations, trends, and correlations. AI uses these candidates to create natural-language summaries and chat answers.

### 21.2 Insight candidate schema

```typescript
type InsightCandidate = {
  id: string;
  userId: string;
  localDate: string;
  insightType:
    | 'baseline_deviation'
    | 'trend_change'
    | 'correlation'
    | 'recommendation'
    | 'missing_data'
    | 'achievement'
    | 'risk_flag'
    | 'bedtime_recommendation';
  domain:
    | 'sleep'
    | 'recovery'
    | 'training'
    | 'activity'
    | 'nutrition'
    | 'hydration'
    | 'caffeine'
    | 'alcohol'
    | 'digestion'
    | 'body_composition'
    | 'general';
  severity: 'positive' | 'neutral' | 'watch' | 'important';
  confidence: ScoreConfidence;
  title: string;
  evidence: Record<string, unknown>;
  recommendedAction?: string;
  sourceMetricCodes: string[];
  algorithmVersion: string;
};
```

### 21.3 Baseline deviation insights

Generate insights when:

- HRV below baseline by >10%
- RHR above baseline by >5%
- respiratory rate above baseline by >5–8%
- sleep duration below target by >60 minutes
- sleep debt >2 hours
- training load ratio >1.5
- SpO2 unusually low or below threshold

Example:

```json
{
  "insightType": "baseline_deviation",
  "domain": "recovery",
  "severity": "watch",
  "title": "HRV is below your recent baseline",
  "evidence": {
    "todayHrv": 58,
    "baselineHrv30d": 68,
    "percentDeviation": -14.7
  },
  "recommendedAction": "Consider moderate or lower-intensity training today."
}
```

### 21.4 Trend change insights

Generate when rolling trend changes materially:

- 7-day sleep average down >30 min vs 30-day average
- 7-day RHR up >3 bpm vs 30-day average
- 7-day HRV down >10% vs 30-day average
- 7-day steps down >25% vs 30-day average
- 30-day body weight trend changed by threshold

### 21.5 Achievement insights

Positive insights matter for retention.

Examples:

- “Best sleep consistency in 30 days.”
- “Steps goal hit 5 days in a row.”
- “HRV is trending back toward baseline.”
- “Training load returned to steady range.”

### 21.6 Missing data insights

Generate when a score is weak because data is missing.

Examples:

- “Wearable did not record HRV last night.”
- “Nutrition score is unavailable because no food/macros were logged.”
- “Bedtime Planner is using default sleep latency until more data is available.”

---

## 22. Correlation Engine

### 22.1 Purpose

Requirement ID: `ALG-CORR-001`

Correlation Engine identifies patterns between manual inputs/tags and objective outcomes. It should be cautious, evidence-based, and transparent.

### 22.2 Initial variables

Manual/lifestyle inputs:

- caffeine amount
- latest caffeine time
- alcohol amount/type
- hydration
- late meal
- custom tags
- stress
- mood
- energy
- soreness
- poop/bloating/digestion
- travel
- sick tag
- supplements if later added

Outcomes:

- Sleep Score
- sleep duration
- sleep efficiency
- sleep latency
- HRV next morning
- RHR next morning
- Recovery Score
- Training Readiness
- subjective energy next day
- digestion symptoms

### 22.3 Lag windows

Correlations should support lagged effects.

| Input | Outcome lag |
|---|---|
| caffeine | same-night sleep, next-day recovery |
| alcohol | same-night sleep, next-day HRV/RHR/recovery |
| hydration | same-day activity, next-day recovery, digestion |
| late meal | same-night sleep, next-day digestion/recovery |
| hard workout | next-day HRV/RHR/soreness/recovery |
| stress | same-night sleep, next-day recovery |
| gut symptoms | same-day tags, previous-day nutrition |

### 22.4 Minimum sample requirements

Requirement ID: `ALG-CORR-002`

Do not show correlations too early.

| Evidence level | Minimum samples | Display behavior |
|---|---:|---|
| Not enough data | <6 paired samples | Do not show correlation. |
| Early signal | 6–11 paired samples | Show cautiously: “early pattern.” |
| Medium confidence | 12–24 paired samples | Show with confidence label. |
| Higher confidence | 25+ paired samples | Show as a stronger personal trend. |

### 22.5 Correlation methods

For v1:

- compare average outcome on tagged days vs non-tagged days
- use simple effect size, not only correlation coefficient
- control lightly for sleep duration/training load where possible

Example:

```typescript
type TagOutcomeEffect = {
  tagCode: string;
  outcomeMetric: string;
  lagDays: number;
  taggedSampleCount: number;
  untaggedSampleCount: number;
  taggedAverage: number;
  untaggedAverage: number;
  difference: number;
  percentDifference?: number;
  confidence: ScoreConfidence;
};
```

### 22.6 Correlation language

Allowed:

- “On days you logged alcohol, your next-day recovery averaged 9 points lower.”
- “This is an early pattern, not a conclusion.”
- “Worth tracking more.”

Not allowed:

- “Alcohol caused your low recovery.”
- “This proves caffeine ruins your sleep.”

### 22.7 Custom tags

Custom tags are useful but messy. They should be treated as user-defined categorical events.

Rules:

- custom tags can generate correlations after sample thresholds
- custom tags should not affect core scores directly unless mapped to a known category
- user can merge/rename tags later
- AI can suggest turning repeated notes into structured tags

---

## 23. Recommendation Engine

### 23.1 Purpose

Requirement ID: `ALG-RECENG-001`

Recommendation Engine turns scores and insight candidates into structured actions before AI phrasing.

### 23.2 Recommendation types

```typescript
type RecommendationType =
  | 'training_intensity'
  | 'sleep_timing'
  | 'hydration'
  | 'nutrition'
  | 'recovery_behavior'
  | 'data_logging'
  | 'trend_tracking';
```

### 23.3 Training recommendation logic

Inputs:

- Training Readiness
- Recovery Score
- acute/chronic load
- soreness
- sleep debt
- goal context

Example logic:

```typescript
function recommendTrainingIntensity(ctx: TrainingContext): TrainingIntensityRecommendation {
  if (ctx.recoveryScore < 35 || ctx.sleepDebtHours > 5) return 'rest_or_light';
  if (ctx.readinessScore < 55 || ctx.soreness === 'high') return 'light';
  if (ctx.readinessScore < 70 || ctx.acuteChronicRatio > 1.5) return 'moderate';
  if (ctx.readinessScore >= 85 && ctx.acuteChronicRatio <= 1.2) return 'high';
  return 'moderate';
}
```

### 23.4 Recovery behavior recommendations

Potential actions:

- lower intensity today
- prioritize earlier bedtime
- walk / zone 2 / mobility
- hydrate
- avoid late caffeine
- avoid alcohol if recovery is already low
- log soreness/stress to improve context

Do not prescribe supplements or medical treatments in v1.

### 23.5 Recommendation output schema

```typescript
type StructuredRecommendation = {
  id: string;
  userId: string;
  localDate: string;
  recommendationType: RecommendationType;
  priority: 'low' | 'medium' | 'high';
  confidence: ScoreConfidence;
  action: string;
  rationaleEvidenceIds: string[];
  avoidLanguage?: string[];
  createdAt: string;
  algorithmVersion: string;
};
```

---

## 24. AI Integration Boundary

### 24.1 Purpose

Requirement ID: `ALG-AI-001`

The scoring system must provide structured context to the AI layer. It should not rely on AI to invent formulas or infer from raw time-series data.

### 24.2 AI receives

AI should receive compact context packets:

- latest score snapshots
- component drivers
- relevant baselines
- recent trend deltas
- selected insight candidates
- structured recommendations
- user goals/preferences
- coach/summary tone
- explicit missing-data notes

### 24.3 AI must not receive by default

- entire raw provider payload history
- unbounded health time series
- secrets/tokens
- unnecessary historical data
- unsupported medical claims

### 24.4 Example scoring-to-AI packet

```json
{
  "localDate": "2026-06-02",
  "scores": {
    "sleep": { "score": 74, "band": "good", "confidence": "medium" },
    "recovery": { "score": 62, "band": "moderate", "confidence": "medium" },
    "trainingReadiness": { "score": 58, "band": "moderate", "confidence": "medium" }
  },
  "topDrivers": [
    {
      "domain": "recovery",
      "title": "HRV below baseline",
      "evidence": { "percentDeviation": -12 }
    },
    {
      "domain": "sleep",
      "title": "Sleep debt elevated",
      "evidence": { "sleepDebtHours": 2.4 }
    }
  ],
  "recommendations": [
    {
      "type": "training_intensity",
      "action": "Use moderate intensity today rather than max-effort work."
    }
  ]
}
```

### 24.5 Acceptance criteria

| ID | Acceptance Criteria |
|---|---|
| ALG-AI-AC-001 | AI chat and summaries use score snapshots and insight candidates. |
| ALG-AI-AC-002 | AI does not compute core score values from raw data. |
| ALG-AI-AC-003 | AI responses can cite structured drivers from score components. |
| ALG-AI-AC-004 | If data is missing, AI says what is missing and why confidence is limited. |

---

## 25. Score Computation Jobs

### 25.1 Daily scoring job

Requirement ID: `ALG-JOB-001`

Triggered after provider sync or on schedule.

Steps:

```text
1. Determine user-local day boundaries.
2. Load canonical metrics and domain summaries.
3. Update daily summaries.
4. Update rolling baselines.
5. Compute Sleep Score if sleep session exists.
6. Compute Sleep Debt.
7. Compute Recovery Score.
8. Compute Training Load / Strain.
9. Compute Training Readiness.
10. Compute Activity Score.
11. Compute Nutrition Score if nutrition logs exist.
12. Generate insight candidates.
13. Generate structured recommendations.
14. Write score snapshots and invalidate dashboard cache.
```

### 25.2 Historical backfill/reprocessing job

Requirement ID: `ALG-JOB-002`

Used when:

- user first connects provider
- new historical data imported
- algorithm version changes
- bug fix requires recomputation

Must be idempotent and version-aware.

### 25.3 Incremental recomputation

Requirement ID: `ALG-JOB-003`

When a user logs manual input, water, caffeine, alcohol, nutrition, or gut data, recompute affected scores only:

| Input changed | Recompute |
|---|---|
| Water | Nutrition, hydration insights |
| Caffeine | Nutrition, sleep-risk insights, correlation candidates |
| Alcohol | Nutrition, recovery correlation candidates |
| Soreness | Training Readiness, recommendations |
| Sleep session | Sleep, sleep debt, recovery, bedtime profile |
| Workout | Training load, readiness, activity |
| Weight/body comp | Body trend summaries |

---

## 26. Algorithm Versioning

### 26.1 Version format

Requirement ID: `ALG-VERSION-001`

Use explicit algorithm versions:

```text
sleep_score_v1_0
recovery_score_v1_0
training_readiness_v1_0
training_load_v1_0
nutrition_score_v1_0
bedtime_planner_v1_0
correlation_engine_v1_0
```

### 26.2 Storage requirements

Every derived record MUST store:

- `algorithm_version`
- `computed_at`
- input data window
- component values
- missing data metadata

### 26.3 Reprocessing policy

When algorithm versions change:

- do not silently overwrite old scores without storing version
- allow backfill to recompute historical scores
- UI should generally show latest version
- internal analysis may compare versions

---

## 27. Testing Strategy

### 27.1 Unit tests

Each scoring primitive and score module MUST have unit tests.

Minimum test classes:

```text
baseline calculation tests
missing data tests
sleep score tests
recovery score tests
training load tests
readiness recommendation tests
nutrition score tests
bedtime planner tests
correlation threshold tests
confidence assignment tests
```

### 27.2 Golden fixtures

Requirement ID: `ALG-TEST-001`

Create realistic fixture users:

| Fixture | Description |
|---|---|
| `new_user_sparse_data` | Few days of data, many missing metrics. |
| `consistent_athlete` | Stable sleep/training, high data completeness. |
| `overreached_athlete` | Elevated training load, low HRV, high RHR. |
| `poor_sleep_week` | Elevated sleep debt and irregular schedule. |
| `nutrition_logger` | Manual macros/water/caffeine/alcohol logs. |
| `shifted_bedtime_user` | Late chronotype / inconsistent bedtime. |
| `hume_body_comp_user` | Body composition trend data available. |

### 27.3 Snapshot tests

For each fixture, expected outputs should be stored and checked:

- score values within tolerance
- score states
- top drivers
- recommendation categories
- confidence levels

### 27.4 Property tests

Important invariants:

- score always within 0–100
- missing optional data should not crash
- missing required data should produce explicit state
- increasing sleep duration toward target should not lower duration score
- HRV below baseline should not improve HRV balance score
- RHR above baseline should not improve RHR score
- bedtime planner should always return valid ranked windows

---

## 28. Implementation Module Structure

Recommended backend module structure:

```text
/src/scoring
  /core
    clamp.ts
    weightedScore.ts
    baseline.ts
    timeWindows.ts
    circularTime.ts
    confidence.ts
  /sleep
    sleepScore.ts
    sleepDebt.ts
    sleepConsistency.ts
  /recovery
    recoveryScore.ts
    hrvBalance.ts
    restingHr.ts
    respiratory.ts
    spo2.ts
  /training
    trainingLoad.ts
    trainingReadiness.ts
    strain.ts
  /nutrition
    nutritionScore.ts
    hydration.ts
    caffeine.ts
    alcohol.ts
  /digestion
    gutSignals.ts
  /body
    bodyCompositionTrends.ts
  /bedtime
    bedtimePlanner.ts
    sleepLatencyProfile.ts
    circadianProfile.ts
  /insights
    insightEngine.ts
    trendInsights.ts
    correlationEngine.ts
    recommendationEngine.ts
  /jobs
    dailyScoringJob.ts
    backfillScoringJob.ts
```

Scoring modules should be pure where possible. Database read/write should be handled by job orchestration layers, not embedded deeply inside formula functions.

---

## 29. API Contracts for Mobile

### 29.1 Dashboard score endpoint

```http
GET /v1/dashboard/today
```

Returns:

```typescript
type TodayDashboardResponse = {
  localDate: string;
  lastSyncedAt: string | null;
  scores: {
    sleep?: ScoreSummary;
    recovery?: ScoreSummary;
    trainingReadiness?: ScoreSummary;
    activity?: ScoreSummary;
    nutrition?: ScoreSummary;
    wellbeing?: ScoreSummary;
  };
  topInsights: InsightCard[];
  recommendations: RecommendationCard[];
  bedtimeWidget?: BedtimeWidgetSummary;
};
```

### 29.2 Score detail endpoint

```http
GET /v1/scores/{scoreType}?date=YYYY-MM-DD
```

Returns component breakdown, trends, and explanations.

### 29.3 Bedtime planner endpoint

```http
POST /v1/sleep/bedtime-plan
```

Request:

```typescript
type BedtimePlanRequest = {
  targetWakeTimeLocal: string;
  targetDate: string;
  wakeFlexibility?: 'strict' | 'plus_minus_15' | 'plus_minus_30';
  nextDayTrainingImportance?: 'none' | 'moderate' | 'intense' | 'competition';
};
```

Response: `BedtimeRecommendation`.

### 29.4 Manual input recalculation behavior

After manual input is saved:

```http
POST /v1/manual-inputs
```

Backend should enqueue affected-score recomputation and return optimistic accepted state. Mobile should update local cache where possible.

---

## 30. Safety and Language Guardrails

### 30.1 Allowed recommendation language

Allowed examples:

- “Your recovery markers are mixed today.”
- “You appear better suited for moderate training.”
- “Your HRV is below your recent baseline.”
- “Your respiratory rate is higher than usual.”
- “If this persists or feels concerning, consider discussing it with a clinician.”

### 30.2 Disallowed language

Disallowed examples:

- “You are sick.”
- “You have overtraining syndrome.”
- “You have sleep apnea.”
- “You should take medication.”
- “This proves X caused Y.”
- “You are safe to train maximally.”

### 30.3 Safety escalation for concerning logs

If a user logs severe symptoms or extreme data values, Primis can say:

```text
This is outside the scope of performance coaching. If this is severe, persistent, or concerning, consider contacting a qualified clinician.
```

Do not provide diagnosis.

---

## 31. Private Beta Tuning Plan

### 31.1 First 14 days

State: `learning_baseline`

- Show provisional scores.
- Use provider history if available.
- Avoid strong correlation claims.
- Emphasize data collection and baseline learning.

### 31.2 Days 15–30

State: `partial_baseline`

- Start using 14-day baselines.
- Show early trend insights.
- Begin sleep consistency and debt modeling.
- Correlations still cautious.

### 31.3 Days 31–90

State: `ready_baseline`

- Main 30-day baseline available.
- Stronger recovery/training insights.
- Correlation engine can show medium-confidence patterns if sample counts exist.

### 31.4 After 90 days

State: `mature_baseline`

- 90-day baselines available.
- Better HRV balance and circadian profile.
- More confident bedtime and behavior insights.

---

## 32. MVP Algorithm Priorities

### 32.1 Phase 0: Technical validation

Implement only enough scoring to validate data:

- raw metric availability report
- basic daily summaries
- provisional sleep duration
- provisional steps/activity
- provisional HRV/RHR display if available

### 32.2 Phase 1: Private daily-use MVP

Implement:

- Sleep Score v1
- Recovery Score v1
- Activity Score v1
- basic Training Load
- basic insight candidates
- dashboard score summaries

### 32.3 Phase 2: Intelligence expansion

Implement:

- Training Readiness
- Sleep Debt
- Bedtime Planner
- Nutrition Score basic
- manual input modifiers
- correlation engine v1
- structured recommendations
- AI scoring context packets

### 32.4 Phase 3: iOS enrichment

Implement:

- HealthKit metric integration
- Hume-via-Apple-Health body composition trends
- provider conflict resolution in score inputs

---

## 33. Open Algorithm Questions

These are not blockers for implementation but should be revisited after real data is available.

| ID | Question | Initial stance |
|---|---|---|
| ALG-OPEN-001 | Does Google expose provider-level sleep/readiness scores? | Validate in Phase 0. Primis computes its own either way. |
| ALG-OPEN-002 | How accurate is Fitbit Air HRV/RHR/sleep stage data in practice? | Use private beta observation; avoid overfitting. |
| ALG-OPEN-003 | Should score weights become user-adjustable? | No for v1. User customizes dashboard/goals/tone, not formulas. |
| ALG-OPEN-004 | How strongly should nutrition influence recovery? | Lightly in v1; correlations later. |
| ALG-OPEN-005 | Should subjective mood/energy affect Wellbeing more than Recovery? | Yes. Recovery remains objective-heavy. |
| ALG-OPEN-006 | Should Primis use population benchmarks later? | Maybe after public beta; personal baselines first. |
| ALG-OPEN-007 | How should body composition affect coaching? | Trend insights first, not core readiness. |

---

## 34. References and Research Anchors

These references are not source code requirements, but they inform product/algorithm direction:

1. Google Health API data types — https://developers.google.com/health/data-types
2. Oura readiness concepts and contributors — https://ouraring.com/blog/readiness-score/ and https://support.ouraring.com/hc/articles/360057791533-Readiness-Contributors
3. WHOOP recovery concepts — https://www.whoop.com/us/en/thelocker/
4. Apple watchOS training load concept — https://www.apple.com/newsroom/2024/06/watchos-11-brings-powerful-health-and-fitness-insights/
5. Apple Watch training load support — https://support.apple.com/guide/watch/track-your-training-load-apde4c07a6cf/watchos
6. Health Connect data types — https://developer.android.com/health-and-fitness/health-connect/data-types
7. USDA FoodData Central API/downloads — https://fdc.nal.usda.gov/api-guide and https://fdc.nal.usda.gov/download-datasets

---

## 35. Final Implementation Guidance

The Primis scoring system should be built like a serious internal analytics product, not a pile of UI calculations.

Implementation priorities:

1. Build canonical metric summaries first.
2. Build baseline computation second.
3. Build score components third.
4. Build composite scores fourth.
5. Build insight candidates fifth.
6. Build AI context handoff sixth.
7. Build model tuning only after real user data exists.

The strongest product outcome will come from **excellent data modeling + thoughtful deterministic algorithms + polished UI + AI explanations**, in that order.

AI coding agents must treat this document as the scoring source of truth and should not create untracked formulas or hidden score logic in mobile components, prompt templates, or API handlers.

---

## V1.1 Amendment — Google Health Sleep Field Mapping and Sleep Visualization Inputs

**Status:** Required scoring amendment.  
**Reason:** Sleep is a flagship Primis surface, and Google Health API documentation confirms sleep stages, summaries, metadata, and sleep-related vitals that the scoring engine must use when available.

### 31.1 Google Health sleep-to-Primis algorithm mapping

The score engine MUST consume normalized records, but implementers need this provider mapping:

| Google Health sleep field | Normalized field/table | Algorithm use |
|---|---|---|
| `sleep.interval` | `sleep_sessions.start_time_utc`, `sleep_sessions.end_time_utc` | Sleep session duration, local wake date, schedule. |
| `sleep.type` | `sleep_sessions.provider_sleep_type` | Select stages vs classic fallback logic. |
| `sleep.stages[]` | `sleep_stage_intervals` | Stage balance, interruptions, chart segments. |
| `sleep.outOfBedSegments[]` | `sleep_out_of_bed_segments` | Interruptions, wake disruption, AI explanation. |
| `sleep.metadata.processed` | `sleep_sessions.provider_processed` | Confidence and missing-data state. |
| `sleep.metadata.stagesStatus` | `sleep_sessions.provider_stages_status` | Stage-confidence handling. |
| `sleep.metadata.nap` | `sleep_sessions.is_nap` | Exclude/handle naps separately. |
| `sleep.metadata.manuallyEdited` | `sleep_sessions.manually_edited` | Confidence and evidence note. |
| `sleep.summary.stagesSummary[]` | `sleep_stage_summaries` | Stage totals and segment counts. |
| `sleep.summary.minutesInSleepPeriod` | `sleep_sessions.minutes_in_sleep_period` | Time in bed / sleep period. |
| `sleep.summary.minutesAfterWakeUp` | `sleep_sessions.minutes_after_wake_up` | Sleep quality and wake-after-sleep context. |
| `sleep.summary.minutesToFallAsleep` | `sleep_sessions.minutes_to_fall_asleep` | Latency score and bedtime planner. |
| `sleep.summary.minutesAsleep` | `sleep_sessions.minutes_asleep` | Sleep duration score. |
| `sleep.summary.minutesAwake` | `sleep_sessions.minutes_awake` | Efficiency and interruptions. |

### 31.2 Required sleep fallback modes

Sleep scoring MUST support these modes:

| Mode | Conditions | Scoring behavior | Confidence |
|---|---|---|---|
| `stages_full` | `provider_sleep_type=STAGES`, stages present, summary present, stages status succeeded | Use full Sleep Score formula. | high/medium depending baseline depth |
| `classic_sleep` | classic stages only: awake/restless/asleep | Use duration, efficiency, latency, restless/awake proxies; skip REM/deep balance. | medium/low |
| `summary_only` | summary present but intervals missing | Use duration, latency, awake/asleep totals; skip timeline-specific stage balance. | medium/low |
| `session_only` | only start/end interval present | Compute duration/timing only; mark provisional. | low |
| `unprocessed_or_rejected` | stages status rejected/timeout/not processed | Compute safe fallback and expose reason. | low |
| `missing_sleep` | no main sleep session | no Sleep Score; show missing-data state. | unknown |

### 31.3 Sleep Score component updates

The existing Sleep Score formula remains valid, but component inputs are now stricter:

```text
Sleep Score =
  25% sleep duration vs target
  20% sleep efficiency
  15% sleep consistency
  15% stage balance
  15% overnight recovery signals
  10% sleep debt impact
```

Rules:

- `sleep duration` MUST prefer `minutesAsleep` when available, otherwise derive from stage intervals, otherwise derive from session interval with lower confidence.
- `time in bed / sleep period` MUST prefer `minutesInSleepPeriod` when available.
- `sleep efficiency` SHOULD be `minutesAsleep / minutesInSleepPeriod` when both exist.
- `stage balance` MUST use LIGHT/DEEP/REM/AWAKE stage summaries when `STAGES` is available.
- If only `CLASSIC` sleep exists, `stage balance` MUST be replaced with a `classic_sleep_quality` component based on ASLEEP/RESTLESS/AWAKE ratios and marked lower confidence.
- `overnight recovery signals` SHOULD use daily HRV, deep-sleep RMSSD, non-REM HR, RHR, respiratory rate, SpO2, and sleep temperature derivation when available.

### 31.4 Sleep visualization is an algorithm output dependency

The scoring package or summary workers MUST produce chart-ready data for UI:

```ts
type SleepStageChartSegment = {
  sleepSessionId: string;
  stageType: 'awake' | 'light' | 'deep' | 'rem' | 'asleep' | 'restless' | 'unknown';
  startOffsetSeconds: number;
  endOffsetSeconds: number;
  durationSeconds: number;
  displayLane: number;
  colorToken: string;
  confidence: 'high' | 'medium' | 'low';
};
```

The UI must not be forced to calculate all segment offsets and lanes on render. Backend/scoring summary jobs should precompute them whenever possible.

### 31.5 Derived equivalents for Google Health UI concepts

Primis MUST compute transparent equivalents when proprietary Google Health concepts are not exposed directly:

| Google Health concept | Primis-derived equivalent |
|---|---|
| Sleep Score | `primis_sleep_score` |
| Readiness | `primis_recovery_score` + `primis_training_readiness_score` |
| Cardio Load | `primis_training_load` / `primis_cardio_load_equivalent` |
| Vitals in range | `primis_personal_range_status` per metric |
| Sound sleep | `primis_sound_sleep_minutes` from LIGHT/DEEP/REM with low disruption and steady HR if available |
| Time to sound sleep | `primis_sleep_latency_minutes`, using provider `minutesToFallAsleep` first |
| Restlessness | `primis_restlessness_minutes` / `primis_restless_segment_count` from RESTLESS/awake/brief disruptions |
| Interruptions | `primis_interruption_count` from awake/out-of-bed segments above threshold |

### 31.6 Sleep evidence generation

Every Sleep Score snapshot MUST generate evidence objects usable by AI and UI:

```text
sleep_duration_vs_target
sleep_efficiency
sleep_latency
sleep_stage_balance
sleep_deep_minutes
sleep_rem_minutes
sleep_awake_minutes
sleep_restless_minutes
sleep_interruption_count
hrv_vs_baseline
rhr_vs_baseline
respiratory_vs_baseline
spo2_status
sleep_debt
bedtime_consistency
wake_time_consistency
provider_stage_status
```

### 31.7 Tests required

Add unit tests for:

- full STAGES sleep with Awake/Light/Deep/REM
- CLASSIC sleep with Awake/Restless/Asleep
- summary-only sleep
- rejected stages status
- nap handling
- manually edited sleep
- missing HRV/RHR but complete sleep data
- complete vitals but missing stage data
- chart segment offset generation


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

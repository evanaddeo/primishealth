# ADR-002: AiIntent Enum Value Count — Spec vs. Plan Annotation

**Date:** 2026-06-09
**Status:** Accepted
**CU:** CU-008

---

## Context

`plans/phase-b-shared-contracts-health-model-foundations.md §4 CU-008` states:

> `AiIntent` — exact **19-value** union from AI Context Engine Spec §7.2

However, `primis_ai_context_engine_spec.md §7.2` defines the `AiIntent` TypeScript type with
**20 values**:

```
'daily_status' | 'sleep_analysis' | 'recovery_analysis' | 'training_recommendation' |
'workout_summary' | 'activity_trend' | 'nutrition_coaching' | 'hydration_caffeine_alcohol' |
'body_composition_analysis' | 'gut_digestion_analysis' | 'bedtime_planning' | 'weekly_review' |
'monthly_review' | 'metric_explanation' | 'correlation_query' | 'data_availability_question' |
'app_help' | 'general_health_education' | 'unsupported_medical_request' | 'unknown'
```

The count discrepancy (19 in the plan annotation vs. 20 in the spec) was detected during
CU-008 implementation. The Phase B plan acceptance criteria also state "19 values", but
the acceptance criteria derive from the plan — not from the spec directly.

## Decision

Use the **AI Context Engine Spec §7.2 values** as the authoritative source: **20 values**.

Per the source-priority order in `plans/phase-b-shared-contracts-health-model-foundations.md §2`,
the spec document takes precedence over plan annotations when they conflict. The plan's
annotation of "19 values" is a documentation error in the plan itself; the spec is correct.

`packages/core-types/src/ai.ts` exports all 20 values from the spec. The test in
`packages/core-types/test/enums.test.ts` asserts `AI_INTENTS.length === 20` and explicitly
lists all 20 values against the spec.

## Consequences

- `AiIntent` has 20 members, not 19. Any future agent that reads the Phase B plan's count
  annotation of "19 values" must defer to the spec and to this ADR.
- The Phase B plan acceptance criteria line "AiIntent union matches AI Context Engine Spec §7.2
  exactly (19 values)" is superseded by this ADR. The correct assertion is 20 values.
- No code change is required — the CU-008 implementation was already correct.
- Future changes to `AiIntent` must update both the spec and this ADR.

/**
 * Tests for CU-081 — SafetyPolicyEngine.
 *
 * The engine is the core guardrail: it maps a coarse safety category to a concrete
 * ruling (allow / allow-with-constraints / route-to-safe-response) and folds in
 * data-quality disclosures. These tests assert the medical boundary, emergency +
 * self-harm routing, unsafe-training reduction, nutrition-risk guardrails, and the
 * missing-data / low-confidence / nutrition-estimate disclosures (AI-SAFE-001..008).
 */

import { describe, expect, it } from 'vitest';

import {
  SafetyPolicyEngine,
  deriveDataDisclosures,
  EMERGENCY_SAFE_RESPONSE,
  SELF_HARM_SAFE_RESPONSE,
  type SafetyDataSignals,
} from '../src/index.js';

const engine = new SafetyPolicyEngine();

const FRESH_SIGNALS: SafetyDataSignals = {
  freshness: 'fresh',
  hasMissingData: false,
  hasLowConfidenceEvidence: false,
  containsNutritionEstimate: false,
};

describe('SafetyPolicyEngine — category policies', () => {
  it('allows normal performance/wellness with no extra guardrails', () => {
    const d = engine.evaluate({ safetyCategory: 'normal_performance_wellness' });
    expect(d.disposition).toBe('allow');
    expect(d.allowRecommendation).toBe(true);
    expect(d.safetyFlags).toHaveLength(0);
    expect(d.requiredCaveats).toHaveLength(0);
    expect(d.suppressHealthContext).toBe(false);
  });

  it('reframes an unsupported diagnosis request and refuses to diagnose', () => {
    const d = engine.evaluate({ safetyCategory: 'unsupported_diagnosis_request' });
    expect(d.disposition).toBe('allow_with_constraints');
    expect(d.safeResponsePattern).toBe('medical_boundary');
    // A diagnosis is refused → no recommendation, but data may still be used.
    expect(d.allowRecommendation).toBe(false);
    expect(d.suppressHealthContext).toBe(false);
    expect(d.safetyFlags).toEqual(
      expect.arrayContaining([
        'unsupported_request_refused',
        'medical_language_avoided',
        'not_medical_advice_added',
      ]),
    );
    expect(d.systemConstraints.join(' ')).toMatch(/must not diagnose/i);
    expect(d.requiredCaveats.join(' ')).toMatch(/not medical advice/i);
  });

  it('keeps a potential medical concern answerable but non-diagnostic', () => {
    const d = engine.evaluate({ safetyCategory: 'potential_medical_concern' });
    expect(d.disposition).toBe('allow_with_constraints');
    expect(d.allowRecommendation).toBe(true);
    expect(d.safetyFlags).toContain('medical_language_avoided');
    expect(d.systemConstraints.join(' ')).toMatch(/baseline/i);
  });

  it('routes emergencies to the canned safe response with no model call', () => {
    const d = engine.evaluate({ safetyCategory: 'emergency_or_urgent_symptoms' });
    expect(d.disposition).toBe('route_to_safe_response');
    expect(d.cannedResponse).toEqual(EMERGENCY_SAFE_RESPONSE);
    expect(d.suppressHealthContext).toBe(true);
    expect(d.allowRecommendation).toBe(false);
    expect(d.safetyFlags).toContain('emergency_redirected');
  });

  it('routes self-harm / eating-disorder risk to a crisis redirect', () => {
    const d = engine.evaluate({ safetyCategory: 'self_harm_or_eating_disorder_risk' });
    expect(d.disposition).toBe('route_to_safe_response');
    expect(d.cannedResponse).toEqual(SELF_HARM_SAFE_RESPONSE);
    expect(d.suppressHealthContext).toBe(true);
    expect(d.cannedResponse?.answer).toMatch(/crisis|emergency services/i);
  });

  it('reduces intensity for an unsafe training request', () => {
    const d = engine.evaluate({ safetyCategory: 'unsafe_training_request' });
    expect(d.disposition).toBe('allow_with_constraints');
    expect(d.safetyFlags).toContain('unsafe_training_intensity_reduced');
    expect(d.allowRecommendation).toBe(true);
    expect(d.systemConstraints.join(' ')).toMatch(/zone 2|mobility|conservative/i);
  });

  it('guards nutrition-risk requests against starvation / cut protocols', () => {
    const d = engine.evaluate({ safetyCategory: 'nutrition_risk_request' });
    expect(d.disposition).toBe('allow_with_constraints');
    expect(d.systemConstraints.join(' ')).toMatch(/starvation|dehydration|water-fasting/i);
    expect(d.requiredCaveats.join(' ')).toMatch(/not medical nutrition therapy/i);
  });

  it('does not let an unknown intent make a confident recommendation', () => {
    const d = engine.evaluate({ safetyCategory: 'unknown' });
    expect(d.disposition).toBe('allow');
    expect(d.allowRecommendation).toBe(false);
  });
});

describe('SafetyPolicyEngine — data disclosures (AI-SAFE-002/007)', () => {
  it('adds a missing-data disclosure when data is absent or stale', () => {
    const d = engine.evaluate({
      safetyCategory: 'normal_performance_wellness',
      dataSignals: { ...FRESH_SIGNALS, hasMissingData: true, freshness: 'partial' },
    });
    expect(d.safetyFlags).toContain('missing_data_disclosed');
    expect(d.requiredCaveats.join(' ')).toMatch(/missing|stale|unavailable/i);
  });

  it('adds a low-confidence disclosure', () => {
    const d = engine.evaluate({
      safetyCategory: 'normal_performance_wellness',
      dataSignals: { ...FRESH_SIGNALS, hasLowConfidenceEvidence: true },
    });
    expect(d.safetyFlags).toContain('low_confidence_disclosed');
    expect(d.requiredCaveats.join(' ')).toMatch(/low-confidence|directional/i);
  });

  it('adds a nutrition-estimate caveat when the packet contains AI estimates', () => {
    const d = engine.evaluate({
      safetyCategory: 'nutrition_risk_request',
      dataSignals: { ...FRESH_SIGNALS, containsNutritionEstimate: true },
    });
    expect(d.requiredCaveats.join(' ')).toMatch(/estimate/i);
  });

  it('does NOT apply data disclosures to a routed canned response', () => {
    const d = engine.evaluate({
      safetyCategory: 'emergency_or_urgent_symptoms',
      dataSignals: { ...FRESH_SIGNALS, hasMissingData: true, hasLowConfidenceEvidence: true },
    });
    // Emergency copy is fixed — no missing-data noise layered on.
    expect(d.safetyFlags).not.toContain('missing_data_disclosed');
    expect(d.safetyFlags).not.toContain('low_confidence_disclosed');
    expect(d.cannedResponse).toEqual(EMERGENCY_SAFE_RESPONSE);
  });

  it('deriveDataDisclosures is a pure helper over the signals', () => {
    const { flags, caveats } = deriveDataDisclosures({
      freshness: 'stale',
      hasMissingData: false,
      hasLowConfidenceEvidence: true,
      containsNutritionEstimate: true,
    });
    expect(flags).toEqual(
      expect.arrayContaining(['missing_data_disclosed', 'low_confidence_disclosed']),
    );
    expect(caveats.some((c) => /estimate/i.test(c))).toBe(true);
  });
});

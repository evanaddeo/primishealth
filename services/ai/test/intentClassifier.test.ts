import { describe, it, expect } from 'vitest';

import { AI_INTENTS, CONTEXT_DOMAINS } from '@primis/core-types';

import {
  IntentClassifier,
  classifyIntent,
  AI_SAFETY_CATEGORIES,
  UNSUPPORTED_SAFETY_CATEGORIES,
} from '../src/intent/index.js';
import type { IntentClassificationResult } from '../src/intent/index.js';

const classifier = new IntentClassifier();

function classify(text: string): IntentClassificationResult {
  return classifier.classify(text);
}

describe('IntentClassifier — structural invariants', () => {
  it('always returns a valid intent, safety category, and known domains', () => {
    const prompts = [
      'How did I sleep last night?',
      'random gibberish qwerty',
      'When should I go to bed?',
      'Am I sick?',
    ];
    for (const p of prompts) {
      const r = classify(p);
      expect(AI_INTENTS).toContain(r.intent);
      expect(AI_SAFETY_CATEGORIES).toContain(r.safetyCategory);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
      for (const d of r.requiredContextDomains) {
        expect(CONTEXT_DOMAINS).toContain(d);
      }
      // No duplicate domains.
      expect(new Set(r.requiredContextDomains).size).toBe(r.requiredContextDomains.length);
    }
  });

  it('is deterministic for identical input', () => {
    const a = classify('Why is my recovery low?');
    const b = classify('Why is my recovery low?');
    expect(a).toEqual(b);
  });

  it('stamps the requested timezone onto the time range (default UTC)', () => {
    expect(classify('How did I sleep?').timeRange.timezone).toBe('UTC');
    expect(
      classifier.classify('How did I sleep?', { timezone: 'America/New_York' }).timeRange.timezone,
    ).toBe('America/New_York');
  });
});

describe('IntentClassifier — common domain prompts (§7.3)', () => {
  it('classifies sleep questions', () => {
    const r = classify('How did I sleep last night?');
    expect(r.intent).toBe('sleep_analysis');
    expect(r.requiredContextDomains).toContain('sleep');
    expect(r.timeRange.label).toBe('yesterday');
    expect(r.safetyCategory).toBe('normal_performance_wellness');
  });

  it('classifies recovery questions', () => {
    const r = classify('Why is my recovery low?');
    expect(r.intent).toBe('recovery_analysis');
    expect(r.requiredContextDomains).toEqual(expect.arrayContaining(['recovery', 'baselines']));
  });

  it('classifies training recommendations and detects missing workout type', () => {
    const r = classify('Should I train today?');
    expect(r.intent).toBe('training_recommendation');
    expect(r.requiresUserFollowUp).toBe(true);
    expect(r.missingCriticalSlots.map((s) => s.slot)).toContain('workout_type');
  });

  it('does not ask for workout type when the workout is specified', () => {
    const r = classify('Should I lift today?');
    expect(r.intent).toBe('training_recommendation');
    expect(r.missingCriticalSlots).toHaveLength(0);
    expect(r.requiresUserFollowUp).toBe(false);
  });

  it('classifies weekly review with a 7-day window', () => {
    const r = classify('What happened this week?');
    expect(r.intent).toBe('weekly_review');
    expect(r.timeRange.label).toBe('last_7_days');
  });

  it('classifies app-help questions', () => {
    const r = classify('How do I connect my watch in settings?');
    expect(r.intent).toBe('app_help');
    expect(r.requiredContextDomains).toContain('app_help');
  });

  it('classifies body composition and gut/digestion prompts', () => {
    expect(classify('How is my body fat trending?').intent).toBe('body_composition_analysis');
    expect(classify('Why do I keep feeling bloated?').intent).toBe('gut_digestion_analysis');
  });
});

describe('IntentClassifier — bedtime + missing slots (§7.5)', () => {
  it('asks for target wake time when none is given', () => {
    const r = classify('When should I go to bed?');
    expect(r.intent).toBe('bedtime_planning');
    expect(r.requiresUserFollowUp).toBe(true);
    expect(r.missingCriticalSlots.map((s) => s.slot)).toContain('target_wake_time');
  });

  it('does not ask when a wake time is present (§25.6)', () => {
    const r = classify('What time should I go to bed if I wake at 6:30?');
    expect(r.intent).toBe('bedtime_planning');
    expect(r.missingCriticalSlots).toHaveLength(0);
  });
});

describe('IntentClassifier — nutrition + manual/hydration prompts', () => {
  it('classifies nutrition coaching and asks for a goal', () => {
    const r = classify('What should I eat?');
    expect(r.intent).toBe('nutrition_coaching');
    expect(r.missingCriticalSlots.map((s) => s.slot)).toContain('nutrition_goal');
  });

  it('does not ask for a goal when one is stated', () => {
    const r = classify('What should I eat for fat loss?');
    expect(r.intent).toBe('nutrition_coaching');
    expect(r.missingCriticalSlots).toHaveLength(0);
  });

  it('classifies hydration/caffeine/alcohol logging questions', () => {
    const r = classify('How much water should I drink?');
    expect(r.intent).toBe('hydration_caffeine_alcohol');
    expect(r.requiredContextDomains).toEqual(
      expect.arrayContaining(['hydration', 'caffeine', 'alcohol']),
    );
  });

  it('flags extreme nutrition requests as a nutrition-risk safety category', () => {
    const r = classify('What crash diet lets me lose 10 lbs this week?');
    expect(r.intent).toBe('nutrition_coaching');
    expect(r.safetyCategory).toBe('nutrition_risk_request');
  });
});

describe('IntentClassifier — correlation prompts (§25.6)', () => {
  it('routes caffeine-affects-sleep to a supported sleep-aware intent', () => {
    const r = classify('How did caffeine affect my sleep this week?');
    expect(['sleep_analysis', 'bedtime_planning', 'correlation_query']).toContain(r.intent);
    expect(r.requiredContextDomains).toContain('sleep');
    expect(r.timeRange.label).toBe('last_7_days');
  });
});

describe('IntentClassifier — ambiguous prompts', () => {
  it('returns unknown + a follow-up for unclassifiable input', () => {
    const r = classify('asdf qwerty zxcv');
    expect(r.intent).toBe('unknown');
    expect(r.requiresUserFollowUp).toBe(true);
    expect(r.missingCriticalSlots).toHaveLength(1);
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('returns unknown for empty input', () => {
    const r = classify('   ');
    expect(r.intent).toBe('unknown');
    expect(r.safetyCategory).toBe('unknown');
  });
});

describe('IntentClassifier — unsafe medical / emergency requests (§17)', () => {
  it('routes an "am I sick" question to the unsupported medical path', () => {
    const r = classify('Am I sick?');
    expect(r.intent).toBe('unsupported_medical_request');
    expect(r.safetyCategory).toBe('potential_medical_concern');
    expect(UNSUPPORTED_SAFETY_CATEGORIES).toContain(r.safetyCategory);
  });

  it('routes an explicit diagnosis request to unsupported_diagnosis_request', () => {
    const r = classify('Do I have a thyroid condition? Please diagnose me.');
    expect(r.intent).toBe('unsupported_medical_request');
    expect(r.safetyCategory).toBe('unsupported_diagnosis_request');
  });

  it('routes emergency symptoms to the emergency safety category', () => {
    const r = classify('I have severe chest pain and shortness of breath.');
    expect(r.intent).toBe('unsupported_medical_request');
    expect(r.safetyCategory).toBe('emergency_or_urgent_symptoms');
    expect(r.requiredContextDomains).toHaveLength(0);
  });

  it('emergency language wins even when a domain keyword is present', () => {
    const r = classify('I felt chest pain during my workout, should I keep training?');
    expect(r.safetyCategory).toBe('emergency_or_urgent_symptoms');
  });

  it('routes eating-disorder language to a self-harm safety category', () => {
    const r = classify('How long can I starve myself to lose weight?');
    expect(r.intent).toBe('unsupported_medical_request');
    expect(r.safetyCategory).toBe('self_harm_or_eating_disorder_risk');
  });
});

describe('IntentClassifier — unsafe training refinement (§17.5)', () => {
  it('flags training-despite-pain as an unsafe training request', () => {
    const r = classify('Should I run today despite my knee pain?');
    expect(r.intent).toBe('training_recommendation');
    expect(r.safetyCategory).toBe('unsafe_training_request');
  });
});

describe('classifyIntent — functional shorthand', () => {
  it('matches the class method', () => {
    expect(classifyIntent('How did I sleep?')).toEqual(classifier.classify('How did I sleep?'));
  });
});

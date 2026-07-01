/**
 * Tests for CU-081 — PromptComposer.
 *
 * Asserts the composer produces grounded, safe, tone-respecting prompts:
 *   - layered composition (system + context/question) with evidence + output contract
 *   - no raw identifiers reach the model
 *   - medical/diagnosis reframing, emergency routing (no model call)
 *   - missing-data, nutrition-estimate, and bedtime-precision caveats
 *   - tone invariance: coach style changes phrasing only, never the recommendation logic
 */

import { describe, expect, it } from 'vitest';

import {
  PromptComposer,
  AI_CONTEXT_PACKET_FIXTURE,
  type AiContextPacket,
  type AiCoachStyle,
} from '../src/index.js';

const composer = new PromptComposer();

const BEDTIME_PRECISION_CAVEAT =
  'Bedtime windows are ranges based on your data, not exact times — sleep-cycle precision is not guaranteed.';

/** Deep-clone the base fixture and apply an override callback. */
function packet(mutate: (p: AiContextPacket) => void = () => {}): AiContextPacket {
  const clone = structuredClone(AI_CONTEXT_PACKET_FIXTURE);
  mutate(clone);
  return clone;
}

function systemMessage(messages: { role: string; content: string }[]): string {
  const sys = messages.find((m) => m.role === 'system');
  if (!sys) throw new Error('expected a system message');
  return sys.content;
}

function userMessage(messages: { role: string; content: string }[]): string {
  const user = messages.find((m) => m.role === 'user');
  if (!user) throw new Error('expected a user message');
  return user.content;
}

describe('PromptComposer — layered composition', () => {
  it('composes a system + context/question turn with evidence and the output contract', () => {
    const result = composer.compose({
      packet: packet(),
      userQuestion: 'Should I train hard today?',
      safetyCategory: 'normal_performance_wellness',
    });

    expect(result.cannedResponse).toBeUndefined();
    expect(result.messages).toHaveLength(2);

    const sys = systemMessage(result.messages);
    expect(sys).toMatch(/performance and wellness/i);
    expect(sys).toMatch(/training recommendation/i); // task instruction
    expect(sys).toMatch(/Delivery style/i); // tone directive
    expect(sys).toMatch(/Required sections/i); // output contract description

    const user = userMessage(result.messages);
    expect(user).toContain('ev_recovery_today'); // evidence is included
    expect(user).toMatch(/User question: Should I train hard today\?/);

    expect(result.outputContract.requireEvidenceCitations).toBe(true);
    expect(result.templates.systemPromptId).toMatch(/system\.base@1\.0/);
  });

  it('never leaks raw identifiers to the model', () => {
    const p = packet();
    const result = composer.compose({
      packet: p,
      userQuestion: 'How am I doing?',
      safetyCategory: 'normal_performance_wellness',
    });
    const all = result.messages.map((m) => m.content).join('\n');
    expect(all).not.toContain(p.userIdHash);
    expect(all).not.toContain(p.packetId);
    expect(all).not.toContain(p.requestId);
  });
});

describe('PromptComposer — safety routing', () => {
  it('reframes a diagnosis request and strips the recommendation section', () => {
    const p = packet((pkt) => {
      pkt.intent = 'recovery_analysis';
      pkt.outputContract = {
        ...pkt.outputContract,
        allowRecommendation: true,
        maxRecommendations: 1,
        requiredSections: [
          'title',
          'summary',
          'answer',
          'recommendation',
          'evidence_used',
          'caveats',
        ],
      };
    });
    const result = composer.compose({
      packet: p,
      userQuestion: 'My HRV is low and breathing is fast — am I sick?',
      safetyCategory: 'unsupported_diagnosis_request',
    });

    expect(result.cannedResponse).toBeUndefined();
    expect(result.outputContract.allowRecommendation).toBe(false);
    expect(result.outputContract.maxRecommendations).toBe(0);
    expect(result.outputContract.requiredSections).not.toContain('recommendation');
    expect(result.safetyFlags).toContain('unsupported_request_refused');

    const sys = systemMessage(result.messages);
    expect(sys).toMatch(/must not diagnose/i);
    expect(sys).toMatch(/not medical advice/i); // required caveat injected
  });

  it('routes an emergency to a canned response with no model call', () => {
    const result = composer.compose({
      packet: packet(),
      userQuestion: 'I have crushing chest pain and can’t breathe',
      safetyCategory: 'emergency_or_urgent_symptoms',
    });
    expect(result.cannedResponse).toBeDefined();
    expect(result.cannedResponse?.pattern).toBe('emergency');
    expect(result.messages).toHaveLength(0); // nothing sent to a model
    expect(result.safetyFlags).toContain('emergency_redirected');
  });

  it('injects conservative constraints for an unsafe training request', () => {
    const result = composer.compose({
      packet: packet(),
      userQuestion: 'Recovery is 35 but I want to PR squats, hype me up',
      safetyCategory: 'unsafe_training_request',
    });
    const sys = systemMessage(result.messages);
    expect(sys).toMatch(/zone 2|mobility|conservative/i);
    expect(result.safetyFlags).toContain('unsafe_training_intensity_reduced');
  });
});

describe('PromptComposer — caveats', () => {
  it('requires a missing-data disclosure when data is missing or stale', () => {
    const p = packet((pkt) => {
      pkt.dataAvailability.dataFreshnessStatus = 'partial';
      pkt.dataAvailability.limitations = ['Sleep stages were unavailable last night.'];
    });
    const result = composer.compose({
      packet: p,
      userQuestion: 'How did I sleep?',
      safetyCategory: 'normal_performance_wellness',
    });
    expect(result.safetyFlags).toContain('missing_data_disclosed');
    expect(result.requiredCaveats.join(' ')).toMatch(/missing|stale|unavailable/i);
    expect(systemMessage(result.messages)).toMatch(/MUST include these caveats/i);
  });

  it('marks AI-estimated nutrition as an estimate', () => {
    const p = packet((pkt) => {
      pkt.intent = 'nutrition_coaching';
      pkt.payload = {
        nutrition: {
          containsEstimate: true,
          macroProvenance: 'mixed_with_estimates',
          caveats: ['Nutrition guidance is not medical nutrition therapy.'],
        },
      };
    });
    const result = composer.compose({
      packet: p,
      userQuestion: 'How was my nutrition today?',
      safetyCategory: 'normal_performance_wellness',
    });
    expect(result.requiredCaveats.join(' ')).toMatch(/estimate/i);
    // task instruction also reinforces the estimate rule
    expect(systemMessage(result.messages)).toMatch(/call it an estimate/i);
  });

  it('preserves the bedtime fake-precision caveat and avoids exact-cycle claims', () => {
    const p = packet((pkt) => {
      pkt.intent = 'bedtime_planning';
      pkt.payload = {
        bedtime_planner: {
          caveats: [BEDTIME_PRECISION_CAVEAT],
          rankedWindows: [{ rank: 1, startLocal: '22:05', endLocal: '22:25', wakeQuality: 'high' }],
        },
      };
    });
    const result = composer.compose({
      packet: p,
      userQuestion: 'What time should I go to bed if I wake at 6:30?',
      safetyCategory: 'normal_performance_wellness',
    });
    expect(result.requiredCaveats).toContain(BEDTIME_PRECISION_CAVEAT);
    expect(systemMessage(result.messages)).toMatch(/not claim exact sleep-cycle precision/i);
  });
});

describe('PromptComposer — tone invariance (ARCH-AI-003, §6.3)', () => {
  function composeWithTone(coachStyle: AiCoachStyle) {
    const p = packet((pkt) => {
      pkt.userProfile.coachStyle = coachStyle;
      pkt.outputContract = { ...pkt.outputContract, toneStyle: coachStyle };
    });
    return composer.compose({
      packet: p,
      userQuestion: 'Should I train hard today?',
      safetyCategory: 'unsafe_training_request',
    });
  }

  it('changes phrasing only — recommendation logic, evidence, and safety stay identical', () => {
    const strict = composeWithTone('strict');
    const encouraging = composeWithTone('encouraging');

    // Recommendation logic + guardrails are invariant across tone.
    expect(encouraging.outputContract.allowRecommendation).toBe(
      strict.outputContract.allowRecommendation,
    );
    expect(encouraging.outputContract.requiredSections).toEqual(
      strict.outputContract.requiredSections,
    );
    expect(encouraging.safetyFlags).toEqual(strict.safetyFlags);
    expect(encouraging.requiredCaveats).toEqual(strict.requiredCaveats);

    // Context/evidence turn is byte-identical (tone only touches the system message).
    expect(userMessage(encouraging.messages)).toEqual(userMessage(strict.messages));

    // The system messages differ ONLY in the delivery-style wording.
    expect(systemMessage(strict.messages)).not.toEqual(systemMessage(encouraging.messages));
    expect(systemMessage(strict.messages)).toMatch(/no-nonsense/i);
    expect(systemMessage(encouraging.messages)).toMatch(/encouraging/i);
  });
});

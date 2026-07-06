/**
 * Unit tests for the contextual "Ask AI about this" navigation helpers (CU-085).
 *
 * Pure mapping only — no React Native, so this runs in the node Vitest env. It
 * proves the surface→intent mapping, deterministic param serialization, and the
 * defensive parse that gates what may seed the composer.
 */

import { describe, expect, it } from 'vitest';

import { AI_INTENTS } from '@primis/core-types';

import {
  COACH_ROUTE,
  buildCoachPrefillParams,
  getAskAiSurfaceConfig,
  parseCoachPrefill,
  type AskAiSurface,
} from '../../src/features/coach/contextualNavigation';

const SURFACES: readonly AskAiSurface[] = [
  'sleep_detail',
  'recovery_detail',
  'activity_detail',
  'nutrition_detail',
];

describe('getAskAiSurfaceConfig', () => {
  it('maps every surface to a valid AiIntent, prompt, and labels', () => {
    for (const surface of SURFACES) {
      const config = getAskAiSurfaceConfig(surface);
      expect(AI_INTENTS).toContain(config.intent);
      expect(config.prompt.trim().length).toBeGreaterThan(0);
      expect(config.buttonLabel.trim().length).toBeGreaterThan(0);
      expect(config.accessibilityHint.trim().length).toBeGreaterThan(0);
    }
  });

  it('maps each surface to its expected intent', () => {
    expect(getAskAiSurfaceConfig('sleep_detail').intent).toBe('sleep_analysis');
    expect(getAskAiSurfaceConfig('recovery_detail').intent).toBe('recovery_analysis');
    expect(getAskAiSurfaceConfig('activity_detail').intent).toBe('activity_trend');
    expect(getAskAiSurfaceConfig('nutrition_detail').intent).toBe('nutrition_coaching');
  });
});

describe('COACH_ROUTE', () => {
  it('targets the Coach tab', () => {
    expect(COACH_ROUTE).toBe('/coach');
  });
});

describe('buildCoachPrefillParams', () => {
  it('builds deterministic params carrying intent, surface, and prompt', () => {
    const params = buildCoachPrefillParams('sleep_detail');
    expect(params).toEqual({
      askAiIntent: 'sleep_analysis',
      askAiSurface: 'sleep_detail',
      askAiPrompt: getAskAiSurfaceConfig('sleep_detail').prompt,
    });
  });

  it('includes the source date only when provided', () => {
    expect(buildCoachPrefillParams('recovery_detail', '2026-07-06').askAiDate).toBe('2026-07-06');
    expect(buildCoachPrefillParams('recovery_detail')).not.toHaveProperty('askAiDate');
  });

  it('carries no health metrics — only routing metadata', () => {
    const keys = Object.keys(buildCoachPrefillParams('activity_detail', '2026-07-06'));
    expect(keys.sort()).toEqual(['askAiDate', 'askAiIntent', 'askAiPrompt', 'askAiSurface']);
  });
});

describe('parseCoachPrefill', () => {
  it('round-trips the params produced for a surface', () => {
    // Serialize then re-parse, mirroring what Expo Router hands back as params.
    const raw: Record<string, string | string[] | undefined> = {
      ...buildCoachPrefillParams('sleep_detail', '2026-07-06'),
    };
    const prefill = parseCoachPrefill(raw);
    expect(prefill).toEqual({
      intentHint: 'sleep_analysis',
      sourceSurface: 'sleep_detail',
      prompt: getAskAiSurfaceConfig('sleep_detail').prompt,
      sourceDate: '2026-07-06',
    });
  });

  it('returns null for a plain Coach-tab open (no prefill params)', () => {
    expect(parseCoachPrefill({})).toBeNull();
  });

  it('returns null when required params are missing', () => {
    expect(parseCoachPrefill({ askAiIntent: 'sleep_analysis' })).toBeNull();
    expect(parseCoachPrefill({ askAiSurface: 'sleep_detail', askAiPrompt: 'Hi' })).toBeNull();
  });

  it('rejects an unknown intent value', () => {
    expect(
      parseCoachPrefill({
        askAiIntent: 'diagnose_me',
        askAiSurface: 'sleep_detail',
        askAiPrompt: 'Hi',
      }),
    ).toBeNull();
  });

  it('rejects an empty prompt', () => {
    expect(
      parseCoachPrefill({
        askAiIntent: 'sleep_analysis',
        askAiSurface: 'sleep_detail',
        askAiPrompt: '   ',
      }),
    ).toBeNull();
  });

  it('drops a malformed source date but keeps the rest', () => {
    const prefill = parseCoachPrefill({
      askAiIntent: 'activity_trend',
      askAiSurface: 'activity_detail',
      askAiPrompt: 'How is my activity trending?',
      askAiDate: 'yesterday',
    });
    expect(prefill).not.toBeNull();
    expect(prefill).not.toHaveProperty('sourceDate');
  });

  it('normalizes array-valued params (Expo Router repeat keys) to the first value', () => {
    const prefill = parseCoachPrefill({
      askAiIntent: ['recovery_analysis', 'sleep_analysis'],
      askAiSurface: ['recovery_detail'],
      askAiPrompt: ['Why is my recovery low?'],
      askAiDate: ['2026-07-06'],
    });
    expect(prefill?.intentHint).toBe('recovery_analysis');
    expect(prefill?.sourceSurface).toBe('recovery_detail');
    expect(prefill?.sourceDate).toBe('2026-07-06');
  });
});

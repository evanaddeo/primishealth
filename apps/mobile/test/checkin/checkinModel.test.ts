/**
 * Unit tests for the pure check-in helpers (CU-074).
 *
 * Covers the optional-field emptiness guard, the request builder (asserting it
 * round-trips through CreateCheckinRequestDtoSchema and omits unset fields), and
 * the completion-seconds derivation. Pure helpers only — node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import { CreateCheckinRequestDtoSchema } from '@primis/api-contracts';

import { resolveTimeAnchors } from '../../src/features/quickAdd/quickAddModel';
import {
  buildCheckinRequest,
  elapsedSeconds,
  isCheckinEmpty,
} from '../../src/features/checkin/checkinModel';

const ANCHORS = resolveTimeAnchors(new Date('2026-06-30T13:45:00.000Z'), 'America/New_York');

describe('isCheckinEmpty()', () => {
  it('is empty with no fields', () => {
    expect(isCheckinEmpty({})).toBe(true);
  });
  it('treats whitespace-only notes as empty', () => {
    expect(isCheckinEmpty({ notes: '   ' })).toBe(true);
  });
  it('is not empty once any scale is set', () => {
    expect(isCheckinEmpty({ energy: 4 })).toBe(false);
    expect(isCheckinEmpty({ soreness: 0 })).toBe(false);
  });
});

describe('buildCheckinRequest()', () => {
  it('round-trips through the schema and defaults the type to daily', () => {
    const req = buildCheckinRequest({ energy: 4, mood: 3, soreness: 0 }, ANCHORS);
    expect(() => CreateCheckinRequestDtoSchema.parse(req)).not.toThrow();
    expect(req.checkinType).toBe('daily');
    expect(req.energy).toBe(4);
    expect(req.soreness).toBe(0);
    expect('stress' in req).toBe(false);
  });

  it('omits empty/whitespace notes and a zero completion time', () => {
    const req = buildCheckinRequest({ mood: 5, notes: '   ' }, ANCHORS, { completionSeconds: 0 });
    expect('notes' in req).toBe(false);
    expect('completionSeconds' in req).toBe(false);
  });

  it('includes trimmed notes and a positive completion time', () => {
    const req = buildCheckinRequest({ notes: '  felt great  ' }, ANCHORS, {
      completionSeconds: 12,
    });
    expect(() => CreateCheckinRequestDtoSchema.parse(req)).not.toThrow();
    expect(req.notes).toBe('felt great');
    expect(req.completionSeconds).toBe(12);
  });
});

describe('elapsedSeconds()', () => {
  it('floors the elapsed time and never goes negative', () => {
    expect(elapsedSeconds(1000, 13_500)).toBe(12);
    expect(elapsedSeconds(5000, 4000)).toBe(0);
  });
});

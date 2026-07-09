/**
 * Tests for CU-071 digestion (bowel) tracking DTOs.
 *
 * Coverage:
 * - The entry DTO fixture validates and round-trips.
 * - Enum sets match the schema exactly (color / smell / urgency / completeness).
 * - Range validation: Bristol type 1–7, pain/bloating 0–5 are enforced.
 * - Enum validation: unknown color / smell / urgency / completeness are rejected.
 * - Time anchors (occurredAtUtc / localDate) are validated.
 * - Optional fields are truly optional (a minimal anchors-only entry succeeds).
 */

import { describe, expect, it } from 'vitest';

import {
  CreateDigestionRequestDtoSchema,
  BowelEntryDtoSchema,
  DigestionEntryListDtoSchema,
  BOWEL_COLOR_VALUES,
  BOWEL_SMELL_VALUES,
  BOWEL_URGENCY_VALUES,
  BOWEL_COMPLETENESS_VALUES,
  BOWEL_ENTRY_FIXTURE,
} from '../src/digestion.js';

const ANCHORS = {
  occurredAtUtc: '2026-06-26T08:15:00Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
} as const;

describe('digestion entry DTO', () => {
  it('validates and round-trips the entry fixture', () => {
    const parsed = BowelEntryDtoSchema.parse(BOWEL_ENTRY_FIXTURE);
    expect(parsed).toEqual(BOWEL_ENTRY_FIXTURE);
  });

  it('exposes the documented enum sets', () => {
    expect(BOWEL_COLOR_VALUES).toEqual([
      'brown',
      'green',
      'yellow',
      'black',
      'red',
      'pale',
      'other',
      'unknown',
    ]);
    expect(BOWEL_SMELL_VALUES).toEqual(['normal', 'strong', 'sulfur', 'unusual', 'unknown']);
    expect(BOWEL_URGENCY_VALUES).toEqual(['none', 'mild', 'urgent']);
    expect(BOWEL_COMPLETENESS_VALUES).toEqual(['incomplete', 'normal', 'complete', 'unknown']);
  });
});

describe('CreateDigestionRequestDto', () => {
  it('accepts a minimal anchors-only entry (everything else optional)', () => {
    expect(CreateDigestionRequestDtoSchema.safeParse({ ...ANCHORS }).success).toBe(true);
  });

  it('accepts a fully populated entry', () => {
    expect(
      CreateDigestionRequestDtoSchema.safeParse({
        ...ANCHORS,
        bristolType: 4,
        color: 'brown',
        smell: 'normal',
        urgency: 'none',
        painLevel: 0,
        bloatingLevel: 2,
        completeness: 'complete',
        notes: 'after breakfast',
      }).success,
    ).toBe(true);
  });

  it('rejects a Bristol type outside 1–7', () => {
    expect(CreateDigestionRequestDtoSchema.safeParse({ ...ANCHORS, bristolType: 0 }).success).toBe(
      false,
    );
    expect(CreateDigestionRequestDtoSchema.safeParse({ ...ANCHORS, bristolType: 8 }).success).toBe(
      false,
    );
  });

  it('rejects a non-integer Bristol type', () => {
    expect(
      CreateDigestionRequestDtoSchema.safeParse({ ...ANCHORS, bristolType: 3.5 }).success,
    ).toBe(false);
  });

  it('rejects pain/bloating levels outside 0–5', () => {
    expect(CreateDigestionRequestDtoSchema.safeParse({ ...ANCHORS, painLevel: 6 }).success).toBe(
      false,
    );
    expect(
      CreateDigestionRequestDtoSchema.safeParse({ ...ANCHORS, bloatingLevel: -1 }).success,
    ).toBe(false);
  });

  it('rejects unknown enum values', () => {
    expect(CreateDigestionRequestDtoSchema.safeParse({ ...ANCHORS, color: 'blue' }).success).toBe(
      false,
    );
    expect(CreateDigestionRequestDtoSchema.safeParse({ ...ANCHORS, smell: 'fruity' }).success).toBe(
      false,
    );
    expect(
      CreateDigestionRequestDtoSchema.safeParse({ ...ANCHORS, urgency: 'extreme' }).success,
    ).toBe(false);
    expect(
      CreateDigestionRequestDtoSchema.safeParse({ ...ANCHORS, completeness: 'partial' }).success,
    ).toBe(false);
  });

  it('rejects a malformed localDate', () => {
    expect(
      CreateDigestionRequestDtoSchema.safeParse({ ...ANCHORS, localDate: '06/26/2026' }).success,
    ).toBe(false);
  });
});

describe('DigestionEntryListDto', () => {
  it('validates a list response with one entry', () => {
    expect(DigestionEntryListDtoSchema.safeParse({ entries: [BOWEL_ENTRY_FIXTURE] }).success).toBe(
      true,
    );
  });

  it('validates an empty list response', () => {
    expect(DigestionEntryListDtoSchema.safeParse({ entries: [] }).success).toBe(true);
  });
});

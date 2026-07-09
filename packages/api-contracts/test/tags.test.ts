/**
 * Tests for CU-073 custom tag DTOs.
 *
 * Coverage:
 * - The tag + tag-event fixtures validate and round-trip.
 * - `normalizeTagCode` is deterministic and produces stable, display-safe slugs.
 * - Category / linked-entity-type enum sets match the schema exactly.
 * - Create tag: rejects an empty / punctuation-only display name and bad category.
 * - Create tag event: time anchors validated; intensity 1–5 and quantity ranges
 *   enforced; linkedEntityType/linkedEntityId must be supplied together.
 */

import { describe, expect, it } from 'vitest';

import {
  normalizeTagCode,
  CreateTagRequestDtoSchema,
  CustomTagDtoSchema,
  TagListResponseDtoSchema,
  CreateTagEventRequestDtoSchema,
  TagEventDtoSchema,
  TagEventListResponseDtoSchema,
  TAG_CATEGORY_VALUES,
  TAG_LINKED_ENTITY_TYPE_VALUES,
  CUSTOM_TAG_FIXTURE,
  TAG_EVENT_FIXTURE,
} from '../src/tags.js';

const EVENT_ANCHORS = {
  occurredAtUtc: '2026-06-26T21:30:00Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
} as const;

describe('normalizeTagCode', () => {
  it('lowercases and underscores non-alphanumerics', () => {
    expect(normalizeTagCode('Late Caffeine')).toBe('late_caffeine');
    expect(normalizeTagCode('Cheat-Meal!!')).toBe('cheat_meal');
    expect(normalizeTagCode('  Big   Workout  ')).toBe('big_workout');
  });

  it('is deterministic for the same input', () => {
    expect(normalizeTagCode('Travel Day')).toBe(normalizeTagCode('travel day'));
  });

  it('returns an empty string for punctuation-only input', () => {
    expect(normalizeTagCode('!!!')).toBe('');
  });
});

describe('custom tag DTO', () => {
  it('validates and round-trips the tag fixture', () => {
    expect(CustomTagDtoSchema.parse(CUSTOM_TAG_FIXTURE)).toEqual(CUSTOM_TAG_FIXTURE);
  });

  it('exposes the documented category set', () => {
    expect(TAG_CATEGORY_VALUES).toEqual([
      'food',
      'training',
      'sleep',
      'stress',
      'supplement',
      'lifestyle',
      'custom',
    ]);
  });

  it('validates a tag list response (one + empty)', () => {
    expect(TagListResponseDtoSchema.safeParse({ tags: [CUSTOM_TAG_FIXTURE] }).success).toBe(true);
    expect(TagListResponseDtoSchema.safeParse({ tags: [] }).success).toBe(true);
  });
});

describe('CreateTagRequestDto', () => {
  it('accepts a minimal display-name-only tag', () => {
    expect(CreateTagRequestDtoSchema.safeParse({ displayName: 'Late caffeine' }).success).toBe(
      true,
    );
  });

  it('accepts a fully populated tag', () => {
    expect(
      CreateTagRequestDtoSchema.safeParse({
        displayName: 'Cheat meal',
        category: 'food',
        isActive: true,
      }).success,
    ).toBe(true);
  });

  it('rejects an empty display name', () => {
    expect(CreateTagRequestDtoSchema.safeParse({ displayName: '' }).success).toBe(false);
    expect(CreateTagRequestDtoSchema.safeParse({ displayName: '   ' }).success).toBe(false);
  });

  it('rejects a punctuation-only display name (no valid slug)', () => {
    expect(CreateTagRequestDtoSchema.safeParse({ displayName: '!!!' }).success).toBe(false);
  });

  it('rejects an unknown category', () => {
    expect(
      CreateTagRequestDtoSchema.safeParse({ displayName: 'Snack', category: 'dessert' }).success,
    ).toBe(false);
  });
});

describe('tag event DTO', () => {
  it('validates and round-trips the tag-event fixture', () => {
    expect(TagEventDtoSchema.parse(TAG_EVENT_FIXTURE)).toEqual(TAG_EVENT_FIXTURE);
  });

  it('exposes the documented linked-entity-type set', () => {
    expect(TAG_LINKED_ENTITY_TYPE_VALUES).toEqual([
      'nutrition_entry',
      'workout_session',
      'sleep_session',
      'manual_checkin',
    ]);
  });

  it('validates a tag-event list response (one + empty)', () => {
    expect(TagEventListResponseDtoSchema.safeParse({ events: [TAG_EVENT_FIXTURE] }).success).toBe(
      true,
    );
    expect(TagEventListResponseDtoSchema.safeParse({ events: [] }).success).toBe(true);
  });
});

describe('CreateTagEventRequestDto', () => {
  it('accepts a minimal anchors-and-code event', () => {
    expect(
      CreateTagEventRequestDtoSchema.safeParse({ ...EVENT_ANCHORS, tagCode: 'late_caffeine' })
        .success,
    ).toBe(true);
  });

  it('accepts an event linked to an entity', () => {
    expect(
      CreateTagEventRequestDtoSchema.safeParse({
        ...EVENT_ANCHORS,
        tagCode: 'late_caffeine',
        intensity: 3,
        quantity: 1,
        unit: 'cup',
        linkedEntityType: 'manual_checkin',
        linkedEntityId: '00000000-0000-0000-0000-0000000000c1',
      }).success,
    ).toBe(true);
  });

  it('rejects a missing tag code', () => {
    expect(CreateTagEventRequestDtoSchema.safeParse({ ...EVENT_ANCHORS }).success).toBe(false);
  });

  it('rejects an intensity outside 1–5', () => {
    expect(
      CreateTagEventRequestDtoSchema.safeParse({
        ...EVENT_ANCHORS,
        tagCode: 'x',
        intensity: 6,
      }).success,
    ).toBe(false);
  });

  it('rejects a malformed localDate', () => {
    expect(
      CreateTagEventRequestDtoSchema.safeParse({
        ...EVENT_ANCHORS,
        localDate: '06/26/2026',
        tagCode: 'x',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown linked entity type', () => {
    expect(
      CreateTagEventRequestDtoSchema.safeParse({
        ...EVENT_ANCHORS,
        tagCode: 'x',
        linkedEntityType: 'meal',
        linkedEntityId: '00000000-0000-0000-0000-0000000000c1',
      }).success,
    ).toBe(false);
  });

  it('rejects a linked entity type without an id (and vice versa)', () => {
    expect(
      CreateTagEventRequestDtoSchema.safeParse({
        ...EVENT_ANCHORS,
        tagCode: 'x',
        linkedEntityType: 'manual_checkin',
      }).success,
    ).toBe(false);
    expect(
      CreateTagEventRequestDtoSchema.safeParse({
        ...EVENT_ANCHORS,
        tagCode: 'x',
        linkedEntityId: '00000000-0000-0000-0000-0000000000c1',
      }).success,
    ).toBe(false);
  });
});

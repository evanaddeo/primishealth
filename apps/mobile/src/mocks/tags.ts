/**
 * Mock custom-tag data — DEVELOPMENT ONLY.
 *
 * Used only when EXPO_PUBLIC_MOCK_MODE=true. Provides a small reusable tag list
 * for the searchable tag picker (UX-INPUT-004) plus schema-valid echo builders
 * for tag upsert and tag-event logging. No real data.
 *
 * @see packages/api-contracts/src/tags.ts
 */

import {
  normalizeTagCode,
  type CreateTagEventRequestDto,
  type CreateTagRequestDto,
  type CustomTagDto,
  type TagEventDto,
  type TagListResponseDto,
} from '@primis/api-contracts';

let seq = 0;
function mockId(prefix: string): string {
  seq += 1;
  return `mock-${prefix}-${seq}`;
}

const NOW = '2026-06-30T12:00:00.000Z';

/** A few reusable starter tags spanning common categories. */
export function getMockTags(): TagListResponseDto {
  const make = (displayName: string, category: CustomTagDto['category']): CustomTagDto => ({
    id: mockId('tag'),
    tagCode: normalizeTagCode(displayName),
    displayName,
    category,
    isSystemSuggested: true,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return {
    tags: [
      make('Late caffeine', 'lifestyle'),
      make('Travel day', 'lifestyle'),
      make('High stress', 'stress'),
      make('Creatine', 'supplement'),
      make('Big training day', 'training'),
    ],
  };
}

export function mockUpsertTag(req: CreateTagRequestDto): CustomTagDto {
  return {
    id: mockId('tag'),
    tagCode: normalizeTagCode(req.displayName),
    displayName: req.displayName,
    category: req.category ?? null,
    isSystemSuggested: false,
    isActive: req.isActive ?? true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

export function mockCreatedTagEvent(req: CreateTagEventRequestDto): TagEventDto {
  return {
    id: mockId('tag-event'),
    customTagId: null,
    tagCode: req.tagCode,
    occurredAtUtc: req.occurredAtUtc,
    localDate: req.localDate,
    timezone: req.timezone,
    intensity: req.intensity ?? null,
    quantity: req.quantity ?? null,
    unit: req.unit ?? null,
    notes: req.notes ?? null,
    linkedEntityType: req.linkedEntityType ?? null,
    linkedEntityId: req.linkedEntityId ?? null,
    createdAt: req.occurredAtUtc,
  };
}

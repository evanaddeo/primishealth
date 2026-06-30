/**
 * Mock digestion (bowel) data — DEVELOPMENT ONLY.
 *
 * Used only when EXPO_PUBLIC_MOCK_MODE=true. Provides a schema-valid echo
 * builder for a just-logged, optional digestion entry. Framed as trends only —
 * no diagnosis (UX-INPUT-003). No real data.
 *
 * @see packages/api-contracts/src/digestion.ts
 */

import type { BowelEntryDto, CreateDigestionRequestDto } from '@primis/api-contracts';

let seq = 0;
function mockId(prefix: string): string {
  seq += 1;
  return `mock-${prefix}-${seq}`;
}

export function mockCreatedDigestion(req: CreateDigestionRequestDto): BowelEntryDto {
  return {
    id: mockId('digestion'),
    occurredAtUtc: req.occurredAtUtc,
    localDate: req.localDate,
    timezone: req.timezone,
    bristolType: req.bristolType ?? null,
    color: req.color ?? null,
    smell: req.smell ?? null,
    urgency: req.urgency ?? null,
    painLevel: req.painLevel ?? null,
    bloatingLevel: req.bloatingLevel ?? null,
    completeness: req.completeness ?? null,
    notes: req.notes ?? null,
    dataQuality: 'user_reported',
    createdAt: req.occurredAtUtc,
  };
}

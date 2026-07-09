/**
 * Mock manual check-in data — DEVELOPMENT ONLY.
 *
 * Used only when EXPO_PUBLIC_MOCK_MODE=true. Provides an (empty by default)
 * check-in list and a schema-valid echo builder for a just-created check-in.
 * No real data.
 *
 * @see packages/api-contracts/src/manualInputs.ts
 */

import type {
  CheckinListResponseDto,
  CreateCheckinRequestDto,
  ManualCheckinDto,
} from '@primis/api-contracts';

let seq = 0;
function mockId(prefix: string): string {
  seq += 1;
  return `mock-${prefix}-${seq}`;
}

/** No check-ins logged yet — the non-shaming default (no "you missed…" framing). */
export function getMockCheckins(): CheckinListResponseDto {
  return { checkins: [] };
}

export function mockCreatedCheckin(req: CreateCheckinRequestDto): ManualCheckinDto {
  return {
    id: mockId('checkin'),
    checkinType: req.checkinType,
    occurredAtUtc: req.occurredAtUtc,
    localDate: req.localDate,
    timezone: req.timezone,
    energy: req.energy ?? null,
    mood: req.mood ?? null,
    stress: req.stress ?? null,
    soreness: req.soreness ?? null,
    productivity: req.productivity ?? null,
    motivation: req.motivation ?? null,
    libido: req.libido ?? null,
    notes: req.notes ?? null,
    completionSeconds: req.completionSeconds ?? null,
    createdAt: req.occurredAtUtc,
    updatedAt: req.occurredAtUtc,
  };
}

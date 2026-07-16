import { describe, expect, it } from 'vitest';

import {
  LOCAL_HEALTH_AUTHORIZATION_STATUSES,
  LOCAL_HEALTH_PROVIDER_CODE,
  LOCAL_HEALTH_READ_TYPE,
  LOCAL_HEALTH_READ_TYPES,
} from '../src/localHealth.js';
import { PROVIDER_CODE } from '../src/provider.js';

describe('local-health vocabulary', () => {
  it('reuses the ADR-001 canonical provider code', () => {
    expect(LOCAL_HEALTH_PROVIDER_CODE).toBe(PROVIDER_CODE.HEALTHKIT);
    expect(LOCAL_HEALTH_PROVIDER_CODE).toBe('healthkit');
    expect(LOCAL_HEALTH_PROVIDER_CODE).not.toBe('apple_healthkit');
  });

  it('contains only the Phase K v1 read allowlist and no nutrition or write scope', () => {
    expect(LOCAL_HEALTH_READ_TYPES).toEqual([
      'weight',
      'body_fat',
      'lean_mass',
      'hrv_rmssd',
      'resting_heart_rate',
      'sleep',
      'workouts',
    ]);
    expect(new Set(LOCAL_HEALTH_READ_TYPES).size).toBe(LOCAL_HEALTH_READ_TYPES.length);
    expect(LOCAL_HEALTH_READ_TYPES).not.toContain('nutrition');
  });

  it('keeps the named constants aligned with the stable list', () => {
    expect(Object.values(LOCAL_HEALTH_READ_TYPE)).toEqual(LOCAL_HEALTH_READ_TYPES);
  });

  it('does not expose a definitive read-denied authorization state', () => {
    expect(LOCAL_HEALTH_AUTHORIZATION_STATUSES).toContain('limited_or_no_data');
    expect(LOCAL_HEALTH_AUTHORIZATION_STATUSES).not.toContain('denied');
    expect(new Set(LOCAL_HEALTH_AUTHORIZATION_STATUSES).size).toBe(
      LOCAL_HEALTH_AUTHORIZATION_STATUSES.length,
    );
  });
});

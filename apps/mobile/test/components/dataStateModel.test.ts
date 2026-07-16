import { describe, expect, it } from 'vitest';

import type { MissingMetricDto } from '@primis/api-contracts';

import { CORE_DATA_STATE_AUDIT } from '../../src/components/dataStateAudit';
import {
  DATA_STATE_KINDS,
  dataStateFromMissingMetric,
  dataStateFromScoreState,
  resolveCachedQueryState,
  resolveDataStateCopy,
  resolveMissingMetricBody,
} from '../../src/components/dataStateModel';

function missing(isRequired: boolean): MissingMetricDto {
  return { metricCode: 'hrv_rmssd', reason: 'provider_did_not_supply', isRequired };
}

describe('shared mobile data-state taxonomy', () => {
  it('has complete, non-medical copy and an executable audit surface for every state', () => {
    const audited = new Set(Object.values(CORE_DATA_STATE_AUDIT).flat());
    for (const state of DATA_STATE_KINDS) {
      const copy = resolveDataStateCopy(state);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
      expect(`${copy.title} ${copy.body}`.toLowerCase()).not.toMatch(/diagnos|disease|treatment/);
      expect(audited.has(state)).toBe(true);
    }
  });

  it('keeps cached data ready during refresh and refetch failure', () => {
    expect(resolveCachedQueryState({ hasData: true, isFetching: true, isError: false })).toBe(
      'refreshing',
    );
    expect(resolveCachedQueryState({ hasData: true, isFetching: false, isError: true })).toBe(
      'ready',
    );
    expect(resolveCachedQueryState({ hasData: false, isFetching: false, isError: true })).toBe(
      'error',
    );
  });

  it('does not collapse stale and provisional score states', () => {
    expect(dataStateFromScoreState('stale_data')).toBe('stale_data');
    expect(dataStateFromScoreState('provisional')).toBe('provisional');
    expect(resolveDataStateCopy('stale_data').body).not.toBe(
      resolveDataStateCopy('provisional').body,
    );
  });

  it('does not collapse required and optional missing metrics', () => {
    expect(dataStateFromMissingMetric(missing(true))).toBe('missing_required_metric');
    expect(dataStateFromMissingMetric(missing(false))).toBe('missing_optional_metric');
    expect(resolveMissingMetricBody(missing(false))).toContain('was not supplied');
  });

  it('keeps provider states distinct and only offers meaningful actions', () => {
    expect(resolveDataStateCopy('provider_disconnected').action).toBe('connect');
    expect(resolveDataStateCopy('provider_unavailable').action).toBe('retry');
    expect(resolveDataStateCopy('provider_unverified').action).toBeNull();
  });

  it('distinguishes cached Coach fallback from generation unavailability', () => {
    expect(resolveDataStateCopy('cached_ai_summary').placement).toBe('non_blocking');
    expect(resolveDataStateCopy('ai_generation_unavailable').action).toBe('retry');
    expect(resolveDataStateCopy('ai_generation_unavailable').body).toContain('deterministic');
  });
});

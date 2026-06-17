/**
 * Pure derivation + copy tests for the provider-connection UI (CU-060).
 *
 * No React, native modules, or stores are touched — `connectionState.ts` is
 * dependency-free domain logic.
 *
 * @see apps/mobile/src/features/connections/connectionState.ts
 */

import { describe, expect, it } from 'vitest';

import type { ProviderConnectionDto, SyncStatusDto } from '@primis/api-contracts';

import {
  STALE_AFTER_HOURS,
  deriveConnectionUiState,
  formatSyncFreshness,
  getConnectionStateCopy,
  metricDisplayName,
  toCapabilityViews,
  type ConnectionUiState,
} from '../../src/features/connections/connectionState';

const NOW = new Date('2026-06-17T12:00:00.000Z');

function isoHoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function connection(overrides: Partial<ProviderConnectionDto> = {}): ProviderConnectionDto {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    providerCode: 'google_health',
    status: 'active',
    displayName: 'Google Health',
    scopesGranted: ['https://www.googleapis.com/auth/health.activity'],
    lastSuccessfulSyncAt: isoHoursAgo(0.5),
    createdAt: isoHoursAgo(720),
    ...overrides,
  };
}

function syncStatus(overrides: Partial<SyncStatusDto> = {}): SyncStatusDto {
  return {
    connectionId: '00000000-0000-0000-0000-000000000010',
    providerCode: 'google_health',
    lastSyncAt: isoHoursAgo(0.5),
    lastSyncStatus: 'succeeded',
    pendingJobCount: 0,
    ...overrides,
  };
}

describe('deriveConnectionUiState', () => {
  it('returns disconnected when there is no connection', () => {
    expect(deriveConnectionUiState({ connection: null, syncStatus: null, now: NOW })).toBe(
      'disconnected',
    );
  });

  it('returns connecting when authorizing with no connection yet', () => {
    expect(
      deriveConnectionUiState({ connection: null, syncStatus: null, authorizing: true, now: NOW }),
    ).toBe('connecting');
  });

  it('returns connecting for an active connection that has never synced', () => {
    expect(
      deriveConnectionUiState({
        connection: connection({ lastSuccessfulSyncAt: null }),
        syncStatus: syncStatus({ lastSyncAt: null, lastSyncStatus: 'running', pendingJobCount: 1 }),
        now: NOW,
      }),
    ).toBe('connecting');
  });

  it('returns active for a recent successful sync', () => {
    expect(
      deriveConnectionUiState({
        connection: connection({ lastSuccessfulSyncAt: isoHoursAgo(1) }),
        syncStatus: syncStatus(),
        now: NOW,
      }),
    ).toBe('active');
  });

  it('returns stale past the staleness threshold', () => {
    expect(
      deriveConnectionUiState({
        connection: connection({ lastSuccessfulSyncAt: isoHoursAgo(STALE_AFTER_HOURS + 6) }),
        syncStatus: syncStatus({ lastSyncAt: isoHoursAgo(STALE_AFTER_HOURS + 6) }),
        now: NOW,
      }),
    ).toBe('stale');
  });

  it('stays active (not stale) while a sync is pending even if last sync is old', () => {
    expect(
      deriveConnectionUiState({
        connection: connection({ lastSuccessfulSyncAt: isoHoursAgo(STALE_AFTER_HOURS + 6) }),
        syncStatus: syncStatus({ pendingJobCount: 1, lastSyncStatus: 'running' }),
        now: NOW,
      }),
    ).toBe('active');
  });

  it('maps needs_reauth status', () => {
    expect(
      deriveConnectionUiState({
        connection: connection({ status: 'needs_reauth' }),
        syncStatus: syncStatus(),
        now: NOW,
      }),
    ).toBe('needs_reauth');
  });

  it.each(['revoked', 'error', 'disabled'] as const)('maps %s status to unavailable', (status) => {
    expect(
      deriveConnectionUiState({
        connection: connection({ status }),
        syncStatus: syncStatus(),
        now: NOW,
      }),
    ).toBe('unavailable');
  });
});

describe('getConnectionStateCopy', () => {
  const states: ConnectionUiState[] = [
    'disconnected',
    'connecting',
    'active',
    'stale',
    'needs_reauth',
    'unavailable',
  ];

  it('provides non-empty, labelled copy for every state', () => {
    for (const state of states) {
      const copy = getConnectionStateCopy(state);
      expect(copy.badgeLabel.length).toBeGreaterThan(0);
      expect(copy.headline.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
    }
  });

  it('offers a connect action only when actionable', () => {
    expect(getConnectionStateCopy('disconnected').primaryAction).toBe('authorize');
    expect(getConnectionStateCopy('needs_reauth').primaryAction).toBe('reauthorize');
    expect(getConnectionStateCopy('active').primaryAction).toBeNull();
    expect(getConnectionStateCopy('connecting').primaryAction).toBeNull();
  });

  it('does not offer disconnect before a connection exists', () => {
    expect(getConnectionStateCopy('disconnected').canDisconnect).toBe(false);
    expect(getConnectionStateCopy('active').canDisconnect).toBe(true);
  });

  it('uses no medical or diagnostic wording', () => {
    const banned = ['sick', 'illness', 'disease', 'diagnos', 'medical', 'health risk'];
    for (const state of states) {
      const text =
        `${getConnectionStateCopy(state).headline} ${getConnectionStateCopy(state).body}`.toLowerCase();
      for (const word of banned) {
        expect(text).not.toContain(word);
      }
    }
  });
});

describe('formatSyncFreshness', () => {
  it('reports never-synced honestly', () => {
    expect(formatSyncFreshness(null, NOW)).toBe('Not synced yet');
  });

  it('reports just-now for sub-minute ages', () => {
    expect(formatSyncFreshness(isoHoursAgo(0), NOW)).toBe('Synced just now');
  });

  it('reports minutes, hours, and days', () => {
    expect(formatSyncFreshness(isoHoursAgo(0.5), NOW)).toBe('Synced 30 min ago');
    expect(formatSyncFreshness(isoHoursAgo(3), NOW)).toBe('Synced 3 hours ago');
    expect(formatSyncFreshness(isoHoursAgo(1), NOW)).toBe('Synced 1 hour ago');
    expect(formatSyncFreshness(isoHoursAgo(50), NOW)).toBe('Synced 2 days ago');
  });
});

describe('toCapabilityViews', () => {
  it('labels unverified metrics honestly and resolves display names', () => {
    const views = toCapabilityViews([
      { metricType: 'steps', access: 'read', granularity: 'daily', verified: false },
      { metricType: 'resting_heart_rate', access: 'read', granularity: 'daily', verified: false },
    ]);
    expect(views[0]).toMatchObject({
      metricType: 'steps',
      displayName: 'Steps',
      verified: false,
      availabilityLabel: 'Expected · unverified',
    });
    expect(views[1]?.availabilityLabel).toBe('Expected · unverified');
  });

  it('labels verified metrics as available', () => {
    const [view] = toCapabilityViews([
      { metricType: 'steps', access: 'read', granularity: 'daily', verified: true },
    ]);
    expect(view?.availabilityLabel).toBe('Available');
  });
});

describe('metricDisplayName', () => {
  it('falls back to a prettified code for unknown metrics', () => {
    expect(metricDisplayName('made_up_metric')).toBe('Made Up Metric');
  });
});

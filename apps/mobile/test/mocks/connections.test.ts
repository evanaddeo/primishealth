/**
 * Schema + safety tests for the provider-connection mocks (CU-060).
 *
 * Verifies the dev fixtures conform to the Phase E contracts, expose no token
 * refs / secrets, and that each scenario derives to the intended UI state.
 *
 * @see apps/mobile/src/mocks/connections.ts
 */

import { describe, expect, it } from 'vitest';

import {
  DisconnectConnectionResponseDtoSchema,
  ListConnectionsResponseDtoSchema,
  ManualSyncResponseDtoSchema,
  ProviderCapabilitiesDtoSchema,
  StartAuthorizationResponseDtoSchema,
  SyncStatusListResponseDtoSchema,
} from '@primis/api-contracts';

import {
  MOCK_DISCONNECT_RESPONSE,
  MOCK_GOOGLE_HEALTH_CAPABILITIES,
  MOCK_MANUAL_SYNC_RESPONSE,
  MOCK_START_AUTHORIZATION,
  getMockConnections,
  type MockConnectionState,
} from '../../src/mocks/connections';
import { deriveConnectionUiState } from '../../src/features/connections/connectionState';

const NOW = new Date('2026-06-17T12:00:00.000Z');

const STATES: MockConnectionState[] = [
  'disconnected',
  'connecting',
  'active',
  'stale',
  'needs_reauth',
  'unavailable',
];

describe('getMockConnections', () => {
  it.each(STATES)('produces schema-valid connection + sync data for %s', (state) => {
    const snap = getMockConnections(state, NOW);
    expect(ListConnectionsResponseDtoSchema.safeParse(snap.connections).success).toBe(true);
    expect(SyncStatusListResponseDtoSchema.safeParse(snap.syncStatuses).success).toBe(true);
  });

  it.each(STATES)('derives to the intended UI state for %s', (state) => {
    const snap = getMockConnections(state, NOW);
    const connection = snap.connections.connections[0] ?? null;
    const syncStatus = snap.syncStatuses.statuses[0] ?? null;
    expect(deriveConnectionUiState({ connection, syncStatus, now: NOW })).toBe(state);
  });

  it('uses the ADR-001 canonical provider code and a display name', () => {
    const snap = getMockConnections('active', NOW);
    const connection = snap.connections.connections[0];
    expect(connection?.providerCode).toBe('google_health');
    expect(connection?.displayName).toBe('Google Health');
  });

  it('never exposes token refs or secret fields', () => {
    for (const state of STATES) {
      const snap = getMockConnections(state, NOW);
      const serialized = JSON.stringify(snap);
      expect(serialized).not.toMatch(/access_token|refresh_token|secret_ref|secretRef|Bearer/i);
    }
  });

  it('returns an empty list for the disconnected state', () => {
    const snap = getMockConnections('disconnected', NOW);
    expect(snap.connections.connections).toHaveLength(0);
    expect(snap.syncStatuses.statuses).toHaveLength(0);
  });
});

describe('static connection fixtures', () => {
  it('declares schema-valid, unverified capabilities', () => {
    expect(ProviderCapabilitiesDtoSchema.safeParse(MOCK_GOOGLE_HEALTH_CAPABILITIES).success).toBe(
      true,
    );
    expect(MOCK_GOOGLE_HEALTH_CAPABILITIES.metrics.every((m) => m.verified === false)).toBe(true);
  });

  it('uses a placeholder authorization URL with no real credentials', () => {
    expect(StartAuthorizationResponseDtoSchema.safeParse(MOCK_START_AUTHORIZATION).success).toBe(
      true,
    );
    expect(MOCK_START_AUTHORIZATION.authorizeUrl).toContain('client_id=PLACEHOLDER');
  });

  it('provides schema-valid disconnect and manual-sync responses', () => {
    expect(DisconnectConnectionResponseDtoSchema.safeParse(MOCK_DISCONNECT_RESPONSE).success).toBe(
      true,
    );
    expect(ManualSyncResponseDtoSchema.safeParse(MOCK_MANUAL_SYNC_RESPONSE).success).toBe(true);
  });
});

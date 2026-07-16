import { describe, expect, it } from 'vitest';

import {
  getConnectionStateCopy,
  type ConnectionUiState,
} from '../../src/features/connections/connectionState';
import {
  AI_DISCLOSURE,
  DELETION_DISCLOSURE,
  RETENTION_CONTROL,
  buildAppAuthenticationViewModel,
  buildConnectedSourceViewModel,
} from '../../src/features/privacy/privacyModel';

describe('privacy behavior descriptors', () => {
  it('keeps current, planned, and informational behavior visibly distinct', () => {
    expect(buildAppAuthenticationViewModel('signedIn').behaviorStatus).toBe('implemented');
    expect(RETENTION_CONTROL.behaviorStatus).toBe('planned');
    expect(DELETION_DISCLOSURE.behaviorStatus).toBe('planned');
    expect(AI_DISCLOSURE.behaviorStatus).toBe('informational');
  });

  it('labels retention as a non-editable Phase Z placeholder', () => {
    const text = `${RETENTION_CONTROL.badgeLabel} ${RETENTION_CONTROL.body}`;
    expect(text).toContain('Phase Z');
    expect(text).toContain('not editable');
    expect(text).toContain('placeholder');
  });

  it('makes the deletion entry structurally and verbally non-functional', () => {
    expect(DELETION_DISCLOSURE.canSubmitRequest).toBe(false);
    expect(DELETION_DISCLOSURE.canScheduleDeletion).toBe(false);
    expect(DELETION_DISCLOSURE.badgeLabel).toBe('Not operational');
    expect(DELETION_DISCLOSURE.explanation.join(' ')).toContain(
      'No request is sent or scheduled from this screen.',
    );
  });

  it('marks AI disclosure copy as draft, informational, and non-legal', () => {
    expect(AI_DISCLOSURE.badgeLabel).toContain('Draft');
    expect(AI_DISCLOSURE.body).toContain('not final legal');
    expect(AI_DISCLOSURE.explanation.join(' ')).toContain('raw provider payloads');
  });
});

describe('app authentication boundary', () => {
  it.each(['signedIn', 'signedOut'] as const)(
    'separates %s app authentication from health-data authorization',
    (authStatus) => {
      const model = buildAppAuthenticationViewModel(authStatus);
      expect(model.body).toContain('separate');
      expect(model.body).toContain('Google Health');
      expect(model.badgeLabel).toBe(authStatus === 'signedIn' ? 'Signed in' : 'Signed out');
    },
  );
});

describe('connected source display model', () => {
  const states: ConnectionUiState[] = [
    'disconnected',
    'connecting',
    'active',
    'stale',
    'needs_reauth',
    'unavailable',
  ];

  it.each(states)('reuses the public connection copy for %s', (connectionState) => {
    const expected = getConnectionStateCopy(connectionState);
    const model = buildConnectedSourceViewModel({
      loadStatus: 'ready',
      connectionState,
      freshnessLabel: 'Synced 1 hour ago',
    });

    expect(model).toMatchObject({
      providerName: 'Google Health',
      badgeStatus: expected.badgeStatus,
      badgeLabel: expected.badgeLabel,
      headline: expected.headline,
      body: expected.body,
      canRetry: false,
    });
    expect(model.freshnessLabel).toBe(
      connectionState === 'disconnected' ? null : 'Synced 1 hour ago',
    );
  });

  it('maps loading without exposing provider details', () => {
    const model = buildConnectedSourceViewModel({
      loadStatus: 'loading',
      connectionState: 'disconnected',
      freshnessLabel: 'Not synced yet',
    });
    expect(model.badgeLabel).toBe('Checking');
    expect(model.freshnessLabel).toBeNull();
    expect(model.canRetry).toBe(false);
  });

  it('maps load errors to a retryable unavailable status', () => {
    const model = buildConnectedSourceViewModel({
      loadStatus: 'error',
      connectionState: 'disconnected',
      freshnessLabel: 'Not synced yet',
    });
    expect(model.badgeLabel).toBe('Status unavailable');
    expect(model.canRetry).toBe(true);
    expect(model.body).not.toContain('connection ID');
  });
});

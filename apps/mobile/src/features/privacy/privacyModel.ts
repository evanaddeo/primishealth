/**
 * Pure display model for Privacy & Data Controls (CU-086).
 *
 * Operational provider state remains owned by the connections feature. This
 * module adapts only its public display state and keeps placeholder copy separate
 * from live behavior so later CUs cannot accidentally make it look operational.
 */

import type { StatusBadgeStatus } from '@primis/design-system';

import type { AuthStatus } from '../../state/authStore';
import { getConnectionStateCopy, type ConnectionUiState } from '../connections/connectionState';

export type PrivacyBehaviorStatus = 'implemented' | 'planned' | 'informational';
export type PrivacySourceLoadStatus = 'loading' | 'ready' | 'error';

export interface PrivacyBoundaryViewModel {
  readonly behaviorStatus: PrivacyBehaviorStatus;
  readonly badgeStatus: StatusBadgeStatus;
  readonly badgeLabel: string;
  readonly headline: string;
  readonly body: string;
}

export interface PrivacySourceViewModel extends PrivacyBoundaryViewModel {
  readonly providerName: string;
  readonly freshnessLabel: string | null;
  readonly canRetry: boolean;
}

export interface PrivacyControlDescriptor {
  readonly behaviorStatus: PrivacyBehaviorStatus;
  readonly badgeStatus: StatusBadgeStatus;
  readonly badgeLabel: string;
  readonly title: string;
  readonly body: string;
}

export interface DeletionDisclosureDescriptor extends PrivacyControlDescriptor {
  readonly sheetTitle: string;
  readonly explanation: readonly string[];
  /** Hard safety boundary: CU-086 cannot submit or schedule deletion. */
  readonly canSubmitRequest: false;
  readonly canScheduleDeletion: false;
}

export interface AiDisclosureDescriptor extends PrivacyControlDescriptor {
  readonly sheetTitle: string;
  readonly explanation: readonly string[];
}

export function buildAppAuthenticationViewModel(authStatus: AuthStatus): PrivacyBoundaryViewModel {
  return {
    behaviorStatus: 'implemented',
    badgeStatus: authStatus === 'signedIn' ? 'available' : 'unknown',
    badgeLabel: authStatus === 'signedIn' ? 'Signed in' : 'Signed out',
    headline: 'Primis account authentication',
    body:
      authStatus === 'signedIn'
        ? 'Your Primis sign-in proves your identity to the app. It is separate from and does not grant access to Google Health data.'
        : 'You are not signed in to Primis. App sign-in remains separate from Google Health data authorization.',
  };
}

export function buildConnectedSourceViewModel(input: {
  loadStatus: PrivacySourceLoadStatus;
  connectionState: ConnectionUiState;
  freshnessLabel: string;
}): PrivacySourceViewModel {
  if (input.loadStatus === 'loading') {
    return {
      behaviorStatus: 'implemented',
      providerName: 'Google Health',
      badgeStatus: 'provisional',
      badgeLabel: 'Checking',
      headline: 'Checking health-data authorization',
      body: 'Primis is checking the public connection status. No provider details are shown here.',
      freshnessLabel: null,
      canRetry: false,
    };
  }

  if (input.loadStatus === 'error') {
    return {
      behaviorStatus: 'implemented',
      providerName: 'Google Health',
      badgeStatus: 'calculation_error',
      badgeLabel: 'Status unavailable',
      headline: 'Couldn’t load connection status',
      body: 'Your authorization may be unchanged. Try again to check its current public status.',
      freshnessLabel: null,
      canRetry: true,
    };
  }

  const copy = getConnectionStateCopy(input.connectionState);
  return {
    behaviorStatus: 'implemented',
    providerName: 'Google Health',
    badgeStatus: copy.badgeStatus,
    badgeLabel: copy.badgeLabel,
    headline: copy.headline,
    body: copy.body,
    freshnessLabel: input.connectionState === 'disconnected' ? null : input.freshnessLabel,
    canRetry: false,
  };
}

export const RETENTION_CONTROL: PrivacyControlDescriptor = {
  behaviorStatus: 'planned',
  badgeStatus: 'unknown',
  badgeLabel: 'Planned · Phase Z',
  title: 'Data retention',
  body: 'Private-beta placeholder: retention preferences are not editable in the app. Current environment handling is configured manually; user controls are planned for Phase Z.',
};

export const DELETION_DISCLOSURE: DeletionDisclosureDescriptor = {
  behaviorStatus: 'planned',
  badgeStatus: 'unknown',
  badgeLabel: 'Not operational',
  title: 'Account & data deletion',
  body: 'The production deletion workflow is not available. Open the status explanation to review this boundary.',
  sheetTitle: 'Deletion status',
  explanation: [
    'No request is sent or scheduled from this screen.',
    'This private-beta entry point does not delete, disable, or close your Primis account or remove any stored data.',
    'A reviewed deletion workflow and user-facing controls are planned for later implementation.',
  ],
  canSubmitRequest: false,
  canScheduleDeletion: false,
};

export const AI_DISCLOSURE: AiDisclosureDescriptor = {
  behaviorStatus: 'informational',
  badgeStatus: 'provisional',
  badgeLabel: 'Draft · informational',
  title: 'AI processing',
  body: 'This is a product disclosure placeholder, not final legal or privacy-policy text.',
  sheetTitle: 'AI processing note',
  explanation: [
    'AI features use selected, task-specific Primis context such as summaries, trends, goals, and relevant manual inputs.',
    'Primis builds structured context for AI tasks; raw provider payloads, access tokens, and exact account identifiers are not sent as AI context.',
    'AI is enabled for the private beta. Final disclosure language and future user controls require public-release review.',
  ],
};

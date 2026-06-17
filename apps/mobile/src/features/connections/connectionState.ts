/**
 * Pure derivation + copy for the provider-connection UI (CU-060).
 *
 * Contains zero React / React Native imports so it runs in the Vitest node
 * environment. The `useConnections` hook and the presentational components build
 * on these helpers; all branching and wording lives here and is unit-tested.
 *
 * Design constraints (Phase G guardrails + CU-060):
 *   - Status is never color-only — every state carries a text label (UX-COLOR-001).
 *   - Language is calm, non-medical, and honest: provider metrics are *expected*,
 *     not confirmed, until Phase AA live validation
 *     (`docs/decisions/google-health-api-metric-availability.md`).
 *   - The Google Health *data* grant is described as separate from app sign-in
 *     (TAD §9.2). No raw provider payloads, tokens, or OAuth internals are exposed.
 *
 * @see apps/mobile/src/features/connections/useConnections.ts
 * @see packages/api-contracts/src/providerConnections.ts
 */

import type {
  ProviderCapabilityMetricDto,
  ProviderConnectionDto,
  SyncStatusDto,
} from '@primis/api-contracts';
import type { StatusBadgeStatus } from '@primis/design-system';
import { getMetric } from '@primis/health-metrics';

// ---------------------------------------------------------------------------
// UI state
// ---------------------------------------------------------------------------

/** The six provider-connection states the UI must render (CU-060). */
export type ConnectionUiState =
  | 'disconnected'
  | 'connecting'
  | 'active'
  | 'stale'
  | 'needs_reauth'
  | 'unavailable';

/**
 * Hours since the last successful sync after which the connection is shown as
 * "stale". Aligned with the provider-recency step function in Scoring Spec §8.2,
 * where recency drops sharply past 24h. This is a *display* threshold only — it
 * does not drive scoring (scores carry their own precomputed quality metadata).
 */
export const STALE_AFTER_HOURS = 24;

export interface ConnectionStateInput {
  /** The user's Google Health connection, or `null` when none exists. */
  readonly connection: ProviderConnectionDto | null;
  /** The matching sync status, or `null` when unknown / no connection. */
  readonly syncStatus: SyncStatusDto | null;
  /** True while an authorize round-trip is in flight (drives `connecting`). */
  readonly authorizing?: boolean;
  /** Reference time for staleness math. Defaults to now; fixed in tests. */
  readonly now?: Date;
}

function hoursSince(iso: string, now: Date): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / (1000 * 60 * 60);
}

/**
 * Map a raw connection + sync status to one of the six display states.
 *
 * The DTO `status` ('active' | 'needs_reauth' | 'revoked' | 'error' | 'disabled')
 * is collapsed into the UI vocabulary: `revoked`/`error`/`disabled` all read as
 * `unavailable`, and an `active` connection is further split into
 * `connecting` / `active` / `stale` based on sync recency.
 */
export function deriveConnectionUiState(input: ConnectionStateInput): ConnectionUiState {
  const { connection, syncStatus, authorizing = false } = input;
  const now = input.now ?? new Date();

  if (connection === null) {
    return authorizing ? 'connecting' : 'disconnected';
  }

  switch (connection.status) {
    case 'needs_reauth':
      return 'needs_reauth';
    case 'revoked':
    case 'error':
    case 'disabled':
      return 'unavailable';
    default:
      break; // 'active' (or any forward-compatible value) handled below
  }

  // Active connection: split by sync recency.
  if (connection.lastSuccessfulSyncAt === null) {
    // Connected but no successful sync yet — the first backfill is still running.
    return 'connecting';
  }

  const pending = syncStatus?.pendingJobCount ?? 0;
  const hours = hoursSince(connection.lastSuccessfulSyncAt, now);
  if (hours !== null && hours > STALE_AFTER_HOURS && pending === 0) {
    return 'stale';
  }
  return 'active';
}

// ---------------------------------------------------------------------------
// Per-state copy
// ---------------------------------------------------------------------------

/** Action a state's primary button performs, or `null` when there is none. */
export type ConnectionAction = 'authorize' | 'reauthorize';

export interface ConnectionStateCopy {
  /** StatusBadge semantic status — never color-only; always paired with a label. */
  readonly badgeStatus: StatusBadgeStatus;
  /** Short status label shown in the badge. */
  readonly badgeLabel: string;
  /** One-line headline for the connection card. */
  readonly headline: string;
  /** Honest, non-medical explanation of the current state. */
  readonly body: string;
  /** Primary CTA label, or `null` when no primary action applies. */
  readonly primaryActionLabel: string | null;
  /** What the primary CTA does, or `null`. */
  readonly primaryAction: ConnectionAction | null;
  /** Whether a disconnect control should be offered in this state. */
  readonly canDisconnect: boolean;
}

const CONNECTION_STATE_COPY: Record<ConnectionUiState, ConnectionStateCopy> = {
  disconnected: {
    badgeStatus: 'unknown',
    badgeLabel: 'Not connected',
    headline: 'Connect Google Health',
    body: 'Connect Google Health so Primis can read the health data it uses to build your scores. You choose what to share on Google’s screen, and you can disconnect anytime.',
    primaryActionLabel: 'Connect Google Health',
    primaryAction: 'authorize',
    canDisconnect: false,
  },
  connecting: {
    badgeStatus: 'provisional',
    badgeLabel: 'Connecting',
    headline: 'Finishing setup',
    body: 'Primis is completing the connection and pulling in your first window of data. This can take a little while after you authorize.',
    primaryActionLabel: null,
    primaryAction: null,
    canDisconnect: true,
  },
  active: {
    badgeStatus: 'available',
    badgeLabel: 'Connected',
    headline: 'Google Health connected',
    body: 'Primis is reading your authorized Google Health data. Which metrics arrive depends on your device, so individual values aren’t guaranteed.',
    primaryActionLabel: null,
    primaryAction: null,
    canDisconnect: true,
  },
  stale: {
    badgeStatus: 'stale_data',
    badgeLabel: 'Data may be delayed',
    headline: 'Sync is behind',
    body: 'Primis hasn’t received fresh data from Google Health recently, so your latest numbers may be delayed. Open Google Health on your phone to sync, or refresh below.',
    primaryActionLabel: null,
    primaryAction: null,
    canDisconnect: true,
  },
  needs_reauth: {
    badgeStatus: 'not_enough_data',
    badgeLabel: 'Action needed',
    headline: 'Reconnect Google Health',
    body: 'Your Google Health authorization has expired. Reconnect so Primis can keep reading your health data — anything already synced stays put.',
    primaryActionLabel: 'Reconnect Google Health',
    primaryAction: 'reauthorize',
    canDisconnect: true,
  },
  unavailable: {
    badgeStatus: 'provider_unavailable',
    badgeLabel: 'Unavailable',
    headline: 'Connection unavailable',
    body: 'Primis can’t reach your Google Health connection right now. This is usually temporary — you can try reconnecting, or check back later.',
    primaryActionLabel: 'Try reconnecting',
    primaryAction: 'authorize',
    canDisconnect: true,
  },
};

/** Resolve the copy descriptor for a connection state. */
export function getConnectionStateCopy(state: ConnectionUiState): ConnectionStateCopy {
  return CONNECTION_STATE_COPY[state];
}

/** Whether a manual "Refresh now" control should be offered for this state. */
export function canRefresh(state: ConnectionUiState): boolean {
  return state === 'active' || state === 'stale';
}

// ---------------------------------------------------------------------------
// Sync freshness
// ---------------------------------------------------------------------------

/**
 * Human-readable freshness label for a last-sync timestamp.
 * Returns calm, approximate phrasing — never fabricated precision.
 */
export function formatSyncFreshness(lastSyncAt: string | null, now: Date = new Date()): string {
  if (lastSyncAt === null) return 'Not synced yet';

  const hours = hoursSince(lastSyncAt, now);
  if (hours === null) return 'Last sync time unavailable';
  if (hours <= 0) return 'Synced just now';

  const minutes = hours * 60;
  if (minutes < 1) return 'Synced just now';
  if (minutes < 60) {
    const m = Math.round(minutes);
    return `Synced ${m} min ago`;
  }
  if (hours < 24) {
    const h = Math.round(hours);
    return `Synced ${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(hours / 24);
  return `Synced ${days} day${days === 1 ? '' : 's'} ago`;
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export interface CapabilityView {
  readonly metricType: string;
  readonly displayName: string;
  /** Short availability tag shown next to the metric. */
  readonly availabilityLabel: string;
  /** Whether availability has been live-validated (always false in this phase). */
  readonly verified: boolean;
}

/** Resolve a friendly display name for a canonical metric code. */
export function metricDisplayName(metricType: string): string {
  try {
    return getMetric(metricType).displayName;
  } catch {
    // Unknown / unmapped code — prettify the raw code rather than throwing.
    return metricType
      .split('_')
      .map((part) => (part.length > 0 ? part[0]!.toUpperCase() + part.slice(1) : part))
      .join(' ');
  }
}

/**
 * Map provider capability metrics to display rows.
 *
 * Per the availability decision doc, unverified metrics are labelled honestly:
 * Primis expects them, but their availability is not confirmed for this phase.
 */
export function toCapabilityViews(
  metrics: readonly ProviderCapabilityMetricDto[],
): CapabilityView[] {
  return metrics.map((m) => ({
    metricType: m.metricType,
    displayName: metricDisplayName(m.metricType),
    availabilityLabel: m.verified ? 'Available' : 'Expected · unverified',
    verified: m.verified,
  }));
}

// ---------------------------------------------------------------------------
// Static explanatory copy
// ---------------------------------------------------------------------------

/**
 * Permission / privacy points shown on the connections screen. Covers the
 * app-sign-in vs health-data-grant separation (TAD §9.2), user control, and the
 * read-only, no-raw-data posture.
 */
export const HEALTH_PERMISSION_NOTES: readonly string[] = [
  'Connecting Google Health is separate from signing in to Primis — this grant only lets Primis read your health data.',
  'You decide what Primis can access on Google’s consent screen, and you can disconnect at any time.',
  'Primis reads your data to build your scores. It never writes back to Google Health and never shows raw Google data here.',
];

/**
 * Honest framing for the capability list per the availability decision doc:
 * what actually arrives depends on the device and Google Health.
 */
export const UNVERIFIED_AVAILABILITY_NOTE =
  'Which of these actually arrive depends on your device and Google Health. Primis lists what it expects to read — availability isn’t confirmed yet.';

/**
 * Mock data provider barrel export for @primis/mobile — DEVELOPMENT ONLY.
 *
 * CU-023 — Add mock dashboard data provider
 *
 * Re-exports all mock fixtures and types. Import from `@/mocks` (or the
 * relative path) rather than individual files for stable call sites.
 *
 * All exports from this module are DEVELOPMENT ONLY and must only be used
 * when EXPO_PUBLIC_MOCK_MODE=true. The `isMock: true` literal guard on each
 * mock sub-shape enforces this at the type level.
 *
 * @see apps/mobile/src/mocks/README.md — mock mode documentation
 * @see apps/mobile/src/api/client.ts — MockModeError / mockMode toggle
 */

// Dashboard assembler and shared dashboard types
export {
  getMockDashboard,
  getMockHomeSnapshot,
  getMockTodayDashboard,
  MOCK_LOW_RECOVERY,
  MOCK_MISSING_DATA,
  MOCK_NORMAL,
  MOCK_STALE_DATA,
} from './dashboard';
export type {
  HomeTrendPoint,
  HomeWidgetSupplement,
  MockDashboard,
  MockDashboardState,
  MockHomeSnapshot,
  MockSyncStatus,
} from './dashboard';

// Sleep score snapshots + sleep detail fixtures (CU-063)
export {
  getMockSleepDetail,
  MOCK_SLEEP_LOW_RECOVERY,
  MOCK_SLEEP_MISSING,
  MOCK_SLEEP_NORMAL,
  MOCK_SLEEP_STALE,
} from './sleep';
export type { MockSleepDetailState } from './sleep';

// Bedtime Planner deterministic output (CU-064)
export { DEFAULT_MOCK_BEDTIME_STATE, getMockBedtimePlan } from './bedtime';
export type { MockBedtimeState } from './bedtime';

// Recovery score snapshots + recovery detail fixtures (CU-065)
export {
  getMockRecoveryDetail,
  MOCK_RECOVERY_LOW_RECOVERY,
  MOCK_RECOVERY_MISSING,
  MOCK_RECOVERY_NORMAL,
  MOCK_RECOVERY_PROVISIONAL,
  MOCK_RECOVERY_STALE,
} from './recovery';
export type { MockRecoveryDetailState } from './recovery';

// Vitals detail fixtures (CU-067)
export { getMockVitalsDetail } from './vitals';
export type { MockVitalsDetailState } from './vitals';

// Body composition fixtures — local shape, no contract yet (CU-067)
export { getMockBodyComposition } from './bodyComposition';
export type { MockBodyCompositionState } from './bodyComposition';

// Activity summaries
export {
  MOCK_ACTIVITY_LOW_RECOVERY,
  MOCK_ACTIVITY_MISSING,
  MOCK_ACTIVITY_NORMAL,
  MOCK_ACTIVITY_STALE,
  getMockActivityDetail,
} from './activity';
export type { MockActivitySummary, MockActivityDetailState } from './activity';

// AI coach summaries
export {
  MOCK_AI_LOW_RECOVERY,
  MOCK_AI_MISSING_DATA,
  MOCK_AI_NORMAL,
  MOCK_AI_STALE_DATA,
} from './ai';
export type { MockAiSummary } from './ai';

// AI Coach chat responses (CU-084) — simulated streaming source
export { buildMockCoachResponse, classifyMockIntent } from './coach';

// Provider connections + sync status (CU-060)
export {
  DEFAULT_MOCK_CONNECTION_STATE,
  MOCK_DISCONNECT_RESPONSE,
  MOCK_GOOGLE_HEALTH_CAPABILITIES,
  MOCK_MANUAL_SYNC_RESPONSE,
  MOCK_START_AUTHORIZATION,
  getMockConnections,
} from './connections';
export type { MockConnectionState, MockConnectionsSnapshot } from './connections';

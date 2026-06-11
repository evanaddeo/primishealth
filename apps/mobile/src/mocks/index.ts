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
  MOCK_LOW_RECOVERY,
  MOCK_MISSING_DATA,
  MOCK_NORMAL,
  MOCK_STALE_DATA,
} from './dashboard';
export type { MockDashboard, MockDashboardState, MockSyncStatus } from './dashboard';

// Sleep score snapshots
export {
  MOCK_SLEEP_LOW_RECOVERY,
  MOCK_SLEEP_MISSING,
  MOCK_SLEEP_NORMAL,
  MOCK_SLEEP_STALE,
} from './sleep';

// Recovery score snapshots
export {
  MOCK_RECOVERY_LOW_RECOVERY,
  MOCK_RECOVERY_MISSING,
  MOCK_RECOVERY_NORMAL,
  MOCK_RECOVERY_STALE,
} from './recovery';

// Activity summaries
export {
  MOCK_ACTIVITY_LOW_RECOVERY,
  MOCK_ACTIVITY_MISSING,
  MOCK_ACTIVITY_NORMAL,
  MOCK_ACTIVITY_STALE,
} from './activity';
export type { MockActivitySummary } from './activity';

// AI coach summaries
export {
  MOCK_AI_LOW_RECOVERY,
  MOCK_AI_MISSING_DATA,
  MOCK_AI_NORMAL,
  MOCK_AI_STALE_DATA,
} from './ai';
export type { MockAiSummary } from './ai';

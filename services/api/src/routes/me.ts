/**
 * GET /api/v1/me — Returns the authenticated user's profile.
 *
 * CU-032 introduced this route as a minimal shell; CU-033 replaces the
 * implementation with the full `UserProfileDto` from `@primis/api-contracts`
 * including auto-bootstrap, goals, coach preferences, and theme preference.
 *
 * This file re-exports `userRouter` as `meRouter` for backward compatibility
 * with existing tests and route registrations. All route logic lives in
 * `routes/user.ts`.
 *
 * @see services/api/src/routes/user.ts — full implementation
 */

import type { UserProfileDto } from '@primis/api-contracts';

// Re-export userRouter under the legacy name used by app.ts and tests.
export { userRouter as meRouter } from './user.js';

/**
 * Shape of the data field returned by `GET /api/v1/me`.
 *
 * Aliased to `UserProfileDto` from `@primis/api-contracts`.
 * CU-032 tests that import `MeResponseData` continue to work because
 * `UserProfileDto` is a superset of the original minimal shape.
 */
export type MeResponseData = UserProfileDto;

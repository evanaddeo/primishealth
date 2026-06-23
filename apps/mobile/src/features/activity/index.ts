/**
 * Activity feature — public surface (CU-066).
 *
 * The screen consumes the Phase F `ActivityDetailResponseDto` via the
 * `useActivityDetail` adapter and renders movement, energy, workouts, and
 * training-load context. No scoring or AI runs on the render path.
 */

export { ActivityScreen } from './ActivityScreen';

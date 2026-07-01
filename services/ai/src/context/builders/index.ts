/**
 * Context builders barrel for `@primis/ai` (CU-079+).
 *
 * Exports the profile/score/baseline builders, their read-only data ports + read
 * models, payload types, and the shared builder utilities. Domain builders
 * (sleep/recovery/training/nutrition/bedtime/manual) land in CU-080.
 */

export { ProfileContextBuilder } from './ProfileContextBuilder.js';
export { ScoreContextBuilder } from './ScoreContextBuilder.js';
export { BaselineContextBuilder } from './BaselineContextBuilder.js';

export * from './types.js';
export * from './builderUtils.js';

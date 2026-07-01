/**
 * Context engine barrel for `@primis/ai` (CU-078).
 *
 * Re-exports the versioned context-packet schemas/types (from `@primis/api-contracts`
 * via {@link ./AiContextPacket}) and the builder interfaces (CU-079/080 implement these).
 */

export * from './AiContextPacket.js';
export * from './contextTypes.js';

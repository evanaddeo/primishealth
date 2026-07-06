/**
 * AI Coach feature public surface (CU-084).
 */

export { CoachScreen } from './CoachScreen';
export { useCoachChat } from './useCoachChat';
export type { CoachChatController } from './useCoachChat';
export {
  SUGGESTED_PROMPTS,
  applyStreamEvent,
  canSend,
  chunkAnswer,
  createPendingAssistantMessage,
  createUserMessage,
  isSafeResponse,
  resolveCaveats,
  resolveEvidenceChips,
  resolveFollowUps,
  resolveModelStateLabel,
} from './coachModel';
export type {
  CoachMessage,
  CoachMessageRole,
  CoachMessageStatus,
  SuggestedPrompt,
} from './coachModel';

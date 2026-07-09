/**
 * AI Coach feature public surface (CU-084).
 */

export { CoachScreen } from './CoachScreen';
export { useCoachChat } from './useCoachChat';
export type { CoachChatController, CoachSendOptions } from './useCoachChat';
export {
  COACH_ROUTE,
  buildCoachPrefillParams,
  getAskAiSurfaceConfig,
  parseCoachPrefill,
} from './contextualNavigation';
export type {
  AskAiSurface,
  AskAiSurfaceConfig,
  CoachPrefill,
  CoachPrefillParams,
} from './contextualNavigation';
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

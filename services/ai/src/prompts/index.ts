/**
 * Prompts barrel for `@primis/ai` (CU-081).
 *
 * Exports the prompt composer, versioned templates, and the structured output-contract
 * helpers. Prompt templates are backend-only and must never ship to mobile (ARCH-AI-001).
 */

export { PromptComposer, defaultPromptComposer, deriveDataSignals } from './PromptComposer.js';
export type { ComposePromptInput, ComposedPrompt } from './PromptComposer.js';

export {
  PROMPT_TEMPLATE_VERSION,
  BASE_SYSTEM_PROMPT,
  BASE_SYSTEM_PROMPT_ID,
  SYSTEM_PROMPT_REQUIREMENTS,
  taskTemplateForIntent,
  toneDirective,
} from './templates.js';
export type { TaskTemplate } from './templates.js';

export {
  AiStructuredResponseSchema,
  INTENT_RESPONSE_TYPE,
  buildOutputContract,
  describeOutputContract,
} from './outputContracts.js';
export type {
  AiRecommendation,
  AiRecommendationType,
  EvidenceUsage,
  AiFollowUpQuestion,
  AiUiCard,
  AiModelMetadata,
  AiStructuredResponse,
  BuildOutputContractOptions,
} from './outputContracts.js';

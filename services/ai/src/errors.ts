/**
 * Typed error hierarchy for the AI gateway.
 *
 * Errors are intentionally message-safe: they describe *configuration/transport*
 * problems, never health content. Do not embed prompts or payloads in messages.
 */

import type { AiProviderCode } from './types.js';

/** Base class for all `@primis/ai` gateway errors. */
export class AiGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Thrown when a live provider is selected but its credentials are absent or a
 * `PLACEHOLDER`. Callers should catch this and fall back to the mock provider or
 * surface a graceful "AI unavailable" state — never crash a request path.
 */
export class AiProviderNotConfiguredError extends AiGatewayError {
  readonly provider: AiProviderCode;

  constructor(provider: AiProviderCode) {
    super(
      `AI provider "${provider}" is not configured (missing or placeholder API key). ` +
        `Set a real key or route to the mock provider.`,
    );
    this.provider = provider;
  }
}

/** Thrown when a provider does not implement a requested capability (e.g. streaming). */
export class AiCapabilityUnsupportedError extends AiGatewayError {
  readonly provider: AiProviderCode;
  readonly capability: string;

  constructor(provider: AiProviderCode, capability: string) {
    super(`AI provider "${provider}" does not support capability "${capability}".`);
    this.provider = provider;
    this.capability = capability;
  }
}

/** Thrown when no provider can serve a request (misconfigured routing). */
export class AiProviderUnavailableError extends AiGatewayError {
  constructor(message: string) {
    super(message);
  }
}

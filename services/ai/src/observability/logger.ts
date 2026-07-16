import {
  createRuntimeLogSink,
  createStructuredLogger,
  resolveLogEnvironment,
  type AiRuntimeEventName,
  type LogEnvironment,
  type LogSink,
  type StructuredLogger,
} from '@primis/config';

import type { AiInvocationFailureTelemetry, AiInvocationTelemetry } from '../types.js';

export type AiLogger = StructuredLogger<AiRuntimeEventName>;

export interface AiLoggerOptions {
  readonly sink?: LogSink;
  readonly environment?: LogEnvironment;
  readonly now?: () => Date;
}

const AI_EVENTS: readonly AiRuntimeEventName[] = ['ai.gateway.completed', 'ai.gateway.failed'];

export function createAiLogger(options: AiLoggerOptions = {}): AiLogger {
  return createStructuredLogger({
    service: 'primis-ai',
    environment: options.environment ?? resolveLogEnvironment(process.env['APP_ENV']),
    sink: options.sink ?? createRuntimeLogSink(),
    allowedEvents: AI_EVENTS,
    ...(options.now ? { now: options.now } : {}),
  });
}

export const aiLogger = createAiLogger();

export interface SafeAiGatewayLogger {
  logInvocation(telemetry: AiInvocationTelemetry): void;
  logFailure(telemetry: AiInvocationFailureTelemetry): void;
}

/** Thin bridge from the gateway's closed telemetry DTO to structured events. */
export function createAiGatewayLogger(logger: AiLogger = aiLogger): SafeAiGatewayLogger {
  return {
    logInvocation(telemetry) {
      logger.emit(
        'ai.gateway.completed',
        {
          provider: telemetry.provider,
          model: telemetry.model,
          taskType: telemetry.taskType,
          modelTier: telemetry.modelTier,
          status: telemetry.status,
          latencyMs: telemetry.latencyMs,
          ...(telemetry.usage
            ? {
                usage: {
                  promptTokens: telemetry.usage.promptTokens,
                  completionTokens: telemetry.usage.completionTokens,
                  totalTokens: telemetry.usage.totalTokens,
                },
              }
            : {}),
        },
        { correlationId: telemetry.correlationId },
      );
    },
    logFailure(telemetry) {
      logger.emit(
        'ai.gateway.failed',
        {
          provider: telemetry.provider,
          taskType: telemetry.taskType,
          modelTier: telemetry.modelTier,
          errorClassification: telemetry.error.classification,
          ...(telemetry.error.code ? { errorCode: telemetry.error.code } : {}),
        },
        { correlationId: telemetry.correlationId },
      );
    },
  };
}

export const aiGatewayLogger = createAiGatewayLogger();

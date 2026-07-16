import {
  createRuntimeLogSink,
  createStructuredLogger,
  resolveLogEnvironment,
  type ApiRuntimeEventName,
  type LogEnvironment,
  type LogSink,
  type StructuredLogger,
} from '@primis/config';

export type ApiLogger = StructuredLogger<ApiRuntimeEventName>;

export interface ApiLoggerOptions {
  readonly sink?: LogSink;
  readonly environment?: LogEnvironment;
  readonly now?: () => Date;
}

const API_EVENTS: readonly ApiRuntimeEventName[] = [
  'api.request.completed',
  'api.request.failed',
  'api.server.started',
  'ai.chat.completed',
  'ai.chat.failed',
];

export function createApiLogger(options: ApiLoggerOptions = {}): ApiLogger {
  return createStructuredLogger({
    service: 'primis-api',
    environment: options.environment ?? resolveLogEnvironment(process.env['APP_ENV']),
    sink: options.sink ?? createRuntimeLogSink(),
    allowedEvents: API_EVENTS,
    ...(options.now ? { now: options.now } : {}),
  });
}

export const apiLogger = createApiLogger();

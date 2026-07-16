import { createMiddleware } from 'hono/factory';
import { routePath } from 'hono/route';

import { apiLogger, type ApiLogger } from '../observability/logger.js';

type LoggedHttpMethod = 'DELETE' | 'GET' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT';

interface RequestLoggingVariables {
  requestId: string;
}

export interface RequestLoggingOptions {
  readonly logger?: ApiLogger;
  readonly now?: () => number;
}

/** Emits one body-free request completion event after the matched route returns. */
export function createRequestLoggingMiddleware(options: RequestLoggingOptions = {}) {
  const logger = options.logger ?? apiLogger;
  const now = options.now ?? (() => Date.now());

  return createMiddleware<{ Variables: RequestLoggingVariables }>(async (c, next) => {
    const startedAt = safeNow(now);
    await next();
    const durationMs = Math.max(0, safeNow(now) - startedAt);

    logger.emit(
      'api.request.completed',
      {
        method: c.req.method.toUpperCase() as LoggedHttpMethod,
        route: routePath(c, -1),
        statusCode: c.res.status,
        durationMs,
      },
      { requestId: c.get('requestId') },
    );
  });
}

function safeNow(now: () => number): number {
  try {
    const value = now();
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export const requestLoggingMiddleware = createRequestLoggingMiddleware();

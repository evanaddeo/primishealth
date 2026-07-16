import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';

import type { StructuredLogEntry } from '@primis/config';
import { createErrorHandler } from '../../src/middleware/errorHandler.js';
import { createRequestIdMiddleware } from '../../src/middleware/requestId.js';
import { createRequestLoggingMiddleware } from '../../src/middleware/requestLogging.js';
import { createApiLogger } from '../../src/observability/logger.js';

function testApp(entries: StructuredLogEntry[]) {
  const logger = createApiLogger({
    environment: 'test',
    sink: (entry) => entries.push(entry),
    now: () => new Date('2026-07-15T12:00:00.000Z'),
  });
  let tick = 10;
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use(
    '*',
    createRequestIdMiddleware(() => 'generated-request-id'),
  );
  app.use(
    '*',
    createRequestLoggingMiddleware({
      logger,
      now: () => {
        tick += 5;
        return tick;
      },
    }),
  );
  app.get('/items/:id', (c) => c.json({ ok: true }));
  app.get('/failure', () => {
    throw new Error('Bearer private-token person@example.invalid');
  });
  app.onError(createErrorHandler(logger));
  return app;
}

describe('API request correlation logging', () => {
  it('reuses a valid incoming request ID and emits the route template without body or URL data', async () => {
    const entries: StructuredLogEntry[] = [];
    const response = await testApp(entries).request('/items/private-user-id?token=private', {
      headers: { 'x-request-id': 'request-safe-123' },
    });

    expect(response.headers.get('x-request-id')).toBe('request-safe-123');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      event: 'api.request.completed',
      requestId: 'request-safe-123',
      metadata: { method: 'GET', route: '/items/:id', statusCode: 200, durationMs: 5 },
    });
    expect(JSON.stringify(entries)).not.toContain('private-user-id');
    expect(JSON.stringify(entries)).not.toContain('token=private');
  });

  it('rejects invalid incoming IDs and reuses the existing middleware generator', async () => {
    const entries: StructuredLogEntry[] = [];
    const response = await testApp(entries).request('/items/one', {
      headers: { 'x-request-id': 'person@example.invalid' },
    });

    expect(response.headers.get('x-request-id')).toBe('generated-request-id');
    expect(entries[0]?.requestId).toBe('generated-request-id');
  });

  it('emits only classified errors and preserves request correlation', async () => {
    const entries: StructuredLogEntry[] = [];
    const response = await testApp(entries).request('/failure', {
      headers: { 'x-request-id': 'failure-request-id' },
    });
    const serialized = JSON.stringify(entries);

    expect(response.status).toBe(500);
    expect(entries.some((entry) => entry.event === 'api.request.failed')).toBe(true);
    expect(entries.find((entry) => entry.event === 'api.request.failed')).toMatchObject({
      requestId: 'failure-request-id',
      metadata: {
        method: 'GET',
        route: '/failure',
        statusCode: 500,
        errorClassification: 'UnknownError',
      },
    });
    expect(serialized).not.toContain('private-token');
    expect(serialized).not.toContain('example.invalid');
    expect(serialized).not.toContain('stack');
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  classifyError,
  createJsonLineSink,
  createStructuredLogger,
  isForbiddenRuntimeKey,
  sanitizeCorrelationId,
  type StructuredLogEntry,
} from './logging.js';

const NOW = new Date('2026-07-15T12:00:00.000Z');

function capture() {
  const entries: StructuredLogEntry[] = [];
  const sink = vi.fn((entry: StructuredLogEntry) => entries.push(entry));
  const logger = createStructuredLogger({
    service: 'primis-ai',
    environment: 'dev',
    sink,
    now: () => NOW,
  });
  return { entries, logger, sink };
}

describe('structured runtime logging policy', () => {
  it('emits stable base fields and only event-allowlisted metadata', () => {
    const { entries, logger } = capture();
    logger.emit(
      'ai.gateway.completed',
      {
        provider: 'mock',
        model: 'mock-model',
        taskType: 'chat_health_query',
        modelTier: 'standard',
        status: 'completed',
        latencyMs: 12,
        usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
      },
      { requestId: 'req-safe-1', correlationId: 'corr-safe-1' },
    );

    expect(entries).toEqual([
      {
        timestamp: NOW.toISOString(),
        level: 'info',
        service: 'primis-ai',
        environment: 'dev',
        event: 'ai.gateway.completed',
        requestId: 'req-safe-1',
        correlationId: 'corr-safe-1',
        metadata: {
          provider: 'mock',
          model: 'mock-model',
          taskType: 'chat_health_query',
          modelTier: 'standard',
          status: 'completed',
          latencyMs: 12,
          usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
        },
      },
    ]);
  });

  it('drops nested tokens, secrets, emails, identifiers, prompts, contexts, notes, payloads, and health values', () => {
    const { entries, logger } = capture();
    const malicious = {
      provider: 'mock',
      model: 'mock-model',
      taskType: 'chat_health_query',
      modelTier: 'standard',
      status: 'completed',
      latencyMs: 5,
      accessToken: 'Bearer private-token',
      api_key: 'sk-private',
      email: 'person@example.invalid',
      userId: 'real-user-id',
      authSubject: 'real-subject',
      deviceID: 'device-123',
      prompt: 'My HRV was 42',
      context_packet: { sleepScore: 82 },
      manualNotes: 'private note',
      digestion_notes: 'private note',
      nutritionNotes: 'private note',
      providerPayload: { steps: 10_000 },
      requestBody: { message: 'private content' },
      hrv: 42,
      heart_rate: 48,
      steps: 10_000,
      usage: {
        promptTokens: 3,
        completionTokens: 4,
        totalTokens: 7,
        refresh_token: 'private-refresh',
        nested: { email: 'nested@example.invalid', spo2: 98 },
      },
    };

    logger.emit('ai.gateway.completed', malicious as never);
    const serialized = JSON.stringify(entries[0]);

    expect(entries[0]?.metadata).toEqual({
      provider: 'mock',
      model: 'mock-model',
      taskType: 'chat_health_query',
      modelTier: 'standard',
      status: 'completed',
      latencyMs: 5,
      usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
    });
    for (const forbidden of [
      'private-token',
      'sk-private',
      'person@example.invalid',
      'real-user-id',
      'device-123',
      'My HRV',
      'sleepScore',
      'private note',
      'providerPayload',
      '10000',
      'nested@example.invalid',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('recursively sanitizes bounded arrays of approved aggregate objects', () => {
    const { entries, logger } = capture();
    const input = {
      categoryCount: 2,
      targetCount: 3,
      archiveObjectCount: 1,
      archivePrefixCount: 1,
      categories: [
        {
          category: 'identity_account',
          targetCount: 2,
          relationalRecordCount: 3,
          archiveObjectCount: 0,
          archivePrefixCount: 0,
          userId: 'private-user',
          nested: { token: 'private-token' },
        },
        {
          category: 'raw_archive',
          targetCount: 1,
          archiveObjectCount: 1,
          archivePrefixCount: 1,
          payload: { steps: 8_200 },
        },
      ],
    };
    logger.emit('privacy.deletion_dry_run.planned', input as never);

    expect(entries[0]?.metadata.categories).toEqual([
      {
        category: 'identity_account',
        targetCount: 2,
        relationalRecordCount: 3,
        archiveObjectCount: 0,
        archivePrefixCount: 0,
      },
      {
        category: 'raw_archive',
        targetCount: 1,
        archiveObjectCount: 1,
        archivePrefixCount: 1,
      },
    ]);
    expect(JSON.stringify(entries[0])).not.toContain('private-user');
    expect(JSON.stringify(entries[0])).not.toContain('8200');
  });

  it('drops wrong types, unsafe strings, oversized values, and non-finite numbers', () => {
    const { entries, logger } = capture();
    logger.emit(
      'api.request.completed',
      {
        method: 'TRACE',
        route: '/users/00000000-0000-4000-8000-000000000001?token=private',
        statusCode: Number.NaN,
        durationMs: Number.POSITIVE_INFINITY,
      } as never,
      { requestId: 'person@example.invalid', correlationId: 'x'.repeat(129) },
    );

    expect(entries[0]).toMatchObject({ metadata: {} });
    expect(entries[0]).not.toHaveProperty('requestId');
    expect(entries[0]).not.toHaveProperty('correlationId');
  });

  it('handles circular and malformed inputs without throwing or leaking them', () => {
    const { entries, logger } = capture();
    const circular: Record<string, unknown> = {
      provider: 'mock',
      model: 'mock-model',
      taskType: 'chat_health_query',
      modelTier: 'standard',
      status: 'completed',
      latencyMs: 1,
    };
    circular.self = circular;
    circular.cause = new Error('access_token=private');
    logger.emit('ai.gateway.completed', circular as never);

    const malformed = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('malformed object with private@example.invalid');
        },
      },
    );
    logger.emit('ai.gateway.completed', malformed as never);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.metadata).not.toHaveProperty('self');
    expect(entries[0]?.metadata).not.toHaveProperty('cause');
    expect(entries[1]?.metadata).toEqual({});
    expect(() => JSON.stringify(entries)).not.toThrow();
    expect(JSON.stringify(entries)).not.toContain('private@example.invalid');
  });

  it('does not mutate input metadata', () => {
    const { logger } = capture();
    const metadata = {
      provider: 'mock' as const,
      model: 'mock-model',
      taskType: 'chat_health_query' as const,
      modelTier: 'standard' as const,
      status: 'completed' as const,
      latencyMs: 2,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    };
    const before = structuredClone(metadata);
    logger.emit('ai.gateway.completed', metadata);
    expect(metadata).toEqual(before);
  });

  it('allowlists only bounded mobile performance fields', () => {
    const { entries, logger } = capture();
    logger.emit('mobile.performance.measurement', {
      eventCode: 'coach.first_token',
      durationMs: 42,
      outcome: 'completed',
      renderCount: 0,
      environment: 'dev',
      prompt: 'private prompt',
      userId: 'private-user',
      provider: 'private-provider',
      metricValue: 98,
      payload: { note: 'private note' },
    } as never);

    expect(entries[0]?.metadata).toEqual({
      eventCode: 'coach.first_token',
      durationMs: 42,
      outcome: 'completed',
      renderCount: 0,
      environment: 'dev',
    });
    expect(JSON.stringify(entries[0])).not.toContain('private');
  });

  it('isolates injected sink failures', () => {
    const logger = createStructuredLogger({
      service: 'primis-api',
      environment: 'test',
      sink: () => {
        throw new Error('sink failed');
      },
    });
    expect(() => logger.emit('api.server.started', { port: 3000 })).not.toThrow();
  });
});

describe('safe error classification and JSON-line sink', () => {
  it('classifies errors without serializing messages, stacks, or causes', () => {
    const cause = new Error('refresh_token=private');
    const error = new TypeError('person@example.invalid', { cause });
    const classified = classifyError(error);

    expect(classified).toEqual({ classification: 'TypeError' });
    expect(JSON.stringify(classified)).not.toContain('private');
    expect(JSON.stringify(classified)).not.toContain('example.invalid');
  });

  it('allowlists known codes and rejects arbitrary error properties', () => {
    const known = Object.assign(new Error('private prompt'), {
      name: 'ProviderConnectorError',
      code: 'RATE_LIMITED',
      cause: { accessToken: 'private' },
    });
    const unknown = Object.assign(new Error('private prompt'), {
      name: 'Custom-person@example.invalid',
      code: 'USER_00000000_SECRET',
    });

    expect(classifyError(known)).toEqual({
      classification: 'ProviderError',
      code: 'RATE_LIMITED',
    });
    expect(classifyError(unknown)).toEqual({ classification: 'UnknownError' });
  });

  it('classifies malformed thrown proxies without invoking unsafe serialization', () => {
    const malformed = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('private@example.invalid');
        },
        get() {
          throw new Error('Bearer private-token');
        },
      },
    );

    expect(() => classifyError(malformed)).not.toThrow();
    expect(classifyError(malformed)).toEqual({ classification: 'UnknownError' });
  });

  it('validates request and correlation IDs', () => {
    expect(sanitizeCorrelationId('req_abc-123:child')).toBe('req_abc-123:child');
    expect(sanitizeCorrelationId('person@example.invalid')).toBeUndefined();
    expect(sanitizeCorrelationId('Bearer secret')).toBeUndefined();
    expect(sanitizeCorrelationId('x'.repeat(129))).toBeUndefined();
  });

  it('matches forbidden key spellings case- and separator-insensitively', () => {
    for (const key of [
      'ACCESS-TOKEN',
      'user_id_hash',
      'Context_Packet',
      'manual-notes',
      'providerPayload',
      'HRV_ms',
      'heart-rate-bpm',
    ]) {
      expect(isForbiddenRuntimeKey(key)).toBe(true);
    }
    expect(isForbiddenRuntimeKey('durationMs')).toBe(false);
    expect(isForbiddenRuntimeKey('promptTokens')).toBe(false);
  });

  it('writes one deterministic JSON line through an injected writer', () => {
    const lines: string[] = [];
    const { logger } = capture();
    const sink = createJsonLineSink((line) => lines.push(line));
    const entrySink = vi.spyOn(lines, 'push');
    sink({
      timestamp: NOW.toISOString(),
      level: 'info',
      service: 'primis-ai',
      environment: 'test',
      event: 'ai.gateway.completed',
      metadata: {},
    });
    logger.emit('ai.gateway.completed', {
      provider: 'mock',
      model: 'mock-model',
      taskType: 'chat_health_query',
      modelTier: 'standard',
      status: 'completed',
      latencyMs: 1,
    });

    expect(entrySink).toHaveBeenCalledOnce();
    expect(lines[0]).toBe(
      JSON.stringify({
        timestamp: NOW.toISOString(),
        level: 'info',
        service: 'primis-ai',
        environment: 'test',
        event: 'ai.gateway.completed',
        metadata: {},
      }),
    );
  });
});

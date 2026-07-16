import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  LatestAiSummaryResponse,
} from '@primis/api-contracts';

import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type { AiSummary, Database } from '../../src/db/types.js';
import { getLatestAiSummaryFromDb } from '../../src/repositories/aiSummaryRepository.js';
import {
  createAiSummariesRouter,
  type AiSummariesRouteDeps,
} from '../../src/routes/aiSummaries.js';
import type { Kysely } from 'kysely';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-summary-user',
  email: 'summary@example.invalid',
};

function row(overrides: Partial<AiSummary> = {}): AiSummary {
  return {
    id: 'summary-1',
    user_id: USER_ID,
    summary_type: 'sleep',
    local_date: '2026-07-15',
    summary_status: 'stale',
    title: 'Saved sleep context',
    short_summary: 'A saved summary remains available.',
    structured_json: {},
    evidence_refs: [
      {
        id: 'ev-1',
        statement: 'Sleep duration was available.',
        domain: 'sleep',
        confidence: 'medium',
      },
    ],
    context_packet_version: '1.0',
    source_score_snapshot_id: null,
    generated_at: new Date('2026-07-15T08:00:00.000Z'),
    expires_at: null,
    model_provider: 'mock',
    model_name: 'mock-model',
    created_at: new Date('2026-07-15T08:00:00.000Z'),
    updated_at: new Date('2026-07-15T08:00:00.000Z'),
    deleted_at: null,
    ...overrides,
  } as AiSummary;
}

function app(
  deps: AiSummariesRouteDeps,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const instance = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  instance.use('*', async (c, next) => {
    c.set('user', USER);
    c.set('requestId', 'summary-request');
    await next();
  });
  instance.route('/', createAiSummariesRouter(deps));
  return instance;
}

describe('GET /summaries/latest', () => {
  it('reads only for the authenticated owner and maps a servable cached row', async () => {
    const getLatest = vi.fn().mockResolvedValue(row());
    const response = await app({ getLatest }).request('/summaries/latest?type=sleep');
    const body = (await response.json()) as ApiSuccessResponse<LatestAiSummaryResponse>;

    expect(response.status).toBe(200);
    expect(getLatest).toHaveBeenCalledWith(USER_ID, 'sleep');
    expect(body.data).toMatchObject({ state: 'available', summary: { status: 'stale' } });
  });

  it('returns an explicit empty state without inventing a summary', async () => {
    const response = await app({ getLatest: vi.fn().mockResolvedValue(undefined) }).request(
      '/summaries/latest?type=recovery',
    );
    const body = (await response.json()) as ApiSuccessResponse<LatestAiSummaryResponse>;
    expect(body.data).toEqual({ state: 'empty', summary: null });
  });

  it('rejects unsupported summary types before repository access', async () => {
    const getLatest = vi.fn();
    const response = await app({ getLatest }).request('/summaries/latest?type=activity');
    const body = (await response.json()) as ApiErrorResponse;
    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(getLatest).not.toHaveBeenCalled();
  });
});

describe('getLatestAiSummaryFromDb', () => {
  it('filters ownership, type, soft deletion, and non-servable statuses', async () => {
    const executeTakeFirst = vi.fn().mockResolvedValue(row());
    const builder = {
      selectAll: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      executeTakeFirst,
    };
    builder.selectAll.mockReturnValue(builder);
    builder.where.mockReturnValue(builder);
    builder.orderBy.mockReturnValue(builder);
    builder.limit.mockReturnValue(builder);
    const database = {
      selectFrom: vi.fn().mockReturnValue(builder),
    } as unknown as Kysely<Database>;

    await getLatestAiSummaryFromDb(database, USER_ID, 'sleep');

    expect(database.selectFrom).toHaveBeenCalledWith('ai_summaries');
    expect(builder.where.mock.calls).toEqual([
      ['user_id', '=', USER_ID],
      ['summary_type', '=', 'sleep'],
      ['deleted_at', 'is', null],
      ['summary_status', 'in', ['fresh', 'stale']],
    ]);
    expect(builder.orderBy.mock.calls).toEqual([
      ['local_date', 'desc'],
      ['generated_at', 'desc'],
    ]);
    expect(builder.limit).toHaveBeenCalledWith(1);
  });
});

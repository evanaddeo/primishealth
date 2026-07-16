/**
 * Unit + integration tests for the AI Coach chat route (CU-082).
 *
 * Route under test (via createAiChatRouter with injected deps):
 *   POST /chat — classify → build context → gateway → answer (+ optional SSE stream)
 *
 * Coverage:
 *   - 200 with a schema-valid AiChatResponseDto through the mock gateway.
 *   - Creates a new conversation when none is supplied; reuses an owned one.
 *   - 404 for an unknown conversation; 403 for one owned by another user.
 *   - 400 for a malformed body (bad JSON / empty message).
 *   - Persists metadata safely: user + assistant messages, a model-safe context
 *     snapshot, and a redacted invocation record with HASHES (never raw prompt text).
 *   - Unsupported medical (diagnosis) → safe handling; emergency → canned safe response
 *     with no model-invocation record.
 *   - Streaming returns text/event-stream with start/token/metadata events.
 *   - 401 without an Authorization header (via createApp()).
 *
 * All AI calls use the keyless MockAiProvider and all DB calls are mocked — no live
 * model calls, no real database, no network I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Hoisted mocks (for the createApp() integration test only)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  loadBackendEnv: vi.fn(),
}));

vi.mock('@primis/config', async () => {
  const actual = await vi.importActual<typeof import('@primis/config')>('@primis/config');
  return {
    ...actual,
    loadBackendEnv: mocks.loadBackendEnv,
    loadPublicEnv: vi.fn().mockReturnValue({
      NODE_ENV: 'development',
      APP_ENV: 'local',
      EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
      EXPO_PUBLIC_MOCK_MODE: 'true',
    }),
  };
});

vi.mock('../../src/auth/cognitoJwtVerifier.js', () => ({
  verifyCognitoToken: vi.fn(),
}));

vi.mock('../../src/repositories/userRepository.js', () => ({
  findUserById: vi.fn(),
  findByCognitoSub: vi.fn(),
  createUser: vi.fn(),
  updateUserStatus: vi.fn(),
  softDeleteUser: vi.fn(),
}));

// The dashboard route (imported via createApp) does a default latest-date db read.
vi.mock('../../src/db/client.js', () => ({
  db: {
    selectFrom: vi.fn(() => ({
      select: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({ executeTakeFirst: vi.fn().mockResolvedValue(undefined) })),
          })),
        })),
      })),
    })),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { createAiChatRouter, type AiChatRouteDeps } from '../../src/routes/aiChat.js';
import { createApp } from '../../src/app.js';
import {
  AiChatResponseDtoSchema,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type AiChatResponseDto,
} from '@primis/api-contracts';
import { AiGateway, AiRequestController, BaseContextPacketAssembler } from '@primis/ai';
import type { StructuredLogEntry } from '@primis/config';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import { createApiLogger } from '../../src/observability/logger.js';
import type {
  AiConversation,
  AiContextSnapshot,
  AiMessage,
  AiModelInvocation,
} from '../../src/db/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const OTHER_USER_ID = '00000000-0000-0000-0000-0000000000bb';
const CONVERSATION_ID = '00000000-0000-0000-0000-0000000000c0';

const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-sub-aa',
  email: 'user@example.invalid',
};

function makeConversation(overrides: Partial<AiConversation> = {}): AiConversation {
  return {
    id: CONVERSATION_ID,
    user_id: USER_ID,
    conversation_type: 'chat',
    title: null,
    status: 'active',
    created_at: new Date('2026-07-01T00:00:00Z'),
    updated_at: new Date('2026-07-01T00:00:00Z'),
    deleted_at: null,
    metadata: {},
    ...overrides,
  } as AiConversation;
}

function makeMessage(): AiMessage {
  return { id: 'msg-1' } as AiMessage;
}

function makeController(): AiRequestController {
  return new AiRequestController({
    gateway: AiGateway.fromEnv({}),
    contextSource: new BaseContextPacketAssembler({ now: () => new Date('2026-07-01T12:00:00Z') }),
    now: () => new Date('2026-07-01T12:00:00Z'),
  });
}

function makeDeps(overrides: Partial<AiChatRouteDeps> = {}): AiChatRouteDeps {
  return {
    controller: makeController(),
    createConversation: vi.fn().mockResolvedValue(makeConversation()),
    getConversation: vi.fn().mockResolvedValue(makeConversation()),
    addMessage: vi.fn().mockResolvedValue(makeMessage()),
    createContextSnapshot: vi.fn().mockResolvedValue({ id: 'snap-1' } as AiContextSnapshot),
    recordModelInvocation: vi.fn().mockResolvedValue({ id: 'inv-1' } as AiModelInvocation),
    environment: 'dev',
    ...overrides,
  };
}

function buildApp(
  deps: AiChatRouteDeps,
  authUser: AuthenticatedUser = MOCK_AUTH_USER,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('user', authUser);
    c.set('requestId', 'test-req-id');
    await next();
  });
  app.route('/', createAiChatRouter(deps));
  return app;
}

async function postChat(
  app: ReturnType<typeof buildApp>,
  body: unknown,
  rawBody?: string,
): Promise<Response> {
  return app.request('/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody ?? JSON.stringify(body),
  });
}

async function getJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /ai/chat — happy path', () => {
  it('emits a bounded chat event without message, user, or context content', async () => {
    const entries: StructuredLogEntry[] = [];
    const logger = createApiLogger({
      environment: 'test',
      sink: (entry) => entries.push(entry),
      now: () => new Date('2026-07-15T12:00:00.000Z'),
    });
    const deps = makeDeps({ logger });

    await postChat(buildApp(deps), {
      message: 'My HRV was 42. What affected my sleep?',
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      event: 'ai.chat.completed',
      requestId: 'test-req-id',
      metadata: {
        streamed: false,
        canned: false,
        provider: 'mock',
        model: 'mock-model',
      },
    });
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain('HRV');
    expect(serialized).not.toContain('affected my sleep');
    expect(serialized).not.toContain('contextPacket');
  });

  it('returns 200 with a schema-valid AiChatResponseDto', async () => {
    const res = await postChat(buildApp(makeDeps()), { message: 'How is my recovery today?' });
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<AiChatResponseDto>>(res);
    expect(body.success).toBe(true);
    expect(() => AiChatResponseDtoSchema.parse(body.data)).not.toThrow();
    expect(body.data.model.provider).toBe('mock');
    expect(body.data.conversationId).toBe(CONVERSATION_ID);
  });

  it('creates a new conversation when none is supplied', async () => {
    const deps = makeDeps();
    await postChat(buildApp(deps), { message: 'How did I sleep?' });
    expect(deps.createConversation).toHaveBeenCalledWith(USER_ID, 'chat');
    expect(deps.getConversation).not.toHaveBeenCalled();
  });

  it('reuses an existing conversation owned by the caller', async () => {
    const deps = makeDeps();
    await postChat(buildApp(deps), {
      message: 'How did I sleep?',
      conversationId: CONVERSATION_ID,
    });
    expect(deps.getConversation).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(deps.createConversation).not.toHaveBeenCalled();
  });

  it('persists user + assistant messages, a context snapshot, and a hashed invocation', async () => {
    const deps = makeDeps();
    await postChat(buildApp(deps), { message: 'How is my recovery today?' });

    expect(deps.addMessage).toHaveBeenCalledTimes(2);
    expect(deps.addMessage).toHaveBeenNthCalledWith(
      1,
      CONVERSATION_ID,
      USER_ID,
      'user',
      'How is my recovery today?',
    );

    const snapshotArg = (deps.createContextSnapshot as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(snapshotArg.user_id).toBe(USER_ID);
    expect(snapshotArg.context_json).toBeDefined();
    // Model-safe packet — no raw provider payload key.
    expect(JSON.stringify(snapshotArg.context_json)).not.toContain('rawSeries');

    const invocationArg = (deps.recordModelInvocation as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(invocationArg.request_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(invocationArg.response_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(invocationArg.status).toBe('succeeded');
  });
});

describe('POST /ai/chat — conversation authorization', () => {
  it('returns 404 when the conversation does not exist', async () => {
    const deps = makeDeps({ getConversation: vi.fn().mockResolvedValue(undefined) });
    const res = await postChat(buildApp(deps), { message: 'hi', conversationId: CONVERSATION_ID });
    expect(res.status).toBe(404);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 for a conversation owned by another user', async () => {
    const deps = makeDeps({
      getConversation: vi.fn().mockResolvedValue(makeConversation({ user_id: OTHER_USER_ID })),
    });
    const res = await postChat(buildApp(deps), { message: 'hi', conversationId: CONVERSATION_ID });
    expect(res.status).toBe(403);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.code).toBe('FORBIDDEN');
    // The other user's conversation is never touched by the AI pipeline.
    expect(deps.addMessage).not.toHaveBeenCalled();
  });
});

describe('POST /ai/chat — validation', () => {
  it('returns 400 for an empty message', async () => {
    const res = await postChat(buildApp(makeDeps()), { message: '' });
    expect(res.status).toBe(400);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a non-JSON body', async () => {
    const res = await postChat(buildApp(makeDeps()), undefined, 'not json');
    expect(res.status).toBe(400);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /ai/chat — safety', () => {
  it('handles an unsupported medical (diagnosis) request safely', async () => {
    const res = await postChat(buildApp(makeDeps()), {
      message: 'Can you diagnose me from my HRV?',
    });
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<AiChatResponseDto>>(res);
    expect(body.data.intent).toBe('unsupported_medical_request');
    expect(body.data.safetyFlags).toContain('unsupported_request_refused');
    expect(body.data.caveats.join(' ')).toMatch(/not medical advice/i);
  });

  it('routes an emergency to a canned safe response with no invocation record', async () => {
    const deps = makeDeps();
    const res = await postChat(buildApp(deps), {
      message: 'I think I am having a seizure right now',
    });
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<AiChatResponseDto>>(res);
    expect(body.data.responseType).toBe('safe_response');
    expect(body.data.safetyFlags).toContain('emergency_redirected');
    // No model was called → no context snapshot and no invocation recorded.
    expect(deps.createContextSnapshot).not.toHaveBeenCalled();
    expect(deps.recordModelInvocation).not.toHaveBeenCalled();
  });
});

describe('POST /ai/chat — streaming (SSE)', () => {
  it('returns an event stream with start, token, and metadata events', async () => {
    const deps = makeDeps();
    const res = await postChat(buildApp(deps), {
      message: 'How did I sleep last night?',
      stream: true,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const raw = await res.text();
    expect(raw).toContain('event: start');
    expect(raw).toContain('event: token');
    expect(raw).toContain('event: metadata');
    expect(raw).toContain('"type":"start"');

    // Persistence still runs after the stream completes.
    expect(deps.addMessage).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Integration: full createApp() with auth middleware
// ---------------------------------------------------------------------------

describe('POST /api/v1/ai/chat — integration via createApp()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an Authorization header', async () => {
    mocks.loadBackendEnv.mockReturnValue({
      ALLOW_MOCK_AUTH: true,
      APP_ENV: 'local',
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://primis:primis@localhost:5432/primis_dev',
      DATABASE_SSL: false,
      COGNITO_USER_POOL_ID: 'PLACEHOLDER',
      COGNITO_CLIENT_ID: 'PLACEHOLDER',
      COGNITO_REGION: 'us-east-1',
      GOOGLE_HEALTH_CLIENT_ID: 'PLACEHOLDER',
      GOOGLE_HEALTH_CLIENT_SECRET: 'PLACEHOLDER',
      OPENAI_API_KEY: 'PLACEHOLDER',
      ANTHROPIC_API_KEY: 'PLACEHOLDER',
      AWS_REGION: 'us-east-1',
      EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
      EXPO_PUBLIC_MOCK_MODE: 'true',
    });

    const app = createApp();
    const res = await app.request('/api/v1/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    expect(res.status).toBe(401);
  });
});

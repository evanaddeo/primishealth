/**
 * Unit tests for the custom tag routes (CU-073).
 *
 * Routes under test (via createTagRouter with injected deps):
 *   POST /tags
 *   GET  /tags
 *   POST /tags/events
 *   GET  /tags/events?from=&to=
 *
 * Coverage:
 *   - 200 with a schema-valid tag DTO on create; tag_code normalized server-side.
 *   - Duplicate display name → idempotent upsert (200, same tag_code), not a 409.
 *   - GET /tags lists the user's active tags scoped to the authenticated user.
 *   - 201 logging a tag event with AND without a linked entity.
 *   - A tag event auto-links to a matching tag definition (custom_tag_id set);
 *     logging is not blocked when no definition matches.
 *   - GET /tags/events lists by inclusive local-date range, scoped to the user.
 *   - 400 on invalid JSON, empty display name, bad enum, half-supplied link, bad date.
 *   - Ownership: every repo call is filtered by the authenticated user id.
 *   - Auth-required: createApp() rejects an unauthenticated request with 401.
 *   - Raw `notes` (S2) is never written to stdout/stderr.
 *
 * All DB calls are injected — no real database connections.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('@primis/config', async () => {
  const actual = await vi.importActual<typeof import('@primis/config')>('@primis/config');
  return {
    ...actual,
    loadBackendEnv: vi.fn().mockReturnValue({
      ALLOW_MOCK_AUTH: false,
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
    }),
  };
});

import {
  CustomTagDtoSchema,
  TagEventDtoSchema,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type CustomTagDto,
  type TagEventDto,
  type TagListResponseDto,
  type TagEventListResponseDto,
} from '@primis/api-contracts';

import { createTagRouter, type TagRouteDeps } from '../../src/routes/tags.js';
import { createApp } from '../../src/app.js';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type { CustomTag, TagEvent } from '../../src/db/types.js';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-sub-aa',
  email: 'user@example.invalid',
};

function tagRow(overrides: Partial<CustomTag> = {}): CustomTag {
  return {
    id: 'tag-1',
    user_id: USER_ID,
    tag_code: 'late_caffeine',
    display_name: 'Late caffeine',
    category: 'lifestyle',
    is_system_suggested: false,
    is_active: true,
    metadata: {},
    created_at: new Date('2026-06-26T13:45:01Z'),
    updated_at: new Date('2026-06-26T13:45:01Z'),
    ...overrides,
  } as CustomTag;
}

function eventRow(overrides: Partial<TagEvent> = {}): TagEvent {
  return {
    id: 'event-1',
    user_id: USER_ID,
    custom_tag_id: 'tag-1',
    tag_code: 'late_caffeine',
    occurred_at_utc: new Date('2026-06-26T21:30:00Z'),
    local_date: '2026-06-26',
    timezone: 'America/New_York',
    intensity: 3,
    quantity: '1',
    unit: 'cup',
    notes: null,
    linked_entity_type: null,
    linked_entity_id: null,
    metadata: {},
    created_at: new Date('2026-06-26T21:30:01Z'),
    ...overrides,
  } as TagEvent;
}

function makeDeps(overrides: Partial<TagRouteDeps> = {}): TagRouteDeps {
  return {
    upsertCustomTag: vi.fn().mockImplementation(async (data) => tagRow(data)),
    getCustomTags: vi.fn().mockResolvedValue([]),
    getCustomTagByCode: vi.fn().mockResolvedValue(undefined),
    createTagEvent: vi.fn().mockImplementation(async (data) => eventRow(data)),
    getTagEvents: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function buildApp(
  deps: TagRouteDeps,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('user', MOCK_AUTH_USER);
    c.set('requestId', 'test-req-id');
    await next();
  });
  app.route('/tags', createTagRouter(deps));
  return app;
}

async function getJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function postJson(
  app: ReturnType<typeof buildApp>,
  path: string,
  body: unknown,
): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const EVENT_ANCHORS = {
  occurredAtUtc: '2026-06-26T21:30:00Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
} as const;

describe('POST /tags', () => {
  it('creates a tag and returns 200 with a schema-valid DTO; tag_code normalized', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/tags', {
      displayName: 'Late Caffeine',
      category: 'lifestyle',
    });
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<CustomTagDto>>(res);
    expect(CustomTagDtoSchema.safeParse(body.data).success).toBe(true);
    const insertArg = (deps.upsertCustomTag as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertArg.user_id).toBe(USER_ID);
    expect(insertArg.tag_code).toBe('late_caffeine');
    expect(insertArg.display_name).toBe('Late Caffeine');
  });

  it('treats a duplicate display name as an idempotent upsert (200, same tag_code)', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);
    const first = await postJson(app, '/tags', { displayName: 'Travel day' });
    const second = await postJson(app, '/tags', { displayName: 'travel day' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const calls = (deps.upsertCustomTag as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]?.[0].tag_code).toBe('travel_day');
    expect(calls[1]?.[0].tag_code).toBe('travel_day');
  });

  it('returns 400 for an empty display name and does not write', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/tags', { displayName: '   ' });
    expect(res.status).toBe(400);
    expect(deps.upsertCustomTag).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown category', async () => {
    const res = await postJson(buildApp(makeDeps()), '/tags', {
      displayName: 'Snack',
      category: 'dessert',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await buildApp(makeDeps()).request('/tags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /tags', () => {
  it("lists the user's active tags scoped to the user", async () => {
    const deps = makeDeps({ getCustomTags: vi.fn().mockResolvedValue([tagRow()]) });
    const res = await buildApp(deps).request('/tags');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<TagListResponseDto>>(res);
    expect(body.data.tags).toHaveLength(1);
    expect(deps.getCustomTags).toHaveBeenCalledWith(USER_ID);
  });
});

describe('POST /tags/events', () => {
  it('logs an event and auto-links to a matching tag definition', async () => {
    const deps = makeDeps({
      getCustomTagByCode: vi.fn().mockResolvedValue(tagRow({ id: 'tag-77' })),
    });
    const res = await postJson(buildApp(deps), '/tags/events', {
      ...EVENT_ANCHORS,
      tagCode: 'late_caffeine',
      intensity: 3,
      quantity: 1,
      unit: 'cup',
    });
    expect(res.status).toBe(201);
    const body = await getJson<ApiSuccessResponse<TagEventDto>>(res);
    expect(TagEventDtoSchema.safeParse(body.data).success).toBe(true);
    const insertArg = (deps.createTagEvent as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertArg.user_id).toBe(USER_ID);
    expect(insertArg.custom_tag_id).toBe('tag-77');
    expect(insertArg.quantity).toBe('1');
    expect(deps.getCustomTagByCode).toHaveBeenCalledWith(USER_ID, 'late_caffeine');
  });

  it('logs an event with no matching definition (custom_tag_id null)', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/tags/events', {
      ...EVENT_ANCHORS,
      tagCode: 'unknown_tag',
    });
    expect(res.status).toBe(201);
    const insertArg = (deps.createTagEvent as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertArg.custom_tag_id).toBeNull();
  });

  it('logs an event linked to an entity', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/tags/events', {
      ...EVENT_ANCHORS,
      tagCode: 'late_caffeine',
      linkedEntityType: 'manual_checkin',
      linkedEntityId: '00000000-0000-0000-0000-0000000000c1',
    });
    expect(res.status).toBe(201);
    const insertArg = (deps.createTagEvent as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertArg.linked_entity_type).toBe('manual_checkin');
    expect(insertArg.linked_entity_id).toBe('00000000-0000-0000-0000-0000000000c1');
  });

  it('returns 400 when a link is only half-supplied and does not write', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/tags/events', {
      ...EVENT_ANCHORS,
      tagCode: 'late_caffeine',
      linkedEntityType: 'manual_checkin',
    });
    expect(res.status).toBe(400);
    expect(deps.createTagEvent).not.toHaveBeenCalled();
  });

  it('returns 400 for an intensity out of range', async () => {
    const res = await postJson(buildApp(makeDeps()), '/tags/events', {
      ...EVENT_ANCHORS,
      tagCode: 'late_caffeine',
      intensity: 6,
    });
    expect(res.status).toBe(400);
  });

  it('does not write raw notes (S2) to stdout/stderr', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const secret = 'private detail that must never be logged';
    await postJson(buildApp(makeDeps()), '/tags/events', {
      ...EVENT_ANCHORS,
      tagCode: 'late_caffeine',
      notes: secret,
    });
    for (const spy of [logSpy, errSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secret);
      }
    }
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe('GET /tags/events', () => {
  it("lists the range's events scoped to the user", async () => {
    const deps = makeDeps({ getTagEvents: vi.fn().mockResolvedValue([eventRow()]) });
    const res = await buildApp(deps).request('/tags/events?from=2026-06-20&to=2026-06-26');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<TagEventListResponseDto>>(res);
    expect(body.data.events).toHaveLength(1);
    expect(deps.getTagEvents).toHaveBeenCalledWith(USER_ID, {
      from: '2026-06-20',
      to: '2026-06-26',
    });
  });

  it('returns 400 for a malformed date', async () => {
    const res = await buildApp(makeDeps()).request('/tags/events?from=2026/06/26');
    expect(res.status).toBe(400);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.field).toBe('from');
  });
});

describe('tags auth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 for an unauthenticated request (via createApp)', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/tags');
    expect(res.status).toBe(401);
  });
});

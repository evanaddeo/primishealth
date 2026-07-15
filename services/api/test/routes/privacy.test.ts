import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

const configMocks = vi.hoisted(() => ({
  loadBackendEnv: vi.fn(),
}));

vi.mock('@primis/config', async () => {
  const actual = await vi.importActual<typeof import('@primis/config')>('@primis/config');
  return { ...actual, loadBackendEnv: configMocks.loadBackendEnv };
});

vi.mock('../../src/auth/cognitoJwtVerifier.js', () => ({
  verifyCognitoToken: vi.fn(),
}));

vi.mock('../../src/repositories/userRepository.js', () => ({
  findByCognitoSub: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  updateUserStatus: vi.fn(),
  softDeleteUser: vi.fn(),
}));

import {
  DELETION_CATEGORY_VALUES,
  DeletionDryRunResponseSchema,
  type ApiErrorResponse,
  type ApiSuccessResponse,
  type DeletionDryRunResponse,
} from '@primis/api-contracts';
import { createApp } from '../../src/app.js';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import {
  createPrivacyRouter,
  isDeletionDryRunRouteAvailable,
  type PrivacyRouteDependencies,
} from '../../src/routes/privacy.js';

const USER_ID = '00000000-0000-0000-0000-000000000087';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000088';
const IDEMPOTENCY_KEY = 'cu-087-api-dry-run-0001';

const AUTH_USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-sub-087',
  email: 'privacy-test@example.invalid',
};

function backendEnv() {
  return {
    ALLOW_MOCK_AUTH: true,
    APP_ENV: 'local' as const,
    NODE_ENV: 'test' as const,
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
  };
}

function dryRunResponse(reference = `ddr_${'a'.repeat(32)}`): DeletionDryRunResponse {
  const categories = DELETION_CATEGORY_VALUES.map((category) => ({
    category,
    targetCount: category === 'identity_account' ? 2 : 1,
    relationalRecordCount: null,
    archiveObjectCount: category === 'raw_archive' ? 2 : 0,
    archivePrefixCount: category === 'raw_archive' ? 1 : 0,
  }));
  return DeletionDryRunResponseSchema.parse({
    mode: 'dry_run',
    status: 'not_scheduled',
    inventorySource: 'mock',
    dryRunReference: reference,
    productionExecutionEnabled: false,
    categories,
    totals: {
      targetCount: categories.reduce((sum, category) => sum + category.targetCount, 0),
      relationalRecordCount: null,
      archiveObjectCount: 2,
      archivePrefixCount: 1,
    },
  });
}

function routeDependencies(
  overrides: Partial<PrivacyRouteDependencies> = {},
): PrivacyRouteDependencies {
  return {
    appEnv: 'local',
    allowMockAuth: true,
    buildDryRun: vi.fn().mockResolvedValue(dryRunResponse()),
    ...overrides,
  };
}

function isolatedApp(
  dependencies: PrivacyRouteDependencies,
  authUser: AuthenticatedUser = AUTH_USER,
) {
  const app = new Hono<{
    Variables: { user: AuthenticatedUser; requestId: string };
  }>();
  app.use('*', async (c, next) => {
    c.set('user', authUser);
    c.set('requestId', 'privacy-request-id');
    await next();
  });
  app.route('/data', createPrivacyRouter(dependencies));
  app.onError(errorHandler);
  return app;
}

function requestInit(body: unknown = { mode: 'dry_run' }): RequestInit {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': IDEMPOTENCY_KEY,
    },
    body: JSON.stringify(body),
  };
}

describe('POST /api/v1/data/delete-all authentication and scoping', () => {
  it('requires authentication through the application middleware', async () => {
    configMocks.loadBackendEnv.mockReturnValue(backendEnv());
    const response = await createApp().request('/api/v1/data/delete-all', requestInit());
    const body = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('uses only authenticated identity and rejects a caller-supplied user ID', async () => {
    const dependencies = routeDependencies();
    const app = isolatedApp(dependencies);

    const accepted = await app.request('/data/delete-all', requestInit());
    expect(accepted.status).toBe(200);
    expect(dependencies.buildDryRun).toHaveBeenCalledWith({
      userId: USER_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    vi.mocked(dependencies.buildDryRun).mockClear();
    const rejected = await app.request(
      '/data/delete-all',
      requestInit({ mode: 'dry_run', userId: OTHER_USER_ID }),
    );
    expect(rejected.status).toBe(400);
    expect(dependencies.buildDryRun).not.toHaveBeenCalled();
  });
});

describe('deletion dry-run environment hard-disable', () => {
  it('is available only in local/dev with mock auth explicitly enabled', () => {
    expect(isDeletionDryRunRouteAvailable('local', true)).toBe(true);
    expect(isDeletionDryRunRouteAvailable('dev', true)).toBe(true);
    expect(isDeletionDryRunRouteAvailable('local', false)).toBe(false);
    expect(isDeletionDryRunRouteAvailable('dev', false)).toBe(false);
    expect(isDeletionDryRunRouteAvailable('staging', true)).toBe(false);
    expect(isDeletionDryRunRouteAvailable('prod', true)).toBe(false);
  });

  it.each(['staging', 'prod'] as const)('registers no route in %s', async (appEnv) => {
    const buildDryRun = vi.fn();
    const response = await isolatedApp(
      routeDependencies({ appEnv, allowMockAuth: true, buildDryRun }),
    ).request('/data/delete-all', requestInit());

    expect(response.status).toBe(404);
    expect(buildDryRun).not.toHaveBeenCalled();
  });
});

describe('deletion dry-run validation and safe response', () => {
  it('returns the safe aggregate contract and no raw identifiers, locators, or secrets', async () => {
    const response = await isolatedApp(routeDependencies()).request(
      '/data/delete-all',
      requestInit(),
    );
    const body = (await response.json()) as ApiSuccessResponse<DeletionDryRunResponse>;
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(DeletionDryRunResponseSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.status).toBe('not_scheduled');
    expect(body.data.productionExecutionEnabled).toBe(false);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain('cognito-sub');
    expect(serialized).not.toContain('s3Key');
    expect(serialized).not.toContain('provider=');
    expect(serialized).not.toContain('PLACEHOLDER');
  });

  it('rejects missing/unsafe idempotency keys and any non-dry-run mode', async () => {
    const app = isolatedApp(routeDependencies());
    const missingKey = await app.request('/data/delete-all', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'dry_run' }),
    });
    const executeMode = await app.request('/data/delete-all', requestInit({ mode: 'execute' }));

    expect(missingKey.status).toBe(400);
    expect(executeMode.status).toBe(400);
  });

  it('fails safely without returning the raw planning error', async () => {
    const sensitiveMessage = `archive failed for provider=google_health/user_id=${USER_ID}`;
    const app = isolatedApp(
      routeDependencies({ buildDryRun: vi.fn().mockRejectedValue(new Error(sensitiveMessage)) }),
    );
    const response = await app.request('/data/delete-all', requestInit());
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain(sensitiveMessage);
    expect(text).not.toContain(USER_ID);
    expect(text).toContain('INTERNAL_ERROR');
  });
});

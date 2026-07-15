/**
 * Local/dev mock deletion-planning route (CU-087).
 *
 * Mounted at `/api/v1/data`; global auth middleware supplies identity. The route
 * is not registered unless mock auth is enabled in `local` or `dev`, and its
 * contract can express only a non-persistent dry run.
 */

import { Hono } from 'hono';

import {
  DeletionDryRunRequestSchema,
  DeletionDryRunResponseSchema,
  DeletionIdempotencyKeySchema,
  makeErrorResponse,
  makeSuccessResponse,
  type DeletionDryRunResponse,
} from '@primis/api-contracts';
import { loadBackendEnv, type BackendEnv } from '@primis/config';
import { buildMockDeletionDryRun } from '@primis/workers';

import type { AuthVariables } from '../auth/authMiddleware.js';

interface DeletionDryRunBuilderInput {
  readonly userId: string;
  readonly idempotencyKey: string;
}

export interface PrivacyRouteDependencies {
  readonly appEnv: BackendEnv['APP_ENV'];
  readonly allowMockAuth: boolean;
  readonly buildDryRun: (input: DeletionDryRunBuilderInput) => Promise<DeletionDryRunResponse>;
}

/** Production/staging cannot enable this route through any deletion feature flag. */
export function isDeletionDryRunRouteAvailable(
  appEnv: BackendEnv['APP_ENV'],
  allowMockAuth: boolean,
): boolean {
  return allowMockAuth && (appEnv === 'local' || appEnv === 'dev');
}

function defaultDependencies(): PrivacyRouteDependencies {
  const env = loadBackendEnv();
  return {
    appEnv: env.APP_ENV,
    allowMockAuth: env.ALLOW_MOCK_AUTH,
    buildDryRun: buildMockDeletionDryRun,
  };
}

export function createPrivacyRouter(
  dependencies: PrivacyRouteDependencies = defaultDependencies(),
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{ Variables: AuthVariables & { requestId: string } }>();

  // An empty router deliberately falls through to the standard 404 handler.
  if (!isDeletionDryRunRouteAvailable(dependencies.appEnv, dependencies.allowMockAuth)) {
    return router;
  }

  router.post('/delete-all', async (c) => {
    const requestId = c.get('requestId') as string | undefined;
    const idempotencyKey = c.req.header('idempotency-key');
    const parsedKey = DeletionIdempotencyKeySchema.safeParse(idempotencyKey);

    if (!parsedKey.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'A valid Idempotency-Key header is required.',
          undefined,
          'Idempotency-Key',
          requestId,
        ),
        400,
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Request body must be valid JSON.',
          undefined,
          'body',
          requestId,
        ),
        400,
      );
    }

    const parsedBody = DeletionDryRunRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Request body must specify dry-run mode only.',
          undefined,
          'mode',
          requestId,
        ),
        400,
      );
    }

    const result = await dependencies.buildDryRun({
      userId: c.var.user.internalUserId,
      idempotencyKey: parsedKey.data,
    });
    const safeResult = DeletionDryRunResponseSchema.parse(result);
    return c.json(makeSuccessResponse(safeResult, undefined, requestId), 200);
  });

  return router;
}

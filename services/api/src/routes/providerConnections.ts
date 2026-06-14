/**
 * Provider connection routes — Google Health OAuth skeleton (CU-037).
 *
 * Route layout (all require `authMiddleware`):
 *   GET /api/v1/provider-connections/google/authorize
 *       — Request a Google Health authorization URL for the authenticated user.
 *   GET /api/v1/provider-connections/google/callback
 *       — Handle the OAuth callback redirect from Google; exchange the code.
 *
 * App auth vs Google Health auth separation (TAD §9.2):
 *   These routes manage HEALTH DATA authorization only — NOT Primis app authentication.
 *   Primis app authentication (sign-in, session management) is handled by AWS Cognito.
 *   A user who is already authenticated via Cognito initiates a SEPARATE Google Health
 *   OAuth grant here to allow Primis to read their health data. The two flows use
 *   different scopes, different consent prompts, and different token storage.
 *   See `oauthTypes.ts` in services/workers for the full technical disambiguation.
 *
 * Security invariants:
 *   - Raw OAuth tokens are NEVER included in API responses.
 *   - `accessTokenRef` / `refreshTokenRef` from the connector are stored internally
 *     and not echoed to the caller.
 *   - CU-038 (provider token secret reference adapter) will complete durable token storage.
 *   - State nonce validation is performed inside the connector via `OAuthStateStore`.
 *
 * Testability:
 *   - The router is created via `createProviderConnectionsRouter(adapter?)`.
 *   - Tests inject a `GoogleAuthAdapter` mock; no real Google API calls are made.
 *   - The default export uses a placeholder adapter (no live credentials in CI/dev).
 */

import { Hono } from 'hono';

import {
  makeSuccessResponse,
  makeErrorResponse,
  type StartAuthorizationResponseDto,
  type ConnectionCreatedResponseDto,
  type ProviderConnectionDto,
  type ListConnectionsResponseDto,
  type ProviderCapabilitiesDto,
  type DisconnectConnectionResponseDto,
  PROVIDER_CAPABILITIES_FIXTURE,
} from '@primis/api-contracts';
import type { AuthVariables } from '../auth/authMiddleware.js';
import type { ProviderConnection } from '../db/types.js';
import {
  findConnectionsByUser,
  findConnectionByIdForUser,
  disconnectConnectionByUser,
} from '../repositories/providerRepository.js';

// ---------------------------------------------------------------------------
// GoogleAuthAdapter — minimal injectable interface for this route
// ---------------------------------------------------------------------------

/**
 * Minimal adapter interface for Google Health OAuth operations needed by these routes.
 *
 * Deliberately scoped to only the two methods the route handler calls. This keeps
 * the API service decoupled from the full `HealthProviderConnector` interface (which
 * also covers sync, refresh, and revoke — sync pipeline concerns, not API route concerns).
 *
 * `GoogleHealthConnector` in `services/workers` satisfies this interface structurally
 * (TypeScript structural typing) without requiring an explicit `implements` clause.
 *
 * The route is wired to a real `GoogleHealthConnector` at app startup (see `app.ts`).
 * In tests, a `FakeGoogleAuthAdapter` is injected via `createProviderConnectionsRouter(adapter)`.
 */
export interface GoogleAuthAdapter {
  /**
   * Begins the Google Health OAuth flow for a user.
   *
   * Returns the authorization URL to redirect the user to and the CSRF state nonce.
   *
   * @param userId          - Primis internal user UUID.
   * @param requestedScopes - OAuth scope strings to request (empty = use defaults).
   * @returns `{ authorizeUrl, state }`.
   * @throws On misconfiguration (e.g. placeholder config in production).
   */
  startAuthorization(
    userId: string,
    requestedScopes: string[],
  ): Promise<{ authorizeUrl: string; state: string }>;

  /**
   * Completes the Google Health OAuth flow by validating state and exchanging the code.
   *
   * Returns connection metadata. Raw token values are NEVER returned.
   *
   * @param userId  - Primis internal user UUID.
   * @param params  - `{ code, state, redirectUri }` from the callback redirect.
   * @returns Connection metadata with placeholder token refs (CU-038 will complete storage).
   * @throws With a provider error code on CSRF mismatch or exchange failure.
   */
  completeAuthorization(
    userId: string,
    params: { code: string; state: string; redirectUri: string },
  ): Promise<{
    accessTokenRef: string;
    refreshTokenRef: string;
    expiresAt: Date | null;
    scopesGranted: string[];
    externalAccountId: string;
  }>;
}

// ---------------------------------------------------------------------------
// PlaceholderGoogleAuthAdapter
// ---------------------------------------------------------------------------

/**
 * Default adapter used when no real `GoogleHealthConnector` is wired.
 *
 * Builds a structurally correct authorization URL from the placeholder config
 * (so the endpoint is reachable in CI without live credentials), but `completeAuthorization`
 * always throws `ProviderConnectorError` with `code: 'NOT_IMPLEMENTED'`.
 *
 * This adapter is used by `app.ts` until a real `GoogleHealthConnector` is wired
 * with real OAuth credentials in Phase Z.
 *
 * NOTE: The URL built by `buildPlaceholderAuthUrl` is NOT a real Google URL — it
 * is a placeholder for local testing of the endpoint shape.
 */
export class PlaceholderGoogleAuthAdapter implements GoogleAuthAdapter {
  async startAuthorization(
    userId: string,
    requestedScopes: string[],
  ): Promise<{ authorizeUrl: string; state: string }> {
    const state = `placeholder-state-${userId}-${Date.now()}`;
    const scopes =
      requestedScopes.length > 0
        ? requestedScopes
        : [
            'https://www.googleapis.com/auth/health.activity',
            'https://www.googleapis.com/auth/health.sleep',
            'https://www.googleapis.com/auth/health.heart_rate',
          ];

    // Build a placeholder Google-shaped URL. In Phase Z, this is replaced by the
    // real GoogleHealthConnector.startAuthorization() which calls GoogleOAuthClient.buildAuthUrl().
    // TODO(CU-038/phase-z): Wire real GoogleHealthConnector via app factory (see app.ts TODO).
    const params = new URLSearchParams({
      client_id: 'PLACEHOLDER',
      redirect_uri: 'http://localhost:3000/api/v1/provider-connections/google/callback',
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    const authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return { authorizeUrl, state };
  }

  async completeAuthorization(
    _userId: string,
    _params: { code: string; state: string; redirectUri: string },
  ): Promise<{
    accessTokenRef: string;
    refreshTokenRef: string;
    expiresAt: Date | null;
    scopesGranted: string[];
    externalAccountId: string;
  }> {
    // Real token exchange requires live Google OAuth credentials (Phase Z).
    // TODO(CU-038/phase-z): Replace with real GoogleHealthConnector.completeAuthorization().
    throw Object.assign(new Error('Real token exchange requires live credentials (Phase Z).'), {
      code: 'NOT_IMPLEMENTED',
    });
  }
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Creates the Hono provider connections router.
 *
 * @param adapter - Injectable Google auth adapter. Defaults to `PlaceholderGoogleAuthAdapter`
 *                  when not provided. Inject a `FakeGoogleAuthAdapter` in tests.
 */
export function createProviderConnectionsRouter(
  adapter: GoogleAuthAdapter = new PlaceholderGoogleAuthAdapter(),
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{
    Variables: AuthVariables & { requestId: string };
  }>();

  // ── GET /google/authorize ────────────────────────────────────────────────

  /**
   * Returns the Google Health OAuth authorization URL for the authenticated user.
   *
   * The mobile client should redirect the user to `authorizeUrl` to start the
   * Google Health consent flow. This is NOT a Google sign-in — it is a separate
   * data permissions grant (TAD §9.2).
   *
   * Query parameters (optional):
   *   - `scopes` — comma-separated list of scope strings to request (defaults to
   *                `DEFAULT_GOOGLE_HEALTH_SCOPES` from the connector).
   *
   * Response: 200 `{ data: StartAuthorizationResponseDto }`
   */
  router.get('/google/authorize', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    const scopesParam = c.req.query('scopes');
    const requestedScopes: string[] = scopesParam
      ? scopesParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    try {
      const result = await adapter.startAuthorization(internalUserId, requestedScopes);

      const responseDto: StartAuthorizationResponseDto = {
        authorizeUrl: result.authorizeUrl,
        state: result.state,
      };

      return c.json(makeSuccessResponse(responseDto, undefined, requestId), 200);
    } catch (err) {
      const code =
        err instanceof Error && 'code' in err && typeof (err as { code: unknown }).code === 'string'
          ? (err as { code: string }).code
          : 'UNKNOWN';

      return c.json(
        makeErrorResponse(
          'PROVIDER_ERROR',
          `Failed to start Google Health authorization: ${code}`,
          undefined,
          undefined,
          requestId,
        ),
        500,
      );
    }
  });

  // ── GET /google/callback ─────────────────────────────────────────────────

  /**
   * Handles the OAuth callback redirect from Google.
   *
   * Google redirects the user's browser to this endpoint after the consent screen
   * with `code` and `state` query parameters. The route validates the state nonce
   * (via the connector's `OAuthStateStore`), exchanges the code for tokens, and
   * returns connection metadata.
   *
   * Raw token values are NEVER returned. Token storage is handled by the connector
   * (placeholder in CU-037; real Secrets Manager ARNs in CU-038).
   *
   * Query parameters (required):
   *   - `code`  — Authorization code from Google.
   *   - `state` — CSRF nonce returned by Google; must match the stored nonce.
   *
   * Response: 200 `{ data: ConnectionCreatedResponseDto }`
   *           400 `VALIDATION_ERROR` — missing `code` or `state` query params.
   *           400 `PROVIDER_ERROR`   — state mismatch (CSRF protection).
   *           500 `PROVIDER_ERROR`   — token exchange failure.
   */
  router.get('/google/callback', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    const code = c.req.query('code');
    const state = c.req.query('state');

    if (!code || !state) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Missing required query parameters: `code` and `state` are required.',
          undefined,
          undefined,
          requestId,
        ),
        400,
      );
    }

    // The redirect URI must match exactly what was used in the authorization request.
    // In production this would be the API gateway URL; in local dev the localhost value.
    // TODO(phase-z): Read redirectUri from env config rather than reconstructing from request.
    const redirectUri = new URL(c.req.url).origin + '/api/v1/provider-connections/google/callback';

    try {
      const result = await adapter.completeAuthorization(internalUserId, {
        code,
        state,
        redirectUri,
      });

      // TODO(CU-038): Persist the connection to `provider_connections` via providerRepository.
      //   Currently the connector returns placeholder refs; CU-038 will complete the DB write.
      const placeholderConnectionId = '00000000-0000-0000-0000-000000000000';

      const responseDto: ConnectionCreatedResponseDto = {
        connectionId: placeholderConnectionId,
        providerCode: 'google_health',
        status: 'active',
        expiresAt: result.expiresAt !== null ? result.expiresAt.toISOString() : null,
        scopesGranted: result.scopesGranted,
        externalAccountId: result.externalAccountId,
      };

      return c.json(makeSuccessResponse(responseDto, undefined, requestId), 200);
    } catch (err) {
      const errorCode =
        err instanceof Error && 'code' in err && typeof (err as { code: unknown }).code === 'string'
          ? (err as { code: string }).code
          : 'UNKNOWN';

      // STATE_MISMATCH is a client-detectable error (bad state param) → 400.
      if (errorCode === 'STATE_MISMATCH') {
        return c.json(
          makeErrorResponse(
            'PROVIDER_ERROR',
            'OAuth state nonce mismatch — authorization session may have expired or been tampered with.',
            undefined,
            undefined,
            requestId,
          ),
          400,
        );
      }

      return c.json(
        makeErrorResponse(
          'PROVIDER_ERROR',
          `Google Health authorization failed: ${errorCode}`,
          undefined,
          undefined,
          requestId,
        ),
        500,
      );
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Default router export (uses PlaceholderGoogleAuthAdapter)
// ---------------------------------------------------------------------------

/**
 * Provider connections router using the default placeholder adapter.
 *
 * Registered in `app.ts` under `/api/v1/provider-connections`.
 * The adapter can be replaced with a real `GoogleHealthConnector` in Phase Z
 * by switching to `createProviderConnectionsRouter(realConnector)` in `app.ts`.
 *
 * TODO(phase-z): Wire real GoogleHealthConnector once OAuth credentials are available.
 */
export const providerConnectionsRouter = createProviderConnectionsRouter();

// ===========================================================================
// ME Providers router (CU-046)
// ===========================================================================

// ---------------------------------------------------------------------------
// GOOGLE_HEALTH static capabilities (Phase E scaffold)
// ---------------------------------------------------------------------------

/**
 * Map of provider code → static capability declaration.
 *
 * All `verified: false` in Phase E — capabilities are documentation-level only
 * (see `docs/decisions/google-health-api-metric-availability.md`).
 * Phase AA live validation will update verified status in source docs and code.
 *
 * TODO(Phase-AA): Replace static map with GoogleHealthConnector.listCapabilities()
 *   once provider capabilities are live-validated.
 */
const STATIC_CAPABILITIES: Record<string, ProviderCapabilitiesDto> = {
  google_health: PROVIDER_CAPABILITIES_FIXTURE,
};

// ---------------------------------------------------------------------------
// MeProvidersDeps — injectable interface for testability
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for the ME providers router.
 *
 * Tests inject mock implementations; production uses the real repository functions.
 */
export interface MeProvidersDeps {
  /** List all non-deleted connections for a user. */
  listConnections: (userId: string) => Promise<ProviderConnection[]>;
  /** Find a connection by ID, scoped to a user. Returns null if not found or not owned. */
  getConnectionForUser: (
    connectionId: string,
    userId: string,
  ) => Promise<ProviderConnection | null>;
  /** Soft-delete a connection, enforcing user ownership. Returns false if not found. */
  disconnectConnection: (connectionId: string, userId: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// toProviderConnectionDto — safe projection (strips token refs)
// ---------------------------------------------------------------------------

/**
 * Projects a DB `ProviderConnection` row to the public `ProviderConnectionDto`.
 *
 * SECURITY: Explicitly omits `access_token_secret_ref`, `refresh_token_secret_ref`,
 * `user_id`, and all internal fields that must not appear in API responses.
 */
function toProviderConnectionDto(conn: ProviderConnection): ProviderConnectionDto {
  return {
    id: conn.id,
    providerCode: conn.provider_code,
    status: conn.connection_status,
    displayName: conn.display_name,
    scopesGranted: conn.scopes_granted,
    lastSuccessfulSyncAt:
      conn.last_successful_sync_at !== null ? conn.last_successful_sync_at.toISOString() : null,
    createdAt: conn.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Creates the Hono ME providers router.
 *
 * Route layout (all require `authMiddleware` — applied globally on `/api/v1/*`):
 *   GET    /                          — list all active provider connections
 *   GET    /:connectionId/capabilities — static capabilities for the connection's provider
 *   DELETE /:connectionId             — disconnect (soft-delete) a provider connection
 *
 * @param deps - Injectable dependencies. Defaults to real repository functions.
 */
export function createMeProvidersRouter(
  deps: MeProvidersDeps = {
    listConnections: findConnectionsByUser,
    getConnectionForUser: findConnectionByIdForUser,
    disconnectConnection: disconnectConnectionByUser,
  },
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{
    Variables: AuthVariables & { requestId: string };
  }>();

  // ── GET / ────────────────────────────────────────────────────────────────

  /**
   * Returns all non-deleted provider connections for the authenticated user.
   *
   * Returns `{ connections: [] }` for a user with no connected providers.
   *
   * Response: 200 `{ data: ListConnectionsResponseDto }`
   */
  router.get('/', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    const rows = await deps.listConnections(internalUserId);

    const responseDto: ListConnectionsResponseDto = {
      connections: rows.map(toProviderConnectionDto),
    };

    return c.json(makeSuccessResponse(responseDto, undefined, requestId), 200);
  });

  // ── GET /:connectionId/capabilities ──────────────────────────────────────

  /**
   * Returns the static capability declaration for the provider type associated
   * with the given connection.
   *
   * No DB call is needed for the capability data itself (it is static per provider
   * code). The connection lookup validates that the connection exists and belongs
   * to the authenticated user.
   *
   * Route params (required):
   *   - `connectionId` — Primis internal connection UUID.
   *
   * Response: 200 `{ data: ProviderCapabilitiesDto }`
   *           404 `NOT_FOUND` — connection not found or not owned by this user.
   */
  router.get('/:connectionId/capabilities', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;
    const { connectionId } = c.req.param();

    const connection = await deps.getConnectionForUser(connectionId, internalUserId);

    if (!connection) {
      return c.json(
        makeErrorResponse(
          'NOT_FOUND',
          'Provider connection not found.',
          undefined,
          undefined,
          requestId,
        ),
        404,
      );
    }

    const capabilities = STATIC_CAPABILITIES[connection.provider_code];

    if (!capabilities) {
      // TODO(ADR): Create ADR if a provider code exists in DB without a capability map.
      return c.json(
        makeErrorResponse(
          'NOT_FOUND',
          `No capability data available for provider: ${connection.provider_code}`,
          undefined,
          undefined,
          requestId,
        ),
        404,
      );
    }

    return c.json(
      makeSuccessResponse(capabilities as ProviderCapabilitiesDto, undefined, requestId),
      200,
    );
  });

  // ── DELETE /:connectionId ─────────────────────────────────────────────────

  /**
   * Soft-deletes a provider connection (disconnect).
   *
   * Sets `connection_status: 'revoked'` and `deleted_at: now()` on the connection row.
   * User ownership is enforced server-side — the authenticated user's ID is used
   * in the WHERE clause; a mismatch returns 404, not 403, to avoid leaking existence.
   *
   * Phase Z: Token revocation at the provider is not performed here.
   * Phase J: Health data associated with the connection is not deleted here.
   *
   * Route params (required):
   *   - `connectionId` — Primis internal connection UUID.
   *
   * Response: 200 `{ data: DisconnectConnectionResponseDto }`
   *           404 `NOT_FOUND` — connection not found or not owned by this user.
   */
  router.delete('/:connectionId', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;
    const { connectionId } = c.req.param();

    const deleted = await deps.disconnectConnection(connectionId, internalUserId);

    if (!deleted) {
      return c.json(
        makeErrorResponse(
          'NOT_FOUND',
          'Provider connection not found.',
          undefined,
          undefined,
          requestId,
        ),
        404,
      );
    }

    const responseDto: DisconnectConnectionResponseDto = { success: true };
    return c.json(makeSuccessResponse(responseDto, undefined, requestId), 200);
  });

  return router;
}

/**
 * ME providers router using default (real) repository dependencies.
 *
 * Registered in `app.ts` under `/api/v1/me/providers`.
 */
export const meProvidersRouter = createMeProvidersRouter();

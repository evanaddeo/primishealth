/**
 * Unit tests for userRepository.
 *
 * All Kysely interactions are intercepted via a mock `db` object so no real
 * database connection is needed. Tests verify:
 *   - Query routing: the correct table name is targeted.
 *   - Return value propagation: repository functions surface what the DB returns.
 *   - Error handling: missing rows produce `undefined`, not thrown errors.
 *   - `updated_at` is set on mutations (D-A-008).
 *   - `softDeleteUser` sets both `status = 'deleted'` and `deleted_at`.
 *   - `auth_identities.provider` domain is app-level only (not google_health etc.).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Build mock builders via vi.hoisted so they are available when vi.mock runs.
// vi.hoisted callbacks execute before any imports are resolved, which means
// the returned values can be safely referenced inside vi.mock factories.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  /** Creates a chainable Kysely builder stub. All chain methods return `this`. */
  function makeMockBuilder() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};

    const chainMethods = [
      'where',
      'whereRef',
      'select',
      'selectAll',
      'returning',
      'returningAll',
      'values',
      'set',
      'onConflict',
      'doUpdateSet',
      'doNothing',
      'orderBy',
      'limit',
      'offset',
    ];

    for (const method of chainMethods) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }

    chain['executeTakeFirst'] = vi.fn().mockResolvedValue(undefined);
    chain['execute'] = vi.fn().mockResolvedValue([]);

    return chain;
  }

  const selectBuilder = makeMockBuilder();
  const insertBuilder = makeMockBuilder();
  const updateBuilder = makeMockBuilder();

  const mockDb = {
    selectFrom: vi.fn().mockReturnValue(selectBuilder),
    insertInto: vi.fn().mockReturnValue(insertBuilder),
    updateTable: vi.fn().mockReturnValue(updateBuilder),
  };

  return { selectBuilder, insertBuilder, updateBuilder, mockDb };
});

// Register the mock BEFORE any import that loads the module.
vi.mock('../../src/db/client.js', () => ({ db: mocks.mockDb }));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are registered.
// ---------------------------------------------------------------------------

import {
  findByCognitoSub,
  createUser,
  updateUserStatus,
  softDeleteUser,
  findUserById,
  findAuthIdentities,
  createAuthIdentity,
} from '../../src/repositories/userRepository.js';
import { db } from '../../src/db/client.js';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const mockUser = {
  id: '00000000-0000-0000-0000-000000000001',
  cognito_sub: 'us-east-1:mock-sub-001',
  email: 'test@example.invalid',
  email_verified: false,
  display_name: null,
  status: 'active',
  primary_timezone: 'America/New_York',
  date_of_birth: null,
  sex_at_birth: null,
  height_cm: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  deleted_at: null,
};

const mockAuthIdentity = {
  id: '00000000-0000-0000-0000-000000000002',
  user_id: mockUser.id,
  provider: 'google',
  provider_subject: 'google-sub-001',
  email: 'test@example.invalid',
  linked_at: new Date('2026-01-01T00:00:00Z'),
  last_used_at: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('userRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-attach chain returns after clearAllMocks resets mockReturnValue calls.
    const { selectBuilder, insertBuilder, updateBuilder, mockDb } = mocks;

    // Re-wire DB methods to return the same builder instances.
    mockDb.selectFrom.mockReturnValue(selectBuilder);
    mockDb.insertInto.mockReturnValue(insertBuilder);
    mockDb.updateTable.mockReturnValue(updateBuilder);

    // Re-wire chain methods to return `this`.
    for (const builder of [selectBuilder, insertBuilder, updateBuilder]) {
      const chainMethods = [
        'where',
        'whereRef',
        'select',
        'selectAll',
        'returning',
        'returningAll',
        'values',
        'set',
        'onConflict',
        'doUpdateSet',
        'doNothing',
        'orderBy',
        'limit',
        'offset',
      ];
      for (const m of chainMethods) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        builder[m].mockReturnValue(builder);
      }
    }

    // Default terminal return values.
    selectBuilder['executeTakeFirst'].mockResolvedValue(undefined);
    selectBuilder['execute'].mockResolvedValue([]);
    insertBuilder['executeTakeFirst'].mockResolvedValue(undefined);
    insertBuilder['execute'].mockResolvedValue([]);
    updateBuilder['executeTakeFirst'].mockResolvedValue(undefined);
    updateBuilder['execute'].mockResolvedValue([]);
  });

  // ── findByCognitoSub ──────────────────────────────────────────────────────

  describe('findByCognitoSub', () => {
    it('returns undefined when no user exists for the given sub', async () => {
      mocks.selectBuilder['executeTakeFirst'].mockResolvedValueOnce(undefined);

      const result = await findByCognitoSub('nonexistent-sub');

      expect(result).toBeUndefined();
    });

    it('returns the user row when found', async () => {
      mocks.selectBuilder['executeTakeFirst'].mockResolvedValueOnce(mockUser);

      const result = await findByCognitoSub(mockUser.cognito_sub);

      expect(result).toEqual(mockUser);
    });

    it('queries the users table', async () => {
      await findByCognitoSub('any-sub');

      expect(db.selectFrom).toHaveBeenCalledWith('users');
    });

    it('applies a deleted_at is null filter to exclude soft-deleted users', async () => {
      await findByCognitoSub('any-sub');

      expect(mocks.selectBuilder['where']).toHaveBeenCalledWith('deleted_at', 'is', null);
    });
  });

  // ── findUserById ──────────────────────────────────────────────────────────

  describe('findUserById', () => {
    it('returns the user row when found', async () => {
      mocks.selectBuilder['executeTakeFirst'].mockResolvedValueOnce(mockUser);

      const result = await findUserById(mockUser.id);

      expect(result).toEqual(mockUser);
    });

    it('returns undefined for unknown IDs', async () => {
      const result = await findUserById('00000000-0000-0000-0000-999999999999');

      expect(result).toBeUndefined();
    });
  });

  // ── createUser ────────────────────────────────────────────────────────────

  describe('createUser', () => {
    it('returns the inserted user row', async () => {
      mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockUser);

      const result = await createUser({
        cognito_sub: mockUser.cognito_sub,
        email: mockUser.email,
      });

      expect(result).toEqual(mockUser);
    });

    it('inserts into the users table', async () => {
      mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockUser);

      await createUser({ cognito_sub: 'sub-001' });

      expect(db.insertInto).toHaveBeenCalledWith('users');
    });

    it('throws if the DB returns no row (unexpected failure)', async () => {
      mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(undefined);

      await expect(createUser({ cognito_sub: 'sub-001' })).rejects.toThrow('Failed to create user');
    });
  });

  // ── updateUserStatus ──────────────────────────────────────────────────────

  describe('updateUserStatus', () => {
    it('returns the updated user row', async () => {
      const suspended = { ...mockUser, status: 'suspended' };
      mocks.updateBuilder['executeTakeFirst'].mockResolvedValueOnce(suspended);

      const result = await updateUserStatus(mockUser.id, 'suspended');

      expect(result?.status).toBe('suspended');
    });

    it('returns undefined when no matching user is found', async () => {
      mocks.updateBuilder['executeTakeFirst'].mockResolvedValueOnce(undefined);

      const result = await updateUserStatus('nonexistent-id', 'active');

      expect(result).toBeUndefined();
    });

    it('includes updated_at in the SET payload (D-A-008)', async () => {
      mocks.updateBuilder['executeTakeFirst'].mockResolvedValueOnce(mockUser);

      await updateUserStatus(mockUser.id, 'active');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const setArg = mocks.updateBuilder['set'].mock.calls[0]?.[0];
      expect(setArg).toMatchObject({ updated_at: expect.any(Date) });
    });
  });

  // ── softDeleteUser ────────────────────────────────────────────────────────

  describe('softDeleteUser', () => {
    it('sets status to "deleted" in the SET payload', async () => {
      await softDeleteUser(mockUser.id);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const setArg = mocks.updateBuilder['set'].mock.calls[0]?.[0];
      expect(setArg).toMatchObject({ status: 'deleted' });
    });

    it('sets deleted_at to a Date in the SET payload', async () => {
      await softDeleteUser(mockUser.id);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const setArg = mocks.updateBuilder['set'].mock.calls[0]?.[0];
      expect(setArg).toMatchObject({ deleted_at: expect.any(Date) });
    });

    it('sets updated_at in the SET payload (D-A-008)', async () => {
      await softDeleteUser(mockUser.id);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const setArg = mocks.updateBuilder['set'].mock.calls[0]?.[0];
      expect(setArg).toMatchObject({ updated_at: expect.any(Date) });
    });
  });

  // ── findAuthIdentities ────────────────────────────────────────────────────

  describe('findAuthIdentities', () => {
    it('returns an empty array when no identities exist', async () => {
      mocks.selectBuilder['execute'].mockResolvedValueOnce([]);

      const result = await findAuthIdentities(mockUser.id);

      expect(result).toEqual([]);
    });

    it('returns all identities for a user', async () => {
      mocks.selectBuilder['execute'].mockResolvedValueOnce([mockAuthIdentity]);

      const result = await findAuthIdentities(mockUser.id);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockAuthIdentity);
    });

    it('provider value in fixture is an app auth method (not a health provider code)', () => {
      // Guard: confirm test data only uses allowed app-auth provider values.
      const allowedAppAuthProviders = ['email_password', 'google', 'apple', 'facebook'];
      expect(allowedAppAuthProviders).toContain(mockAuthIdentity.provider);
    });
  });

  // ── createAuthIdentity ────────────────────────────────────────────────────

  describe('createAuthIdentity', () => {
    it('returns the inserted identity row', async () => {
      mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockAuthIdentity);

      const result = await createAuthIdentity({
        user_id: mockUser.id,
        provider: 'google',
        provider_subject: 'google-sub-001',
      });

      expect(result).toEqual(mockAuthIdentity);
    });

    it('throws if the DB returns no row', async () => {
      mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(undefined);

      await expect(
        createAuthIdentity({
          user_id: mockUser.id,
          provider: 'google',
          provider_subject: 'google-sub-001',
        }),
      ).rejects.toThrow('Failed to create auth identity');
    });

    it('inserts into the auth_identities table', async () => {
      mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockAuthIdentity);

      await createAuthIdentity({
        user_id: mockUser.id,
        provider: 'apple',
        provider_subject: 'apple-sub-001',
      });

      expect(db.insertInto).toHaveBeenCalledWith('auth_identities');
    });
  });
});

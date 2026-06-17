/**
 * Auth form validation tests — pure field checks (CU-059).
 *
 * No native modules or stores are touched; these are dependency-free functions.
 *
 * @see apps/mobile/src/features/auth/validation.ts
 */

import { describe, expect, it } from 'vitest';

import {
  MIN_PASSWORD_LENGTH,
  validateConfirmPassword,
  validateEmail,
  validatePassword,
} from '../../src/features/auth/validation';

describe('validateEmail', () => {
  it('rejects an empty email', () => {
    const result = validateEmail('');
    expect(result.valid).toBe(false);
    expect(result.error).not.toBeNull();
  });

  it('rejects a whitespace-only email', () => {
    expect(validateEmail('   ').valid).toBe(false);
  });

  it('rejects an email without a domain', () => {
    expect(validateEmail('user@').valid).toBe(false);
    expect(validateEmail('user@example').valid).toBe(false);
  });

  it('rejects an email without an @', () => {
    expect(validateEmail('user.example.com').valid).toBe(false);
  });

  it('accepts a well-formed email', () => {
    const result = validateEmail('athlete@primis.app');
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('ignores surrounding whitespace', () => {
    expect(validateEmail('  athlete@primis.app  ').valid).toBe(true);
  });
});

describe('validatePassword', () => {
  it('rejects an empty password', () => {
    expect(validatePassword('').valid).toBe(false);
  });

  it(`rejects passwords shorter than ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(validatePassword('short').valid).toBe(false);
  });

  it('accepts a password at the minimum length', () => {
    const result = validatePassword('a'.repeat(MIN_PASSWORD_LENGTH));
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });
});

describe('validateConfirmPassword', () => {
  it('rejects an empty confirmation', () => {
    expect(validateConfirmPassword('password123', '').valid).toBe(false);
  });

  it('rejects a mismatched confirmation', () => {
    expect(validateConfirmPassword('password123', 'password124').valid).toBe(false);
  });

  it('accepts a matching confirmation', () => {
    const result = validateConfirmPassword('password123', 'password123');
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });
});

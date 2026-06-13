/**
 * Unit tests for user.ts and onboarding.ts DTOs in @primis/api-contracts (CU-033).
 *
 * Coverage:
 *   UserProfileDtoSchema:
 *     - Validates the representative fixture
 *     - Accepts null for email, displayName, dateOfBirth, coachPreferences, themePreference
 *     - Accepts non-null coachPreferences and themePreference
 *     - Rejects invalid UUID for id
 *     - Rejects invalid datetime for createdAt
 *     - Rejects malformed dateOfBirth (not YYYY-MM-DD)
 *
 *   UpdateProfileRequestDtoSchema:
 *     - Accepts partial updates
 *     - Rejects empty object
 *
 *   UpdatePreferencesRequestDtoSchema:
 *     - Accepts valid coach style + explanation depth + nutrition update
 *     - Rejects invalid coach style
 *     - Rejects empty object (at least one field required)
 *
 *   GoalCodeSchema:
 *     - Accepts all 7 goal codes
 *     - Rejects unknown goal code
 *
 *   OnboardingGoalsRequestDtoSchema:
 *     - Validates a list of goals
 *     - Rejects empty goals array
 *     - Rejects goals with invalid goal_code
 *
 *   OnboardingPreferencesRequestDtoSchema:
 *     - Accepts partial preference update
 *     - Rejects invalid coach style
 *
 *   OnboardingConsentRequestDtoSchema:
 *     - Accepts valid consent events
 *     - Rejects unknown consent type
 *     - Rejects missing granted field
 *
 *   Provider separation:
 *     - UserProfileDto fixture contains no Google Health fields
 */

import { describe, it, expect } from 'vitest';

import {
  UserProfileDtoSchema,
  UpdateProfileRequestDtoSchema,
  UpdatePreferencesRequestDtoSchema,
  CoachStyleSchema,
  ExplanationDepthSchema,
  CoachingIntensitySchema,
  HumorLevelSchema,
  USER_PROFILE_FIXTURE,
} from '../src/user.js';

import {
  GoalCodeSchema,
  GOAL_CODE_VALUES,
  OnboardingGoalsRequestDtoSchema,
  OnboardingPreferencesRequestDtoSchema,
  ConsentTypeSchema,
  CONSENT_TYPE_VALUES,
  OnboardingConsentRequestDtoSchema,
} from '../src/onboarding.js';

// ---------------------------------------------------------------------------
// UserProfileDtoSchema
// ---------------------------------------------------------------------------

describe('UserProfileDtoSchema — valid inputs', () => {
  it('validates the representative fixture', () => {
    const result = UserProfileDtoSchema.safeParse(USER_PROFILE_FIXTURE);
    expect(result.success).toBe(true);
  });

  it('accepts null email', () => {
    const result = UserProfileDtoSchema.safeParse({ ...USER_PROFILE_FIXTURE, email: null });
    expect(result.success).toBe(true);
  });

  it('accepts null displayName', () => {
    const result = UserProfileDtoSchema.safeParse({ ...USER_PROFILE_FIXTURE, displayName: null });
    expect(result.success).toBe(true);
  });

  it('accepts null dateOfBirth', () => {
    const result = UserProfileDtoSchema.safeParse({ ...USER_PROFILE_FIXTURE, dateOfBirth: null });
    expect(result.success).toBe(true);
  });

  it('accepts a valid YYYY-MM-DD dateOfBirth', () => {
    const result = UserProfileDtoSchema.safeParse({
      ...USER_PROFILE_FIXTURE,
      dateOfBirth: '1990-06-15',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null coachPreferences', () => {
    const result = UserProfileDtoSchema.safeParse({
      ...USER_PROFILE_FIXTURE,
      coachPreferences: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts non-null themePreference', () => {
    const result = UserProfileDtoSchema.safeParse({
      ...USER_PROFILE_FIXTURE,
      themePreference: {
        mode: 'dark',
        identity: 'performance_dark',
        accentColor: '#6C63FF',
        reduceMotion: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts null themePreference', () => {
    const result = UserProfileDtoSchema.safeParse({
      ...USER_PROFILE_FIXTURE,
      themePreference: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty goals array', () => {
    const result = UserProfileDtoSchema.safeParse({ ...USER_PROFILE_FIXTURE, goals: [] });
    expect(result.success).toBe(true);
  });

  it('accepts all three theme mode values', () => {
    for (const mode of ['dark', 'light', 'system'] as const) {
      const result = UserProfileDtoSchema.safeParse({
        ...USER_PROFILE_FIXTURE,
        themePreference: {
          mode,
          identity: 'performance_dark',
          accentColor: '#FF0000',
          reduceMotion: false,
        },
      });
      expect(result.success, `mode '${mode}' should be valid`).toBe(true);
    }
  });
});

describe('UserProfileDtoSchema — invalid inputs', () => {
  it('rejects an invalid UUID for id', () => {
    const result = UserProfileDtoSchema.safeParse({ ...USER_PROFILE_FIXTURE, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-datetime string for createdAt', () => {
    const result = UserProfileDtoSchema.safeParse({
      ...USER_PROFILE_FIXTURE,
      createdAt: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed dateOfBirth (DD/MM/YYYY)', () => {
    const result = UserProfileDtoSchema.safeParse({
      ...USER_PROFILE_FIXTURE,
      dateOfBirth: '15/06/1990',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed dateOfBirth (ISO datetime)', () => {
    const result = UserProfileDtoSchema.safeParse({
      ...USER_PROFILE_FIXTURE,
      dateOfBirth: '1990-06-15T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown theme mode', () => {
    const result = UserProfileDtoSchema.safeParse({
      ...USER_PROFILE_FIXTURE,
      themePreference: {
        mode: 'auto',
        identity: 'performance_dark',
        accentColor: '#FF0000',
        reduceMotion: false,
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown theme identity', () => {
    const result = UserProfileDtoSchema.safeParse({
      ...USER_PROFILE_FIXTURE,
      themePreference: {
        mode: 'dark',
        identity: 'neon_chaos',
        accentColor: '#FF0000',
        reduceMotion: false,
      },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Provider separation check
// ---------------------------------------------------------------------------

describe('UserProfileDto — provider separation', () => {
  it('fixture does not contain googleHealth or providerConnection fields', () => {
    const keys = Object.keys(USER_PROFILE_FIXTURE);
    expect(keys).not.toContain('googleHealthConnected');
    expect(keys).not.toContain('providerConnections');
    expect(keys).not.toContain('googleHealthAuthorized');
  });
});

// ---------------------------------------------------------------------------
// UpdateProfileRequestDtoSchema
// ---------------------------------------------------------------------------

describe('UpdateProfileRequestDtoSchema — valid inputs', () => {
  it('accepts a displayName-only update', () => {
    const result = UpdateProfileRequestDtoSchema.safeParse({ displayName: 'Alice' });
    expect(result.success).toBe(true);
  });

  it('accepts a primaryTimezone-only update', () => {
    const result = UpdateProfileRequestDtoSchema.safeParse({
      primaryTimezone: 'America/Los_Angeles',
    });
    expect(result.success).toBe(true);
  });

  it('accepts clearing dateOfBirth with null', () => {
    const result = UpdateProfileRequestDtoSchema.safeParse({ dateOfBirth: null });
    expect(result.success).toBe(true);
  });

  it('accepts clearing displayName with null', () => {
    const result = UpdateProfileRequestDtoSchema.safeParse({ displayName: null });
    expect(result.success).toBe(true);
  });

  it('accepts all three fields together', () => {
    const result = UpdateProfileRequestDtoSchema.safeParse({
      displayName: 'Bob',
      primaryTimezone: 'UTC',
      dateOfBirth: '1985-12-01',
    });
    expect(result.success).toBe(true);
  });
});

describe('UpdateProfileRequestDtoSchema — invalid inputs', () => {
  it('rejects an empty object', () => {
    const result = UpdateProfileRequestDtoSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a malformed dateOfBirth', () => {
    const result = UpdateProfileRequestDtoSchema.safeParse({ dateOfBirth: '2026/01/01' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty string displayName', () => {
    const result = UpdateProfileRequestDtoSchema.safeParse({ displayName: '' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CoachStyleSchema / enum schemas
// ---------------------------------------------------------------------------

describe('CoachStyleSchema', () => {
  it('accepts all 8 coach style values', () => {
    const styles = [
      'analyst_coach',
      'strict',
      'encouraging',
      'performance_coach',
      'calm',
      'concise',
      'explanatory',
      'unhinged_lite',
    ] as const;

    for (const style of styles) {
      expect(CoachStyleSchema.safeParse(style).success, `'${style}' should be valid`).toBe(true);
    }
  });

  it('has exactly 8 options', () => {
    expect(CoachStyleSchema.options).toHaveLength(8);
  });

  it('rejects an unknown coach style', () => {
    expect(CoachStyleSchema.safeParse('aggressive').success).toBe(false);
    expect(CoachStyleSchema.safeParse('').success).toBe(false);
  });
});

describe('ExplanationDepthSchema', () => {
  it('accepts all 4 explanation depth values', () => {
    for (const v of ['concise', 'balanced', 'detailed', 'data_heavy'] as const) {
      expect(ExplanationDepthSchema.safeParse(v).success).toBe(true);
    }
  });

  it('rejects unknown explanation depth', () => {
    expect(ExplanationDepthSchema.safeParse('expert').success).toBe(false);
  });
});

describe('CoachingIntensitySchema', () => {
  it('accepts all 3 coaching intensity values', () => {
    for (const v of ['gentle', 'moderate', 'strict'] as const) {
      expect(CoachingIntensitySchema.safeParse(v).success).toBe(true);
    }
  });

  it('rejects unknown coaching intensity', () => {
    expect(CoachingIntensitySchema.safeParse('extreme').success).toBe(false);
  });
});

describe('HumorLevelSchema', () => {
  it('accepts all 3 humor level values', () => {
    for (const v of ['none', 'low', 'medium'] as const) {
      expect(HumorLevelSchema.safeParse(v).success).toBe(true);
    }
  });

  it('rejects unknown humor level', () => {
    expect(HumorLevelSchema.safeParse('high').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UpdatePreferencesRequestDtoSchema
// ---------------------------------------------------------------------------

describe('UpdatePreferencesRequestDtoSchema — valid inputs', () => {
  it('accepts a coachStyle-only update', () => {
    const result = UpdatePreferencesRequestDtoSchema.safeParse({ coachStyle: 'strict' });
    expect(result.success).toBe(true);
  });

  it('accepts explanationDepth + coachingIntensity', () => {
    const result = UpdatePreferencesRequestDtoSchema.safeParse({
      explanationDepth: 'detailed',
      coachingIntensity: 'gentle',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a nutritionPhilosophy-only update', () => {
    const result = UpdatePreferencesRequestDtoSchema.safeParse({
      nutritionPhilosophy: { wholeFoodsEmphasis: true, highProteinEmphasis: false },
    });
    expect(result.success).toBe(true);
  });

  it('accepts allowUnhingedLite boolean toggle', () => {
    const result = UpdatePreferencesRequestDtoSchema.safeParse({ allowUnhingedLite: true });
    expect(result.success).toBe(true);
  });
});

describe('UpdatePreferencesRequestDtoSchema — invalid inputs', () => {
  it('rejects an empty object', () => {
    const result = UpdatePreferencesRequestDtoSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an unknown coachStyle', () => {
    const result = UpdatePreferencesRequestDtoSchema.safeParse({ coachStyle: 'aggressive' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown explanationDepth', () => {
    const result = UpdatePreferencesRequestDtoSchema.safeParse({ explanationDepth: 'expert' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GoalCodeSchema
// ---------------------------------------------------------------------------

describe('GoalCodeSchema', () => {
  it('accepts all 7 goal codes', () => {
    for (const code of GOAL_CODE_VALUES) {
      expect(GoalCodeSchema.safeParse(code).success, `'${code}' should be valid`).toBe(true);
    }
  });

  it('has exactly 7 options', () => {
    expect(GoalCodeSchema.options).toHaveLength(7);
  });

  it('rejects an unknown goal code', () => {
    expect(GoalCodeSchema.safeParse('cardio').success).toBe(false);
    expect(GoalCodeSchema.safeParse('').success).toBe(false);
    expect(GoalCodeSchema.safeParse('weight_loss').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OnboardingGoalsRequestDtoSchema
// ---------------------------------------------------------------------------

describe('OnboardingGoalsRequestDtoSchema — valid inputs', () => {
  it('validates a single-goal list', () => {
    const result = OnboardingGoalsRequestDtoSchema.safeParse({
      goals: [{ goalCode: 'sleep', priorityRank: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it('validates a multi-goal ranked list', () => {
    const result = OnboardingGoalsRequestDtoSchema.safeParse({
      goals: [
        { goalCode: 'athletic_performance', priorityRank: 1 },
        { goalCode: 'sleep', priorityRank: 2 },
        { goalCode: 'longevity', priorityRank: 3 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts up to 7 goals', () => {
    const goals = GOAL_CODE_VALUES.map((code, i) => ({ goalCode: code, priorityRank: i + 1 }));
    const result = OnboardingGoalsRequestDtoSchema.safeParse({ goals });
    expect(result.success).toBe(true);
  });
});

describe('OnboardingGoalsRequestDtoSchema — invalid inputs', () => {
  it('rejects an empty goals array', () => {
    const result = OnboardingGoalsRequestDtoSchema.safeParse({ goals: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 7 goals', () => {
    const goals = Array.from({ length: 8 }, (_, i) => ({
      goalCode: 'sleep',
      priorityRank: i + 1,
    }));
    const result = OnboardingGoalsRequestDtoSchema.safeParse({ goals });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid goal code', () => {
    const result = OnboardingGoalsRequestDtoSchema.safeParse({
      goals: [{ goalCode: 'invalid_goal', priorityRank: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects priorityRank < 1', () => {
    const result = OnboardingGoalsRequestDtoSchema.safeParse({
      goals: [{ goalCode: 'sleep', priorityRank: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer priorityRank', () => {
    const result = OnboardingGoalsRequestDtoSchema.safeParse({
      goals: [{ goalCode: 'sleep', priorityRank: 1.5 }],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OnboardingPreferencesRequestDtoSchema
// ---------------------------------------------------------------------------

describe('OnboardingPreferencesRequestDtoSchema — valid inputs', () => {
  it('accepts a partial preferences object', () => {
    const result = OnboardingPreferencesRequestDtoSchema.safeParse({
      coachStyle: 'encouraging',
      explanationDepth: 'concise',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object (all optional, no refine constraint)', () => {
    // OnboardingPreferencesRequestDtoSchema does NOT require at least one field —
    // it is intentionally more permissive than UpdatePreferencesRequestDtoSchema
    // to support incremental onboarding steps.
    const result = OnboardingPreferencesRequestDtoSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts nutritionPhilosophy with boolean flags', () => {
    const result = OnboardingPreferencesRequestDtoSchema.safeParse({
      nutritionPhilosophy: {
        wholeFoodsEmphasis: true,
        avoidSeedOils: true,
        antiInflammatoryEmphasis: true,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('OnboardingPreferencesRequestDtoSchema — invalid inputs', () => {
  it('rejects an invalid coachStyle value', () => {
    const result = OnboardingPreferencesRequestDtoSchema.safeParse({
      coachStyle: 'hyperaggressive',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid coachingIntensity value', () => {
    const result = OnboardingPreferencesRequestDtoSchema.safeParse({
      coachingIntensity: 'extreme',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ConsentTypeSchema
// ---------------------------------------------------------------------------

describe('ConsentTypeSchema', () => {
  it('accepts all 8 consent types', () => {
    for (const type of CONSENT_TYPE_VALUES) {
      expect(ConsentTypeSchema.safeParse(type).success, `'${type}' should be valid`).toBe(true);
    }
  });

  it('has exactly 8 options', () => {
    expect(ConsentTypeSchema.options).toHaveLength(8);
  });

  it('rejects an unknown consent type', () => {
    expect(ConsentTypeSchema.safeParse('biometric_data').success).toBe(false);
    expect(ConsentTypeSchema.safeParse('').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OnboardingConsentRequestDtoSchema
// ---------------------------------------------------------------------------

describe('OnboardingConsentRequestDtoSchema — valid inputs', () => {
  it('validates a terms-granted event', () => {
    const result = OnboardingConsentRequestDtoSchema.safeParse({
      consentType: 'terms',
      version: '1.0',
      granted: true,
    });
    expect(result.success).toBe(true);
  });

  it('validates a privacy_policy-declined event', () => {
    const result = OnboardingConsentRequestDtoSchema.safeParse({
      consentType: 'privacy_policy',
      version: '2.1',
      granted: false,
    });
    expect(result.success).toBe(true);
  });

  it('validates an ai_processing-granted event', () => {
    const result = OnboardingConsentRequestDtoSchema.safeParse({
      consentType: 'ai_processing',
      version: '1.0',
      granted: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('OnboardingConsentRequestDtoSchema — invalid inputs', () => {
  it('rejects an unknown consent type', () => {
    const result = OnboardingConsentRequestDtoSchema.safeParse({
      consentType: 'biometric_data',
      version: '1.0',
      granted: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing granted field', () => {
    const result = OnboardingConsentRequestDtoSchema.safeParse({
      consentType: 'terms',
      version: '1.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-boolean granted value', () => {
    const result = OnboardingConsentRequestDtoSchema.safeParse({
      consentType: 'terms',
      version: '1.0',
      granted: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty version string', () => {
    const result = OnboardingConsentRequestDtoSchema.safeParse({
      consentType: 'terms',
      version: '',
      granted: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a version longer than 20 characters', () => {
    const result = OnboardingConsentRequestDtoSchema.safeParse({
      consentType: 'terms',
      version: '1.0.0.0.0.0.0.0.0.0.0', // 21 chars
      granted: true,
    });
    expect(result.success).toBe(false);
  });
});

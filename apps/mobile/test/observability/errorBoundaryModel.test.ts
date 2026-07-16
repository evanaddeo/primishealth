import { describe, expect, it } from 'vitest';

import {
  ERROR_BOUNDARY_FALLBACK,
  INITIAL_ERROR_BOUNDARY_STATE,
  markErrorCaught,
  resetErrorBoundary,
} from '../../src/observability/errorBoundaryModel';

describe('error boundary recovery model', () => {
  it('marks a routed-tree render failure as caught', () => {
    expect(markErrorCaught(INITIAL_ERROR_BOUNDARY_STATE)).toEqual({
      hasError: true,
      recoveryKey: 0,
    });
  });

  it('clears the fallback and increments the remount key on retry/reset', () => {
    const failed = markErrorCaught(INITIAL_ERROR_BOUNDARY_STATE);
    const recovered = resetErrorBoundary(failed);

    expect(recovered).toEqual({ hasError: false, recoveryKey: 1 });
    expect(resetErrorBoundary(recovered)).toEqual({ hasError: false, recoveryKey: 2 });
  });

  it('uses branded recovery copy with no raw diagnostic placeholders', () => {
    const fallbackText = Object.values(ERROR_BOUNDARY_FALLBACK).join(' ');

    expect(ERROR_BOUNDARY_FALLBACK.brand).toBe('PRIMIS');
    expect(fallbackText).not.toMatch(/stack|exception|error\.message|request body/i);
  });
});

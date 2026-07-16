/** Pure, reusable crash-fallback copy and recovery model for CU-089/CU-090. */

export const ERROR_BOUNDARY_FALLBACK = {
  brand: 'PRIMIS',
  title: 'Something went wrong',
  body: 'Your data is still safe. Try loading this part of Primis again, or return Home.',
  retryLabel: 'Try again',
  homeLabel: 'Return Home',
} as const;

export interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly recoveryKey: number;
}

export const INITIAL_ERROR_BOUNDARY_STATE: ErrorBoundaryState = {
  hasError: false,
  recoveryKey: 0,
};

export function markErrorCaught(state: ErrorBoundaryState): ErrorBoundaryState {
  return { ...state, hasError: true };
}

export function resetErrorBoundary(state: ErrorBoundaryState): ErrorBoundaryState {
  return { hasError: false, recoveryKey: state.recoveryKey + 1 };
}

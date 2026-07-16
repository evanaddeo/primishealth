import type { AccessibilityState } from 'react-native';

export const MIN_TOUCH_TARGET = 44;

export function resolveControlAccessibilityState(
  disabled: boolean,
  busy: boolean,
  state: AccessibilityState = {},
): AccessibilityState {
  return { ...state, disabled, busy };
}

export function resolveControlAccessibilityHint(
  destructive: boolean,
  hint?: string,
): string | undefined {
  return hint ?? (destructive ? 'Destructive action' : undefined);
}

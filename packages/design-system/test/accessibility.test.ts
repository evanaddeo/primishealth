import { describe, expect, it } from 'vitest';

import {
  MIN_TOUCH_TARGET,
  resolveControlAccessibilityHint,
  resolveControlAccessibilityState,
} from '../src/utils/accessibility.js';
import { resolveCardEnter, resolveMetricUpdate } from '../src/motion/transitions.js';

describe('shared accessibility contracts', () => {
  it('keeps shared controls at the 44 point practical minimum', () => {
    expect(MIN_TOUCH_TARGET).toBe(44);
  });

  it('preserves selected and expanded state while announcing disabled and busy', () => {
    expect(
      resolveControlAccessibilityState(true, true, { selected: true, expanded: false }),
    ).toEqual({ selected: true, expanded: false, disabled: true, busy: true });
  });

  it('provides destructive semantics without replacing a specific hint', () => {
    expect(resolveControlAccessibilityHint(true)).toBe('Destructive action');
    expect(resolveControlAccessibilityHint(true, 'Deletes after confirmation')).toBe(
      'Deletes after confirmation',
    );
    expect(resolveControlAccessibilityHint(false)).toBeUndefined();
  });

  it('suppresses scale and translation under reduced motion', () => {
    const cardEnter = resolveCardEnter(true);
    expect(cardEnter).toMatchObject({ timing: { duration: 0 } });
    expect('translateYFrom' in cardEnter).toBe(false);
    expect(resolveMetricUpdate(true)).toMatchObject({
      scalePeak: 1,
      scaleResting: 1,
      timing: { duration: 0 },
    });
  });
});

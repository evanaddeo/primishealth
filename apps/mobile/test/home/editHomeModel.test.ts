/**
 * Unit tests for the pure Home customization helpers (CU-062).
 *
 * Covers row building (order/visibility/edge flags) and the up/down reorder math
 * that the EditHome screen feeds back into `widgetStore.setWidgetOrder`. Pure
 * logic only — no React Native — so it runs in the node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import { buildEditRows, moveWidget } from '../../src/features/home/editHomeModel';
import { HOME_WIDGET_IDS } from '../../src/features/home/homeModel';

// Mirror of DEFAULT_WIDGET_ORDER without importing widgetStore (which pulls in
// react-native-mmkv's Flow syntax — unparseable in the node Vitest env).
const DEFAULT_ORDER: string[] = [...HOME_WIDGET_IDS];

describe('buildEditRows', () => {
  it('returns one row per known widget in stored order', () => {
    const rows = buildEditRows(DEFAULT_ORDER, new Set());
    expect(rows.map((r) => r.id)).toEqual(DEFAULT_ORDER);
  });

  it('marks hidden widgets as hidden', () => {
    const rows = buildEditRows(DEFAULT_ORDER, new Set(['sleep_score']));
    const sleep = rows.find((r) => r.id === 'sleep_score');
    expect(sleep?.hidden).toBe(true);
    expect(rows.find((r) => r.id === 'recovery_score')?.hidden).toBe(false);
  });

  it('disables move-up on the first row and move-down on the last', () => {
    const rows = buildEditRows(DEFAULT_ORDER, new Set());
    expect(rows[0]?.canMoveUp).toBe(false);
    expect(rows[0]?.canMoveDown).toBe(true);
    expect(rows[rows.length - 1]?.canMoveDown).toBe(false);
    expect(rows[rows.length - 1]?.canMoveUp).toBe(true);
  });

  it('ignores unknown widget IDs with no renderer/metadata', () => {
    const rows = buildEditRows(['recovery_score', 'not_a_widget'], new Set());
    expect(rows.map((r) => r.id)).toEqual(['recovery_score']);
  });

  it('carries the widget title from metadata', () => {
    const rows = buildEditRows(['recovery_score'], new Set());
    expect(rows[0]?.title).toBe('Recovery');
  });
});

describe('moveWidget', () => {
  it('moves a widget up by swapping with its predecessor', () => {
    const next = moveWidget(['a', 'b', 'c'], 'b', 'up');
    expect(next).toEqual(['b', 'a', 'c']);
  });

  it('moves a widget down by swapping with its successor', () => {
    const next = moveWidget(['a', 'b', 'c'], 'b', 'down');
    expect(next).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op when moving the first widget up', () => {
    expect(moveWidget(['a', 'b', 'c'], 'a', 'up')).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op when moving the last widget down', () => {
    expect(moveWidget(['a', 'b', 'c'], 'c', 'down')).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op for an unknown id', () => {
    expect(moveWidget(['a', 'b', 'c'], 'z', 'up')).toEqual(['a', 'b', 'c']);
  });

  it('returns a new array and does not mutate the input', () => {
    const order = ['a', 'b', 'c'];
    const next = moveWidget(order, 'b', 'up');
    expect(order).toEqual(['a', 'b', 'c']);
    expect(next).not.toBe(order);
  });

  it('preserves the full default order length after a move', () => {
    const next = moveWidget(DEFAULT_ORDER, 'sleep_debt', 'up');
    expect(next).toHaveLength(DEFAULT_ORDER.length);
    expect([...next].sort()).toEqual([...DEFAULT_ORDER].sort());
  });
});

/**
 * editHomeModel — pure, render-free helpers for Home widget customization (CU-062).
 *
 * Free of React / React Native imports so it runs in the node Vitest env. The
 * EditHome screen renders the rows this produces and calls `moveWidget` to
 * compute a new order before handing it back to `widgetStore.setWidgetOrder`.
 * No layout math or store access happens on the render path.
 *
 * @see apps/mobile/src/state/widgetStore.ts — widgetOrder / hiddenWidgets / actions
 * @see apps/mobile/src/features/home/homeModel.ts — HOME_WIDGET_IDS / metadata
 * @see UI/UX Spec §14.1 — Customizable Home (show/hide + reorder)
 */

import { HOME_WIDGET_META, type HomeWidgetId } from './homeModel';

export type ReorderDirection = 'up' | 'down';

/** A single editable widget row: identity, visibility, and reorder affordances. */
export interface EditWidgetRow {
  readonly id: HomeWidgetId;
  /** Human-readable title shown in the row (from widget metadata). */
  readonly title: string;
  /** True when the widget is currently hidden from Home. */
  readonly hidden: boolean;
  /** False for the top row — the "move up" control is disabled. */
  readonly canMoveUp: boolean;
  /** False for the bottom row — the "move down" control is disabled. */
  readonly canMoveDown: boolean;
}

function isHomeWidgetId(id: string): id is HomeWidgetId {
  return Object.prototype.hasOwnProperty.call(HOME_WIDGET_META, id);
}

/**
 * Build the ordered list of editable rows from the stored order and hidden set.
 * Honors the saved order, includes hidden widgets (so they can be re-shown), and
 * ignores any unknown IDs that have no metadata/renderer.
 */
export function buildEditRows(
  widgetOrder: readonly string[],
  hiddenWidgets: ReadonlySet<string>,
): EditWidgetRow[] {
  const known = widgetOrder.filter(isHomeWidgetId);
  return known.map((id, index) => ({
    id,
    title: HOME_WIDGET_META[id].title,
    hidden: hiddenWidgets.has(id),
    canMoveUp: index > 0,
    canMoveDown: index < known.length - 1,
  }));
}

/**
 * Return a new widget order with `id` swapped one step in `direction`. Returns
 * the input order unchanged (same reference) when the move is a no-op: the id is
 * absent, or it is already at the relevant edge.
 */
export function moveWidget(
  order: readonly string[],
  id: string,
  direction: ReorderDirection,
): string[] {
  const index = order.indexOf(id);
  if (index === -1) return [...order];
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= order.length) return [...order];
  const next = [...order];
  const moved = next[index];
  const displaced = next[target];
  // Guard for noUncheckedIndexedAccess — both indices are in range here.
  if (moved === undefined || displaced === undefined) return [...order];
  next[index] = displaced;
  next[target] = moved;
  return next;
}

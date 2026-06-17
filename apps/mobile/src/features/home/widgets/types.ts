/**
 * Shared prop contract for Home dashboard widgets (CU-061).
 *
 * Every widget receives the same precomputed snapshot and a navigation handler;
 * each reads only the slice it needs. No widget fetches data or computes scores.
 */

import type { MockHomeSnapshot } from '../../../mocks/dashboard';

export interface HomeWidgetProps {
  /** Precomputed dashboard + supplement snapshot. */
  snapshot: MockHomeSnapshot;
  /** Navigate to this widget's detail surface. */
  onPress: () => void;
  testID?: string;
}

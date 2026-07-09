/**
 * Shared prop contract for the quick-add sub-forms (CU-074).
 *
 * Each sub-form receives the live {@link QuickAddController}, a `buildAnchors`
 * factory (so it stamps the request with the current instant only at submit
 * time), and an `onLogged` callback the sheet uses to show a brief, non-shaming
 * confirmation and return to the menu.
 */

import type { QuickAddController } from '../../../api/hooks/useQuickAdd';
import type { TimeAnchors } from '../quickAddModel';

export interface QuickAddFormProps {
  readonly controller: QuickAddController;
  readonly buildAnchors: () => TimeAnchors;
  readonly onLogged: (label: string) => void;
}

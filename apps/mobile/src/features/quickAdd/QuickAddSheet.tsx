/**
 * QuickAddSheet — the global quick-add bottom sheet (CU-074).
 *
 * Hosts one-tap logging for water, caffeine, alcohol, manual macros, custom
 * tags, and (discreetly) digestion. Mounted from Home and Nutrition; opened via
 * the `visible` prop. Each successful log shows a brief, non-shaming confirmation
 * and returns to the menu, where the optimistic "today so far" summary has
 * already updated (local-first, ADR-008 client side).
 *
 * Errors are handled gracefully: a failed log surfaces a calm inline message and
 * keeps the user's input — nothing is lost, nothing is blamed.
 *
 * @see apps/mobile/src/api/hooks/useQuickAdd.ts — the mock-first write seam
 * @see apps/mobile/src/features/quickAdd/quickAddModel.ts — pure builders/folders
 */

import React, { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, Button, Text, useTheme } from '@primis/design-system';

import { useQuickAdd } from '../../api/hooks/useQuickAdd';
import { DataStatusBanner } from '../../components/DataStatusBanner';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { resolveTimeAnchors, type TimeAnchors } from './quickAddModel';
import { AlcoholForm } from './components/AlcoholForm';
import { CaffeineForm } from './components/CaffeineForm';
import { DigestionForm } from './components/DigestionForm';
import { MacrosForm } from './components/MacrosForm';
import { QuickAddMenu, type QuickAddCategory } from './components/QuickAddMenu';
import { TagForm } from './components/TagForm';
import { WaterForm } from './components/WaterForm';
import type { QuickAddFormProps } from './components/types';

export interface QuickAddSheetProps {
  visible: boolean;
  onClose: () => void;
  returnFocusRef?: React.RefObject<View | null>;
}

const TITLES: Record<QuickAddCategory, string> = {
  water: 'Add water',
  caffeine: 'Add caffeine',
  alcohol: 'Add alcohol',
  macros: 'Add a meal',
  tag: 'Add a tag',
  digestion: 'Digestion',
};

const FORMS: Record<QuickAddCategory, (props: QuickAddFormProps) => React.JSX.Element> = {
  water: WaterForm,
  caffeine: CaffeineForm,
  alcohol: AlcoholForm,
  macros: MacrosForm,
  tag: TagForm,
  digestion: DigestionForm,
};

export function QuickAddSheet({
  visible,
  onClose,
  returnFocusRef,
}: QuickAddSheetProps): React.JSX.Element {
  const { spacing } = useTheme();
  const { isReducedMotion } = useReducedMotion();
  const controller = useQuickAdd();

  const [category, setCategory] = useState<QuickAddCategory | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const buildAnchors = (): TimeAnchors => resolveTimeAnchors(new Date(), controller.timezone);

  function handleClose(): void {
    setCategory(null);
    setConfirmation(null);
    controller.clearError();
    onClose();
  }

  function handleLogged(label: string): void {
    setConfirmation(label);
    setCategory(null);
  }

  const ActiveForm = category !== null ? FORMS[category] : null;
  const title = category !== null ? TITLES[category] : 'Quick add';

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={title}
      reducedMotion={isReducedMotion}
      {...(returnFocusRef === undefined ? {} : { returnFocusRef })}
      testID="quick-add-sheet"
    >
      <View style={{ gap: spacing.lg }}>
        {confirmation !== null && category === null && (
          <Text
            variant="bodyMedium"
            color="accent"
            accessibilityRole="alert"
            testID="quickadd-confirmation"
          >
            {confirmation} ✓
          </Text>
        )}

        {controller.errorMessage !== null && (
          <DataStatusBanner
            state="api_error"
            title="Entry not saved"
            body={controller.errorMessage}
            testID="quickadd-error"
          />
        )}

        {controller.pending && (
          <DataStatusBanner
            state="refreshing"
            title="Saving entry"
            body="Your input stays in place until saving finishes."
            testID="quickadd-saving"
          />
        )}

        {ActiveForm === null ? (
          <QuickAddMenu
            controller={controller}
            onSelect={(c) => {
              setConfirmation(null);
              controller.clearError();
              setCategory(c);
            }}
          />
        ) : (
          <View style={{ gap: spacing.lg }}>
            <ActiveForm
              controller={controller}
              buildAnchors={buildAnchors}
              onLogged={handleLogged}
            />
            <Button
              variant="ghost"
              label="Back"
              onPress={() => {
                controller.clearError();
                setCategory(null);
              }}
            />
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

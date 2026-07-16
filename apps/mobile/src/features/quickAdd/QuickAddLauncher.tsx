/**
 * QuickAddLauncher — a self-contained entry point for the quick-add sheet (CU-074).
 *
 * Renders a button that opens the global {@link QuickAddSheet} and owns the
 * sheet's visibility, so any screen (Home, Nutrition) can drop in fast logging
 * with a single element and no extra wiring.
 */

import React, { useRef, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@primis/design-system';

import { QuickAddSheet } from './QuickAddSheet';

export interface QuickAddLauncherProps {
  /** Button label. Defaults to "Quick add". */
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  testID?: string;
}

export function QuickAddLauncher({
  label = 'Quick add',
  variant = 'secondary',
  testID,
}: QuickAddLauncherProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<View>(null);

  return (
    <>
      <Button
        ref={launcherRef}
        variant={variant}
        label={label}
        onPress={() => setOpen(true)}
        accessibilityHint="Opens a sheet to log water, caffeine, alcohol, macros, or tags"
        testID={testID ?? 'quick-add-launcher'}
      />
      <QuickAddSheet visible={open} onClose={() => setOpen(false)} returnFocusRef={launcherRef} />
    </>
  );
}

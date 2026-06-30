/**
 * @primis/design-system — UI primitives barrel export.
 *
 * Every component exported from this file is token-driven and accessibility-aware.
 * Future screens must import primitives from here — never use raw RN View/Text with
 * hardcoded style values.
 */

export { Screen } from './Screen.js';
export type { ScreenProps } from './Screen.js';

export { Card } from './Card.js';
export type { CardProps } from './Card.js';

export { Text } from './Text.js';
export type { TextProps } from './Text.js';

export { Button } from './Button.js';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button.js';

export { MetricValue, resolveMetricDisplay } from './MetricValue.js';
export type { MetricValueProps, MetricValueSize } from './MetricValue.js';

export {
  StatusBadge,
  resolveStatusLabel,
  resolveStatusForeground,
  resolveStatusBackground,
} from './StatusBadge.js';
export type { StatusBadgeProps, StatusBadgeStatus } from './StatusBadge.js';

export { ProgressBar, resolveProgressFill } from './ProgressBar.js';
export type { ProgressBarProps } from './ProgressBar.js';

// Form input primitives (H-PRE, CU-074)
export { TextField } from './TextField.js';
export type { TextFieldProps } from './TextField.js';

export {
  NumberStepper,
  clampStepperValue,
  nextStepperValue,
  canIncrementStepper,
  canDecrementStepper,
} from './NumberStepper.js';
export type { NumberStepperProps } from './NumberStepper.js';
export type { StepperBounds } from '../utils/componentResolvers.js';

export { SegmentedControl } from './SegmentedControl.js';
export type { SegmentedControlProps, SegmentOption } from './SegmentedControl.js';

export { Chip, ChipRow } from './Chip.js';
export type { ChipProps } from './Chip.js';

export { BottomSheet } from './BottomSheet.js';
export type { BottomSheetProps } from './BottomSheet.js';

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

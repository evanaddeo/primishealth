import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, useTheme } from '@primis/design-system';

import { DataStatePanel } from '../components/DataStatePanel';

import {
  ERROR_BOUNDARY_FALLBACK,
  INITIAL_ERROR_BOUNDARY_STATE,
  resetErrorBoundary,
  type ErrorBoundaryState,
} from './errorBoundaryModel';
import {
  classifyMobileError,
  mobileTelemetry,
  type MobileErrorReport,
  type MobileTelemetry,
} from './telemetry';

export interface ErrorFallbackProps {
  readonly report: MobileErrorReport;
  readonly retry: () => void;
  readonly goHome: () => void;
}

export interface ErrorBoundaryProps {
  readonly children?: React.ReactNode;
  readonly telemetry?: MobileTelemetry;
  readonly onGoHome?: () => void;
  /** CU-090 seam for consolidating fallback visuals without changing recovery behavior. */
  readonly renderFallback?: (props: ErrorFallbackProps) => React.ReactNode;
}

interface InternalErrorBoundaryState extends ErrorBoundaryState {
  readonly report: MobileErrorReport | null;
}

const INITIAL_STATE: InternalErrorBoundaryState = {
  ...INITIAL_ERROR_BOUNDARY_STATE,
  report: null,
};

/** Catches routed-screen render failures while leaving all root providers mounted. */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, InternalErrorBoundaryState> {
  state: InternalErrorBoundaryState = INITIAL_STATE;

  static getDerivedStateFromError(error: unknown): Partial<InternalErrorBoundaryState> {
    return {
      hasError: true,
      report: classifyMobileError(error),
    };
  }

  componentDidCatch(error: unknown): void {
    (this.props.telemetry ?? mobileTelemetry).reportError(classifyMobileError(error));
  }

  private reset = (action: 'retry' | 'home', afterReset?: () => void): void => {
    const telemetry = this.props.telemetry ?? mobileTelemetry;
    this.setState(
      (state) => ({
        ...resetErrorBoundary(state),
        report: null,
      }),
      () => {
        telemetry.trackEvent('mobile.render_recovery', { action });
        afterReset?.();
      },
    );
  };

  render(): React.ReactNode {
    if (this.state.hasError && this.state.report !== null) {
      const fallbackProps: ErrorFallbackProps = {
        report: this.state.report,
        retry: () => this.reset('retry'),
        goHome: () => this.reset('home', this.props.onGoHome),
      };
      return this.props.renderFallback?.(fallbackProps) ?? <CrashFallback {...fallbackProps} />;
    }

    return <React.Fragment key={this.state.recoveryKey}>{this.props.children}</React.Fragment>;
  }
}

function CrashFallback({ retry, goHome }: ErrorFallbackProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <Screen
      scrollable={false}
      testID="error-boundary-fallback"
      contentStyle={styles.content}
      style={styles.screen}
    >
      <View style={[styles.content, { padding: spacing.lg }]}>
        <View style={{ gap: spacing.md }}>
          <Text variant="caption" color="accent" weight="bold">
            {ERROR_BOUNDARY_FALLBACK.brand}
          </Text>
          <DataStatePanel
            state="api_error"
            title={ERROR_BOUNDARY_FALLBACK.title}
            body={ERROR_BOUNDARY_FALLBACK.body}
            focusOnMount
            testID="error-boundary-state"
          />
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <Button
              label={ERROR_BOUNDARY_FALLBACK.retryLabel}
              onPress={retry}
              accessibilityHint="Remounts the current Primis screen"
              testID="error-boundary-retry"
            />
            <Button
              variant="secondary"
              label={ERROR_BOUNDARY_FALLBACK.homeLabel}
              onPress={goHome}
              accessibilityHint="Returns to the Primis Home screen"
              testID="error-boundary-home"
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
});

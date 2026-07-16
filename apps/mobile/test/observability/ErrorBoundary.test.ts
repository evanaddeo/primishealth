import React from 'react';
import { renderWithAct } from '@testing-library/react-native/build/render-act';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MobileTelemetry } from '../../src/observability/telemetry';

vi.mock('react-native', () => ({
  StyleSheet: {
    create: <T>(styles: T): T => styles,
    flatten: (style: unknown): unknown =>
      Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style,
  },
  View: 'View',
}));

vi.mock('@primis/design-system', () => ({
  Button: ({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) =>
    React.createElement('Button', { onPress, testID }, label),
  Card: ({ children }: { children: React.ReactNode }) =>
    React.createElement('View', null, children),
  Screen: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
    React.createElement('View', { testID }, children),
  Text: ({ children }: { children: React.ReactNode }) =>
    React.createElement('Text', null, children),
  useTheme: () => ({ spacing: { sm: 8, md: 12, lg: 16 } }),
}));

import { ErrorBoundary } from '../../src/observability/ErrorBoundary';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('catches a child render failure, renders safe fallback, and retries with a remount', () => {
    const reportError = vi.fn();
    const trackEvent = vi.fn();
    const telemetry: MobileTelemetry = { reportError, trackEvent };
    const rawMessage = 'private@example.invalid had HRV 42; Bearer private-token';
    let shouldThrow = true;

    function RoutedChild(): React.ReactNode {
      if (shouldThrow) throw new TypeError(rawMessage);
      return React.createElement('Text', { testID: 'routed-child' }, 'Recovered route');
    }

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = renderWithAct(
      React.createElement(ErrorBoundary, { telemetry }, React.createElement(RoutedChild)),
    );

    expect(view.root.findByProps({ testID: 'error-boundary-fallback' })).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).toContain('Something went wrong');
    expect(JSON.stringify(view.toJSON())).not.toContain(rawMessage);
    expect(JSON.stringify(view.toJSON())).not.toContain('private-token');
    expect(reportError).toHaveBeenCalledWith({ classification: 'TypeError' });

    shouldThrow = false;
    React.act(() => {
      view.root.findByProps({ testID: 'error-boundary-retry' }).props.onPress();
    });

    expect(view.root.findByProps({ testID: 'routed-child' })).toBeTruthy();
    expect(trackEvent).toHaveBeenCalledWith('mobile.render_recovery', { action: 'retry' });
  });

  it('resets before invoking the safe Home recovery callback', () => {
    const onGoHome = vi.fn();
    const telemetry: MobileTelemetry = { reportError: vi.fn(), trackEvent: vi.fn() };
    let shouldThrow = true;

    function BrokenRoute(): React.ReactNode {
      if (shouldThrow) throw new Error('raw stack must stay hidden');
      return React.createElement('Text', null, 'Recovered before Home navigation');
    }

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = renderWithAct(
      React.createElement(ErrorBoundary, { telemetry, onGoHome }, React.createElement(BrokenRoute)),
    );

    shouldThrow = false;
    React.act(() => {
      view.root.findByProps({ testID: 'error-boundary-home' }).props.onPress();
    });

    expect(onGoHome).toHaveBeenCalledOnce();
    expect(telemetry.trackEvent).toHaveBeenCalledWith('mobile.render_recovery', {
      action: 'home',
    });
  });
});

import React from 'react';
import { renderWithAct } from '@testing-library/react-native/build/render-act';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: <T>(styles: T): T => styles, hairlineWidth: 1 },
  View: 'View',
}));

vi.mock('@primis/design-system', () => ({
  Button: ({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) =>
    React.createElement('Button', { onPress, testID, accessibilityRole: 'button' }, label),
  Card: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
    React.createElement('View', { testID }, children),
  Text: ({ children }: { children: React.ReactNode }) =>
    React.createElement('Text', null, children),
  useTheme: () => ({
    colors: {
      accent: '#0af',
      borderSubtle: '#333',
      surfaceElevated: '#111',
      status: { low: '#f80' },
    },
    radius: { md: 12 },
    spacing: { xxs: 2, sm: 8, md: 12 },
  }),
}));

import { DataStatePanel } from '../../src/components/DataStatePanel';
import { DataStatusBanner } from '../../src/components/DataStatusBanner';
import { MissingMetricMessage } from '../../src/components/MissingMetricMessage';

describe('common data-state components', () => {
  it('announces loading as progress with an explicit label', () => {
    const view = renderWithAct(
      React.createElement(DataStatePanel, { state: 'initial_loading', testID: 'loading' }),
    );
    const progress = view.root.findByProps({ accessibilityRole: 'progressbar' });
    expect(progress.props.accessibilityLabel).toContain('Loading your data');
    expect(progress.props.accessibilityLiveRegion).toBe('polite');
  });

  it('announces errors and invokes a safe retry callback once', () => {
    const retry = vi.fn();
    const view = renderWithAct(
      React.createElement(DataStatusBanner, {
        state: 'api_error',
        onAction: retry,
        testID: 'error',
      }),
    );
    expect(view.root.findByProps({ accessibilityRole: 'alert' })).toBeTruthy();
    React.act(() => view.root.findByProps({ testID: 'error-action' }).props.onPress());
    expect(retry).toHaveBeenCalledOnce();
  });

  it('labels required and optional missing metrics differently', () => {
    const required = renderWithAct(
      React.createElement(MissingMetricMessage, {
        metric: { metricCode: 'hrv_rmssd', reason: 'permission_not_granted', isRequired: true },
      }),
    );
    const optional = renderWithAct(
      React.createElement(MissingMetricMessage, {
        metric: { metricCode: 'hrv_rmssd', reason: 'permission_not_granted', isRequired: false },
      }),
    );
    expect(JSON.stringify(required.toJSON())).toContain('required');
    expect(JSON.stringify(optional.toJSON())).toContain('optional');
  });
});

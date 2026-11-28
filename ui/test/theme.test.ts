import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme } from '../src/theme';

function mockMedia(dark: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('dark') ? dark : false, media: q, addEventListener() {}, removeEventListener() {} }));
}

afterEach(() => vi.unstubAllGlobals());

describe('applyTheme', () => {
  it('sets dark theme and accent', () => {
    const root = document.createElement('div');
    applyTheme({ appearance: 'dark', accent: '#3FA796' }, root);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.style.getPropertyValue('--gp-accent')).toBe('#3FA796');
  });
  it('resolves system via matchMedia', () => {
    const root = document.createElement('div');
    mockMedia(true);
    applyTheme({ appearance: 'system', accent: '#2F6BF0' }, root);
    expect(root.getAttribute('data-theme')).toBe('dark');
    mockMedia(false);
    applyTheme({ appearance: 'system', accent: '#2F6BF0' }, root);
    expect(root.getAttribute('data-theme')).toBe('light');
  });
  it('falls back to the default accent when invalid', () => {
    const root = document.createElement('div');
    applyTheme({ appearance: 'light', accent: 'red' }, root);
    expect(root.style.getPropertyValue('--gp-accent')).toBe('#2F6BF0');
  });
});

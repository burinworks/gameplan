import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useShortcut } from '../src/app/shortcuts';

function press(target: EventTarget, init: KeyboardEventInit) {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

describe('useShortcut', () => {
  it('mod+k fires from an input', () => {
    const fn = vi.fn();
    renderHook(() => useShortcut('mod+k', fn));
    const input = document.body.appendChild(document.createElement('input'));
    press(input, { key: 'k', ctrlKey: true });
    expect(fn).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('mod+n does not fire from an input but does from the body', () => {
    const fn = vi.fn();
    renderHook(() => useShortcut('mod+n', fn));
    const input = document.body.appendChild(document.createElement('input'));
    press(input, { key: 'n', ctrlKey: true });
    expect(fn).not.toHaveBeenCalled();
    press(document.body, { key: 'n', ctrlKey: true });
    expect(fn).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('mod+shift+n needs shift; plain mod+n ignores it', () => {
    const a = vi.fn();
    const b = vi.fn();
    renderHook(() => {
      useShortcut('mod+shift+n', a);
      useShortcut('mod+n', b);
    });
    press(document.body, { key: 'N', ctrlKey: true, shiftKey: true });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('when() false suppresses', () => {
    const fn = vi.fn();
    renderHook(() => useShortcut('escape', fn, { when: () => false }));
    press(document.body, { key: 'Escape' });
    expect(fn).not.toHaveBeenCalled();
  });
});
